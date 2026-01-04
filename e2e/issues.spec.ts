import { test, expect } from '@playwright/test';
import { IssuesPage } from './pages';

test.describe('Issues Page', () => {
  let issuesPage: IssuesPage;

  test.beforeEach(async ({ page }) => {
    issuesPage = new IssuesPage(page);
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
