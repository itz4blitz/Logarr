import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalOnlyGuard } from './guards/local-only.guard';

import type { AuthResponse, SetupStatus } from './auth.service';
import type { TestingModule } from '@nestjs/testing';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    getSetupStatus: ReturnType<typeof vi.fn>;
    setup: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    me: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
  };

  // Test data
  const mockSetupToken = 'a1b2c3d4e5f6'.repeat(4);
  const mockUsername = 'admin';
  const mockPassword = 'SecurePassword123!';
  const mockAccessToken = 'mock.jwt.token';
  const mockCreatedAt = '2024-01-01T00:00:00.000Z';

  const mockAuthResponse: AuthResponse = {
    accessToken: mockAccessToken,
    user: {
      username: mockUsername,
      createdAt: mockCreatedAt,
    },
  };

  const mockSetupStatusWithToken: SetupStatus = {
    setupRequired: true,
    setupToken: mockSetupToken,
  };

  const mockSetupStatusCompleted: SetupStatus = {
    setupRequired: false,
  };

  beforeEach(async () => {
    const mockAuthService = {
      getSetupStatus: vi.fn(),
      setup: vi.fn(),
      login: vi.fn(),
      me: vi.fn(),
      updatePassword: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(LocalOnlyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = mockAuthService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getSetupStatus', () => {
    it('should return setup status with token when setup is required', async () => {
      authService.getSetupStatus.mockResolvedValue(mockSetupStatusWithToken);

      const result = await controller.getSetupStatus();

      expect(result).toEqual(mockSetupStatusWithToken);
      expect(authService.getSetupStatus).toHaveBeenCalled();
    });

    it('should return setup status without token when setup is completed', async () => {
      authService.getSetupStatus.mockResolvedValue(mockSetupStatusCompleted);

      const result = await controller.getSetupStatus();

      expect(result).toEqual(mockSetupStatusCompleted);
      expect(result.setupToken).toBeUndefined();
    });

    it('should be accessible without authentication (Public decorator)', () => {
      // Verify the endpoint is decorated with @Public()
      const metadata = Reflect.getMetadata('isPublic', AuthController.prototype.getSetupStatus);
      expect(metadata).toBe(true);
    });
  });

  describe('setup', () => {
    const setupDto = {
      setupToken: mockSetupToken,
      username: mockUsername,
      password: mockPassword,
    };

    it('should complete setup successfully', async () => {
      authService.setup.mockResolvedValue(mockAuthResponse);

      const result = await controller.setup(setupDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.setup).toHaveBeenCalledWith(setupDto);
    });

    it('should throw BadRequestException when setup already completed', async () => {
      authService.setup.mockRejectedValue(
        new BadRequestException('Setup has already been completed')
      );

      await expect(controller.setup(setupDto)).rejects.toThrow(
        new BadRequestException('Setup has already been completed')
      );
    });

    it('should throw UnauthorizedException with invalid setup token', async () => {
      authService.setup.mockRejectedValue(new UnauthorizedException('Invalid setup token'));

      await expect(controller.setup(setupDto)).rejects.toThrow(
        new UnauthorizedException('Invalid setup token')
      );
    });

    it('should be accessible without authentication (Public decorator)', () => {
      const metadata = Reflect.getMetadata('isPublic', AuthController.prototype.setup);
      expect(metadata).toBe(true);
    });
  });

  describe('login', () => {
    const loginDto = {
      username: mockUsername,
      password: mockPassword,
    };

    it('should login successfully with valid credentials', async () => {
      authService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });

    it('should throw UnauthorizedException with invalid credentials', async () => {
      authService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      await expect(controller.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials')
      );
    });

    it('should throw BadRequestException when setup not completed', async () => {
      authService.login.mockRejectedValue(new BadRequestException('Setup must be completed first'));

      await expect(controller.login(loginDto)).rejects.toThrow(
        new BadRequestException('Setup must be completed first')
      );
    });

    it('should be accessible without authentication (Public decorator)', () => {
      const metadata = Reflect.getMetadata('isPublic', AuthController.prototype.login);
      expect(metadata).toBe(true);
    });
  });

  describe('me', () => {
    const mockUserInfo = {
      username: mockUsername,
      createdAt: mockCreatedAt,
    };

    it('should return current user info', async () => {
      authService.me.mockResolvedValue(mockUserInfo);

      const req = { user: { sub: mockUsername } };

      const result = await controller.me(req as { user: { sub: string } });

      expect(result).toEqual(mockUserInfo);
      expect(authService.me).toHaveBeenCalledWith(mockUsername);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      authService.me.mockRejectedValue(new UnauthorizedException('Invalid token'));

      const req = { user: { sub: 'unknown-user' } };

      await expect(controller.me(req)).rejects.toThrow(new UnauthorizedException('Invalid token'));
    });
  });

  describe('updatePassword', () => {
    const updatePasswordDto = {
      currentPassword: mockPassword,
      newPassword: 'NewSecurePassword456!',
    };

    it('should update password successfully', async () => {
      authService.updatePassword.mockResolvedValue(undefined);

      const req = { user: { sub: mockUsername } };

      await controller.updatePassword(req, updatePasswordDto);

      expect(authService.updatePassword).toHaveBeenCalledWith(mockUsername, updatePasswordDto);
    });

    it('should throw UnauthorizedException with invalid current password', async () => {
      authService.updatePassword.mockRejectedValue(
        new UnauthorizedException('Current password is incorrect')
      );

      const req = { user: { sub: mockUsername } };

      await expect(controller.updatePassword(req, updatePasswordDto)).rejects.toThrow(
        new UnauthorizedException('Current password is incorrect')
      );
    });
  });

  describe('logout', () => {
    it('should logout successfully (no-op for stateless JWT)', () => {
      const result = controller.logout();

      expect(result).toBeUndefined();
      // Since JWT is stateless, logout is a no-op on the server
      // The client handles token disposal
    });
  });
});
