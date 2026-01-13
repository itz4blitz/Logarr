import { Page, expect } from '@playwright/test';

export class SetupPage {
  readonly page: Page;
  readonly usernameInput: ReturnType<Page['locator']>;
  readonly passwordInput: ReturnType<Page['locator']>;
  readonly confirmPasswordInput: ReturnType<Page['locator']>;
  readonly createAccountButton: ReturnType<Page['locator']>;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByLabel('Username');
    this.passwordInput = page.getByLabel('Password');
    this.confirmPasswordInput = page.getByLabel(/^Confirm Password$/);
    this.createAccountButton = page.getByRole('button', { name: /create account/i });
  }

  async goto() {
    await this.page.goto('/setup');
  }

  async setup(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
    await this.createAccountButton.click();
    // Wait for navigation to dashboard after successful setup
    await this.page.waitForURL('/', { timeout: 10000 });
    // Wait for the page to fully load before returning
    await this.page.waitForLoadState('networkidle', { timeout: 10000 });
  }

  async expectComplete() {
    await expect(this.page).toHaveURL('/');
  }
}
