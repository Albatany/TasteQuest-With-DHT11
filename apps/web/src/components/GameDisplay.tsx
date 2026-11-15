import { useEffect, useMemo, useState } from 'react'
import { scoreRound, SATISFACTION } from '@tastequest/shared'
import type { Source } from '@tastequest/shared'
import { useDevices, useLive } from '../lib/api.ts'
import { num, PHASE_LABEL } from '../lib/format.ts'
import { FACE } from './sprites.ts'
import { Badge, CountUp, cx, Empty, Sprite } from './ui.tsx'

const METER_MAX_CM = 50
const scoreTone = (s: number) => (s >= 80 ? 'text-ok' : s >= 40 ? 'text-gold-500' : 'text-bad')

/** Live game state of the device for a source, with the timer interpolated between telemetry pushes. */
export function useLiveGame(source: Source | undefined) {
  const devices = useDevices(source)
  const onlineIds = new Set(devices.data?.filter((d) => d.online).map((d) => d.id))
  const live = useLive(source).data?.find((l) => onlineIds.has(l.deviceId)) ?? null
  const seenAt = useMemo(() => Date.now(), [live])
  const [now, setNow] = useState(Date.now())
  const timed = live?.game?.remainingMs != null
  useEffect(() => {
    if (!timed) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [timed])
  const remainingMs = live?.game?.remainingMs == null ? null : Math.max(0, live.game.remainingMs - (now - seenAt))
  return { live, game: live?.game ?? null, remainingMs, online: onlineIds.size > 0, loading: devices.isPending }
}

function Big({ label, value, unit, tone = 'text-ink-50', xl }: { label: string; value: string; unit?: string; tone?: string; xl?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 bg-ink-950/60 p-3">
      <span className="font-pixel text-xs tracking-widest text-ink-300 uppercase sm:text-sm">{label}</span>
      <span className={cx('font-arcade tabular', tone, xl ? 'text-3xl xl:text-5xl' : 'text-xl sm:text-2xl')}>
        {value}
        {unit && <span className="ml-1 font-pixel text-sm text-ink-300 xl:text-lg">{unit}</span>}
      </span>
    </div>
  )
}

export function GameDisplay({ source, xl }: { source: Source | undefined; xl?: boolean }) {
  const { live, game, remainingMs, online, loading } = useLiveGame(source)
  if (loading) return <div className="h-64 animate-pulse bg-ink-800" aria-busy="true" />
  if (!online || !live || !game)
    return (
      <Empty sprite="chip" title="DEVICE OFFLINE">
        {source === 'DEMO' ? 'Nyalakan perangkat simulasi di halaman Arena (perlu login operator).' : 'Menunggu heartbeat dari ESP8266. Pastikan perangkat dan laptop berada di Wi-Fi yang sama.'}
      </Empty>
    )

  const phase = game.phase
  const total = game.rounds.reduce((a, r) => a + r.score, 0)
  const inGame = ['COUNTDOWN', 'ROUND_ACTIVE', 'ROUND_RESULT', 'GAME_RESULT', 'RESULT_SUBMISSION', 'GAME_COMPLETE'].includes(phase)

  if (phase === 'FEEDBACK_SELECT' || phase === 'FEEDBACK_THANKS')
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Badge tone="gold">TastePulse aktif</Badge>
        <p className={cx('font-pixel text-ink-100', xl ? 'text-3xl' : 'text-xl')}>{phase === 'FEEDBACK_THANKS' ? 'Terima kasih atas penilaian Anda!' : 'Bagaimana rasa makanannya?'}</p>
        <div className="flex gap-4">
          {SATISFACTION.map((s, i) => (
            <div key={s.level} className={cx('flex flex-col items-center gap-2 p-3', game.option === i ? 'bg-gold-500/20 pixel-frame-sm [--frame:var(--color-gold-500)]' : 'opacity-60')}>
              <Sprite name={FACE[s.level]} px={xl ? 8 : 5} />
              <span className="font-pixel text-sm">{s.label}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-300">Sentuh singkat untuk memilih, tahan untuk mengirim.</p>
      </div>
    )

  if (!inGame)
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Badge tone={phase === 'ERROR' ? 'bad' : 'muted'}>{PHASE_LABEL[phase] ?? phase}</Badge>
        <Sprite name="target" px={xl ? 10 : 6} />
        <p className={cx('font-pixel text-ink-100', xl ? 'text-3xl' : 'text-xl')}>{phase === 'ERROR' ? 'Sensor bermasalah — operator sedang memeriksa' : 'Sentuh sensor untuk bermain ProxiRush'}</p>
        <p className="max-w-md text-sm text-ink-300">Posisikan tangan di atas sensor ultrasonik sedekat mungkin dengan jarak target, lalu tahan sensor sentuh untuk mengunci.</p>
      </div>
    )

  const target = game.targetCm
  const measured = live.distanceCm
  const preview = phase === 'ROUND_ACTIVE' && target != null ? scoreRound(measured, target) : null
  const secs = remainingMs == null ? '—' : String(Math.ceil(remainingMs / 1000))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gold">{PHASE_LABEL[phase] ?? phase}</Badge>
        <span className="font-pixel text-ink-200">{game.playerCode ?? 'PLAYER —'}</span>
        <span className="ml-auto font-arcade text-sm text-ink-200">RONDE {Math.max(1, game.round)}/3</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Big xl={xl} label="Target" value={target == null ? '—' : num(target)} unit="cm" tone="text-gold-500" />
        <Big xl={xl} label="Terukur" value={measured == null ? '--' : num(measured)} unit="cm" tone="text-ok" />
        <Big xl={xl} label={phase === 'COUNTDOWN' ? 'Mulai' : 'Waktu'} value={secs} unit="dtk" tone={remainingMs != null && remainingMs < 3000 ? 'text-bad' : 'text-ink-50'} />
      </div>

      {target != null && (
        <div>
          <div className="relative h-6 bg-ink-950" role="img" aria-label={`Target ${num(target)} cm, terukur ${measured == null ? 'tidak terbaca' : `${num(measured)} cm`}`}>
            <div className="absolute inset-y-0 w-1.5 bg-gold-500" style={{ left: `${(Math.min(target, METER_MAX_CM) / METER_MAX_CM) * 100}%` }} />
            {measured != null && <div className="absolute inset-y-1 w-3 bg-ok transition-[left] duration-200" style={{ left: `calc(${(Math.min(measured, METER_MAX_CM) / METER_MAX_CM) * 100}% - 6px)` }} />}
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-300">
            <span>0 cm</span>
            {preview != null && <span className={cx('font-pixel', scoreTone(preview))}>Jika dikunci sekarang: {preview} poin</span>}
            <span>{METER_MAX_CM} cm</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((n) => {
          const r = game.rounds.find((x) => x.round === n)
          return (
            <div key={n} className={cx('flex flex-col items-center gap-1 bg-ink-950/60 p-2', r && 'animate-pop')}>
              <span className="text-xs text-ink-300">Ronde {n}</span>
              <span className={cx('font-arcade', r ? scoreTone(r.score) : 'text-ink-600', xl ? 'text-2xl' : 'text-lg')}>{r ? r.score : '—'}</span>
              {r && <span className="text-xs text-ink-300">{r.measuredCm == null ? 'tidak terkunci' : `${num(r.measuredCm)} / ${num(r.targetCm)} cm`}</span>}
            </div>
          )
        })}
      </div>

      <div className="flex items-baseline justify-center gap-3 bg-ink-950/60 p-3">
        <span className="font-pixel text-ink-300">TOTAL</span>
        <span className={cx('font-arcade text-gold-500 tabular', xl ? 'text-5xl xl:text-7xl' : 'text-3xl')}>
          <CountUp value={total} />
        </span>
        <span className="font-pixel text-ink-300">/ 300</span>
      </div>
    </div>
  )
}
