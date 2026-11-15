// SQLite reads and operator writes. Device ingestion lives in ingest.ts.
import { DEFAULT_SETTINGS, positivePercent, SATISFACTION } from '@tastequest/shared'
import type { ActivityItem, FeedbackStats, LeaderboardEntry, LevelCounts, Overview, Product, Settings, Source } from '@tastequest/shared'
import type { DB } from './db.ts'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type StoredSettings = Settings & { resetSeq: number }

export function getSettings(db: DB, defaultMode: Source): StoredSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return { ...DEFAULT_SETTINGS, displayMode: defaultMode, resetSeq: 0, ...Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])) }
}

export function saveSettings(db: DB, patch: Partial<StoredSettings>) {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
  db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) upsert.run(k, JSON.stringify(v))
  })()
}

export function listProducts(db: DB): Product[] {
  return (db.prepare('SELECT id, name, enabled FROM products ORDER BY name').all() as { id: number; name: string; enabled: number }[]).map((p) => ({
    ...p,
    enabled: p.enabled === 1,
  }))
}

const SESSION_SELECT = `
  SELECT s.id, s.player_code AS playerCode, s.nickname, s.total_score AS totalScore, s.duration_ms AS durationMs, s.completed_at AS completedAt,
    (SELECT json_group_array(json_object('round', r.round, 'targetCm', r.target_cm, 'measuredCm', r.measured_cm, 'score', r.score) ORDER BY r.round)
       FROM game_rounds r WHERE r.session_id = s.id) AS rounds
  FROM game_sessions s
  WHERE s.source = ? AND s.status = 'completed'`

/** 'score' = leaderboard order: highest score, then fastest, then earliest completed. */
export function listSessions(db: DB, source: Source, order: 'score' | 'recent', limit: number): LeaderboardEntry[] {
  const orderBy = order === 'score' ? 's.total_score DESC, s.duration_ms ASC, s.completed_at ASC, s.id ASC' : 's.completed_at DESC, s.id DESC'
  const rows = db.prepare(`${SESSION_SELECT} ORDER BY ${orderBy} LIMIT ?`).all(source, limit) as (Omit<LeaderboardEntry, 'rank' | 'rounds'> & { rounds: string })[]
  return rows.map((r, i) => ({ ...r, rank: i + 1, rounds: JSON.parse(r.rounds) }))
}

const BUCKET_S = 900 // 15-minute buckets
const MAX_BUCKETS = 96
const emptyCounts = (): LevelCounts => ({ 1: 0, 2: 0, 3: 0 })

/** Zero-fills consecutive buckets so charts never imply data between gaps. */
function fillBuckets<T>(rows: { bucket: number }[], make: () => T, add: (acc: T, row: never) => void): ({ bucket: number } & T)[] {
  if (!rows.length) return []
  const map = new Map<number, T>()
  for (const r of rows) {
    if (!map.has(r.bucket)) map.set(r.bucket, make())
    add(map.get(r.bucket)!, r as never)
  }
  const last = rows[rows.length - 1].bucket
  const first = Math.max(rows[0].bucket, last - (MAX_BUCKETS - 1) * BUCKET_S)
  const out: ({ bucket: number } & T)[] = []
  for (let b = first; b <= last; b += BUCKET_S) out.push({ bucket: b, ...(map.get(b) ?? make()) })
  return out
}

const bucketSql = (col: string) => `CAST(strftime('%s', ${col}) AS INTEGER) / ${BUCKET_S} * ${BUCKET_S}`

export function feedbackStats(db: DB, source: Source): FeedbackStats {
  const counts = emptyCounts()
  for (const r of db.prepare('SELECT level, COUNT(*) AS n FROM feedback WHERE source = ? GROUP BY level').all(source) as { level: 1 | 2 | 3; n: number }[]) counts[r.level] = r.n
  const total = counts[1] + counts[2] + counts[3]

  const products = new Map<number | null, FeedbackStats['byProduct'][number]>()
  const rows = db
    .prepare(
      `SELECT f.product_id AS productId, p.name, f.level, COUNT(*) AS n
       FROM feedback f LEFT JOIN products p ON p.id = f.product_id
       WHERE f.source = ? GROUP BY f.product_id, f.level`,
    )
    .all(source) as { productId: number | null; name: string | null; level: 1 | 2 | 3; n: number }[]
  for (const r of rows) {
    const p = products.get(r.productId) ?? { productId: r.productId, name: r.name ?? 'Umum (pengalaman stan)', total: 0, counts: emptyCounts(), positivePct: null }
    p.counts[r.level] += r.n
    p.total += r.n
    products.set(r.productId, p)
  }
  const byProduct = [...products.values()].map((p) => ({ ...p, positivePct: positivePercent(p.counts[3], p.total) })).sort((a, b) => b.total - a.total)

  const timelineRows = db
    .prepare(`SELECT ${bucketSql('created_at')} AS bucket, level, COUNT(*) AS n FROM feedback WHERE source = ? GROUP BY bucket, level ORDER BY bucket`)
    .all(source) as { bucket: number; level: 1 | 2 | 3; n: number }[]
  const timeline = fillBuckets(
    timelineRows,
    () => ({ counts: emptyCounts() }),
    (acc, r: { level: 1 | 2 | 3; n: number }) => (acc.counts[r.level] += r.n),
  )

  const recent = db
    .prepare(
      `SELECT f.id, f.level, p.name AS productName, f.created_at AS createdAt
       FROM feedback f LEFT JOIN products p ON p.id = f.product_id
       WHERE f.source = ? ORDER BY f.created_at DESC, f.id DESC LIMIT 10`,
    )
    .all(source) as FeedbackStats['recent']

  return { total, counts, positivePct: positivePercent(counts[3], total), byProduct, timeline, recent }
}

export function listEvents(db: DB, source: Source, limit: number, deviceId?: string): ActivityItem[] {
  const rows = db
    .prepare(
      `SELECT id, type, device_id AS deviceId, occurred_at AS occurredAt, payload FROM device_events
       WHERE source = ? ${deviceId ? 'AND device_id = ?' : ''} ORDER BY id DESC LIMIT ?`,
    )
    .all(...(deviceId ? [source, deviceId, limit] : [source, limit])) as (Omit<ActivityItem, 'payload'> & { payload: string })[]
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }))
}

export function overview(db: DB, source: Source): Overview {
  const g = db.prepare("SELECT COUNT(*) AS sessions, MAX(total_score) AS highScore FROM game_sessions WHERE source = ? AND status = 'completed'").get(source) as {
    sessions: number
    highScore: number | null
  }
  const f = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(level = 3), 0) AS positive FROM feedback WHERE source = ?').get(source) as { total: number; positive: number }
  const activityRows = db
    .prepare(
      `SELECT ${bucketSql('occurred_at')} AS bucket, type, COUNT(*) AS n FROM device_events
       WHERE source = ? AND type IN ('game_completed', 'feedback_submitted') GROUP BY bucket, type ORDER BY bucket`,
    )
    .all(source) as { bucket: number; type: string; n: number }[]
  const activity = fillBuckets(
    activityRows,
    () => ({ games: 0, feedback: 0 }),
    (acc, r: { type: string; n: number }) => (r.type === 'game_completed' ? (acc.games += r.n) : (acc.feedback += r.n)),
  )
  return { sessions: g.sessions, highScore: g.highScore, feedbackTotal: f.total, positivePct: positivePercent(f.positive, f.total), activity, recent: listEvents(db, source, 8) }
}

// Leading = + - @ would run as a formula in spreadsheet apps.
const cell = (v: unknown) => {
  if (v == null) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

export function feedbackCsv(db: DB): string {
  const rows = db
    .prepare(
      `SELECT f.id, f.created_at, f.source, f.device_id, f.level, p.name FROM feedback f
       LEFT JOIN products p ON p.id = f.product_id ORDER BY f.created_at`,
    )
    .all() as { id: number; created_at: string; source: string; device_id: string; level: 1 | 2 | 3; name: string | null }[]
  return toCsv([
    ['id', 'waktu_utc', 'sumber', 'perangkat', 'level', 'kategori', 'produk'],
    ...rows.map((r) => [r.id, r.created_at, r.source, r.device_id, r.level, SATISFACTION[r.level - 1].label, r.name ?? 'Umum (pengalaman stan)']),
  ])
}

export function gamesCsv(db: DB): string {
  const sessions = db.prepare("SELECT * FROM game_sessions WHERE status = 'completed' ORDER BY completed_at").all() as Record<string, unknown>[]
  const rounds = db.prepare('SELECT * FROM game_rounds WHERE session_id = ? ORDER BY round')
  return toCsv([
    ['player', 'nickname', 'sumber', 'perangkat', 'total', 'r1_target_cm', 'r1_terukur_cm', 'r1_skor', 'r2_target_cm', 'r2_terukur_cm', 'r2_skor', 'r3_target_cm', 'r3_terukur_cm', 'r3_skor', 'durasi_ms', 'selesai_utc'],
    ...sessions.map((s) => [
      s.player_code,
      s.nickname,
      s.source,
      s.device_id,
      s.total_score,
      ...(rounds.all(s.id) as Record<string, unknown>[]).flatMap((r) => [r.target_cm, r.measured_cm, r.score]),
      s.duration_ms,
      s.completed_at,
    ]),
  ])
}

/** Deletes DEMO rows only; LIVE data is never touched. */
export function clearDemo(db: DB) {
  return db.transaction(() => {
    const del = (table: string) => db.prepare(`DELETE FROM ${table} WHERE source = 'DEMO'`).run().changes
    return { feedback: del('feedback'), sessions: del('game_sessions'), events: del('device_events'), telemetry: del('telemetry'), devices: del('devices') }
  })()
}
