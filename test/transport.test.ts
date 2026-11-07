import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { createSnappShopClient } from '../src/index.js';
import { createFakeAxiosAdapter } from '../src/testing/index.js';

describe('transport safety', () => {
  it('retries safe reads after a transient 503', async () => {
    let attempts = 0;
    const client = createSnappShopClient({
      credentials: { token: 'token', clientCode: 'code' },
      retry: { maxAttempts: 2, baseDelayMs: 1, maxElapsedMs: 100 },
      adapter: createFakeAxiosAdapter((config) => {
        attempts += 1;
        if (attempts === 1) {
          throw new AxiosError('unavailable', '503', config as never, undefined, {
            data: {},
            status: 503,
            statusText: 'Unavailable',
            headers: {},
            config: config as never,
          });
        }
        return { data: { status: true, data: [] } };
      }),
    });
    await expect(client.vendors.list()).resolves.toEqual([]);
    expect(attempts).toBe(2);
  });

  it('never retries mutations without an idempotency strategy', async () => {
    let attempts = 0;
    const client = createSnappShopClient({
      credentials: { token: 'token', clientCode: 'code' },
      retry: { maxAttempts: 3, baseDelayMs: 1 },
      adapter: createFakeAxiosAdapter((config) => {
        attempts += 1;
        throw new AxiosError('unavailable', '503', config as never, undefined, {
          data: {},
          status: 503,
          statusText: 'Unavailable',
          headers: {},
          config: config as never,
        });
      }),
    });
    await expect(
      client.products.update('vendor', [{ sku: 'SKU', price: 100, stock: 1 }]),
    ).rejects.toThrow(/HTTP 503/);
    expect(attempts).toBe(1);
  });

  it('redacts both credentials from transport errors', async () => {
    const client = createSnappShopClient({
      credentials: { token: 'secret-token', clientCode: 'secret-client' },
      adapter: createFakeAxiosAdapter((config) => {
        throw new AxiosError('secret-token secret-client', 'NETWORK', config as never);
      }),
    });
    let error: Error | undefined;
    try {
      await client.vendors.list();
    } catch (caught) {
      error = caught as Error;
    }
    expect(error).toBeDefined();
    if (!error) throw new Error('Expected transport error');
    expect(error.message).not.toContain('secret-token');
    expect(error.message).not.toContain('secret-client');
    expect(error.message).toContain('[REDACTED]');
  });
});
