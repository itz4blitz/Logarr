import { describe, it, expect, vi } from 'vitest';

import { IngestionService } from './ingestion.service';

describe('IngestionService polling error logging', () => {
  it('logs the message and SQLSTATE of a failed server poll', async () => {
    const server = { id: 's1', name: 'My Sonarr' };
    const where = vi.fn().mockResolvedValue([server]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const logger = { error: vi.fn() };
    // Bypass the heavy constructor; only the members used by pollAllServers are provided.
    const service = Object.create(IngestionService.prototype) as Record<string, unknown>;
    service['db'] = {
      select: () => ({ from: () => ({ where }) }),
      update: () => ({ set: () => ({ where: updateWhere }) }),
    };
    service['logger'] = logger;
    service['pollServer'] = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('deadlock detected'), { code: '40P01' }));

    await (service['pollAllServers'] as () => Promise<void>).call(service);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const message = logger.error.mock.calls[0]![0] as string;
    expect(message).toContain('My Sonarr');
    expect(message).toContain('deadlock detected');
    expect(message).toContain('code=40P01');
    expect(updateWhere).toHaveBeenCalled();
  });
});
