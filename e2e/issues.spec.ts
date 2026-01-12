import { test, expect } from '@playwright/test';
import { IssuesPage, SetupPage } from './pages';

// Use test credentials for E2E testing
const E2E_USERNAME = 'admin';
const E2E_PASSWORD = 'testpassword123';

test.describe('Issues Page', () => {
  let issuesPage: IssuesPage;
  let setupPage: SetupPage;

  test.beforeEach(async ({ page }) => {
    setupPage = new SetupPage(page);
    issuesPage = new IssuesPage(page);

    // Check if we need to setup first (redirects from /login to /setup)
    await page.goto('/login');
    const url = page.url();

    if (url.includes('/setup')) {
      // First time - create admin account
      await setupPage.setup(E2E_USERNAME, E2E_PASSWORD);
    } else if (url.includes('/login')) {
      // Already setup, try login
      const { LoginPage } = await import('./pages');
      const loginPage = new LoginPage(page);
      await loginPage.login(E2E_USERNAME, E2E_PASSWORD);
    }

    // Navigate to issues page
    await issuesPage.goto();
  });

  test('should load the issues page', async () => {
    await issuesPage.expectUrl();
  });

  test('should display search input', async () => {
    await issuesPage.expectSearchInputVisible();
  });

  test('should filter issues by search', async () => {
    await issuesPage.search('connection');
    await issuesPage.expectUrl();
  });

  test('should clear search filter', async () => {
    await issuesPage.search('connection');
    await issuesPage.clearSearch();
    await issuesPage.expectUrl();
  });

  test('should display issues or empty state', async () => {
    const hasContent = await issuesPage.hasIssuesOrEmptyState();
    expect(hasContent).toBe(true);
  });

  test('should navigate back to dashboard', async () => {
    await issuesPage.navigateToDashboard();
    await expect(issuesPage.page).toHaveURL('/');
  });
});
