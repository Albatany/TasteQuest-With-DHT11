import { useState } from 'react'
import { BRAND, CREATOR } from '@tastequest/shared'
import { cx } from './ui.tsx'

/** Required creator credit. Always visible, never behind hover; text comes from the central CREATOR constant. */
export function AppCredits({ className }: { className?: string }) {
  return (
    <div data-testid="app-credits" className={cx('flex flex-col items-center gap-1 text-center text-sm sm:flex-row sm:justify-between sm:text-left', className)}>
      <span className="font-pixel tracking-wide text-ink-200">
        {BRAND.name} — {BRAND.org}
      </span>
      <span className="font-semibold text-ink-100">{CREATOR.copyright}</span>
    </div>
  )
}

/**
 * HMIF UNJA mark. Drop the official logo at apps/web/public/brand/hmif-logo.png
 * (only with HMIF's permission); until then a text badge is shown.
 */
export function HmifMark({ size = 40 }: { size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <span className="pixel-frame-sm inline-flex shrink-0 items-center justify-center bg-ink-800 font-pixel text-xs font-semibold text-gold-500" style={{ width: size, height: size }} aria-label="HMIF UNJA">
        HMIF
      </span>
    )
  return <img src="/brand/hmif-logo.png" alt="Logo HMIF UNJA" width={size} height={size} className="shrink-0 object-contain" onError={() => setFailed(true)} />
}
