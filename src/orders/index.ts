import { z } from 'zod';
import { SnappShopApiError } from '../core/errors.js';
import type { SnappShopTransport } from '../http/transport.js';
import { dateSchema, vendorIdSchema } from '../schemas/common.js';
import {
  orderEventsResponseSchema,
  orderResponseSchema,
  ordersResponseSchema,
  type SnappShopOrder,
} from '../schemas/order.js';

export interface OrderHistoryQuery {
  vendorId: string;
  cursor?: string;
  startDate?: string;
  endDate?: string;
}

export function createOrdersResource(transport: SnappShopTransport) {
  async function history(query: OrderHistoryQuery) {
    const vendorId = vendorIdSchema.parse(query.vendorId);
    if (query.startDate) dateSchema.parse(query.startDate);
    if (query.endDate) dateSchema.parse(query.endDate);
    return transport.get(`/vendors/${encodeURIComponent(vendorId)}/orders`, ordersResponseSchema, {
      params: {
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.startDate ? { start_date: query.startDate } : {}),
        ...(query.endDate ? { end_date: query.endDate } : {}),
      },
    });
  }

  return {
    history,
    async get(vendorId: string, orderNumber: string | number) {
      const id = vendorIdSchema.parse(vendorId);
      const order = z.union([z.string().min(1), z.number().int().nonnegative()]).parse(orderNumber);
      return (
        await transport.get(
          `/vendors/${encodeURIComponent(id)}/orders/${encodeURIComponent(String(order))}`,
          orderResponseSchema,
        )
      ).data;
    },
    async events(vendorId: string) {
      const id = vendorIdSchema.parse(vendorId);
      return (
        await transport.get(
          `/vendors/${encodeURIComponent(id)}/orders/events`,
          orderEventsResponseSchema,
        )
      ).data;
    },
    async *iterate(query: Omit<OrderHistoryQuery, 'cursor'>): AsyncGenerator<SnappShopOrder> {
      let cursor: string | undefined;
      const seen = new Set<string>();
      for (;;) {
        const page = await history({ ...query, ...(cursor ? { cursor } : {}) });
        yield* page.data;
        if (!page.meta.pagination.has_more) return;
        const next = page.meta.pagination.next_cursor;
        if (!next) throw new SnappShopApiError('Order pagination cursor is missing');
        if (seen.has(next)) throw new SnappShopApiError('Order pagination cursor was repeated');
        seen.add(next);
        cursor = next;
      }
    },
  };
}
