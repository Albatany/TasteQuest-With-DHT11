import { describe, expect, it } from 'vitest'
import { classifyPress, initialMachine, positivePercent, remainingMs, scoreRound, step, TIMING } from './game.ts'
import type { MachineInput, MachineOutput, MachineState } from './game.ts'
import { deviceEventSchema, settingsSchema } from './schemas.ts'

describe('scoreRound', () => {
  it.each([
    [20, 20, 100],
    [20.4, 20, 96],
    [19.5, 20, 95],
    [25, 20, 50],
    [30, 20, 0],
    [45, 20, 0],
    [12.05, 12, 100], // 99.5 rounds up
  ])('measured %s vs target %s -> %s', (m, t, s) => expect(scoreRound(m, t)).toBe(s))

  it('gives 0 without a valid measurement', () => {
    expect(scoreRound(null, 20)).toBe(0)
    expect(scoreRound(Number.NaN, 20)).toBe(0)
  })
})

describe('classifyPress', () => {
  it('separates bounce, short and long presses', () => {
    expect(classifyPress(20)).toBe('none')
    expect(classifyPress(80)).toBe('short')
    expect(classifyPress(1199)).toBe('short')
    expect(classifyPress(1200)).toBe('long')
    expect(classifyPress(500, 50, 400)).toBe('long')
  })
})

describe('positivePercent', () => {
  it('uses only Sangat Puas over all responses', () => {
    expect(positivePercent(1, 3)).toBe(33.3)
    expect(positivePercent(2, 2)).toBe(100)
    expect(positivePercent(0, 0)).toBeNull()
  })
})

const config = { targetsCm: [20, 12, 28], roundDurationMs: 10_000, feedbackCooldownMs: 3000, activeProductId: 7 }

/** Drives the machine with a fake clock; returns final state and every output. */
function run(inputs: (MachineInput | { wait: number; distance?: number | null })[], start = initialMachine(0), t0 = 0) {
  let state: MachineState = start
  let now = t0
  let distanceCm: number | null = 20
  const outputs: MachineOutput[] = []
  let n = 0
  for (const i of inputs) {
    if ('wait' in i) {
      if (i.distance !== undefined) distanceCm = i.distance
      const end = now + i.wait
      while (now < end) {
        now = Math.min(end, now + 100)
        const r = step(state, { type: 'TICK' }, { now, distanceCm, config, newId: () => `id-${++n}xx` })
        state = r.state
        outputs.push(...r.out)
      }
    } else {
      const r = step(state, i, { now, distanceCm, config, newId: () => `id-${++n}xx` })
      state = r.state
      outputs.push(...r.out)
    }
  }
  return { state, now, outputs, events: outputs.filter((o) => o.type !== 'beep') }
}

const SHORT = { type: 'SHORT' } as const
const LONG = { type: 'LONG' } as const

describe('device state machine', () => {
  it('plays a full three-round game with locks, a miss and submission', () => {
    const { state, events } = run([
      SHORT, // IDLE -> MODE_SELECTION
      LONG, // ProxiRush -> GAME_READY
      LONG, // start -> COUNTDOWN
      { wait: TIMING.countdownMs, distance: 20.4 },
      LONG, // lock round 1 at 20.4 (target 20)
      { wait: TIMING.roundResultMs + TIMING.countdownMs, distance: 14 },
      LONG, // lock round 2 at 14 (target 12)
      { wait: TIMING.roundResultMs + TIMING.countdownMs },
      { wait: config.roundDurationMs }, // round 3 expires -> 0
      { wait: TIMING.roundResultMs + TIMING.gameResultMs },
    ])
    expect(state.phase).toBe('RESULT_SUBMISSION')
    expect(events.map((e) => e.type)).toEqual(['game_started', 'round_completed', 'round_completed', 'round_completed', 'game_completed'])
    const done = events.at(-1) as Extract<MachineOutput, { type: 'game_completed' }>
    expect(done.rounds.map((r) => r.score)).toEqual([96, 80, 0])
    expect(done.rounds[2].measuredCm).toBeNull()

    const after = run([{ type: 'SUBMITTED' }], state).state
    expect(after.phase).toBe('GAME_COMPLETE')
  })

  it('ignores a lock while the reading is invalid', () => {
    const { state, events } = run([SHORT, LONG, LONG, { wait: TIMING.countdownMs, distance: null }, LONG])
    expect(state.phase).toBe('ROUND_ACTIVE')
    expect(events.filter((e) => e.type === 'round_completed')).toHaveLength(0)
  })

  it('ignores touches during countdown', () => {
    const { state } = run([SHORT, LONG, LONG, LONG, SHORT])
    expect(state.phase).toBe('COUNTDOWN')
  })

  it('submits feedback only after an explicit selection, then cools down', () => {
    let r = run([SHORT, SHORT, LONG]) // select TastePulse
    expect(r.state.phase).toBe('FEEDBACK_SELECT')
    r = run([LONG], r.state) // nothing selected yet -> ignored
    expect(r.events).toHaveLength(0)
    r = run([SHORT, SHORT, SHORT, LONG], r.state) // option 2 = Sangat Puas
    expect(r.events).toEqual([{ type: 'feedback_submitted', level: 3, productId: 7 }])
    expect(r.state.phase).toBe('FEEDBACK_THANKS')
    r = run([LONG, { wait: TIMING.thanksMs }], r.state)
    expect(r.state.phase).toBe('FEEDBACK_THANKS') // still cooling down
    r = run([{ wait: config.feedbackCooldownMs }], r.state, r.now)
    expect(r.state).toMatchObject({ phase: 'FEEDBACK_SELECT', option: -1 })
  })

  it('returns to IDLE after inactivity and on RESET or sensor error recovery', () => {
    expect(run([SHORT, { wait: TIMING.idleTimeoutMs }]).state.phase).toBe('IDLE')
    expect(run([SHORT, LONG, LONG, { type: 'RESET' }]).state.phase).toBe('IDLE')
    const err = run([SHORT, { type: 'SENSOR_ERROR', message: 'HC-SR04' }])
    expect(err.state).toMatchObject({ phase: 'ERROR', error: 'HC-SR04' })
    expect(run([{ wait: TIMING.errorMs }], err.state).state.phase).toBe('IDLE')
  })

  it('reports remaining time for timed phases', () => {
    const s = run([SHORT, LONG, LONG, { wait: 1000 }]).state
    expect(remainingMs(s, 1000, config)).toBe(2000)
    expect(remainingMs(initialMachine(0), 0, config)).toBeNull()
  })
})

describe('schemas', () => {
  it('rejects targets outside the calibrated range', () => {
    const ok = { displayMode: 'DEMO', activeProductId: null, roundDurationMs: 10000, targetsCm: [20, 12, 28], feedbackCooldownMs: 3000 }
    expect(settingsSchema.safeParse(ok).success).toBe(true)
    expect(settingsSchema.safeParse({ ...ok, targetsCm: [2, 12, 28] }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...ok, targetsCm: [20, 12] }).success).toBe(false)
  })

  it('validates feedback events', () => {
    const base = { id: 'evt-000001', deviceId: 'ESP-01', type: 'feedback_submitted', productId: null }
    expect(deviceEventSchema.safeParse({ ...base, level: 3 }).success).toBe(true)
    expect(deviceEventSchema.safeParse({ ...base, level: 4 }).success).toBe(false)
    expect(deviceEventSchema.safeParse({ ...base, level: 2, id: 'x' }).success).toBe(false)
  })
})
