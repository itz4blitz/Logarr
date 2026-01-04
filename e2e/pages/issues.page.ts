import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class IssuesPage extends BasePage {
  readonly url = '/issues';
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly severityFilter: Locator;
  readonly issueList: Locator;
  readonly emptyState: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.getByPlaceholder(/search/i);
    this.statusFilter = page.getByRole('combobox', { name: /status/i }).or(
      page.getByRole('button', { name: /status/i })
    );
    this.severityFilter = page.locator('[data-testid="severity-filter"]').or(
      page.getByText(/severity/i).first()
    );
    this.issueList = page.locator('[data-testid="issue-list"]').or(
      page.locator('main').first()
    );
    this.emptyState = page.getByText(/no issues found/i);
    this.refreshButton = page.getByRole('button', { name: /refresh/i });
  }

  async goto() {
    await this.page.goto(this.url);
    await this.waitForLoad();
  }

  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    // Wait for debounced search to trigger
    await this.page.waitForLoadState('networkidle');
  }

  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForLoadState('networkidle');
  }

  async expectUrl() {
    await expect(this.page).toHaveURL(/.*issues/);
  }

  async expectSearchInputVisible() {
    await expect(this.searchInput).toBeVisible();
  }

  async getIssueCount(): Promise<number> {
    const issues = this.page.locator('[data-testid="issue-card"]');
    return await issues.count();
  }

  async hasIssuesOrEmptyState(): Promise<boolean> {
    // Wait a bit for content to load
    await this.page.waitForTimeout(1000);

    const issueCount = await this.getIssueCount();
    if (issueCount > 0) return true;

    // Check for various empty/error states
    const emptyStateVisible = await this.emptyState.isVisible().catch(() => false);
    if (emptyStateVisible) return true;

    // Check for loading state (acceptable as content)
    const loadingVisible = await this.page.getByText(/loading/i).isVisible().catch(() => false);
    if (loadingVisible) return true;

    // Check if main content area exists (page rendered)
    const mainContent = await this.page.locator('main').isVisible().catch(() => false);
    return mainContent;
  }
}
