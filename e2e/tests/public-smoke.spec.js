import { expect, test } from '@playwright/test'

test('public login screen is healthy and branded as STC', async ({ page }) => {
  await page.goto('/login')

  await expect(page).toHaveTitle(/STC Productivity/i)
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible()
  await expect(page.locator('#login-email')).toBeVisible()
  await expect(page.locator('#login-password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'دخول للنظام' })).toBeDisabled()
  await expect(page.getByAltText('STC Specialized Trading & Construction').first()).toBeVisible()
})

test('signed-out users cannot open protected routes', async ({ page }) => {
  await page.goto('/project-progress')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible()
})
