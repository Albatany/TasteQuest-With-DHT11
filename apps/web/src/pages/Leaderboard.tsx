import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { SOURCES } from '@tastequest/shared'
import type { LeaderboardEntry, Source } from '@tastequest/shared'
import { Button, cx, Empty, ErrorBox, ModeBadge, Panel, QueryState, Sprite } from '../components/ui.tsx'
import { api, useIsOperator, useSource, useSourced } from '../lib/api.ts'
import { num, seconds, wibDateTime } from '../lib/format.ts'

export const displayName = (e: Pick<LeaderboardEntry, 'nickname' | 'playerCode'>) => e.nickname || e.playerCode

const PODIUM = [
  { rank: 2, h: 'h-24 sm:h-28', tone: 'bg-ink-400' },
  { rank: 1, h: 'h-32 sm:h-40', tone: 'bg-gold-500' },
  { rank: 3, h: 'h-16 sm:h-20', tone: 'bg-ink-600' },
]

export function Podium({ entries, xl }: { entries: LeaderboardEntry[]; xl?: boolean }) {
  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Tiga besar">
      {PODIUM.map(({ rank, h, tone }) => {
        const e = entries[rank - 1]
        return (
          <li key={rank} className="flex min-w-0 flex-col items-center gap-2 text-center">
            {e ? (
              <>
                {rank === 1 && <Sprite name="trophy" px={xl ? 6 : 4} />}
                <span className={cx('w-full truncate font-pixel text-ink-50', xl ? 'text-2xl' : 'text-base')}>{displayName(e)}</span>
                <span className={cx('font-arcade text-gold-500 tabular', xl ? 'text-3xl' : 'text-lg')}>{e.totalScore}</span>
              </>
            ) : (
              <span className="font-pixel text-ink-600">—</span>
            )}
            <div className={cx('pixel-frame-sm flex w-full items-start justify-center pt-2', h, tone, '[--frame:var(--color-ink-950)]')}>
              <span className="font-arcade text-lg text-ink-950">{rank}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function NicknameCell({ entry }: { entry: LeaderboardEntry }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(entry.nickname ?? '')
  const save = useMutation({
    mutationFn: () => api(`/api/sessions/${entry.id}`, { method: 'PATCH', json: { nickname: value.trim() || null } }),
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
  if (!editing)
    return (
      <Button className="min-h-9 px-2" aria-label={`Ubah nickname ${entry.playerCode}`} onClick={() => setEditing(true)}>
        <Pencil className="size-4" aria-hidden />
      </Button>
    )
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <label className="sr-only" htmlFor={`nick-${entry.id}`}>
        Nickname untuk {entry.playerCode}
      </label>
      <input id={`nick-${entry.id}`} autoFocus maxLength={24} value={value} onChange={(e) => setValue(e.target.value)} className="min-h-9 w-32 bg-ink-950 px-2 text-ink-50 outline-2 outline-ink-700" />
      <Button type="submit" className="min-h-9 px-2" busy={save.isPending} aria-label="Simpan">
        <Check className="size-4" aria-hidden />
      </Button>
      <Button className="min-h-9 px-2" onClick={() => setEditing(false)} aria-label="Batal">
        <X className="size-4" aria-hidden />
      </Button>
      {save.isError && <ErrorBox error={save.error} />}
    </form>
  )
}

export function Leaderboard() {
  const displayMode = useSource()
  const [picked, setPicked] = useState<Source | null>(null)
  const source = picked ?? displayMode
  const isOperator = useIsOperator()
  const q = useSourced<LeaderboardEntry[]>('leaderboard', '/api/leaderboard?limit=10', source)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-arcade text-xl text-gold-500 sm:text-2xl">LEADERBOARD</h1>
        <ModeBadge source={source} />
        <div className="ml-auto flex gap-1" role="group" aria-label="Filter data">
          {SOURCES.map((s) => (
            <Button key={s} variant={s === source ? 'primary' : 'ghost'} aria-pressed={s === source} onClick={() => setPicked(s)}>
              {s}
            </Button>
          ))}
        </div>
      </div>
      <QueryState q={q} isEmpty={(d) => d.length === 0} empty={<Panel><Empty sprite="trophy" title="Belum ada skor">{source === 'LIVE' ? 'Skor dari ESP8266 akan muncul di sini.' : 'Mainkan satu game di Arena dengan perangkat simulasi.'}</Empty></Panel>}>
        {(entries) => (
          <>
            <Panel title="Podium">
              <Podium entries={entries} />
            </Panel>
            <Panel title="10 Besar">
              <div>
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Sepuluh skor tertinggi, diurutkan skor lalu waktu tercepat</caption>
                  <thead className="font-pixel text-ink-300">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Pemain</th>
                      <th className="p-2 text-right">Skor</th>
                      <th className="hidden p-2 md:table-cell">Ronde (terukur/target → skor)</th>
                      <th className="hidden p-2 text-right md:table-cell">Durasi</th>
                      <th className="hidden p-2 lg:table-cell">Selesai</th>
                      {isOperator && <th className="p-2">Nickname</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="animate-rise border-t-2 border-ink-800">
                        <td className="p-2 font-arcade text-gold-500">{e.rank}</td>
                        <td className="p-2">
                          <div className="font-pixel text-ink-50">{displayName(e)}</div>
                          {e.nickname && <div className="text-xs text-ink-300">{e.playerCode}</div>}
                          <div className="text-xs text-ink-300 md:hidden">
                            {e.rounds.map((r) => r.score).join(' + ')} · {seconds(e.durationMs)}
                          </div>
                        </td>
                        <td className="p-2 text-right font-arcade text-ink-50 tabular">{e.totalScore}</td>
                        <td className="hidden p-2 md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {e.rounds.map((r) => (
                              <span key={r.round} className="bg-ink-950/60 px-2 py-1 text-xs tabular">
                                {r.measuredCm == null ? '—' : num(r.measuredCm)}/{num(r.targetCm)} → <strong>{r.score}</strong>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="hidden p-2 text-right tabular md:table-cell">{seconds(e.durationMs)}</td>
                        <td className="hidden p-2 whitespace-nowrap text-ink-200 lg:table-cell">{wibDateTime(e.completedAt)}</td>
                        {isOperator && (
                          <td className="p-2">
                            <NicknameCell entry={e} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </QueryState>
    </div>
  )
}
