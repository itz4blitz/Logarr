import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class DashboardPage extends BasePage {
  readonly url = '/';

  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto(this.url);
    await this.waitForLoad();
  }

  async waitForLoad() {
    // Wait for the main content area to be visible
    await this.page.waitForLoadState('networkidle');
  }

  async expectTitle() {
    await expect(this.page).toHaveTitle(/Logarr/);
  }

  async expectNavigationVisible() {
    await expect(this.navDashboard).toBeVisible();
    await expect(this.navIssues).toBeVisible();
    await expect(this.navLogs).toBeVisible();
    await expect(this.navSessions).toBeVisible();
    await expect(this.navSources).toBeVisible();
    await expect(this.navSettings).toBeVisible();
  }
}
