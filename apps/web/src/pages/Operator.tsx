import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Database, Download, KeyRound, LogOut, Package, Pencil, RotateCcw, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { SOURCES, TARGET_RANGE_CM } from '@tastequest/shared'
import type { ActivityItem, Product, Source } from '@tastequest/shared'
import { Badge, Button, ConfirmDialog, cx, Empty, ErrorBox, Panel, QueryState } from '../components/ui.tsx'
import { api, useAuth, useProducts, useSettings, useSource, useSourced } from '../lib/api.ts'
import type { AppSettings } from '../lib/api.ts'
import { describeEvent, num, wibTime } from '../lib/format.ts'

const input = 'min-h-11 w-full bg-ink-950 px-3 text-ink-50 outline-2 outline-ink-700 focus:outline-gold-500'

function Login() {
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => api('/api/auth/login', { method: 'POST', json: { password } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  })
  return (
    <Panel title="Login Operator" icon={<KeyRound className="size-5" aria-hidden />} className="mx-auto w-full max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate()
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          Password operator (dari file <code>.env</code>)
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </label>
        {login.isError && <ErrorBox error={login.error} />}
        <Button type="submit" variant="primary" busy={login.isPending}>
          Masuk
        </Button>
        <p className="text-xs text-ink-300">Sesi operator disimpan sebagai cookie httpOnly dan berakhir otomatis. Halaman kiosk publik tidak memiliki kontrol operator.</p>
      </form>
    </Panel>
  )
}

function ProductRow({ p, active, onActivate }: { p: Product; active: boolean; onActivate: () => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(p.name)
  const update = useMutation({
    mutationFn: (body: Partial<Product>) => api(`/api/products/${p.id}`, { method: 'PATCH', json: body }),
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })
  return (
    <li className="flex flex-wrap items-center gap-2 border-b-2 border-ink-800 py-2">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate({ name })
          }}
        >
          <label className="sr-only" htmlFor={`p-${p.id}`}>
            Nama produk
          </label>
          <input id={`p-${p.id}`} autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={input} />
          <Button type="submit" busy={update.isPending} aria-label="Simpan nama">
            <Check className="size-4" aria-hidden />
          </Button>
        </form>
      ) : (
        <span className={cx('flex-1 font-pixel', !p.enabled && 'text-ink-400 line-through')}>
          {p.name} {active && <Badge tone="gold">sedang dinilai</Badge>}
        </span>
      )}
      {!editing && (
        <Button aria-label={`Ubah ${p.name}`} onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden />
        </Button>
      )}
      <Button onClick={() => update.mutate({ enabled: !p.enabled })}>{p.enabled ? 'Nonaktifkan' : 'Aktifkan'}</Button>
      <Button variant={active ? 'primary' : 'ghost'} disabled={!p.enabled || active} onClick={onActivate}>
        {active ? 'Dipilih' : 'Pilih'}
      </Button>
      {update.isError && <ErrorBox error={update.error} />}
    </li>
  )
}

function Products({ settings }: { settings: AppSettings }) {
  const qc = useQueryClient()
  const products = useProducts()
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: () => api('/api/products', { method: 'POST', json: { name } }),
    onSuccess: () => {
      setName('')
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
  const activate = useMutation({ mutationFn: (activeProductId: number | null) => api('/api/settings', { method: 'PUT', json: { activeProductId } }) })
  return (
    <Panel title="Produk Makanan" icon={<Package className="size-5" aria-hidden />}>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <label className="sr-only" htmlFor="new-product">
          Nama produk baru
        </label>
        <input id="new-product" placeholder="Nama produk baru, mis. Mie Ayam" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={input} />
        <Button type="submit" variant="primary" busy={add.isPending}>
          Tambah
        </Button>
      </form>
      {add.isError && <ErrorBox error={add.error} />}
      {activate.isError && <ErrorBox error={activate.error} />}
      <QueryState q={products} isEmpty={(d) => d.length === 0} empty={<Empty title="Belum ada produk">Tambahkan menu stan agar feedback bisa dikaitkan ke produk.</Empty>}>
        {(list) => (
          <ul>
            {list.map((p) => (
              <ProductRow key={p.id} p={p} active={settings.activeProductId === p.id} onActivate={() => activate.mutate(p.id)} />
            ))}
          </ul>
        )}
      </QueryState>
      <Button className="mt-3" disabled={settings.activeProductId == null} onClick={() => activate.mutate(null)}>
        Nilai sebagai “Umum (pengalaman stan)”
      </Button>
    </Panel>
  )
}

function GameSettings({ settings }: { settings: AppSettings }) {
  const [form, setForm] = useState({ duration: settings.roundDurationMs / 1000, targets: settings.targetsCm, cooldown: settings.feedbackCooldownMs / 1000 })
  const save = useMutation({
    mutationFn: () =>
      api('/api/settings', { method: 'PUT', json: { roundDurationMs: Math.round(form.duration * 1000), targetsCm: form.targets, feedbackCooldownMs: Math.round(form.cooldown * 1000) } }),
  })
  return (
    <Panel title="Pengaturan Game & Feedback" icon={<Settings2 className="size-5" aria-hidden />}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Durasi tiap ronde (detik, 3–30)
          <input type="number" min={3} max={30} step={1} required value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} className={input} />
        </label>
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="mb-1 text-sm">
            Jarak target (cm, {TARGET_RANGE_CM.min}–{TARGET_RANGE_CM.max}; sesuaikan dengan kalibrasi sensor)
          </legend>
          {form.targets.map((t, i) => (
            <label key={i} className="flex flex-col gap-1 text-xs text-ink-300">
              Ronde {i + 1}
              <input
                type="number"
                min={TARGET_RANGE_CM.min}
                max={TARGET_RANGE_CM.max}
                step={1}
                required
                value={t}
                onChange={(e) => setForm({ ...form, targets: form.targets.map((x, j) => (j === i ? Number(e.target.value) : x)) })}
                className={input}
              />
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          Jeda antar-feedback (detik, 0–60)
          <input type="number" min={0} max={60} step={1} required value={form.cooldown} onChange={(e) => setForm({ ...form, cooldown: Number(e.target.value) })} className={input} />
        </label>
        {save.isError && <ErrorBox error={save.error} />}
        {save.isSuccess && <p className="text-sm text-ok">Tersimpan. Perangkat menerima nilai baru pada heartbeat berikutnya.</p>}
        <Button type="submit" variant="primary" busy={save.isPending}>
          Simpan pengaturan
        </Button>
      </form>
    </Panel>
  )
}

function DisplayMode({ settings }: { settings: AppSettings }) {
  const save = useMutation({ mutationFn: (displayMode: Source) => api('/api/settings', { method: 'PUT', json: { displayMode } }) })
  return (
    <Panel title="Mode Tampilan Dashboard">
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Mode tampilan">
        {SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={settings.displayMode === s}
            onClick={() => save.mutate(s)}
            className={cx('pixel-frame-sm m-0.5 flex cursor-pointer flex-col gap-1 p-4 text-left', settings.displayMode === s ? 'bg-gold-500 text-ink-950' : 'bg-ink-800 text-ink-50 hover:bg-ink-700')}
          >
            <span className="font-arcade text-sm">{s} MODE</span>
            <span className="text-xs">{s === 'DEMO' ? 'Data simulator, ditandai DEMO' : 'Hanya data ESP8266 asli'}</span>
          </button>
        ))}
      </div>
      {save.isError && <ErrorBox error={save.error} />}
      <p className="mt-3 text-xs text-ink-300">Berlaku untuk semua layar (dashboard & kiosk). Data DEMO tidak pernah tampil di mode LIVE.</p>
    </Panel>
  )
}

function DataTools() {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState<'clear' | 'reset' | null>(null)
  const clear = useMutation({ mutationFn: () => api<{ deleted: Record<string, number> }>('/api/operator/clear-demo', { method: 'POST' }), onSuccess: () => setConfirm(null) })
  const reset = useMutation({ mutationFn: () => api<{ aborted: number }>('/api/operator/reset-game', { method: 'POST' }), onSuccess: () => setConfirm(null) })
  const status = useQuery({ queryKey: ['operator-status'], queryFn: () => api<Record<string, unknown> & { counts: Record<string, number> }>('/api/operator/status'), refetchInterval: 15000 })
  const link = 'pixel-frame-sm m-0.5 inline-flex min-h-11 items-center gap-2 bg-ink-800 px-4 font-pixel text-sm text-ink-50 hover:bg-ink-700'
  return (
    <Panel title="Data & Sesi" icon={<Database className="size-5" aria-hidden />}>
      <div className="flex flex-wrap gap-2">
        <a className={link} href="/api/export/feedback.csv" download>
          <Download className="size-4" aria-hidden /> Feedback CSV
        </a>
        <a className={link} href="/api/export/games.csv" download>
          <Download className="size-4" aria-hidden /> Game CSV
        </a>
        <a className={link} href="/api/export/backup.db" download>
          <Database className="size-4" aria-hidden /> Backup SQLite
        </a>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => setConfirm('reset')}>
          <RotateCcw className="size-4" aria-hidden /> Reset sesi game
        </Button>
        <Button variant="danger" onClick={() => setConfirm('clear')}>
          <Trash2 className="size-4" aria-hidden /> Hapus data DEMO
        </Button>
      </div>
      {clear.isSuccess && (
        <p className="mt-3 text-sm text-ok">
          Data DEMO dihapus: {clear.data.deleted.sessions} sesi, {clear.data.deleted.feedback} feedback, {clear.data.deleted.events} event. Data LIVE tidak tersentuh.
        </p>
      )}
      {reset.isSuccess && <p className="mt-3 text-sm text-ok">Sesi direset ({reset.data.aborted} sesi aktif dibatalkan). Perangkat kembali ke layar awal pada heartbeat berikutnya.</p>}
      <ConfirmDialog
        open={confirm === 'clear'}
        title="Hapus semua data DEMO?"
        confirmLabel="Hapus data DEMO"
        busy={clear.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => clear.mutate(undefined, { onSuccess: () => qc.invalidateQueries() })}
      >
        Semua sesi game, feedback, event dan telemetri bertanda DEMO akan dihapus permanen. Data LIVE dari ESP8266 tetap aman.
        {clear.isError && <ErrorBox error={clear.error} />}
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'reset'} title="Reset sesi game?" confirmLabel="Reset" busy={reset.isPending} onClose={() => setConfirm(null)} onConfirm={() => reset.mutate()}>
        Game yang sedang berjalan dibatalkan dan perangkat kembali ke layar awal. Skor yang sudah selesai tidak dihapus.
        {reset.isError && <ErrorBox error={reset.error} />}
      </ConfirmDialog>
      <h3 className="mt-6 mb-2 font-pixel text-gold-400">Status konfigurasi</h3>
      <QueryState q={status}>
        {(s) => (
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink-300">Database</dt>
            <dd className="text-right break-all">{String(s.dbPath)}</dd>
            <dt className="text-ink-300">Ukuran DB</dt>
            <dd className="text-right">{num(Number(s.dbSizeBytes) / 1024)} KB</dd>
            <dt className="text-ink-300">Host:port</dt>
            <dd className="text-right">
              {String(s.host)}:{String(s.port)}
            </dd>
            <dt className="text-ink-300">Token perangkat</dt>
            <dd className="text-right">{s.deviceTokenConfigured ? 'terpasang' : 'BELUM'}</dd>
            <dt className="text-ink-300">Batas offline</dt>
            <dd className="text-right">{Number(s.deviceOfflineMs) / 1000} dtk</dd>
            <dt className="text-ink-300">Isi data</dt>
            <dd className="text-right">
              {s.counts.sessions} sesi · {s.counts.feedback} feedback · {s.counts.events} event
            </dd>
            <dt className="text-ink-300">Node.js</dt>
            <dd className="text-right">{String(s.node)}</dd>
          </dl>
        )}
      </QueryState>
      <p className="mt-3 text-xs text-ink-300">Pin GPIO tidak bisa diubah dari browser. Atur di firmware/include/config.h lalu flash ulang ESP8266.</p>
    </Panel>
  )
}

function EventLog() {
  const source = useSource()
  const q = useSourced<ActivityItem[]>('events', '/api/events?limit=30', source)
  return (
    <Panel title={`Log Event (${source ?? '…'})`}>
      <QueryState q={q} isEmpty={(d) => d.length === 0} empty={<Empty title="Log kosong" />}>
        {(list) => (
          <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto text-sm">
            {list.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b-2 border-ink-800 py-1.5">
                <span>
                  <span className="mr-2 font-pixel text-xs text-ink-300">{e.deviceId}</span>
                  {describeEvent(e)}
                </span>
                <time className="text-xs text-ink-300" dateTime={e.occurredAt}>
                  {wibTime(e.occurredAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Panel>
  )
}

export function Operator() {
  const qc = useQueryClient()
  const auth = useAuth()
  const settings = useSettings()
  const logout = useMutation({ mutationFn: () => api('/api/auth/logout', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }) })

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-arcade text-xl text-gold-500 sm:text-2xl">KONTROL OPERATOR</h1>
        {auth.data?.operator && (
          <Button className="ml-auto" onClick={() => logout.mutate()} busy={logout.isPending}>
            <LogOut className="size-4" aria-hidden /> Keluar
          </Button>
        )}
      </div>
      <QueryState q={auth}>
        {(a) =>
          !a.operator ? (
            <Login />
          ) : (
            <QueryState q={settings}>
              {(s) => (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-4">
                    <DisplayMode settings={s} />
                    <Products settings={s} />
                    <GameSettings key={`${s.roundDurationMs}-${s.targetsCm.join()}-${s.feedbackCooldownMs}`} settings={s} />
                  </div>
                  <div className="flex flex-col gap-4">
                    <DataTools />
                    <EventLog />
                  </div>
                </div>
              )}
            </QueryState>
          )
        }
      </QueryState>
    </div>
  )
}
