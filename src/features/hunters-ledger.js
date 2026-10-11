// ════════════════════════════════════════════════════════════════════════
// src/features/hunters-ledger.js — THE HUNTER'S LEDGER
//
// Three surfaces for the two server-owned kill ladders (Bestiary charms per
// class, trophies per monster), which until now lived only inside the Bestiary:
//   HOME CARD    the nearest charm and the nearest trophy, or 'trophy ready'.
//   FIGHT RAIL   'Charm & trophy' for the foe on screen (live or in preview).
//   THE MOMENT   a one-time 'A charm is earned' sheet when a class ranks up.
//
// ── NOTHING HERE OWNS A NUMBER (CLAUDE.md §1, §6) ───────────────────────────
// Every count is read through window.HearthriseCharms / HearthriseTrophies,
// the single owners of the server mirrors; this module never reads G.bestiary
// (the residue copy) or the `_bestiary*` scratch keys, and writes nothing to G.
// Unknown is never zero: before the server states the counters, every value
// renders the pending mark. The counts lag one settle (the engine reads the
// bestiary block before applying the settle's kills), so a moment is late,
// never early.
//
// ── THE MOMENT'S RECORD IS DISPLAY-ONLY ─────────────────────────────────────
// 'hearthrise:charm-seen' (storage seam) remembers the ranks last shown, keyed
// uid:slot, so a slot switch or a second account in the same browser seeds its
// own record instead of replaying ranks earned weeks ago. It gates nothing.
// The first sight of a key seeds silently; the sheet opens only on a rise, only
// when no other sheet or the FTUE is up, and the suite parks the watcher.
// ════════════════════════════════════════════════════════════════════════

import { CHARM_CLASS_LORE, CHARM_RANK_LORE } from '../data/charm-lore.js?v=565';
import { CHARM_RANKS, CHARM_RANK_NAMES, MAX_CHARM_RANK } from '../data/bestiary-charms.js?v=565';
import { charmRankAt, nextCharmAt, charmRowOfRank } from '../core/charms.js?v=565';
import { TROPHY_STAGES, TROPHY_STAGE_NAMES, nextTrophyAt } from '../data/bestiary.js?v=565';
import { MONSTER_CLASSES, classOfMonster } from '../core/bane.js?v=565';

const SEEN_KEY = 'hearthrise:charm-seen';
const MAX_KEYS = 10;
const SHEET_ID = 'hr-charm-moment';
const PENDING = '<span class="bal-pending" role="status" title="Waiting for the server">—</span>';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n).toLocaleString();
const kills = (n) => num(n) + (Number(n) === 1 ? ' kill' : ' kills');

function classLabel(cls) {
  const C = window.HearthriseCharms;
  if (C && typeof C.classLabel === 'function') return C.classLabel(cls);
  return String(cls).replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
function monsterName(id) {
  const m = (window.MONSTERS || {})[id];
  return (m && m.name) || String(id);
}
const rankName = (row) => (row && CHARM_RANK_NAMES[row.id]) || '';
const stageName = (row) => (row && TROPHY_STAGE_NAMES[row.id]) || '';

/** The keys of a {cls: n} map in bane taxonomy order, then any the taxonomy lacks. */
function classOrder(map) {
  const keys = Object.keys(map || {});
  return [...MONSTER_CLASSES.filter((c) => keys.includes(c)), ...keys.filter((c) => !MONSTER_CLASSES.includes(c))];
}

/** The server's ladders as the renderer needs them, or null while unknown. */
export function snapshot() {
  const C = window.HearthriseCharms, T = window.HearthriseTrophies;
  if (!C || typeof C.countersKnown !== 'function' || !C.countersKnown()) return null;
  const classes = {};
  for (const row of C.charmClasses()) classes[row.cls] = row.kills;
  const monsters = {};
  let readyId = null, readyStage = 0;
  const M = window.MONSTERS || {};
  for (const id of Object.keys(M)) {
    const n = T ? T.killsOfMonster(id) : 0;
    if (n > 0) monsters[id] = n;
    if (readyId || !T || !T.claimsKnown()) continue;
    const held = T.stageOfMonster(id);
    for (let s = 1; s <= held; s += 1) {
      if (T.isClaimed(id, s)) continue;
      if (T.isClaimable(id, s)) { readyId = id; readyStage = s; }
      break;
    }
  }
  return { known: true, classes, monsters, readyId, readyStage };
}

/** The nearest charm: the non-max class closest (by share) to its next rung. */
export function charmRow(classes) {
  const order = classOrder(classes);
  if (!order.length) return null;
  let best = null;
  for (const cls of order) {
    const n = Number(classes[cls]) || 0;
    const nx = nextCharmAt(n);
    if (!nx) continue;
    const share = n / nx.at;
    if (!best || share > best.share) best = { cls, nx, share };
  }
  if (!best) {
    const cls = order[0];
    return { cls, title: classLabel(cls) + ' charm', sub: rankName(charmRowOfRank(MAX_CHARM_RANK)) + ' — the last charm there is', pct: 100 };
  }
  return {
    cls: best.cls, title: classLabel(best.cls) + ' charm',
    sub: kills(best.nx.remaining) + ' to ' + (CHARM_RANK_NAMES[best.nx.id] || ''),
    pct: Math.round(best.share * 100),
  };
}

/** The nearest trophy, or the one waiting to be claimed. */
export function trophyRow(monsters, readyId, readyStage) {
  if (readyId) {
    const row = TROPHY_STAGES[(readyStage || 1) - 1] || TROPHY_STAGES[0];
    return { title: monsterName(readyId) + ' trophy ready', sub: stageName(row) + ' — claim it in the Bestiary', ready: true };
  }
  let best = null;
  for (const id of Object.keys(monsters || {})) {
    const n = Number(monsters[id]) || 0;
    const nx = n > 0 ? nextTrophyAt(n) : null;
    if (!nx) continue;
    const share = n / nx.row.at;
    if (!best || share > best.share) best = { id, nx, share };
  }
  if (!best) return null;
  return {
    title: monsterName(best.id) + ' trophy',
    sub: kills(best.nx.remaining) + ' to ' + stageName(best.nx.row),
    pct: Math.round(best.share * 100),
  };
}

function rowHtml(r) {
  return '<div class="hl-row">'
    + '<div class="hd-mile-title">' + esc(r.title) + '</div>'
    + '<div class="hd-mile-sub">' + esc(r.sub) + '</div>'
    + (r.ready
      ? '<button type="button" class="hd-cta ghost" data-hl-open="bestiary">Claim in the Bestiary</button>'
      : '<div class="hd-bar" style="--accent:var(--gold)"><i style="width:' + Math.max(0, Math.min(100, r.pct)) + '%"></i></div>')
    + '</div>';
}

/** Home's status-rail card. Unknown ⇒ pending marks, never 0; known and empty ⇒ ''. */
export function cardHtml(snap) {
  const head = '<div class="hd-h"><h3>Hunter\'s ledger</h3><a data-hl-open="bestiary">Bestiary →</a></div>';
  if (!snap) {
    return '<div class="hl-card">' + head + '<div class="hd-card hl-rows">'
      + '<div class="hl-row"><div class="hd-mile-title">Nearest charm</div><div class="hd-mile-sub">' + PENDING + '</div></div>'
      + '<div class="hl-row"><div class="hd-mile-title">Nearest trophy</div><div class="hd-mile-sub">' + PENDING + '</div></div>'
      + '</div></div>';
  }
  if (!Object.keys(snap.classes || {}).length) return '';
  const rows = [charmRow(snap.classes), trophyRow(snap.monsters, snap.readyId, snap.readyStage)].filter(Boolean);
  return '<div class="hl-card">' + head + '<div class="hd-card hl-rows">' + rows.map(rowHtml).join('') + '</div></div>';
}

/** The Fight rail's two lines for one foe. '' without a foe. */
export function railHtml(foeId, snap) {
  if (!foeId) return '';
  const cls = classOfMonster((window.MONSTERS || {})[foeId]);
  const label = cls ? classLabel(cls) + ' charm' : '';
  const name = monsterName(foeId) + ' trophy';
  const line = (a, b) => '<p class="hl-rail-line">' + esc(a) + ' · ' + b + '</p>';
  if (!snap) return (label ? line(label, PENDING) : '') + line(name, PENDING);
  let out = '';
  if (label) {
    const n = Number(snap.classes[cls]) || 0;
    const nx = nextCharmAt(n);
    out += line(label, esc(nx
      ? num(nx.remaining) + ' to ' + CHARM_RANK_NAMES[nx.id]
      : rankName(charmRankAt(n)) + ', the last'));
  }
  const m = Number(snap.monsters[foeId]) || 0;
  const tx = nextTrophyAt(m);
  out += line(name, esc(tx ? num(tx.remaining) + ' to ' + stageName(tx.row) : stageName(TROPHY_STAGES[TROPHY_STAGES.length - 1]) + ', the last'));
  return out;
}

/** [{cls, from, rank}] for every class whose rank rose, in bane order. */
export function rankUpsBetween(prev, next) {
  if (!prev) return [];
  const out = [];
  for (const cls of classOrder(next)) {
    const from = Number(prev[cls]) || 0, rank = Number(next[cls]) || 0;
    if (rank > from) out.push({ cls, from, rank });
  }
  return out;
}

/** The effect lines, derived from the ladder rows: a reveal newly true, a drop above 1. */
function effectLines(label, from, rank) {
  const row = charmRowOfRank(rank);
  const before = charmRowOfRank(from);
  const out = [];
  if (row && row.reveal && !(before && before.reveal)) {
    const nextRow = CHARM_RANKS[rank];
    out.push('The Bestiary now shows what they are weak to.'
      + (!(row.drop > 1) && nextRow && nextRow.drop > 1 ? ' The next charm makes them drop their loot a little more often.' : ''));
  }
  if (row && row.drop > 1) out.push(label + ' foes now drop their loot a little more often, watching or away.');
  return out;
}

/** The moment's body: one block per rank-up. */
export function momentHtml(ups, classes) {
  return (ups || []).map((u) => {
    const label = classLabel(u.cls);
    const row = charmRowOfRank(u.rank);
    const nextRow = u.rank < MAX_CHARM_RANK ? CHARM_RANKS[u.rank] : null;
    const have = classes && classes[u.cls] != null ? Number(classes[u.cls]) : null;
    const next = nextRow
      ? 'Next: ' + CHARM_RANK_NAMES[nextRow.id] + ' at ' + num(nextRow.at) + ' ' + label + ' kills'
        + (have != null ? ' — you have ' + num(have) + '.' : '.')
      : 'This is the last charm there is.';
    return '<section class="hl-moment-block">'
      + '<h3 class="hl-moment-title">' + esc(label + ' · ' + rankName(row)) + '</h3>'
      + '<p class="hl-moment-lore"><i>' + esc(CHARM_RANK_LORE[row && row.id] || '') + '</i></p>'
      + '<p class="hl-moment-lore">' + esc(CHARM_CLASS_LORE[u.cls] || '') + '</p>'
      + effectLines(label, u.from, u.rank).map((t) => '<p class="hl-moment-effect">' + esc(t) + '</p>').join('')
      + '<p class="hl-moment-next">' + esc(next) + '</p>'
      + '</section>';
  }).join('');
}

const sameRanks = (a, b) => {
  const ka = Object.keys(a || {}), kb = Object.keys(b || {});
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

/** THE WATCHER, pure over its deps. Returns what it did. */
export function tick(deps) {
  if (deps.parked) return 'parked';
  if (!deps.known || !deps.uid) return 'unknown';
  const key = deps.uid + ':' + deps.slot;
  const rec = deps.store.getJSON(SEEN_KEY, {}) || {};
  const write = () => {
    delete rec[key];
    rec[key] = deps.ranks;
    const keys = Object.keys(rec);
    for (let i = 0; i < keys.length - MAX_KEYS; i += 1) delete rec[keys[i]];
    deps.store.setJSON(SEEN_KEY, rec);
  };
  if (!rec[key]) { write(); return 'seeded'; }
  const ups = rankUpsBetween(rec[key], deps.ranks);
  if (!ups.length) {
    if (!sameRanks(rec[key], deps.ranks)) write();
    return 'quiet';
  }
  let busy = true;
  try { busy = !!deps.busy(); } catch (e) { busy = true; }
  if (busy) return 'waiting';
  deps.open(ups);
  write();
  return 'opened';
}

function openMoment(ups) {
  const snap = snapshot();
  /* Already up (busy() excludes it): a further rank-up joins it rather than being lost. */
  const body = document.querySelector('#' + SHEET_ID + ' .hr-sheet-body');
  if (body) { body.insertAdjacentHTML('beforeend', momentHtml(ups, snap && snap.classes)); return; }
  const scrim = document.createElement('div');
  scrim.className = 'hl-scrim hr-scrim';
  scrim.id = SHEET_ID;
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-labelledby', 'hl-moment-h');
  scrim.innerHTML = '<div class="hl-sheet hr-sheet">'
    + '<div class="hr-sheet-head"><div class="hl-eyebrow">A charm is earned</div>'
    + '<h2 class="hl-moment-h" id="hl-moment-h">The Hunter\'s Ledger</h2></div>'
    + '<div class="hr-sheet-body">' + momentHtml(ups, snap && snap.classes) + '</div>'
    + '<div class="hr-sheet-foot hl-moment-foot">'
    + '<button type="button" class="hl-btn hl-btn-primary" data-hl-moment="open">Open the Bestiary</button>'
    + '<button type="button" class="hl-btn" data-hl-moment="close" data-hr-dismiss>Close</button>'
    + '</div></div>';
  scrim.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-hl-moment]');
    if (!b) return;
    scrim.remove();
    if (b.getAttribute('data-hl-moment') === 'open' && typeof window.openBestiary === 'function') window.openBestiary();
  });
  document.body.appendChild(scrim);
  const primary = scrim.querySelector('[data-hl-moment="open"]');
  if (primary) primary.focus();
}

function liveRanks() {
  const out = {};
  for (const row of window.HearthriseCharms.charmClasses()) if (row.rank > 0) out[row.cls] = row.rank;
  return out;
}

function ensureRailHost() {
  let host = document.getElementById('fs-hl');
  if (host) return host;
  const rail = document.getElementById('fs-manage');
  if (!rail) return null;
  const block = document.createElement('section');
  block.className = 'fsm-block';
  block.id = 'fsm-ledger';
  block.hidden = true;
  block.innerHTML = '<div class="fsm-head"><span>Charm &amp; trophy</span></div><div class="hl-rail" id="fs-hl"></div>';
  const drops = document.getElementById('fsm-drops');
  const before = drops && drops.closest('.fsm-block');
  if (before && before.parentNode === rail) rail.insertBefore(block, before);
  else rail.appendChild(block);
  return document.getElementById('fs-hl');
}

function paintRail() {
  const host = ensureRailHost();
  if (!host) return;
  const G = window.G || {};
  const CS = window.HearthriseCombatScreens;
  const foe = G.activeMonster || (CS && CS.previewId) || null;
  const html = foe ? railHtml(foe, snapshot()) : '';
  if (host.__hlSig !== html) { host.__hlSig = html; host.innerHTML = html; }
  const block = host.parentNode;
  if (block && block.hidden === !!html) block.hidden = !html;
}

let parked = false;

function liveTick() {
  if (parked) return 'parked';
  try { paintRail(); } catch (e) { /* display only */ }
  const C = window.HearthriseCharms;
  const known = !!(C && typeof C.countersKnown === 'function' && C.countersKnown());
  const A = window.HearthriseAuth, P = window.HearthriseProfile;
  return tick({
    parked,
    known,
    uid: known && A && typeof A.currentUserId === 'function' ? A.currentUserId() : null,
    slot: P && typeof P.activeSlot === 'function' ? P.activeSlot() : 0,
    ranks: known ? liveRanks() : {},
    store: window.HearthriseStorage,
    busy: () => !!document.querySelector('.ftue-root')
      || window.HearthriseSheet.anyOpen(document.getElementById(SHEET_ID)),
    open: openMoment,
  });
}

export function setupHuntersLedger() {
  window.HearthriseHuntersLedger = {
    card: () => cardHtml(snapshot()),
    charmRow, trophyRow, cardHtml, railHtml, rankUpsBetween, momentHtml, tick,
    __setPollEnabled(on) { const was = !parked; parked = !on; return was; },
  };
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-hl-open="bestiary"]');
    if (a && typeof window.openBestiary === 'function') window.openBestiary();
  });
  setInterval(() => { try { liveTick(); } catch (e) { /* display only */ } }, 1000);
}
