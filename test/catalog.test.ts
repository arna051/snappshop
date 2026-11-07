import { describe, expect, it } from 'vitest';
import { createCatalogProvider, type CatalogRepository } from '../src/catalog/index.js';

const token = 'a'.repeat(32);
const replacement = 'b'.repeat(32);
const repository: CatalogRepository = {
  async listProducts() {
    return { items: [], total: 0 };
  },
  async getProduct() {
    return null;
  },
  async resolve(url) {
    return { type: 'archive', url: url.href, apiUrl: `https://shop.example/snappshop/products` };
  },
  async listCategories() {
    return { items: [], total: 0 };
  },
  async listAttributes() {
    return { items: [], total: 0 };
  },
};

function request(path: string, bearer?: string) {
  return new Request(`https://shop.example/snappshop${path}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
}

describe('catalog security', () => {
  it('requires bearer auth and emits private no-store responses', async () => {
    const provider = createCatalogProvider({
      repository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
    });
    expect((await provider.fetch(request('/products'))).status).toBe(401);
    expect((await provider.fetch(request('/products'))).headers.get('www-authenticate')).toBe(
      'Bearer',
    );
    const response = await provider.fetch(request('/products', token));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Authorization');
  });

  it('keeps the minimal status route public', async () => {
    const provider = createCatalogProvider({
      repository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
    });
    const response = await provider.fetch(request('/status'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
  });

  it('invalidates old tokens during rotation', async () => {
    const provider = createCatalogProvider({
      repository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
    });
    provider.rotateTokens([replacement]);
    expect((await provider.fetch(request('/products', token))).status).toBe(401);
    expect((await provider.fetch(request('/products', replacement))).status).toBe(200);
  });

  it('rejects resolver SSRF and open redirects', async () => {
    const provider = createCatalogProvider({
      repository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
    });
    const target = encodeURIComponent('http://127.0.0.1/admin');
    expect((await provider.fetch(request(`/resolve?url=${target}`, token))).status).toBe(400);
  });

  it('rejects cross-origin URLs returned by a repository', async () => {
    const unsafeRepository: CatalogRepository = {
      ...repository,
      async resolve(url) {
        return { type: 'archive', url: url.href, apiUrl: 'https://attacker.example/steal' };
      },
    };
    const provider = createCatalogProvider({
      repository: unsafeRepository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
    });
    const target = encodeURIComponent('https://shop.example/category/a');
    expect((await provider.fetch(request(`/resolve?url=${target}`, token))).status).toBe(400);
  });

  it('enforces serialized response size limits', async () => {
    const provider = createCatalogProvider({
      repository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
      maxResponseBytes: 20,
    });
    expect((await provider.fetch(request('/products', token))).status).toBe(413);
  });

  it('caps page size', async () => {
    const provider = createCatalogProvider({
      repository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
      maxPageSize: 50,
    });
    expect((await provider.fetch(request('/products?per_page=51', token))).status).toBe(400);
  });

  it('rejects unknown filters instead of silently ignoring them', async () => {
    const provider = createCatalogProvider({
      repository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
    });
    expect((await provider.fetch(request('/products?redirect=http://evil', token))).status).toBe(
      400,
    );
  });

  it('requires the explicit runtime acknowledgment for anonymous mode', () => {
    expect(() =>
      createCatalogProvider({
        repository,
        origin: 'https://shop.example',
        authentication: { mode: 'none' } as never,
      }),
    ).toThrow();
  });

  it('rejects alternate origins and paths containing a misplaced base segment', async () => {
    const provider = createCatalogProvider({
      repository,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
    });
    const foreign = new Request('https://attacker.example/snappshop/status');
    expect((await provider.fetch(foreign)).status).toBe(400);
    const misplaced = new Request('https://shop.example/anything/snappshop/status');
    expect((await provider.fetch(misplaced)).status).toBe(404);
  });

  it('rejects cross-origin product URLs emitted by repositories', async () => {
    const unsafe: CatalogRepository = {
      ...repository,
      async listProducts() {
        return {
          total: 1,
          items: [{ id: 1, code: '1', active: true, stock: 1, url: 'http://127.0.0.1/private' }],
        };
      },
    };
    const provider = createCatalogProvider({
      repository: unsafe,
      origin: 'https://shop.example',
      authentication: { tokens: [token] },
    });
    expect((await provider.fetch(request('/products', token))).status).toBe(400);
  });
});
