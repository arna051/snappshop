import { Module, type DynamicModule, type FactoryProvider, type Provider } from '@nestjs/common';
import { createSnappShopClient, type SnappShopClientOptions } from '../index.js';

export const SNAPPSHOP_CLIENT = Symbol.for('snappshop.client');
export const SNAPPSHOP_OPTIONS = Symbol.for('snappshop.options');

export interface SnappShopModuleAsyncOptions {
  imports?: DynamicModule['imports'];
  inject?: FactoryProvider['inject'];
  useFactory: FactoryProvider<SnappShopClientOptions>['useFactory'];
  extraProviders?: Provider[];
  global?: boolean;
}

export type SnappShopNestClient = ReturnType<typeof createSnappShopClient>;

@Module({})
export class SnappShopModule {
  static forRoot(options: SnappShopClientOptions & { global?: boolean }): DynamicModule {
    const { global = false, ...clientOptions } = options;
    return {
      module: SnappShopModule,
      global,
      providers: [
        { provide: SNAPPSHOP_OPTIONS, useValue: clientOptions },
        { provide: SNAPPSHOP_CLIENT, useFactory: () => createSnappShopClient(clientOptions) },
      ],
      exports: [SNAPPSHOP_CLIENT],
    };
  }

  static forRootAsync(options: SnappShopModuleAsyncOptions): DynamicModule {
    const optionsProvider: FactoryProvider<SnappShopClientOptions> = {
      provide: SNAPPSHOP_OPTIONS,
      inject: options.inject ?? [],
      useFactory: options.useFactory,
    };
    return {
      module: SnappShopModule,
      global: options.global ?? false,
      imports: options.imports ?? [],
      providers: [
        optionsProvider,
        {
          provide: SNAPPSHOP_CLIENT,
          inject: [SNAPPSHOP_OPTIONS],
          useFactory: (clientOptions: SnappShopClientOptions) =>
            createSnappShopClient(clientOptions),
        },
        ...(options.extraProviders ?? []),
      ],
      exports: [SNAPPSHOP_CLIENT],
    };
  }
}
