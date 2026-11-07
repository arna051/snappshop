import { readFile } from 'node:fs/promises';

const files = ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts'];
const forbidden = [
  'axios',
  'mongoose',
  'node:',
  'Authorization',
  'Bearer ',
  'process.env',
  'SNAPPSHOP_TOKEN',
];
for (const file of files) {
  const browser = await readFile(new URL(`../dist/browser/${file}`, import.meta.url), 'utf8');
  for (const text of forbidden) {
    if (browser.includes(text)) throw new Error(`${file} contains forbidden text: ${text}`);
  }
}
