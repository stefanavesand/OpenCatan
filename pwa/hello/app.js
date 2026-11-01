import { mountLibrary, prepareForUpdate } from './library.js';
const BUILD_ID = '__BUILD_ID__';
const offline = document.querySelector('#offline');
const detail = document.querySelector('#detail');
const check = document.querySelector('#check');
const update = document.querySelector('#update');
let registration;
let reloadForUpdate = false;

function showNetwork() {
  document.querySelector('#network').textContent = navigator.onLine ? 'Nätanslutning finns' : 'Ingen nätanslutning';
}
function showDisplay() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  document.querySelector('#display').textContent = standalone ? 'Installerad webbapp' : 'Webbläsare';
}
function talk(worker, type) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Kontrollen tog för lång tid. Försök igen.')); }, 20000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close();
      if (event.data.buildId !== BUILD_ID) reject(new Error('Appversionen har ändrats. Installera uppdateringen eller öppna appen igen.'));
      else resolve(event.data);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}
async function verify(repair = false) {
  check.disabled = true;
  offline.textContent = 'Kontrollerar filerna…'; offline.className = 'pending';
  try {
    const ready = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Offlinepaketet kunde inte installeras. Anslut nätet och ladda om sidan.')), 20000))]);
    const result = await talk(ready.active, repair ? 'REPAIR_OFFLINE' : 'CHECK_OFFLINE');
    if (!result.ok) throw new Error(result.error || 'Offlinepaketet är inte komplett. Anslut nätet och tryck på kontrollknappen.');
    offline.textContent = 'Klart för offline'; offline.className = 'ready';
    detail.textContent = 'Alla appfiler är hämtade och kontrollerade. Du kan nu testa att stänga appen och starta den utan nät.';
  } catch (error) {
    offline.textContent = 'Inte klart för offline'; offline.className = 'pending'; detail.textContent = error.message;
  } finally { check.disabled = false; }
}
function offerUpdate() {
  update.hidden = !registration?.waiting;
  if (registration?.waiting) detail.textContent = 'En ny version är hämtad. Tryck på Installera uppdatering när du vill byta version.';
}
async function start() {
  if (!('serviceWorker' in navigator)) {
    offline.textContent = 'Offline stöds inte här'; detail.textContent = 'Öppna appen i Safari via HTTPS.'; check.disabled = true; return;
  }
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') offerUpdate();
        if (installing.state === 'redundant' && !registration.active) {
          offline.textContent = 'Inte klart för offline';
          detail.textContent = 'Hämtningen kunde inte slutföras. Anslut nätet och försök igen.';
        }
      });
    });
    await verify(); offerUpdate();
    registration.update().catch(() => { /* A previously verified offline build stays usable. */ });
  } catch {
    offline.textContent = 'Inte klart för offline'; detail.textContent = 'Hämtningen kunde inte starta. Kontrollera nätet och ladda om sidan.';
  }
}
check.addEventListener('click', () => verify(true));
update.addEventListener('click', async () => {
  if (!registration?.waiting) return;
  update.disabled = true;
  await prepareForUpdate();
  reloadForUpdate = true;
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
});
navigator.serviceWorker?.addEventListener('controllerchange', () => { if (reloadForUpdate) window.location.reload(); });
window.addEventListener('online', showNetwork); window.addEventListener('offline', showNetwork);
window.matchMedia('(display-mode: standalone)').addEventListener('change', showDisplay);
mountLibrary(); showNetwork(); showDisplay(); start();
