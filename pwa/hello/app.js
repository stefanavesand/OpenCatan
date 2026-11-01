import { mountLibrary, prepareForUpdate } from './library.js';
import { mountOnline, prepareOnlineUpdate } from './online.js';
import { mountCatan, prepareCatanUpdate } from './catan.js';
import { mountCatanOnline, prepareFullCatanUpdate } from './catan-online.js';
const BUILD_ID = '__BUILD_ID__';
const offline = document.querySelector('#offline');
const detail = document.querySelector('#detail');
const check = document.querySelector('#check');
const update = document.querySelector('#update');
let registration;
let reloadForUpdate = false;

function showNetwork() {
  document.querySelector('#network').textContent = navigator.onLine ? 'Network available' : 'No network connection';
}
function showDisplay() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  document.querySelector('#display').textContent = standalone ? 'Installed web app' : 'Browser';
}
function talk(worker, type) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('The check timed out. Please try again.')); }, 20000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close();
      if (event.data.buildId !== BUILD_ID) reject(new Error('The app version has changed. Install the update or reopen the app.'));
      else resolve(event.data);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}
async function verify(repair = false) {
  check.disabled = true;
  offline.textContent = 'Checking files…'; offline.className = 'pending';
  try {
    const ready = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('The offline package could not be installed. Connect to the internet and reload the page.')), 20000))]);
    const result = await talk(ready.active, repair ? 'REPAIR_OFFLINE' : 'CHECK_OFFLINE');
    if (!result.ok) throw new Error(result.error || 'The offline package is incomplete. Connect to the internet and press the check button.');
    offline.textContent = 'Ready for offline'; offline.className = 'ready';
    detail.textContent = 'All app files have been downloaded and checked. You can now close the app and reopen it offline.';
  } catch (error) {
    offline.textContent = 'Not ready for offline'; offline.className = 'pending'; detail.textContent = error.message;
  } finally { check.disabled = false; }
}
function offerUpdate() {
  update.hidden = !registration?.waiting;
  if (registration?.waiting) detail.textContent = 'A new version has been downloaded. Press Install update when you are ready to switch.';
}
async function start() {
  if (!('serviceWorker' in navigator)) {
    offline.textContent = 'Offline mode is not supported here'; detail.textContent = 'Open the app in Safari over HTTPS.'; check.disabled = true; return;
  }
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') offerUpdate();
        if (installing.state === 'redundant' && !registration.active) {
          offline.textContent = 'Not ready for offline';
          detail.textContent = 'The download could not be completed. Connect to the internet and try again.';
        }
      });
    });
    await verify(); offerUpdate();
    registration.update().catch(() => { /* A previously verified offline build stays usable. */ });
  } catch {
    offline.textContent = 'Not ready for offline'; detail.textContent = 'The download could not start. Check your connection and reload the page.';
  }
}
check.addEventListener('click', () => verify(true));
update.addEventListener('click', async () => {
  if (!registration?.waiting) return;
  update.disabled = true;
  await prepareForUpdate();
  await prepareOnlineUpdate();
  await prepareCatanUpdate();
  await prepareFullCatanUpdate();
  reloadForUpdate = true;
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
});
navigator.serviceWorker?.addEventListener('controllerchange', () => { if (reloadForUpdate) window.location.reload(); });
window.addEventListener('online', showNetwork); window.addEventListener('offline', showNetwork);
window.matchMedia('(display-mode: standalone)').addEventListener('change', showDisplay);
mountLibrary(); mountOnline(); mountCatan(); mountCatanOnline(); showNetwork(); showDisplay(); start();
