// ════════════════════════════════════════════════════════════════════════
// src/render/bestiary-charms.js — the CLIENT half of Bestiary Charms, phase 1.
//
// Two jobs and nothing else:
//   1. MIRROR the server's `bestiary.kills_by_class` block off the accrual
//      envelope into `G._bestiaryCharms` — scratch, `_`-prefixed, never saved.
//   2. ANSWER questions about it for the renderer: what rank is this class, how
//      many kills to the next charm, may this class's element weakness be
//      printed.
//
// It computes no authoritative number. Every rank is DERIVED from the server's
// own counters on every read by src/core/charms.js, per the Game Designer's
// 2026-09-13 ruling — there is no stored rank anywhere in this build.
//
// ── WHY `G._bestiaryCharms` AND NOT `G.bestiary` ────────────────────────────
// `G.bestiary` is a RESIDUE FIELD (`RESIDUE_FIELDS` in src/net/client-state.js)
// — a client-written, locally-persisted `{monsterId:{kills,firstKill}}` map that
// legacy.js's killMonster wrapper increments. Reading a capability off it would
// be the residue-ahead bug class verbatim (CLAUDE.md §6): a local counter that
// can run AHEAD of the server would hand a player a charm the server does not
// believe in, and — once phases 2/3 arm the multipliers — a damage bonus the
// away replay would not pay. So the two never mix. This module reads the SERVER
// block only, writes it to a `_`-prefixed scratch key that is by definition not
// persisted, and FAILS SAFE TO RANK 0 whenever that key is absent: a fresh tab
// before the first envelope, a signed-out session, and a server without the
// projection all show "not studied", never a rank.
//
// ── WHY IT IS MIRRORED FROM `settle()` AND NOT `applyEnvelopeState` ─────────
// `applyEnvelopeState` runs only on `accrued:true`. The COMMON boot response
// for an idle character is `accrued:false, reason:'idle'` — so a mirror sited
// there would be invisible to exactly the player who reloads and opens the
// Bestiary, which is the "forgotten on reload" class. src/net/accrue.js
// `settle()` is the one funnel every answered accrual passes, accrued or not.
//
// ── PRESENTATION IS TOKENS AND ATLAS GLYPHS ONLY ────────────────────────────
// No hardcoded colour and no emoji: the badge is `uiMedal`, the threshold
// affordance `uiTarget` and the revealed element `uiSpark`, all through
// `window.HR.icon`, and every colour is a `var(--…)` token in
// src/styles/legacy.css.
// ════════════════════════════════════════════════════════════════════════

import { MONSTER_CLASSES, classOfMonster } from '../core/bane.js?v=543';
import {
  charmIndex, charmRankAt, nextCharmAt, charmRevealsAt, charmRowOfRank,
} from '../core/charms.js?v=543';
import { CHARM_RANK_NAMES, MAX_CHARM_RANK } from '../data/bestiary-charms.js?v=543';

const CLASS_SET = new Set(MONSTER_CLASSES);

const w = () => (typeof window !== 'undefined' ? window : {});
const g = () => w().G || {};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gly = (key, px) => {
  const W = w();
  return (typeof W._hrGly === 'function') ? W._hrGly(key, px || 13) : '';
};

/**
 * Adopt the envelope's `bestiary` block.
 *
 * A missing key is a NO-OP that leaves any previously mirrored counters ALONE
 * rather than clearing them: the intent responses (equip, shop_buy, …) carry no
 * bestiary block, and treating their silence as "zero kills" would make a rank
 * badge flicker off every time the player bought a loaf of bread. Absence is
 * not a claim — the same rule the skills merge follows.
 *
 * Keys are validated against the eleven-class taxonomy and values coerced to
 * non-negative integers, so a malformed or hostile block cannot put a junk
 * class on the screen or a rank on a class that does not exist.
 *
 * @returns a receipt, so the suite asserts the rule and not a rendered string.
 */
export function noteEnvelope(res) {
  const out = { noted: false, reason: '', classes: 0 };
  const src = (res && typeof res === 'object' && res.bestiary) || null;
  if (!src || typeof src !== 'object') { out.reason = 'no_key'; return out; }
  const raw = src.kills_by_class;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { out.reason = 'no_counters'; return out; }
  const clean = Object.create(null);
  for (const k of Object.keys(raw)) {
    if (!CLASS_SET.has(k)) continue;
    const n = Number(raw[k]);
    if (!Number.isFinite(n) || n <= 0) continue;
    clean[k] = Math.floor(n);
    out.classes += 1;
  }
  const G = g();
  /* The WHOLE scratch object is replaced, never merged: this block is the
     server's complete statement of the character's kill counters, so a class
     that has dropped out of it (a wipe, a different slot, a different account
     in the same tab) must not survive as a stale rank. */
  G._bestiaryCharms = { killsByClass: clean, index: charmIndex(clean) || Object.create(null) };
  out.noted = true;
  return out;
}

/** The mirrored counters, or null. The single read point — fail-safe to null. */
function counters() {
  const b = g()._bestiaryCharms;
  return (b && b.killsByClass && typeof b.killsByClass === 'object') ? b.killsByClass : null;
}

/** Lifetime kills in a class, per the SERVER. 0 when unknown. */
export function killsOfClass(cls) {
  const c = counters();
  const n = c && cls ? Number(c[cls]) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The charm rank in a class, 0..MAX_CHARM_RANK. Fail-safe 0. */
export function rankOfClass(cls) {
  const row = charmRankAt(killsOfClass(cls));
  return row ? row.rank : 0;
}

/** `{rank,id,at,remaining}` for the next charm, or null at the ceiling. */
export function nextOfClass(cls) {
  return nextCharmAt(killsOfClass(cls));
}

/**
 * May this class's ELEMENT weakness be printed?
 *
 * This is the whole of phase 1's reward and the one thing it acts on. The
 * WEAPON weakness is already public everywhere in the game (the fight screen,
 * the monster cards, the bounty notice), so nothing that was visible becomes
 * hidden here; the ELEMENT axis is printed NOWHERE today — measured, grep for
 * `elementWeak` outside src/core and the suite — which makes it the honest
 * thing for a charm to unlock. For the Extra Dimensional class
 * (`hiddenElement: true` in src/data/monster-classes.js, whose header already
 * says "the RENDERER is what hides it") this is the only door there will ever
 * be. Fail-safe: no rank ⇒ no reveal.
 */
export function revealsElement(cls) {
  return charmRevealsAt(rankOfClass(cls));
}

/** The class of a monster id, through the one function that owns the taxonomy. */
export function classOfMonsterId(id) {
  const M = w().MONSTERS;
  return classOfMonster(M && M[id]) || null;
}

/**
 * The classes to print, IN THE TAXONOMY'S OWN ORDER, as
 * `[{cls, name, kills, rank}]` — derived from the roster, never hardcoded.
 *
 * ⚠ WHY IT IS DERIVED AND NOT A LIST OF ELEVEN STRINGS IN THE RENDERER. There
 *   are two live spellings of the eleventh class: `MONSTER_CLASS_ORDER` and
 *   every roster row's `cls` field say `extradimensional`, while the canonical
 *   key the counters are bucketed under (and the one bane gear targets) is
 *   `extra_dimensional`. A hardcoded list in the renderer would be a THIRD copy
 *   of the taxonomy and the first one to go stale when the twelfth class lands.
 *   So the order comes from `MONSTER_CLASS_ORDER`, the canonical key and the
 *   display name come from a real roster row through `classOfMonster` /
 *   `className` (both written by `applyClassProfiles`), and adding a class is a
 *   data row here as everywhere else.
 *
 * Only classes with SERVER-counted kills are returned: a wall of eleven "0
 * kills" chips teaches nothing, and the row a player has actually worked on is
 * the one worth printing.
 */
export function charmClasses() {
  const M = w().MONSTERS || {};
  const tax = w().HearthriseMonsterClasses;
  const ids = (tax && Array.isArray(tax.ORDER)) ? tax.ORDER : [];
  const seen = new Set();
  const out = [];
  const push = (cls, name) => {
    if (!cls || seen.has(cls)) return;
    seen.add(cls);
    const kills = killsOfClass(cls);
    if (!kills) return;
    out.push({ cls, name: name || cls, kills, rank: rankOfClass(cls) });
  };
  for (const rawId of ids) {
    const row = Object.keys(M).map((k) => M[k]).find((m) => m && m.cls === rawId);
    if (!row) continue;
    push(classOfMonster(row), row.className);
  }
  /* Anything the order list did not cover — a class present in the counters but
     absent from MONSTER_CLASS_ORDER (a roster the client has not caught up
     with). Printed last rather than dropped: the kills are the server's. */
  const c = counters();
  if (c) for (const cls of Object.keys(c)) push(cls, cls);
  return out;
}

/** The rank badge for a class, or '' below rank 1. Tokens + atlas glyph only. */
export function badgeHtml(cls) {
  const rank = rankOfClass(cls);
  if (!rank) return '';
  /* The NAME is looked up by the row's stable `id`, never by array position in
     CHARM_RANK_NAMES: object key order is not a contract and a copy edit that
     reorders that map must not be able to rename a rank. */
  const row = charmRowOfRank(rank);
  const name = (row && CHARM_RANK_NAMES[row.id]) || ('Rank ' + rank);
  return '<span class="charm-badge charm-r' + rank + '" title="'
    + esc(name + ' — ' + killsOfClass(cls).toLocaleString() + ' kills in this class') + '">'
    + gly('uiMedal', 12) + '<b>' + esc(name) + '</b></span>';
}

/**
 * The "next charm at N kills" affordance (`ui_next_threshold`). A PROGRESS
 * statement, never a power one: it names a kill count and no multiplier.
 */
export function nextThresholdHtml(cls) {
  const nx = nextOfClass(cls);
  if (!nx) {
    return rankOfClass(cls) >= MAX_CHARM_RANK
      ? '<span class="charm-next is-max">' + gly('uiTarget', 11) + 'Ladder complete</span>'
      : '';
  }
  return '<span class="charm-next">' + gly('uiTarget', 11)
    + 'Next charm at ' + nx.at.toLocaleString() + ' kills · '
    + nx.remaining.toLocaleString() + ' to go</span>';
}

/**
 * The element-weakness line for one monster, or '' while the class is unstudied.
 * Reads the SEALED roster fields (applyClassProfiles writes `elementWeak` /
 * `elementImmune` onto every row), so this renderer holds no taxonomy.
 */
export function elementLineHtml(id) {
  const cls = classOfMonsterId(id);
  if (!cls || !revealsElement(cls)) return '';
  const m = (w().MONSTERS || {})[id] || {};
  const weak = m.elementWeak ? String(m.elementWeak) : null;
  const imm = Array.isArray(m.elementImmune) ? m.elementImmune.filter(Boolean) : [];
  if (!weak && !imm.length) return '';
  const parts = [];
  if (weak) parts.push('weak to ' + esc(weak));
  if (imm.length) parts.push('immune to ' + esc(imm.join(', ')));
  return '<small class="charm-element">' + gly('uiSpark', 11) + parts.join(' · ') + '</small>';
}

export function setupBestiaryCharms() {
  const W = w();
  W.HearthriseCharms = {
    noteEnvelope,
    killsOfClass,
    rankOfClass,
    nextOfClass,
    revealsElement,
    classOfMonsterId,
    charmClasses,
    badgeHtml,
    nextThresholdHtml,
    elementLineHtml,
  };
  /* A bare global too: src/net/accrue.js `settle()` calls this by name through
     window rather than importing, because net/accrue.js is imported BY the boot
     graph this module sits in and an import back would be a cycle — the same
     reason `hrNoteServerBounty` is reached that way. */
  W.hrNoteServerBestiary = noteEnvelope;
}
