import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url);
for (const [subpath, value] of Object.entries(pkg.exports)) {
  if (typeof value === 'string') continue;
  if (
    !value.import?.default ||
    !value.import?.types ||
    !value.require?.default ||
    !value.require?.types
  ) {
    throw new Error(`Incomplete export conditions for ${subpath}`);
  }
  if (!value.require.types.endsWith('.d.cts')) {
    throw new Error(`CommonJS types must use .d.cts for ${subpath}`);
  }
  for (const mode of ['import', 'require']) {
    await access(new URL(`..${value[mode].default.slice(1)}`, import.meta.url));
    await access(new URL(`..${value[mode].types.slice(1)}`, import.meta.url));
  }
  const esmUrl = new URL(`..${value.import.default.slice(1)}`, import.meta.url);
  const cjsPath = fileURLToPath(new URL(`..${value.require.default.slice(1)}`, import.meta.url));
  const esm = await import(esmUrl.href);
  const cjs = require(cjsPath);
  if (JSON.stringify(Object.keys(esm).sort()) !== JSON.stringify(Object.keys(cjs).sort())) {
    throw new Error(`ESM/CommonJS export mismatch for ${subpath}`);
  }
}
