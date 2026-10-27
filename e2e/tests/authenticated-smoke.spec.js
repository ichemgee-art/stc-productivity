import { expect, test } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const hasCredentials = Boolean(email && password)

async function login(page) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'دخول للنظام' }).click()
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 })
}

test.describe('authenticated critical flow', () => {
  test.skip(!hasCredentials, 'Set E2E_EMAIL and E2E_PASSWORD repository secrets to run authenticated E2E.')

  test('dashboard, productivity and project progress load without route errors', async ({ page }) => {
    await login(page)

    await expect(page.locator('.route-error-card')).toHaveCount(0)

    await page.goto('/productivity')
    await expect(page.locator('.page-error')).toHaveCount(0)
    await expect(page).toHaveURL(/\/productivity$/)

    await page.goto('/project-progress')
    await expect(page.locator('.page-error')).toHaveCount(0)
    await expect(page.getByText('متابعة المشاريع', { exact: true }).first()).toBeVisible()
  })

  test('project-progress filter state survives navigation and refresh', async ({ page }) => {
    await login(page)
    await page.goto('/project-progress')

    const search = page.getByPlaceholder('بحث في المشروع، الموقع، الملاحظات...')
    await search.fill('__e2e_cache_probe__')

    await page.goto('/')
    await page.goto('/project-progress')
    await expect(page.getByPlaceholder('بحث في المشروع، الموقع، الملاحظات...')).toHaveValue('__e2e_cache_probe__')

    await page.reload()
    await expect(page.getByPlaceholder('بحث في المشروع، الموقع، الملاحظات...')).toHaveValue('__e2e_cache_probe__')
  })
})
