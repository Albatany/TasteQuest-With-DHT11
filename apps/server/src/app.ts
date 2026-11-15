import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import type { ErrorRequestHandler, Request, RequestHandler } from 'express'
import { Server } from 'socket.io'
import { z, ZodError } from 'zod'
import { deviceEventSchema, heartbeatSchema, loginSchema, nicknameSchema, productInputSchema, settingsSchema, telemetrySchema } from '@tastequest/shared'
import type { Source } from '@tastequest/shared'
import type { Config } from './config.ts'
import type { DB } from './db.ts'
import { createIngest } from './ingest.ts'
import { clearDemo, feedbackCsv, feedbackStats, gamesCsv, getSettings, HttpError, listEvents, listProducts, listSessions, overview, saveSettings } from './store.ts'

const sha256 = (s: string) => createHash('sha256').update(s).digest()
// Hashing first makes lengths equal, so timingSafeEqual never throws or leaks length.
const safeEqual = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b))

/** Fixed-window limiter per client IP. shortcut: in-memory, single process only; fine for one exhibition laptop. */
export function rateLimit(max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>()
  return (req, res, next) => {
    const now = Date.now()
    if (hits.size > 10_000) hits.clear()
    const key = req.ip ?? 'unknown'
    let h = hits.get(key)
    if (!h || h.reset <= now) hits.set(key, (h = { n: 0, reset: now + windowMs }))
    if (++h.n > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)))
      res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' })
      return
    }
    next()
  }
}

const limitOf = (v: unknown, fallback: number) => Math.min(100, Math.max(1, Number(v) || fallback))
const idParam = z.coerce.number().int().positive()

export function createApp({ db, config }: { db: DB; config: Config }) {
  const app = express()
  const httpServer = createServer(app)
  // destroyUpgrade:false lets the Vite HMR websocket share this server in dev mode.
  const io = new Server(httpServer, { serveClient: false, destroyUpgrade: false })
  const emit = (event: string, data: unknown) => io.emit(event, data)
  const ingest = createIngest(db, emit, { offlineMs: config.DEVICE_OFFLINE_MS, telemetryPersistMs: config.TELEMETRY_PERSIST_MS })
  const settings = () => getSettings(db, config.APP_MODE)
  const sourceOf = (req: Request): Source => (req.query.source === 'DEMO' || req.query.source === 'LIVE' ? req.query.source : settings().displayMode)

  const cookieToken = (req: Request) => /(?:^|;\s*)tq_session=([A-Za-z0-9_-]{20,})/.exec(req.headers.cookie ?? '')?.[1]
  const isOperator = (req: Request) => {
    const token = cookieToken(req)
    return !!token && !!db.prepare('SELECT 1 FROM operator_sessions WHERE token_hash = ? AND expires_at > ?').get(sha256(token).toString('hex'), new Date().toISOString())
  }
  const requireOperator: RequestHandler = (req, res, next) => (isOperator(req) ? next() : res.status(401).json({ error: 'Login operator diperlukan' }))
  const requireDevice: RequestHandler = (req, res, next) => {
    const auth = req.headers.authorization ?? ''
    return auth.startsWith('Bearer ') && safeEqual(auth.slice(7), config.DEVICE_TOKEN) ? next() : res.status(401).json({ error: 'Token perangkat tidak valid' })
  }

  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' })
    next()
  })
  app.use(express.json({ limit: '16kb' }))

  const api = express.Router()

  // ---- Public, read-only ----
  api.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get()
    res.json({ ok: true, uptimeS: Math.round(process.uptime()) })
  })
  api.get('/settings', (_req, res) => res.json(settings()))
  api.get('/products', (_req, res) => res.json(listProducts(db)))
  api.get('/overview', (req, res) => res.json(overview(db, sourceOf(req))))
  api.get('/leaderboard', (req, res) => res.json(listSessions(db, sourceOf(req), 'score', limitOf(req.query.limit, 10))))
  api.get('/games', (req, res) => res.json(listSessions(db, sourceOf(req), 'recent', limitOf(req.query.limit, 20))))
  api.get('/feedback/stats', (req, res) => res.json(feedbackStats(db, sourceOf(req))))
  api.get('/devices', (req, res) => res.json(ingest.listDevices(sourceOf(req))))
  api.get('/live', (req, res) => res.json(ingest.liveFor(sourceOf(req))))
  api.get('/events', (req, res) => res.json(listEvents(db, sourceOf(req), limitOf(req.query.limit, 30), typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined)))

  // ---- Operator auth ----
  api.post('/auth/login', rateLimit(10, 60_000), (req, res) => {
    const { password } = loginSchema.parse(req.body)
    if (!safeEqual(password, config.OPERATOR_PASSWORD)) throw new HttpError(401, 'Password operator salah')
    const now = new Date()
    db.prepare('DELETE FROM operator_sessions WHERE expires_at <= ?').run(now.toISOString())
    const token = randomBytes(32).toString('base64url')
    const ttlMs = config.SESSION_TTL_HOURS * 3600_000
    db.prepare('INSERT INTO operator_sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)').run(
      sha256(token).toString('hex'),
      new Date(now.getTime() + ttlMs).toISOString(),
      now.toISOString(),
    )
    // No `secure` flag: the event LAN runs plain HTTP. SameSite=Strict blocks cross-site use.
    res.cookie('tq_session', token, { httpOnly: true, sameSite: 'strict', maxAge: ttlMs, path: '/' })
    res.json({ operator: true })
  })
  api.post('/auth/logout', (req, res) => {
    const token = cookieToken(req)
    if (token) db.prepare('DELETE FROM operator_sessions WHERE token_hash = ?').run(sha256(token).toString('hex'))
    res.clearCookie('tq_session', { path: '/' })
    res.json({ operator: false })
  })
  api.get('/auth/me', (req, res) => res.json({ operator: isOperator(req) }))

  // ---- Device ingestion (real device: token; simulator: operator session, always DEMO) ----
  const deviceConfig = () => {
    const s = settings()
    return { activeProductId: s.activeProductId, roundDurationMs: s.roundDurationMs, targetsCm: s.targetsCm, feedbackCooldownMs: s.feedbackCooldownMs, resetSeq: s.resetSeq }
  }
  const ingestRoutes = (forceDemo: boolean) => {
    const r = express.Router()
    const src = (demo: boolean): Source => (forceDemo || demo ? 'DEMO' : 'LIVE')
    r.post('/heartbeat', (req, res) => {
      const hb = heartbeatSchema.parse(req.body)
      ingest.heartbeat(hb, src(hb.demo))
      res.json(deviceConfig())
    })
    r.get('/config', (_req, res) => res.json(deviceConfig()))
    r.post('/telemetry', (req, res) => {
      const t = telemetrySchema.parse(req.body)
      ingest.telemetry(t, src(t.demo))
      res.status(204).end()
    })
    r.post('/events', (req, res) => {
      const e = deviceEventSchema.parse(req.body)
      const result = ingest.event(e, src(e.demo))
      res.status(result.duplicate ? 200 : 201).json(result)
    })
    return r
  }
  api.use('/device', rateLimit(1200, 60_000), requireDevice, ingestRoutes(false))
  api.use('/demo', rateLimit(1200, 60_000), requireOperator, ingestRoutes(true))

  // ---- Operator mutations ----
  const productById = (id: number) => listProducts(db).find((p) => p.id === id)
  api.post('/products', requireOperator, (req, res) => {
    const p = productInputSchema.parse(req.body)
    try {
      const r = db.prepare('INSERT INTO products (name, enabled, created_at) VALUES (?, ?, ?)').run(p.name, p.enabled === false ? 0 : 1, new Date().toISOString())
      emit('product:changed', {})
      res.status(201).json(productById(Number(r.lastInsertRowid)))
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Nama produk sudah ada')
      throw err
    }
  })
  api.patch('/products/:id', requireOperator, (req, res) => {
    const id = idParam.parse(req.params.id)
    const p = productInputSchema.partial().parse(req.body)
    if (!productById(id)) throw new HttpError(404, 'Produk tidak ditemukan')
    try {
      if (p.name !== undefined) db.prepare('UPDATE products SET name = ? WHERE id = ?').run(p.name, id)
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Nama produk sudah ada')
      throw err
    }
    if (p.enabled !== undefined) db.prepare('UPDATE products SET enabled = ? WHERE id = ?').run(p.enabled ? 1 : 0, id)
    // A disabled product cannot stay the one being rated.
    if (p.enabled === false && settings().activeProductId === id) {
      saveSettings(db, { activeProductId: null })
      emit('settings:changed', settings())
    }
    emit('product:changed', {})
    res.json(productById(id))
  })
  api.put('/settings', requireOperator, (req, res) => {
    const patch = settingsSchema.partial().parse(req.body)
    if (patch.activeProductId != null && !productById(patch.activeProductId)?.enabled) throw new HttpError(422, 'Produk tidak ada atau nonaktif')
    saveSettings(db, patch)
    const s = settings()
    emit('settings:changed', s)
    if (patch.activeProductId !== undefined) emit('product:changed', { activeProductId: s.activeProductId })
    res.json(s)
  })
  api.patch('/sessions/:id', requireOperator, (req, res) => {
    const id = idParam.parse(req.params.id)
    const { nickname } = nicknameSchema.parse(req.body)
    const r = db.prepare('UPDATE game_sessions SET nickname = ? WHERE id = ?').run(nickname || null, id)
    if (!r.changes) throw new HttpError(404, 'Sesi tidak ditemukan')
    emit('leaderboard:updated', {})
    res.json({ id, nickname: nickname || null })
  })
  api.post('/operator/reset-game', requireOperator, (_req, res) => {
    const aborted = db.prepare("UPDATE game_sessions SET status = 'aborted' WHERE status = 'active'").run().changes
    saveSettings(db, { resetSeq: settings().resetSeq + 1 }) // devices pick this up via heartbeat/config
    ingest.logServerEvent('game_reset', 'server', settings().displayMode, { aborted })
    emit('settings:changed', settings())
    res.json({ aborted, resetSeq: settings().resetSeq })
  })
  api.post('/operator/clear-demo', requireOperator, (_req, res) => {
    const deleted = clearDemo(db)
    ingest.forgetDemo()
    emit('data:cleared', { source: 'DEMO' })
    res.json({ deleted })
  })
  api.get('/operator/status', requireOperator, (_req, res) => {
    const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
    res.json({
      appMode: config.APP_MODE,
      host: config.HOST,
      port: config.PORT,
      dbPath: config.dbPath,
      dbSizeBytes: config.dbPath === ':memory:' ? 0 : statSync(config.dbPath).size,
      deviceTokenConfigured: config.DEVICE_TOKEN.length >= 16,
      deviceOfflineMs: config.DEVICE_OFFLINE_MS,
      telemetryPersistMs: config.TELEMETRY_PERSIST_MS,
      uptimeS: Math.round(process.uptime()),
      node: process.version,
      counts: { products: count('products'), sessions: count('game_sessions'), feedback: count('feedback'), events: count('device_events') },
    })
  })
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  api.get('/export/feedback.csv', requireOperator, (_req, res) => {
    res.attachment(`tastequest-feedback-${stamp()}.csv`).type('text/csv').send('﻿' + feedbackCsv(db))
  })
  api.get('/export/games.csv', requireOperator, (_req, res) => {
    res.attachment(`tastequest-games-${stamp()}.csv`).type('text/csv').send('﻿' + gamesCsv(db))
  })
  api.get('/export/backup.db', requireOperator, async (_req, res) => {
    const file = join(tmpdir(), `tastequest-backup-${randomBytes(6).toString('hex')}.db`)
    await db.backup(file) // consistent online snapshot, safe while the server runs
    res.download(file, `tastequest-${stamp()}.db`, () => rmSync(file, { force: true }))
  })

  app.use('/api', api)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }))

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Data tidak valid', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
    } else if (typeof err?.status === 'number' && err.status < 500) {
      res.status(err.status).json({ error: err instanceof HttpError ? err.message : 'Permintaan tidak valid' })
    } else {
      console.error('[api]', err)
      res.status(500).json({ error: 'Terjadi kesalahan pada server' })
    }
  }
  app.use(onError)

  const sweeper = setInterval(() => ingest.sweep(), 2000)
  sweeper.unref()

  const close = () =>
    new Promise<void>((resolve) => {
      clearInterval(sweeper)
      io.close(() => resolve()) // also closes httpServer
    })

  return { app, httpServer, io, ingest, close }
}
