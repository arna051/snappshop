import { describe, expect, it } from 'vitest';
import { createSnappShopClient } from '../src/index.js';
import { createFakeAxiosAdapter } from '../src/testing/index.js';

describe('multi-account isolation', () => {
  it('never shares credentials between clients', async () => {
    const seen: Array<{ authorization: unknown; userAgent: unknown }> = [];
    const adapter = createFakeAxiosAdapter((config) => {
      seen.push({
        authorization: config.headers?.Authorization,
        userAgent: config.headers?.['User-Agent'],
      });
      return { data: { status: true, data: [] } };
    });
    const first = createSnappShopClient({
      credentials: { token: 'token-a', clientCode: 'code-a' },
      adapter,
    });
    const second = createSnappShopClient({
      credentials: { token: 'token-b', clientCode: 'code-b' },
      adapter,
    });
    await Promise.all([first.vendors.list(), second.vendors.list()]);
    expect(seen).toEqual(
      expect.arrayContaining([
        { authorization: 'Bearer token-a', userAgent: 'code-a' },
        { authorization: 'Bearer token-b', userAgent: 'code-b' },
      ]),
    );
  });
});
