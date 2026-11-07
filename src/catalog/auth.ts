import { z } from 'zod';

export type CatalogAuthentication =
  { mode?: 'bearer'; tokens: string[] } | { mode: 'none'; acknowledgeRisk: true };

export function parseCatalogAuthentication(value: unknown): CatalogAuthentication {
  const bearer = z
    .object({
      mode: z.literal('bearer').optional(),
      tokens: z.array(z.string().min(32)).min(1).max(10),
    })
    .strict();
  const anonymous = z
    .object({ mode: z.literal('none'), acknowledgeRisk: z.literal(true) })
    .strict();
  return z.union([bearer, anonymous]).parse(value) as CatalogAuthentication;
}

export interface CatalogTokenStore {
  authorize(header: string | null): boolean;
  rotate(tokens: string[]): void;
}

export function createCatalogTokenStore(initialTokens: string[]): CatalogTokenStore {
  let tokens = validateTokens(initialTokens);
  return {
    authorize(header) {
      const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
      if (!match?.[1]) return false;
      return tokens.some((expected) => constantTimeEqual(expected, match[1] as string));
    },
    rotate(nextTokens) {
      tokens = validateTokens(nextTokens);
    },
  };
}

function validateTokens(tokens: string[]) {
  return z.array(z.string().min(32)).min(1).max(10).parse(tokens).slice();
}

function constantTimeEqual(expected: string, provided: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(expected);
  const right = encoder.encode(provided);
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
