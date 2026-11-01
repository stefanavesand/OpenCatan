const BUILD_ID = '6551dbe9609a';
const PREFIX = `hello-pwa:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}${BUILD_ID}`;
const ASSETS = [{"path":"./app.js","hash":"c6473470327b99fc62d6c750e3148f062ecbf8872fe0ca9a1ec2a792e3c1e51a"},{"path":"./game.js","hash":"b055118d84cd732debf49c098355d1c903837fd5bcaa62db3826d245d647f748"},{"path":"./icons/apple-touch-icon.png","hash":"79514ad8c965354ee75bb6a7e45f27f2fd3fcea567c8448c39fe4720eaa095a4"},{"path":"./icons/icon-192.png","hash":"2a34b19737afae8a4abdf910895031fcbc76908b3e30ae3cb08689dd2e584c2c"},{"path":"./icons/icon-512.png","hash":"2133054c1f79ab8bce24a11a07e17a7237ef253325e08bb1eecebb9b6624b0d7"},{"path":"./index.html","hash":"298b3846028f0c9e77ad30b60770c119aa4deb74daec8180705e121b646c8226"},{"path":"./library.js","hash":"ce65df443b4b44d683c17739a95f17792d1139003460cd2a66009694c36702a6"},{"path":"./manifest.webmanifest","hash":"3ebbe811eb92bd0233f664f7e0a7a182a7ec7e819a439ce08030271e43c5b137"},{"path":"./online-transport.js","hash":"87858d5c81e2078ce1c1751029a9aa5b8ac051ebdd78b6fe8460e28a5a138c76"},{"path":"./online.js","hash":"3de4c3a2125cc971696071709a3e5429c63633cbcec22c796116cb5d00b3a18f"},{"path":"./session-state.js","hash":"82596392f14417f6e8420bd4115fa60cfd2de26692cf6f0fadafdee7cc68250c"},{"path":"./storage.js","hash":"d456fe2c8d4d5e60eadd78f00e6858ef61e41a836eef37f5fa96c6ce28d4f667"},{"path":"./style.css","hash":"70da696b014d113aa964de4dec84fefa6a1dd0828803700371edb61bf9c8b022"}];
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
