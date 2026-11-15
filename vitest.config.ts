import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { projects: ['packages/shared', 'apps/server', 'apps/web'] }, // e2e/ runs via Playwright
})
