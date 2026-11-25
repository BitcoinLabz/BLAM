/* BLAM — phone / web app only: offline support, updates, install hint. Not loaded in the desktop app. */
'use strict';
(function () {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const B = window.BLAM;

  // ---- Updates ---------------------------------------------------------------
  // A new service worker takes over as soon as it has downloaded the new version (skipWaiting in sw.js).
  // Then: just opened -> reload straight away; in the middle of something -> ask; "Later" -> apply on return.
  const startedAt = Date.now();
  const hadController = !!navigator.serviceWorker.controller;
  let pending = false, asked = false;
  const restart = async () => {
    try { await B?.S?.saveNow?.(); } catch (_) { /* nothing to save */ }
    location.reload();
  };
  const ask = () => {
    if (asked || !B?.UI?.modal) return;
    asked = true;
    const m = B.UI.modal({
      title: 'BLAM has been updated',
      body: '<p style="margin:0 0 6px">A new version of BLAM is ready. Restart now to use it. Your data stays exactly as it is.</p>',
      footer: '<span class="grow"></span><button class="btn ghost" data-later>Later</button><button class="btn primary" data-now>Restart now</button>',
    });
    m.foot.querySelector('[data-now]').onclick = restart;
    m.foot.querySelector('[data-later]').onclick = () => { m.close(); };
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || pending) return; // first install: nothing to replace
    pending = true;
    const busy = document.querySelector('.modal-back.in');
    if (Date.now() - startedAt < 20000 && !busy) restart(); else ask();
  });
  // "Later": apply the update when the user comes back to the app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pending && !document.querySelector('.modal-back.in')) restart();
  });

  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
    // A worker left waiting by an older version of BLAM: apply it now.
    if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage('skipWaiting');
  }).catch((e) => console.warn('[pwa] service worker', e));

  // Ask the browser to keep our data (installed apps are normally granted this).
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  // One-time tip on iPhone/iPad Safari when not installed to the Home Screen.
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let tipped = false;
  try { tipped = localStorage.getItem('blam-install-tip') === '1'; } catch (_) { /* private mode */ }
  if (ios && !standalone && !tipped) {
    setTimeout(() => {
      B?.UI?.toast?.('Tip: tap Share, then "Add to Home Screen" to install BLAM. Installed, it works offline and your data is better protected.', 'ok', 9000);
      try { localStorage.setItem('blam-install-tip', '1'); } catch (_) { /* ignore */ }
    }, 2500);
  }
})();
