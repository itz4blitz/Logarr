import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsObject, IsNotEmpty } from 'class-validator';

export class ProxyRequestDto {
  @ApiProperty({
    description: 'API endpoint to call (e.g., queue, movie, series)',
    example: 'queue',
  })
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({
    description: 'HTTP method',
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    example: 'GET',
  })
  @IsEnum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

  @ApiProperty({
    description: 'Request body for POST/PUT/PATCH requests',
    required: false,
  })
  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;

  @ApiProperty({
    description: 'URL path parameters (e.g., {id: "123"} for /series/123)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, string | number>;

  @ApiProperty({
    description: 'URL query parameters',
    required: false,
  })
  @IsOptional()
  @IsObject()
  query?: Record<string, unknown>;

  @ApiProperty({
    description: 'Request headers (in addition to auth headers)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}

export class ProxyResponseDto {
  @ApiProperty({
    description: 'Request success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response data from target service',
    required: false,
  })
  data?: unknown;

  @ApiProperty({
    description: 'Error details if request failed',
    required: false,
  })
  error?: {
    code: string;
    message: string;
    service: string;
  };

  @ApiProperty({
    description: 'Response timestamp',
    example: '2025-01-08T19:00:00.000Z',
  })
  timestamp: string;
}

export class ServiceInfoDto {
  @ApiProperty({
    description: 'Server UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Server name',
    example: 'My Sonarr',
  })
  name: string;

  @ApiProperty({
    description: 'Provider/service type',
    example: 'sonarr',
  })
  providerId: string;

  @ApiProperty({
    description: 'Connection status',
    enum: ['online', 'offline', 'unknown'],
    example: 'online',
  })
  status: string;

  @ApiProperty({
    description: 'Last connection check',
    required: false,
  })
  lastChecked?: Date;
}
