const BUILD_ID = '6201b5fd317b';
const PREFIX = `hello-pwa:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}${BUILD_ID}`;
const ASSETS = [{"path":"./app.js","hash":"a3ba4da4074309f722fb0a301d8afe53805515f0536e34a12012761ee001a34c"},{"path":"./catan-engine.js","hash":"54735ddec062dd773d16ec6acef8e5d280501db6d9a9fec14852b189bf8b08c1"},{"path":"./catan.js","hash":"21d2ff14be716e03b9a6ca86da5af43be6f82f21c6148782cc922e4db8aa0c18"},{"path":"./game.js","hash":"b055118d84cd732debf49c098355d1c903837fd5bcaa62db3826d245d647f748"},{"path":"./icons/apple-touch-icon.png","hash":"79514ad8c965354ee75bb6a7e45f27f2fd3fcea567c8448c39fe4720eaa095a4"},{"path":"./icons/icon-192.png","hash":"2a34b19737afae8a4abdf910895031fcbc76908b3e30ae3cb08689dd2e584c2c"},{"path":"./icons/icon-512.png","hash":"2133054c1f79ab8bce24a11a07e17a7237ef253325e08bb1eecebb9b6624b0d7"},{"path":"./index.html","hash":"edb1e75f1f3bcb83a7aac094e76a699a18b32a0639717a4593b17e10199b3468"},{"path":"./library.js","hash":"1932d40cae58a6f83bfae76fc5c7a8e1ee34d441e59ab79d6184f861e7a9746c"},{"path":"./manifest.webmanifest","hash":"3ebbe811eb92bd0233f664f7e0a7a182a7ec7e819a439ce08030271e43c5b137"},{"path":"./online-transport.js","hash":"87858d5c81e2078ce1c1751029a9aa5b8ac051ebdd78b6fe8460e28a5a138c76"},{"path":"./online.js","hash":"3de4c3a2125cc971696071709a3e5429c63633cbcec22c796116cb5d00b3a18f"},{"path":"./record-store.js","hash":"ccc9bbf1b7065f2e0d46c80bf6eefa2ea2fab530df4fe7497fba5d203333ad2e"},{"path":"./session-state.js","hash":"82596392f14417f6e8420bd4115fa60cfd2de26692cf6f0fadafdee7cc68250c"},{"path":"./storage.js","hash":"c8a3f7ca754292891aa33d9970b78c6c1bae2268eedcf68ddb6be620ee0ba5df"},{"path":"./style.css","hash":"938f10adb937be6f377f1827bc6be354cf3910fad0f64adc483014c4ebbc3a04"}];
const url = path => new URL(path, self.registration.scope).href;
const digest = async response => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
async function valid(response, hash) { return !!response && response.ok && await digest(response.clone()) === hash; }
async function populate(repair = false) {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(ASSETS.map(async asset => {
    if (repair && await valid(await cache.match(url(asset.path)), asset.hash)) return;
    const response = await fetch(url(asset.path), { cache: 'no-store', credentials: 'same-origin' });
    if (!await valid(response, asset.hash)) throw new Error(`File verification failed: ${asset.path}`);
    await cache.put(url(asset.path), response);
  }));
  if (results.some(r => r.status === 'rejected')) throw new Error('The offline package could not be fully downloaded. Connect to the internet and try again.');
}
async function verify() {
  const cache = await caches.open(CACHE);
  const checks = await Promise.all(ASSETS.map(async asset => valid(await cache.match(url(asset.path)), asset.hash)));
  return checks.every(Boolean);
}
self.addEventListener('install', event => {
  event.waitUntil(populate().catch(async error => { await caches.delete(CACHE); throw error; }));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await Promise.all((await caches.keys()).filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const requested = new URL(request.url);
  if (requested.origin !== self.location.origin || !request.url.startsWith(self.registration.scope)) return;
  const index = url('./index.html');
  const key = request.mode === 'navigate' && (requested.pathname === new URL(self.registration.scope).pathname || requested.pathname === new URL(index).pathname)
    ? index : request.url;
  event.respondWith((async () => (await (await caches.open(CACHE)).match(key)) || fetch(request))());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') { self.skipWaiting(); return; }
  if (!['CHECK_OFFLINE', 'REPAIR_OFFLINE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'REPAIR_OFFLINE') await populate(true);
      event.ports[0]?.postMessage({ ok: await verify(), buildId: BUILD_ID });
    } catch (error) { event.ports[0]?.postMessage({ ok: false, buildId: BUILD_ID, error: error.message }); }
  })());
});
