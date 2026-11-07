import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/browser/index.ts',
    'src/catalog/index.ts',
    'src/catalog/express.ts',
    'src/catalog/next.ts',
    'src/nestjs/index.ts',
    'src/mongoose/index.ts',
    'src/channel/index.ts',
    'src/testing/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['@nestjs/common', 'axios', 'express', 'mongoose'],
});
