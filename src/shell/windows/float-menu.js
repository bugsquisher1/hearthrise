// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/float-menu.js — ONE CONTEXT MENU PER PAGE, BESIDE WHAT IT IS FOR.
//
// The bag's right-click / long-press menu (and the players' and monsters' one,
// src/shell/context-menu.js) floats at page level (like the
// tooltip), so no window's scroll box clips it and no window's slide-in
// transform moves it. The owner hands it the menu's markup, where to stand,
// what to do with a press, and what to do when it closes. It closes on Esc, on
// a press outside it, when its owner's window has gone, or when the owner says
// so — and ONLY its owner: one owner's repaint never closes another's menu
// (playtest 10-22: with the bag open, a right-click menu anywhere else blinked
// shut on the bag's next display tick). Display only: a press is passed to the
// owner, which sends any intent.
// ════════════════════════════════════════════════════════════════════════

let OWNER = null;   // { onAct, onClose, alive }
let WATCH = 0;

function menuEl(doc) {
  let el = doc.querySelector('.hw-menu');
  if (el) return el;
  el = doc.createElement('div');
  el.className = 'hw-menu';
  el.setAttribute('role', 'menu');
  el.setAttribute('aria-label', 'Item actions');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hs-act]');
    if (b && !b.disabled && OWNER) OWNER.onAct(b.getAttribute('data-hs-act'), e, b);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFloatMenu(doc); return; }
    /* A field in the menu (the amount picker, src/shell/widgets/amount.js): Enter presses its default button and the arrows stay the field's. */
    if (e.target.tagName === 'INPUT') {
      const def = el.querySelector('[data-hs-default]:not([disabled])');
      if (e.key === 'Enter' && def) { e.preventDefault(); e.stopPropagation(); def.click(); }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(el.querySelectorAll('button:not([disabled])'));
    const i = items.indexOf(doc.activeElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    if (next) next.focus();
  });
  doc.addEventListener('pointerdown', (e) => { if (OWNER && !el.contains(e.target)) closeFloatMenu(doc); }, true);
  doc.body.appendChild(el);
  return el;
}

/**
 * Open the menu at { x, y } (kept on screen).
 * @param {Document} doc
 * @param {string} html            its buttons carry data-hs-act
 * @param {{x:number, y:number}} at
 * @param {{onAct:(action:string, ev:Event, btn:Element)=>void, onClose:()=>void, alive:()=>boolean, label?:string}} owner
 */
export function openFloatMenu(doc, html, at, owner) {
  if (OWNER && OWNER !== owner) { const o = OWNER; OWNER = null; o.onClose(); }
  const el = menuEl(doc);
  el.innerHTML = html;
  el.setAttribute('aria-label', owner.label || 'Item actions');
  el.classList.add('is-on');
  OWNER = owner;
  const view = doc.defaultView;
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.round(Math.max(4, Math.min(view.innerWidth - w - 4, at.x))) + 'px';
  el.style.top = Math.round(Math.max(4, Math.min(view.innerHeight - h - 4, at.y))) + 'px';
  const field = el.querySelector('input');
  const first = field || el.querySelector('button:not([disabled])');
  if (first) first.focus({ preventScroll: true });
  if (field && field.select) field.select();
  clearInterval(WATCH);
  WATCH = view.setInterval(() => { if (OWNER && !OWNER.alive()) closeFloatMenu(doc); }, 300);
}

/**
 * Close the menu (the owner's onClose runs once). Given `only`, close it only while
 * that owner holds it: an owner tidying up its own menu never closes another's.
 */
export function closeFloatMenu(doc, only) {
  if (only !== undefined && (!only || OWNER !== only)) return;
  const el = doc.querySelector('.hw-menu');
  if (el) el.classList.remove('is-on');
  clearInterval(WATCH);
  if (OWNER) { const o = OWNER; OWNER = null; o.onClose(); }
}
