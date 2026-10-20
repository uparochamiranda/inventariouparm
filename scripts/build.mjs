import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
// Somente arquivos públicos entram no Pages; Apps Script e testes ficam fora.
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root,'dist');
if (dirname(output) !== resolve(root)) throw new Error('Destino de build fora do projeto.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'api.js', 'scanner.js', 'config.js', 'vendor']) {
  await cp(resolve(root,name), resolve(output,name), { recursive: true });
}
console.log('Site estático preparado em dist/.');
