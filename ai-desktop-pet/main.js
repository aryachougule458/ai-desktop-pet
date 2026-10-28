'use strict';
/**
 * AI Desktop Pet - main process
 * Owns: settings/persistence, scheduler (visits + water), pet window, summon-button window,
 * settings window, system tray, chat (basic + OpenAI) and the secure API key.
 */
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const ARGV = process.argv.slice(1);
const FLAG_BRING = ARGV.includes('--bring-on-screen');
const FLAG_SELFTEST = ARGV.includes('--self-test');

if (FLAG_SELFTEST) {
  // keep self-test data away from the real settings
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pet-selftest-')));
}

const CONFIG_DIR = app.isPackaged ? path.join(process.resourcesPath, 'config') : path.join(__dirname, 'config');
const ASSETS_DIR = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, 'assets');
const SRC_DIR = path.join(__dirname, 'src');
const PRELOAD = path.join(__dirname, 'preload.js');

const PET_STRIP_H = 430; // height of the transparent strip along the bottom of the screen
const BTN = 64;          // summon button window size

// ------------------------------------------------------------------ settings & persistence
const DEFAULT_SETTINGS = {
  enabled: true,
  visitMinutes: 5,
  waterMinutes: 30, // 0 = water reminders off
  checkins: true,
  sound: true,
  animationSpeed: 1,
  petSize: 140,
  aiChat: false,
  launchAtStartup: false,
  alwaysOnTop: true,
  quietHours: { enabled: false, start: '22:00', end: '08:00' }
};
const DEFAULT_STATE = { buttonPos: null, nextVisitAt: 0, nextWaterAt: 0, pausedUntil: 0, apiKeyEnc: null };

const store = { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), state: { ...DEFAULT_STATE } };
let storePath = '';
let saveTimer = null;

const num = (v, min, max, def) => {
  v = Number(v);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
};
const timeStr = (v, def) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : def);

function sanitizeSettings(s) {
  const d = DEFAULT_SETTINGS;
  const q = s.quietHours || {};
  return {
    enabled: !!s.enabled,
    visitMinutes: Math.round(num(s.visitMinutes, 1, 1440, d.visitMinutes)),
    waterMinutes: Math.round(num(s.waterMinutes, 0, 1440, d.waterMinutes)),
    checkins: !!s.checkins,
    sound: !!s.sound,
    animationSpeed: Math.round(num(s.animationSpeed, 0.5, 2, 1) * 100) / 100,
    petSize: Math.round(num(s.petSize, 80, 260, d.petSize)),
    aiChat: !!s.aiChat,
    launchAtStartup: !!s.launchAtStartup,
    alwaysOnTop: !!s.alwaysOnTop,
    quietHours: { enabled: !!q.enabled, start: timeStr(q.start, '22:00'), end: timeStr(q.end, '08:00') }
  };
}

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const rs = raw.settings || {};
    store.settings = sanitizeSettings({
      ...DEFAULT_SETTINGS, ...rs,
      quietHours: { ...DEFAULT_SETTINGS.quietHours, ...(rs.quietHours || {}) }
    });
    store.state = { ...DEFAULT_STATE, ...(raw.state || {}) };
  } catch (_) { /* first run or unreadable file: keep defaults */ }
}

function saveStore(immediately = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try {
      const tmp = storePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
      fs.renameSync(tmp, storePath);
    } catch (e) { console.error('Could not save settings:', e.message); }
  };
  if (immediately) write(); else saveTimer = setTimeout(write, 300);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf8')); }
  catch (_) { return fallback; }
}

// ------------------------------------------------------------------ API key (never hard-coded)
let sessionKey = null; // only used when OS secure storage is unavailable
function secureAvailable() { try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; } }

function getApiKey() {
  if (sessionKey) return sessionKey;
  if (store.state.apiKeyEnc && secureAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(store.state.apiKeyEnc, 'base64')); } catch (_) { /* fall through */ }
  }
  return process.env.OPENAI_API_KEY || null;
}

function setApiKey(raw) {
  const key = String(raw || '').trim();
  if (key.length < 20 || /\s/.test(key)) return { ok: false, error: 'That does not look like a valid API key.' };
  if (secureAvailable()) {
    store.state.apiKeyEnc = safeStorage.encryptString(key).toString('base64');
    sessionKey = null;
    saveStore();
    return { ok: true, persisted: true };
  }
  sessionKey = key;
  store.state.apiKeyEnc = null;
  saveStore();
  return { ok: true, persisted: false };
}

function clearApiKey() { sessionKey = null; store.state.apiKeyEnc = null; saveStore(); }

// ------------------------------------------------------------------ helpers
const rand = (n) => Math.floor(Math.random() * n);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isPaused(now = Date.now()) { return store.state.pausedUntil > now; }

function inQuietHours(date = new Date()) {
  const q = store.settings.quietHours;
  if (!q.enabled) return false;
  const [sh, sm] = q.start.split(':').map(Number);
  const [eh, em] = q.end.split(':').map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em, m = date.getHours() * 60 + date.getMinutes();
  if (s === e) return false;
  return s < e ? (m >= s && m < e) : (m >= s || m < e);
}

function status() {
  return {
    paused: isPaused(), pausedUntil: store.state.pausedUntil, quietNow: inQuietHours(),
    hasApiKey: !!getApiKey(), secureStorage: secureAvailable(), platform: process.platform
  };
}
function publicPayload() { return { settings: store.settings, status: status() }; }

// ------------------------------------------------------------------ windows
let petWin = null, btnWin = null, settingsWin = null, tray = null;
let petReady = false;
const petQueue = [];
let petPresent = false, presentSince = 0;

function webPrefs(extra = {}) {
  return { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, ...extra };
}

function applyTop(win) {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(!!store.settings.alwaysOnTop, 'screen-saver');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function sendToPet(channel, payload) {
  if (!petWin || petWin.isDestroyed()) return;
  if (!petReady) { petQueue.push([channel, payload]); return; }
  petWin.webContents.send(channel, payload);
}

function petBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const h = Math.min(PET_STRIP_H, wa.height);
  return { x: wa.x, y: wa.y + wa.height - h, width: wa.width, height: h };
}

function createPetWindow() {
  petWin = new BrowserWindow({
    ...petBounds(),
    show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, focusable: true,
    alwaysOnTop: store.settings.alwaysOnTop,
    webPreferences: webPrefs({ autoplayPolicy: 'no-user-gesture-required' })
  });
  petWin.setMenuBarVisibility(false);
  applyTop(petWin);
  // Click-through everywhere except the pet itself (the page tells us when the mouse is over the pet).
  if (process.platform !== 'linux') petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.loadFile(path.join(SRC_DIR, 'pet.html'));
  petWin.webContents.on('render-process-gone', (_e, d) => console.error('pet renderer gone:', d.reason));
  petWin.webContents.on('did-fail-load', (_e, code, desc) => console.error('pet load failed:', code, desc));
  petWin.on('closed', () => { petWin = null; petReady = false; });
}

function showPetWindow() {
  if (!petWin || petWin.isDestroyed()) createPetWindow();
  petWin.setBounds(petBounds());
  if (!petWin.isVisible()) petWin.showInactive();
  applyTop(petWin);
}

function hidePetWindow() { if (petWin && !petWin.isDestroyed()) petWin.hide(); }

// ---- summon button
function defaultButtonPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - BTN - 6, y: wa.y + Math.round(wa.height / 2 - BTN / 2) };
}
function clampButton(x, y) {
  const disp = screen.getDisplayMatching({ x, y, width: BTN, height: BTN });
  const wa = disp.workArea;
  return { x: clamp(Math.round(x), wa.x, wa.x + wa.width - BTN), y: clamp(Math.round(y), wa.y, wa.y + wa.height - BTN) };
}
function buttonStartPos() {
  const p = store.state.buttonPos;
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? clampButton(p.x, p.y) : clampButton(defaultButtonPos().x, defaultButtonPos().y);
}

function createButtonWindow() {
  const pos = buttonStartPos();
  btnWin = new BrowserWindow({
    x: pos.x, y: pos.y, width: BTN, height: BTN,
    show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, focusable: process.platform !== 'win32',
    alwaysOnTop: true, webPreferences: webPrefs()
  });
  applyTop(btnWin);
  btnWin.loadFile(path.join(SRC_DIR, 'button.html'));
  btnWin.once('ready-to-show', () => { if (store.settings.enabled) btnWin.showInactive(); });
  btnWin.on('closed', () => { btnWin = null; });
}

function placeButton(x, y) {
  if (!btnWin || btnWin.isDestroyed()) return;
  const p = clampButton(x, y);
  btnWin.setBounds({ x: p.x, y: p.y, width: BTN, height: BTN });
}

// ---- settings window
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 560, height: 780, minWidth: 480, minHeight: 520,
    title: 'AI Desktop Pet - Settings', autoHideMenuBar: true, backgroundColor: '#fffaf3',
    webPreferences: webPrefs()
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(SRC_DIR, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
  if (process.platform === 'darwin') app.focus({ steal: true });
}

function broadcastSettings() {
  const payload = publicPayload();
  sendToPet('settings-changed', payload);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings-changed', payload);
}

// ------------------------------------------------------------------ tray
function fmtTime(ts) {
  return new Date(ts).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function rebuildTray() {
  if (!tray) return;
  const paused = isPaused();
  const menu = Menu.buildFromTemplate([
    { label: 'Summon Pet', click: () => summon() },
    { label: 'Chat', click: () => openChat() },
    { label: 'Settings', click: () => openSettings() },
    {
      label: paused ? 'Pause Pet (paused)' : 'Pause Pet',
      submenu: [
        { label: paused ? `Paused until ${fmtTime(store.state.pausedUntil)}` : 'Not paused', enabled: false },
        { type: 'separator' },
        { label: 'Pause for 30 minutes', click: () => doPause('30') },
        { label: 'Pause for 1 hour', click: () => doPause('60') },
        { label: 'Pause until tomorrow', click: () => doPause('tomorrow') },
        { label: 'Resume', enabled: paused, click: () => doPause('resume') }
      ]
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(paused ? 'AI Desktop Pet (paused)' : 'AI Desktop Pet');
}

function createTray() {
  let img = nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray.png'));
  if (!img.isEmpty()) img = img.resize({ width: process.platform === 'darwin' ? 18 : 16, height: process.platform === 'darwin' ? 18 : 16 });
  tray = new Tray(img);
  if (process.platform === 'win32') tray.on('click', () => summon());
  rebuildTray();
}

// ------------------------------------------------------------------ pause / quiet mode
function doPause(kind) {
  const now = Date.now();
  if (kind === '30') store.state.pausedUntil = now + 30 * 60000;
  else if (kind === '60') store.state.pausedUntil = now + 60 * 60000;
  else if (kind === 'tomorrow') {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0);
    store.state.pausedUntil = d.getTime();
  } else if (kind === 'resume') {
    store.state.pausedUntil = 0;
    store.state.nextVisitAt = now + store.settings.visitMinutes * 60000;
  }
  saveStore();
  rebuildTray();
  broadcastSettings();
  return status();
}

// ------------------------------------------------------------------ visits & reminders
let lastMessage = '', lastCategory = '';
const DEFAULT_MESSAGES = {
  visit: { minSeconds: 10, maxSeconds: 30 },
  categories: { greeting: ['Hi, how are you doing?'], water: ['Hi, want some water?'], stretch: ['Hi, quick stretch?'], break: ['Hi, need a break?'], mood: ['Hi, still doing okay?'] },
  summon: ['Hi, I am here.']
};

function pickCategory() {
  const cats = ['stretch', 'break'];
  if (store.settings.checkins) cats.push('greeting', 'greeting', 'mood');
  let c = cats[rand(cats.length)];
  if (c === lastCategory) c = cats[rand(cats.length)]; // one re-roll to reduce repeats
  lastCategory = c;
  return c;
}

function pickMessage(category) {
  const cfg = readJson('messages.json', DEFAULT_MESSAGES);
  const list = (category === 'summon' ? cfg.summon : cfg.categories && cfg.categories[category]) || DEFAULT_MESSAGES.categories[category] || ['Hi!'];
  let m = list[rand(list.length)];
  for (let i = 0; i < 5 && m === lastMessage && list.length > 1; i++) m = list[rand(list.length)];
  lastMessage = m;
  return m;
}

function visitDurationMs() {
  const v = (readJson('messages.json', DEFAULT_MESSAGES).visit) || {};
  const lo = num(v.minSeconds, 3, 300, 10), hi = Math.max(lo, num(v.maxSeconds, 3, 600, 30));
  return Math.round((lo + Math.random() * (hi - lo)) * 1000);
}

function sendVisit(kind) {
  const s = store.settings, st = store.state, now = Date.now();
  st.nextVisitAt = now + s.visitMinutes * 60000;
  if (kind === 'water' && s.waterMinutes > 0) st.nextWaterAt = now + s.waterMinutes * 60000;
  saveStore();
  petPresent = true; presentSince = now;
  showPetWindow();
  sendToPet('visit', { kind, text: pickMessage(kind), durationMs: visitDurationMs() });
}

function tick() {
  const s = store.settings, st = store.state, now = Date.now();
  if (petPresent && now - presentSince > 20 * 60000) petPresent = false; // failsafe
  if (!s.enabled) return;
  const visitDue = now >= st.nextVisitAt;
  const waterDue = s.waterMinutes > 0 && now >= st.nextWaterAt;
  if (!visitDue && !waterDue) return;
  if (isPaused(now) || inQuietHours(new Date(now))) {
    // quiet: no random visits; push them back so they happen shortly after quiet time ends
    if (visitDue) st.nextVisitAt = now + 60000;
    if (waterDue) st.nextWaterAt = now + 60000;
    saveStore();
    return;
  }
  if (petPresent) return;
  sendVisit(waterDue ? 'water' : pickCategory());
}

function initSchedule() {
  const s = store.settings, st = store.state, now = Date.now();
  const visitMs = s.visitMinutes * 60000, waterMs = s.waterMinutes * 60000;
  if (!(st.nextVisitAt > now)) st.nextVisitAt = now + (st.nextVisitAt ? 60000 : visitMs);
  st.nextVisitAt = Math.min(st.nextVisitAt, now + visitMs);
  if (s.waterMinutes > 0) {
    if (!(st.nextWaterAt > now)) st.nextWaterAt = now + (st.nextWaterAt ? 60000 : waterMs);
    st.nextWaterAt = Math.min(st.nextWaterAt, now + waterMs);
  }
  saveStore();
}

// ------------------------------------------------------------------ summon / chat actions
function summon(extra = {}) {
  if (!store.settings.enabled) {
    store.settings.enabled = true;
    if (btnWin && !btnWin.isDestroyed()) btnWin.showInactive();
    saveStore(); rebuildTray(); broadcastSettings();
  }
  petPresent = true; presentSince = Date.now();
  showPetWindow();
  sendToPet('summon', { text: extra.text || pickMessage('summon') });
}

function openChat() {
  if (!store.settings.enabled) { store.settings.enabled = true; if (btnWin && !btnWin.isDestroyed()) btnWin.showInactive(); saveStore(); broadcastSettings(); }
  petPresent = true; presentSince = Date.now();
  showPetWindow();
  sendToPet('open-chat');
}

function bringOnScreen() {
  store.settings.enabled = true;
  store.state.pausedUntil = 0;
  store.state.buttonPos = null;
  if (!btnWin || btnWin.isDestroyed()) createButtonWindow();
  const p = defaultButtonPos();
  placeButton(p.x, p.y);
  btnWin.showInactive();
  applyTop(btnWin);
  saveStore(); rebuildTray(); broadcastSettings();
  summon({ text: "Hi, I'm back on screen." });
}

// ------------------------------------------------------------------ chat engines
function basicReply(text) {
  const cfg = readJson('responses.json', { rules: [], fallback: ['Hi.'] });
  for (const rule of cfg.rules || []) {
    for (const p of rule.patterns || []) {
      try { if (new RegExp(p, 'i').test(text)) return rule.replies[rand(rule.replies.length)]; } catch (_) { /* bad regex: skip */ }
    }
  }
  const fb = cfg.fallback && cfg.fallback.length ? cfg.fallback : ['Hi.'];
  return fb[rand(fb.length)];
}

async function aiReply(history) {
  const key = getApiKey();
  if (!key) throw Object.assign(new Error('no key'), { status: 401 });
  const cfg = readJson('personality.json', {});
  const messages = [{ role: 'system', content: cfg.systemPrompt || 'You are a tiny, friendly desktop companion. Reply in 1-2 sentences.' }, ...history.slice(-12)];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages, max_tokens: cfg.maxReplyTokens || 120, temperature: cfg.temperature == null ? 0.8 : cfg.temperature }),
      signal: ctrl.signal
    });
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('empty reply');
    return text.trim();
  } finally { clearTimeout(timer); }
}

function friendlyError(err) {
  if (err && err.name === 'AbortError') return 'AI took too long, so I used a basic reply.';
  if (err && err.status === 401) return 'The API key was rejected, so I used a basic reply.';
  if (err && err.status === 429) return 'AI limit or quota reached, so I used a basic reply.';
  return "Couldn't reach the AI, so I used a basic reply.";
}

function cleanHistory(h) {
  if (!Array.isArray(h)) return [];
  return h.slice(-20).map((m) => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String((m && m.content) || '').slice(0, 1000) }));
}

async function handleChat(rawHistory) {
  const history = cleanHistory(rawHistory);
  const last = history[history.length - 1];
  if (!last || last.role !== 'user') return { reply: '...', mode: 'basic' };
  if (store.settings.aiChat) {
    if (getApiKey()) {
      try { return { reply: await aiReply(history), mode: 'ai' }; }
      catch (err) { return { reply: basicReply(last.content), mode: 'basic', note: friendlyError(err) }; }
    }
    return { reply: basicReply(last.content), mode: 'basic', note: 'AI chat is on but no API key is saved, so I used a basic reply.' };
  }
  return { reply: basicReply(last.content), mode: 'basic' };
}

// ------------------------------------------------------------------ side effects of settings changes
function applyLoginItem() {
  try {
    const opts = { openAtLogin: !!store.settings.launchAtStartup };
    if (!app.isPackaged && process.platform === 'win32') { opts.path = process.execPath; opts.args = [app.getAppPath()]; }
    app.setLoginItemSettings(opts);
  } catch (_) { /* not supported on this OS */ }
}

function applySettingsPatch(patch) {
  const old = store.settings;
  const next = sanitizeSettings({ ...old, ...patch, quietHours: { ...old.quietHours, ...((patch && patch.quietHours) || {}) } });
  store.settings = next;
  const now = Date.now();
  if (next.visitMinutes !== old.visitMinutes) store.state.nextVisitAt = now + next.visitMinutes * 60000;
  if (next.waterMinutes !== old.waterMinutes) store.state.nextWaterAt = next.waterMinutes > 0 ? now + next.waterMinutes * 60000 : 0;
  if (next.alwaysOnTop !== old.alwaysOnTop) { applyTop(petWin); applyTop(btnWin); }
  if (next.launchAtStartup !== old.launchAtStartup) applyLoginItem();
  if (next.enabled !== old.enabled) {
    if (next.enabled) {
      if (btnWin && !btnWin.isDestroyed()) btnWin.showInactive();
      store.state.nextVisitAt = now + next.visitMinutes * 60000;
    } else {
      if (btnWin && !btnWin.isDestroyed()) btnWin.hide();
      sendToPet('hide-now');
    }
  }
  saveStore();
  rebuildTray();
  broadcastSettings();
}

// ------------------------------------------------------------------ IPC
function registerIpc() {
  ipcMain.handle('settings-get', () => publicPayload());
  ipcMain.handle('settings-set', (_e, patch) => { applySettingsPatch(patch || {}); return publicPayload(); });
  ipcMain.handle('assets-get', () => getAssets());
  ipcMain.handle('api-key-set', (_e, key) => { const r = setApiKey(key); broadcastSettings(); return { ...r, status: status() }; });
  ipcMain.handle('api-key-clear', () => { clearApiKey(); broadcastSettings(); return { ok: true, status: status() }; });
  ipcMain.handle('pause', (_e, kind) => ({ status: doPause(String(kind)) }));
  ipcMain.handle('chat-send', (_e, history) => handleChat(history));

  ipcMain.on('visit-now', () => sendVisit(pickCategory()));
  ipcMain.on('bring-on-screen', () => bringOnScreen());
  ipcMain.on('open-settings', () => openSettings());

  ipcMain.on('pet-set-ignore', (_e, ignore) => {
    if (petWin && !petWin.isDestroyed() && process.platform !== 'linux') petWin.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  ipcMain.on('pet-focus', () => { if (petWin && !petWin.isDestroyed()) petWin.focus(); });
  ipcMain.on('pet-ready', () => {
    petReady = true;
    while (petQueue.length) { const [c, p] = petQueue.shift(); if (petWin && !petWin.isDestroyed()) petWin.webContents.send(c, p); }
  });
  ipcMain.on('pet-hidden', () => { petPresent = false; hidePetWindow(); });
  ipcMain.on('pet-context', () => {
    Menu.buildFromTemplate([
      { label: 'Chat', click: () => openChat() },
      { label: 'Send away', click: () => sendToPet('hide-now') },
      { label: 'Settings', click: () => openSettings() },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
    ]).popup({ window: petWin });
  });

  // summon button: dragging is done manually so a plain click can still summon the pet
  let dragOrigin = null;
  ipcMain.on('button-drag-start', () => { if (btnWin && !btnWin.isDestroyed()) dragOrigin = btnWin.getBounds(); });
  ipcMain.on('button-drag-move', (_e, d) => { if (dragOrigin && d) placeButton(dragOrigin.x + d.dx, dragOrigin.y + d.dy); });
  ipcMain.on('button-drag-end', () => {
    if (!dragOrigin || !btnWin || btnWin.isDestroyed()) { dragOrigin = null; return; }
    dragOrigin = null;
    const b = btnWin.getBounds();
    store.state.buttonPos = { x: b.x, y: b.y };
    saveStore();
  });
  ipcMain.on('button-click', () => summon());
  ipcMain.on('button-context', () => {
    Menu.buildFromTemplate([
      { label: 'Summon Pet', click: () => summon() },
      { label: 'Chat', click: () => openChat() },
      { label: 'Settings', click: () => openSettings() },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
    ]).popup({ window: btnWin });
  });
}

function getAssets() {
  const cfg = readJson('sprites.json', {});
  const fileUrl = (name) => {
    if (!name || typeof name !== 'string') return null;
    const p = path.join(ASSETS_DIR, path.basename(name));
    return fs.existsSync(p) ? pathToFileURL(p).href : null;
  };
  const frames = { idle: [], walk: [] };
  for (const k of Object.keys(frames)) {
    frames[k] = ((cfg.frames && cfg.frames[k]) || []).map(fileUrl).filter(Boolean);
  }
  let image = fileUrl(cfg.image || 'pet.png');
  if (!image && frames.idle.length) image = frames.idle[0];
  return { image, icon: pathToFileURL(path.join(ASSETS_DIR, 'icon.png')).href, frames, frameMs: num(cfg.frameMs, 40, 1000, 140) };
}

// ------------------------------------------------------------------ app lifecycle
const gotLock = FLAG_SELFTEST || app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (argv.includes('--bring-on-screen')) bringOnScreen(); else summon();
  });

  // The app lives in the tray; closing windows must not quit it.
  app.on('window-all-closed', () => { /* keep running */ });
  app.on('before-quit', () => { app.isQuitting = true; saveStore(true); });
  app.on('display-metrics-changed', onDisplayChange);
  app.on('display-added', onDisplayChange);
  app.on('display-removed', onDisplayChange);

  app.whenReady().then(start);
}

function onDisplayChange() {
  if (petWin && !petWin.isDestroyed() && petWin.isVisible()) petWin.setBounds(petBounds());
  if (btnWin && !btnWin.isDestroyed()) { const b = btnWin.getBounds(); placeButton(b.x, b.y); }
}

function start() {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  if (process.platform === 'win32') app.setAppUserModelId('edu.genai.desktoppet');

  storePath = path.join(app.getPath('userData'), 'pet-data.json');
  loadStore();
  registerIpc();
  initSchedule();
  applyLoginItem();
  createPetWindow();
  createButtonWindow();
  createTray();
  setInterval(tick, 5000); // very cheap; nothing else runs while the pet is away

  if (FLAG_BRING) setTimeout(bringOnScreen, 800);
  if (FLAG_SELFTEST) selfTest().catch((e) => { console.error('[selftest] crashed:', e); app.exit(1); });
}

// ------------------------------------------------------------------ headless self-test (npm run selftest)
async function selfTest() {
  const out = {};
  const log = (k, v) => { out[k] = v; console.log(`[selftest] ${k}:`, JSON.stringify(v)); };
  await sleep(2500);
  log('petWindowCreated', !!petWin && !petWin.isDestroyed());
  log('buttonWindowCreated', !!btnWin && !btnWin.isDestroyed());
  log('trayCreated', !!tray);
  log('buttonInsideScreen', (() => { const b = btnWin.getBounds(), wa = screen.getPrimaryDisplay().workArea; return b.x >= wa.x && b.y >= wa.y && b.x + b.width <= wa.x + wa.width && b.y + b.height <= wa.y + wa.height; })());

  // button clamping: try to push it far off-screen
  placeButton(-5000, -5000);
  const c = btnWin.getBounds();
  log('buttonClampedWhenDraggedOffscreen', c.x >= screen.getPrimaryDisplay().workArea.x && c.y >= screen.getPrimaryDisplay().workArea.y);

  // basic chat
  const phrases = ['hi', 'nice to meet you', 'how are you', "I'm tired", 'I need water', "I'm stressed", 'blah'];
  const replies = {};
  for (const p of phrases) replies[p] = (await handleChat([{ role: 'user', content: p }])).reply;
  log('basicChat', replies);

  // visit: bubble appears after the pet walks in
  sendVisit('water');
  await sleep(9000);
  log('visitBubbleText', await petWin.webContents.executeJavaScript("document.getElementById('bubbleText').textContent"));
  log('visitBubbleVisible', await petWin.webContents.executeJavaScript("document.getElementById('bubble').classList.contains('show')"));
  log('petWindowVisibleDuringVisit', petWin.isVisible());
  if (process.env.PET_SHOT) { // optional: save a picture of the pet window (for documentation)
    try { fs.writeFileSync(process.env.PET_SHOT, (await petWin.webContents.capturePage()).toPNG()); log('screenshot', process.env.PET_SHOT); } catch (e) { log('screenshotFailed', e.message); }
  }

  // chat UI
  sendToPet('open-chat');
  await sleep(500);
  log('chatOpen', await petWin.webContents.executeJavaScript("document.getElementById('chat').classList.contains('open')"));

  // pause + persistence
  doPause('30');
  applySettingsPatch({ petSize: 180, visitMinutes: 15 });
  saveStore(true);
  const saved = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  log('persistedPetSize', saved.settings.petSize);
  log('persistedPause', saved.state.pausedUntil > Date.now());
  log('persistedNextVisit', saved.state.nextVisitAt > Date.now());

  const ok = out.petWindowCreated !== false && out.buttonWindowCreated && out.trayCreated && out.visitBubbleVisible && out.chatOpen &&
             out.persistedPetSize === 180 && out.persistedPause && out.buttonClampedWhenDraggedOffscreen && out.buttonInsideScreen;
  console.log(ok ? '[selftest] RESULT: PASS' : '[selftest] RESULT: FAIL');
  app.exit(ok ? 0 : 1);
}
