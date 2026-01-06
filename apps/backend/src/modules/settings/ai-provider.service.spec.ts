import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';

import { AiProviderService } from './ai-provider.service';

import type { TestingModule } from '@nestjs/testing';

describe('AiProviderService', () => {
  let service: AiProviderService;
  let mockDb: MockDb;

  const mockProviderSetting = {
    id: 'provider-1',
    provider: 'openai',
    name: 'OpenAI GPT-4',
    apiKey: 'sk-test-key',
    baseUrl: null,
    model: 'gpt-4',
    maxTokens: 1000,
    temperature: 0.7,
    isDefault: true,
    isEnabled: true,
    lastTestedAt: null,
    lastTestResult: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiProviderService, { provide: DATABASE_CONNECTION, useValue: mockDb }],
    }).compile();

    service = module.get<AiProviderService>(AiProviderService);
  });

  describe('getAvailableProviders', () => {
    it('should return list of available providers', () => {
      const providers = service.getAvailableProviders();

      expect(providers).toBeInstanceOf(Array);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should include openai provider', () => {
      const providers = service.getAvailableProviders();

      const openai = providers.find((p) => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai?.name).toBeDefined();
    });

    it('should include anthropic provider', () => {
      const providers = service.getAvailableProviders();

      const anthropic = providers.find((p) => p.id === 'anthropic');
      expect(anthropic).toBeDefined();
    });

    it('should include google provider', () => {
      const providers = service.getAvailableProviders();

      const google = providers.find((p) => p.id === 'google');
      expect(google).toBeDefined();
    });

    it('should include ollama provider', () => {
      const providers = service.getAvailableProviders();

      const ollama = providers.find((p) => p.id === 'ollama');
      expect(ollama).toBeDefined();
    });

    it('should include lmstudio provider', () => {
      const providers = service.getAvailableProviders();

      const lmstudio = providers.find((p) => p.id === 'lmstudio');
      expect(lmstudio).toBeDefined();
    });

    it('should include fallback models for each provider', () => {
      const providers = service.getAvailableProviders();

      for (const provider of providers) {
        expect(provider).toHaveProperty('models');
        expect(provider.models).toBeInstanceOf(Array);
      }
    });
  });

  describe('getProviderSettings', () => {
    it('should return all provider settings', async () => {
      const settings = [mockProviderSetting, { ...mockProviderSetting, id: 'provider-2' }];
      configureMockDb(mockDb, { select: settings });

      const result = await service.getProviderSettings();

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no settings', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getProviderSettings();

      expect(result).toEqual([]);
    });

    it('should mask API keys in response', async () => {
      configureMockDb(mockDb, { select: [mockProviderSetting] });

      const result = await service.getProviderSettings();

      expect(result[0]?.hasApiKey).toBe(true);
      expect(result[0]).not.toHaveProperty('apiKey');
    });
  });

  describe('getProviderSettingById', () => {
    it('should return provider setting by id', async () => {
      configureMockDb(mockDb, { select: [mockProviderSetting] });

      const result = await service.getProviderSettingById('provider-1');

      expect(result.id).toBe('provider-1');
    });

    it('should throw NotFoundException when not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.getProviderSettingById('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getDefaultProvider', () => {
    it('should return default provider setting', async () => {
      configureMockDb(mockDb, { select: [mockProviderSetting] });

      const result = await service.getDefaultProvider();

      expect(result).not.toBeNull();
      expect(result?.isDefault).toBe(true);
    });

    it('should fallback to any enabled provider if no default', async () => {
      const nonDefaultProvider = { ...mockProviderSetting, isDefault: false };

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [] : [nonDefaultProvider];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDefaultProvider();

      expect(result).not.toBeNull();
    });

    it('should return null when no providers configured', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDefaultProvider();

      expect(result).toBeNull();
    });
  });

  describe('createProviderSetting', () => {
    it('should create new provider setting', async () => {
      configureMockDb(mockDb, { insert: [mockProviderSetting], update: [] });

      const dto = {
        provider: 'openai' as const,
        name: 'OpenAI GPT-4',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
      };

      const result = await service.createProviderSetting(dto);

      expect(result.provider).toBe('openai');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw BadRequestException for unknown provider', async () => {
      const dto = {
        provider: 'unknown' as const,
        name: 'Unknown Provider',
        apiKey: 'test-key',
        model: 'model',
      };

      await expect(service.createProviderSetting(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should unset other defaults when setting new default', async () => {
      configureMockDb(mockDb, { insert: [mockProviderSetting], update: [] });

      const dto = {
        provider: 'openai' as const,
        name: 'OpenAI GPT-4',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        isDefault: true,
      };

      await service.createProviderSetting(dto);

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('updateProviderSetting', () => {
    it('should update provider setting', async () => {
      const updatedSetting = { ...mockProviderSetting, name: 'Updated Name' };
      configureMockDb(mockDb, { select: [mockProviderSetting], update: [updatedSetting] });

      const result = await service.updateProviderSetting('provider-1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException when not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.updateProviderSetting('non-existent', { name: 'Test' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('should unset other defaults when setting as default', async () => {
      configureMockDb(mockDb, { select: [mockProviderSetting], update: [mockProviderSetting] });

      await service.updateProviderSetting('provider-1', { isDefault: true });

      // First update call is for unsetting other defaults
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('deleteProviderSetting', () => {
    it('should delete provider setting', async () => {
      configureMockDb(mockDb, { select: [mockProviderSetting], delete: [] });

      await service.deleteProviderSetting('provider-1');

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.deleteProviderSetting('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('testProvider', () => {
    it('should return failure for unknown provider', async () => {
      const result = await service.testProvider('unknown' as any, 'key', 'model');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown provider');
    });

    it('should return result with response time', async () => {
      // This will fail because we can't mock fetch easily
      const result = await service.testProvider('openai', 'invalid-key', 'gpt-4');

      expect(result).toHaveProperty('responseTime');
    });
  });

  describe('testProviderSetting', () => {
    it('should test existing provider setting', async () => {
      configureMockDb(mockDb, { select: [mockProviderSetting], update: [mockProviderSetting] });

      const result = await service.testProviderSetting('provider-1');

      expect(result).toHaveProperty('success');
    });

    it('should return failure when no API key', async () => {
      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [mockProviderSetting] : [{ apiKey: null }];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.testProviderSetting('provider-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No API key');
    });
  });

  describe('buildIssueAnalysisPrompt', () => {
    it('should build prompt with issue details', () => {
      const issue = {
        title: 'Connection Error',
        sampleMessage: 'Failed to connect to database',
        source: 'jellyfin',
        category: 'database',
        occurrenceCount: 10,
        exceptionType: 'ConnectionException',
      };

      const prompt = service.buildIssueAnalysisPrompt(issue);

      expect(prompt).toContain('Connection Error');
      expect(prompt).toContain('Failed to connect to database');
      expect(prompt).toContain('jellyfin');
      expect(prompt).toContain('database');
      expect(prompt).toContain('10');
      expect(prompt).toContain('ConnectionException');
    });

    it('should handle null category', () => {
      const issue = {
        title: 'Error',
        sampleMessage: 'Something went wrong',
        source: 'system',
        category: null,
        occurrenceCount: 1,
        exceptionType: null,
      };

      const prompt = service.buildIssueAnalysisPrompt(issue);

      expect(prompt).toContain('Unknown');
    });

    it('should not include exception type when null', () => {
      const issue = {
        title: 'Error',
        sampleMessage: 'Something went wrong',
        source: 'system',
        category: 'general',
        occurrenceCount: 1,
        exceptionType: null,
      };

      const prompt = service.buildIssueAnalysisPrompt(issue);

      expect(prompt).not.toContain('Exception Type');
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      configureMockDb(mockDb, { select: [{ count: 10, tokens: 1000 }] });

      const result = await service.getUsageStats();

      expect(result).toHaveProperty('totalAnalyses');
      expect(result).toHaveProperty('totalTokens');
      expect(result).toHaveProperty('analysesByProvider');
      expect(result).toHaveProperty('dailyUsage');
    });

    it('should filter by date range', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.getUsageStats({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by provider', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.getUsageStats({ provider: 'openai' });

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getAnalysisHistory', () => {
    it('should return paginated analysis history', async () => {
      const history = [
        {
          id: '1',
          provider: 'openai',
          prompt: 'test',
          response: 'response',
          tokensUsed: 100,
          createdAt: new Date(),
          serverId: 'server-1',
        },
      ];
      configureMockDb(mockDb, { select: history });

      const result = await service.getAnalysisHistory();

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('offset');
    });

    it('should cap limit at 100', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getAnalysisHistory({ limit: 500 });

      expect(result.limit).toBe(100);
    });

    it('should filter by provider', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.getAnalysisHistory({ provider: 'anthropic' });

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('generateAnalysis', () => {
    it('should throw BadRequestException when no provider configured', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.generateAnalysis('test prompt')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when provider has no API key', async () => {
      // Mock the DB calls that generateAnalysis makes:
      // 1. getDefaultProvider - select from aiProviderSettings where isDefault & isEnabled
      // 2. Get API key - select apiKey from aiProviderSettings where id
      // The third call returns null for the API key
      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        // First call returns the provider, second returns null apiKey
        const result = callCount <= 1 ? [mockProviderSetting] : [{ apiKey: null }];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      await expect(service.generateAnalysis('test prompt')).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateAnalysisWithSystemPrompt', () => {
    it('should throw BadRequestException when no provider configured', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.generateAnalysisWithSystemPrompt('system', 'user')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('fetchProviderModels', () => {
    it('should throw BadRequestException for unknown provider', async () => {
      await expect(service.fetchProviderModels('unknown' as any, 'key')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should return fallback models on error', async () => {
      // This will fail the fetch but return fallback models
      const models = await service.fetchProviderModels('openai', 'invalid-key');

      expect(models).toBeInstanceOf(Array);
    });

    it('should return hardcoded models for Anthropic', async () => {
      const models = await service.fetchProviderModels('anthropic', 'any-key');

      expect(models).toBeInstanceOf(Array);
      expect(models.some((m) => m.id.includes('claude'))).toBe(true);
    });
  });

  describe('fetchModelsForSetting', () => {
    it('should throw NotFoundException for non-existent setting', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.fetchModelsForSetting('non-existent-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should fetch models using stored API key', async () => {
      const mockSetting = {
        id: 'provider-1',
        provider: 'anthropic',
        name: 'Test Provider',
        apiKey: 'test-key',
        model: 'claude-3-opus',
        maxTokens: 1000,
        temperature: '0.7',
        baseUrl: null,
        isDefault: true,
        isEnabled: true,
        lastTestedAt: null,
        lastTestResult: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First call returns the setting, second call returns the API key
      let callCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              return Promise.resolve([mockSetting]);
            }),
          }),
        }),
      }));

      const models = await service.fetchModelsForSetting('provider-1');

      expect(models).toBeInstanceOf(Array);
      expect(models.some((m) => m.id.includes('claude'))).toBe(true);
    });
  });
});
