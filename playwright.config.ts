import { defineConfig } from '@playwright/test'

// The spec starts and restarts its own server (it tests persistence across restarts).
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
})
