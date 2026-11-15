import type { UseQueryResult } from '@tanstack/react-query'
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Source } from '@tastequest/shared'
import { PALETTE, SPRITES } from './sprites.ts'
import type { SpriteName } from './sprites.ts'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Sprite({ name, px = 4, label, className }: { name: SpriteName; px?: number; label?: string; className?: string }) {
  const rows = SPRITES[name]
  const w = rows[0].length
  const h = rows.length
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w * px} height={h * px} shapeRendering="crispEdges" className={className} role={label ? 'img' : undefined} aria-hidden={!label} aria-label={label}>
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === '.' ? null : <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill={PALETTE[c]} />)))}
    </svg>
  )
}

export function Panel({ title, icon, action, children, className, frame }: { title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; frame?: string }) {
  return (
    <section className={cx('pixel-frame m-1 bg-ink-900 p-4 sm:p-5', className)} style={frame ? ({ '--frame': frame } as React.CSSProperties) : undefined}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-pixel text-lg font-semibold tracking-wide text-gold-400">
            {icon}
            {title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, unit, hint, icon, tone = 'text-ink-50' }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; icon?: ReactNode; tone?: string }) {
  return (
    <div className="pixel-frame m-1 flex min-w-0 flex-col gap-2 bg-ink-900 p-4">
      <div className="flex items-center gap-2 text-sm text-ink-300">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cx('font-arcade text-xl leading-tight tabular sm:text-2xl', tone)}>
        {value}
        {unit && <span className="ml-1 font-pixel text-base text-ink-300">{unit}</span>}
      </div>
      {hint && <div className="text-xs text-ink-300">{hint}</div>}
    </div>
  )
}

const BADGE = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  gold: 'bg-gold-500/15 text-gold-500',
  muted: 'bg-ink-800 text-ink-200',
} as const

export function Badge({ tone = 'muted', dot, children }: { tone?: keyof typeof BADGE; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-1 font-pixel text-xs font-semibold tracking-wider uppercase', BADGE[tone])}>
      {dot && <span className="size-2 bg-current" aria-hidden />}
      {children}
    </span>
  )
}

export const ModeBadge = ({ source }: { source?: Source }) =>
  source ? <Badge tone={source === 'DEMO' ? 'gold' : 'ok'} dot>{source === 'DEMO' ? 'DEMO MODE' : 'LIVE MODE'}</Badge> : null

export const DeviceBadge = ({ online }: { online: boolean }) => (online ? <Badge tone="ok" dot>Perangkat online</Badge> : <Badge tone="bad" dot>DEVICE OFFLINE</Badge>)

const BTN = {
  primary: 'bg-gold-500 text-ink-950 [--frame:var(--color-gold-700)] hover:bg-gold-400',
  ghost: 'bg-ink-800 text-ink-50 [--frame:var(--color-ink-600)] hover:bg-ink-700',
  danger: 'bg-bad text-ink-950 [--frame:#8f2f20] hover:brightness-110',
} as const

export function Button({ variant = 'ghost', className, busy, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={cx(
        'pixel-frame-sm m-0.5 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 px-4 py-2 font-pixel text-sm font-semibold tracking-wide transition-[background-color,transform] duration-150 select-none active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50',
        BTN[variant],
        className,
      )}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Empty({ sprite = 'bowl', title, children }: { sprite?: SpriteName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <Sprite name={sprite} px={5} className="opacity-80" />
      <p className="font-pixel text-lg text-gold-400">{title}</p>
      {children && <div className="max-w-sm text-sm text-ink-300">{children}</div>}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 bg-bad/10 p-4 text-sm text-ink-100">
      <AlertTriangle className="size-5 shrink-0 text-bad" aria-hidden />
      <span className="flex-1">{error instanceof Error ? error.message : 'Gagal memuat data'}</span>
      {onRetry && (
        <Button onClick={onRetry}>
          <RotateCcw className="size-4" aria-hidden /> Coba lagi
        </Button>
      )}
    </div>
  )
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat data">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-6 animate-pulse bg-ink-800" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  )
}

/** Uniform loading / error / empty handling for every data-backed section. */
export function QueryState<T>({ q, empty, isEmpty, children, rows }: { q: UseQueryResult<T>; empty?: ReactNode; isEmpty?: (d: T) => boolean; children: (d: T) => ReactNode; rows?: number }) {
  if (q.isPending) return <Loading rows={rows} />
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  if (empty && isEmpty?.(q.data)) return <>{empty}</>
  return <>{children(q.data)}</>
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reducedMotion() || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      setShown(Math.round(a + (value - a) * k))
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{shown}</>
}

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onClose, busy }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} className="pixel-frame m-auto w-[min(92vw,28rem)] bg-ink-900 p-6 text-ink-50 backdrop:bg-ink-950/80" aria-labelledby="confirm-title">
      <h2 id="confirm-title" className="mb-3 font-pixel text-xl text-gold-400">
        {title}
      </h2>
      <div className="mb-6 text-sm text-ink-200">{children}</div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button onClick={onClose}>Batal</Button>
        <Button variant="danger" onClick={onConfirm} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}

/** A few falling pixel squares for a new high score; skipped under reduced motion. */
export function PixelConfetti() {
  if (reducedMotion()) return null
  const colors = ['var(--color-gold-500)', 'var(--color-ok)', 'var(--color-gold-400)', 'var(--color-bad)']
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 size-3"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % 4], animation: `pixel-fall ${1.6 + (i % 5) * 0.25}s steps(24) ${(i % 7) * 0.12}s both` }}
        />
      ))}
    </div>
  )
}

export { cx }
