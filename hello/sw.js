const BUILD_ID = '5985bc3b5561';
const PREFIX = `hello-pwa:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}${BUILD_ID}`;
const ASSETS = [{"path":"./app.js","hash":"cf4f4fb2f729ef8d7d423c89a5422cca34e709bca16bab5afe7b1efd2d405c96"},{"path":"./game.js","hash":"45eec260f183d2f39f043b9f502d1ce340c6d037ff8d626e40214a66bebf0fe7"},{"path":"./icons/apple-touch-icon.png","hash":"79514ad8c965354ee75bb6a7e45f27f2fd3fcea567c8448c39fe4720eaa095a4"},{"path":"./icons/icon-192.png","hash":"2a34b19737afae8a4abdf910895031fcbc76908b3e30ae3cb08689dd2e584c2c"},{"path":"./icons/icon-512.png","hash":"2133054c1f79ab8bce24a11a07e17a7237ef253325e08bb1eecebb9b6624b0d7"},{"path":"./index.html","hash":"1e93b30dc1f297db708cb9b2b965e03cf26e19195c6c0ad5e53262aee70bb339"},{"path":"./library.js","hash":"985e20a7bc967a0a2d018279a671482d53ca5c7323cfdd5cea89351676553cdb"},{"path":"./manifest.webmanifest","hash":"60b380149432f3820d4f7152b170d19fce71c00ec368f022b47491ec8b3a545d"},{"path":"./online-transport.js","hash":"25182ee3af09b4b2202f2213331d92e1c34e308417d3c2bd9ae44ba7f3776c37"},{"path":"./online.js","hash":"5f90079d58bca7b45106e865aba786f5e238b1d936bde65567115f04e9e37261"},{"path":"./session-state.js","hash":"82596392f14417f6e8420bd4115fa60cfd2de26692cf6f0fadafdee7cc68250c"},{"path":"./storage.js","hash":"31554fb2fb0ab20383cbf01e2ff6e9626f85a71897dfe85a38980c3117d61619"},{"path":"./style.css","hash":"70da696b014d113aa964de4dec84fefa6a1dd0828803700371edb61bf9c8b022"}];
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
