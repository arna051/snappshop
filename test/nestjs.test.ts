import { describe, expect, it } from 'vitest';
import { SNAPPSHOP_CLIENT, SNAPPSHOP_OPTIONS, SnappShopModule } from '../src/nestjs/index.js';

describe('NestJS module', () => {
  it('registers a client without controllers or persistence side effects', () => {
    const module = SnappShopModule.forRoot({
      credentials: { token: 'token', clientCode: 'code' },
    });
    expect(module.module).toBe(SnappShopModule);
    expect(module.controllers).toBeUndefined();
    expect(module.exports).toContain(SNAPPSHOP_CLIENT);
    expect(module.providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ provide: SNAPPSHOP_OPTIONS })]),
    );
  });

  it('supports asynchronous configuration', () => {
    const module = SnappShopModule.forRootAsync({
      inject: ['CONFIG'],
      useFactory: async () => ({ credentials: { token: 'token', clientCode: 'code' } }),
    });
    expect(module.imports).toEqual([]);
    expect(module.exports).toContain(SNAPPSHOP_CLIENT);
  });
});
