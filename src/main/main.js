/**
 * BLAM — Bitcoin Labz Asset Manager
 * Electron main process.
 *
 * Responsibilities:
 *  - Window lifecycle (single instance, secure defaults: contextIsolation + sandbox)
 *  - Local persistence: atomic JSON writes to the OS user-data folder
 *  - Rolling daily backups (last 30 kept)
 *  - Market-data fetching (market.js — done here, not in the renderer, to avoid
 *    CORS and keep the renderer free of network privileges)
 *  - Native dialogs (import / export) and desktop notifications
 */
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { cryptoPrices, cryptoSearch, quotes, dividendHistory } = require('./market');

const APP_NAME = 'BLAM';
let mainWindow = null;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'blam-data.json');
const backupDir = () => path.join(dataDir(), 'backups');
const MAX_BACKUPS = 30;

function ensureDirs() {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.mkdirSync(backupDir(), { recursive: true });
}

/** v1.1.x stored an optional SimpleFIN access key here. That feature was removed; don't leave the key on disk. */
function removeLegacyBankCredential() {
  try { fs.unlinkSync(path.join(dataDir(), 'simplefin.credential')); } catch (_) { /* not present */ }
}

/** Atomic write: write to a temp file then rename, so a crash never corrupts data. */
function atomicWrite(file, contents) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  // Windows: antivirus / indexers can briefly lock the target, making rename fail with EPERM/EBUSY.
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (err) {
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        if (i >= 5) { fs.copyFileSync(tmp, file); fs.unlinkSync(tmp); return; }
        throw err;
      }
      const until = Date.now() + 50 * (i + 1);
      while (Date.now() < until) { /* brief synchronous back-off */ }
    }
  }
}

const isValidJson = (text) => { try { JSON.parse(text); return true; } catch (_) { return false; } };

/** Backup files newest first (daily + safety copies). */
function listBackups() {
  return fs.readdirSync(backupDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(backupDir(), f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .map((x) => x.f);
}

/** Copy the current data file aside before a destructive action (erase / restore / demo). Keeps the last 10. */
function safetyBackup(reason) {
  try {
    if (!fs.existsSync(dataFile())) return null;
    const contents = fs.readFileSync(dataFile(), 'utf8');
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = `blam-before-${String(reason || 'change').replace(/[^a-z]/gi, '').slice(0, 12)}-${todayStamp()}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
    fs.writeFileSync(path.join(backupDir(), name), contents, 'utf8');
    const extra = fs.readdirSync(backupDir()).filter((f) => f.startsWith('blam-before-')).sort();
    while (extra.length > 10) fs.unlinkSync(path.join(backupDir(), extra.shift()));
    return name;
  } catch (err) {
    console.error('[safety-backup]', err);
    return null;
  }
}

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One backup per calendar day, pruned to MAX_BACKUPS. */
function rollBackup(contents) {
  try {
    const target = path.join(backupDir(), `blam-backup-${todayStamp()}.json`);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, contents, 'utf8');
      const files = fs.readdirSync(backupDir())
        .filter((f) => f.startsWith('blam-backup-') && f.endsWith('.json'))
        .sort();
      while (files.length > MAX_BACKUPS) {
        fs.unlinkSync(path.join(backupDir(), files.shift()));
      }
    }
  } catch (err) {
    console.error('[backup]', err);
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: APP_NAME,
    backgroundColor: '#080b12',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // CI self-test: BLAM_SMOKE=1 launches, verifies the UI rendered without errors, then exits.
  if (process.env.BLAM_SMOKE) {
    const errors = [];
    mainWindow.webContents.on('console-message', (_e, level, message) => {
      if (level >= 3 && !/fetch|net::|ERR_/i.test(message)) errors.push(message);
    });
    mainWindow.webContents.on('did-finish-load', () => setTimeout(async () => {
      try {
        const r = await mainWindow.webContents.executeJavaScript(
          `({ nav: document.querySelectorAll('#nav a').length, title: document.title, text: document.getElementById('view').innerText.slice(0, 60), demo: !!window.BLAM && typeof BLAM.sampleData === 'function' })`);
        console.log('[BLAM_SMOKE]', JSON.stringify(r), 'errors:', JSON.stringify(errors));
        app.exit(r.nav >= 15 && r.demo && !errors.length ? 0 : 1);
      } catch (e) { console.log('[BLAM_SMOKE] failed', e); app.exit(1); }
    }, 2500));
  }
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Data Folder', click: () => shell.openPath(dataDir()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'BLAM on GitHub', click: () => shell.openExternal('https://github.com/BitcoinLabz/BLAM') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('data:load', () => {
    ensureDirs();
    if (!fs.existsSync(dataFile())) return { raw: null };
    const raw = fs.readFileSync(dataFile(), 'utf8');
    if (isValidJson(raw)) return { raw };
    // Corrupt data file: never overwrite it. Keep a copy and fall back to the newest valid backup.
    const kept = `blam-data.corrupt-${Date.now()}.json`;
    try { fs.copyFileSync(dataFile(), path.join(dataDir(), kept)); } catch (err) { console.error('[load]', err); }
    // Prefer the newest backup that actually holds data over an empty one (e.g. a copy taken before "Erase all").
    let firstValid = null;
    for (const f of listBackups()) {
      const b = fs.readFileSync(path.join(backupDir(), f), 'utf8');
      if (!isValidJson(b)) continue;
      const d = JSON.parse(b);
      const hasData = ['accounts', 'transactions', 'holdings', 'properties', 'loans', 'metals'].some((k) => Array.isArray(d[k]) && d[k].length);
      if (hasData) return { raw: b, recoveredFrom: f, corruptCopy: kept };
      if (!firstValid) firstValid = f;
    }
    if (firstValid) return { raw: fs.readFileSync(path.join(backupDir(), firstValid), 'utf8'), recoveredFrom: firstValid, corruptCopy: kept };
    return { raw: null, corruptCopy: kept, unrecoverable: true };
  });

  ipcMain.handle('data:safetyBackup', (_e, reason) => safetyBackup(reason));

  ipcMain.handle('data:save', (_e, json) => {
    ensureDirs();
    if (typeof json !== 'string' || json.length < 2) throw new Error('Invalid payload');
    JSON.parse(json); // validate before touching disk
    atomicWrite(dataFile(), json);
    rollBackup(json);
    return true;
  });

  ipcMain.handle('data:info', () => {
    ensureDirs();
    const backups = listBackups();
    let size = 0;
    try { size = fs.statSync(dataFile()).size; } catch (_) { /* first run */ }
    return { dataFile: dataFile(), backupDir: backupDir(), backups, size, version: app.getVersion(), platform: process.platform };
  });

  ipcMain.handle('data:openFolder', () => shell.openPath(dataDir()));

  ipcMain.handle('data:restoreBackup', (_e, name) => {
    const safe = path.basename(String(name));
    const file = path.join(backupDir(), safe);
    if (!fs.existsSync(file)) throw new Error('Backup not found');
    return fs.readFileSync(file, 'utf8');
  });

  ipcMain.handle('file:saveText', async (_e, { defaultName, content, filters }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  });

  ipcMain.handle('file:openText', async (_e, { filters } = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    if (canceled || !filePaths?.[0]) return null;
    return { name: path.basename(filePaths[0]), content: fs.readFileSync(filePaths[0], 'utf8') };
  });

  ipcMain.handle('prices:crypto', (_e, ids) => cryptoPrices(ids));
  ipcMain.handle('prices:quotes', (_e, symbols) => quotes(symbols));
  ipcMain.handle('prices:dividends', (_e, symbol, years) => dividendHistory(symbol, years));
  ipcMain.handle('crypto:search', (_e, q) => cryptoSearch(q));


  ipcMain.handle('notify', (_e, { title, body }) => {
    if (Notification.isSupported()) new Notification({ title: title || APP_NAME, body: body || '' }).show();
    return true;
  });

  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.bitcoinlabz.blam');
    ensureDirs();
    removeLegacyBankCredential();
    registerIpc();
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
