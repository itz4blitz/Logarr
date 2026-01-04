import { Page, Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly navDashboard: Locator;
  readonly navIssues: Locator;
  readonly navLogs: Locator;
  readonly navSessions: Locator;
  readonly navSources: Locator;
  readonly navSettings: Locator;

  constructor(page: Page) {
    this.page = page;
    // Target sidebar navigation links specifically using data-sidebar attribute
    this.sidebar = page.locator('[data-sidebar="sidebar"]');
    this.navDashboard = this.sidebar.getByRole('link', { name: /dashboard/i });
    this.navIssues = this.sidebar.getByRole('link', { name: /issues/i });
    this.navLogs = this.sidebar.getByRole('link', { name: /logs/i });
    this.navSessions = this.sidebar.getByRole('link', { name: /sessions/i });
    this.navSources = this.sidebar.getByRole('link', { name: /sources/i });
    this.navSettings = this.sidebar.getByRole('link', { name: /settings/i });
  }

  async navigateToDashboard() {
    await this.navDashboard.click();
    await this.page.waitForURL('**/');
  }

  async navigateToIssues() {
    await this.navIssues.click();
    await this.page.waitForURL('**/issues');
  }

  async navigateToLogs() {
    await this.navLogs.click();
    await this.page.waitForURL('**/logs');
  }

  async navigateToSessions() {
    await this.navSessions.click();
    await this.page.waitForURL('**/sessions');
  }

  async navigateToSources() {
    await this.navSources.click();
    await this.page.waitForURL('**/sources');
  }

  async navigateToSettings() {
    await this.navSettings.click();
    await this.page.waitForURL('**/settings');
  }
}
