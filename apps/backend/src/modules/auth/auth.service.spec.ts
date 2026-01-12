import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as bcryptModule from 'bcrypt';

// Mock bcrypt module
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
  hash: vi.fn(),
  compare: vi.fn(),
}));

import { AuthService, JwtPayload, AuthResponse, SetupStatus } from './auth.service';
import { SettingsService } from '../settings/settings.service';
import type { SetupDto, LoginDto, UpdatePasswordDto } from './dto';

const bcrypt = bcryptModule as unknown as {
  hash: ReturnType<typeof vi.fn>;
  compare: ReturnType<typeof vi.fn>;
};

describe('AuthService', () => {
  let service: AuthService;
  let settingsService: {
    isSetupCompleted: ReturnType<typeof vi.fn>;
    getSetupToken: ReturnType<typeof vi.fn>;
    setSetupToken: ReturnType<typeof vi.fn>;
    consumeSetupToken: ReturnType<typeof vi.fn>;
    markSetupCompleted: ReturnType<typeof vi.fn>;
    setAdminCredentials: ReturnType<typeof vi.fn>;
    getAdminCredentials: ReturnType<typeof vi.fn>;
    getAdminCreatedAt: ReturnType<typeof vi.fn>;
    getOrCreateJwtSecret: ReturnType<typeof vi.fn>;
    getSecuritySettings: ReturnType<typeof vi.fn>;
    updateAdminPassword: ReturnType<typeof vi.fn>;
  };
  let jwtService: {
    signAsync: ReturnType<typeof vi.fn>;
    verifyAsync: ReturnType<typeof vi.fn>;
  };

  // Test data
  const mockJwtSecret = 'test-jwt-secret-for-testing';
  const mockSetupToken = 'a1b2c3d4e5f6'.repeat(4); // 64 hex chars
  const mockUsername = 'admin';
  const mockPassword = 'SecurePassword123!';
  const mockPasswordHash = '$2b$12$abcdefghijklmnopqrstuvwxyz';
  const mockAccessToken = 'mock.jwt.token';
  const mockCreatedAt = '2024-01-01T00:00:00.000Z';

  // Mock JwtPayload
  const mockJwtPayload: JwtPayload = {
    sub: mockUsername,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const mockSecuritySettings = {
    jwtExpirationMs: '1h',
    sessionTimeoutMs: 3600000,
    failedLoginThreshold: 5,
    failedLoginWindowMs: 300000,
  };

  beforeEach(async () => {
    const mockSettingsService = {
      isSetupCompleted: vi.fn(),
      getSetupToken: vi.fn(),
      setSetupToken: vi.fn(),
      consumeSetupToken: vi.fn(),
      markSetupCompleted: vi.fn(),
      setAdminCredentials: vi.fn(),
      getAdminCredentials: vi.fn(),
      getAdminCreatedAt: vi.fn(),
      getOrCreateJwtSecret: vi.fn(),
      getSecuritySettings: vi.fn(),
      updateAdminPassword: vi.fn(),
    };

    const mockJwtService = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    settingsService = mockSettingsService;
    jwtService = mockJwtService;

    // Default mock implementations
    settingsService.getOrCreateJwtSecret.mockResolvedValue(mockJwtSecret);
    settingsService.getSecuritySettings.mockResolvedValue(mockSecuritySettings);
    jwtService.signAsync.mockResolvedValue(mockAccessToken);
    jwtService.verifyAsync.mockResolvedValue(mockJwtPayload);

    // Set default bcrypt mocks
    bcrypt.hash.mockResolvedValue(mockPasswordHash);
    bcrypt.compare.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSetupToken', () => {
    it('should generate a setup token when setup is not completed', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(false);

      const result = await service.generateSetupToken();

      expect(result).toBeDefined();
      expect(result).toMatch(/^[a-f0-9]{64}$/); // 64 hex chars
      expect(settingsService.setSetupToken).toHaveBeenCalledWith(result);
    });

    it('should throw BadRequestException when setup is already completed', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(true);

      await expect(service.generateSetupToken()).rejects.toThrow(
        new BadRequestException('Setup has already been completed')
      );
      expect(settingsService.setSetupToken).not.toHaveBeenCalled();
    });
  });

  describe('getSetupStatus', () => {
    it('should return setupRequired: false when setup is completed', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(true);

      const result: SetupStatus = await service.getSetupStatus();

      expect(result).toEqual({ setupRequired: false });
      expect(result.setupToken).toBeUndefined();
    });

    it('should return setupRequired: true with existing token', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(false);
      settingsService.getSetupToken.mockResolvedValue(mockSetupToken);

      const result: SetupStatus = await service.getSetupStatus();

      expect(result).toEqual({
        setupRequired: true,
        setupToken: mockSetupToken,
      });
      expect(settingsService.setSetupToken).not.toHaveBeenCalled();
    });

    it('should generate new token if none exists', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(false);
      settingsService.getSetupToken.mockResolvedValue(null);
      settingsService.setSetupToken.mockResolvedValue(undefined);

      const result: SetupStatus = await service.getSetupStatus();

      expect(result.setupRequired).toBe(true);
      expect(result.setupToken).toBeDefined();
      expect(result.setupToken).toMatch(/^[a-f0-9]{64}$/);
      expect(settingsService.setSetupToken).toHaveBeenCalled();
    });
  });

  describe('setup', () => {
    const mockSetupDto: SetupDto = {
      setupToken: mockSetupToken,
      username: mockUsername,
      password: mockPassword,
    };

    it('should complete setup successfully with valid token', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(false);
      settingsService.getSetupToken.mockResolvedValue(mockSetupToken);
      bcrypt.hash.mockResolvedValue(mockPasswordHash);

      const result: AuthResponse = await service.setup(mockSetupDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(mockPassword, 12);
      expect(settingsService.setAdminCredentials).toHaveBeenCalledWith(
        mockUsername,
        mockPasswordHash
      );
      expect(settingsService.consumeSetupToken).toHaveBeenCalled();
      expect(settingsService.markSetupCompleted).toHaveBeenCalled();
      expect(result.accessToken).toBe(mockAccessToken);
      expect(result.user.username).toBe(mockUsername);
      expect(result.user.createdAt).toBeDefined();
    });

    it('should throw BadRequestException when setup is already completed', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(true);

      await expect(service.setup(mockSetupDto)).rejects.toThrow(
        new BadRequestException('Setup has already been completed')
      );
      expect(settingsService.getSetupToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid setup token', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(false);
      settingsService.getSetupToken.mockResolvedValue(mockSetupToken);

      const invalidDto = { ...mockSetupDto, setupToken: 'invalid-token' };

      await expect(service.setup(invalidDto)).rejects.toThrow(
        new UnauthorizedException('Invalid setup token')
      );
      expect(settingsService.setAdminCredentials).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when no setup token exists', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(false);
      settingsService.getSetupToken.mockResolvedValue(null);

      await expect(service.setup(mockSetupDto)).rejects.toThrow(
        new UnauthorizedException('Invalid setup token')
      );
    });
  });

  describe('login', () => {
    const mockLoginDto: LoginDto = {
      username: mockUsername,
      password: mockPassword,
    };

    it('should login successfully with valid credentials', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(true);
      settingsService.getAdminCredentials.mockResolvedValue({
        username: mockUsername,
        passwordHash: mockPasswordHash,
      });
      bcrypt.compare.mockResolvedValue(true);

      const result: AuthResponse = await service.login(mockLoginDto);

      expect(bcrypt.compare).toHaveBeenCalledWith(mockPassword, mockPasswordHash);
      expect(result.accessToken).toBe(mockAccessToken);
      expect(result.user.username).toBe(mockUsername);
      expect(result.user.createdAt).toBeDefined();
    });

    it('should throw BadRequestException when setup is not completed', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(false);

      await expect(service.login(mockLoginDto)).rejects.toThrow(
        new BadRequestException('Setup must be completed first')
      );
    });

    it('should throw UnauthorizedException with invalid username', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(true);
      settingsService.getAdminCredentials.mockResolvedValue({
        username: 'different-username',
        passwordHash: mockPasswordHash,
      });

      await expect(service.login(mockLoginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials')
      );
    });

    it('should throw UnauthorizedException with invalid password', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(true);
      settingsService.getAdminCredentials.mockResolvedValue({
        username: mockUsername,
        passwordHash: mockPasswordHash,
      });
      bcrypt.compare.mockResolvedValue(false);

      await expect(service.login(mockLoginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials')
      );
    });

    it('should throw UnauthorizedException when credentials not found', async () => {
      settingsService.isSetupCompleted.mockResolvedValue(true);
      settingsService.getAdminCredentials.mockResolvedValue({
        username: null,
        passwordHash: null,
      });

      await expect(service.login(mockLoginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials')
      );
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      const token = 'valid.jwt.token';

      const result: JwtPayload = await service.validateToken(token);

      expect(result).toEqual(mockJwtPayload);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(token, {
        secret: mockJwtSecret,
      });
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const token = 'invalid.token';

      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.validateToken(token)).rejects.toThrow(
        new UnauthorizedException('Invalid token')
      );
    });

    it('should throw UnauthorizedException when verification fails', async () => {
      const token = 'expired.token';

      jwtService.verifyAsync.mockRejectedValue(new Error('Token expired'));

      await expect(service.validateToken(token)).rejects.toThrow(
        new UnauthorizedException('Invalid token')
      );
    });
  });

  describe('me', () => {
    it('should return user info for valid username', async () => {
      settingsService.getAdminCredentials.mockResolvedValue({
        username: mockUsername,
        passwordHash: mockPasswordHash,
      });
      settingsService.getAdminCreatedAt.mockResolvedValue(mockCreatedAt);

      const result = await service.me(mockUsername);

      expect(result).toEqual({
        username: mockUsername,
        createdAt: mockCreatedAt,
      });
    });

    it('should throw UnauthorizedException for mismatched username', async () => {
      settingsService.getAdminCredentials.mockResolvedValue({
        username: 'different-user',
        passwordHash: mockPasswordHash,
      });

      await expect(service.me('wrong-user')).rejects.toThrow(
        new UnauthorizedException('Invalid token')
      );
    });

    it('should throw UnauthorizedException when no username in credentials', async () => {
      settingsService.getAdminCredentials.mockResolvedValue({
        username: null,
        passwordHash: mockPasswordHash,
      });

      await expect(service.me('any-user')).rejects.toThrow(
        new UnauthorizedException('Invalid token')
      );
    });
  });

  describe('updatePassword', () => {
    const mockUpdatePasswordDto: UpdatePasswordDto = {
      currentPassword: mockPassword,
      newPassword: 'NewSecurePassword456!',
    };

    it('should update password successfully with valid current password', async () => {
      settingsService.getAdminCredentials.mockResolvedValue({
        username: mockUsername,
        passwordHash: mockPasswordHash,
      });
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('new-hash');

      await service.updatePassword(mockUsername, mockUpdatePasswordDto);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        mockPassword,
        mockPasswordHash
      );
      expect(bcrypt.hash).toHaveBeenCalledWith('NewSecurePassword456!', 12);
      expect(settingsService.updateAdminPassword).toHaveBeenCalledWith(
        'new-hash'
      );
    });

    it('should throw UnauthorizedException with invalid current password', async () => {
      settingsService.getAdminCredentials.mockResolvedValue({
        username: mockUsername,
        passwordHash: mockPasswordHash,
      });
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.updatePassword(mockUsername, mockUpdatePasswordDto)
      ).rejects.toThrow(
        new UnauthorizedException('Current password is incorrect')
      );
      expect(settingsService.updateAdminPassword).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for mismatched username', async () => {
      settingsService.getAdminCredentials.mockResolvedValue({
        username: 'different-user',
        passwordHash: mockPasswordHash,
      });

      await expect(
        service.updatePassword(mockUsername, mockUpdatePasswordDto)
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('should throw UnauthorizedException when credentials not found', async () => {
      settingsService.getAdminCredentials.mockResolvedValue({
        username: null,
        passwordHash: null,
      });

      await expect(
        service.updatePassword(mockUsername, mockUpdatePasswordDto)
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });
  });

  describe('generateToken (private)', () => {
    it('should generate JWT token with correct payload', async () => {
      settingsService.getOrCreateJwtSecret.mockResolvedValue(mockJwtSecret);
      settingsService.getSecuritySettings.mockResolvedValue(mockSecuritySettings);
      jwtService.signAsync.mockResolvedValue(mockAccessToken);
      bcrypt.compare.mockResolvedValue(true);

      // Access via login to trigger private method
      settingsService.isSetupCompleted.mockResolvedValue(true);
      settingsService.getAdminCredentials.mockResolvedValue({
        username: mockUsername,
        passwordHash: mockPasswordHash,
      });

      await service.login({ username: mockUsername, password: mockPassword });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: mockUsername },
        {
          secret: mockJwtSecret,
          expiresIn: mockSecuritySettings.jwtExpirationMs,
        }
      );
    });
  });
});
