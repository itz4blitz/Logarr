import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { validateEnv, type Env } from './config/env';
import { AuthService } from './modules/auth/auth.service';

// Cache validated env for use in bootstrap
let cachedEnv: Env;

async function bootstrap() {
  // Validate environment FIRST - fail fast if misconfigured
  cachedEnv = validateEnv();
  const env = cachedEnv;

  const app = await NestFactory.create(AppModule, {
    // Disable default logger, use Pino instead
    bufferLogs: true,
  });

  // Use Pino logger for all NestJS logging
  app.useLogger(app.get(Logger));

  // Enable CORS - support multiple origins via comma-separated string
  const origins = env.CORS_ORIGIN.includes(',')
    ? env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : env.CORS_ORIGIN;

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Logarr API')
    .setDescription('API for Logarr - Unified Media Server Logging')
    .setVersion('0.1.0')
    .addTag('servers', 'Media server management')
    .addTag('logs', 'Log ingestion and search')
    .addTag('sessions', 'Session tracking')
    .addTag('audit', 'Global audit logging')
    .addTag('ai', 'AI-powered analysis')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.BACKEND_PORT);

  const logger = app.get(Logger);
  const authService = app.get(AuthService);

  // Check if setup is required and log the setup token
  const setupStatus = await authService.getSetupStatus();
  if (setupStatus.setupRequired && setupStatus.setupToken) {
    // Log the setup token prominently for first-time setup
    const frontendUrl = env.CORS_ORIGIN.includes(',')
      ? (env.CORS_ORIGIN.split(',')[0] ?? env.CORS_ORIGIN).trim()
      : env.CORS_ORIGIN;
    const token = setupStatus.setupToken;

    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           INITIAL SETUP REQUIRED                           ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Use the setup below to create your admin account:         ║');
    console.log('║                                                            ║');
    console.log(`║  Token: ${token.slice(0, 20)}...${token.slice(-20)}║`);
    console.log('║                                                            ║');
    console.log(`║  Navigate to: ${frontendUrl}/setup`.padEnd(59) + '║');
    console.log('║  Or call POST /api/auth/setup with this token              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
  }

  logger.log(`Logarr API running on port ${env.BACKEND_PORT}`, 'Bootstrap');
  logger.log(`Swagger docs available at /api/docs`, 'Bootstrap');
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
