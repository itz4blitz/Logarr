import { Page, Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  readonly navDashboard: Locator;
  readonly navIssues: Locator;
  readonly navLogs: Locator;
  readonly navSessions: Locator;
  readonly navSources: Locator;
  readonly navSettings: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navDashboard = page.getByRole('link', { name: /dashboard/i });
    this.navIssues = page.getByRole('link', { name: /issues/i });
    this.navLogs = page.getByRole('link', { name: /logs/i });
    this.navSessions = page.getByRole('link', { name: /sessions/i });
    this.navSources = page.getByRole('link', { name: /sources/i });
    this.navSettings = page.getByRole('link', { name: /settings/i });
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
