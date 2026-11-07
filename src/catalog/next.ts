import type { CatalogProvider } from './index.js';

export function createNextCatalogHandlers(provider: CatalogProvider) {
  const GET = (request: Request) => provider.fetch(request);
  const unsupported = () =>
    Promise.resolve(
      new Response(JSON.stringify({ status: false, message: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'private, no-store',
          Vary: 'Authorization',
        },
      }),
    );
  return { GET, POST: unsupported, PUT: unsupported, PATCH: unsupported, DELETE: unsupported };
}
