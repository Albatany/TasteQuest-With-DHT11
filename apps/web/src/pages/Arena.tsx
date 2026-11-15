import { useState } from 'react'
import { Link } from 'react-router'
import type { Source } from '@tastequest/shared'
import { GameDisplay } from '../components/GameDisplay.tsx'
import { Badge, ModeBadge, Panel, PixelConfetti, Sprite } from '../components/ui.tsx'
import { useDevices, useSource } from '../lib/api.ts'
import { useSocketEvent } from '../lib/socket.ts'
import { ago, PHASE_LABEL } from '../lib/format.ts'
import { VirtualDevice } from '../sim/Simulator.tsx'

/** Shows a short celebration when the server reports a new high score for this source. */
export function useHighScoreCelebration(source: Source | undefined) {
  const [show, setShow] = useState<{ score: number; player: string } | null>(null)
  useSocketEvent<{ source: Source; isHighScore: boolean; totalScore: number; playerCode: string }>('game:completed', (d) => {
    if (d.source !== source || !d.isHighScore) return
    setShow({ score: d.totalScore, player: d.playerCode })
    setTimeout(() => setShow(null), 4500)
  })
  return show
}

export function HighScoreBanner({ show, xl }: { show: { score: number; player: string } | null; xl?: boolean }) {
  if (!show) return null
  return (
    <>
      <PixelConfetti />
      <div role="status" className="fixed inset-x-0 top-24 z-50 mx-auto flex w-fit animate-pop items-center gap-4 bg-gold-500 px-6 py-4 text-ink-950 pixel-frame [--frame:var(--color-gold-700)]">
        <Sprite name="trophy" px={xl ? 6 : 4} />
        <div>
          <div className={xl ? 'font-arcade text-2xl' : 'font-arcade text-base'}>SKOR TERTINGGI BARU!</div>
          <div className="font-pixel text-lg">
            {show.player} · {show.score} poin
          </div>
        </div>
      </div>
    </>
  )
}

const STEPS = [
  ['Sentuh sensor', 'Tap singkat membuka menu. Tap lagi untuk memilih ProxiRush, lalu tahan untuk konfirmasi.'],
  ['Ikuti target', 'Setiap ronde menampilkan jarak target (cm). Gerakkan telapak tangan di atas sensor ultrasonik.'],
  ['Kunci jarak', 'Tahan sensor sentuh ±1,2 detik untuk mengunci. Waktu tiap ronde ±10 detik.'],
  ['Kumpulkan skor', 'Skor = 100 − selisih(cm) × 10, minimal 0. Tiga ronde, maksimal 300 poin.'],
]

export function Arena() {
  const source = useSource()
  const celebration = useHighScoreCelebration(source)
  const device = useDevices(source).data?.[0]

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <HighScoreBanner show={celebration} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-arcade text-xl text-gold-500 sm:text-2xl">PROXIRUSH ARENA</h1>
        <ModeBadge source={source} />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Layar Permainan" className="xl:col-span-3" action={<Badge tone="muted">{source === 'DEMO' ? 'data simulasi' : 'data perangkat fisik'}</Badge>}>
          <GameDisplay source={source} />
        </Panel>
        <div className="xl:col-span-2">
          {source === 'DEMO' ? (
            <VirtualDevice />
          ) : (
            <Panel title="Perangkat Fisik (LIVE)">
              <div className="flex flex-col gap-3 text-sm text-ink-200">
                <p>Mode LIVE hanya mengamati ESP8266 asli. Tidak ada data yang dibuat oleh dashboard.</p>
                {device ? (
                  <p>
                    <span className="font-pixel text-ink-50">{device.id}</span> · {device.online ? PHASE_LABEL[device.phase ?? ''] ?? device.phase : 'offline'} · heartbeat {ago(device.lastSeenAt)}
                  </p>
                ) : (
                  <p>Belum ada perangkat LIVE yang terhubung.</p>
                )}
                <p>
                  Untuk mencoba tanpa perangkat, ganti ke DEMO di{' '}
                  <Link to="/operator" className="font-semibold text-gold-500 underline underline-offset-4">
                    Kontrol Operator
                  </Link>
                  .
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
      <Panel title="Cara Bermain">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="font-arcade text-lg text-gold-500">{i + 1}</span>
              <div>
                <p className="font-pixel text-ink-50">{title}</p>
                <p className="text-sm text-ink-300">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}
