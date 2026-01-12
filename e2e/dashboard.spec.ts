import { test, expect } from '@playwright/test';
import { DashboardPage, SetupPage } from './pages';

// Use test credentials for E2E testing
const E2E_USERNAME = 'admin';
const E2E_PASSWORD = 'testpassword123';

test.describe('Dashboard', () => {
  let dashboardPage: DashboardPage;
  let setupPage: SetupPage;

  test.beforeEach(async ({ page }) => {
    setupPage = new SetupPage(page);
    dashboardPage = new DashboardPage(page);

    // Check if we need to setup first (redirects from /login to /setup)
    await page.goto('/login');
    const url = page.url();

    if (url.includes('/setup') || url.includes('/login')) {
      // First time - create admin account
      if (url.includes('/setup')) {
        await setupPage.setup(E2E_USERNAME, E2E_PASSWORD);
      } else {
        // Already setup, try login
        const { LoginPage } = await import('./pages');
        const loginPage = new LoginPage(page);
        await loginPage.login(E2E_USERNAME, E2E_PASSWORD);
      }
    }
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
