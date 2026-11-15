import { useMutation } from '@tanstack/react-query'
import { Download, Info } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SATISFACTION } from '@tastequest/shared'
import type { FeedbackStats } from '@tastequest/shared'
import { FACE } from '../components/sprites.ts'
import { CountUp, Empty, ErrorBox, ModeBadge, Panel, QueryState, Sprite, Stat } from '../components/ui.tsx'
import { api, useIsOperator, useProducts, useSettings, useSource, useSourced } from '../lib/api.ts'
import { levelLabel, num, wibHm, wibTime } from '../lib/format.ts'
import { VirtualDevice } from '../sim/Simulator.tsx'
import { CHART } from './Overview.tsx'

const LEVEL_COLOR = { 1: 'var(--color-bad)', 2: 'var(--color-warn)', 3: 'var(--color-ok)' } as const
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0)

function ActiveProduct() {
  const isOperator = useIsOperator()
  const settings = useSettings()
  const products = useProducts()
  const save = useMutation({ mutationFn: (activeProductId: number | null) => api('/api/settings', { method: 'PUT', json: { activeProductId } }) })
  const active = products.data?.find((p) => p.id === settings.data?.activeProductId)
  return (
    <Panel title="Produk yang sedang dinilai">
      {isOperator ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="active-product" className="text-sm text-ink-300">
            Feedback berikutnya dari perangkat akan dikaitkan dengan produk ini.
          </label>
          <select
            id="active-product"
            className="min-h-11 bg-ink-950 px-3 text-ink-50 outline-2 outline-ink-700"
            value={settings.data?.activeProductId ?? ''}
            disabled={save.isPending}
            onChange={(e) => save.mutate(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Umum (pengalaman stan) —</option>
            {products.data?.filter((p) => p.enabled).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {save.isError && <ErrorBox error={save.error} />}
        </div>
      ) : (
        <p className="font-pixel text-lg text-ink-50">{active?.name ?? 'Umum (pengalaman stan)'}</p>
      )}
    </Panel>
  )
}

export function Feedback() {
  const source = useSource()
  const isOperator = useIsOperator()
  const q = useSourced<FeedbackStats>('feedback-stats', '/api/feedback/stats', source)

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-arcade text-xl text-gold-500 sm:text-2xl">TASTEPULSE</h1>
        <ModeBadge source={source} />
        {isOperator && (
          <a href="/api/export/feedback.csv" download className="pixel-frame-sm m-0.5 ml-auto inline-flex min-h-11 items-center gap-2 bg-ink-800 px-4 font-pixel text-sm text-ink-50 hover:bg-ink-700">
            <Download className="size-4" aria-hidden /> Ekspor CSV
          </a>
        )}
      </div>

      <QueryState q={q} rows={4} isEmpty={(d) => d.total === 0} empty={<Panel><Empty title="Belum ada feedback">{source === 'DEMO' ? 'Pilih mode TastePulse di perangkat simulasi untuk mengirim penilaian.' : 'Penilaian dari pembeli akan muncul di sini secara real-time.'}</Empty></Panel>}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Stat label="Total respons" value={<CountUp value={d.total} />} />
              <Stat label="Feedback positif" value={num(d.positivePct)} unit="%" tone="text-ok" hint="“Sangat Puas” ÷ total respons" />
              {SATISFACTION.map((s) => (
                <Stat key={s.level} label={s.label} icon={<Sprite name={FACE[s.level]} px={2} />} value={<CountUp value={d.counts[s.level]} />} hint={`${num(pct(d.counts[s.level], d.total))}% dari respons`} />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Distribusi Kepuasan">
                <ul className="flex flex-col gap-3">
                  {SATISFACTION.map((s) => (
                    <li key={s.level} className="flex items-center gap-3">
                      <Sprite name={FACE[s.level]} px={3} />
                      <div className="flex-1">
                        <div className="mb-1 flex justify-between text-sm">
                          <span>{s.label}</span>
                          <span className="tabular">
                            {d.counts[s.level]} · {num(pct(d.counts[s.level], d.total))}%
                          </span>
                        </div>
                        <div className="h-4 bg-ink-950">
                          <div className="h-full transition-[width] duration-500" style={{ width: `${pct(d.counts[s.level], d.total)}%`, background: LEVEL_COLOR[s.level] }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Feedback per Produk">
                <div style={{ height: Math.max(160, d.byProduct.length * 44 + 60) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.byProduct.map((p) => ({ name: p.name, l1: p.counts[1], l2: p.counts[2], l3: p.counts[3] }))} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid stroke={CHART.grid} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke={CHART.axis} fontSize={12} />
                      <YAxis type="category" dataKey="name" width={130} stroke={CHART.axis} fontSize={12} />
                      <Tooltip contentStyle={CHART.tooltip} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} />
                      <Legend itemSorter="dataKey" />
                      <Bar dataKey="l1" name="Kurang Puas" stackId="a" fill={LEVEL_COLOR[1]} isAnimationActive={false} />
                      <Bar dataKey="l2" name="Cukup Puas" stackId="a" fill={LEVEL_COLOR[2]} isAnimationActive={false} />
                      <Bar dataKey="l3" name="Sangat Puas" stackId="a" fill={LEVEL_COLOR[3]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 grid gap-1 text-xs text-ink-300">
                  {d.byProduct.map((p) => (
                    <li key={p.productId ?? 'general'}>
                      {p.name}: {p.total} respons, positif {num(p.positivePct)}%
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <Panel title="Tren Respons (per 15 menit)" className="lg:col-span-3">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.timeline.map((t) => ({ t: wibHm(t.bucket * 1000), l1: t.counts[1], l2: t.counts[2], l3: t.counts[3] }))}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="t" stroke={CHART.axis} fontSize={12} />
                      <YAxis allowDecimals={false} stroke={CHART.axis} fontSize={12} width={32} />
                      <Tooltip contentStyle={CHART.tooltip} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} labelFormatter={(l) => `${l} WIB`} />
                      <Legend itemSorter="dataKey" />
                      <Bar dataKey="l1" name="Kurang Puas" stackId="a" fill={LEVEL_COLOR[1]} isAnimationActive={false} />
                      <Bar dataKey="l2" name="Cukup Puas" stackId="a" fill={LEVEL_COLOR[2]} isAnimationActive={false} />
                      <Bar dataKey="l3" name="Sangat Puas" stackId="a" fill={LEVEL_COLOR[3]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Feedback Terbaru" className="lg:col-span-2">
                <ul className="flex flex-col gap-2" aria-live="polite">
                  {d.recent.map((f) => (
                    <li key={f.id} className="flex animate-rise items-center gap-3 bg-ink-950/50 px-3 py-2 text-sm">
                      <Sprite name={FACE[f.level]} px={2} />
                      <span className="flex-1">
                        {levelLabel(f.level)}
                        <span className="block text-xs text-ink-300">{f.productName ?? 'Umum (pengalaman stan)'}</span>
                      </span>
                      <time className="text-xs text-ink-300" dateTime={f.createdAt}>
                        {wibTime(f.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </>
        )}
      </QueryState>

      <div className="grid gap-4 lg:grid-cols-2">
        <ActiveProduct />
        <Panel title="Cara membaca statistik" icon={<Info className="size-5" aria-hidden />}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-200">
            <li>“Feedback positif” = jumlah respons <strong>Sangat Puas</strong> dibagi seluruh respons yang masuk.</li>
            <li>Angka ini hanya mewakili pengunjung yang memilih memberi penilaian, bukan seluruh pembeli.</li>
            <li>Sistem tidak memverifikasi transaksi pembelian. Satu orang bisa menilai lebih dari sekali (dibatasi jeda antar-penilaian).</li>
            <li>Waktu ditampilkan dalam WIB (Asia/Jakarta).</li>
          </ul>
        </Panel>
      </div>

      {source === 'DEMO' && <VirtualDevice />}
    </div>
  )
}
