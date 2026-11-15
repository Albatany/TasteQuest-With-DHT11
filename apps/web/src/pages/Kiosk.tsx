import { Maximize, Minimize } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BRAND, SATISFACTION } from '@tastequest/shared'
import type { LeaderboardEntry, Source } from '@tastequest/shared'
import { AppCredits, HmifMark } from '../components/AppCredits.tsx'
import { GameDisplay } from '../components/GameDisplay.tsx'
import { StatusBadges } from '../components/Shell.tsx'
import { FACE } from '../components/sprites.ts'
import { Sprite } from '../components/ui.tsx'
import { useSource, useSourced } from '../lib/api.ts'
import { useSocketEvent } from '../lib/socket.ts'
import { HighScoreBanner, useHighScoreCelebration } from './Arena.tsx'
import { Podium } from './Leaderboard.tsx'

function useFeedbackThanks(source: Source | undefined) {
  const [level, setLevel] = useState<1 | 2 | 3 | null>(null)
  useSocketEvent<{ source: Source; level: 1 | 2 | 3 }>('feedback:submitted', (d) => {
    if (d.source !== source) return
    setLevel(d.level)
    setTimeout(() => setLevel(null), 3500)
  })
  return level
}

/** Public full-screen view for visitors: no navigation, no operator controls. */
export function Kiosk() {
  const source = useSource()
  const top = useSourced<LeaderboardEntry[]>('leaderboard', '/api/leaderboard?limit=3', source)
  const celebration = useHighScoreCelebration(source)
  const thanks = useFeedbackThanks(source)
  const [full, setFull] = useState(false)
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})

  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4 xl:gap-6 xl:p-8">
      <HighScoreBanner show={celebration} xl />
      {thanks && (
        <div role="status" className="fixed inset-0 z-50 flex animate-rise flex-col items-center justify-center gap-6 bg-ink-950/90 text-center">
          <div className="animate-pop">
            <Sprite name={FACE[thanks]} px={14} />
          </div>
          <p className="font-arcade text-2xl text-gold-500 xl:text-4xl">TERIMA KASIH!</p>
          <p className="font-pixel text-2xl text-ink-100">Penilaian “{SATISFACTION[thanks - 1].label}” sudah tercatat.</p>
        </div>
      )}

      <header className="flex flex-wrap items-center gap-4">
        <HmifMark size={56} />
        <div>
          <h1 className="font-arcade text-2xl text-gold-500 xl:text-4xl">TASTEQUEST</h1>
          <p className="font-pixel text-lg tracking-[0.3em] text-ink-100 xl:text-2xl">{BRAND.tagline}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <StatusBadges />
          <button type="button" onClick={toggleFull} className="pixel-frame-sm inline-flex size-11 cursor-pointer items-center justify-center bg-ink-800" aria-label={full ? 'Keluar layar penuh' : 'Layar penuh'}>
            {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
        </div>
      </header>

      <main className="grid flex-1 gap-4 xl:grid-cols-3 xl:gap-6">
        <section className="pixel-frame m-1 flex flex-col bg-ink-900 p-5 xl:col-span-2 xl:p-8 [--frame:var(--color-gold-700)]" aria-label="Permainan saat ini">
          <h2 className="mb-4 font-pixel text-2xl text-gold-400">ProxiRush</h2>
          <div className="flex flex-1 flex-col justify-center">
            <GameDisplay source={source} xl />
          </div>
        </section>
        <div className="flex flex-col gap-4 xl:gap-6">
          <section className="pixel-frame m-1 bg-ink-900 p-5" aria-label="Tiga besar">
            <h2 className="mb-4 font-pixel text-2xl text-gold-400">Top 3 Pemain</h2>
            {top.data?.length ? <Podium entries={top.data} xl /> : <p className="font-pixel text-lg text-ink-300">Jadilah pemain pertama!</p>}
          </section>
          <section className="pixel-frame m-1 flex-1 bg-ink-900 p-5" aria-label="Cara bermain">
            <h2 className="mb-3 font-pixel text-2xl text-gold-400">Cara Bermain</h2>
            <ol className="flex flex-col gap-3 text-lg text-ink-100">
              <li><span className="mr-2 font-arcade text-gold-500">1</span>Sentuh sensor, pilih <strong>ProxiRush</strong>.</li>
              <li><span className="mr-2 font-arcade text-gold-500">2</span>Gerakkan tangan ke jarak target.</li>
              <li><span className="mr-2 font-arcade text-gold-500">3</span><strong>Tahan</strong> sensor sentuh untuk mengunci.</li>
              <li><span className="mr-2 font-arcade text-gold-500">4</span>Habis jajan? Pilih <strong>TastePulse</strong> &amp; beri nilai!</li>
            </ol>
            <div className="mt-4 flex gap-3" aria-hidden>
              {([1, 2, 3] as const).map((l) => (
                <Sprite key={l} name={FACE[l]} px={5} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t-4 border-ink-800 pt-4 text-base xl:text-lg">
        <AppCredits />
      </footer>
    </div>
  )
}
