import { execFileSync } from 'node:child_process';

const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});
const [report] = JSON.parse(output);
if (!report || !Array.isArray(report.files))
  throw new Error('npm pack did not return a file report');

const names = report.files.map((file) => file.path);
const required = ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.cjs'];
for (const file of required) {
  if (!names.includes(file)) throw new Error(`Packed artifact is missing ${file}`);
}
for (const file of names) {
  if (/^(node_modules|test|scripts)\//.test(file) || /(^|\/)\.env/.test(file)) {
    throw new Error(`Packed artifact contains forbidden file: ${file}`);
  }
}
