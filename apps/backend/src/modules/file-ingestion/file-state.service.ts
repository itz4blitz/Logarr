import { statSync, type Stats } from 'fs';
import { resolve, basename } from 'path';

import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import type { LogFileState } from '@logarr/core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * FileStateService - Manages log file state persistence
 *
 * Tracks:
 * - Read position (byte offset) for resuming
 * - File metadata for rotation detection
 * - Error states
 */
@Injectable()
export class FileStateService {
  private readonly logger = new Logger(FileStateService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  /**
   * Get the state for a specific file
   */
  async getState(serverId: string, filePath: string): Promise<LogFileState | null> {
    const relativePath = this.getRelativePath(filePath);

    const [state] = await this.db
      .select()
      .from(schema.logFileState)
      .where(
        and(
          eq(schema.logFileState.serverId, serverId),
          eq(schema.logFileState.filePath, relativePath)
        )
      );

    if (!state) {
      return null;
    }

    return this.mapToLogFileState(state);
  }

  /**
   * Create a new file state entry
   */
  async createState(serverId: string, filePath: string): Promise<LogFileState> {
    const relativePath = this.getRelativePath(filePath);
    const absolutePath = resolve(filePath);

    // Get initial file stats
    let fileSize = 0n;
    let fileInode: string | null = null;
    let fileModifiedAt: Date | null = null;

    try {
      const stats = statSync(absolutePath);
      fileSize = BigInt(stats.size);
      fileInode = this.getInode(stats);
      fileModifiedAt = stats.mtime;
    } catch {
      this.logger.warn(`Could not stat file ${absolutePath}`);
    }

    const [state] = await this.db
      .insert(schema.logFileState)
      .values({
        serverId,
        filePath: relativePath,
        absolutePath,
        fileSize,
        byteOffset: 0n,
        lineNumber: 0,
        fileInode,
        fileModifiedAt,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.logFileState.serverId, schema.logFileState.filePath],
        set: {
          absolutePath,
          fileSize,
          fileInode,
          fileModifiedAt,
          isActive: true,
          lastError: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.mapToLogFileState(state!);
  }

  /**
   * Update file state after reading
   */
  async updateState(
    serverId: string,
    filePath: string,
    updates: {
      byteOffset?: bigint;
      lineNumber?: number;
      fileSize?: bigint;
      fileInode?: string | null;
      fileModifiedAt?: Date | null;
    }
  ): Promise<void> {
    const relativePath = this.getRelativePath(filePath);

    await this.db
      .update(schema.logFileState)
      .set({
        ...updates,
        lastReadAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.logFileState.serverId, serverId),
          eq(schema.logFileState.filePath, relativePath)
        )
      );
  }

  /**
   * Update file state with an error
   */
  async updateError(serverId: string, filePath: string, error: string): Promise<void> {
    const relativePath = this.getRelativePath(filePath);

    await this.db
      .update(schema.logFileState)
      .set({
        lastError: error,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.logFileState.serverId, serverId),
          eq(schema.logFileState.filePath, relativePath)
        )
      );
  }

  /**
   * Reset state for a file (e.g., after rotation)
   */
  async resetState(serverId: string, filePath: string): Promise<void> {
    const relativePath = this.getRelativePath(filePath);
    const absolutePath = resolve(filePath);

    // Get new file stats
    let fileSize = 0n;
    let fileInode: string | null = null;
    let fileModifiedAt: Date | null = null;

    try {
      const stats = statSync(absolutePath);
      fileSize = BigInt(stats.size);
      fileInode = this.getInode(stats);
      fileModifiedAt = stats.mtime;
    } catch {
      this.logger.warn(`Could not stat file ${absolutePath} during reset`);
    }

    await this.db
      .update(schema.logFileState)
      .set({
        byteOffset: 0n,
        lineNumber: 0,
        fileSize,
        fileInode,
        fileModifiedAt,
        lastError: null,
        lastReadAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.logFileState.serverId, serverId),
          eq(schema.logFileState.filePath, relativePath)
        )
      );
  }

  /**
   * Mark a file as inactive
   */
  async deactivateState(serverId: string, filePath: string): Promise<void> {
    const relativePath = this.getRelativePath(filePath);

    await this.db
      .update(schema.logFileState)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.logFileState.serverId, serverId),
          eq(schema.logFileState.filePath, relativePath)
        )
      );
  }

  /**
   * Get all active file states for a server
   */
  async getActiveStates(serverId: string): Promise<LogFileState[]> {
    const states = await this.db
      .select()
      .from(schema.logFileState)
      .where(
        and(eq(schema.logFileState.serverId, serverId), eq(schema.logFileState.isActive, true))
      );

    return states.map(this.mapToLogFileState);
  }

  /**
   * Delete all file states for a server
   */
  async deleteServerStates(serverId: string): Promise<void> {
    await this.db.delete(schema.logFileState).where(eq(schema.logFileState.serverId, serverId));
  }

  /**
   * Get relative path from absolute path (for portability)
   */
  private getRelativePath(filePath: string): string {
    // For now, just use the filename
    // In the future, could calculate relative to a base path
    return basename(filePath);
  }

  /**
   * Get file inode as string
   */
  private getInode(stats: Stats): string | null {
    if (stats.ino !== 0) {
      return stats.ino.toString();
    }
    // Windows fallback
    return `${stats.birthtimeMs}-${stats.dev}`;
  }

  /**
   * Map database row to LogFileState interface
   */
  private mapToLogFileState(row: typeof schema.logFileState.$inferSelect): LogFileState {
    return {
      id: row.id,
      serverId: row.serverId,
      filePath: row.filePath,
      absolutePath: row.absolutePath,
      fileSize: row.fileSize,
      byteOffset: row.byteOffset,
      lineNumber: row.lineNumber,
      fileInode: row.fileInode,
      fileModifiedAt: row.fileModifiedAt,
      lastReadAt: row.lastReadAt,
      isActive: row.isActive,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
