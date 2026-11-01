const BUILD_ID = '__BUILD_ID__';
const PREFIX = `hello-pwa:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}${BUILD_ID}`;
const ASSETS = __ASSETS__;
const url = path => new URL(path, self.registration.scope).href;
const digest = async response => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
async function valid(response, hash) { return !!response && response.ok && await digest(response.clone()) === hash; }
async function populate(repair = false) {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(ASSETS.map(async asset => {
    if (repair && await valid(await cache.match(url(asset.path)), asset.hash)) return;
    const response = await fetch(url(asset.path), { cache: 'no-store', credentials: 'same-origin' });
    if (!await valid(response, asset.hash)) throw new Error(`Filkontrollen misslyckades: ${asset.path}`);
    await cache.put(url(asset.path), response);
  }));
  if (results.some(r => r.status === 'rejected')) throw new Error('Offlinepaketet kunde inte hämtas komplett. Anslut nätet och försök igen.');
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
