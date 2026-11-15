// Device ingestion: one pathway for real ESP8266 traffic and the DEMO simulator.
import { randomUUID } from 'node:crypto'
import { scoreRound } from '@tastequest/shared'
import type { DeviceEvent, DeviceInfo, Heartbeat, LiveState, Source, Telemetry } from '@tastequest/shared'
import type { DB } from './db.ts'
import { HttpError } from './store.ts'

export type Emit = (event: string, data: unknown) => void

interface SessionRow {
  id: number
  player_code: string
  source: Source
  status: string
  total_score: number | null
}

export function createIngest(db: DB, emit: Emit, opts: { offlineMs: number; telemetryPersistMs: number }) {
  const live = new Map<string, LiveState>() // latest high-frequency readings, memory only
  const presence = new Map<string, { source: Source; lastSeen: number; online: boolean }>()
  const lastPersist = new Map<string, number>()

  const insertEvent = db.prepare(
    `INSERT OR IGNORE INTO device_events (event_uid, device_id, type, source, occurred_at, received_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  function logServerEvent(type: string, deviceId: string, source: Source, payload: object = {}) {
    const now = new Date().toISOString()
    insertEvent.run(`srv-${randomUUID()}`, deviceId, type, source, now, now, JSON.stringify(payload))
  }

  function seen(deviceId: string, source: Source) {
    const prev = presence.get(deviceId)
    presence.set(deviceId, { source, lastSeen: Date.now(), online: true })
    if (!prev?.online) {
      logServerEvent('device_online', deviceId, source)
      emit('device:status', { deviceId, source, online: true })
    }
  }

  /** Marks devices offline after silence; never invents readings for them. */
  function sweep(now = Date.now()) {
    for (const [deviceId, p] of presence) {
      if (p.online && now - p.lastSeen > opts.offlineMs) {
        p.online = false
        logServerEvent('device_offline', deviceId, p.source)
        emit('device:status', { deviceId, source: p.source, online: false })
      }
    }
  }

  function heartbeat(hb: Heartbeat, source: Source) {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO devices (id, source, firmware, rssi, phase, uptime_ms, free_heap, queue_size, sensors, last_error, last_seen_at, created_at)
       VALUES (@id, @source, @firmware, @rssi, @phase, @uptimeMs, @freeHeap, @queueSize, @sensors, @lastError, @now, @now)
       ON CONFLICT (id) DO UPDATE SET source = excluded.source, firmware = excluded.firmware, rssi = excluded.rssi, phase = excluded.phase,
         uptime_ms = excluded.uptime_ms, free_heap = excluded.free_heap, queue_size = excluded.queue_size, sensors = excluded.sensors,
         last_error = excluded.last_error, last_seen_at = excluded.last_seen_at`,
    ).run({ ...hb, id: hb.deviceId, source, sensors: JSON.stringify(hb.sensors), now })
    seen(hb.deviceId, source)
  }

  function telemetry(t: Telemetry, source: Source) {
    const state: LiveState = { ...t, source, receivedAt: new Date().toISOString() }
    live.set(t.deviceId, state)
    seen(t.deviceId, source)
    const now = Date.now()
    if ((t.temperatureC != null || t.humidityPct != null) && now - (lastPersist.get(t.deviceId) ?? 0) >= opts.telemetryPersistMs) {
      lastPersist.set(t.deviceId, now)
      db.prepare('INSERT INTO telemetry (device_id, source, temperature_c, humidity_pct, recorded_at) VALUES (?, ?, ?, ?, ?)').run(
        t.deviceId,
        source,
        t.temperatureC,
        t.humidityPct,
        state.receivedAt,
      )
    }
    emit('telemetry', state)
  }

  const getSession = db.prepare('SELECT id, player_code, source, status, total_score FROM game_sessions WHERE session_uid = ?')

  function ensureSession(uid: string, deviceId: string, source: Source, at: string): SessionRow {
    const existing = getSession.get(uid) as SessionRow | undefined
    if (existing) {
      if (existing.source !== source) throw new HttpError(409, 'Sesi milik sumber data lain')
      return existing
    }
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM game_sessions WHERE source = ?').get(source) as { n: number }
    const code = `${source === 'DEMO' ? 'DEMO' : 'PLAYER'}-${String(n + 1).padStart(3, '0')}`
    db.prepare("INSERT INTO game_sessions (session_uid, player_code, device_id, source, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)").run(uid, code, deviceId, source, at)
    return getSession.get(uid) as SessionRow
  }

  const insertRound = db.prepare('INSERT OR IGNORE INTO game_rounds (session_id, round, target_cm, measured_cm, score) VALUES (?, ?, ?, ?, ?)')
  // Scores are recomputed server-side; the device's own number is never trusted.
  const saveRound = (sessionId: number, r: { round: number; targetCm: number; measuredCm: number | null }) =>
    insertRound.run(sessionId, r.round, r.targetCm, r.measuredCm, scoreRound(r.measuredCm, r.targetCm))

  function apply(e: DeviceEvent, source: Source, at: string, emits: [string, unknown][]): Record<string, unknown> {
    switch (e.type) {
      case 'game_started': {
        const s = ensureSession(e.sessionId, e.deviceId, source, at)
        emits.push(['game:started', { source, playerCode: s.player_code }])
        return { playerCode: s.player_code }
      }
      case 'round_completed': {
        const s = ensureSession(e.sessionId, e.deviceId, source, at)
        saveRound(s.id, e)
        emits.push(['round:completed', { source, playerCode: s.player_code, round: e.round }])
        return { playerCode: s.player_code, score: scoreRound(e.measuredCm, e.targetCm) }
      }
      case 'game_completed': {
        const s = ensureSession(e.sessionId, e.deviceId, source, at)
        if (s.status === 'completed') return { playerCode: s.player_code, totalScore: s.total_score, isHighScore: false }
        for (const r of e.rounds) saveRound(s.id, r)
        const { total } = db.prepare('SELECT COALESCE(SUM(score), 0) AS total FROM game_rounds WHERE session_id = ?').get(s.id) as { total: number }
        const { best } = db.prepare("SELECT MAX(total_score) AS best FROM game_sessions WHERE source = ? AND status = 'completed'").get(source) as { best: number | null }
        db.prepare("UPDATE game_sessions SET status = 'completed', total_score = ?, duration_ms = ?, completed_at = ? WHERE id = ?").run(total, e.durationMs, at, s.id)
        const isHighScore = best == null || total > best
        emits.push(['game:completed', { source, playerCode: s.player_code, totalScore: total, isHighScore }], ['leaderboard:updated', { source }])
        return { playerCode: s.player_code, totalScore: total, isHighScore }
      }
      case 'feedback_submitted': {
        const product = e.productId == null ? null : (db.prepare('SELECT name FROM products WHERE id = ?').get(e.productId) as { name: string } | undefined)
        if (e.productId != null && !product) throw new HttpError(422, 'Produk tidak dikenal; feedback tidak disimpan')
        const r = db.prepare('INSERT INTO feedback (event_uid, device_id, source, level, product_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(e.id, e.deviceId, source, e.level, e.productId, at)
        emits.push(['feedback:submitted', { source, level: e.level, productId: e.productId, productName: product?.name ?? null }])
        return { feedbackId: Number(r.lastInsertRowid) }
      }
      case 'device_error':
        db.prepare('UPDATE devices SET last_error = ? WHERE id = ?').run(e.message, e.deviceId)
        emits.push(['device:status', { deviceId: e.deviceId, source, error: e.message }])
        return {}
    }
  }

  /** Idempotent: a repeated event id is acknowledged without being applied twice. */
  function event(e: DeviceEvent, source: Source): Record<string, unknown> & { duplicate: boolean } {
    const now = Date.now()
    const at = new Date(now - e.ageMs).toISOString()
    const emits: [string, unknown][] = []
    const result = db.transaction(() => {
      const fresh = insertEvent.run(e.id, e.deviceId, e.type, source, at, new Date(now).toISOString(), JSON.stringify(e)).changes > 0
      if (!fresh) {
        const s = 'sessionId' in e ? (getSession.get(e.sessionId) as SessionRow | undefined) : undefined
        return { duplicate: true, ...(s && { playerCode: s.player_code, totalScore: s.total_score }) }
      }
      return { duplicate: false, ...apply(e, source, at, emits) }
    })()
    seen(e.deviceId, source)
    for (const [name, data] of emits) emit(name, data)
    return result
  }

  function listDevices(source: Source): DeviceInfo[] {
    const rows = db.prepare('SELECT * FROM devices WHERE source = ? ORDER BY last_seen_at DESC').all(source) as Record<string, never>[]
    const reading = db.prepare('SELECT temperature_c AS temperatureC, humidity_pct AS humidityPct, recorded_at AS recordedAt FROM telemetry WHERE device_id = ? ORDER BY id DESC LIMIT 1')
    return rows.map((d) => ({
      id: d.id,
      source: d.source,
      online: presence.get(d.id)?.online ?? false,
      firmware: d.firmware,
      rssi: d.rssi,
      phase: d.phase,
      uptimeMs: d.uptime_ms,
      freeHeap: d.free_heap,
      queueSize: d.queue_size,
      sensors: JSON.parse(d.sensors),
      lastError: d.last_error,
      lastSeenAt: d.last_seen_at,
      live: live.get(d.id) ?? null,
      lastReading: (reading.get(d.id) as DeviceInfo['lastReading']) ?? null,
    }))
  }

  const liveFor = (source: Source) => [...live.values()].filter((l) => l.source === source && presence.get(l.deviceId)?.online)

  function forgetDemo() {
    for (const [id, p] of presence) if (p.source === 'DEMO') presence.delete(id)
    for (const [id, l] of live) if (l.source === 'DEMO') live.delete(id)
  }

  return { heartbeat, telemetry, event, sweep, listDevices, liveFor, logServerEvent, forgetDemo }
}
