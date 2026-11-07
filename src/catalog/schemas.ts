import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const url = z.url();

export const catalogSpecSchema = z.object({ name: nonEmpty, value: z.array(nonEmpty) });
export const catalogMediaSchema = z.object({
  code: nonEmpty,
  type: z.enum(['image', 'video']),
  url,
});
export const catalogVariationSchema = z.object({
  id: z.union([z.string(), z.number()]),
  sku: z.string().optional(),
  active: z.boolean(),
  stock: z.number().int().nonnegative().optional(),
  price: z.number().int().nonnegative().optional(),
  salePrice: z.number().int().nonnegative().nullable().optional(),
  specs: z.array(z.object({ name: nonEmpty, value: nonEmpty })),
  medias: z.array(nonEmpty),
});

export const catalogProductSummarySchema = z.object({
  id: z.union([z.string(), z.number()]),
  code: z.union([z.string(), z.number()]).transform(String),
  active: z.boolean(),
  stock: z.number().int().nonnegative(),
  url,
});

export const catalogProductSchema = catalogProductSummarySchema.extend({
  title: nonEmpty,
  description: z.string(),
  shortDescription: z.string().optional(),
  sku: z.string().optional(),
  price: z.number().int().nonnegative().optional(),
  salePrice: z.number().int().nonnegative().nullable().optional(),
  specs: z.array(catalogSpecSchema),
  category: z.object({ code: z.string(), name: nonEmpty }),
  categories: z.array(nonEmpty),
  brand: z.string().optional(),
  variations: z.array(catalogVariationSchema),
  medias: z.array(catalogMediaSchema),
  cover_image: nonEmpty,
});

export const catalogCategorySchema = z.object({
  id: z.union([z.string(), z.number()]),
  code: nonEmpty,
  name: nonEmpty,
  parent: z.union([z.string(), z.number(), z.null()]).optional(),
});

export const catalogAttributeSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: nonEmpty,
  values: z.array(nonEmpty),
  categories: z.array(nonEmpty),
});

export const catalogResolutionSchema = z.object({
  type: z.enum(['product', 'category', 'search', 'archive']),
  url,
  apiUrl: url,
});

export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type CatalogProductSummary = z.infer<typeof catalogProductSummarySchema>;
export type CatalogCategory = z.infer<typeof catalogCategorySchema>;
export type CatalogAttribute = z.infer<typeof catalogAttributeSchema>;
export type CatalogResolution = z.infer<typeof catalogResolutionSchema>;
