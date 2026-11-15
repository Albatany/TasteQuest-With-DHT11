// Response shapes shared by server and dashboard.
import type { RoundResult } from './game.ts'
import type { Source } from './meta.ts'
import type { Settings, Telemetry } from './schemas.ts'

export interface LeaderboardEntry {
  rank: number
  id: number
  playerCode: string
  nickname: string | null
  totalScore: number
  durationMs: number
  completedAt: string
  rounds: RoundResult[]
}

export interface LevelCounts {
  1: number
  2: number
  3: number
}

export interface FeedbackStats {
  total: number
  counts: LevelCounts
  positivePct: number | null
  byProduct: { productId: number | null; name: string; total: number; counts: LevelCounts; positivePct: number | null }[]
  timeline: { bucket: number; counts: LevelCounts }[] // bucket = unix seconds (15-min)
  recent: { id: number; level: 1 | 2 | 3; productName: string | null; createdAt: string }[]
}

export interface DeviceInfo {
  id: string
  source: Source
  online: boolean
  firmware: string | null
  rssi: number | null
  phase: string | null
  uptimeMs: number | null
  freeHeap: number | null
  queueSize: number | null
  sensors: Record<string, string>
  lastError: string | null
  lastSeenAt: string
  live: LiveState | null
  lastReading: { temperatureC: number | null; humidityPct: number | null; recordedAt: string } | null
}

export interface LiveState extends Telemetry {
  source: Source
  receivedAt: string
}

export interface ActivityItem {
  id: number
  type: string
  deviceId: string
  occurredAt: string
  payload: Record<string, unknown>
}

export interface Overview {
  sessions: number
  feedbackTotal: number
  highScore: number | null
  positivePct: number | null
  activity: { bucket: number; games: number; feedback: number }[]
  recent: ActivityItem[]
}

export interface Product {
  id: number
  name: string
  enabled: boolean
}

export type PublicSettings = Settings
