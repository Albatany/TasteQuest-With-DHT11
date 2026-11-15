import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { io as connect } from 'socket.io-client'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import type { Config } from '../src/config.ts'
import { openDb } from '../src/db.ts'
import type { DB } from '../src/db.ts'

const TOKEN = 'test-device-token-0123456789'
const PASSWORD = 'operator-pass-123'
const baseConfig: Config = {
  HOST: '127.0.0.1',
  PORT: 0,
  dbPath: ':memory:',
  OPERATOR_PASSWORD: PASSWORD,
  DEVICE_TOKEN: TOKEN,
  APP_MODE: 'LIVE',
  DEVICE_OFFLINE_MS: 15_000,
  TELEMETRY_PERSIST_MS: 60_000,
  SESSION_TTL_HOURS: 12,
}

let db: DB
let ctx: ReturnType<typeof createApp>
const auth = { Authorization: `Bearer ${TOKEN}` }
let seq = 0
const uid = (p = 'evt') => `${p}-${String(++seq).padStart(6, '0')}`

const device = (path: string, body: object) => request(ctx.app).post(`/api/device/${path}`).set(auth).send(body)
const rounds = (measured: (number | null)[], targets = [20, 12, 28]) => measured.map((m, i) => ({ round: i + 1, targetCm: targets[i], measuredCm: m }))
const playGame = (measured: (number | null)[], durationMs = 30_000, demo = false) =>
  device('events', { id: uid(), deviceId: 'ESP-01', type: 'game_completed', sessionId: uid('ses'), durationMs, rounds: rounds(measured), demo })

async function login() {
  const res = await request(ctx.app).post('/api/auth/login').send({ password: PASSWORD })
  expect(res.status).toBe(200)
  return res.headers['set-cookie'] as unknown as string[]
}

beforeEach(() => {
  db = openDb(':memory:')
  ctx = createApp({ db, config: baseConfig })
})
afterEach(async () => {
  await ctx.close()
  db.close()
})

describe('device ingestion', () => {
  it('rejects missing or wrong device tokens', async () => {
    expect((await request(ctx.app).post('/api/device/heartbeat').send({})).status).toBe(401)
    expect((await request(ctx.app).post('/api/device/heartbeat').set({ Authorization: 'Bearer nope' }).send({})).status).toBe(401)
  })

  it('validates payloads', async () => {
    const res = await device('events', { id: uid(), deviceId: 'ESP-01', type: 'feedback_submitted', level: 9, productId: null })
    expect(res.status).toBe(400)
  })

  it('stores a game once even when the same event is retried', async () => {
    const body = { id: uid(), deviceId: 'ESP-01', type: 'game_completed', sessionId: uid('ses'), durationMs: 25_000, rounds: rounds([20.4, 14, null]) }
    const first = await device('events', body)
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ playerCode: 'PLAYER-001', totalScore: 176, isHighScore: true }) // 96 + 80 + 0
    const retry = await device('events', body)
    expect(retry.status).toBe(200)
    expect(retry.body).toMatchObject({ duplicate: true, playerCode: 'PLAYER-001' })
    // Same session re-sent under a new event id must not double count either.
    expect((await device('events', { ...body, id: uid() })).body.totalScore).toBe(176)
    expect((db.prepare('SELECT COUNT(*) AS n FROM game_sessions').get() as { n: number }).n).toBe(1)
  })

  it('recomputes scores server-side from measured distances', async () => {
    await playGame([20, 12, 28])
    const [top] = (await request(ctx.app).get('/api/leaderboard?source=LIVE')).body
    expect(top.totalScore).toBe(300)
    expect(top.rounds.map((r: { score: number }) => r.score)).toEqual([100, 100, 100])
  })

  it('sorts the leaderboard by score, then duration, then completion order', async () => {
    await playGame([20, 12, 27], 40_000) // 290, slow
    await playGame([20, 12, 27], 20_000) // 290, fast
    await playGame([20, 12, 28], 50_000) // 300
    await playGame([20, 12, 27], 20_000) // 290, fast but later
    const board = (await request(ctx.app).get('/api/leaderboard?source=LIVE')).body
    expect(board.map((r: { playerCode: string }) => r.playerCode)).toEqual(['PLAYER-003', 'PLAYER-002', 'PLAYER-004', 'PLAYER-001'])
    expect(board[0].rank).toBe(1)
  })

  it('keeps DEMO and LIVE data apart', async () => {
    await playGame([20, 12, 28], 30_000, true)
    await playGame([25, 12, 28])
    const live = (await request(ctx.app).get('/api/leaderboard?source=LIVE')).body
    const demo = (await request(ctx.app).get('/api/leaderboard?source=DEMO')).body
    expect(live).toHaveLength(1)
    expect(demo).toHaveLength(1)
    expect(demo[0].playerCode).toBe('DEMO-001')
    expect(live[0].playerCode).toBe('PLAYER-001')
  })

  it('stores feedback, rejects unknown products and computes statistics', async () => {
    const cookie = await login()
    const product = (await request(ctx.app).post('/api/products').set('Cookie', cookie).send({ name: 'Mie Ayam' })).body
    const fb = (level: number, productId: number | null) => device('events', { id: uid(), deviceId: 'ESP-01', type: 'feedback_submitted', level, productId })
    expect((await fb(3, product.id)).status).toBe(201)
    expect((await fb(2, product.id)).status).toBe(201)
    expect((await fb(3, null)).status).toBe(201)
    expect((await fb(1, 999)).status).toBe(422)
    const stats = (await request(ctx.app).get('/api/feedback/stats?source=LIVE')).body
    expect(stats.total).toBe(3)
    expect(stats.counts).toEqual({ 1: 0, 2: 1, 3: 2 })
    expect(stats.positivePct).toBe(66.7)
    expect(stats.byProduct.map((p: { name: string; total: number }) => [p.name, p.total])).toEqual([
      ['Mie Ayam', 2],
      ['Umum (pengalaman stan)', 1],
    ])
    expect(stats.timeline.length).toBeGreaterThan(0)
  })

  it('marks devices offline after silence without inventing readings', async () => {
    const hb = await device('heartbeat', { deviceId: 'ESP-01', firmware: '1.0.0', phase: 'IDLE', uptimeMs: 1000, rssi: -60 })
    expect(hb.body).toMatchObject({ targetsCm: [20, 12, 28], resetSeq: 0 })
    await device('telemetry', { deviceId: 'ESP-01', temperatureC: 30, humidityPct: 70, distanceCm: 18 })
    expect((await request(ctx.app).get('/api/devices?source=LIVE')).body[0]).toMatchObject({ online: true, rssi: -60 })
    ctx.ingest.sweep(Date.now() + 16_000)
    const [dev] = (await request(ctx.app).get('/api/devices?source=LIVE')).body
    expect(dev.online).toBe(false)
    expect(dev.lastReading).toMatchObject({ temperatureC: 30, humidityPct: 70 })
    expect((await request(ctx.app).get('/api/live?source=LIVE')).body).toEqual([])
  })
})

describe('firmware payload compatibility', () => {
  // Exact shapes produced by firmware/src/net.cpp (ArduinoJson), including ageMs appended at send time.
  it('accepts heartbeat, telemetry and queued events as the ESP8266 sends them', async () => {
    const hb = await device('heartbeat', {
      deviceId: 'TQ-ESP8266-01', demo: false, firmware: '1.0.0', rssi: null, phase: 'ERROR', uptimeMs: 123456, freeHeap: 31234, queueSize: 2,
      sensors: { ultrasonic: 'unconfigured', dht11: 'unconfigured', oled: 'unconfigured', touch: 'unconfigured', buzzer: 'unconfigured' },
      lastError: 'PIN HCSR04_TRIG: belum diatur (PIN_UNASSIGNED)',
    })
    expect(hb.status).toBe(200)
    const tel = await device('telemetry', {
      deviceId: 'TQ-ESP8266-01', demo: false, temperatureC: 29.4, humidityPct: 71, distanceCm: null, touch: false, buzzer: true,
      game: { phase: 'ROUND_RESULT', round: 1, targetCm: 20, remainingMs: null, rounds: [{ round: 1, targetCm: 20, measuredCm: 20.4, score: 96 }], totalScore: 96, menu: 0, option: -1, playerCode: null },
    })
    expect(tel.status).toBe(204)
    const sessionId = 'TQ-ESP8266-01-1a2b3c4d-7'
    const started = await device('events', { id: 'TQ-ESP8266-01-1a2b3c4d-8', type: 'game_started', sessionId, deviceId: 'TQ-ESP8266-01', demo: false, ageMs: 41000 })
    expect(started.body.playerCode).toBe('PLAYER-001')
    const done = await device('events', {
      id: 'TQ-ESP8266-01-1a2b3c4d-12', type: 'game_completed', sessionId, durationMs: 38211,
      rounds: [{ round: 1, targetCm: 20, measuredCm: 20.4 }, { round: 2, targetCm: 12, measuredCm: null }, { round: 3, targetCm: 28, measuredCm: 27.5 }],
      deviceId: 'TQ-ESP8266-01', demo: false, ageMs: 900,
    })
    expect(done.body).toMatchObject({ playerCode: 'PLAYER-001', totalScore: 96 + 0 + 95 })
    const fb = await device('events', { id: 'TQ-ESP8266-01-1a2b3c4d-13', type: 'feedback_submitted', level: 2, productId: null, deviceId: 'TQ-ESP8266-01', demo: false, ageMs: 0 })
    expect(fb.status).toBe(201)
    const [dev] = (await request(ctx.app).get('/api/devices?source=LIVE')).body
    expect(dev).toMatchObject({ id: 'TQ-ESP8266-01', online: true, lastError: 'PIN HCSR04_TRIG: belum diatur (PIN_UNASSIGNED)', sensors: { ultrasonic: 'unconfigured' } })
  })
})

describe('operator', () => {
  it('requires login for mutations and rate-limits password guessing', async () => {
    expect((await request(ctx.app).post('/api/products').send({ name: 'X' })).status).toBe(401)
    expect((await request(ctx.app).post('/api/operator/clear-demo')).status).toBe(401)
    expect((await request(ctx.app).post('/api/demo/heartbeat').send({})).status).toBe(401)
    expect((await request(ctx.app).post('/api/auth/login').send({ password: 'wrong' })).status).toBe(401)
    const cookie = await login()
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', cookie)).body).toEqual({ operator: true })
    await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie)
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', cookie)).body).toEqual({ operator: false })
    let last = 0
    for (let i = 0; i < 12; i++) last = (await request(ctx.app).post('/api/auth/login').send({ password: 'wrong' })).status
    expect(last).toBe(429)
  })

  it('manages products and the active product', async () => {
    const cookie = await login()
    const p = (await request(ctx.app).post('/api/products').set('Cookie', cookie).send({ name: 'Es Teh' })).body
    expect((await request(ctx.app).post('/api/products').set('Cookie', cookie).send({ name: 'es teh' })).status).toBe(409)
    expect((await request(ctx.app).put('/api/settings').set('Cookie', cookie).send({ activeProductId: p.id })).body.activeProductId).toBe(p.id)
    await request(ctx.app).patch(`/api/products/${p.id}`).set('Cookie', cookie).send({ name: 'Es Teh Manis', enabled: false })
    expect((await request(ctx.app).get('/api/products')).body).toEqual([{ id: p.id, name: 'Es Teh Manis', enabled: false }])
    expect((await request(ctx.app).get('/api/settings')).body.activeProductId).toBeNull()
    expect((await request(ctx.app).put('/api/settings').set('Cookie', cookie).send({ activeProductId: p.id })).status).toBe(422)
    expect((await request(ctx.app).put('/api/settings').set('Cookie', cookie).send({ targetsCm: [1, 2, 3] })).status).toBe(400)
  })

  it('runs the simulator through the same pipeline and clears only demo data', async () => {
    const cookie = await login()
    const demo = await request(ctx.app)
      .post('/api/demo/events')
      .set('Cookie', cookie)
      .send({ id: uid(), deviceId: 'SIM-ESP8266', type: 'feedback_submitted', level: 3, productId: null })
    expect(demo.status).toBe(201)
    await playGame([20, 12, 28])
    expect((await request(ctx.app).post('/api/operator/clear-demo').set('Cookie', cookie)).body.deleted.feedback).toBe(1)
    expect((await request(ctx.app).get('/api/feedback/stats?source=DEMO')).body.total).toBe(0)
    expect((await request(ctx.app).get('/api/leaderboard?source=LIVE')).body).toHaveLength(1)
  })

  it('exports CSV with formula injection neutralised', async () => {
    const cookie = await login()
    await playGame([20, 12, 28])
    const [entry] = (await request(ctx.app).get('/api/leaderboard?source=LIVE')).body
    await request(ctx.app).patch(`/api/sessions/${entry.id}`).set('Cookie', cookie).send({ nickname: '=HACK()' })
    const csv = await request(ctx.app).get('/api/export/games.csv').set('Cookie', cookie)
    expect(csv.status).toBe(200)
    expect(csv.text).toContain("'=HACK()")
    expect((await request(ctx.app).get('/api/export/games.csv')).status).toBe(401)
  })
})

describe('persistence and realtime', () => {
  it('keeps committed data across a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tq-'))
    const file = join(dir, 'tq.db')
    try {
      let fileDb = openDb(file)
      let app = createApp({ db: fileDb, config: { ...baseConfig, dbPath: file } })
      await request(app.app).post('/api/device/events').set(auth).send({ id: uid(), deviceId: 'ESP-01', type: 'feedback_submitted', level: 2, productId: null })
      await app.close()
      fileDb.close()
      fileDb = openDb(file)
      app = createApp({ db: fileDb, config: { ...baseConfig, dbPath: file } })
      expect((await request(app.app).get('/api/feedback/stats?source=LIVE')).body.total).toBe(1)
      await app.close()
      fileDb.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('broadcasts feedback over Socket.IO', async () => {
    await new Promise<void>((r) => ctx.httpServer.listen(0, '127.0.0.1', r))
    const { port } = ctx.httpServer.address() as AddressInfo
    const client = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'] })
    try {
      await new Promise<void>((r) => client.on('connect', () => r()))
      const got = new Promise((r) => client.on('feedback:submitted', r))
      await device('events', { id: uid(), deviceId: 'ESP-01', type: 'feedback_submitted', level: 1, productId: null })
      expect(await got).toMatchObject({ source: 'LIVE', level: 1 })
    } finally {
      client.close()
    }
  })
})
