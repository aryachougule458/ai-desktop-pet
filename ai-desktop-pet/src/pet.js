'use strict';
/**
 * Pet renderer: animation, walking, visits, speech bubble and compact chat.
 * Movement uses requestAnimationFrame only while the pet is walking; everything else is CSS animation,
 * so CPU use stays very low when idle. When the pet is away the window is hidden by the main process.
 */
(() => {
  const api = window.petAPI;
  const $ = (id) => document.getElementById(id);
  const actor = $('actor'), body = $('body'), bubble = $('bubble'), bubbleText = $('bubbleText');
  const chat = $('chat'), chatLog = $('chatLog'), chatForm = $('chatForm'), chatInput = $('chatInput');

  // Built-in drawn pet (used when assets/pet.png is not provided). Replace by dropping assets/pet.png in.
  const PET_SVG = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <g id="tail"><path d="M150 142 C186 138 196 102 176 84" stroke="#f08f3a" stroke-width="15" stroke-linecap="round" fill="none"/></g>
  <path d="M46 66 L56 16 L94 50 Z" fill="#f6a455"/><path d="M154 66 L144 16 L106 50 Z" fill="#f6a455"/>
  <path d="M56 54 L61 31 L80 49 Z" fill="#f7b7a6"/><path d="M144 54 L139 31 L120 49 Z" fill="#f7b7a6"/>
  <ellipse cx="100" cy="116" rx="70" ry="62" fill="#f6a455"/>
  <ellipse cx="100" cy="138" rx="42" ry="36" fill="#fde3bd"/>
  <ellipse id="footL" cx="68" cy="178" rx="21" ry="11" fill="#e8812f"/>
  <ellipse id="footR" cx="132" cy="178" rx="21" ry="11" fill="#e8812f"/>
  <g id="eyes">
    <ellipse cx="72" cy="100" rx="9.5" ry="12.5" fill="#2b2118"/><circle cx="75.5" cy="95" r="3.6" fill="#fff"/>
    <ellipse cx="128" cy="100" rx="9.5" ry="12.5" fill="#2b2118"/><circle cx="131.5" cy="95" r="3.6" fill="#fff"/>
  </g>
  <ellipse cx="54" cy="119" rx="9" ry="6" fill="#ff8f8f" opacity=".6"/><ellipse cx="146" cy="119" rx="9" ry="6" fill="#ff8f8f" opacity=".6"/>
  <ellipse cx="100" cy="108" rx="4.5" ry="3.2" fill="#d9695f"/>
  <path d="M93 114 Q100 121 107 114" stroke="#2b2118" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

  let S = null;                                   // settings
  let assets = { image: null, frames: { idle: [], walk: [] }, frameMs: 140 };
  let spriteImg = null;
  let x = -999, facing = 1, state = 'hidden';     // state: hidden | idle | walking
  let seq = 0;                                    // bump to cancel any running async sequence
  let walkRaf = 0, walkResolve = null;
  let wanderTimer = 0, blinkTimer = 0, leaveTimer = 0, frameTimer = 0;
  let chatOpen = false, sending = false, lastNote = '';
  const history = [];                             // current conversation only (not saved to disk)

  const rand = (a, b) => a + Math.random() * (b - a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

  // ---------------------------------------------------------------- sprite
  function mountSprite() {
    clearInterval(frameTimer);
    if (assets.image) {
      body.innerHTML = '';
      spriteImg = new Image();
      spriteImg.src = assets.image;
      spriteImg.alt = '';
      spriteImg.draggable = false;
      body.appendChild(spriteImg);
    } else {
      body.innerHTML = PET_SVG;
      spriteImg = null;
    }
  }

  // Optional frame-by-frame animation (see config/sprites.json)
  function setFrames(kind) {
    clearInterval(frameTimer);
    frameTimer = 0;
    if (!spriteImg) return;
    const list = (assets.frames && assets.frames[kind]) || [];
    if (list.length >= 2) {
      let i = 0;
      spriteImg.src = list[0];
      frameTimer = setInterval(() => { i = (i + 1) % list.length; spriteImg.src = list[i]; }, assets.frameMs / S.animationSpeed);
    } else if (list.length === 1) {
      spriteImg.src = list[0];
    } else if (assets.image) {
      spriteImg.src = assets.image;
    }
  }

  function applySettings() {
    const root = document.documentElement.style;
    root.setProperty('--pet', S.petSize + 'px');
    root.setProperty('--spd', String(S.animationSpeed));
    positionOverlays();
  }

  // ---------------------------------------------------------------- basic motion helpers
  function render() { actor.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)'; }
  function setFacing(dir) { facing = dir; actor.style.setProperty('--face', String(dir)); }

  function boing() {
    body.classList.remove('boing');
    void body.offsetWidth; // restart animation
    body.classList.add('boing');
    setTimeout(() => body.classList.remove('boing'), 650 / S.animationSpeed);
  }

  function positionOverlays() {
    if (!S) return;
    const roomRight = innerWidth - (x + S.petSize);
    const side = roomRight >= 290 ? 'right' : 'left';
    for (const el of [bubble, chat]) {
      el.classList.toggle('side-right', side === 'right');
      el.classList.toggle('side-left', side === 'left');
    }
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (state === 'hidden') return;
    blinkTimer = setTimeout(() => {
      const eyes = body.querySelector('#eyes');
      const target = eyes || body;
      const cls = eyes ? 'blink' : 'blinkimg';
      const once = () => { target.classList.add(cls); setTimeout(() => target.classList.remove(cls), 130); };
      once();
      if (Math.random() < 0.25) setTimeout(once, 280); // sometimes a double blink
      scheduleBlink();
    }, rand(2200, 5500));
  }

  // ---------------------------------------------------------------- walking
  function stopWalkLoop() {
    cancelAnimationFrame(walkRaf);
    walkRaf = 0;
    if (walkResolve) { const r = walkResolve; walkResolve = null; r(false); }
    actor.classList.remove('walking');
  }

  function walkTo(target, speedBase) {
    stopWalkLoop();
    return new Promise((resolve) => {
      walkResolve = resolve;
      const dir = target >= x ? 1 : -1;
      setFacing(dir);
      state = 'walking';
      actor.classList.add('walking');
      setFrames('walk');
      const speed = (speedBase || S.petSize * 0.8) * S.animationSpeed;
      let last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        x += dir * speed * dt;
        if ((dir > 0 && x >= target) || (dir < 0 && x <= target)) {
          x = target; render();
          walkRaf = 0; walkResolve = null;
          actor.classList.remove('walking');
          state = 'idle';
          setFrames('idle');
          resolve(true);
          return;
        }
        render();
        walkRaf = requestAnimationFrame(step);
      };
      walkRaf = requestAnimationFrame(step);
    });
  }

  // ---------------------------------------------------------------- enter / leave
  async function enterScreen(my) {
    const W = innerWidth, sz = S.petSize;
    const fromLeft = Math.random() < 0.5;
    stopWalkLoop();
    x = fromLeft ? -sz - 30 : W + 30;
    setFacing(fromLeft ? 1 : -1);
    render();
    actor.hidden = false;
    state = 'walking';
    scheduleBlink();
    const minX = Math.max(40, W * 0.15);
    const maxX = Math.max(minX + 1, Math.min(W * 0.85, W - sz - 40));
    const ok = await walkTo(rand(minX, maxX), sz * 0.8);
    if (!ok || my !== seq) return false;
    boing();
    positionOverlays();
    return true;
  }

  async function ensurePresent(my) {
    const W = innerWidth, sz = S.petSize;
    if (state === 'hidden' || actor.hidden) return enterScreen(my);
    if (x < 10 || x > W - sz - 10) { // caught mid-exit: walk back in
      const ok = await walkTo(clamp(x, 40, W - sz - 40), sz * 0.9);
      return ok && my === seq;
    }
    return true;
  }

  function goHidden() {
    state = 'hidden';
    actor.hidden = true;
    clearTimeout(blinkTimer); clearTimeout(wanderTimer); clearTimeout(leaveTimer); clearInterval(frameTimer);
    api.petHidden();
  }

  async function leaveScreen(my, fast) {
    hideBubble();
    closeChat(true);
    clearTimeout(wanderTimer); clearTimeout(leaveTimer);
    const W = innerWidth, sz = S.petSize;
    const target = x + sz / 2 < W / 2 ? -sz - 40 : W + 40;
    const ok = await walkTo(target, sz * (fast ? 1.6 : 1.0));
    if (!ok || my !== seq) return;
    goHidden();
  }

  function scheduleLeave(ms) {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (chatOpen) { scheduleLeave(8000); return; }
      leaveScreen(++seq, false);
    }, ms);
  }

  function scheduleWander() {
    clearTimeout(wanderTimer);
    if (state === 'hidden') return;
    wanderTimer = setTimeout(async () => {
      if (state !== 'idle' || chatOpen || bubble.classList.contains('show')) { scheduleWander(); return; }
      if (Math.random() < 0.25) { setFacing(-facing); boing(); scheduleWander(); return; } // just turn around
      const my = seq;
      const W = innerWidth, sz = S.petSize;
      const target = clamp(x + (Math.random() < 0.5 ? -1 : 1) * rand(60, 220), 20, W - sz - 20);
      const ok = await walkTo(target, sz * 0.5);
      if (!ok || my !== seq) return;
      positionOverlays();
      scheduleWander();
    }, rand(5000, 12000));
  }

  // ---------------------------------------------------------------- bubble + sound
  function showBubble(text) {
    bubbleText.textContent = text;
    positionOverlays();
    bubble.classList.add('show');
  }
  function hideBubble() { bubble.classList.remove('show'); }

  let audioCtx = null;
  function chime() {
    if (!S || !S.sound) return;
    try {
      audioCtx = audioCtx || new AudioContext();
      const t = audioCtx.currentTime;
      [660, 880].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), s = t + i * 0.12;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.linearRampToValueAtTime(0.08, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.25);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(s); o.stop(s + 0.3);
      });
    } catch (_) { /* audio not available */ }
  }

  // ---------------------------------------------------------------- visits / summon
  async function present(p) {
    const my = ++seq;
    clearTimeout(leaveTimer); clearTimeout(wanderTimer);
    const ok = await ensurePresent(my);
    if (!ok || my !== seq) return;
    if (chatOpen) { boing(); }
    else if (p.text) { showBubble(p.text); chime(); boing(); }
    scheduleLeave(p.durationMs || 20000);
    scheduleWander();
  }

  // ---------------------------------------------------------------- chat
  function addMsg(who, text) {
    const el = document.createElement('div');
    el.className = 'msg ' + who;
    el.textContent = text;
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function addNote(text) {
    const el = document.createElement('div');
    el.className = 'note';
    el.textContent = text;
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function addTyping() {
    const el = document.createElement('div');
    el.className = 'typing';
    el.innerHTML = '<i></i><i></i><i></i>';
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }

  function openChat() {
    if (chatOpen) { chatInput.focus(); return; }
    chatOpen = true;
    clearTimeout(leaveTimer); clearTimeout(wanderTimer);
    hideBubble();
    positionOverlays();
    chat.classList.add('open');
    if (!chatLog.children.length) addMsg('pet', 'Hi! What\'s up?');
    api.focusWindow();
    setTimeout(() => chatInput.focus(), 60);
  }

  function closeChat(silent) {
    if (!chatOpen) return;
    chatOpen = false;
    chat.classList.remove('open');
    if (!silent) { scheduleLeave(15000); scheduleWander(); }
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || sending) return;
    chatInput.value = '';
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    sending = true;
    const typing = addTyping();
    const started = Date.now();
    let res;
    try { res = await api.chatSend(history.slice(-20)); }
    catch (_) { res = { reply: 'Hmm, I got distracted. Say that again?', mode: 'basic' }; }
    const elapsed = Date.now() - started;
    if (elapsed < 600) await sleep(600 - elapsed); // tiny pause so replies feel natural
    typing.remove();
    addMsg('pet', res.reply);
    history.push({ role: 'assistant', content: res.reply });
    if (res.note && res.note !== lastNote) { addNote(res.note); lastNote = res.note; }
    sending = false;
    chatInput.focus();
  });
  $('chatClose').addEventListener('click', () => closeChat(false));
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChat(false); });

  // ---------------------------------------------------------------- mouse: click-through except over the pet
  let ignoring = true;
  document.addEventListener('mousemove', (e) => {
    const over = !!(e.target.closest && e.target.closest('#body, #bubble, #chat'));
    if (over === ignoring) { ignoring = !over; api.setIgnore(ignoring); }
  });
  document.addEventListener('mouseleave', () => { if (!ignoring) { ignoring = true; api.setIgnore(true); } });

  body.addEventListener('click', () => { boing(); if (chatOpen) closeChat(false); else openChat(); });
  bubble.addEventListener('click', () => openChat());
  body.addEventListener('contextmenu', (e) => { e.preventDefault(); api.petContextMenu(); });

  // ---------------------------------------------------------------- events from the main process
  api.on('visit', (p) => present(p));
  api.on('summon', (p) => present({ text: p && p.text, durationMs: 45000 }));
  api.on('open-chat', async () => {
    const my = ++seq;
    clearTimeout(leaveTimer); clearTimeout(wanderTimer);
    const ok = await ensurePresent(my);
    if (!ok || my !== seq) return;
    openChat();
  });
  api.on('hide-now', () => {
    const my = ++seq;
    if (state === 'hidden') { api.petHidden(); return; }
    leaveScreen(my, true);
  });
  api.on('settings-changed', (payload) => {
    S = payload.settings;
    applySettings();
    if (state !== 'hidden') { x = clamp(x, 0, innerWidth - S.petSize); render(); }
  });
  window.addEventListener('resize', () => { if (S && state !== 'hidden') { x = clamp(x, 0, innerWidth - S.petSize); render(); positionOverlays(); } });

  // ---------------------------------------------------------------- start
  (async function init() {
    S = (await api.getSettings()).settings;
    assets = await api.getAssets();
    applySettings();
    mountSprite();
    setFacing(1);
    render();
    api.petReady();
  })();
})();
