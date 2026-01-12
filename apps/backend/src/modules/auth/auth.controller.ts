import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { AuthService, AuthResponse, SetupStatus } from './auth.service';
import { SetupDto, LoginDto, UpdatePasswordDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalOnlyGuard } from './guards/local-only.guard';
import { Public } from './guards/unified-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Get setup status - public endpoint
   * Returns whether setup is required and the setup token (only if setup is needed)
   * The token is logged to console on startup for easy access
   */
  @Get('setup')
  @Public()
  @ApiOperation({
    summary: 'Get setup status',
    description:
      'Returns whether initial setup is required. If setup is required, the setup token is also returned. The setup token is also logged to the console on server startup.',
  })
  @ApiResponse({
    status: 200,
    description: 'Setup status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        setupRequired: { type: 'boolean' },
        setupToken: { type: 'string', description: 'Only present if setup is required' },
      },
    },
  })
  async getSetupStatus(): Promise<SetupStatus> {
    return this.authService.getSetupStatus();
  }

  /**
   * Complete initial setup - local only
   * Creates the admin account using the setup token
   */
  @Post('setup')
  @Public()
  @UseGuards(LocalOnlyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete initial setup',
    description:
      'Create the admin account using the setup token. This endpoint is only accessible from local networks.',
  })
  @ApiResponse({ status: 200, description: 'Setup completed successfully', type: Object })
  @ApiResponse({ status: 400, description: 'Setup already completed or invalid request' })
  @ApiResponse({ status: 401, description: 'Invalid setup token' })
  @ApiResponse({ status: 403, description: 'Not accessible from local network' })
  async setup(@Body() dto: SetupDto): Promise<AuthResponse> {
    this.logger.log('Setup request received');
    return this.authService.setup(dto);
  }

  /**
   * Login - local only
   * Authenticate with username and password
   */
  @Post('login')
  @Public()
  @UseGuards(LocalOnlyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login',
    description:
      'Authenticate with username and password. Returns a JWT access token. This endpoint is only accessible from local networks.',
  })
  @ApiResponse({ status: 200, description: 'Login successful', type: Object })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Not accessible from local network' })
  @ApiResponse({ status: 400, description: 'Setup not completed' })
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    this.logger.log('Login request received');
    return this.authService.login(dto);
  }

  /**
   * Get current user info - requires authentication
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user',
    description: 'Get information about the currently authenticated admin user.',
  })
  @ApiResponse({ status: 200, description: 'User info retrieved successfully', type: Object })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@Request() req: { user: { sub: string } }): Promise<{
    username: string;
    createdAt: string | null;
  }> {
    return this.authService.me(req.user.sub);
  }

  /**
   * Update admin password - requires authentication
   */
  @Put('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update admin password',
    description: 'Update the admin user password. Requires current password for confirmation.',
  })
  @ApiResponse({ status: 204, description: 'Password updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid current password' })
  async updatePassword(
    @Request() req: { user: { sub: string } },
    @Body() dto: UpdatePasswordDto
  ): Promise<void> {
    await this.authService.updatePassword(req.user.sub, dto);
  }

  /**
   * Logout - client-side only
   * JWT tokens are stateless, logout is handled by client discarding the token
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout',
    description:
      'Logout the current user. Since JWT tokens are stateless, the client should discard the token. This endpoint is provided for audit purposes.',
  })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  logout(): void {
    // Token is stateless - client handles token disposal
    // This endpoint exists for audit logging purposes
  }
}
