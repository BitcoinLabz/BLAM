/**
 * BLAM — Bitcoin Labz Asset Manager
 * Electron main process.
 *
 * Responsibilities:
 *  - Window lifecycle (single instance, secure defaults: contextIsolation + sandbox)
 *  - Local persistence: atomic JSON writes to the OS user-data folder
 *  - Rolling daily backups (last 30 kept)
 *  - Market-data fetching (done here, not in the renderer, to avoid CORS and keep
 *    the renderer free of network privileges)
 *  - Native dialogs (import / export) and desktop notifications
 */
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

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

/** Atomic write: write to a temp file then rename, so a crash never corrupts data. */
function atomicWrite(file, contents) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, file);
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
// Market data
// ---------------------------------------------------------------------------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 BLAM/1.0';

async function getJSON(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** CoinGecko simple price (no API key required). */
async function cryptoPrices(ids) {
  if (!ids || !ids.length) return {};
  const uniq = [...new Set(ids.filter(Boolean).map((s) => s.toLowerCase()))];
  const out = {};
  // CoinGecko accepts comma-separated ids; chunk to keep URLs short.
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(chunk.join(','))}&vs_currencies=usd&include_24hr_change=true`;
    const data = await getJSON(url);
    for (const [id, v] of Object.entries(data)) {
      out[id] = { price: v.usd, change24h: v.usd_24h_change ?? null };
    }
  }
  return out;
}

async function cryptoSearch(q) {
  const data = await getJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
  return (data.coins || []).slice(0, 12).map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, rank: c.market_cap_rank }));
}

/** Yahoo Finance chart endpoint: works for stocks, ETFs, mutual funds, futures (GC=F etc). */
async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const data = await getJSON(url);
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error('No data');
  const m = r.meta || {};
  const price = m.regularMarketPrice;
  const prev = m.chartPreviousClose ?? m.previousClose;
  return {
    price,
    change24h: prev ? ((price - prev) / prev) * 100 : null,
    currency: m.currency,
    name: m.longName || m.shortName || symbol,
    exchange: m.exchangeName,
  };
}

async function quotes(symbols) {
  const out = {};
  const uniq = [...new Set((symbols || []).filter(Boolean).map((s) => s.toUpperCase()))];
  // Small concurrency pool to be polite to the endpoint.
  const pool = 4;
  let idx = 0;
  async function worker() {
    while (idx < uniq.length) {
      const sym = uniq[idx++];
      try {
        out[sym] = await yahooQuote(sym);
      } catch (e) {
        out[sym] = { error: String(e.message || e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(pool, uniq.length) }, worker));
  return out;
}

/** Dividend history (per-share amounts) for the last N years. */
async function dividendHistory(symbol, years = 2) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${years}y&interval=1mo&events=div`;
  const data = await getJSON(url);
  const divs = data?.chart?.result?.[0]?.events?.dividends || {};
  return Object.values(divs)
    .map((d) => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('data:load', () => {
    ensureDirs();
    if (!fs.existsSync(dataFile())) return null;
    return fs.readFileSync(dataFile(), 'utf8');
  });

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
    const backups = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json')).sort().reverse();
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
