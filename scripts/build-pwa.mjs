import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = path.join(root, 'pwa');
const output = path.resolve(root, 'pwa-dist');
if (output === root || !output.startsWith(`${root}${path.sep}`)) throw new Error('Output must be a subdirectory of the repository');
const version = process.env.PWA_VERSION || JSON.parse(await readFile(path.join(source, 'version.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Version must be x.y.z');
const files = (await readdir(path.join(source, 'hello'))).sort();
const contents = await Promise.all(files.map(name => readFile(path.join(source, 'hello', name))));
const template = await readFile(path.join(source, 'sw-template.js'), 'utf8');
const hash = createHash('sha256').update(version).update(template).update(await readFile(fileURLToPath(import.meta.url)));
files.forEach((name, i) => hash.update(name).update(contents[i]));
const buildId = hash.digest('hex').slice(0, 12);
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'hello', 'icons'), { recursive: true });
for (let i = 0; i < files.length; i++) await writeFile(path.join(output, 'hello', files[i]), contents[i].toString().replaceAll('__VERSION__', version).replaceAll('__BUILD_ID__', buildId));
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, checksum]);
}
function icon(size) {
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = x / size, b = y / size;
    const white = b > .28 && b < .72 && ((a > .30 && a < .38) || (a > .62 && a < .70) || (b > .46 && b < .54 && a > .3 && a < .7));
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    rows.set(white ? [255, 255, 255] : [20, 86, 219], offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) await writeFile(path.join(output, 'hello', 'icons', name), icon(size));
const assets = [];
async function inventory(directory, prefix = './') {
  for (const name of (await readdir(directory)).sort()) {
    if (name === 'icons') { await inventory(path.join(directory, name), `${prefix}icons/`); continue; }
    assets.push({ path: `${prefix}${name}`, hash: createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex') });
  }
}
await inventory(path.join(output, 'hello'));
await writeFile(path.join(output, 'hello', 'sw.js'), template.replaceAll('__BUILD_ID__', buildId).replace('__ASSETS__', JSON.stringify(assets)));
await writeFile(path.join(output, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./hello/"><title>Game Shelf</title><a href="./hello/">Open Game Shelf</a></html>\n');
await writeFile(path.join(output, '.nojekyll'), '');
process.stdout.write(`PWA ${version}, build ${buildId}: ${assets.length} verified assets → ${output}\n`);
