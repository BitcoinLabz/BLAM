/* BLAM — phone / web app only: offline support, updates, install hint. Not loaded in the desktop app. */
'use strict';
(function () {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const B = window.BLAM;

  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => {
      if (!worker || !navigator.serviceWorker.controller) return; // first install: nothing to replace
      const show = () => B?.UI?.toast ? B.UI.toast('A new version of BLAM is ready. It will load the next time you open the app.', 'ok', 7000) : null;
      if (worker.state === 'installed') show();
      else worker.addEventListener('statechange', () => { if (worker.state === 'installed') show(); });
    };
    offer(reg.waiting);
    reg.addEventListener('updatefound', () => offer(reg.installing));
    // Check for a new version whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
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
