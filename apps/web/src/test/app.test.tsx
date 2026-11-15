import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CREATOR } from '@tastequest/shared'
import type { FeedbackStats, LeaderboardEntry } from '@tastequest/shared'
import { AppRoutes } from '../App.tsx'
import { SPRITES } from '../components/sprites.ts'
import { SimulatorProvider } from '../sim/Simulator.tsx'

vi.mock('socket.io-client', () => ({
  io: () => ({ connected: true, on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}))

const emptyOverview = { sessions: 0, feedbackTotal: 0, highScore: null, positivePct: null, activity: [], recent: [] }
const emptyStats: FeedbackStats = { total: 0, counts: { 1: 0, 2: 0, 3: 0 }, positivePct: null, byProduct: [], timeline: [], recent: [] }
const entry = (rank: number, code: string, total: number, nickname: string | null = null): LeaderboardEntry => ({
  rank,
  id: rank,
  playerCode: code,
  nickname,
  totalScore: total,
  durationMs: 31_500,
  completedAt: '2026-11-20T03:00:00.000Z',
  rounds: [
    { round: 1, targetCm: 20, measuredCm: 20, score: 100 },
    { round: 2, targetCm: 12, measuredCm: 14, score: 80 },
    { round: 3, targetCm: 28, measuredCm: null, score: 0 },
  ],
})

let api: Record<string, unknown>
function mockApi(overrides: Record<string, unknown> = {}, mode: 'DEMO' | 'LIVE' = 'DEMO') {
  api = {
    '/api/settings': { displayMode: mode, activeProductId: null, roundDurationMs: 10000, targetsCm: [20, 12, 28], feedbackCooldownMs: 3000, resetSeq: 0 },
    '/api/auth/me': { operator: false },
    '/api/devices': [],
    '/api/live': [],
    '/api/products': [],
    '/api/events': [],
    '/api/overview': emptyOverview,
    '/api/leaderboard': [],
    '/api/feedback/stats': emptyStats,
    ...overrides,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = url.split('?')[0]
      if (!(path in api)) return new Response(JSON.stringify({ error: 'not mocked' }), { status: 404 })
      return new Response(JSON.stringify(api[path]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <SimulatorProvider>
          <AppRoutes />
        </SimulatorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  sessionStorage.setItem('tq-booted', '1') // skip boot animation
  mockApi()
})

describe('creator credit', () => {
  it('is visible in the dashboard footer', async () => {
    renderAt('/')
    expect(await screen.findByTestId('app-credits')).toHaveTextContent(CREATOR.copyright)
    expect(CREATOR.copyright).toBe('© Muhammad Aziz Syah Dani 2026')
  })

  it('is visible in kiosk mode, which has no operator navigation', async () => {
    renderAt('/kiosk')
    expect(await screen.findByTestId('app-credits')).toHaveTextContent('© Muhammad Aziz Syah Dani 2026')
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getByText('PLAY. TASTE. RATE.')).toBeInTheDocument()
  })

  it('is on the About page with the developer line', async () => {
    renderAt('/about')
    expect(await screen.findByText(`Developed by ${CREATOR.name}`)).toBeInTheDocument()
  })
})

describe('navigation and modes', () => {
  it('links every dashboard route', async () => {
    renderAt('/')
    const nav = await screen.findAllByRole('navigation', { name: 'Navigasi utama' })
    const labels = within(nav[0]).getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Overview', 'ProxiRush Arena', 'Leaderboard', 'Feedback Pelanggan', 'Monitor Perangkat', 'Kontrol Operator', 'Mode Kiosk', 'Tentang'])
  })

  it('shows DEMO MODE and an offline device in demo', async () => {
    renderAt('/')
    expect((await screen.findAllByText('DEMO MODE')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('DEVICE OFFLINE').length).toBeGreaterThan(0)
  })

  it('shows LIVE MODE and never offers the simulator in live mode', async () => {
    mockApi({}, 'LIVE')
    renderAt('/arena')
    expect((await screen.findAllByText('LIVE MODE')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Perangkat Fisik (LIVE)')).toBeInTheDocument()
    expect(screen.queryByText('Perangkat Simulasi')).toBeNull()
  })

  it('locks the demo simulator behind operator login', async () => {
    renderAt('/arena')
    expect(await screen.findByText('Perangkat Simulasi')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Login operator' })).toBeInTheDocument()
  })
})

describe('data views', () => {
  it('renders designed empty states instead of fake charts', async () => {
    renderAt('/')
    expect(await screen.findByText('Belum ada aktivitas')).toBeInTheDocument()
    renderAt('/leaderboard')
    expect(await screen.findByText('Belum ada skor')).toBeInTheDocument()
  })

  it('renders the leaderboard podium and table', async () => {
    mockApi({ '/api/leaderboard': [entry(1, 'DEMO-002', 290, 'Budi'), entry(2, 'DEMO-001', 180)] })
    renderAt('/leaderboard')
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Budi')).toBeInTheDocument()
    expect(within(table).getByText('290')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Tiga besar' })).toHaveTextContent('Budi')
  })

  it('renders feedback analytics with the positive-feedback definition', async () => {
    mockApi({
      '/api/feedback/stats': {
        total: 4,
        counts: { 1: 1, 2: 1, 3: 2 },
        positivePct: 50,
        byProduct: [{ productId: 1, name: 'Mie Ayam', total: 4, counts: { 1: 1, 2: 1, 3: 2 }, positivePct: 50 }],
        timeline: [{ bucket: 1795000000, counts: { 1: 1, 2: 1, 3: 2 } }],
        recent: [{ id: 1, level: 3, productName: 'Mie Ayam', createdAt: '2026-11-20T03:00:00.000Z' }],
      } satisfies FeedbackStats,
    })
    renderAt('/feedback')
    expect(await screen.findByText('Mie Ayam: 4 respons, positif 50%')).toBeInTheDocument()
    expect(screen.getByText('Total respons')).toBeInTheDocument()
    expect(screen.getByText(/bukan seluruh pembeli/)).toBeInTheDocument()
    expect(screen.getByText('10.00.00 WIB')).toBeInTheDocument() // 03:00 UTC = 10:00 WIB (UTC+7)
  })
})

describe('pixel sprites', () => {
  it('are rectangular and use only palette characters', () => {
    for (const [name, rows] of Object.entries(SPRITES)) {
      expect(new Set(rows.map((r) => r.length)).size, name).toBe(1)
      expect(rows.join(''), name).toMatch(/^[.kbgcwtyr]+$/)
    }
  })
})
