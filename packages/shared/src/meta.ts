// Creator credit is a fixed requirement: never derive the year from the clock.
export const CREATOR = {
  name: 'Muhammad Aziz Syah Dani',
  copyright: '© Muhammad Aziz Syah Dani 2026',
} as const

export const BRAND = {
  name: 'TasteQuest',
  tagline: 'PLAY. TASTE. RATE.',
  org: 'HMIF UNJA',
  orgFull: 'Himpunan Mahasiswa Informatika Universitas Jambi',
  event: 'FST Market Day 2026',
} as const

export const SOURCES = ['DEMO', 'LIVE'] as const
export type Source = (typeof SOURCES)[number]

export const SATISFACTION = [
  { level: 1, label: 'Kurang Puas' },
  { level: 2, label: 'Cukup Puas' },
  { level: 3, label: 'Sangat Puas' },
] as const
export type SatisfactionLevel = 1 | 2 | 3

/** "Positive feedback" is defined strictly as the Sangat Puas category. */
export const POSITIVE_LEVEL: SatisfactionLevel = 3

/** Allowed range for ProxiRush target distances (operator-configurable within it). */
export const TARGET_RANGE_CM = { min: 5, max: 40 } as const

export const DEFAULT_SETTINGS = {
  displayMode: 'DEMO' as Source,
  activeProductId: null as number | null,
  roundDurationMs: 10_000,
  targetsCm: [20, 12, 28],
  feedbackCooldownMs: 3_000,
}
