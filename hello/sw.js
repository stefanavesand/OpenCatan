const BUILD_ID = 'd79550e5c3ba';
const PREFIX = `hello-pwa:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}${BUILD_ID}`;
const ASSETS = [{"path":"./app.js","hash":"208337065522b9a21f9008de063ef5c217f7e0d8a2399ae42d16de24abd44864"},{"path":"./icons/apple-touch-icon.png","hash":"79514ad8c965354ee75bb6a7e45f27f2fd3fcea567c8448c39fe4720eaa095a4"},{"path":"./icons/icon-192.png","hash":"2a34b19737afae8a4abdf910895031fcbc76908b3e30ae3cb08689dd2e584c2c"},{"path":"./icons/icon-512.png","hash":"2133054c1f79ab8bce24a11a07e17a7237ef253325e08bb1eecebb9b6624b0d7"},{"path":"./index.html","hash":"9046084f4a93b15db05f8ebb85eced97bbb110b5c80d6e9bd742193f91a88527"},{"path":"./manifest.webmanifest","hash":"d8a1c1bc7e03d3baf23e1e0dd76f2426fed7bcf9776b884412e7409fe3398ac2"},{"path":"./style.css","hash":"ae69a33930ad27af66f0251064d0ca004493a6f8b9bbe7de2059389e429afd96"}];
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
