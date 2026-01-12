import { Page, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: ReturnType<Page['locator']>;
  readonly passwordInput: ReturnType<Page['locator']>;
  readonly signInButton: ReturnType<Page['locator']>;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByLabel('Username');
    this.passwordInput = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: /sign in/i });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
    // Wait for navigation to dashboard after successful login
    await this.page.waitForURL('/', { timeout: 5000 });
  }

  async expectLoggedIn() {
    await expect(this.page).toHaveURL('/');
  }
}
