import { z } from 'zod';
import {
  SnappShopPartialSuccessError,
  SnappShopReadbackMismatchError,
  SnappShopValidationError,
} from '../core/errors.js';
import type { SnappShopTransport } from '../http/transport.js';
import { productIdSchema, vendorIdSchema } from '../schemas/common.js';
import {
  productPageSchema,
  productResponseSchema,
  productUpdateResponseSchema,
  productUpdateSchema,
  type ProductUpdate,
  type SnappShopProduct,
} from '../schemas/product.js';

export interface ProductListQuery {
  vendorId: string;
  page?: number;
  size?: number;
}

export interface ProductMutationOptions {
  method?: 'PATCH' | 'PUT';
  chunkSize?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  priceGuard?: (product: Readonly<ProductUpdate>) => boolean | void | Promise<boolean | void>;
}

export interface ProductMismatch {
  sku: string;
  fields: Array<{ field: 'price' | 'stock'; expected: number; actual: number }>;
}

export interface ProductUpdateResult {
  transportSucceeded: true;
  accepted: boolean;
  verified: boolean | null;
  rows: Array<z.infer<typeof productUpdateResponseSchema>['data'][number]>;
  rejectedRows: Array<z.infer<typeof productUpdateResponseSchema>['data'][number]>;
  missingSkus: string[];
  unexpectedSkus: string[];
  mismatches: ProductMismatch[];
  trackId?: string;
}

export function createProductsResource(transport: SnappShopTransport) {
  async function list(query: ProductListQuery) {
    const vendorId = vendorIdSchema.parse(query.vendorId);
    const page = z
      .number()
      .int()
      .positive()
      .parse(query.page ?? 1);
    const size = z
      .number()
      .int()
      .positive()
      .max(100)
      .parse(query.size ?? 20);
    return transport.get(`/vendors/${encodeURIComponent(vendorId)}/products`, productPageSchema, {
      params: { page, size },
    });
  }

  async function get(
    vendorId: string,
    productId: string,
    request: { timeout?: number; signal?: AbortSignal } = {},
  ) {
    const vendor = vendorIdSchema.parse(vendorId);
    const product = productIdSchema.parse(productId);
    return (
      await transport.get(
        `/vendors/${encodeURIComponent(vendor)}/products/${encodeURIComponent(product)}`,
        productResponseSchema,
        request,
      )
    ).data;
  }

  async function update(
    vendorId: string,
    products: ProductUpdate[],
    options: ProductMutationOptions = {},
  ): Promise<ProductUpdateResult> {
    const vendor = vendorIdSchema.parse(vendorId);
    const validProducts = z.array(productUpdateSchema).min(1).parse(products);
    refuseDuplicateSkus(validProducts);
    if (options.priceGuard) {
      for (const product of validProducts) {
        const accepted = await options.priceGuard(product);
        if (accepted === false) {
          throw new SnappShopValidationError(`Price guard rejected SKU ${product.sku}`);
        }
      }
    }
    const chunkSize = z
      .number()
      .int()
      .positive()
      .max(50)
      .parse(options.chunkSize ?? 50);
    const rows: ProductUpdateResult['rows'] = [];
    let trackId: string | undefined;
    let envelopeRejected = false;
    for (let index = 0; index < validProducts.length; index += chunkSize) {
      const response = await transport.mutate(
        options.method ?? 'PATCH',
        `/vendors/${encodeURIComponent(vendor)}/products`,
        { products: validProducts.slice(index, index + chunkSize) },
        productUpdateResponseSchema,
        {
          ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );
      rows.push(...response.data);
      envelopeRejected ||= !response.status;
      trackId ??= response.trackId;
      const chunkRejected = response.data.filter((row) => !row.status);
      if (chunkRejected.length) {
        throw new SnappShopPartialSuccessError(
          'SnappShop rejected one or more product rows; remaining chunks were not sent',
          {
            ...(response.trackId ? { trackId: response.trackId } : {}),
            details: { rows: [...rows], rejectedRows: chunkRejected },
          },
        );
      }
    }
    const rejectedRows = rows.filter((row) => !row.status);
    const requestedSkus = new Set(validProducts.map((product) => product.sku));
    const rowCounts = new Map<string, number>();
    for (const row of rows) rowCounts.set(row.sku, (rowCounts.get(row.sku) ?? 0) + 1);
    const missingSkus = [...requestedSkus].filter((sku) => rowCounts.get(sku) !== 1);
    const unexpectedSkus = [...rowCounts]
      .filter(([sku]) => !requestedSkus.has(sku))
      .map(([sku]) => sku);
    const result: ProductUpdateResult = {
      transportSucceeded: true,
      accepted:
        !envelopeRejected &&
        rejectedRows.length === 0 &&
        missingSkus.length === 0 &&
        unexpectedSkus.length === 0,
      verified: null,
      rows,
      rejectedRows,
      missingSkus,
      unexpectedSkus,
      mismatches: [],
      ...(trackId ? { trackId } : {}),
    };
    if (envelopeRejected || rejectedRows.length || missingSkus.length || unexpectedSkus.length) {
      throw new SnappShopPartialSuccessError('SnappShop rejected one or more product rows', {
        ...(trackId ? { trackId } : {}),
        details: result,
      });
    }
    return result;
  }

  async function updateAndVerify(
    vendorId: string,
    products: ProductUpdate[],
    options: ProductMutationOptions = {},
  ): Promise<ProductUpdateResult> {
    const validatedProducts = z.array(productUpdateSchema).min(1).parse(products);
    const result = await update(vendorId, validatedProducts, options);
    const acceptedIds = new Map(
      result.rows.filter((row) => row.id).map((row) => [row.sku, row.id as string]),
    );
    const mismatches: ProductMismatch[] = [];
    for (const expected of validatedProducts) {
      const id = acceptedIds.get(expected.sku);
      if (!id) {
        throw new SnappShopValidationError(
          `No product id returned for accepted SKU ${expected.sku}`,
        );
      }
      const actual = await get(vendorId, id, {
        ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const fields: ProductMismatch['fields'] = [];
      if (actual.price !== expected.price)
        fields.push({ field: 'price', expected: expected.price, actual: actual.price });
      const effectiveStock = isDiscountActive(actual.discount)
        ? actual.discount.stock
        : actual.stock;
      if (effectiveStock !== expected.stock)
        fields.push({ field: 'stock', expected: expected.stock, actual: effectiveStock });
      if (fields.length) mismatches.push({ sku: expected.sku, fields });
    }
    const verified = mismatches.length === 0;
    const verifiedResult = { ...result, verified, mismatches };
    if (!verified) {
      throw new SnappShopReadbackMismatchError('Product update read-back mismatch', {
        details: verifiedResult,
      });
    }
    return verifiedResult;
  }

  return {
    list,
    get,
    update,
    updateAndVerify,
    async *iterate(query: Omit<ProductListQuery, 'page'>): AsyncGenerator<SnappShopProduct> {
      let page = 1;
      for (;;) {
        const response = await list({ ...query, page });
        yield* response.data;
        if (page >= response.meta.pagination.total_pages) return;
        page += 1;
      }
    },
  };
}

function refuseDuplicateSkus(products: ProductUpdate[]) {
  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.sku)) {
      throw new SnappShopValidationError(`Duplicate SKU in update batch: ${product.sku}`);
    }
    seen.add(product.sku);
  }
}

function isDiscountActive(
  discount: SnappShopProduct['discount'],
): discount is NonNullable<SnappShopProduct['discount']> {
  if (!discount) return false;
  const today = new Date().toISOString().slice(0, 10);
  return discount.start_at.slice(0, 10) <= today && discount.end_at.slice(0, 10) >= today;
}
