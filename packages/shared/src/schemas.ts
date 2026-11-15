import { z } from 'zod'
import { DEFAULT_SETTINGS, SOURCES, TARGET_RANGE_CM } from './meta.ts'

const uid = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'ID harus 6–64 karakter [A-Za-z0-9_-]')
const deviceId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)
const cm = z.number().min(0).max(500)

const envelope = {
  id: uid, // stable across retries -> idempotency key
  deviceId,
  ageMs: z.number().int().min(0).max(7 * 24 * 3600_000).default(0), // ESP8266 has no RTC: event time = received - age
  demo: z.boolean().default(false),
}

const round = z.object({
  round: z.number().int().min(1).max(3),
  targetCm: z.number().min(TARGET_RANGE_CM.min).max(TARGET_RANGE_CM.max),
  measuredCm: cm.nullable(),
})

export const deviceEventSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('game_started'), sessionId: uid }),
  z.object({ ...envelope, type: z.literal('round_completed'), sessionId: uid, ...round.shape }),
  z.object({
    ...envelope,
    type: z.literal('game_completed'),
    sessionId: uid,
    durationMs: z.number().int().min(0).max(30 * 60_000),
    rounds: z.array(round).length(3),
  }),
  z.object({
    ...envelope,
    type: z.literal('feedback_submitted'),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    productId: z.number().int().positive().nullable(),
  }),
  z.object({ ...envelope, type: z.literal('device_error'), message: z.string().max(200) }),
])
export type DeviceEvent = z.infer<typeof deviceEventSchema>

const sensorState = z.enum(['ok', 'error', 'unconfigured', 'simulated'])

export const heartbeatSchema = z.object({
  deviceId,
  demo: z.boolean().default(false),
  firmware: z.string().max(32),
  rssi: z.number().int().min(-120).max(0).nullable().default(null),
  phase: z.string().max(32),
  uptimeMs: z.number().int().min(0),
  freeHeap: z.number().int().min(0).nullable().default(null),
  queueSize: z.number().int().min(0).default(0),
  sensors: z.partialRecord(z.enum(['ultrasonic', 'dht11', 'oled', 'touch', 'buzzer']), sensorState).default({}),
  lastError: z.string().max(200).nullable().default(null),
})
export type Heartbeat = z.infer<typeof heartbeatSchema>

export const liveGameSchema = z.object({
  phase: z.string().max(32),
  round: z.number().int().min(0).max(3),
  targetCm: z.number().nullable(),
  remainingMs: z.number().int().min(0).nullable(),
  rounds: z.array(z.object({ round: z.number().int(), targetCm: z.number(), measuredCm: z.number().nullable(), score: z.number().int() })).max(3),
  totalScore: z.number().int().min(0).max(300),
  menu: z.number().int().min(0).max(1),
  option: z.number().int().min(-1).max(2),
  playerCode: z.string().max(16).nullable(),
})

export const telemetrySchema = z.object({
  deviceId,
  demo: z.boolean().default(false),
  temperatureC: z.number().min(-20).max(80).nullable(),
  humidityPct: z.number().min(0).max(100).nullable(),
  distanceCm: cm.nullable(),
  touch: z.boolean().default(false),
  buzzer: z.boolean().default(false),
  game: liveGameSchema.nullable().default(null),
})
export type Telemetry = z.infer<typeof telemetrySchema>

export const settingsSchema = z.object({
  displayMode: z.enum(SOURCES),
  activeProductId: z.number().int().positive().nullable(),
  roundDurationMs: z.number().int().min(3000).max(30_000),
  targetsCm: z.array(z.number().int().min(TARGET_RANGE_CM.min).max(TARGET_RANGE_CM.max)).length(3),
  feedbackCooldownMs: z.number().int().min(0).max(60_000),
})
export type Settings = z.infer<typeof settingsSchema>
export const settingsDefaults: Settings = DEFAULT_SETTINGS

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  enabled: z.boolean().optional(),
})

export const nicknameSchema = z.object({ nickname: z.string().trim().max(24).nullable() })
export const loginSchema = z.object({ password: z.string().min(1).max(200) })
