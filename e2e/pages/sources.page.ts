import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class SourcesPage extends BasePage {
  // Page elements
  readonly heading: Locator;
  readonly addSourceButton: Locator;
  readonly sourceCards: Locator;

  // Diagnostics dialog elements
  readonly diagnosticsDialog: Locator;
  readonly diagnosticsTitle: Locator;
  readonly diagnosticsRefreshButton: Locator;
  readonly apiConnectionSection: Locator;
  readonly fileIngestionSection: Locator;
  readonly configuredPaths: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /sources/i, level: 1 });
    this.addSourceButton = page.getByRole('button', { name: /add source/i });
    this.sourceCards = page.locator('[data-testid="source-card"]');

    // Diagnostics dialog
    this.diagnosticsDialog = page.getByRole('dialog');
    this.diagnosticsTitle = this.diagnosticsDialog.getByRole('heading', {
      name: /diagnostics/i,
    });
    this.diagnosticsRefreshButton = this.diagnosticsDialog.getByRole('button', {
      name: /refresh/i,
    });
    this.apiConnectionSection = this.diagnosticsDialog.locator('text=API Connection');
    this.fileIngestionSection = this.diagnosticsDialog.locator('text=File Ingestion');
    this.configuredPaths = this.diagnosticsDialog.locator('text=Configured Paths');
  }

  async goto() {
    await this.page.goto('/sources');
    await expect(this.heading).toBeVisible();
  }

  /**
   * Get a source card by server name
   */
  getSourceCard(name: string): Locator {
    return this.page.locator(`[data-testid="source-card"]:has-text("${name}")`);
  }

  /**
   * Open diagnostics dialog for a source
   */
  async openDiagnostics(sourceName: string) {
    const card = this.getSourceCard(sourceName);
    const diagnosticsButton = card.getByRole('button', {
      name: /diagnostics/i,
    });
    await diagnosticsButton.click();
    await expect(this.diagnosticsDialog).toBeVisible();
  }

  /**
   * Close diagnostics dialog
   */
  async closeDiagnostics() {
    // Click outside or press escape
    await this.page.keyboard.press('Escape');
    await expect(this.diagnosticsDialog).not.toBeVisible();
  }

  /**
   * Get connection status badge text
   */
  async getConnectionStatus(sourceName: string): Promise<string> {
    const card = this.getSourceCard(sourceName);
    const badge = card.locator('[data-testid="connection-status"]');
    return (await badge.textContent()) || '';
  }

  /**
   * Check if API connection shows as connected in diagnostics
   */
  async isApiConnected(): Promise<boolean> {
    const badge = this.diagnosticsDialog.locator('text=Connected').first();
    return await badge.isVisible();
  }

  /**
   * Check if file ingestion is enabled in diagnostics
   */
  async isFileIngestionEnabled(): Promise<boolean> {
    const section = this.fileIngestionSection;
    return await section.isVisible();
  }

  /**
   * Get all configured paths from diagnostics dialog
   */
  async getConfiguredPaths(): Promise<string[]> {
    const pathElements = this.diagnosticsDialog.locator('[data-testid="configured-path"]');
    const count = await pathElements.count();
    const paths: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await pathElements.nth(i).textContent();
      if (text) paths.push(text);
    }
    return paths;
  }

  /**
   * Expand a path in diagnostics to see discovered files
   */
  async expandPath(index: number) {
    const pathCollapsibles = this.diagnosticsDialog.locator('[data-state="closed"]');
    const collapsible = pathCollapsibles.nth(index);
    await collapsible.click();
  }

  /**
   * Click refresh in diagnostics dialog
   */
  async refreshDiagnostics() {
    await this.diagnosticsRefreshButton.click();
  }

  /**
   * Get error message if any from diagnostics
   */
  async getDiagnosticsError(): Promise<string | null> {
    const errorElement = this.diagnosticsDialog.locator('.text-red-400').first();
    if (await errorElement.isVisible()) {
      return await errorElement.textContent();
    }
    return null;
  }
}
