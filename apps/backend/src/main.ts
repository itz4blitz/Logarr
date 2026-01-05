import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { validateEnv } from './config/env';

async function bootstrap() {
  // Validate environment FIRST - fail fast if misconfigured
  const env = validateEnv();

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
    .addTag('ai', 'AI-powered analysis')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.BACKEND_PORT);

  const logger = app.get(Logger);
  logger.log(`Logarr API running on http://localhost:${env.BACKEND_PORT}`, 'Bootstrap');
  logger.log(
    `Swagger docs available at http://localhost:${env.BACKEND_PORT}/api/docs`,
    'Bootstrap'
  );
}

bootstrap();
