'use strict';
// Safe bridge between the app windows and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const send = (channel, ...args) => ipcRenderer.send(channel, ...args);

const ALLOWED_EVENTS = ['visit', 'summon', 'open-chat', 'hide-now', 'settings-changed'];

contextBridge.exposeInMainWorld('petAPI', {
  // settings & data
  getSettings: () => invoke('settings-get'),
  setSettings: (patch) => invoke('settings-set', patch),
  getAssets: () => invoke('assets-get'),
  setApiKey: (key) => invoke('api-key-set', key),
  clearApiKey: () => invoke('api-key-clear'),
  pause: (kind) => invoke('pause', kind),
  chatSend: (history) => invoke('chat-send', history),
  visitNow: () => send('visit-now'),
  bringOnScreen: () => send('bring-on-screen'),
  openSettings: () => send('open-settings'),

  // pet window
  setIgnore: (ignore) => send('pet-set-ignore', !!ignore),
  focusWindow: () => send('pet-focus'),
  petReady: () => send('pet-ready'),
  petHidden: () => send('pet-hidden'),
  petContextMenu: () => send('pet-context'),

  // summon button window
  buttonDragStart: () => send('button-drag-start'),
  buttonDragMove: (dx, dy) => send('button-drag-move', { dx, dy }),
  buttonDragEnd: () => send('button-drag-end'),
  buttonClick: () => send('button-click'),
  buttonContext: () => send('button-context'),

  on: (channel, callback) => {
    if (!ALLOWED_EVENTS.includes(channel)) return () => {};
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
