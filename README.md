# snappshop

An unofficial, typed TypeScript SDK and website catalog integration toolkit for SnappShop.
This package is not affiliated with, endorsed by, or sponsored by SnappShop.

It supports two separate integration directions:

- A Node.js seller-automation client that calls SnappShop.
- A website catalog provider that lets SnappShop read a seller's catalog.

Seller credentials are never available from the browser entry point.

## Installation

```bash
npm install snappshop
```

Node.js 20 or newer is required. The package provides ESM and CommonJS builds.

## Seller client

```ts
import { createSnappShopClient } from 'snappshop';

const snappshop = createSnappShopClient({
  credentials: {
    token: process.env.SNAPPSHOP_TOKEN!,
    clientCode: process.env.SNAPPSHOP_CLIENT_CODE!,
  },
  timeoutMs: 60_000,
});

const vendors = await snappshop.vendors.list();
const products = await snappshop.products.list({ vendorId: vendors[0]!.id, page: 1, size: 50 });
```

Every client owns its Axios instance, credentials, retry budget and request state. Create one client
per account. Credentials are not stored in global mutable state.

### Pagination

Product pagination is page-based:

```ts
for await (const product of snappshop.products.iterate({ vendorId, size: 50 })) {
  // ...
}
```

Order history uses a distinct cursor iterator:

```ts
for await (const order of snappshop.orders.iterate({
  vendorId,
  startDate: '2026-11-01',
  endDate: '2026-11-07',
})) {
  // Unknown upstream statuses are preserved as strings.
}
```

### Product updates

The high-level update schema requires `price` and `stock` together. Operational evidence shows
that SnappShop validates those fields together, despite older documentation describing them as
independently optional.

```ts
try {
  const result = await snappshop.products.updateAndVerify(vendorId, [
    { sku: 'SKU-1', price: 850_000, stock: 3 },
  ]);
  console.log(result.accepted, result.verified, result.rows);
} catch (error) {
  // SnappShopReadbackMismatchError.details contains the mismatches.
  console.error(error);
}
```

Applications can reject suspicious price changes before any request is sent:

```ts
await snappshop.products.update(vendorId, products, {
  priceGuard: (update) => update.price <= approvedMaximumFor(update.sku),
});
```

`PATCH` is the empirical default because existing live-tested code reports `PUT` returning HTTP 405. Select the documented method explicitly when required:

```ts
await snappshop.products.update(vendorId, products, { method: 'PUT' });
```

The SDK never silently retries a mutation using a different method. HTTP 200 is not treated as
success when a response row has `status: false`. `updateAndVerify` also reads each accepted product
back and distinguishes acknowledgement from verification.

### Money units

Product prices are sent as explicit integer values in the upstream product unit, operationally
observed as toman. Order values must be converted deliberately:

```ts
import { orderMoneyToRial, snappShopOrderMoney } from 'snappshop';

const amountRial = orderMoneyToRial(snappShopOrderMoney(order.items[0]!.final_price));
```

There are no hidden currency conversions in HTTP serialization.

### Retries and errors

Read requests use bounded retries for 429, 500, 502, 503 and 504 and respect `Retry-After`.
Mutations are not automatically retried. A request timeout is 60 seconds by default, and retry
elapsed time is bounded separately.

Typed errors include authentication, authorization, validation, rate-limit, transport, API,
partial-success, read-back mismatch and mapping ambiguity errors. Safe upstream `trackId` values
are preserved. Configured tokens and client codes are redacted from transport errors.

## Website catalog provider

The provider is framework-neutral and uses standard Fetch `Request` and `Response` objects.
Authentication is required by default.

```ts
import { createCatalogProvider } from 'snappshop/catalog';

const catalog = createCatalogProvider({
  origin: 'https://shop.example',
  basePath: '/snappshop',
  authentication: { tokens: [process.env.SNAPPSHOP_CATALOG_TOKEN!] },
  repository: myCatalogRepository,
});

const response = await catalog.fetch(request);
```

Confirmed routes are:

- `GET /status`
- `GET /products`
- `GET /products/{productCode}`
- `GET /resolve?url=...`
- `GET /categories`
- `GET /attributes`

The repository supplies data. The package supplies query validation, serialization validation,
Bearer authentication, rotation, page limits, response-size limits, same-origin resolution and
safe generic errors.

Product page URLs must use `origin`. Media URLs must also use it unless their origins are listed in
`allowedAssetOrigins` (for example, a separately controlled image CDN).

Rotate tokens atomically:

```ts
catalog.rotateTokens([newToken]); // old tokens become invalid immediately
```

Unauthenticated mode is deliberately loud:

```ts
authentication: { mode: 'none', acknowledgeRisk: true }
```

Protected responses include `Cache-Control: private, no-store` and `Vary: Authorization`.

### Express

```ts
import express from 'express';
import { createCatalogProvider } from 'snappshop/catalog';
import { expressCatalogHandler } from 'snappshop/catalog/express';

const app = express();
app.use('/snappshop', expressCatalogHandler(catalog));
```

### Next.js

`snappshop/catalog/next` turns the framework-neutral provider into App Router method handlers:

```ts
import { createNextCatalogHandlers } from 'snappshop/catalog/next';

export const { GET, POST, PUT, PATCH, DELETE } = createNextCatalogHandlers(catalog);
```

Only `GET` is supported; other methods return a safe HTTP 405 response.

## NestJS

`snappshop/nestjs` provides dependency-optional dynamic configuration without forcing controllers,
Mongoose or queues into applications that only need the SDK.

```ts
import { Module } from '@nestjs/common';
import { SnappShopModule } from 'snappshop/nestjs';

@Module({
  imports: [
    SnappShopModule.forRoot({
      credentials: { token: process.env.SNAPPSHOP_TOKEN!, clientCode: 'my-client-code' },
    }),
  ],
})
export class AppModule {}
```

`SnappShopModule.forRootAsync(...)` is available for configuration-service and secret-store use.
Inject `SNAPPSHOP_CLIENT` to receive the account-scoped client.

## Mongoose

`snappshop/mongoose` is optional and Node-only. It supplies account, product-mapping and order
checkpoint models with unique indexes and configurable model/collection prefixes. Credential
encryption is always injected; the package does not contain or choose encryption keys.

```ts
import { createSnappShopModels } from 'snappshop/mongoose';

const models = createSnappShopModels({
  connection,
  encryption: myEncryptionProvider,
});
```

Importing the factory repeatedly does not overwrite registered Mongoose models.

Mappings are isolated by account, vendor and an optional `scopeId` (for example, a store). Local
and SnappShop product identities are unique inside that scope. SKUs are intentionally non-unique:
production data can contain duplicate vendor/SKU combinations, so `findUniqueMapping` refuses an
ambiguous result instead of silently selecting one. The models enforce their own validation and do
not assume that an existing MongoDB collection has a server-side validator.

## Channel adapter

`snappshop/channel` exposes explicit capability discovery. Shipment publishing is currently false
because no upstream shipment-mutation endpoint was substantiated. Order event polling is marked
experimental because consumption semantics remain unclear.

## Browser entry point

`snappshop/browser` contains schemas, types and pure money utilities only. It has no Axios client,
seller credentials, Mongoose code or Node-only modules.

## Testing

```bash
npm run verify
npm pack --dry-run
```

Live tests are opt-in and require the exact `SNAPPSHOP_LIVE_TEST` safety gate exposed by
`snappshop/testing`. Product mutations require an isolated SKU and a reversible plan. Order
mutations are not implemented.

## Known contract uncertainties

- Older documentation specifies `PUT` for product updates; operational evidence supports `PATCH`.
- Price and stock are documented as optional but observed to be required together.
- Product and order money appear to use different units.
- Reading `/orders/events` may have queue-consumption semantics and should be enabled cautiously.
- Batch size 50 is an operational safe value, not a verified platform maximum.

## Credits

By: Hippogriff Studio  
https://hippogriff.ir  
Call me: +989038719255

**DO NOT FORGET TO DONATE!**
