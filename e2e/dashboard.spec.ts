import { test, expect } from '@playwright/test';
import { DashboardPage, LoginPage } from './pages';

// Use test credentials for E2E testing
const E2E_USERNAME = 'admin';
const E2E_PASSWORD = 'testpassword123';

test.describe('Dashboard', () => {
  let dashboardPage: DashboardPage;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);

    // Login before each test
    await loginPage.goto();
    await loginPage.login(E2E_USERNAME, E2E_PASSWORD);
    await loginPage.expectLoggedIn();
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
