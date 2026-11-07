import { z } from 'zod';
import {
  createCatalogTokenStore,
  parseCatalogAuthentication,
  type CatalogAuthentication,
  type CatalogTokenStore,
} from './auth.js';
import type { CatalogProductQuery, CatalogRepository } from './repository.js';
import {
  catalogAttributeSchema,
  catalogCategorySchema,
  catalogProductSchema,
  catalogProductSummarySchema,
  catalogResolutionSchema,
} from './schemas.js';

export interface CatalogProviderOptions {
  repository: CatalogRepository;
  origin: string;
  authentication: CatalogAuthentication;
  basePath?: string;
  allowedAssetOrigins?: string[];
  maxPageSize?: number;
  maxResponseBytes?: number;
  tokenStore?: CatalogTokenStore;
  rateLimit?: (request: Request) => boolean | Promise<boolean>;
}

export interface CatalogProvider {
  fetch(request: Request): Promise<Response>;
  rotateTokens(tokens: string[]): void;
}

export function createCatalogProvider(options: CatalogProviderOptions): CatalogProvider {
  const origin = new URL(options.origin);
  const authentication = parseCatalogAuthentication(options.authentication);
  const basePath = normalizeBasePath(options.basePath ?? '/snappshop');
  const allowedAssetOrigins = new Set([
    origin.origin,
    ...(options.allowedAssetOrigins ?? []).map((value) => new URL(value).origin),
  ]);
  const maxPageSize = z
    .number()
    .int()
    .positive()
    .max(1000)
    .parse(options.maxPageSize ?? 100);
  const maxResponseBytes = z
    .number()
    .int()
    .positive()
    .parse(options.maxResponseBytes ?? 5 * 1024 * 1024);
  const anonymous = authentication.mode === 'none';
  const tokenStore =
    authentication.mode === 'none'
      ? undefined
      : (options.tokenStore ?? createCatalogTokenStore(authentication.tokens));

  async function handle(request: Request): Promise<Response> {
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.origin !== origin.origin) {
        return response({ status: false, message: 'Invalid origin' }, 400);
      }
      if (request.method !== 'GET')
        return response({ status: false, message: 'Method not allowed' }, 405);
      const path = routePath(requestUrl.pathname, basePath);
      if (path === null) return response({ status: false, message: 'Not found' }, 404);
      if (path === '/status') return response({ status: true }, 200);
      if (!anonymous && !tokenStore?.authorize(request.headers.get('authorization'))) {
        return response({ status: false, message: 'Unauthorized' }, 401);
      }
      if (options.rateLimit && !(await options.rateLimit(request))) {
        return response({ status: false, message: 'Too many requests' }, 429);
      }
      if (path === '/products') {
        const query = parseProductQuery(requestUrl.searchParams, maxPageSize);
        const page = await options.repository.listProducts(query);
        const products = z.array(catalogProductSummarySchema).parse(page.items);
        for (const product of products) assertOrigin(product.url, origin.origin);
        return boundedResponse(
          {
            status: true,
            data: { products, total: page.total, page: query.page, per_page: query.perPage },
          },
          maxResponseBytes,
        );
      }
      const productMatch = /^\/products\/([A-Za-z0-9._~-]+)$/.exec(path);
      if (productMatch?.[1]) {
        const code = z.string().min(1).max(256).parse(decodeURIComponent(productMatch[1]));
        const product = await options.repository.getProduct(code);
        if (!product) return response({ status: false, message: 'Not found' }, 404);
        const validProduct = catalogProductSchema.parse(product);
        assertOrigin(validProduct.url, origin.origin);
        for (const media of validProduct.medias)
          assertAllowedOrigin(media.url, allowedAssetOrigins);
        return boundedResponse({ status: true, data: validProduct }, maxResponseBytes);
      }
      if (path === '/categories' || path === '/attributes') {
        const { page, perPage } = parsePage(requestUrl.searchParams, maxPageSize);
        const result =
          path === '/categories'
            ? await options.repository.listCategories(page, perPage)
            : await options.repository.listAttributes(page, perPage);
        const schema = path === '/categories' ? catalogCategorySchema : catalogAttributeSchema;
        return boundedResponse(
          {
            status: true,
            data: z.array(schema).parse(result.items),
            total: result.total,
            page,
            per_page: perPage,
          },
          maxResponseBytes,
        );
      }
      if (path === '/resolve') {
        const candidate = new URL(z.url().parse(requestUrl.searchParams.get('url')));
        if (candidate.origin !== origin.origin)
          return response({ status: false, message: 'Invalid URL' }, 400);
        const resolution = await options.repository.resolve(candidate);
        if (!resolution) return response({ status: false, message: 'Not found' }, 404);
        const valid = catalogResolutionSchema.parse(resolution);
        if (
          new URL(valid.url).origin !== origin.origin ||
          new URL(valid.apiUrl).origin !== origin.origin
        ) {
          return response({ status: false, message: 'Invalid resolution' }, 400);
        }
        return boundedResponse({ status: true, data: valid }, maxResponseBytes);
      }
      return response({ status: false, message: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof CatalogRequestError) {
        return response({ status: false, message: 'Invalid request' }, 400);
      }
      return response({ status: false, message: 'Internal server error' }, 500);
    }
  }

  return {
    fetch: handle,
    rotateTokens(tokens) {
      if (!tokenStore) throw new Error('Authentication is disabled');
      tokenStore.rotate(tokens);
    },
  };
}

class CatalogRequestError extends Error {}

function normalizeBasePath(path: string) {
  const normalized = `/${path.split('/').filter(Boolean).join('/')}`;
  return normalized === '/' ? '' : normalized;
}

function routePath(path: string, basePath: string): string | null {
  const normalized = `/${path.split('/').filter(Boolean).join('/')}`;
  if (!basePath) return normalized;
  if (normalized === basePath) return '/';
  return normalized.startsWith(`${basePath}/`) ? normalized.slice(basePath.length) : null;
}

function parsePage(params: URLSearchParams, maxPageSize: number) {
  return {
    page: z.coerce
      .number()
      .int()
      .positive()
      .parse(params.get('page') ?? 1),
    perPage: z.coerce
      .number()
      .int()
      .positive()
      .max(maxPageSize)
      .parse(params.get('per_page') ?? 24),
  };
}

function parseProductQuery(params: URLSearchParams, maxPageSize: number): CatalogProductQuery {
  const allowed = new Set([
    'page',
    'per_page',
    'search',
    'category',
    'orderby',
    'order',
    'stock_status',
    'featured',
    'on_sale',
    'min_price',
    'max_price',
  ]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw new CatalogRequestError(`Unsupported catalog filter: ${key}`);
  }
  const { page, perPage } = parsePage(params, maxPageSize);
  const optional = (name: string) => params.get(name)?.trim() || undefined;
  const boolean = (name: string) => {
    const value = optional(name);
    if (value === undefined) return undefined;
    return z
      .enum(['true', 'false', '1', '0'])
      .transform((item) => item === 'true' || item === '1')
      .parse(value);
  };
  const number = (name: string) => {
    const value = optional(name);
    return value === undefined ? undefined : z.coerce.number().nonnegative().parse(value);
  };
  const query: CatalogProductQuery = { page, perPage };
  const search = optional('search');
  const category = optional('category');
  const orderBy = optional('orderby');
  const order = optional('order');
  const stockStatus = optional('stock_status');
  const featured = boolean('featured');
  const onSale = boolean('on_sale');
  const minPrice = number('min_price');
  const maxPrice = number('max_price');
  if (search) query.search = z.string().max(200).parse(search);
  if (category) query.category = z.string().max(200).parse(category);
  if (orderBy)
    query.orderBy = z
      .enum(['id', 'title', 'date', 'modified', 'price', 'popularity'])
      .parse(orderBy);
  if (order) query.order = z.enum(['asc', 'desc']).parse(order.toLowerCase());
  if (stockStatus)
    query.stockStatus = z
      .array(z.enum(['instock', 'outofstock', 'onbackorder']))
      .parse(stockStatus.split(','));
  if (featured !== undefined) query.featured = featured;
  if (onSale !== undefined) query.onSale = onSale;
  if (minPrice !== undefined) query.minPrice = minPrice;
  if (maxPrice !== undefined) query.maxPrice = maxPrice;
  if (
    query.minPrice !== undefined &&
    query.maxPrice !== undefined &&
    query.minPrice > query.maxPrice
  ) {
    throw new CatalogRequestError('min_price cannot exceed max_price');
  }
  return query;
}

function boundedResponse(body: unknown, maxBytes: number) {
  const json = JSON.stringify(body);
  if (new TextEncoder().encode(json).byteLength > maxBytes) {
    return response({ status: false, message: 'Response too large' }, 413);
  }
  return responseText(json, 200);
}

function response(body: unknown, status: number) {
  return responseText(JSON.stringify(body), status);
}

function responseText(body: string, status: number) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    Vary: 'Authorization',
  });
  if (status === 401) headers.set('WWW-Authenticate', 'Bearer');
  return new Response(body, {
    status,
    headers,
  });
}

function assertOrigin(value: string, expectedOrigin: string) {
  if (new URL(value).origin !== expectedOrigin) throw new CatalogRequestError('Cross-origin URL');
}

function assertAllowedOrigin(value: string, allowedOrigins: Set<string>) {
  if (!allowedOrigins.has(new URL(value).origin)) {
    throw new CatalogRequestError('Asset URL origin is not allowed');
  }
}

export * from './auth.js';
export * from './repository.js';
export * from './schemas.js';
