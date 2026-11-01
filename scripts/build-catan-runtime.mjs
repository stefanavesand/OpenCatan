import { build } from 'vite';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const result = await build({ configFile: false, publicDir: false, logLevel: 'silent', resolve: { alias: { '@': path.resolve('src') } },
  build: { write: false, minify: false, lib: { entry: path.resolve('src/game/session/index.ts'), formats: ['es'], fileName: 'catan-runtime' } } });
const chunk=(Array.isArray(result)?result:[result]).flatMap(r=>r.output).find(item=>item.type==='chunk');
const license=await readFile('licenses/catan-ai-MIT.txt','utf8');
const code=`/* Third-party settlement heuristic: 8910work-cell/catan-ai, MIT.\n${license}\n*/\n${chunk.code}`;
await writeFile('/tmp/catan-runtime.js',code);
console.log('Shared runtime:',code.length,'bytes, SHA256',createHash('sha256').update(code).digest('hex'));
