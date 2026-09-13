// ============================================================================
// src/render/bank-panel.js — THE DEPOT, rendered.
//
// The display half of the bank store. src/net/bank-sync.js owns the wire and
// accrue.js `reconcileBank` owns the contents; this file turns `G.bank` and
// `G.inventory` into two columns and a set of move buttons, and owns no truth
// at all. Reachable from the Inventory toolbar ("Depot"); there is no bank or
// vault room in src/data/* today, so the House has no entrance to add.
//
// ── THE FIVE RULES THIS FILE ENFORCES ───────────────────────────────────────
//  1. EVERY NUMBER IS THE REALM'S. `bankPanelView()` reads `G.inventory` and
//     `G.bank` — both written absolutely from the envelope — and does no
//     arithmetic beyond counting rows. After a move the panel does not adjust a
//     figure; it waits for `bankMoveSettled()` to bring an envelope and repaints
//     from that. There is no optimistic paint to reconcile.
//  2. THE CAP IS NOT GUESSED, AND THE TWO CAPS ARE NOT THE SAME NUMBER. The
//     "N / cap slots" line is the BAG's: `bankCap()` reads `G._bankCap`, the
//     mirror of `player_state.bank_cap` (b537), which is the ceiling
//     `hr_bank_move` enforces on a WITHDRAW (`bag_full`). The Depot's own
//     ceiling is a server constant (`c_max_bank_stacks`) that `hr_state_of`
//     does NOT project, so the panel states the stacks stored and shows a
//     ceiling only once the server has named one in a `bank_full` refusal —
//     parked in `_`-scratch, never persisted, never a gate. Inventing "1000"
//     client-side would be a client-held number describing a server capability,
//     which is the residue-ahead class (CLAUDE.md §6).
//  3. ABSENT IS NOT EMPTY. When the envelope's bank projection has not folded
//     (`lastBankFoldMode()` is 'dormant'/'absent'/null) the panel says the realm
//     has not sent the vault rather than drawing an empty grid, because "your
//     Depot is empty" is a claim only the server can make.
//  4. A REFUSAL IS A SENTENCE. Every code `hr_bank_move` returns is rendered by
//     `bankMoveRefusalText()`; nothing here invents copy, and nothing swallows a
//     refusal into silence.
//  5. IT SCALES. The vault's ceiling is a thousand stacks, so both columns cap
//     at MAX_ROWS rendered rows with a "+N more — search to narrow" line and a
//     search box that filters both. A thousand buttons in a modal is not a list.
//
// `bankPanelView()` and `bankPanelHtml()` are PURE functions of what they are
// handed, which is how the suite quotes the capacity line and the rows without a
// live account. Only `openDepot`/`closeDepot`/`repaint` touch the DOM.
// ============================================================================

import { bankItems, bankMoveSettled, bankMoveRefusalText } from '../net/bank-sync.js?v=543';
import { lastBankFoldMode } from '../net/accrue.js?v=543';

const OVERLAY_ID = 'bank-panel-overlay';
const STYLE_ID = 'bank-panel-css';

/* How many rows each column draws. The counts above the columns already state
   the totals, so the list is the part a player can actually read. */
export const MAX_ROWS = 60;

const w = () => (typeof window !== 'undefined' ? window : {});

function itemName(id) {
  const I = w().ITEMS;
  const d = I && I[id];
  return (d && d.n) || String(id);
}
function itemIcon(id, px) {
  try {
    if (typeof w().itemArt === 'function') return w().itemArt(id, px || 22);
  } catch (e) {}
  return '';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(n) { return Number(n || 0).toLocaleString(); }

/* ── THE VIEW — PURE ──────────────────────────────────────────────────────────
   Takes G (and the search string), returns exactly what the HTML draws. The bag
   side lists only ids the catalogue knows, because a row for an id this build
   cannot name is a row a player cannot act on. Sorted by name so the list is
   stable across repaints — a grid that reorders under the finger mis-taps. */
export function bankPanelView(G, opts) {
  const o = opts || {};
  const needle = String(o.search || '').trim().toLowerCase();
  const I = w().ITEMS || {};
  const rows = (src) => {
    const all = Object.keys(src || {})
      .filter((id) => Number(src[id]) > 0 && I[id])
      .map((id) => ({ id, qty: Math.floor(Number(src[id])), name: itemName(id) }))
      .filter((r) => !needle || r.name.toLowerCase().indexOf(needle) !== -1 || r.id.indexOf(needle) !== -1)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { shown: all.slice(0, MAX_ROWS), total: all.length };
  };
  const depot = bankItems(G);
  const bag = rows((G && G.inventory) || {});
  const vault = rows(depot);
  const capFn = w().bankCap, usedFn = w().bankUsed;
  return {
    search: String(o.search || ''),
    bag: bag.shown, bagMore: Math.max(0, bag.total - bag.shown.length),
    depot: vault.shown, depotMore: Math.max(0, vault.total - vault.shown.length),
    bagUsed: (typeof usedFn === 'function') ? usedFn() : Object.keys((G && G.inventory) || {}).length,
    bagCap: (typeof capFn === 'function') ? capFn() : null,
    depotStacks: Object.keys(depot).length,
    /* The server's own Depot ceiling, known ONLY if it has stated one. */
    depotCap: (G && Number(G._depotCap) > 0) ? Math.floor(Number(G._depotCap)) : null,
    projected: lastBankFoldMode() === 'absolute',
    busy: !!o.busy,
  };
}

/** "3 / 100 slots" for the bag — the number `hr_bank_move` enforces on a
 *  withdraw — and the Depot's stack count beside it. */
export function bagCapacityLine(view) {
  const v = view || {};
  if (!(Number(v.bagCap) > 0)) return fmt(v.bagUsed) + ' slots used';
  return fmt(v.bagUsed) + ' / ' + fmt(v.bagCap) + ' slots';
}
export function depotCapacityLine(view) {
  const v = view || {};
  if (Number(v.depotCap) > 0) return fmt(v.depotStacks) + ' / ' + fmt(v.depotCap) + ' stacks';
  return fmt(v.depotStacks) + ' stack' + (Number(v.depotStacks) === 1 ? '' : 's') + ' stored';
}

function rowHtml(r, dir, busy) {
  const qtys = [1, 10, r.qty].filter((q, i, a) => q > 0 && a.indexOf(q) === i);
  const label = dir === 'deposit' ? 'Store' : 'Take';
  const btns = qtys.map((q) => '<button class="bp-move" ' + (busy ? 'disabled ' : '')
    + 'data-bank-move="' + dir + '" data-bank-item="' + esc(r.id) + '" data-bank-qty="' + q + '">'
    + (q === r.qty && r.qty > 1 ? 'All' : String(q)) + '</button>').join('');
  return '<div class="bp-row"><span class="bp-ico">' + itemIcon(r.id, 22) + '</span>'
    + '<span class="bp-nm">' + esc(r.name) + '</span>'
    + '<span class="bp-qty">' + fmt(r.qty) + '</span>'
    + '<span class="bp-acts" aria-label="' + label + '">' + btns + '</span></div>';
}

function colHtml(title, sub, rows, more, dir, busy, emptyLine) {
  const body = rows.length
    ? rows.map((r) => rowHtml(r, dir, busy)).join('')
      + (more ? '<div class="bp-more">+' + fmt(more) + ' more — search to narrow</div>' : '')
    : '<div class="bp-empty">' + esc(emptyLine) + '</div>';
  return '<div class="bp-col"><div class="bp-col-h"><b>' + esc(title) + '</b>'
    + '<span class="bp-cap">' + esc(sub) + '</span></div>'
    + '<div class="bp-list">' + body + '</div></div>';
}

/** THE WHOLE PANEL BODY, from a view. Pure. */
export function bankPanelHtml(view) {
  const v = view || {};
  const depotEmpty = v.projected
    ? 'Your Depot is empty — store something from your bag.'
    : 'The realm has not sent your Depot yet — reload if this persists.';
  return '<div class="bp-head"><h3>Depot</h3>'
    + '<div class="bp-sub">Store what you are not carrying. The Depot is kept by the realm, '
    + 'not by this device — every move is the server\'s.</div></div>'
    + '<input type="text" class="bp-search" id="bp-search" placeholder="Search your items..." '
    + 'value="' + esc(v.search) + '" />'
    + '<div class="bp-cols">'
    + colHtml('Bag', bagCapacityLine(v), v.bag || [], v.bagMore, 'deposit', v.busy,
      'Nothing in your bag matches.')
    + colHtml('Depot', depotCapacityLine(v), v.depot || [], v.depotMore, 'withdraw', v.busy,
      depotEmpty)
    + '</div>';
}

/* ── THE SHEET ────────────────────────────────────────────────────────────────
   `qm-overlay` / `qm-modal` is the game's existing modal chrome (openBankModal,
   the quest modal), so the Depot inherits the same backdrop, the same close
   affordance and the same stacking instead of inventing a third dialog. */
function css() {
  return [
    '#' + OVERLAY_ID + ' .qm-modal{max-width:720px;width:min(720px,94vw)}',
    '.bp-head h3{margin:0 0 2px;font-family:var(--f-display)}',
    '.bp-sub{font-size:calc(13px * var(--ui-scale, 1));color:var(--ink-3);margin-bottom:8px}',
    '.bp-search{width:100%;box-sizing:border-box;margin-bottom:10px;padding:7px 9px;'
      + 'border:1px solid var(--line-soft);border-radius:8px;background:var(--bg-card);color:var(--ink)}',
    '.bp-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.bp-col{min-width:0;display:flex;flex-direction:column}',
    '.bp-col-h{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;font-family:var(--f-label)}',
    '.bp-cap{margin-left:auto;font-size:calc(13px * var(--ui-scale, 1));color:var(--ink-3);'
      + 'font-variant-numeric:tabular-nums}',
    '.bp-list{max-height:46vh;overflow:auto;border:1px solid var(--line-soft);border-radius:8px}',
    '.bp-row{display:flex;align-items:center;gap:7px;padding:5px 7px;min-width:0}',
    '.bp-row + .bp-row{border-top:1px solid var(--line-soft)}',
    '.bp-ico{display:flex;width:22px;flex:0 0 22px}',
    '.bp-nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
      + 'font-size:calc(14px * var(--ui-scale, 1))}',
    '.bp-qty{color:var(--gold-2);font-variant-numeric:tabular-nums;font-size:calc(13px * var(--ui-scale, 1))}',
    '.bp-acts{display:flex;gap:3px;flex:0 0 auto}',
    '.bp-move{font-family:var(--f-label);font-size:calc(12px * var(--ui-scale, 1));padding:2px 7px;'
      + 'border:1px solid var(--line-soft);border-radius:6px;background:var(--bg-card);'
      + 'color:var(--ink-2);cursor:pointer}',
    '.bp-move:hover:not([disabled]){color:var(--gold);border-color:var(--gold-2)}',
    '.bp-move[disabled]{opacity:.5;cursor:default}',
    '.bp-empty,.bp-more{padding:9px 8px;font-size:calc(13px * var(--ui-scale, 1));color:var(--ink-3)}',
    '.bp-more{font-style:italic}',
    /* Mobile: the canonical rail query (CLAUDE.md §7) — one column, shorter lists. */
    '@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px){'
      + '.bp-cols{grid-template-columns:1fr;gap:10px}.bp-list{max-height:30vh}}',
  ].join('');
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css();
  (document.head || document.documentElement).appendChild(el);
}

let search = '';
let busy = false;

export function closeDepot() {
  const el = (typeof document !== 'undefined') && document.getElementById(OVERLAY_ID);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

/** Repaint from G. Called after every settled move and after a search keystroke;
 *  the caret is restored because the list rebuild replaces the input. */
export function repaintDepot() {
  const el = (typeof document !== 'undefined') && document.getElementById(OVERLAY_ID);
  if (!el) return false;
  const body = el.querySelector('.bp-body');
  if (!body) return false;
  body.innerHTML = bankPanelHtml(bankPanelView(w().G || {}, { search, busy }));
  const inp = body.querySelector('#bp-search');
  if (inp && search) { try { inp.focus(); inp.setSelectionRange(search.length, search.length); } catch (e) {} }
  return true;
}

export function openDepot() {
  if (typeof document === 'undefined') return false;
  ensureStyle();
  closeDepot();
  search = ''; busy = false;
  const overlay = document.createElement('div');
  overlay.className = 'qm-overlay';
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = '<div class="qm-modal bank-panel" style="position:relative">'
    + '<button class="qm-close" aria-label="Close">&times;</button>'
    + '<div class="bp-body">' + bankPanelHtml(bankPanelView(w().G || {}, { search, busy })) + '</div>'
    + '</div>';
  overlay.querySelector('.qm-close').addEventListener('click', closeDepot);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDepot(); });
  document.body.appendChild(overlay);
  /* The vault the player is about to act on should be the realm's CURRENT one,
     not whatever the last 90-second settle left behind. Non-fatal: the panel is
     already drawn from the last envelope and repaints when this lands. */
  try {
    const A = w().HearthriseAccrual;
    if (A && typeof A.requestAccrual === 'function') {
      A.requestAccrual({ force: true }).then(() => repaintDepot()).catch(() => {});
    }
  } catch (e) {}
  return true;
}

/** ONE gesture: send the intent, let the envelope repaint, say what happened.
 *  `busy` is a re-entrancy fuse, not a prediction — two taps on "All" must not
 *  send two moves of the same stack (the second would be refused
 *  `insufficient_item`, which reads as a bug to the player). */
export async function depotMove(item, qty, dir) {
  if (busy) return { ok: false, error: 'busy' };
  busy = true; repaintDepot();
  let out = null;
  try {
    out = await bankMoveSettled(item, qty, dir);
  } finally { busy = false; }
  const res = (out && out.res) || { ok: false, error: 'transport' };
  if (res.ok === true) {
    const verb = dir === 'withdraw' ? 'Took' : 'Stored';
    say(verb + ' ' + fmt(res.qty) + '× ' + itemName(res.item), 'loot');
  } else {
    /* The server's own ceiling, learned the only honest way: it said it. */
    if (res.error === 'bank_full' && Number(res.cap) > 0 && w().G) w().G._depotCap = Math.floor(Number(res.cap));
    say(bankMoveRefusalText(res, { itemName: itemName(item) }), 'kill');
  }
  repaintDepot();
  try { if (typeof w().renderInvFancy === 'function') w().renderInvFancy(); } catch (e) {}
  return res;
}

function say(msg, kind) {
  try { if (typeof w().notify === 'function') w().notify(msg, kind || 'info'); } catch (e) {}
}

/**
 * Publish for the classic-script inventory screen (it cannot import) and install
 * ONE delegated listener. Delegated because the panel rebuilds its own body on
 * every move and every keystroke — a bound handler would have to be re-attached
 * each time, and the one that was missed is the tap that does nothing.
 */
export function setupBankPanel() {
  if (typeof window === 'undefined') return;
  window.HearthriseDepot = {
    open: openDepot, close: closeDepot, repaint: repaintDepot, move: depotMove,
    bankPanelView, bankPanelHtml, bagCapacityLine, depotCapacityLine, MAX_ROWS,
  };
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest('[data-bank-move]');
    if (!el || !document.getElementById(OVERLAY_ID)) return;
    e.preventDefault();
    depotMove(el.getAttribute('data-bank-item'), Number(el.getAttribute('data-bank-qty')),
      el.getAttribute('data-bank-move'));
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || el.id !== 'bp-search' || !document.getElementById(OVERLAY_ID)) return;
    search = String(el.value || '');
    repaintDepot();
  });
}
