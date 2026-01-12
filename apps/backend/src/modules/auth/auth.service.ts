import { randomBytes } from 'crypto';

import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { SettingsService } from '../settings/settings.service';

import type { SetupDto, LoginDto, UpdatePasswordDto } from './dto';

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    username: string;
    createdAt: string | null;
  };
}

export interface SetupStatus {
  setupRequired: boolean;
  setupToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly jwtService: JwtService
  ) {}

  /**
   * Generate a setup token for first-time setup
   * Returns a high-entropy token that must be used to create the admin account
   */
  async generateSetupToken(): Promise<string> {
    const isSetupCompleted = await this.settingsService.isSetupCompleted();
    if (isSetupCompleted) {
      throw new BadRequestException('Setup has already been completed');
    }

    // Generate a high-entropy 32-byte token (64 hex chars)
    const token = randomBytes(32).toString('hex');

    // Store the token in the database
    await this.settingsService.setSetupToken(token);

    this.logger.log('Setup token generated - user must complete setup');
    return token;
  }

  /**
   * Get setup status
   */
  async getSetupStatus(): Promise<SetupStatus> {
    const isSetupCompleted = await this.settingsService.isSetupCompleted();

    if (isSetupCompleted) {
      return { setupRequired: false };
    }

    // Get existing token or generate a new one
    let setupToken = await this.settingsService.getSetupToken();
    if (!setupToken) {
      setupToken = await this.generateSetupToken();
    }

    return {
      setupRequired: true,
      setupToken,
    };
  }

  /**
   * Complete setup by creating the admin account
   * Validates the setup token and stores admin credentials
   */
  async setup(dto: SetupDto): Promise<AuthResponse> {
    // Check if setup is already completed
    const isSetupCompleted = await this.settingsService.isSetupCompleted();
    if (isSetupCompleted) {
      throw new BadRequestException('Setup has already been completed');
    }

    // Validate the setup token
    const storedToken = await this.settingsService.getSetupToken();
    if (!storedToken || storedToken !== dto.setupToken) {
      this.logger.warn('Invalid setup token provided');
      throw new UnauthorizedException('Invalid setup token');
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // Store admin credentials
    await this.settingsService.setAdminCredentials(dto.username, passwordHash);

    // Consume the setup token (remove it)
    await this.settingsService.consumeSetupToken();

    // Mark setup as completed
    await this.settingsService.markSetupCompleted();

    this.logger.log(`Setup completed - admin account created for user: ${dto.username}`);

    // Generate JWT token
    const accessToken = await this.generateToken(dto.username);

    return {
      accessToken,
      user: {
        username: dto.username,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Validate credentials and return a JWT token
   * First successful login automatically creates the admin account
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    // Check if setup has been completed
    const isSetupCompleted = await this.settingsService.isSetupCompleted();

    if (!isSetupCompleted) {
      // First user - create admin account automatically
      this.logger.log(`Creating first admin account for user: ${dto.username}`);

      // Validate password strength
      if (dto.password.length < 8) {
        throw new BadRequestException('Password must be at least 8 characters');
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

      // Store admin credentials
      await this.settingsService.setAdminCredentials(dto.username, passwordHash);

      // Mark setup as completed (no token needed for first user)
      await this.settingsService.markSetupCompleted();

      this.logger.log(`Initial setup completed - admin account created for user: ${dto.username}`);

      // Generate JWT token
      const accessToken = await this.generateToken(dto.username);

      return {
        accessToken,
        user: {
          username: dto.username,
          createdAt: new Date().toISOString(),
        },
      };
    }

    // Setup completed - validate credentials normally
    const { username, passwordHash } = await this.settingsService.getAdminCredentials();

    if (!username || !passwordHash) {
      this.logger.error('Admin credentials not found in database');
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate username (case-sensitive for security)
    if (dto.username !== username) {
      this.logger.warn(`Failed login attempt for username: ${dto.username}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate password
    const isValidPassword = await bcrypt.compare(dto.password, passwordHash);
    if (!isValidPassword) {
      this.logger.warn(`Failed login attempt for username: ${dto.username}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`Successful login for user: ${dto.username}`);

    // Generate JWT token
    const accessToken = await this.generateToken(dto.username);

    return {
      accessToken,
      user: {
        username,
        createdAt: await this.settingsService.getAdminCreatedAt(),
      },
    };
  }

  /**
   * Validate a JWT token and return the payload
   */
  async validateToken(token: string): Promise<JwtPayload> {
    try {
      const jwtSecret = await this.settingsService.getOrCreateJwtSecret();
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Get current user info from token
   */
  async me(username: string): Promise<{ username: string; createdAt: string | null }> {
    const credentials = await this.settingsService.getAdminCredentials();

    if (!credentials.username || credentials.username !== username) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      username: credentials.username,
      createdAt: await this.settingsService.getAdminCreatedAt(),
    };
  }

  /**
   * Update admin password
   */
  async updatePassword(username: string, dto: UpdatePasswordDto): Promise<void> {
    // Get stored credentials
    const { username: storedUsername, passwordHash } =
      await this.settingsService.getAdminCredentials();

    if (!storedUsername || !passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate username
    if (username !== storedUsername) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate current password
    const isValidPassword = await bcrypt.compare(dto.currentPassword, passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(dto.newPassword, this.BCRYPT_ROUNDS);

    // Update password
    await this.settingsService.updateAdminPassword(newPasswordHash);

    this.logger.log(`Password updated for user: ${username}`);
  }

  /**
   * Generate a JWT token for the given username
   */
  private async generateToken(username: string): Promise<string> {
    const jwtSecret = await this.settingsService.getOrCreateJwtSecret();
    const securitySettings = await this.settingsService.getSecuritySettings();

    const payload: JwtPayload = {
      sub: username,
    };

    return this.jwtService.signAsync(payload, {
      secret: jwtSecret,
      expiresIn: securitySettings.jwtExpirationMs,
    });
  }
}
