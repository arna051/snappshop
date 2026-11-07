import type { SnappShopClientOptions } from '../index.js';
import { createSnappShopClient } from '../index.js';

export const SNAPP_SHOP_CHANNEL_CAPABILITIES = Object.freeze({
  vendorDiscovery: true,
  catalogImport: true,
  priceAndInventoryPublishing: true,
  orderImport: true,
  orderEventPolling: 'experimental',
  shipmentPublishing: false,
} as const);

export function createSnappShopChannel(options: {
  accountId: string;
  vendorId: string;
  client?: ReturnType<typeof createSnappShopClient>;
  clientOptions?: SnappShopClientOptions;
}) {
  if (!options.client && !options.clientOptions) {
    throw new TypeError('client or clientOptions is required');
  }
  return {
    id: 'snappshop',
    unofficial: true,
    accountId: options.accountId,
    vendorId: options.vendorId,
    capabilities: SNAPP_SHOP_CHANNEL_CAPABILITIES,
    client:
      options.client ?? createSnappShopClient(options.clientOptions as SnappShopClientOptions),
  };
}
