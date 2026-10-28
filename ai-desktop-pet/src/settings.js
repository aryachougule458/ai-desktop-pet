'use strict';
(() => {
  const api = window.petAPI;
  const $ = (id) => document.getElementById(id);
  let cur = null, st = null, savedTimer = 0;
  const PRESETS = [5, 10, 15, 30, 60];

  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), cur);
  function patchFor(path, val) {
    const keys = path.split('.'), p = {};
    let o = p;
    keys.slice(0, -1).forEach((k) => { o[k] = {}; o = o[k]; });
    o[keys[keys.length - 1]] = val;
    return p;
  }

  function flash() {
    const el = $('saved');
    el.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove('show'), 1200);
  }

  async function save(path, val) {
    const r = await api.setSettings(patchFor(path, val));
    cur = r.settings; st = r.status;
    flash();
    renderStatus();
  }

  function fmt(key, v) { return key === 'animationSpeed' ? Number(v).toFixed(1) + 'x' : v + ' px'; }

  function render() {
    document.querySelectorAll('[data-key]').forEach((el) => {
      const v = get(el.dataset.key);
      if (el.type === 'checkbox') el.checked = !!v;
      else {
        if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === String(v))) {
          const o = document.createElement('option'); o.value = String(v); o.textContent = 'Every ' + v + ' min'; el.appendChild(o);
        }
        el.value = v;
      }
    });
    document.querySelectorAll('[data-out]').forEach((el) => { el.textContent = fmt(el.dataset.out, get(el.dataset.out)); });
    const m = cur.visitMinutes;
    $('visitSelect').value = PRESETS.includes(m) ? String(m) : 'custom';
    $('customWrap').classList.toggle('hidden', PRESETS.includes(m));
    $('visitCustom').value = m;
    renderStatus();
  }

  function renderStatus() {
    if (!st) return;
    let t = 'Pet is active.';
    if (!cur.enabled) t = 'Pet is turned off.';
    else if (st.paused) t = 'Paused until ' + new Date(st.pausedUntil).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '.';
    else if (st.quietNow) t = 'Quiet hours are active right now.';
    $('pauseStatus').textContent = t;

    const k = $('keyStatus');
    k.className = 'status';
    if (st.hasApiKey) k.textContent = 'An API key is saved.' + (st.secureStorage ? '' : ' (Secure storage is unavailable here, so it lasts only until you quit.)');
    else k.textContent = 'No API key saved. Chat uses the built-in replies.';
    if (cur.aiChat && !st.hasApiKey) { k.textContent += ' AI chat is on, so add a key to use it.'; k.classList.add('warn'); }
  }

  // generic inputs
  document.querySelectorAll('[data-key]').forEach((el) => {
    const isRange = el.type === 'range';
    el.addEventListener(isRange ? 'input' : 'change', () => {
      if (isRange) { const out = document.querySelector('[data-out="' + el.dataset.key + '"]'); if (out) out.textContent = fmt(el.dataset.key, el.value); return; }
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.type === 'number') v = Number(v);
      save(el.dataset.key, v);
    });
    if (isRange) el.addEventListener('change', () => save(el.dataset.key, Number(el.value)));
  });

  // visit frequency (presets + custom)
  $('visitSelect').addEventListener('change', (e) => {
    if (e.target.value === 'custom') { $('customWrap').classList.remove('hidden'); $('visitCustom').focus(); return; }
    save('visitMinutes', Number(e.target.value));
  });
  $('visitCustom').addEventListener('change', (e) => {
    const n = Math.max(1, Math.min(1440, Math.round(Number(e.target.value) || 5)));
    e.target.value = n;
    save('visitMinutes', n);
  });

  // quiet mode buttons
  document.querySelectorAll('[data-pause]').forEach((b) => b.addEventListener('click', async () => {
    const r = await api.pause(b.dataset.pause);
    st = r.status; flash(); renderStatus();
  }));

  // API key
  $('saveKey').addEventListener('click', async () => {
    const v = $('apiKey').value;
    const r = await api.setApiKey(v);
    if (!r.ok) { $('keyStatus').textContent = r.error; $('keyStatus').className = 'status warn'; return; }
    $('apiKey').value = '';
    st = r.status; flash(); renderStatus();
    if (!cur.aiChat) await save('aiChat', true);
    render();
  });
  $('clearKey').addEventListener('click', async () => { const r = await api.clearApiKey(); st = r.status; flash(); renderStatus(); });

  $('visitNow').addEventListener('click', () => api.visitNow());
  $('bringBack').addEventListener('click', () => api.bringOnScreen());

  api.on('settings-changed', (p) => { cur = p.settings; st = p.status; render(); });
  api.getSettings().then((p) => { cur = p.settings; st = p.status; render(); });
})();
