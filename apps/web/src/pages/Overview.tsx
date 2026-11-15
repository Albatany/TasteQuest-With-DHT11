import { Activity, Droplets, Gamepad2, HeartPulse, MessageSquareHeart, MonitorPlay, Thermometer, Trophy } from 'lucide-react'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BRAND, CREATOR } from '@tastequest/shared'
import type { Overview as OverviewData } from '@tastequest/shared'
import { HmifMark } from '../components/AppCredits.tsx'
import { Badge, CountUp, DeviceBadge, Empty, Panel, QueryState, Sprite, Stat } from '../components/ui.tsx'
import { useDevices, useSource, useSourced } from '../lib/api.ts'
import { ago, describeEvent, num, PHASE_LABEL, wibHm, wibTime } from '../lib/format.ts'

export const CHART = {
  grid: 'var(--color-ink-800)',
  axis: 'var(--color-ink-300)',
  tooltip: { background: 'var(--color-ink-900)', border: '2px solid var(--color-ink-700)', borderRadius: 0, color: 'var(--color-ink-50)' },
}

export function Overview() {
  const source = useSource()
  const q = useSourced<OverviewData>('overview', '/api/overview', source)
  const devices = useDevices(source)
  const device = devices.data?.[0]
  const reading = device?.online && device.live ? { ...device.live, at: device.live.receivedAt } : device?.lastReading ? { ...device.lastReading, at: device.lastReading.recordedAt } : null

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="pixel-frame relative m-1 overflow-hidden bg-ink-900 p-6 sm:p-8 [--frame:var(--color-gold-700)]">
        <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <HmifMark size={44} />
              <span className="font-pixel text-sm tracking-widest text-ink-200">
                {BRAND.org} × {BRAND.event.toUpperCase()}
              </span>
            </div>
            <h1 className="font-arcade text-3xl leading-tight text-gold-500 sm:text-5xl">TASTEQUEST</h1>
            <p className="font-pixel text-xl tracking-[0.25em] text-ink-100">{BRAND.tagline}</p>
            <p className="max-w-xl text-ink-200">
              Mainkan <strong className="text-ink-50">ProxiRush</strong>, uji ketepatan tanganmu dengan sensor ultrasonik, lalu beri nilai makanan stan HMIF lewat{' '}
              <strong className="text-ink-50">TastePulse</strong>. Semua data diproses lokal oleh ESP8266, server Node.js, dan SQLite.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/arena" className="pixel-frame-sm m-0.5 inline-flex min-h-11 items-center gap-2 bg-gold-500 px-4 py-2 font-pixel font-semibold text-ink-950 [--frame:var(--color-gold-700)] hover:bg-gold-400">
                <Gamepad2 className="size-4" aria-hidden /> Buka Arena
              </Link>
              <Link to="/kiosk" className="pixel-frame-sm m-0.5 inline-flex min-h-11 items-center gap-2 bg-ink-800 px-4 py-2 font-pixel font-semibold text-ink-50 [--frame:var(--color-ink-600)] hover:bg-ink-700">
                <MonitorPlay className="size-4" aria-hidden /> Mode Kiosk
              </Link>
            </div>
            <p className="text-xs text-ink-300">{CREATOR.copyright}</p>
          </div>
          <div className="flex items-end gap-6 self-center" aria-hidden>
            <Sprite name="target" px={9} />
            <Sprite name="bowl" px={9} />
          </div>
        </div>
      </section>

      <QueryState q={q} rows={2}>
        {(d) => (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Sesi game selesai" icon={<Gamepad2 className="size-4" aria-hidden />} value={<CountUp value={d.sessions} />} />
            <Stat label="Feedback masuk" icon={<MessageSquareHeart className="size-4" aria-hidden />} value={<CountUp value={d.feedbackTotal} />} />
            <Stat label="Skor tertinggi" icon={<Trophy className="size-4" aria-hidden />} value={d.highScore == null ? '—' : <CountUp value={d.highScore} />} unit="/300" tone="text-gold-500" />
            <Stat label="Feedback positif" icon={<HeartPulse className="size-4" aria-hidden />} value={d.positivePct == null ? '—' : num(d.positivePct)} unit="%" tone="text-ok" hint="Porsi “Sangat Puas” dari respons masuk" />
          </div>
        )}
      </QueryState>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Status Perangkat" icon={<Activity className="size-5" aria-hidden />} action={<DeviceBadge online={!!device?.online} />}>
          <QueryState q={devices} isEmpty={(d) => d.length === 0} empty={<Empty sprite="chip" title="Belum ada perangkat">{source === 'LIVE' ? 'ESP8266 belum pernah mengirim heartbeat.' : 'Nyalakan perangkat simulasi di halaman Arena.'}</Empty>}>
            {() => (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-300">ID perangkat</dt>
                <dd className="text-right font-pixel">{device!.id}</dd>
                <dt className="text-ink-300">Mode perangkat</dt>
                <dd className="text-right">{device!.online ? (PHASE_LABEL[device!.live?.game?.phase ?? device!.phase ?? ''] ?? device!.phase ?? '—') : '—'}</dd>
                <dt className="text-ink-300">Heartbeat terakhir</dt>
                <dd className="text-right">
                  {ago(device!.lastSeenAt)}
                  <div className="text-xs text-ink-300">{wibTime(device!.lastSeenAt)}</div>
                </dd>
              </dl>
            )}
          </QueryState>
        </Panel>
        <Stat
          label="Suhu stan (DHT11)"
          icon={<Thermometer className="size-4" aria-hidden />}
          value={num(reading?.temperatureC)}
          unit="°C"
          hint={reading ? `${device?.online ? 'Live' : 'Terakhir tercatat'} · ${wibTime(reading.at)}` : 'Belum ada pembacaan'}
        />
        <Stat
          label="Kelembapan (DHT11)"
          icon={<Droplets className="size-4" aria-hidden />}
          value={num(reading?.humidityPct, 0)}
          unit="%"
          hint={reading ? `${device?.online ? 'Live' : 'Terakhir tercatat'} · ${wibTime(reading.at)}` : 'Belum ada pembacaan'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Aktivitas per 15 menit" className="lg:col-span-3">
          <QueryState q={q} isEmpty={(d) => d.activity.length === 0} empty={<Empty sprite="target" title="Belum ada aktivitas">Grafik muncul setelah ada game selesai atau feedback masuk.</Empty>}>
            {(d) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.activity.map((a) => ({ ...a, t: wibHm(a.bucket * 1000) }))}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="t" stroke={CHART.axis} fontSize={12} />
                    <YAxis allowDecimals={false} stroke={CHART.axis} fontSize={12} width={32} />
                    <Tooltip contentStyle={CHART.tooltip} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} labelFormatter={(l) => `${l} WIB`} />
                    <Legend />
                    <Bar dataKey="games" name="Game selesai" fill="var(--color-gold-500)" isAnimationActive={false} />
                    <Bar dataKey="feedback" name="Feedback" fill="var(--color-ok)" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryState>
        </Panel>
        <Panel title="Aktivitas Terbaru" className="lg:col-span-2" action={<Badge tone="muted">real-time</Badge>}>
          <QueryState q={q} isEmpty={(d) => d.recent.length === 0} empty={<Empty title="Belum ada event" />}>
            {(d) => (
              <ul className="flex flex-col gap-2" aria-live="polite">
                {d.recent.map((e) => (
                  <li key={e.id} className="flex animate-rise items-start justify-between gap-3 bg-ink-950/50 px-3 py-2 text-sm">
                    <span>{describeEvent(e)}</span>
                    <time className="shrink-0 text-xs text-ink-300" dateTime={e.occurredAt}>
                      {wibTime(e.occurredAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Panel>
      </div>
    </div>
  )
}
