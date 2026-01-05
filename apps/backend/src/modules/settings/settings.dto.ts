// AI Provider Types
export type AiProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'lmstudio';

export interface AiModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  maxOutput?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
}

export interface AiProviderInfo {
  id: AiProviderType;
  name: string;
  website: string;
  requiresApiKey: boolean;
  supportsBaseUrl: boolean;
  models: AiModelInfo[];
}

// DTOs for API requests/responses
export interface CreateAiProviderDto {
  provider: AiProviderType;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  isDefault?: boolean;
  isEnabled?: boolean;
}

export interface UpdateAiProviderDto {
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  isDefault?: boolean;
  isEnabled?: boolean;
}

export interface AiProviderSettingsDto {
  id: string;
  provider: AiProviderType;
  name: string;
  hasApiKey: boolean;
  baseUrl: string | null;
  model: string;
  maxTokens: number | null;
  temperature: number | null;
  isDefault: boolean;
  isEnabled: boolean;
  lastTestedAt: Date | null;
  lastTestResult: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestProviderDto {
  provider: AiProviderType;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface TestProviderResultDto {
  success: boolean;
  message: string;
  responseTime?: number;
  modelInfo?: {
    model: string;
    tokensUsed?: number;
  };
}

export interface FetchModelsDto {
  provider: AiProviderType;
  apiKey: string;
  baseUrl?: string;
}

export interface GenerateAnalysisDto {
  issueId?: string;
  logEntryId?: string;
  prompt?: string;
}

export interface AnalysisResultDto {
  analysis: string;
  suggestedFix?: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

// Base provider info (without dynamic models)
export const AI_PROVIDER_BASE: Record<AiProviderType, Omit<AiProviderInfo, 'models'>> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    website: 'https://platform.openai.com',
    requiresApiKey: true,
    supportsBaseUrl: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    website: 'https://console.anthropic.com',
    requiresApiKey: true,
    supportsBaseUrl: true,
  },
  google: {
    id: 'google',
    name: 'Google AI',
    website: 'https://aistudio.google.com',
    requiresApiKey: true,
    supportsBaseUrl: false,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    website: 'https://ollama.ai',
    requiresApiKey: false,
    supportsBaseUrl: true,
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    website: 'https://lmstudio.ai',
    requiresApiKey: false,
    supportsBaseUrl: true,
  },
};

// Fallback models when API key is not provided (commonly used models only)
export const FALLBACK_MODELS: Record<AiProviderType, AiModelInfo[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000 },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16385 },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000 },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
  ],
  google: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000 },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2000000 },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1000000 },
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128000 },
    { id: 'llama3.1', name: 'Llama 3.1', contextWindow: 128000 },
    { id: 'mistral', name: 'Mistral', contextWindow: 32000 },
    { id: 'codellama', name: 'Code Llama', contextWindow: 16000 },
  ],
  lmstudio: [{ id: 'local-model', name: 'Local Model', contextWindow: 32000 }],
};
