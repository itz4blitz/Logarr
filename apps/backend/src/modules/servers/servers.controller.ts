import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import {
  CreateServerDto,
  UpdateServerDto,
  ServerResponseDto,
  ConnectionStatusDto,
  ProviderDto,
} from './servers.dto';
import { ServersService } from './servers.service';

@ApiTags('servers')
@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all servers' })
  @ApiResponse({ status: 200, type: [ServerResponseDto] })
  async findAll() {
    return this.serversService.findAll();
  }

  @Get('providers')
  @ApiOperation({ summary: 'Get available providers' })
  @ApiResponse({ status: 200, type: [ProviderDto] })
  getProviders() {
    return this.serversService.getAvailableProviders();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a server by ID' })
  @ApiResponse({ status: 200, type: ServerResponseDto })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async findOne(@Param('id') id: string) {
    return this.serversService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new server' })
  @ApiResponse({ status: 201, type: ServerResponseDto })
  async create(@Body() dto: CreateServerDto) {
    return this.serversService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a server' })
  @ApiResponse({ status: 200, type: ServerResponseDto })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateServerDto) {
    return this.serversService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a server' })
  @ApiResponse({ status: 204, description: 'Server deleted' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async delete(@Param('id') id: string) {
    await this.serversService.delete(id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test server connection' })
  @ApiResponse({ status: 200, type: ConnectionStatusDto })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async testConnection(@Param('id') id: string) {
    return this.serversService.testConnection(id);
  }

  @Post(':id/file-ingestion/reset')
  @ApiOperation({ summary: 'Reset file ingestion state for a server' })
  @ApiResponse({ status: 200, description: 'File ingestion state reset successfully' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async resetFileIngestion(@Param('id') id: string) {
    return this.serversService.resetFileIngestionState(id);
  }

  @Post('test-all')
  @ApiOperation({ summary: 'Test all server connections in parallel' })
  @ApiResponse({ status: 200, description: 'Returns map of server ID to connection status' })
  async testAllConnections() {
    return this.serversService.testAllConnections();
  }
}
