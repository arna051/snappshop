import { z } from 'zod';

export const vendorSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  title_en: z.string(),
  status: z.string().min(1),
});

export type SnappShopVendor = z.infer<typeof vendorSchema>;

export const vendorsResponseSchema = z.object({
  status: z.literal(true),
  data: z.array(vendorSchema),
});
export const vendorResponseSchema = z.object({ status: z.literal(true), data: vendorSchema });
