import { z } from 'zod';

export const vendorIdSchema = z.string().trim().min(1).max(128);
export const productIdSchema = z.string().trim().min(1).max(128);
export const skuSchema = z.string().trim().min(1).max(256);
export const safeIntegerSchema = z.number().int().nonnegative().safe();
export const dateSchema = z.iso.date();
export const dateTimeStringSchema = z.string().trim().min(1);

export const apiErrorEnvelopeSchema = z.object({
  status: z.literal(false),
  message: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  trackId: z.string().optional(),
  errors: z.unknown().optional(),
});
