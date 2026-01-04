import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages';

test.describe('Dashboard', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
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
