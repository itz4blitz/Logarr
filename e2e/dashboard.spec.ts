import { test, expect } from '@playwright/test';
import { DashboardPage, SetupPage } from './pages';

// Use test credentials for E2E testing
const E2E_USERNAME = 'admin';
const E2E_PASSWORD = 'testpassword123';

// Helper to ensure we're logged in (or setup first-time)
async function ensureAuthenticated(page: any, username: string, password: string) {
  const setupPage = new SetupPage(page);

  // Go to root URL and see where we end up
  await page.goto('/');

  const url = page.url();
  const currentUrl = new URL(url);

  if (currentUrl.pathname === '/setup') {
    // First time - create admin account
    await setupPage.setup(username, password);
  } else if (currentUrl.pathname === '/login') {
    // Already setup, need to login
    const { LoginPage } = await import('./pages');
    const loginPage = new LoginPage(page);
    await loginPage.login(username, password);
  }
  // Otherwise we're already at the dashboard
}

test.describe('Dashboard', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    await ensureAuthenticated(page, E2E_USERNAME, E2E_PASSWORD);
  });

  test('should load with correct title', async () => {
    await dashboardPage.expectTitle();
  });

  test('should display navigation sidebar', async () => {
    await dashboardPage.expectNavigationVisible();
  });

  test('should navigate to issues page', async () => {
    await dashboardPage.navigateToIssues();
    await expect(dashboardPage.page).toHaveURL(/.*issues/);
  });

  test('should navigate to logs page', async () => {
    await dashboardPage.navigateToLogs();
    await expect(dashboardPage.page).toHaveURL(/.*logs/);
  });

  test('should navigate to sessions page', async () => {
    await dashboardPage.navigateToSessions();
    await expect(dashboardPage.page).toHaveURL(/.*sessions/);
  });

  test('should navigate to sources page', async () => {
    await dashboardPage.navigateToSources();
    await expect(dashboardPage.page).toHaveURL(/.*sources/);
  });

  test('should navigate to settings page', async () => {
    await dashboardPage.navigateToSettings();
    await expect(dashboardPage.page).toHaveURL(/.*settings/);
  });
});
