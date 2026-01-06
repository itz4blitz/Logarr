import { Injectable, Inject, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { eq, and, gte, lte, desc, count, sql } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import { AI_PROVIDER_BASE, FALLBACK_MODELS } from './settings.dto';

import type {
  AiProviderType,
  AiProviderInfo,
  AiModelInfo,
  AiProviderSettingsDto,
  CreateAiProviderDto,
  UpdateAiProviderDto,
  TestProviderResultDto,
  AnalysisResultDto,
} from './settings.dto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Strategy interface for AI providers
interface AiProviderStrategy {
  generateText(prompt: string, options: AiGenerationOptions): Promise<AiGenerationResult>;
  generateTextWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions
  ): Promise<AiGenerationResult>;
  testConnection(apiKey: string, model: string, baseUrl?: string): Promise<TestProviderResultDto>;
  fetchModels(apiKey: string, baseUrl?: string): Promise<AiModelInfo[]>;
}

interface AiGenerationOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

interface AiGenerationResult {
  text: string;
  tokensUsed?: number;
  finishReason?: string;
}

// Response types for API calls
interface OpenAiResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { total_tokens?: number };
}

interface OpenAiModelsResponse {
  data?: Array<{
    id: string;
    owned_by?: string;
    created?: number;
  }>;
}

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

interface GoogleAiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { totalTokenCount?: number };
}

interface GoogleModelsResponse {
  models?: Array<{
    name?: string;
    displayName?: string;
    inputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
}

interface ApiErrorResponse {
  error?: { message?: string };
}

// Helper to build modelInfo without undefined values
function buildModelInfo(
  model: string,
  tokensUsed?: number
): { model: string; tokensUsed?: number } {
  const info: { model: string; tokensUsed?: number } = { model };
  if (tokensUsed !== undefined) {
    info.tokensUsed = tokensUsed;
  }
  return info;
}

// OpenAI Strategy
class OpenAiStrategy implements AiProviderStrategy {
  async generateText(prompt: string, options: AiGenerationOptions): Promise<AiGenerationResult> {
    return this.generateTextWithSystemPrompt('You are a helpful assistant.', prompt, options);
  }

  async generateTextWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions
  ): Promise<AiGenerationResult> {
    const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: options.maxTokens ?? 1000,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      throw new Error(errorData.error?.message ?? `OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenAiResponse;
    const result: AiGenerationResult = {
      text: data.choices?.[0]?.message?.content ?? '',
    };
    if (data.usage?.total_tokens !== undefined) {
      result.tokensUsed = data.usage.total_tokens;
    }
    if (data.choices?.[0]?.finish_reason) {
      result.finishReason = data.choices[0].finish_reason;
    }
    return result;
  }

  async testConnection(
    apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<TestProviderResultDto> {
    const start = Date.now();
    try {
      const opts: AiGenerationOptions = {
        apiKey,
        model,
        maxTokens: 10,
        temperature: 0,
      };
      if (baseUrl) {
        opts.baseUrl = baseUrl;
      }
      const result = await this.generateText('Say "Hello" in exactly one word.', opts);

      return {
        success: true,
        message: 'Connection successful',
        responseTime: Date.now() - start,
        modelInfo: buildModelInfo(model, result.tokensUsed),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - start,
      };
    }
  }

  async fetchModels(apiKey: string, baseUrl?: string): Promise<AiModelInfo[]> {
    const url = baseUrl ?? 'https://api.openai.com/v1';

    const response = await fetch(`${url}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as OpenAiModelsResponse;

    // Filter for base OpenAI chat models only (exclude fine-tuned, custom, and non-chat models)
    const chatModels = (data.data ?? [])
      .filter((m) => {
        const id = m.id.toLowerCase();
        // Exclude fine-tuned models (they start with ft:)
        if (id.startsWith('ft:')) return false;
        // Exclude models owned by user organizations (fine-tuned/custom)
        const ownedBy = m.owned_by ?? '';
        if (ownedBy !== '' && !['openai', 'system', 'openai-internal'].includes(ownedBy)) return false;
        // Exclude non-chat model types
        if (
          id.includes('instruct') ||
          id.includes('vision') || // Vision is deprecated, use gpt-4o
          id.includes('realtime') || // Skip realtime models
          id.includes('audio') || // Skip audio-specific models (TTS, transcription)
          id.includes('tts') || // Text-to-speech models
          id.includes('whisper') || // Speech recognition
          id.includes('embedding') || // Embedding models
          id.includes('davinci') || // Legacy completion models
          id.includes('babbage') || // Legacy models
          id.includes('curie') || // Legacy models
          id.includes('ada') || // Legacy models (except embeddings already filtered)
          id.includes('dall-e') || // Image generation
          id.includes('moderation') // Content moderation
        ) {
          return false;
        }
        // Include only standard GPT chat models
        return id.includes('gpt-4') || id.includes('gpt-3.5') || id.includes('o1') || id.includes('o3');
      })
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .slice(0, 15); // Limit to top 15 models

    return chatModels.map((m) => {
      const id = m.id;
      let contextWindow = 4096;
      // o1 and o3 reasoning models (200k context)
      if (id.includes('o1') || id.includes('o3')) contextWindow = 200000;
      // GPT-4.1 series (1M context)
      else if (id.includes('gpt-4.1')) contextWindow = 1047576;
      // GPT-4.5 preview (128k context)
      else if (id.includes('gpt-4.5')) contextWindow = 128000;
      // GPT-4o and GPT-4 turbo (128k context)
      else if (id.includes('gpt-4o') || id.includes('gpt-4-turbo')) contextWindow = 128000;
      else if (id.includes('gpt-4-32k')) contextWindow = 32768;
      else if (id.includes('gpt-4')) contextWindow = 8192;
      else if (id.includes('gpt-3.5-turbo-16k')) contextWindow = 16384;
      else if (id.includes('gpt-3.5-turbo')) contextWindow = 16385;

      return {
        id,
        name: this.formatModelName(id),
        contextWindow,
      };
    });
  }

  private formatModelName(id: string): string {
    // Convert model IDs to readable names
    if (id === 'gpt-4o') return 'GPT-4o';
    if (id === 'gpt-4o-mini') return 'GPT-4o Mini';
    if (id.startsWith('gpt-4o-')) return `GPT-4o (${id.split('-').pop()})`;
    if (id === 'gpt-4-turbo') return 'GPT-4 Turbo';
    if (id === 'gpt-4-turbo-preview') return 'GPT-4 Turbo Preview';
    if (id === 'gpt-4') return 'GPT-4';
    if (id === 'gpt-3.5-turbo') return 'GPT-3.5 Turbo';
    return id
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }
}

// Anthropic Strategy
class AnthropicStrategy implements AiProviderStrategy {
  async generateText(prompt: string, options: AiGenerationOptions): Promise<AiGenerationResult> {
    return this.generateTextWithSystemPrompt('You are a helpful assistant.', prompt, options);
  }

  async generateTextWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions
  ): Promise<AiGenerationResult> {
    const baseUrl = options.baseUrl ?? 'https://api.anthropic.com';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      throw new Error(errorData.error?.message ?? `Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

    const result: AiGenerationResult = {
      text: data.content?.[0]?.text ?? '',
      tokensUsed: inputTokens + outputTokens,
    };
    if (data.stop_reason) {
      result.finishReason = data.stop_reason;
    }
    return result;
  }

  async testConnection(
    apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<TestProviderResultDto> {
    const start = Date.now();
    try {
      const opts: AiGenerationOptions = {
        apiKey,
        model,
        maxTokens: 10,
      };
      if (baseUrl) {
        opts.baseUrl = baseUrl;
      }
      const result = await this.generateText('Say "Hello" in exactly one word.', opts);

      return {
        success: true,
        message: 'Connection successful',
        responseTime: Date.now() - start,
        modelInfo: buildModelInfo(model, result.tokensUsed),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - start,
      };
    }
  }

  async fetchModels(_apiKey: string, _baseUrl?: string): Promise<AiModelInfo[]> {
    // Anthropic doesn't have a public models API endpoint
    // Return the known models with accurate info
    return [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextWindow: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000 },
    ];
  }
}

// Ollama Strategy (OpenAI-compatible API)
class OllamaStrategy implements AiProviderStrategy {
  async generateText(prompt: string, options: AiGenerationOptions): Promise<AiGenerationResult> {
    return this.generateTextWithSystemPrompt('You are a helpful assistant.', prompt, options);
  }

  async generateTextWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions
  ): Promise<AiGenerationResult> {
    const baseUrl = options.baseUrl ?? 'http://localhost:11434';

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        options: {
          num_predict: options.maxTokens ?? 1000,
          temperature: options.temperature ?? 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      throw new Error(errorData.error?.message ?? `Ollama API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      eval_count?: number;
      prompt_eval_count?: number;
    };

    const result: AiGenerationResult = {
      text: data.message?.content ?? '',
    };
    if (data.eval_count !== undefined || data.prompt_eval_count !== undefined) {
      result.tokensUsed = (data.eval_count ?? 0) + (data.prompt_eval_count ?? 0);
    }
    return result;
  }

  async testConnection(
    _apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<TestProviderResultDto> {
    const start = Date.now();
    try {
      const result = await this.generateText('Say "Hello" in exactly one word.', {
        apiKey: '', // Ollama doesn't need API key
        model,
        baseUrl: baseUrl ?? 'http://localhost:11434',
        maxTokens: 10,
        temperature: 0,
      });

      return {
        success: true,
        message: 'Connection successful',
        responseTime: Date.now() - start,
        modelInfo: buildModelInfo(model, result.tokensUsed),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - start,
      };
    }
  }

  async fetchModels(_apiKey: string, baseUrl?: string): Promise<AiModelInfo[]> {
    const url = baseUrl ?? 'http://localhost:11434';

    try {
      const response = await fetch(`${url}/api/tags`);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        models?: Array<{
          name: string;
          size?: number;
          details?: {
            parameter_size?: string;
            family?: string;
          };
        }>;
      };

      return (data.models ?? []).map((m) => {
        const info: AiModelInfo = {
          id: m.name,
          name: this.formatModelName(m.name),
        };
        if (m.details?.parameter_size) {
          info.description = m.details.parameter_size;
        }
        return info;
      });
    } catch {
      // Return empty array if Ollama isn't running
      return [];
    }
  }

  private formatModelName(id: string): string {
    // Remove version tags like :latest, :7b, etc for display
    const baseName = id.split(':')[0] ?? id;
    return baseName
      .split(/[-_]/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }
}

// LM Studio Strategy (OpenAI-compatible API)
class LmStudioStrategy implements AiProviderStrategy {
  async generateText(prompt: string, options: AiGenerationOptions): Promise<AiGenerationResult> {
    return this.generateTextWithSystemPrompt('You are a helpful assistant.', prompt, options);
  }

  async generateTextWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions
  ): Promise<AiGenerationResult> {
    const baseUrl = options.baseUrl ?? 'http://localhost:1234/v1';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: options.maxTokens ?? 1000,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      throw new Error(errorData.error?.message ?? `LM Studio API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenAiResponse;
    const result: AiGenerationResult = {
      text: data.choices?.[0]?.message?.content ?? '',
    };
    if (data.usage?.total_tokens !== undefined) {
      result.tokensUsed = data.usage.total_tokens;
    }
    if (data.choices?.[0]?.finish_reason) {
      result.finishReason = data.choices[0].finish_reason;
    }
    return result;
  }

  async testConnection(
    _apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<TestProviderResultDto> {
    const start = Date.now();
    try {
      const result = await this.generateText('Say "Hello" in exactly one word.', {
        apiKey: '', // LM Studio doesn't need API key
        model,
        baseUrl: baseUrl ?? 'http://localhost:1234/v1',
        maxTokens: 10,
        temperature: 0,
      });

      return {
        success: true,
        message: 'Connection successful',
        responseTime: Date.now() - start,
        modelInfo: buildModelInfo(model, result.tokensUsed),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - start,
      };
    }
  }

  async fetchModels(_apiKey: string, baseUrl?: string): Promise<AiModelInfo[]> {
    const url = baseUrl ?? 'http://localhost:1234/v1';

    try {
      const response = await fetch(`${url}/models`);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = (await response.json()) as OpenAiModelsResponse;

      return (data.data ?? []).map((m) => ({
        id: m.id,
        name: this.formatModelName(m.id),
      }));
    } catch {
      // Return empty array if LM Studio isn't running
      return [];
    }
  }

  private formatModelName(id: string): string {
    // LM Studio model IDs can be paths or names
    const baseName = id.split('/').pop() ?? id;
    return baseName
      .replace(/\.gguf$/i, '')
      .replace(/-/g, ' ')
      .split(' ')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }
}

// Google AI Strategy
class GoogleAiStrategy implements AiProviderStrategy {
  async generateText(prompt: string, options: AiGenerationOptions): Promise<AiGenerationResult> {
    return this.generateTextWithSystemPrompt('You are a helpful assistant.', prompt, options);
  }

  async generateTextWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions
  ): Promise<AiGenerationResult> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${options.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens: options.maxTokens ?? 1000,
            temperature: options.temperature ?? 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      throw new Error(errorData.error?.message ?? `Google AI API error: ${response.status}`);
    }

    const data = (await response.json()) as GoogleAiResponse;
    const result: AiGenerationResult = {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    };
    if (data.usageMetadata?.totalTokenCount !== undefined) {
      result.tokensUsed = data.usageMetadata.totalTokenCount;
    }
    if (data.candidates?.[0]?.finishReason) {
      result.finishReason = data.candidates[0].finishReason;
    }
    return result;
  }

  async testConnection(apiKey: string, model: string): Promise<TestProviderResultDto> {
    const start = Date.now();
    try {
      const result = await this.generateText('Say "Hello" in exactly one word.', {
        apiKey,
        model,
        maxTokens: 10,
        temperature: 0,
      });

      return {
        success: true,
        message: 'Connection successful',
        responseTime: Date.now() - start,
        modelInfo: buildModelInfo(model, result.tokensUsed),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - start,
      };
    }
  }

  async fetchModels(apiKey: string): Promise<AiModelInfo[]> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as GoogleModelsResponse;

    // Filter for generative models that support generateContent
    const generativeModels = (data.models ?? [])
      .filter((m) => {
        const methods = m.supportedGenerationMethods ?? [];
        const name = m.name ?? '';
        return (
          methods.includes('generateContent') &&
          (name.includes('gemini') || name.includes('Gemini'))
        );
      })
      .slice(0, 10);

    return generativeModels
      .filter((m): m is typeof m & { name: string } => !!m.name)
      .map((m) => {
        // Extract model ID from full name (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
        const id = m.name.replace('models/', '');
        const result: AiModelInfo = {
          id,
          name: m.displayName ?? this.formatModelName(id),
        };
        if (m.inputTokenLimit !== undefined) {
          result.contextWindow = m.inputTokenLimit;
        }
        return result;
      });
  }

  private formatModelName(id: string): string {
    return id
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }
}

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly strategies: Map<AiProviderType, AiProviderStrategy>;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {
    // Initialize strategies
    this.strategies = new Map([
      ['openai', new OpenAiStrategy()],
      ['anthropic', new AnthropicStrategy()],
      ['google', new GoogleAiStrategy()],
      ['ollama', new OllamaStrategy()],
      ['lmstudio', new LmStudioStrategy()],
    ]);
  }

  /**
   * Get available AI providers with fallback models
   */
  getAvailableProviders(): AiProviderInfo[] {
    return Object.values(AI_PROVIDER_BASE).map((provider) => ({
      ...provider,
      models: FALLBACK_MODELS[provider.id] ?? [],
    }));
  }

  /**
   * Fetch models dynamically from provider API
   */
  async fetchProviderModels(
    provider: AiProviderType,
    apiKey: string,
    baseUrl?: string
  ): Promise<AiModelInfo[]> {
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }

    try {
      const models = await strategy.fetchModels(apiKey, baseUrl);
      return models;
    } catch (error) {
      this.logger.warn(`Failed to fetch models from ${provider}: ${error}`);
      // Return fallback models on error
      return FALLBACK_MODELS[provider] ?? [];
    }
  }

  /**
   * Fetch models for an existing provider setting (uses stored API key)
   */
  async fetchModelsForSetting(id: string): Promise<AiModelInfo[]> {
    const setting = await this.getProviderSettingById(id);

    // Get the actual API key from DB
    const dbResult = await this.db
      .select({ apiKey: schema.aiProviderSettings.apiKey })
      .from(schema.aiProviderSettings)
      .where(eq(schema.aiProviderSettings.id, id))
      .limit(1);

    const apiKey = dbResult[0]?.apiKey ?? '';

    return this.fetchProviderModels(
      setting.provider as AiProviderType,
      apiKey,
      setting.baseUrl ?? undefined
    );
  }

  /**
   * Get all configured provider settings
   */
  async getProviderSettings(): Promise<AiProviderSettingsDto[]> {
    const settings = await this.db
      .select()
      .from(schema.aiProviderSettings)
      .orderBy(schema.aiProviderSettings.createdAt);

    return settings.map(this.toSettingsDto);
  }

  /**
   * Get a specific provider setting by ID
   */
  async getProviderSettingById(id: string): Promise<AiProviderSettingsDto> {
    const results = await this.db
      .select()
      .from(schema.aiProviderSettings)
      .where(eq(schema.aiProviderSettings.id, id))
      .limit(1);

    if (results.length === 0) {
      throw new NotFoundException(`AI provider setting with ID ${id} not found`);
    }

    return this.toSettingsDto(results[0]!);
  }

  /**
   * Get the default provider setting
   */
  async getDefaultProvider(): Promise<AiProviderSettingsDto | null> {
    const results = await this.db
      .select()
      .from(schema.aiProviderSettings)
      .where(
        and(
          eq(schema.aiProviderSettings.isDefault, true),
          eq(schema.aiProviderSettings.isEnabled, true)
        )
      )
      .limit(1);

    if (results.length === 0) {
      // Fallback to any enabled provider
      const fallback = await this.db
        .select()
        .from(schema.aiProviderSettings)
        .where(eq(schema.aiProviderSettings.isEnabled, true))
        .limit(1);

      if (fallback.length === 0) {
        return null;
      }
      return this.toSettingsDto(fallback[0]!);
    }

    return this.toSettingsDto(results[0]!);
  }

  /**
   * Create a new provider setting
   */
  async createProviderSetting(dto: CreateAiProviderDto): Promise<AiProviderSettingsDto> {
    // Validate provider type
    if (!this.strategies.has(dto.provider)) {
      throw new BadRequestException(`Unknown provider: ${dto.provider}`);
    }

    // If this is set as default, unset other defaults
    if (dto.isDefault) {
      await this.db
        .update(schema.aiProviderSettings)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(schema.aiProviderSettings.isDefault, true));
    }

    const results = await this.db
      .insert(schema.aiProviderSettings)
      .values({
        provider: dto.provider,
        name: dto.name,
        apiKey: dto.apiKey,
        baseUrl: dto.baseUrl,
        model: dto.model,
        maxTokens: dto.maxTokens ?? 1000,
        temperature: dto.temperature ?? 0.7,
        isDefault: dto.isDefault ?? false,
        isEnabled: dto.isEnabled ?? true,
      })
      .returning();

    this.logger.log(`Created AI provider setting: ${dto.name} (${dto.provider})`);
    return this.toSettingsDto(results[0]!);
  }

  /**
   * Update a provider setting
   */
  async updateProviderSetting(
    id: string,
    dto: UpdateAiProviderDto
  ): Promise<AiProviderSettingsDto> {
    // Check if exists
    await this.getProviderSettingById(id);

    // If setting this as default, unset other defaults
    if (dto.isDefault) {
      await this.db
        .update(schema.aiProviderSettings)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(schema.aiProviderSettings.isDefault, true));
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) updateData['name'] = dto.name;
    if (dto.apiKey !== undefined) updateData['apiKey'] = dto.apiKey;
    if (dto.baseUrl !== undefined) updateData['baseUrl'] = dto.baseUrl;
    if (dto.model !== undefined) updateData['model'] = dto.model;
    if (dto.maxTokens !== undefined) updateData['maxTokens'] = dto.maxTokens;
    if (dto.temperature !== undefined) updateData['temperature'] = dto.temperature;
    if (dto.isDefault !== undefined) updateData['isDefault'] = dto.isDefault;
    if (dto.isEnabled !== undefined) updateData['isEnabled'] = dto.isEnabled;

    const results = await this.db
      .update(schema.aiProviderSettings)
      .set(updateData)
      .where(eq(schema.aiProviderSettings.id, id))
      .returning();

    this.logger.log(`Updated AI provider setting: ${id}`);
    return this.toSettingsDto(results[0]!);
  }

  /**
   * Delete a provider setting
   */
  async deleteProviderSetting(id: string): Promise<void> {
    await this.getProviderSettingById(id);

    await this.db.delete(schema.aiProviderSettings).where(eq(schema.aiProviderSettings.id, id));

    this.logger.log(`Deleted AI provider setting: ${id}`);
  }

  /**
   * Test a provider connection
   */
  async testProvider(
    provider: AiProviderType,
    apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<TestProviderResultDto> {
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      return {
        success: false,
        message: `Unknown provider: ${provider}`,
      };
    }

    return strategy.testConnection(apiKey, model, baseUrl);
  }

  /**
   * Test an existing provider setting
   */
  async testProviderSetting(id: string): Promise<TestProviderResultDto> {
    const setting = await this.getProviderSettingById(id);

    // Get the actual API key from DB
    const dbResult = await this.db
      .select({ apiKey: schema.aiProviderSettings.apiKey })
      .from(schema.aiProviderSettings)
      .where(eq(schema.aiProviderSettings.id, id))
      .limit(1);

    const apiKey = dbResult[0]?.apiKey ?? '';
    const providerConfig = AI_PROVIDER_BASE[setting.provider as AiProviderType];
    if (!apiKey && providerConfig?.requiresApiKey) {
      return {
        success: false,
        message: 'No API key configured',
      };
    }

    const result = await this.testProvider(
      setting.provider,
      apiKey,
      setting.model,
      setting.baseUrl ?? undefined
    );

    // Update test result in DB
    await this.db
      .update(schema.aiProviderSettings)
      .set({
        lastTestedAt: new Date(),
        lastTestResult: result.success ? 'success' : result.message,
        updatedAt: new Date(),
      })
      .where(eq(schema.aiProviderSettings.id, id));

    return result;
  }

  /**
   * Generate analysis using the default or specified provider
   */
  async generateAnalysis(prompt: string, providerId?: string): Promise<AnalysisResultDto> {
    let setting: AiProviderSettingsDto | null;

    if (providerId) {
      setting = await this.getProviderSettingById(providerId);
    } else {
      setting = await this.getDefaultProvider();
    }

    if (!setting) {
      throw new BadRequestException(
        'No AI provider configured. Please configure an AI provider in settings.'
      );
    }

    // Get the actual API key
    const dbResult = await this.db
      .select({ apiKey: schema.aiProviderSettings.apiKey })
      .from(schema.aiProviderSettings)
      .where(eq(schema.aiProviderSettings.id, setting.id))
      .limit(1);

    const apiKey = dbResult[0]?.apiKey;
    if (!apiKey) {
      throw new BadRequestException('AI provider has no API key configured');
    }

    const strategy = this.strategies.get(setting.provider);
    if (!strategy) {
      throw new BadRequestException(`Unknown provider: ${setting.provider}`);
    }

    const options: AiGenerationOptions = {
      apiKey,
      model: setting.model,
      maxTokens: setting.maxTokens ?? 1000,
      temperature: setting.temperature ?? 0.7,
    };
    if (setting.baseUrl) {
      options.baseUrl = setting.baseUrl;
    }

    const result = await strategy.generateText(prompt, options);

    const response: AnalysisResultDto = {
      analysis: result.text,
      provider: setting.provider,
      model: setting.model,
    };
    if (result.tokensUsed !== undefined) {
      response.tokensUsed = result.tokensUsed;
    }
    return response;
  }

  /**
   * Generate analysis using system and user prompts (for structured output)
   */
  async generateAnalysisWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    providerId?: string
  ): Promise<AnalysisResultDto> {
    let setting: AiProviderSettingsDto | null;

    if (providerId) {
      setting = await this.getProviderSettingById(providerId);
    } else {
      setting = await this.getDefaultProvider();
    }

    if (!setting) {
      throw new BadRequestException(
        'No AI provider configured. Please configure an AI provider in settings.'
      );
    }

    // Get the actual API key
    const dbResult = await this.db
      .select({ apiKey: schema.aiProviderSettings.apiKey })
      .from(schema.aiProviderSettings)
      .where(eq(schema.aiProviderSettings.id, setting.id))
      .limit(1);

    const apiKey = dbResult[0]?.apiKey;
    if (!apiKey) {
      throw new BadRequestException('AI provider has no API key configured');
    }

    const strategy = this.strategies.get(setting.provider);
    if (!strategy) {
      throw new BadRequestException(`Unknown provider: ${setting.provider}`);
    }

    const options: AiGenerationOptions = {
      apiKey,
      model: setting.model,
      maxTokens: setting.maxTokens ?? 2000, // Higher limit for structured analysis
      temperature: setting.temperature ?? 0.3, // Lower temperature for more consistent JSON output
    };
    if (setting.baseUrl) {
      options.baseUrl = setting.baseUrl;
    }

    const result = await strategy.generateTextWithSystemPrompt(systemPrompt, userPrompt, options);

    const response: AnalysisResultDto = {
      analysis: result.text,
      provider: setting.provider,
      model: setting.model,
    };
    if (result.tokensUsed !== undefined) {
      response.tokensUsed = result.tokensUsed;
    }
    return response;
  }

  /**
   * Generate issue analysis prompt
   */
  buildIssueAnalysisPrompt(issue: {
    title: string;
    sampleMessage: string;
    source: string;
    category?: string | null;
    occurrenceCount: number;
    exceptionType?: string | null;
  }): string {
    return `Analyze this error/issue from a ${issue.source} media server:

**Issue:** ${issue.title}
**Category:** ${issue.category ?? 'Unknown'}
**Occurrences:** ${issue.occurrenceCount}
${issue.exceptionType ? `**Exception Type:** ${issue.exceptionType}` : ''}

**Sample Error Message:**
\`\`\`
${issue.sampleMessage}
\`\`\`

Please provide:
1. A brief explanation of what this error means
2. The likely root cause
3. Potential impact on the system/users
4. Recommended steps to fix or mitigate

Keep the response concise and actionable.`;
  }

  /**
   * Get AI usage statistics from the aiAnalyses table
   */
  async getUsageStats(query?: {
    startDate?: string;
    endDate?: string;
    provider?: string;
  }): Promise<{
    totalAnalyses: number;
    totalTokens: number;
    analysesByProvider: Record<string, { count: number; tokens: number }>;
    dailyUsage: Array<{ date: string; count: number; tokens: number }>;
  }> {
    const conditions: ReturnType<typeof and>[] = [];

    if (query?.startDate) {
      conditions.push(gte(schema.aiAnalyses.createdAt, new Date(query.startDate)));
    }
    if (query?.endDate) {
      conditions.push(lte(schema.aiAnalyses.createdAt, new Date(query.endDate)));
    }
    if (query?.provider) {
      conditions.push(eq(schema.aiAnalyses.provider, query.provider));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total counts
    const totals = await this.db
      .select({
        count: count(),
        tokens: sql<number>`COALESCE(SUM(${schema.aiAnalyses.tokensUsed}), 0)`,
      })
      .from(schema.aiAnalyses)
      .where(whereClause);

    // Get breakdown by provider
    const byProvider = await this.db
      .select({
        provider: schema.aiAnalyses.provider,
        count: count(),
        tokens: sql<number>`COALESCE(SUM(${schema.aiAnalyses.tokensUsed}), 0)`,
      })
      .from(schema.aiAnalyses)
      .where(whereClause)
      .groupBy(schema.aiAnalyses.provider);

    // Get daily usage (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyConditions = [...conditions];
    dailyConditions.push(gte(schema.aiAnalyses.createdAt, thirtyDaysAgo));

    const dailyUsage = await this.db
      .select({
        date: sql<string>`DATE(${schema.aiAnalyses.createdAt})`,
        count: count(),
        tokens: sql<number>`COALESCE(SUM(${schema.aiAnalyses.tokensUsed}), 0)`,
      })
      .from(schema.aiAnalyses)
      .where(dailyConditions.length > 0 ? and(...dailyConditions) : undefined)
      .groupBy(sql`DATE(${schema.aiAnalyses.createdAt})`)
      .orderBy(sql`DATE(${schema.aiAnalyses.createdAt})`);

    const analysesByProvider: Record<string, { count: number; tokens: number }> = {};
    for (const row of byProvider) {
      analysesByProvider[row.provider] = {
        count: Number(row.count),
        tokens: Number(row.tokens),
      };
    }

    return {
      totalAnalyses: Number(totals[0]?.count ?? 0),
      totalTokens: Number(totals[0]?.tokens ?? 0),
      analysesByProvider,
      dailyUsage: dailyUsage.map((d) => ({
        date: String(d.date),
        count: Number(d.count),
        tokens: Number(d.tokens),
      })),
    };
  }

  /**
   * Get AI analysis history with pagination
   */
  async getAnalysisHistory(query?: {
    limit?: number;
    offset?: number;
    provider?: string;
  }): Promise<{
    data: Array<{
      id: string;
      provider: string;
      prompt: string;
      response: string;
      tokensUsed: number | null;
      createdAt: Date;
      serverId: string | null;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = Math.min(query?.limit ?? 20, 100);
    const offset = query?.offset ?? 0;

    const conditions: ReturnType<typeof eq>[] = [];
    if (query?.provider) {
      conditions.push(eq(schema.aiAnalyses.provider, query.provider));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(schema.aiAnalyses)
        .where(whereClause)
        .orderBy(desc(schema.aiAnalyses.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(schema.aiAnalyses).where(whereClause),
    ]);

    return {
      data: data.map((row) => ({
        id: row.id,
        provider: row.provider,
        prompt: row.prompt,
        response: row.response,
        tokensUsed: row.tokensUsed,
        createdAt: row.createdAt,
        serverId: row.serverId,
      })),
      total: Number(totalResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  private toSettingsDto(
    setting: typeof schema.aiProviderSettings.$inferSelect
  ): AiProviderSettingsDto {
    return {
      id: setting.id,
      provider: setting.provider as AiProviderType,
      name: setting.name,
      hasApiKey: !!setting.apiKey,
      baseUrl: setting.baseUrl,
      model: setting.model,
      maxTokens: setting.maxTokens,
      temperature: setting.temperature,
      isDefault: setting.isDefault,
      isEnabled: setting.isEnabled,
      lastTestedAt: setting.lastTestedAt,
      lastTestResult: setting.lastTestResult,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    };
  }
}
