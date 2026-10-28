'use strict';
// Floating summon button: click = summon pet, drag = move (the main process keeps it on screen).
(() => {
  const api = window.petAPI;
  const btn = document.getElementById('btn');

  api.getAssets().then((a) => {
    // uses assets/pet.png if you provide one, otherwise the bundled icon
    btn.style.backgroundImage = 'url("' + (a.image || a.icon) + '")';
  });

  let startX = 0, startY = 0, dragging = false, moved = false, pending = null, raf = 0;

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    btn.setPointerCapture(e.pointerId);
    startX = e.screenX; startY = e.screenY;
    dragging = true; moved = false;
    api.buttonDragStart();
  });

  btn.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.screenX - startX, dy = e.screenY - startY;
    if (!moved && Math.hypot(dx, dy) < 5) return; // ignore tiny jitters so clicks still work
    moved = true;
    pending = { dx, dy };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (pending) api.buttonDragMove(pending.dx, pending.dy); });
  });

  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    if (pending && moved) api.buttonDragMove(pending.dx, pending.dy);
    pending = null;
    api.buttonDragEnd();
    if (!moved && e.type === 'pointerup') api.buttonClick();
  };
  btn.addEventListener('pointerup', finish);
  btn.addEventListener('pointercancel', finish);
  btn.addEventListener('contextmenu', (e) => { e.preventDefault(); api.buttonContext(); });
})();
