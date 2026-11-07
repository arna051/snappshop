import { describe, expect, it } from 'vitest';
import {
  createSnappShopClient,
  SnappShopApiError,
  SnappShopPartialSuccessError,
  SnappShopReadbackMismatchError,
} from '../src/index.js';
import { createFakeAxiosAdapter } from '../src/testing/index.js';

const credentials = { token: 'secret-token', clientCode: 'client-code' };
const product = (overrides: Record<string, unknown> = {}) => ({
  id: 'product-1',
  sku: 'SKU-1',
  active: true,
  capacity: null,
  stock: 4,
  warehouse_stock: 4,
  title: 'Product',
  title_en: 'Product',
  thumbnail: null,
  price: 1000,
  warranty: null,
  discount: null,
  variation_attributes: [],
  created_at: '2026-01-01 00:00:00',
  ...overrides,
});

describe('product mutations', () => {
  it('uses PATCH and requires price with stock', async () => {
    let method = '';
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter((config) => {
        method = config.method ?? '';
        return {
          data: {
            status: true,
            data: [{ id: 'product-1', sku: 'SKU-1', status: true, messages: [] }],
          },
        };
      }),
    });
    const result = await client.products.update('vendor-1', [
      { sku: 'SKU-1', price: 1000, stock: 4 },
    ]);
    expect(method).toBe('patch');
    expect(result.accepted).toBe(true);
    await expect(
      client.products.update('vendor-1', [{ sku: 'SKU-1', stock: 4 } as never]),
    ).rejects.toThrow();
  });

  it('uses PUT only when explicitly requested', async () => {
    let method = '';
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter((config) => {
        method = config.method ?? '';
        return {
          data: {
            status: true,
            data: [{ id: 'product-1', sku: 'SKU-1', status: true, messages: [] }],
          },
        };
      }),
    });
    await client.products.update('vendor-1', [{ sku: 'SKU-1', price: 1000, stock: 4 }], {
      method: 'PUT',
    });
    expect(method).toBe('put');
  });

  it('validates discount windows and prices before transport', async () => {
    let attempts = 0;
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter(() => {
        attempts += 1;
        return {};
      }),
    });
    await expect(
      client.products.update('vendor-1', [
        {
          sku: 'SKU-1',
          price: 1000,
          stock: 4,
          special_price: 1000,
          special_price_start_at: '2026-01-01',
        } as never,
      ]),
    ).rejects.toThrow();
    expect(attempts).toBe(0);
  });

  it('does not treat HTTP 200 rejected rows as success', async () => {
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter(() => ({
        data: {
          status: true,
          data: [{ id: 'product-1', sku: 'SKU-1', status: false, messages: ['Invalid'] }],
        },
      })),
    });
    await expect(
      client.products.update('vendor-1', [{ sku: 'SKU-1', price: 1000, stock: 4 }]),
    ).rejects.toBeInstanceOf(SnappShopPartialSuccessError);
  });

  it('does not treat a false mutation envelope as success', async () => {
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter(() => ({ data: { status: false, data: [] } })),
    });
    await expect(
      client.products.update('vendor-1', [{ sku: 'SKU-1', price: 1000, stock: 4 }]),
    ).rejects.toBeInstanceOf(SnappShopApiError);
  });

  it('distinguishes acceptance from read-back verification', async () => {
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter((config) =>
        config.method === 'patch'
          ? {
              data: {
                status: true,
                data: [{ id: 'product-1', sku: 'SKU-1', status: true, messages: [] }],
              },
            }
          : { data: { status: true, data: product({ stock: 2 }) } },
      ),
    });
    await expect(
      client.products.updateAndVerify('vendor-1', [{ sku: 'SKU-1', price: 1000, stock: 4 }]),
    ).rejects.toBeInstanceOf(SnappShopReadbackMismatchError);
  });

  it('refuses duplicate SKU writes', async () => {
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter(() => ({})),
    });
    await expect(
      client.products.update('vendor-1', [
        { sku: 'SKU-1', price: 1000, stock: 4 },
        { sku: 'SKU-1', price: 1000, stock: 4 },
      ]),
    ).rejects.toThrow(/Duplicate SKU/);
  });

  it('supports an application price-change guard before transport', async () => {
    let attempts = 0;
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter(() => {
        attempts += 1;
        return {};
      }),
    });
    await expect(
      client.products.update('vendor-1', [{ sku: 'SKU-1', price: 9_000_000, stock: 4 }], {
        priceGuard: (update) => update.price < 2_000_000,
      }),
    ).rejects.toThrow(/Price guard/);
    expect(attempts).toBe(0);
  });

  it('rejects incomplete or duplicate mutation acknowledgements', async () => {
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter(() => ({
        data: {
          status: true,
          data: [
            { id: 'one', sku: 'SKU-1', status: true, messages: [] },
            { id: 'two', sku: 'SKU-1', status: true, messages: [] },
          ],
        },
      })),
    });
    let error: SnappShopPartialSuccessError | undefined;
    try {
      await client.products.update('vendor-1', [
        { sku: 'SKU-1', price: 1000, stock: 4 },
        { sku: 'SKU-2', price: 2000, stock: 5 },
      ]);
    } catch (caught) {
      error = caught as SnappShopPartialSuccessError;
    }
    expect(error).toBeInstanceOf(SnappShopPartialSuccessError);
    if (!error) throw new Error('Expected partial success error');
    expect((error.details as { missingSkus: string[] }).missingSkus).toEqual(['SKU-1', 'SKU-2']);
  });

  it('stops before later chunks after a row rejection', async () => {
    let attempts = 0;
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter(() => {
        attempts += 1;
        return {
          data: {
            status: true,
            data: [{ id: 'one', sku: 'SKU-0', status: false, messages: ['rejected'] }],
          },
        };
      }),
    });
    const updates = Array.from({ length: 51 }, (_, index) => ({
      sku: `SKU-${index}`,
      price: 1000,
      stock: 1,
    }));
    await expect(client.products.update('vendor-1', updates)).rejects.toThrow(/remaining chunks/);
    expect(attempts).toBe(1);
  });

  it('rejects unknown mutation fields before the price guard or transport', async () => {
    let attempts = 0;
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter(() => {
        attempts += 1;
        return {};
      }),
    });
    await expect(
      client.products.update('vendor-1', [
        { sku: 'SKU-1', price: 1000, stock: 1, speical_price: 500 } as never,
      ]),
    ).rejects.toThrow();
    expect(attempts).toBe(0);
  });

  it('verifies ordinary stock when a discount record is expired', async () => {
    const client = createSnappShopClient({
      credentials,
      adapter: createFakeAxiosAdapter((config) =>
        config.method === 'patch'
          ? {
              data: {
                status: true,
                data: [{ id: 'product-1', sku: 'SKU-1', status: true, messages: [] }],
              },
            }
          : {
              data: {
                status: true,
                data: product({
                  stock: 4,
                  discount: {
                    id: 'old',
                    special_price: 500,
                    stock: 1,
                    start_at: '2020-01-01',
                    end_at: '2020-01-02',
                  },
                }),
              },
            },
      ),
    });
    await expect(
      client.products.updateAndVerify('vendor-1', [{ sku: 'SKU-1', price: 1000, stock: 4 }]),
    ).resolves.toMatchObject({ verified: true });
  });
});
