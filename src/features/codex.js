// ════════════════════════════════════════════════════════════════════════
// src/features/codex.js — THE HEARTH CODEX, the in-game glossary.
//
// Publishes window.HearthriseCodex = { open(id), close() }. The entries live in
// src/data/codex.js and are fetched by DYNAMIC import on the first open, so the
// glossary costs a cold boot nothing (tests/codex-claims.mjs CODEX-9).
//
// It shows no numbers and reads no state: no G, no storage, no envelope
// (CODEX-10). Every sentence it prints is bound to the engine by that guard.
//
// The sheet is the shared .modal/.modal-card, so the global Escape handler and
// closeAllModals() already close it; this file adds no keydown listener and no
// height rule. Text is written with textContent only.
// ════════════════════════════════════════════════════════════════════════

const MODAL_ID = 'codex-modal';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function close() {
  const m = document.getElementById(MODAL_ID);
  if (m) m.classList.remove('show');
}

/** A door either switches tab or calls a window opener ("A.b" or "fn"). */
function goThrough(door) {
  close();
  if (door.tab) {
    if (typeof window.showTab === 'function') window.showTab(door.tab);
    return;
  }
  const [head, tail] = String(door.opener).split('.');
  const host = window[head];
  const fn = tail ? host && host[tail] : host;
  if (typeof fn === 'function') fn.call(tail ? host : window);
}

function build(groups, entries) {
  const modal = el('div', 'modal');
  modal.id = MODAL_ID;
  // .hr-sheet: the head (title + Close) stays pinned and only the body scrolls.
  const card = el('div', 'modal-card hr-sheet');
  const head = el('div', 'modal-head hr-sheet-head');
  head.appendChild(el('div', 'modal-title', 'Hearth Codex'));
  const shut = el('button', 'btn btn-sm', 'Close');
  shut.type = 'button';
  shut.addEventListener('click', close);
  head.appendChild(shut);
  card.appendChild(head);
  const body = el('div', 'hr-sheet-body');
  card.appendChild(body);
  for (const g of groups) {
    body.appendChild(el('h3', 'codex-group', g.label));
    for (const e of entries.filter((x) => x.group === g.id)) {
      const d = el('details', 'codex-entry');
      d.id = 'cx-' + e.id;
      d.appendChild(el('summary', null, e.term));
      d.appendChild(el('p', null, e.text));
      if (e.door) {
        const b = el('button', 'btn tap codex-door', 'Show me');
        b.type = 'button';
        b.addEventListener('click', () => goThrough(e.door));
        d.appendChild(b);
      }
      body.appendChild(d);
    }
  }
  modal.appendChild(card);
  modal.addEventListener('click', (ev) => { if (ev.target === modal) close(); });
  document.body.appendChild(modal);
  return modal;
}

async function open(id) {
  let modal = document.getElementById(MODAL_ID);
  if (!modal) {
    const { CODEX_GROUPS, CODEX_ENTRIES } = await import('../data/codex.js?v=566');
    modal = document.getElementById(MODAL_ID) || build(CODEX_GROUPS, CODEX_ENTRIES);
  }
  modal.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
  modal.classList.add('show');
  const target = id ? document.getElementById('cx-' + id) : null;
  if (target) {
    target.open = true;
    target.scrollIntoView({ block: 'nearest' });
  }
  return modal;
}

export function setupCodex() {
  window.HearthriseCodex = { open, close };
}
