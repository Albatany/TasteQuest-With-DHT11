import { Cpu, History, Radio } from 'lucide-react'
import type { ActivityItem, DeviceInfo } from '@tastequest/shared'
import { Badge, Empty, ModeBadge, Panel, QueryState } from '../components/ui.tsx'
import { useDevices, useSource, useSourced } from '../lib/api.ts'
import { ago, describeEvent, num, PHASE_LABEL, wibTime } from '../lib/format.ts'

const SENSOR_LABEL: Record<string, string> = { ultrasonic: 'HC-SR04 (jarak)', dht11: 'DHT11 (suhu/lembap)', oled: 'OLED', touch: 'TTP223 (sentuh)', buzzer: 'Buzzer' }
const SENSOR_TONE = { ok: 'ok', simulated: 'gold', unconfigured: 'warn', error: 'bad' } as const
const SENSOR_TEXT: Record<string, string> = { ok: 'OK', simulated: 'Simulasi', unconfigured: 'Pin belum diatur', error: 'Error' }

function health(d: DeviceInfo): { tone: 'ok' | 'warn' | 'bad'; label: string } {
  if (!d.online) return { tone: 'bad', label: 'DEVICE OFFLINE' }
  const sensorProblem = Object.values(d.sensors).some((s) => s === 'error' || s === 'unconfigured')
  if (d.lastError || sensorProblem || (d.rssi != null && d.rssi < -78) || (d.queueSize ?? 0) > 0) return { tone: 'warn', label: 'Online · perlu perhatian' }
  return { tone: 'ok', label: 'Online · sehat' }
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-300">{k}</dt>
      <dd className="text-right font-medium tabular">{v}</dd>
    </>
  )
}

const rssiText = (r: number | null) => (r == null ? '—' : `${r} dBm (${r >= -60 ? 'kuat' : r >= -75 ? 'cukup' : 'lemah'})`)

export function Device() {
  const source = useSource()
  const devices = useDevices(source)
  const device = devices.data?.[0]
  const events = useSourced<ActivityItem[]>('events', `/api/events?limit=25${device ? `&deviceId=${encodeURIComponent(device.id)}` : ''}`, source, { enabled: !!source && !!device })

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-arcade text-xl text-gold-500 sm:text-2xl">MONITOR PERANGKAT</h1>
        <ModeBadge source={source} />
      </div>
      <QueryState q={devices} isEmpty={(d) => d.length === 0} empty={<Panel><Empty sprite="chip" title="Belum ada perangkat">{source === 'LIVE' ? 'ESP8266 akan muncul setelah heartbeat pertama ke server ini.' : 'Nyalakan perangkat simulasi di halaman Arena.'}</Empty></Panel>}>
        {() => {
          const d = device!
          const h = health(d)
          const live = d.online ? d.live : null
          return (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="ESP8266" icon={<Cpu className="size-5" aria-hidden />} action={<Badge tone={h.tone} dot>{h.label}</Badge>} frame={h.tone === 'bad' ? 'var(--color-bad)' : undefined}>
                  <dl className="grid grid-cols-2 gap-y-2 text-sm">
                    <Row k="ID perangkat" v={<span className="font-pixel">{d.id}</span>} />
                    <Row k="Firmware" v={d.firmware ?? '—'} />
                    <Row k="Mode saat ini" v={d.online ? PHASE_LABEL[live?.game?.phase ?? d.phase ?? ''] ?? d.phase ?? '—' : '—'} />
                    <Row k="Heartbeat terakhir" v={<>{ago(d.lastSeenAt)}<div className="text-xs text-ink-300">{wibTime(d.lastSeenAt)}</div></>} />
                    <Row k="Uptime" v={d.uptimeMs == null ? '—' : `${Math.floor(d.uptimeMs / 60000)} mnt`} />
                    <Row k="Free heap" v={d.freeHeap == null ? '—' : `${num(d.freeHeap / 1024)} KB`} />
                    <Row k="Antrean offline" v={`${d.queueSize ?? 0} event`} />
                  </dl>
                </Panel>
                <Panel title="Wi-Fi" icon={<Radio className="size-5" aria-hidden />}>
                  <dl className="grid grid-cols-2 gap-y-2 text-sm">
                    <Row k="Status" v={d.online ? 'Terhubung' : 'Tidak ada heartbeat'} />
                    <Row k="RSSI" v={d.online ? rssiText(d.rssi) : '—'} />
                  </dl>
                  <div className="mt-4 flex items-end gap-1" aria-hidden>
                    {[-90, -78, -67, -55].map((t, i) => (
                      <div key={t} className={d.online && d.rssi != null && d.rssi >= t ? 'bg-ok' : 'bg-ink-800'} style={{ width: 12, height: 10 + i * 8 }} />
                    ))}
                  </div>
                  {d.lastError && <p className="mt-4 bg-bad/10 p-3 text-sm">Error terakhir: {d.lastError}</p>}
                </Panel>
                <Panel title="Sensor Live">
                  {live ? (
                    <dl className="grid grid-cols-2 gap-y-2 text-sm">
                      <Row k="Jarak ultrasonik" v={live.distanceCm == null ? 'tidak terbaca' : `${num(live.distanceCm)} cm`} />
                      <Row k="Suhu" v={`${num(live.temperatureC)} °C`} />
                      <Row k="Kelembapan" v={`${num(live.humidityPct, 0)} %`} />
                      <Row k="Sentuh (TTP223)" v={live.touch ? <Badge tone="gold">ditekan</Badge> : 'lepas'} />
                      <Row k="Buzzer" v={live.buzzer ? <Badge tone="gold">berbunyi</Badge> : 'diam'} />
                      <Row k="Diterima" v={wibTime(live.receivedAt)} />
                    </dl>
                  ) : (
                    <p className="text-sm text-ink-300">
                      Tidak ada pembacaan live karena perangkat offline. {d.lastReading ? `Suhu terakhir tercatat ${num(d.lastReading.temperatureC)} °C pada ${wibTime(d.lastReading.recordedAt)}.` : ''}
                    </p>
                  )}
                </Panel>
              </div>
              <Panel title="Kesehatan Sensor">
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {Object.keys(SENSOR_LABEL).map((k) => {
                    const s = d.sensors[k]
                    return (
                      <li key={k} className="flex flex-col gap-2 bg-ink-950/50 p-3">
                        <span className="text-sm">{SENSOR_LABEL[k]}</span>
                        {s ? <Badge tone={SENSOR_TONE[s as keyof typeof SENSOR_TONE] ?? 'muted'}>{SENSOR_TEXT[s] ?? s}</Badge> : <Badge>Tidak dilaporkan</Badge>}
                      </li>
                    )
                  })}
                </ul>
              </Panel>
            </>
          )
        }}
      </QueryState>
      {device && (
        <Panel title="Riwayat Event" icon={<History className="size-5" aria-hidden />}>
          <QueryState q={events} isEmpty={(e) => e.length === 0} empty={<Empty title="Belum ada event" />}>
            {(list) => (
              <ul className="flex flex-col gap-1 text-sm">
                {list.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b-2 border-ink-800 py-2">
                    <span>{describeEvent(e)}</span>
                    <time className="text-xs text-ink-300" dateTime={e.occurredAt}>
                      {wibTime(e.occurredAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Panel>
      )}
    </div>
  )
}
