import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import { FALLBACK_MODELS } from './settings.dto';

import type { AiProviderType } from './settings.dto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Environment variable configuration for AI providers.
 * On startup, if an API key env var is set and no provider of that type exists,
 * the provider will be auto-configured with sensible defaults.
 */
interface EnvProviderConfig {
  envKey: string;
  provider: AiProviderType;
  name: string;
  defaultModel: string;
  baseUrlEnvKey?: string;
  defaultBaseUrl?: string;
}

const ENV_PROVIDER_CONFIGS: EnvProviderConfig[] = [
  {
    envKey: 'ANTHROPIC_API_KEY',
    provider: 'anthropic',
    name: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-20250514',
  },
  {
    envKey: 'OPENAI_API_KEY',
    provider: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
  },
  {
    envKey: 'GOOGLE_AI_API_KEY',
    provider: 'google',
    name: 'Google AI (Gemini)',
    defaultModel: 'gemini-2.0-flash',
  },
  {
    envKey: 'OLLAMA_BASE_URL',
    provider: 'ollama',
    name: 'Ollama (Local)',
    defaultModel: 'llama3.2',
    defaultBaseUrl: 'http://localhost:11434',
  },
  {
    envKey: 'LMSTUDIO_BASE_URL',
    provider: 'lmstudio',
    name: 'LM Studio (Local)',
    defaultModel: 'local-model',
    defaultBaseUrl: 'http://localhost:1234/v1',
  },
];

@Injectable()
export class AiProviderSeedService implements OnModuleInit {
  private readonly logger = new Logger(AiProviderSeedService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  async onModuleInit() {
    await this.seedAiProvidersFromEnv();
  }

  /**
   * Check environment variables and auto-configure AI providers that have
   * API keys set but don't exist in the database yet.
   */
  private async seedAiProvidersFromEnv(): Promise<void> {
    let seededCount = 0;
    let firstProvider: string | null = null;

    for (const config of ENV_PROVIDER_CONFIGS) {
      const envValue = process.env[config.envKey];

      // Skip if the env var is not set or empty
      if (!envValue || envValue.trim() === '') {
        continue;
      }

      // Determine if this is an API key or base URL based provider
      const isLocalProvider = config.provider === 'ollama' || config.provider === 'lmstudio';
      const apiKey = isLocalProvider ? '' : envValue;
      const baseUrl = isLocalProvider ? envValue : (config.defaultBaseUrl ?? null);

      // Check if this provider type already exists
      const existing = await this.db
        .select({ id: schema.aiProviderSettings.id })
        .from(schema.aiProviderSettings)
        .where(eq(schema.aiProviderSettings.provider, config.provider))
        .limit(1);

      if (existing.length > 0) {
        this.logger.debug(`AI provider ${config.provider} already exists, skipping seed`);
        continue;
      }

      // Get default model from fallback models
      const defaultModel = FALLBACK_MODELS[config.provider]?.[0]?.id ?? config.defaultModel;

      // Create the provider
      try {
        await this.db.insert(schema.aiProviderSettings).values({
          provider: config.provider,
          name: config.name,
          apiKey: apiKey ?? '',
          baseUrl: baseUrl ?? null,
          model: defaultModel,
          maxTokens: 2000,
          temperature: 0.7,
          isDefault: seededCount === 0, // First provider becomes default
          isEnabled: true,
        });

        seededCount++;
        if (!firstProvider) {
          firstProvider = config.name;
        }

        this.logger.log(
          `Auto-configured AI provider from env: ${config.name} (${config.provider})`
        );
      } catch (error) {
        this.logger.warn(`Failed to auto-configure AI provider ${config.name}: ${error}`);
      }
    }

    if (seededCount > 0) {
      this.logger.log(
        `Seeded ${seededCount} AI provider(s) from environment variables. Default: ${firstProvider}`
      );
    }
  }
}
