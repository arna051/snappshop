import { createOrdersResource } from './orders/index.js';
import { createProductsResource } from './products/index.js';
import { SnappShopTransport, type TransportOptions } from './http/transport.js';
import { createVendorsResource } from './vendors/index.js';

export type SnappShopClientOptions = TransportOptions;

export function createSnappShopClient(options: SnappShopClientOptions) {
  const transport = new SnappShopTransport(options);
  return {
    vendors: createVendorsResource(transport),
    products: createProductsResource(transport),
    orders: createOrdersResource(transport),
  };
}

export * from './core/errors.js';
export * from './core/money.js';
export * from './http/transport.js';
export * from './schemas/common.js';
export * from './schemas/vendor.js';
export * from './schemas/product.js';
export * from './schemas/order.js';
export type {
  ProductListQuery,
  ProductMutationOptions,
  ProductUpdateResult,
} from './products/index.js';
export type { OrderHistoryQuery } from './orders/index.js';
