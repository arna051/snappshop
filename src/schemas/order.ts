import { z } from 'zod';
import { safeIntegerSchema } from './common.js';

export const orderItemSchema = z.object({
  sku: z.string().nullable(),
  vendor_product_info_id: z.string().optional(),
  item_status: z.string(),
  quantity: safeIntegerSchema,
  canceled_quantity: safeIntegerSchema,
  original_price: safeIntegerSchema.optional(),
  discount_amount: safeIntegerSchema.optional(),
  final_price: safeIntegerSchema,
});

export const orderSchema = z.object({
  order_number: z.union([z.string(), z.number()]),
  created_at: z.string(),
  delivery_type: z.string(),
  order_status: z.string(),
  item_origin: z.string(),
  point_of_sales_at: z.string().nullable(),
  pickup_time: z.object({ start: z.string(), end: z.string() }).nullable(),
  customer: z.object({
    first_name: z.string(),
    last_name: z.string(),
    phone: z.string().nullable(),
    national_id: z.string().nullable(),
    address: z.unknown().optional(),
  }),
  items: z.array(orderItemSchema),
});

export type SnappShopOrder = z.infer<typeof orderSchema>;

export const orderResponseSchema = z.object({ status: z.boolean().optional(), data: orderSchema });
export const ordersResponseSchema = z.object({
  status: z.literal(true),
  data: z.array(orderSchema),
  meta: z.object({
    pagination: z.object({
      path: z.string(),
      per_page: z.number().int().positive(),
      count: safeIntegerSchema,
      links: z.object({ next: z.string().nullable().optional() }),
      has_more: z.boolean(),
      next_cursor: z.string().nullable().optional(),
    }),
  }),
});

export const orderEventSchema = z.object({
  event_type: z.string(),
  order_number: z.union([z.string(), z.number()]),
  event_at: z.string(),
  items: z.array(
    z.object({
      sku: z.string().nullable(),
      vendor_product_info_id: z.string(),
      canceled_quantity: safeIntegerSchema,
      total_canceled_quantity: safeIntegerSchema,
      deliverable_quantity: safeIntegerSchema,
      final_price: safeIntegerSchema,
      item_status: z.string(),
    }),
  ),
});

export const orderEventsResponseSchema = z.object({
  status: z.literal(true),
  data: z.array(orderEventSchema),
});
