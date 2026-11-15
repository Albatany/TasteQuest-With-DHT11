// ProxiRush + TastePulse device logic. The ESP8266 firmware (firmware/src/machine.cpp)
// mirrors this state machine; the web simulator runs this exact code.
import type { SatisfactionLevel } from './meta.ts'

export const ROUNDS = 3

/** score = clamp(round(100 - |measured - target| * 10), 0, 100); no valid lock = 0. */
export function scoreRound(measuredCm: number | null, targetCm: number): number {
  if (measuredCm == null || !Number.isFinite(measuredCm)) return 0
  return Math.min(100, Math.max(0, Math.round(100 - Math.abs(measuredCm - targetCm) * 10)))
}

export function positivePercent(positive: number, total: number): number | null {
  return total > 0 ? Math.round((positive / total) * 1000) / 10 : null
}

/** Classifies a completed TTP223 press by its duration (firmware uses the same thresholds). */
export function classifyPress(durationMs: number, debounceMs = 50, longPressMs = 1200): 'none' | 'short' | 'long' {
  if (durationMs < debounceMs) return 'none'
  return durationMs >= longPressMs ? 'long' : 'short'
}

export type Phase =
  | 'IDLE'
  | 'MODE_SELECTION'
  | 'GAME_READY'
  | 'COUNTDOWN'
  | 'ROUND_ACTIVE'
  | 'ROUND_RESULT'
  | 'GAME_RESULT'
  | 'RESULT_SUBMISSION'
  | 'GAME_COMPLETE'
  | 'FEEDBACK_SELECT'
  | 'FEEDBACK_THANKS'
  | 'ERROR'

export interface RoundResult {
  round: number
  targetCm: number
  measuredCm: number | null
  score: number
}

export interface MachineConfig {
  targetsCm: number[]
  roundDurationMs: number
  feedbackCooldownMs: number
  activeProductId: number | null
}

export const TIMING = {
  countdownMs: 3000,
  roundResultMs: 2500,
  gameResultMs: 3000,
  submitTimeoutMs: 5000,
  completeMs: 6000,
  thanksMs: 2500,
  errorMs: 5000,
  idleTimeoutMs: 30_000,
} as const

export interface MachineState {
  phase: Phase
  since: number
  lastInput: number
  menu: 0 | 1 // 0 = ProxiRush, 1 = TastePulse
  option: -1 | 0 | 1 | 2 // feedback choice; -1 = nothing selected yet
  sessionId: string | null
  startedAt: number
  round: number // 0-based index of the current round
  rounds: RoundResult[]
  targetsCm: number[]
  error: string | null
}

export type MachineInput =
  | { type: 'SHORT' }
  | { type: 'LONG' }
  | { type: 'TICK' }
  | { type: 'SUBMITTED' }
  | { type: 'SENSOR_ERROR'; message: string }
  | { type: 'RESET' }

export type BeepPattern = 'confirm' | 'countdown' | 'success' | 'miss' | 'complete' | 'feedback' | 'error'

export type MachineOutput =
  | { type: 'game_started'; sessionId: string }
  | ({ type: 'round_completed'; sessionId: string } & RoundResult)
  | { type: 'game_completed'; sessionId: string; durationMs: number; rounds: RoundResult[] }
  | { type: 'feedback_submitted'; level: SatisfactionLevel; productId: number | null }
  | { type: 'beep'; pattern: BeepPattern }

export interface StepContext {
  now: number
  distanceCm: number | null // null = no valid reading
  config: MachineConfig
  newId: () => string
}

export const initialMachine = (now: number): MachineState => ({
  phase: 'IDLE',
  since: now,
  lastInput: now,
  menu: 0,
  option: -1,
  sessionId: null,
  startedAt: 0,
  round: 0,
  rounds: [],
  targetsCm: [],
  error: null,
})

const IDLE_TIMEOUT_PHASES: Phase[] = ['MODE_SELECTION', 'GAME_READY', 'FEEDBACK_SELECT']

/** Pure transition function: same input, same result. Timers advance through TICK. */
export function step(prev: MachineState, input: MachineInput, ctx: StepContext): { state: MachineState; out: MachineOutput[] } {
  const { now, config } = ctx
  const pressed = input.type === 'SHORT' || input.type === 'LONG'
  const s: MachineState = pressed ? { ...prev, lastInput: now } : prev
  const elapsed = now - s.since
  const tickPast = (ms: number) => input.type === 'TICK' && elapsed >= ms
  const out: MachineOutput[] = []
  const go = (phase: Phase, patch: Partial<MachineState> = {}) => ({ state: { ...s, ...patch, phase, since: now }, out })
  const beep = (pattern: BeepPattern) => out.push({ type: 'beep', pattern })

  if (input.type === 'RESET') return go('IDLE', { sessionId: null, rounds: [], round: 0, option: -1, error: null })
  if (input.type === 'SENSOR_ERROR') {
    beep('error')
    return go('ERROR', { error: input.message })
  }

  switch (s.phase) {
    case 'IDLE':
      if (pressed) {
        beep('confirm')
        return go('MODE_SELECTION', { menu: 0 })
      }
      break
    case 'MODE_SELECTION':
      if (input.type === 'SHORT') return { state: { ...s, menu: s.menu ? 0 : 1 }, out }
      if (input.type === 'LONG') {
        beep('confirm')
        return s.menu === 0 ? go('GAME_READY') : go('FEEDBACK_SELECT', { option: -1 })
      }
      break
    case 'GAME_READY':
      if (input.type === 'SHORT') return go('MODE_SELECTION')
      if (input.type === 'LONG') {
        const sessionId = ctx.newId()
        out.push({ type: 'game_started', sessionId })
        beep('countdown')
        return go('COUNTDOWN', { sessionId, startedAt: now, round: 0, rounds: [], targetsCm: config.targetsCm.slice(0, ROUNDS) })
      }
      break
    case 'COUNTDOWN':
      if (tickPast(TIMING.countdownMs)) return go('ROUND_ACTIVE')
      break
    case 'ROUND_ACTIVE': {
      // A lock without a valid reading is ignored; the round keeps running until it expires.
      const locked = input.type === 'LONG' && ctx.distanceCm != null
      if (locked || tickPast(config.roundDurationMs)) {
        const targetCm = s.targetsCm[s.round]
        const measuredCm = locked ? ctx.distanceCm : null
        const result: RoundResult = { round: s.round + 1, targetCm, measuredCm, score: scoreRound(measuredCm, targetCm) }
        out.push({ type: 'round_completed', sessionId: s.sessionId!, ...result })
        beep(result.score > 0 ? 'success' : 'miss')
        return go('ROUND_RESULT', { rounds: [...s.rounds, result] })
      }
      break
    }
    case 'ROUND_RESULT':
      if (tickPast(TIMING.roundResultMs)) {
        if (s.round + 1 < ROUNDS) {
          beep('countdown')
          return go('COUNTDOWN', { round: s.round + 1 })
        }
        return go('GAME_RESULT')
      }
      break
    case 'GAME_RESULT':
      if (tickPast(TIMING.gameResultMs)) {
        out.push({ type: 'game_completed', sessionId: s.sessionId!, durationMs: now - s.startedAt, rounds: s.rounds })
        return go('RESULT_SUBMISSION')
      }
      break
    case 'RESULT_SUBMISSION':
      // Leaves on ack or timeout; an unsent result stays in the offline queue either way.
      if (input.type === 'SUBMITTED' || tickPast(TIMING.submitTimeoutMs)) {
        beep('complete')
        return go('GAME_COMPLETE')
      }
      break
    case 'GAME_COMPLETE':
      if (pressed || tickPast(TIMING.completeMs)) return go('IDLE', { sessionId: null })
      break
    case 'FEEDBACK_SELECT':
      if (input.type === 'SHORT') return { state: { ...s, option: ((s.option + 1) % 3) as 0 | 1 | 2 }, out }
      if (input.type === 'LONG' && s.option >= 0) {
        out.push({ type: 'feedback_submitted', level: (s.option + 1) as SatisfactionLevel, productId: config.activeProductId })
        beep('feedback')
        return go('FEEDBACK_THANKS')
      }
      break
    case 'FEEDBACK_THANKS':
      // Input is ignored during thanks + cooldown to avoid accidental duplicate ratings.
      if (tickPast(TIMING.thanksMs + config.feedbackCooldownMs)) return go('FEEDBACK_SELECT', { option: -1, lastInput: now })
      break
    case 'ERROR':
      if (input.type === 'LONG' || tickPast(TIMING.errorMs)) return go('IDLE', { error: null, sessionId: null })
      break
  }

  if (input.type === 'TICK' && IDLE_TIMEOUT_PHASES.includes(s.phase) && now - s.lastInput >= TIMING.idleTimeoutMs) return go('IDLE')
  return { state: s, out }
}

/** Milliseconds left in the current timed phase, or null for untimed phases. */
export function remainingMs(s: MachineState, now: number, config: MachineConfig): number | null {
  const total = s.phase === 'COUNTDOWN' ? TIMING.countdownMs : s.phase === 'ROUND_ACTIVE' ? config.roundDurationMs : null
  return total == null ? null : Math.max(0, total - (now - s.since))
}
