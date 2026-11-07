import { describe, expect, it } from 'vitest';
import { createSnappShopClient } from '../src/index.js';
import { createFakeAxiosAdapter } from '../src/testing/index.js';

describe('order cursor iteration', () => {
  it('rejects a repeated cursor', async () => {
    const client = createSnappShopClient({
      credentials: { token: 'token', clientCode: 'code' },
      adapter: createFakeAxiosAdapter(() => ({
        data: {
          status: true,
          data: [],
          meta: {
            pagination: {
              path: '/orders',
              per_page: 20,
              count: 0,
              links: { next: null },
              has_more: true,
              next_cursor: 'same',
            },
          },
        },
      })),
    });
    const iterator = client.orders.iterate({ vendorId: 'vendor' });
    await expect(iterator.next()).rejects.toThrow(/repeated/);
  });

  it('preserves unknown upstream statuses', async () => {
    const client = createSnappShopClient({
      credentials: { token: 'token', clientCode: 'code' },
      adapter: createFakeAxiosAdapter(() => ({
        data: {
          status: true,
          data: {
            order_number: 1,
            created_at: '2026-01-01',
            delivery_type: 'FUTURE_DELIVERY',
            order_status: 'UPSTREAM_NEW_STATUS',
            item_origin: 'VENDOR',
            point_of_sales_at: null,
            pickup_time: null,
            customer: { first_name: '', last_name: '', phone: null, national_id: null },
            items: [
              {
                sku: null,
                item_status: 'UPSTREAM_ITEM_STATUS',
                quantity: 1,
                canceled_quantity: 0,
                final_price: 1,
              },
            ],
          },
        },
      })),
    });
    const order = await client.orders.get('vendor', 1);
    expect(order.order_status).toBe('UPSTREAM_NEW_STATUS');
    expect(order.items[0]?.item_status).toBe('UPSTREAM_ITEM_STATUS');
  });
});
