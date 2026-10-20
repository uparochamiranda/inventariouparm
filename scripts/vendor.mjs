import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = [
  ['https://unpkg.com/@zxing/browser@0.1.5/umd/zxing-browser.min.js', 'vendor/zxing-browser.min.js'],
  ['https://unpkg.com/@zxing/browser@0.1.5/LICENSE', 'vendor/ZXING-LICENSE'],
  ['https://unpkg.com/node-forge@1.4.0/dist/forge.min.js', 'apps-script/JwtLibrary.gs'],
  ['https://unpkg.com/node-forge@1.4.0/LICENSE', 'apps-script/FORGE-LICENSE.txt']
];
await mkdir('vendor', { recursive: true });
await mkdir('apps-script', { recursive: true });
const hashes = [];
for (const [url, path] of files) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  let bytes = Buffer.from(await response.arrayBuffer());
  if (path.endsWith('JwtLibrary.gs')) bytes = Buffer.concat([Buffer.from('// node-forge 1.4.0: compatibilidade V8 Apps Script; somente verificação RSA.\nvar window = {}; var self = window;\n'), bytes, Buffer.from('\nvar forge = window.forge;\n')]);
  await writeFile(path, bytes);
  hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${path}`);
  console.log(path, bytes.length);
}
await writeFile('vendor/SHA256SUMS', hashes.join('\n') + '\n');
