/**
 * BLAM — auto-updates from GitHub Releases (electron-updater).
 *
 * The release workflow publishes latest.yml / latest-mac.yml / latest-linux.yml next to the
 * installers; installed copies read those, download the new version in the background and
 * install it on restart. Nothing is sent except the request for the update feed.
 *
 * Supported: Windows installer (NSIS), Linux AppImage, macOS (only once builds are code-signed).
 * Not supported: Windows portable .exe and Linux .deb. Those are told to download manually.
 */
'use strict';

const { app } = require('electron');

const RELEASES_URL = 'https://github.com/BitcoinLabz/BLAM/releases/latest';
const CHECK_EVERY_MS = 2 * 3600e3; // and 15s after launch

let updater = null;
let send = () => {};
let timer = null;
let firstCheck = null;
const state = { status: 'idle', version: app.getVersion(), available: null, progress: 0, error: null, supported: true, reason: '', checkedAt: null, auto: true };

function set(patch) {
  Object.assign(state, patch);
  send({ ...state });
}

/** Why this install can't update itself, or '' if it can. */
function unsupportedReason() {
  if (!app.isPackaged) return 'Auto-update works in installed builds (you are running from source).';
  if (process.env.PORTABLE_EXECUTABLE_DIR) return 'The portable version can\'t update itself. Download the new version from the releases page, or use the installer.';
  if (process.platform === 'linux' && !process.env.APPIMAGE) return 'The .deb package can\'t update itself. Install the new .deb from the releases page, or use the AppImage.';
  return '';
}

function friendly(err) {
  const m = String(err && (err.message || err)) || 'Unknown error';
  if (/404|HttpError: 404|Cannot find latest|no published versions/i.test(m)) return 'No update feed found on GitHub yet. Updates start working from the next release.';
  if (/code signature|not signed|signature verification|SecCodeCheckValidity|ShipIt/i.test(m)) return 'macOS can only auto-update signed builds. Download the new version from the releases page.';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR|network|socket/i.test(m)) return 'Could not reach GitHub to check for updates. Check your connection.';
  return m.split('\n')[0].slice(0, 200);
}

function init({ onStatus, autoCheck = true }) {
  send = onStatus || send;
  state.auto = autoCheck;
  const reason = unsupportedReason();
  if (reason && !process.env.BLAM_UPDATE_FEED) { set({ supported: false, reason }); return; }
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (e) {
    set({ supported: false, reason: 'Updater unavailable in this build.' });
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.logger = null;
  // Test hook: point at a local generic feed (e.g. http://127.0.0.1:8080/) to exercise the full flow.
  if (process.env.BLAM_UPDATE_FEED) {
    updater.forceDevUpdateConfig = !app.isPackaged;
    updater.setFeedURL({ provider: 'generic', url: process.env.BLAM_UPDATE_FEED });
  }

  updater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  updater.on('update-not-available', () => set({ status: 'current', available: null, checkedAt: new Date().toISOString() }));
  updater.on('update-available', (info) => set({ status: 'downloading', available: { version: info.version, date: info.releaseDate, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '' }, progress: 0, checkedAt: new Date().toISOString() }));
  updater.on('download-progress', (p) => set({ status: 'downloading', progress: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', (info) => set({ status: 'ready', progress: 100, available: { ...(state.available || {}), version: info.version } }));
  updater.on('error', (err) => set({ status: 'error', error: friendly(err), checkedAt: new Date().toISOString() }));

  if (autoCheck) schedule();
}

function schedule() {
  clearInterval(timer);
  clearTimeout(firstCheck);
  firstCheck = setTimeout(() => check(), 15000); // let the app settle first
  timer = setInterval(() => check(), CHECK_EVERY_MS);
}

async function check() {
  if (!updater) return { ...state };
  if (['checking', 'downloading', 'ready'].includes(state.status)) return { ...state };
  try { await updater.checkForUpdates(); } catch (e) { set({ status: 'error', error: friendly(e) }); }
  return { ...state };
}

function setAuto(on) {
  state.auto = !!on;
  if (!updater) return { ...state };
  if (on) schedule(); else { clearInterval(timer); clearTimeout(firstCheck); }
  return { ...state };
}

function install() {
  if (updater && state.status === 'ready') {
    setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  }
  return false;
}

module.exports = { init, check, install, setAuto, getState: () => ({ ...state }), RELEASES_URL };
