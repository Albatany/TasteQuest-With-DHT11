// End-to-end smoke test: real server + real SQLite + real browser, DEMO simulator.
// Run: npm run build && npm run test:e2e
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const PORT = 3199
const BASE = `http://localhost:${PORT}`
const PASSWORD = 'e2e-operator-pass'
const COPYRIGHT = '© Muhammad Aziz Syah Dani 2026'
const SHOTS = 'test-results/screens'
const dir = mkdtempSync(join(tmpdir(), 'tq-e2e-'))
const DB = join(dir, 'e2e.db')
let server: ChildProcess

async function startServer() {
  server = spawn('node_modules/.bin/tsx', ['apps/server/src/index.ts'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_PATH: DB, OPERATOR_PASSWORD: PASSWORD, DEVICE_TOKEN: 'e2e-device-token-123456', APP_MODE: 'DEMO', DEVICE_OFFLINE_MS: '4000' },
    stdio: 'inherit',
  })
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('server did not start')
}
const stopServer = () => new Promise<void>((r) => (server.once('exit', () => r()), server.kill('SIGTERM')))

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  await startServer()
})
test.afterAll(async () => {
  await stopServer()
  rmSync(dir, { recursive: true, force: true })
})

const pad = (p: Page) => p.getByRole('button', { name: /Sensor sentuh TTP223/ })
async function tap(p: Page) {
  await pad(p).hover()
  await p.mouse.down()
  await p.waitForTimeout(150)
  await p.mouse.up()
  await p.waitForTimeout(120)
}
async function hold(p: Page) {
  await pad(p).hover()
  await p.mouse.down()
  await p.waitForTimeout(1350)
  await p.mouse.up()
  await p.waitForTimeout(120)
}
const oled = (p: Page) => p.getByLabel('Layar OLED simulasi')
const scoreRound = (m: number | null, t: number) => (m == null ? 0 : Math.min(100, Math.max(0, Math.round(100 - Math.abs(m - t) * 10))))

test('demo game, feedback, kiosk, offline status and persistence', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const external: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.push(r.url())
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  // 1. Dashboard + boot screen + credit
  await page.goto(BASE)
  await expect(page.getByRole('status').getByText('TASTEQUEST')).toBeVisible()
  await page.keyboard.press('Escape') // skip boot animation
  await expect(page.getByTestId('app-credits')).toContainText(COPYRIGHT)
  await expect(page.getByText('DEMO MODE').first()).toBeVisible()
  await expect(page.getByText('Belum ada aktivitas')).toBeVisible() // designed empty state
  await page.screenshot({ path: `${SHOTS}/01-overview-empty.png`, fullPage: true })

  // 2. Operator login + product
  await page.getByRole('link', { name: 'Kontrol Operator' }).click()
  await page.getByLabel(/Password operator/).fill(PASSWORD)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await page.getByLabel('Nama produk baru').fill('Mie Ayam')
  await page.getByRole('button', { name: 'Tambah' }).click()
  await page.getByRole('button', { name: 'Pilih', exact: true }).click()
  await expect(page.getByText('sedang dinilai')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/02-operator.png`, fullPage: true })

  // 3. Power on the simulated ESP8266
  await page.getByRole('link', { name: 'ProxiRush Arena' }).click()
  await page.getByRole('button', { name: 'Nyalakan' }).click()
  await expect(oled(page)).toContainText('TASTEQUEST')
  await expect(page.getByText('Perangkat online').first()).toBeVisible({ timeout: 10_000 })

  // 4. Play three rounds: tap -> menu, hold -> ProxiRush, hold -> start
  const slider = page.getByRole('slider')
  await tap(page)
  await expect(oled(page)).toContainText('PILIH MODE')
  await hold(page)
  await expect(oled(page)).toContainText('PROXIRUSH')
  await hold(page)
  for (const target of [20, 12, 28]) {
    await slider.fill(String(target))
    await expect(oled(page)).toContainText('Tahan = KUNCI', { timeout: 10_000 })
    if (target === 20) await page.screenshot({ path: `${SHOTS}/03-arena-round.png`, fullPage: true })
    await hold(page)
    await expect(oled(page)).toContainText('Skor:')
  }
  await expect(oled(page)).toContainText('SELESAI!', { timeout: 15_000 })
  await expect(oled(page)).toContainText('DEMO-001')

  // 5. Score check against the server's stored rounds
  const board = await (await page.request.get(`${BASE}/api/leaderboard?source=DEMO`)).json()
  expect(board).toHaveLength(1)
  for (const r of board[0].rounds) expect(r.score).toBe(scoreRound(r.measuredCm, r.targetCm))
  expect(board[0].totalScore).toBe(board[0].rounds.reduce((a: number, r: { score: number }) => a + r.score, 0))
  expect(board[0].totalScore).toBeGreaterThanOrEqual(290)
  await page.getByRole('link', { name: 'Leaderboard' }).click()
  await expect(page.getByRole('table')).toContainText('DEMO-001')
  await page.screenshot({ path: `${SHOTS}/04-leaderboard.png`, fullPage: true })

  // 6. Feedback via the same simulated device (wait for it to return to IDLE)
  await page.getByRole('link', { name: 'Feedback Pelanggan' }).click()
  await expect(oled(page)).toContainText('Sentuh utk mulai', { timeout: 15_000 })
  await tap(page) // menu
  await tap(page) // -> TastePulse
  await hold(page)
  await expect(oled(page)).toContainText('NILAI MAKANAN')
  await hold(page) // nothing selected yet: must be ignored
  await expect(oled(page)).toContainText('NILAI MAKANAN')
  await tap(page)
  await tap(page)
  await tap(page) // Sangat Puas
  await hold(page)
  await expect(oled(page)).toContainText('TERIMA KASIH')
  await expect(page.getByText('Total respons', { exact: true })).toBeVisible()
  await expect(page.getByText('Mie Ayam: 1 respons, positif 100%')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/05-feedback.png`, fullPage: true })

  // 7. Kiosk (public: no navigation, credit visible) at 1920x1080
  const kioskCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const kiosk = await kioskCtx.newPage()
  await kiosk.goto(`${BASE}/kiosk`)
  await expect(kiosk.getByTestId('app-credits')).toContainText(COPYRIGHT)
  await expect(kiosk.getByText('PLAY. TASTE. RATE.')).toBeVisible()
  await expect(kiosk.getByLabel('Tiga besar').first()).toContainText('DEMO-001')
  await expect(kiosk.getByRole('link', { name: 'Kontrol Operator' })).toHaveCount(0)
  await kiosk.screenshot({ path: `${SHOTS}/06-kiosk-1080p.png` })
  // Unauthenticated visitor cannot mutate anything
  expect((await kiosk.request.post(`${BASE}/api/products`, { data: { name: 'X' } })).status()).toBe(401)
  expect((await kiosk.request.post(`${BASE}/api/operator/clear-demo`)).status()).toBe(401)
  await kioskCtx.close()

  // 8. Mobile layout has no horizontal page scroll
  const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 800 } })
  const mobile = await mobileCtx.newPage()
  for (const path of ['/', '/leaderboard', '/feedback', '/device', '/about']) {
    await mobile.goto(BASE + path)
    await mobile.keyboard.press('Escape')
    await mobile.waitForTimeout(400)
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0)
  }
  await mobile.goto(BASE + '/leaderboard')
  await mobile.screenshot({ path: `${SHOTS}/07-mobile-leaderboard.png`, fullPage: true })
  await mobileCtx.close()

  // 9. Simulated disconnect -> DEVICE OFFLINE (no invented data)
  await page.getByRole('link', { name: 'Monitor Perangkat' }).click()
  await page.screenshot({ path: `${SHOTS}/08-device.png`, fullPage: true })
  await page.getByRole('link', { name: 'ProxiRush Arena' }).click()
  await page.getByRole('button', { name: 'Putuskan Wi-Fi' }).click()
  await expect(page.getByText('DEVICE OFFLINE').first()).toBeVisible({ timeout: 15_000 })
  const live = await (await page.request.get(`${BASE}/api/live?source=DEMO`)).json()
  expect(live).toEqual([])
  await page.getByRole('button', { name: 'Matikan' }).click()

  // 10. Restart backend: committed data survives
  await stopServer()
  await startServer()
  const afterBoard = await (await page.request.get(`${BASE}/api/leaderboard?source=DEMO`)).json()
  expect(afterBoard[0].totalScore).toBe(board[0].totalScore)
  const stats = await (await page.request.get(`${BASE}/api/feedback/stats?source=DEMO`)).json()
  expect(stats).toMatchObject({ total: 1, positivePct: 100 })
  expect((await (await page.request.get(`${BASE}/api/leaderboard?source=LIVE`)).json())).toEqual([]) // demo never leaks into LIVE

  // 11. Overview with data
  await page.goto(BASE)
  await expect(page.getByText('Sesi game selesai')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/09-overview-data.png`, fullPage: true })

  // Offline readiness: every request stayed on the local server.
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
