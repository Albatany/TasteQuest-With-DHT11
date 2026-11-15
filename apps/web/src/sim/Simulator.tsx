// Virtual ESP8266 for DEMO mode. It runs the shared state machine (same logic as the
// firmware) and talks to the real backend through /api/demo/*, so every record goes
// through the same validation and SQLite pathway and is stored as DEMO.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Power, Wifi, WifiOff, Zap } from 'lucide-react'
import { classifyPress, DEFAULT_SETTINGS, initialMachine, remainingMs, SATISFACTION, step } from '@tastequest/shared'
import type { MachineConfig, MachineInput, MachineOutput, MachineState } from '@tastequest/shared'
import { Badge, Button, cx, Panel } from '../components/ui.tsx'
import { api, ApiError, useIsOperator } from '../lib/api.ts'
import { num } from '../lib/format.ts'

export const SIM_DEVICE_ID = 'SIM-ESP8266'
const LONG_PRESS_MS = 1200
const QUEUE_MAX = 50 // bounded like the firmware's RAM queue
const SENSORS = { ultrasonic: 'simulated', dht11: 'simulated', oled: 'simulated', touch: 'simulated', buzzer: 'simulated' } as const

type DeviceEventOut = Exclude<MachineOutput, { type: 'beep' }>
type Queued = DeviceEventOut & { id: string; deviceId: string; createdAt: number }
type DeviceConfig = MachineConfig & { resetSeq: number }

// crypto.randomUUID needs a secure context; LAN dashboards run on plain http.
const newId = () => Date.now().toString(36) + '-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')

function useSimulatorEngine() {
  const isOperator = useIsOperator()
  const [on, setOn] = useState(false)
  const [wifi, setWifi] = useState(true)
  const [distance, setDistance] = useState(20)
  const [handPresent, setHandPresent] = useState(true)
  const [machine, setMachine] = useState<MachineState>(() => initialMachine(Date.now()))
  const [queueSize, setQueueSize] = useState(0)
  const [playerCode, setPlayerCode] = useState<string | null>(null)
  const [buzzer, setBuzzer] = useState(false)
  const [touch, setTouch] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [env, setEnv] = useState({ temperatureC: 29.4, humidityPct: 72 })

  const r = useRef({
    machine,
    config: { ...DEFAULT_SETTINGS } as MachineConfig,
    queue: [] as Queued[],
    resetSeq: null as number | null,
    bootAt: Date.now(),
    flushing: false,
    lastTelemetry: 0,
    pressAt: 0,
    longFired: false,
    longTimer: 0 as ReturnType<typeof setTimeout> | 0,
    playerCode: null as string | null,
  })
  // Latest UI values for timer callbacks.
  const live = useRef({ on, wifi, distance, handPresent, touch, buzzer, env, lastError })
  live.current = { on, wifi, distance, handPresent, touch, buzzer, env, lastError }

  const reading = () => (live.current.handPresent ? Math.round((live.current.distance + (Math.random() - 0.5) * 0.4) * 10) / 10 : null)
  const connected = () => live.current.on && live.current.wifi

  const sendTelemetry = useCallback(() => {
    if (!connected()) return
    const s = r.current
    const m = s.machine
    const now = Date.now()
    s.lastTelemetry = now
    api('/api/demo/telemetry', {
      method: 'POST',
      json: {
        deviceId: SIM_DEVICE_ID,
        demo: true,
        ...live.current.env,
        distanceCm: reading(),
        touch: live.current.touch,
        buzzer: live.current.buzzer,
        game: {
          phase: m.phase,
          round: m.sessionId ? m.round + 1 : 0,
          targetCm: m.targetsCm[m.round] ?? null,
          remainingMs: remainingMs(m, now, s.config),
          rounds: m.rounds,
          totalScore: m.rounds.reduce((a, x) => a + x.score, 0),
          menu: m.menu,
          option: m.option,
          playerCode: s.playerCode,
        },
      },
    }).catch(() => {})
  }, [])

  const dispatchRef = useRef<(i: MachineInput) => void>(() => {})

  const flush = useCallback(async () => {
    const s = r.current
    if (s.flushing || !connected()) return
    s.flushing = true
    try {
      while (s.queue.length && connected()) {
        const { createdAt, ...event } = s.queue[0]
        try {
          const res = await api<Record<string, unknown>>('/api/demo/events', { method: 'POST', json: { ...event, demo: true, ageMs: Date.now() - createdAt } })
          if (typeof res.playerCode === 'string') setPlayerCode((s.playerCode = res.playerCode))
          if (event.type === 'game_completed') dispatchRef.current({ type: 'SUBMITTED' })
          setLastError(null)
        } catch (err) {
          const e = err as ApiError
          // 4xx (except auth/rate limit) can never succeed: drop it. Anything else: retry later.
          if (!(e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429)) {
            setLastError(e.message)
            break
          }
          setLastError(`Event ditolak server: ${e.message}`)
        }
        s.queue.shift()
        setQueueSize(s.queue.length)
      }
    } finally {
      s.flushing = false
    }
  }, [])

  const dispatch = useCallback(
    (input: MachineInput) => {
      const s = r.current
      const before = s.machine.phase
      const { state, out } = step(s.machine, input, { now: Date.now(), distanceCm: reading(), config: s.config, newId })
      s.machine = state
      setMachine(state)
      for (const o of out) {
        if (o.type === 'beep') {
          setBuzzer(true)
          setTimeout(() => setBuzzer(false), 220)
          continue
        }
        if (o.type === 'game_started') setPlayerCode((s.playerCode = null))
        s.queue.push({ ...o, id: newId(), deviceId: SIM_DEVICE_ID, createdAt: Date.now() })
        if (s.queue.length > QUEUE_MAX) s.queue.shift()
        setQueueSize(s.queue.length)
      }
      if (out.some((o) => o.type !== 'beep')) void flush()
      if (state.phase !== before) sendTelemetry()
    },
    [flush, sendTelemetry],
  )
  dispatchRef.current = dispatch

  const heartbeat = useCallback(async () => {
    if (!connected()) return
    const s = r.current
    try {
      const cfg = await api<DeviceConfig>('/api/demo/heartbeat', {
        method: 'POST',
        json: {
          deviceId: SIM_DEVICE_ID,
          demo: true,
          firmware: 'web-sim 1.0',
          rssi: -50 - Math.round(Math.random() * 15),
          phase: s.machine.phase,
          uptimeMs: Date.now() - s.bootAt,
          freeHeap: null,
          queueSize: s.queue.length,
          sensors: SENSORS,
          lastError: live.current.lastError,
        },
      })
      s.config = cfg
      if (s.resetSeq != null && cfg.resetSeq !== s.resetSeq) dispatch({ type: 'RESET' })
      s.resetSeq = cfg.resetSeq
    } catch (err) {
      setLastError((err as Error).message)
    }
  }, [dispatch])

  useEffect(() => {
    if (!on) return
    const s = r.current
    s.bootAt = Date.now()
    s.resetSeq = null
    s.machine = initialMachine(Date.now())
    setMachine(s.machine)
    void heartbeat()
    const timers = [
      setInterval(() => dispatch({ type: 'TICK' }), 100),
      setInterval(heartbeat, 3000),
      setInterval(() => {
        const active = !['IDLE', 'GAME_COMPLETE', 'FEEDBACK_THANKS'].includes(r.current.machine.phase)
        if (Date.now() - r.current.lastTelemetry >= (active ? 300 : 2000)) sendTelemetry()
      }, 150),
      setInterval(flush, 2000),
      setInterval(
        () =>
          setEnv((e) => ({
            temperatureC: Math.round(Math.min(34, Math.max(26, e.temperatureC + (Math.random() - 0.5) * 0.4)) * 10) / 10,
            humidityPct: Math.round(Math.min(85, Math.max(60, e.humidityPct + (Math.random() - 0.5) * 1.5))),
          })),
        5000,
      ),
    ]
    return () => timers.forEach(clearInterval)
  }, [on, dispatch, heartbeat, sendTelemetry, flush])

  useEffect(() => {
    if (on && wifi) void flush()
  }, [on, wifi, flush])

  const pressStart = () => {
    const s = r.current
    if (!live.current.on || s.pressAt) return
    s.pressAt = performance.now()
    s.longFired = false
    setTouch(true)
    s.longTimer = setTimeout(() => {
      s.longFired = true
      dispatch({ type: 'LONG' })
    }, LONG_PRESS_MS)
  }
  const pressEnd = () => {
    const s = r.current
    if (!s.pressAt) return
    const kind = classifyPress(performance.now() - s.pressAt, 50, LONG_PRESS_MS)
    s.pressAt = 0
    clearTimeout(s.longTimer)
    setTouch(false)
    if (!s.longFired && kind !== 'none') dispatch({ type: kind === 'long' ? 'LONG' : 'SHORT' })
  }

  return {
    available: isOperator,
    on,
    setOn,
    wifi,
    setWifi,
    distance,
    setDistance,
    handPresent,
    setHandPresent,
    machine,
    config: r.current.config,
    queueSize,
    playerCode,
    buzzer,
    touch,
    env,
    lastError,
    pressStart,
    pressEnd,
    sensorError: () => dispatch({ type: 'SENSOR_ERROR', message: 'HC-SR04 timeout (simulasi)' }),
    reading,
  }
}

type Sim = ReturnType<typeof useSimulatorEngine>
const SimContext = createContext<Sim | null>(null)

export function SimulatorProvider({ children }: { children: ReactNode }) {
  return <SimContext.Provider value={useSimulatorEngine()}>{children}</SimContext.Provider>
}

export function useSimulator() {
  const sim = useContext(SimContext)
  if (!sim) throw new Error('useSimulator harus di dalam SimulatorProvider')
  return sim
}

/** Text the 128×64 OLED would show (≤ 5 lines). The firmware renders the same screens. */
export function oledLines(sim: Sim): string[] {
  const m = sim.machine
  const total = m.rounds.reduce((a, x) => a + x.score, 0)
  const secs = Math.ceil((remainingMs(m, Date.now(), sim.config) ?? 0) / 1000)
  const target = m.targetsCm[m.round]
  switch (m.phase) {
    case 'IDLE':
      return ['TASTEQUEST', 'HMIF UNJA', '', 'Sentuh utk mulai', sim.wifi ? 'WiFi: OK' : 'WiFi: OFFLINE']
    case 'MODE_SELECTION':
      return ['PILIH MODE', `${m.menu === 0 ? '>' : ' '} ProxiRush`, `${m.menu === 1 ? '>' : ' '} TastePulse`, '', 'Tap=ganti Tahan=OK']
    case 'GAME_READY':
      return ['PROXIRUSH', 'Posisikan tangan', 'sesuai jarak', 'target.', 'Tahan = MULAI']
    case 'COUNTDOWN':
      return [`RONDE ${m.round + 1}/3`, `Target: ${target} cm`, '', `Mulai dlm ${secs}...`]
    case 'ROUND_ACTIVE': {
      const d = sim.reading()
      return [`R${m.round + 1}  TARGET ${target}cm`, `Jarak: ${d == null ? '--' : num(d)} cm`, `Sisa: ${secs} dtk`, '', 'Tahan = KUNCI']
    }
    case 'ROUND_RESULT': {
      const last = m.rounds[m.rounds.length - 1]
      return [`RONDE ${last.round}`, last.measuredCm == null ? 'Tidak terkunci' : `Terukur ${num(last.measuredCm)}cm`, `Skor: ${last.score}`, `Total: ${total}`]
    }
    case 'GAME_RESULT':
      return ['HASIL AKHIR', `${total} / 300`, m.rounds.map((x) => x.score).join(' + ')]
    case 'RESULT_SUBMISSION':
      return ['MENGIRIM SKOR...', `${total} / 300`]
    case 'GAME_COMPLETE':
      return ['SELESAI!', sim.playerCode ?? 'PLAYER ?', `Skor: ${total}`, sim.queueSize ? 'Antre (offline)' : 'Tersimpan']
    case 'FEEDBACK_SELECT':
      return ['NILAI MAKANAN', ...SATISFACTION.map((s, i) => `${m.option === i ? '>' : ' '} ${s.label}`), m.option < 0 ? 'Tap utk memilih' : 'Tahan = KIRIM']
    case 'FEEDBACK_THANKS':
      return ['TERIMA KASIH!', 'Penilaian Anda', 'sudah tercatat.']
    case 'ERROR':
      return ['! ERROR SENSOR', m.error ?? '', '', 'Tahan = kembali']
  }
}

export function VirtualDevice({ compact }: { compact?: boolean }) {
  const sim = useSimulator()
  const [, force] = useState(0)
  useEffect(() => {
    // OLED countdown text needs a steady refresh while the device runs.
    if (!sim.on) return
    const t = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [sim.on])

  if (!sim.available)
    return (
      <Panel title="Perangkat Simulasi">
        <p className="text-sm text-ink-200">
          Simulator menulis data DEMO ke database, jadi hanya operator yang dapat menjalankannya.{' '}
          <Link to="/operator" className="font-semibold text-gold-500 underline underline-offset-4">
            Login operator
          </Link>
        </p>
      </Panel>
    )

  const onKey = (e: React.KeyboardEvent, down: boolean) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (down && !e.repeat) sim.pressStart()
    if (!down) sim.pressEnd()
  }

  return (
    <Panel
      title="Perangkat Simulasi"
      frame="var(--color-gold-700)"
      action={
        <div className="flex flex-wrap gap-2">
          <Badge tone="gold">DEMO</Badge>
          <Badge tone={sim.on ? (sim.wifi ? 'ok' : 'warn') : 'muted'} dot>
            {sim.on ? (sim.wifi ? 'Online' : 'Wi-Fi putus') : 'Mati'}
          </Badge>
        </div>
      }
    >
      <div className="@container">
      <div className={cx('grid gap-4', !compact && '@lg:grid-cols-2')}>
        <div className="flex flex-col gap-3">
          <div className="scanlines aspect-[2/1] border-4 border-ink-700 bg-black p-3 font-pixel text-sm leading-snug text-[#cfe9ff]" aria-live="polite" aria-label="Layar OLED simulasi">
            {sim.on ? oledLines(sim).map((l, i) => <div key={i} className="truncate whitespace-pre">{l || ' '}</div>) : <div className="text-ink-600">— layar mati —</div>}
          </div>
          <button
            type="button"
            disabled={!sim.on}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              sim.pressStart()
            }}
            onPointerUp={sim.pressEnd}
            onPointerCancel={sim.pressEnd}
            onKeyDown={(e) => onKey(e, true)}
            onKeyUp={(e) => onKey(e, false)}
            className={cx(
              'pixel-frame-sm relative flex min-h-20 cursor-pointer touch-none flex-col items-center justify-center overflow-hidden font-pixel select-none disabled:cursor-not-allowed disabled:opacity-40',
              sim.touch ? 'bg-gold-500 text-ink-950' : 'bg-ink-800 text-ink-50',
            )}
            aria-label="Sensor sentuh TTP223: tekan singkat untuk ganti pilihan, tahan 1,2 detik untuk konfirmasi"
          >
            <span className="relative z-10 text-base font-semibold">SENTUH (TTP223)</span>
            <span className="relative z-10 text-xs">Tap = ganti · Tahan 1,2 dtk = OK</span>
            <span className={cx('absolute bottom-0 left-0 h-1.5 bg-ink-950', sim.touch ? 'w-full transition-[width] duration-[1200ms] ease-linear' : 'w-0')} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-2">
            <span className="flex justify-between">
              <span>Jarak tangan (HC-SR04)</span>
              <span className="font-arcade text-xs text-ok">{sim.handPresent ? `${num(sim.distance)} cm` : '--'}</span>
            </span>
            <input type="range" min={2} max={50} step={0.5} value={sim.distance} onChange={(e) => sim.setDistance(Number(e.target.value))} className="accent-[var(--color-gold-500)]" disabled={!sim.handPresent} />
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={sim.handPresent} onChange={(e) => sim.setHandPresent(e.target.checked)} className="size-5 accent-[var(--color-gold-500)]" />
            <span>
              Tangan terdeteksi
              <span className="block text-xs text-ink-300">Hapus centang = pembacaan tidak valid</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant={sim.on ? 'ghost' : 'primary'} onClick={() => sim.setOn(!sim.on)}>
              <Power className="size-4" aria-hidden /> {sim.on ? 'Matikan' : 'Nyalakan'}
            </Button>
            <Button onClick={() => sim.setWifi(!sim.wifi)} disabled={!sim.on}>
              {sim.wifi ? <WifiOff className="size-4" aria-hidden /> : <Wifi className="size-4" aria-hidden />}
              {sim.wifi ? 'Putuskan Wi-Fi' : 'Sambungkan Wi-Fi'}
            </Button>
            <Button onClick={sim.sensorError} disabled={!sim.on}>
              <Zap className="size-4" aria-hidden /> Error sensor
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-ink-200">
            <dt>Suhu (DHT11)</dt>
            <dd className="text-right tabular">{num(sim.env.temperatureC)} °C</dd>
            <dt>Kelembapan</dt>
            <dd className="text-right tabular">{num(sim.env.humidityPct, 0)} %</dd>
            <dt>Antrean offline</dt>
            <dd className="text-right tabular">{sim.queueSize} event</dd>
            <dt>Buzzer</dt>
            <dd className={cx('text-right', sim.buzzer && 'text-gold-500')}>{sim.buzzer ? 'BEEP' : 'diam'}</dd>
          </dl>
          {sim.lastError && <p className="bg-bad/10 p-2 text-xs text-ink-100">{sim.lastError}</p>}
        </div>
      </div>
      </div>
    </Panel>
  )
}
