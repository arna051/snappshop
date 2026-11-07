import { vendorIdSchema } from '../schemas/common.js';
import { vendorResponseSchema, vendorsResponseSchema } from '../schemas/vendor.js';
import type { SnappShopTransport } from '../http/transport.js';

export function createVendorsResource(transport: SnappShopTransport) {
  return {
    async list() {
      return (await transport.get('/vendors', vendorsResponseSchema)).data;
    },
    async get(vendorId: string) {
      const id = vendorIdSchema.parse(vendorId);
      return (await transport.get(`/vendors/${encodeURIComponent(id)}`, vendorResponseSchema)).data;
    },
  };
}
