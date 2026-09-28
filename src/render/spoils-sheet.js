// ============================================================
// src/render/spoils-sheet.js — SPOILS OF THE DEEP: the dungeon settle, told.
//
// Publishes window.HearthriseSpoils = { open(v), note(v) }, both fed the ONE
// verdict src/net/dungeon-settle.js returns for hr_dungeon_settle.
//   note(v) — the Chronicle rows for a settled run, and one 'loot' toast
//             only when the sheet will not open (the sheet IS the announcement).
//   open(v) — the sheet, for an Auto clear only: the manual and scavenger
//             summaries are already on screen and carry the same rows.
// willOpen(v) is the ONE predicate both read, so they cannot disagree.
//
// EVERY NUMBER IS THE ANSWER'S (CLAUDE.md §6): the rows are v.body.settled
// through window.dungeonSettleRowHtml, the purse is v.body.state, the key count
// is v.body.inventory, the re-entry clock is v.body.dungeon_cooldowns. Nothing
// here reads G for a number — gateItemCount/keyHeld are stale after a settle —
// and the only write is the Chronicle's own record(). Odds come from the loot
// catalogue (window.DUNGEONS, pinned to hr_dungeon_loot), never invented.
//
// Layout is the .hr-scrim/.hr-sheet primitive; skin is src/styles/spoils.css.
// Escape presses the Done button (src/render/modal-sheet.js).
// ============================================================
import { DUNGEON_CLEAR_LORE } from '../data/dungeon-lore.js?v=559';

function esc(x) {
  return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The settled record, or null for anything that is not a fresh settle. */
function settledOf(v) {
  return (v && v.outcome === 'settled' && v.body && v.body.settled) || null;
}

function dungeonOf(s) {
  const D = window.DUNGEONS || {};
  return (s && s.dungeon && D[s.dungeon]) || null;
}

const itemName = (id) => (window.ITEMS && window.ITEMS[id] && window.ITEMS[id].n) || id;
/* 'the Crypt of Bones', and 'the Voidbringer' rather than 'the The Voidbringer'. */
const theName = (name) => 'the ' + String(name).replace(/^The /, '');

const pending = () => {
  const B = window.HearthriseBalance;
  return B && typeof B.countMarkup === 'function' ? B.countMarkup(null) : '—';
};

/* An Auto clear with no tutorial, no Spoils sheet and no other sheet up. */
function willOpen(v) {
  const s = settledOf(v);
  if (!s || s.mode !== 'auto') return false;
  if (document.querySelector('.ftue-root, .spoils-scrim')) return false;
  const S = window.HearthriseSheet;
  return !(S && typeof S.anyOpen === 'function' && S.anyOpen());
}

function note(v) {
  const s = settledOf(v);
  if (!s) return;
  const d = dungeonOf(s);
  const name = d ? d.name : (s.dungeon || 'The dungeon');
  const k = Object.keys(s.items || {}).length;
  if (!willOpen(v) && typeof window.notify === 'function') {
    window.notify(name + ' cleared — ' + k + (k === 1 ? ' find' : ' finds') + ' and ' + (s.scrip || 0) + ' Dungeon Scrip', 'loot');
  }
  const C = window.HearthriseChronicle;
  if (!C || typeof C.record !== 'function' || !s.dungeon) return;
  C.record('dungeon', 'Cleared ' + theName(name), { id: 'dungeon:' + s.dungeon });
  const D = window.HearthriseCore && window.HearthriseCore.drops;
  const rareMax = D && D.DROP_BAND_MAX ? D.DROP_BAND_MAX.uncommon : 0;
  for (const id of Object.keys(s.items || {})) {
    const row = ((d && d.loot) || []).find((l) => l.id === id);
    if (row && row.chance > 0 && row.chance <= rareMax) {
      C.record('dungeon', 'Brought the ' + itemName(id) + ' out of ' + theName(name), { id: 'dungeon-find:' + id });
    }
  }
}

/* The facts under the rows: purse, key, re-entry — each from the answer. */
function factsHtml(v, s, id) {
  const b = v.body;
  const scrip = b.state && b.state.dungeon_scrip;
  const out = ['<p class="spoils-fact">Your purse: <b>'
    + (typeof scrip === 'number' && Number.isFinite(scrip) && scrip >= 0 ? esc(scrip) : pending())
    + '</b> Dungeon Scrip</p>'];
  if (s.key_spent) {
    const inv = b.inventory;
    const plain = inv && typeof inv === 'object' && !Array.isArray(inv);
    /* An id the envelope omits is a real zero: the bag projection lists what you hold. */
    const left = plain ? esc(Number(inv[s.key_spent]) || 0) : pending();
    out.push('<p class="spoils-fact">Spent one ' + esc(itemName(s.key_spent)) + ' · <b>' + left + '</b> left</p>');
  }
  const cd = b.dungeon_cooldowns && b.dungeon_cooldowns[id];
  const at = cd ? Date.parse(cd.auto) : NaN;
  const ms = at - Date.now();
  if (Number.isFinite(ms) && ms > 0) {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    out.push('<p class="spoils-fact">Opens to you again in <b>' + h + 'h ' + m + 'm</b></p>');
  }
  return out.join('');
}

function open(v) {
  if (!willOpen(v)) return;
  const s = settledOf(v);
  const d = dungeonOf(s);
  const id = s.dungeon;
  const name = d ? d.name : (id || 'The dungeon');
  const lore = DUNGEON_CLEAR_LORE[id];
  const scrim = document.createElement('div');
  scrim.className = 'hr-scrim spoils-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-labelledby', 'spoils-title');
  scrim.innerHTML = '<div class="hr-sheet spoils-sheet">'
    + '<div class="hr-sheet-head spoils-head"><h3 id="spoils-title" class="spoils-title">' + esc(name) + ' — cleared</h3>'
    + (d && d.boss ? '<p class="spoils-boss">' + esc(d.boss.name + ', ' + d.boss.title + ', has fallen.') + '</p>' : '')
    + '</div>'
    + '<div class="hr-sheet-body spoils-body">'
    + (lore ? '<p class="spoils-lore">' + esc(lore) + '</p>' : '')
    + '<div class="spoils-rows">' + window.dungeonSettleRowHtml(v) + '</div>'
    + '<div class="spoils-facts">' + factsHtml(v, s, id) + '</div>'
    + '</div>'
    + '<div class="hr-sheet-foot spoils-foot">'
    + '<button type="button" class="spoils-btn" data-spoils-qm>Quartermaster</button>'
    + '<button type="button" class="spoils-btn spoils-btn-primary" data-hr-dismiss>Done</button>'
    + '</div></div>';
  scrim.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-spoils-qm], [data-hr-dismiss]');
    if (!b) return;
    scrim.remove();
    if (b.hasAttribute('data-spoils-qm') && typeof window.openQuartermaster === 'function') window.openQuartermaster();
  });
  document.body.appendChild(scrim);
  const done = scrim.querySelector('[data-hr-dismiss]');
  if (done) done.focus();
}

export function setupSpoils() {
  window.HearthriseSpoils = { open, note };
}
