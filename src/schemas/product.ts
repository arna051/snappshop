import { z } from 'zod';
import { dateSchema, safeIntegerSchema, skuSchema } from './common.js';

export const productDiscountSchema = z.object({
  id: z.string(),
  special_price: safeIntegerSchema,
  stock: safeIntegerSchema,
  vendor_share: z.number().optional(),
  percent: z.number().optional(),
  start_at: z.string(),
  end_at: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const productSchema = z.object({
  id: z.string().min(1),
  sku: z.string(),
  active: z.boolean(),
  capacity: z.union([z.string(), z.number(), z.null()]),
  stock: safeIntegerSchema,
  warehouse_stock: safeIntegerSchema,
  title: z.string(),
  title_en: z.string(),
  thumbnail: z.string().nullable(),
  price: safeIntegerSchema,
  warranty: z.string().nullable(),
  discount: productDiscountSchema.nullable(),
  variation_attributes: z
    .array(
      z.object({
        attribute: z.object({ id: z.string(), title: z.string(), unit: z.string().nullable() }),
        value: z.object({ id: z.string(), title: z.string(), icon: z.string().nullable() }),
      }),
    )
    .default([]),
  created_at: z.string(),
});

export type SnappShopProduct = z.infer<typeof productSchema>;

export const productPageSchema = z.object({
  status: z.literal(true),
  data: z.array(productSchema),
  meta: z.object({
    pagination: z.object({
      total: safeIntegerSchema,
      count: safeIntegerSchema,
      per_page: z.number().int().positive(),
      current_page: z.number().int().positive(),
      total_pages: safeIntegerSchema,
      links: z.object({ next: z.string().nullable(), previous: z.string().nullable() }),
    }),
  }),
});

export const productResponseSchema = z.object({ status: z.literal(true), data: productSchema });

export const productUpdateSchema = z
  .object({
    sku: skuSchema,
    price: safeIntegerSchema,
    stock: safeIntegerSchema,
    capacity: safeIntegerSchema.optional(),
    special_price: safeIntegerSchema.optional(),
    special_price_start_at: dateSchema.optional(),
    special_price_end_at: dateSchema.optional(),
    special_price_stock: safeIntegerSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const dates = [value.special_price_start_at, value.special_price_end_at];
    if (dates.some(Boolean) && !dates.every(Boolean)) {
      context.addIssue({ code: 'custom', message: 'Both special price dates are required' });
    }
    if (value.special_price !== undefined && value.special_price >= value.price) {
      context.addIssue({ code: 'custom', message: 'special_price must be lower than price' });
    }
  });

export type ProductUpdate = z.infer<typeof productUpdateSchema>;

export const productUpdateRowSchema = z
  .object({
    id: z.string().optional(),
    d: z.string().optional(),
    sku: z.string(),
    status: z.boolean(),
    messages: z.array(z.string()).default([]),
  })
  .transform((row) => ({ ...row, id: row.id ?? row.d }));

export const productUpdateResponseSchema = z.object({
  status: z.boolean(),
  data: z.array(productUpdateRowSchema),
  trackId: z.string().optional(),
});
