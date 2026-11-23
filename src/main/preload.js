/**
 * Preload bridge. Exposes a narrow, explicit API to the renderer.
 * The renderer never gets Node.js or raw ipcRenderer access.
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blam', {
  isDesktop: true,
  load: () => ipcRenderer.invoke('data:load'),
  save: (json) => ipcRenderer.invoke('data:save', json),
  info: () => ipcRenderer.invoke('data:info'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  restoreBackup: (name) => ipcRenderer.invoke('data:restoreBackup', name),
  safetyBackup: (reason) => ipcRenderer.invoke('data:safetyBackup', reason),
  saveText: (opts) => ipcRenderer.invoke('file:saveText', opts),
  openText: (opts) => ipcRenderer.invoke('file:openText', opts),
  cryptoPrices: (ids) => ipcRenderer.invoke('prices:crypto', ids),
  quotes: (symbols) => ipcRenderer.invoke('prices:quotes', symbols),
  dividends: (symbol, years) => ipcRenderer.invoke('prices:dividends', symbol, years),
  cryptoSearch: (q) => ipcRenderer.invoke('crypto:search', q),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncConnect: (token, opts) => ipcRenderer.invoke('sync:connect', token, opts),
  syncFetch: (opts) => ipcRenderer.invoke('sync:fetch', opts),
  syncDisconnect: () => ipcRenderer.invoke('sync:disconnect'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
