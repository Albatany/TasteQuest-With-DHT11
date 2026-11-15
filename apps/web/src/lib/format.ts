import type { ActivityItem } from '@tastequest/shared'
import { SATISFACTION } from '@tastequest/shared'

const TZ = 'Asia/Jakarta'
const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const hmFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

export const wibTime = (t: string | number) => `${timeFmt.format(new Date(t))} WIB`
export const wibDateTime = (t: string | number) => `${dateTimeFmt.format(new Date(t))} WIB`
export const wibHm = (t: string | number) => hmFmt.format(new Date(t))

export function ago(t: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(t).getTime()) / 1000))
  if (s < 60) return `${s} dtk lalu`
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`
  return `${Math.floor(s / 3600)} jam lalu`
}

export const num = (n: number | null | undefined, digits = 1) => (n == null ? '—' : n.toLocaleString('id-ID', { maximumFractionDigits: digits }))
export const seconds = (ms: number) => `${(ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk`
export const levelLabel = (level: number) => SATISFACTION[level - 1]?.label ?? '—'

export const PHASE_LABEL: Record<string, string> = {
  IDLE: 'Menunggu pemain',
  MODE_SELECTION: 'Memilih mode',
  GAME_READY: 'Siap bermain',
  COUNTDOWN: 'Hitung mundur',
  ROUND_ACTIVE: 'Ronde berlangsung',
  ROUND_RESULT: 'Hasil ronde',
  GAME_RESULT: 'Hasil akhir',
  RESULT_SUBMISSION: 'Mengirim skor',
  GAME_COMPLETE: 'Permainan selesai',
  FEEDBACK_SELECT: 'TastePulse: memilih',
  FEEDBACK_THANKS: 'TastePulse: terima kasih',
  ERROR: 'Gangguan sensor',
}

export function describeEvent(e: ActivityItem): string {
  const p = e.payload as Record<string, unknown>
  switch (e.type) {
    case 'game_started':
      return 'Permainan ProxiRush dimulai'
    case 'round_completed':
      return `Ronde ${p.round} selesai — target ${num(p.targetCm as number)} cm, terukur ${p.measuredCm == null ? 'tidak terkunci' : `${num(p.measuredCm as number)} cm`}`
    case 'game_completed':
      return 'Permainan ProxiRush selesai'
    case 'feedback_submitted':
      return `Feedback: ${levelLabel(p.level as number)}`
    case 'device_error':
      return `Error perangkat: ${p.message}`
    case 'device_online':
      return 'Perangkat terhubung'
    case 'device_offline':
      return 'Perangkat terputus (heartbeat hilang)'
    case 'game_reset':
      return 'Operator mereset sesi game'
    default:
      return e.type
  }
}
