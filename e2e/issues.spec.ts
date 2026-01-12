import { test, expect } from '@playwright/test';
import { IssuesPage, SetupPage } from './pages';

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

test.describe('Issues Page', () => {
  let issuesPage: IssuesPage;

  test.beforeEach(async ({ page }) => {
    issuesPage = new IssuesPage(page);

    // Authenticate first
    await ensureAuthenticated(page, E2E_USERNAME, E2E_PASSWORD);

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
