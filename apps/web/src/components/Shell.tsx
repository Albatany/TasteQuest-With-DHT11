import { Cpu, Gamepad2, Info, LayoutDashboard, Menu, MessageSquareHeart, MonitorPlay, ShieldCheck, Trophy, Wifi, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { BRAND, CREATOR } from '@tastequest/shared'
import { useDevices, useSource } from '../lib/api.ts'
import { useSocketConnected } from '../lib/socket.ts'
import { AppCredits, HmifMark } from './AppCredits.tsx'
import { Badge, cx, DeviceBadge, ModeBadge, Sprite } from './ui.tsx'

export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/arena', label: 'ProxiRush Arena', icon: Gamepad2 },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/feedback', label: 'Feedback Pelanggan', icon: MessageSquareHeart },
  { to: '/device', label: 'Monitor Perangkat', icon: Cpu },
  { to: '/operator', label: 'Kontrol Operator', icon: ShieldCheck },
  { to: '/kiosk', label: 'Mode Kiosk', icon: MonitorPlay },
  { to: '/about', label: 'Tentang', icon: Info },
]

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Sprite name="bowl" px={compact ? 2 : 3} />
      <div className="leading-tight">
        <div className={cx('font-arcade text-gold-500', compact ? 'text-xs' : 'text-sm')}>TASTEQUEST</div>
        <div className="font-pixel text-xs tracking-widest text-ink-300">{BRAND.tagline}</div>
      </div>
    </div>
  )
}

export function StatusBadges() {
  const source = useSource()
  const online = useDevices(source).data?.some((d) => d.online) ?? false
  const connected = useSocketConnected()
  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <ModeBadge source={source} />
      <DeviceBadge online={online} />
      <Badge tone={connected ? 'muted' : 'bad'}>
        {connected ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
        {connected ? 'Server terhubung' : 'Server terputus'}
      </Badge>
    </div>
  )
}

function BootScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1700)
    const skip = () => onDone()
    window.addEventListener('keydown', skip)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', skip)
    }
  }, [onDone])
  return (
    <div role="status" onClick={onDone} className="scanlines fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 bg-ink-950 px-4 text-center">
      <div className="animate-pop">
        <Sprite name="bowl" px={8} />
      </div>
      <h1 className="font-arcade text-2xl text-gold-500 sm:text-4xl">TASTEQUEST</h1>
      <p className="font-pixel text-lg tracking-[0.3em] text-ink-200">{BRAND.tagline}</p>
      <div className="pixel-frame-sm h-4 w-64 max-w-full bg-ink-900">
        <div className="h-full bg-gold-500" style={{ animation: 'boot-fill 1.4s steps(16) both' }} />
      </div>
      <p className="font-pixel text-sm text-ink-300">
        {BRAND.org} × {BRAND.event} <span className="animate-blink">_</span>
      </p>
      <p className="absolute bottom-6 text-sm text-ink-200">{CREATOR.copyright}</p>
    </div>
  )
}

export function Shell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [booting, setBooting] = useState(() => {
    try {
      return !sessionStorage.getItem('tq-booted')
    } catch {
      return false
    }
  })
  const location = useLocation()
  useEffect(() => setMenuOpen(false), [location.pathname])
  const finishBoot = () => {
    try {
      sessionStorage.setItem('tq-booted', '1')
    } catch {
      /* private mode: boot shows again next time, harmless */
    }
    setBooting(false)
  }

  const nav = (
    <nav aria-label="Navigasi utama">
      <ul className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx('flex min-h-11 items-center gap-3 px-3 py-2 font-pixel text-base transition-colors duration-150', isActive ? 'bg-gold-500 text-ink-950' : 'text-ink-200 hover:bg-ink-800 hover:text-ink-50')
              }
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )

  return (
    <div className="flex min-h-dvh">
      {booting && <BootScreen onDone={finishBoot} />}
      <a href="#main" className="sr-only z-50 bg-gold-500 p-2 text-ink-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Lewati ke konten
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r-4 border-ink-800 bg-ink-950/90 p-4 lg:flex">
        <Wordmark />
        {nav}
        <div className="mt-auto flex items-center gap-2 text-xs text-ink-300">
          <HmifMark size={32} />
          <span>
            {BRAND.orgFull}
            <br />
            {BRAND.event}
          </span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b-4 border-ink-800 bg-ink-950/95 px-4 py-3 sm:px-6">
          <button
            type="button"
            className="pixel-frame-sm inline-flex size-11 cursor-pointer items-center justify-center bg-ink-800 lg:hidden"
            aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="lg:hidden">
            <Wordmark compact />
          </div>
          <div className="ml-auto">
            <StatusBadges />
          </div>
        </header>
        {menuOpen && <div className="border-b-4 border-ink-800 bg-ink-950 p-4 lg:hidden">{nav}</div>}
        <main id="main" key={location.pathname} className="flex-1 animate-rise px-4 py-6 sm:px-6">
          <Outlet />
        </main>
        <footer className="border-t-4 border-ink-800 bg-ink-950/95 px-4 py-4 sm:px-6">
          <AppCredits />
        </footer>
      </div>
    </div>
  )
}
