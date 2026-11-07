import type { Request, RequestHandler, Response } from 'express';
import type { CatalogProvider } from './index.js';

export function expressCatalogHandler(provider: CatalogProvider): RequestHandler {
  return async (request: Request, response: Response) => {
    const origin = `${request.protocol}://${request.get('host') ?? 'localhost'}`;
    const fetchRequest = new globalThis.Request(new URL(request.originalUrl, origin), {
      method: request.method,
      headers: request.headers as HeadersInit,
    });
    const result = await provider.fetch(fetchRequest);
    response.status(result.status);
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.send(await result.text());
  };
}
