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
    this.emptyState = page.getByText(/no issues/i);
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
    const issueCount = await this.getIssueCount();
    const emptyStateVisible = await this.emptyState.isVisible().catch(() => false);
    return issueCount > 0 || emptyStateVisible;
  }
}
