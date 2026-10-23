import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/ui', timeout: 45000, fullyParallel: false, workers: 1,
  globalSetup: './tests/ui/setup.ts',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel: 'msedge' } },
  ],
})
