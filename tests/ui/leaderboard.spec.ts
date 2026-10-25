import { test, expect, type Page } from '@playwright/test'

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='
async function nav(page: Page, label: string) {
  if (await page.getByRole('button', { name: 'Mở menu', exact: true }).isVisible()) await page.getByRole('button', { name: 'Mở menu', exact: true }).click()
  await page.locator('.nav-item').filter({ hasText: label }).click()
}
async function member(page: Page) {
  await page.addInitScript(photo => {
    localStorage.setItem('linguanest_profile_v2', JSON.stringify({ id: 'demo', display_name: 'Linh', username: 'linh', role: 'member', is_active: true, must_change_password: false, avatar_data_url: photo }))
  }, image)
}

test('members see ranked names, photos, ties, zero XP and their own position without horizontal overflow', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await member(page)
  const entries = [
    { id: 'first', display_name: 'Minh Nguyễn', avatar_data_url: image, xp: 320, rank: 1 },
    { id: 'demo', display_name: 'Linh', avatar_data_url: image, xp: 100, rank: 2 },
    { id: 'peer', display_name: 'Thành viên có tên hiển thị dài để kiểm tra bố cục trên điện thoại', xp: 100, rank: 2 },
    { id: 'new', display_name: 'An mới tham gia', xp: 0, rank: 3 },
  ]
  // Mock just the leaderboard data; all other app APIs retain the real demo adapter.
  await page.route('**/src/lib/api.ts', route => route.fulfill({ contentType: 'text/javascript', body: `export * from '/src/lib/api.ts?leaderboard-test-real'; export async function loadLeaderboard() { return ${JSON.stringify(entries)}; }` }))
  await page.goto('/'); await nav(page, 'Bảng xếp hạng')
  await expect(page.getByRole('heading', { name: 'Bảng xếp hạng', exact: true })).toBeVisible()
  await expect(page.locator('.nav-item').filter({ hasText: 'Quản trị' })).toHaveCount(0)
  const rows = page.locator('.leaderboard-table tbody tr')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0)).toContainText('Minh Nguyễn'); await expect(rows.nth(0).locator('.leaderboard-xp')).toHaveText('320 XP')
  await expect(rows.nth(1).locator('.leaderboard-rank')).toHaveText('2')
  await expect(rows.nth(2).locator('.leaderboard-rank')).toHaveText('2')
  await expect(rows.nth(3).locator('.leaderboard-xp')).toHaveText('0 XP')
  await expect(page.locator('.leaderboard-self')).toContainText('Linh')
  await expect(page.locator('.leaderboard-self .leaderboard-you')).toHaveText('Bạn')
  await expect(page.getByRole('img', { name: 'Ảnh đại diện của Minh Nguyễn', exact: true })).toBeVisible()
  await expect(rows.nth(2).getByLabel('Ảnh đại diện mặc định')).toHaveCount(1)
  await expect(page.locator('.leaderboard-overview')).toContainText('#2')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.screenshot({ path: info.outputPath('leaderboard.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('demo leaderboard follows actual total XP, refreshes and recovers from loading errors', async ({ page }) => {
  await member(page)
  await page.goto('/'); await nav(page, 'Bảng xếp hạng')
  await expect(page.locator('.leaderboard-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.leaderboard-xp')).toHaveText('0 XP')
  await nav(page, 'Bài học'); await page.getByRole('button', { name: /Chào hỏi đầu tiên/ }).click()
  await page.getByRole('button', { name: 'Đánh dấu hoàn thành · +20 XP', exact: true }).click()
  await expect(page.getByRole('button', { name: '✓ Đã hoàn thành', exact: true })).toBeVisible()
  await nav(page, 'Bảng xếp hạng'); await expect(page.locator('.leaderboard-xp')).toHaveText('20 XP')
  await page.evaluate(() => localStorage.setItem('linguanest_demo_attempts_v1', JSON.stringify([{ correct_count: 3, total_count: 3 }])))
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page.locator('.leaderboard-xp')).toHaveText('35 XP')
  await page.evaluate(() => localStorage.setItem('linguanest_runs_v2', '{}'))
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Không tải được bảng xếp hạng.')
  await page.evaluate(() => localStorage.setItem('linguanest_runs_v2', '[]'))
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.leaderboard-xp')).toHaveText('35 XP')
})
