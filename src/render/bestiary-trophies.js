// ════════════════════════════════════════════════════════════════════════
// src/render/bestiary-trophies.js — the CLIENT half of the Bestiary TROPHY
// ladder (docs/design/BESTIARY_LADDER.md).
//
// The sibling of src/render/bestiary-charms.js, and deliberately its mirror:
// same scratch-key rule, same fail-safe, same "computes no authoritative
// number". Where that file mirrors per-CLASS totals for the short ladder, this
// one mirrors per-MONSTER totals and the CLAIMED trophy rows for the long one.
//
// Three jobs and nothing else:
//   1. MIRROR the server's `bestiary.kills_by_monster` and `bestiary.trophies`
//      blocks off the accrual envelope into `G._bestiaryTrophies` — scratch,
//      `_`-prefixed, never saved.
//   2. ANSWER questions about it for the renderer: what stage is this monster,
//      how many kills to the next one, is this trophy already claimed, is it
//      claimable right now.
//   3. SEND the claim intent and repaint from the answer.
//
// ── EVERY NUMBER ON THIS SURFACE IS THE SERVER'S (CLAUDE.md §6) ─────────────
// `G.bestiary` is a RESIDUE FIELD — a client-written `{monsterId:{kills}}` map
// that legacy.js's killMonster wrapper increments, and which the read-only
// Bestiary modal has always rendered. Reading a CLAIM GATE off it would be the
// residue-ahead bug class verbatim: a local counter that runs AHEAD of the
// server would put a live "Claim" button on a trophy the server answers
// `not_yet` to — the precise "browser says one thing, server says another"
// report Tyler called a P1 class-kill on 2026-09-14. So the two never mix. The
// kill count this module answers with, the stage it derives, and the claimed
// set it gates on are ALL from the server block, and every one of them FAILS
// SAFE: no envelope yet, a signed-out session, or a database without
// hr_trophy_of all read as "no kills, no stage, not claimed, not claimable" —
// never as a trophy the server does not believe in.
//
// ⚠ AND `claimed` IS NEVER SET LOCALLY ON A SUCCESSFUL CLAIM. The button goes
//   busy, the server answers, and the next envelope carries the row. Writing it
//   optimistically would be the same class one step smaller: a claimed state the
//   server has not confirmed, which a reload would take away.
//
// ── WHY IT IS MIRRORED FROM `settle()` ──────────────────────────────────────
// `applyEnvelopeState` runs only on `accrued:true`, and the COMMON boot response
// for an idle character is `accrued:false, reason:'idle'` — so a mirror sited
// there would be invisible to exactly the player who reloads and opens the
// Bestiary. src/net/accrue.js `settle()` is the one funnel every answered
// accrual passes, accrued or not. The charm mirror learned this first.
//
// ── PRESENTATION IS TOKENS AND ATLAS GLYPHS ONLY ────────────────────────────
// No hardcoded colour and no emoji: the badge is `uiMedal`, the threshold
// affordance `uiTarget`, all through `window.HR.icon`, and every colour is a
// `var(--…)` token in src/styles/legacy.css.
// ════════════════════════════════════════════════════════════════════════

import {
  TROPHY_STAGES, TROPHY_STAGE_NAMES, MAX_TROPHY_STAGE, trophyStageAt, nextTrophyAt,
} from '../data/bestiary.js?v=550';
import { trophyIndex, trophyStageFor } from '../core/trophies.js?v=550';

const w = () => (typeof window !== 'undefined' ? window : {});
const g = () => w().G || {};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gly = (key, px) => {
  const W = w();
  return (typeof W._hrGly === 'function') ? W._hrGly(key, px || 13) : '';
};

/** The claimed set's key. One spelling, so a renderer cannot invent a second. */
function claimKey(monsterId, stage) { return monsterId + ':' + stage; }

/**
 * Adopt the envelope's `bestiary` block — the per-monster counters and the
 * claimed trophy rows.
 *
 * A missing key is a NO-OP that leaves any previously mirrored state ALONE
 * rather than clearing it: the intent responses (equip, shop_buy, …) carry no
 * bestiary block, and treating their silence as "zero kills" would make a badge
 * flicker off every time the player bought a loaf of bread. Absence is not a
 * claim — the same rule the skills merge and the charm mirror follow.
 *
 * Ids are validated against the roster the client actually has and values
 * coerced to non-negative integers, so a malformed or hostile block cannot put
 * a junk monster on the screen or a stage on one that does not exist.
 *
 * ⚠ `trophies` IS ITS OWN KEY AND IS MIRRORED SEPARATELY FROM THE COUNTERS,
 *   because they are different facts with different absences. A server without
 *   hr_trophy_of sends counters and NO trophies key: the ladder still renders
 *   its progress (which is derived from the counters) and every trophy reads
 *   "not claimed", which is the fail-safe direction. Folding them into one
 *   presence check would blank the progress line as well.
 *
 * @returns a receipt, so the suite asserts the rule and not a rendered string.
 */
export function noteEnvelope(res) {
  const out = { noted: false, reason: '', monsters: 0, claimed: 0 };
  const src = (res && typeof res === 'object' && res.bestiary) || null;
  if (!src || typeof src !== 'object') { out.reason = 'no_key'; return out; }
  const raw = src.kills_by_monster;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { out.reason = 'no_counters'; return out; }

  const roster = w().MONSTERS || {};
  const kills = Object.create(null);
  for (const k of Object.keys(raw)) {
    if (!Object.prototype.hasOwnProperty.call(roster, k)) continue;
    const n = Number(raw[k]);
    if (!Number.isFinite(n) || n <= 0) continue;
    kills[k] = Math.floor(n);
    out.monsters += 1;
  }

  /* THE CLAIMED SET. A Set of `<monster>:<stage>`, built only from rows the
     server sent and only for stages the ladder actually has — a row naming
     stage 9 is dropped rather than rendered as an unknown badge. */
  const claimed = new Set();
  if (Array.isArray(src.trophies)) {
    for (const row of src.trophies) {
      const id = row && typeof row.monster === 'string' ? row.monster : null;
      const st = Math.floor(Number(row && row.stage) || 0);
      if (!id || !Object.prototype.hasOwnProperty.call(roster, id)) continue;
      if (!(st >= 1 && st <= MAX_TROPHY_STAGE)) continue;
      claimed.add(claimKey(id, st));
      out.claimed += 1;
    }
  }

  const G = g();
  /* The WHOLE scratch object is replaced, never merged: this block is the
     server's complete statement about this character, so a monster that has
     dropped out of it (a wipe, a different slot, a different account in the same
     tab) must not survive as a stale stage or a stale trophy. */
  G._bestiaryTrophies = {
    killsByMonster: kills,
    index: trophyIndex(kills, roster) || Object.create(null),
    /* `hasTrophyKey` records whether the server SENT the trophies key at all,
       distinct from sending an empty one. Nothing gates on it today; it is what
       lets a future surface say "trophies are unavailable on this server"
       instead of "you have none", which are different sentences. */
    hasTrophyKey: Array.isArray(src.trophies),
    claimed,
  };
  out.noted = true;
  return out;
}

/** The mirrored scratch, or null. The single read point — fail-safe to null. */
function mirror() {
  const b = g()._bestiaryTrophies;
  return (b && b.killsByMonster && typeof b.killsByMonster === 'object') ? b : null;
}

/**
 * THE TROPHY INDEX THE CLIENT'S COMBAT PREDICTION READS, or null.
 *
 * `{monsterId: stage}`, DERIVED on every read from the server's own counters —
 * the same `trophyIndex` the Edge engine calls on the same rows. Published on
 * `window.HearthriseTrophies` so src/core-bridge.js can reach it without
 * importing a renderer (it reaches `getBonus`, `HearthriseTools` and
 * `HearthriseCharms` the same way). Keeping the read here keeps
 * `G._bestiaryTrophies` owned by exactly one module.
 *
 * ⚠ DISPLAY PREDICTION ONLY. It feeds `weaknessInfo` on the client so the loot
 *   preview and the live tick quote the drop rate the server will pay; the
 *   server re-resolves every kill from its own `hr_bestiary_of` read and never
 *   sees this value. Null (no envelope yet, signed out, a database without the
 *   projection) ⇒ no trophy ⇒ the pre-trophy numbers, never a forged stage.
 */
export function indexForCombat() {
  const b = mirror();
  const idx = b && b.index;
  if (!idx || typeof idx !== 'object') return null;
  for (const k in idx) { if (Number(idx[k]) > 0) return idx; }
  return null;
}

/** Lifetime kills against one monster, per the SERVER. 0 when unknown. */
export function killsOfMonster(id) {
  const b = mirror();
  const n = b && id ? Number(b.killsByMonster[id]) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The trophy stage held against a monster, 0..MAX_TROPHY_STAGE. Fail-safe 0. */
export function stageOfMonster(id) {
  const row = trophyStageAt(killsOfMonster(id));
  return row ? row.stage : 0;
}

/** `{row, remaining}` for the next rung, or null at the top of the ladder. */
export function nextOfMonster(id) {
  return nextTrophyAt(killsOfMonster(id));
}

/**
 * Has the SERVER written this trophy row? Fail-safe FALSE.
 *
 * This is the one question whose wrong answer is visible as a bug: answering
 * `true` on a trophy the server has not written puts "Claimed" under a trophy
 * the player can still claim, and answering it from a local counter instead of
 * the server's rows is the residue-ahead class. So it reads the mirrored set and
 * nothing else, and an absent mirror is "not claimed".
 */
export function isClaimed(id, stage) {
  const b = mirror();
  if (!b || !b.claimed || !id) return false;
  return b.claimed.has(claimKey(id, Math.floor(Number(stage) || 0)));
}

/**
 * May this trophy be claimed RIGHT NOW? Fail-safe FALSE.
 *
 * Both halves are the server's: the stage is derived from the server's counters
 * and the claimed set is the server's rows. The button this gates is therefore
 * never live on a trophy the server would refuse — which is the whole of
 * CLAUDE.md §6 on this surface. The server re-checks both anyway; this is the
 * affordance, not the authority.
 */
export function isClaimable(id, stage) {
  const st = Math.floor(Number(stage) || 0);
  if (!(st >= 1 && st <= MAX_TROPHY_STAGE)) return false;
  return stageOfMonster(id) >= st && !isClaimed(id, st);
}

/** The display name of a stage, by its stable id. '' below the first rung. */
export function stageName(stage) {
  const row = TROPHY_STAGES[Math.floor(Number(stage) || 0) - 1];
  return (row && TROPHY_STAGE_NAMES[row.id]) || '';
}

/**
 * The trophy BADGE for a monster, or '' below the first rung.
 *
 * It names the STAGE REACHED — a fact about kills the server counted — and says
 * whether the trophy has been claimed. Those are two different facts and the
 * badge keeps them apart on purpose: reaching `nemesis` is what pays the drop
 * bonus (it is derived, and it is already on); CLAIMING it is the gesture and
 * the collection row. A badge that conflated them would make a player think
 * their unclaimed bonus was not paying.
 */
export function badgeHtml(id) {
  const stage = stageOfMonster(id);
  if (!stage) return '';
  const name = stageName(stage) || ('Stage ' + stage);
  const held = isClaimed(id, stage);
  return '<span class="trophy-badge trophy-s' + stage + (held ? ' is-claimed' : '') + '" title="'
    + esc(name + ' — ' + killsOfMonster(id).toLocaleString() + ' kills, per the server'
      + (held ? ' · trophy claimed' : ' · trophy not claimed yet')) + '">'
    + gly('uiMedal', 13) + '<b>' + esc(name) + '</b></span>';
}

/**
 * The "N more to Slayer" affordance — a PROGRESS statement, never a power one:
 * it names a kill count and no multiplier. This is the number a player can
 * actually act on, and it is the whole retention argument for the ladder.
 */
export function nextThresholdHtml(id) {
  const nx = nextOfMonster(id);
  if (!nx) {
    return stageOfMonster(id) >= MAX_TROPHY_STAGE
      ? '<span class="trophy-next is-max">' + gly('uiTarget', 12) + 'Ladder complete</span>'
      : '';
  }
  const name = (TROPHY_STAGE_NAMES[nx.row.id] || nx.row.id);
  return '<span class="trophy-next">' + gly('uiTarget', 12)
    + esc(nx.remaining.toLocaleString()) + ' more to ' + esc(name) + '</span>';
}

/**
 * The CLAIM control for a monster, or ''.
 *
 * ⚠ IT RENDERS NOTHING AT ALL unless the SERVER's counters have earned a stage
 *   that the SERVER's rows say is unclaimed. There is no disabled-button state
 *   for "not there yet": the threshold line above already says how far off it
 *   is, and a greyed Claim button on every one of 108 rows is noise a player has
 *   to read past to find the one that matters.
 *
 * The handler is `window.hrClaimTrophy(id, stage)` — published below — because
 * this modal is built from a template string the same way the rest of
 * src/render/bestiary.js is.
 */
export function claimButtonHtml(id) {
  const stage = stageOfMonster(id);
  if (!stage) return '';
  /* The LOWEST unclaimed rung at or below the stage reached. A player who
     crosses two rungs while away claims them one at a time, oldest first, so
     the gesture and the row it writes stay one-to-one. */
  let target = 0;
  for (let s = 1; s <= stage; s += 1) { if (!isClaimed(id, s)) { target = s; break; } }
  if (!target) return '';
  const name = stageName(target) || ('Stage ' + target);
  return '<button class="btn btn-sm trophy-claim" data-monster="' + esc(id) + '"'
    + ' data-stage="' + target + '"'
    + ' onclick="hrClaimTrophy(\'' + esc(id) + '\',' + target + ')">'
    + 'Claim ' + esc(name) + '</button>';
}

/**
 * Send the claim and repaint from the ANSWER.
 *
 * The button goes busy for the round trip so a double-click cannot fire twice;
 * beyond that nothing local changes. `claimed` is not set here, the counters are
 * not touched here, and the badge is not moved here: the transport's envelope
 * hook applies the server's state and `noteEnvelope` re-mirrors the trophy
 * block, and only then does the modal repaint. That ordering is the difference
 * between a surface that shows what the server holds and one that shows what the
 * client hoped for.
 *
 * @returns the transport's verdict, so the suite asserts the outcome rather
 *          than a rendered string.
 */
export async function claim(id, stage) {
  /* INSTALL THE ENVELOPE HOOK FIRST, lazily, the way `_sendEatNow` does in
     src/legacy.js — and for the same reason: the transport is CONFIGURED at
     sign-in, but nothing has taught it where to send the server's ANSWER, and a
     claim that raced ahead of that would drop the envelope on the floor. */
  installEnvelopeHook();
  const M = w().HearthriseTrophyClaim;
  if (!M || typeof M.sendTrophyClaim !== 'function') {
    return { outcome: 'unconfigured', reason: 'no_transport' };
  }
  const btn = (typeof document !== 'undefined')
    ? document.querySelector('.trophy-claim[data-monster="' + id + '"][data-stage="' + stage + '"]')
    : null;
  if (btn) { if (btn.disabled) return { outcome: 'unsendable', reason: 'in_flight' }; btn.disabled = true; }
  let verdict = null;
  try {
    verdict = await M.sendTrophyClaim(id, stage);
  } finally {
    if (btn) btn.disabled = false;
  }
  /* SAY WHY, when the server said why. An unlisted code says nothing rather
     than guessing — see TROPHY_REFUSAL_COPY in src/net/trophy-claim.js. */
  const copy = (typeof M.refusalCopyFor === 'function') ? M.refusalCopyFor(verdict) : '';
  if (copy && typeof w().toast === 'function') { try { w().toast(copy); } catch (e) { /* display only */ } }
  /* REPAINT FROM WHATEVER THE SERVER NOW SAYS — success or refusal alike. A
     `not_yet` carries an envelope precisely so the client that was ahead can be
     put back, and repainting only on success is how the stale number survives. */
  if (typeof w().openBestiary === 'function' && typeof document !== 'undefined') {
    const ov = document.getElementById('best-overlay');
    if (ov && ov.classList.contains('show')) { try { w().openBestiary(); } catch (e) { /* display only */ } }
  }
  return verdict;
}

/**
 * Teach the claim transport where to send the server's answer, ONCE.
 *
 * ⚠ IT LIVES HERE AND NOT IN src/legacy.js, unlike `wireServerEat` and its
 *   siblings. Those predate the render extraction; a new one would be a new
 *   top-level function in a 19k-line classic script, which CLAUDE.md §7 and
 *   tests/monolith-ratchet.mjs both refuse. `applyServerEnvelope` is published
 *   on window (src/legacy.js) and is resolved at CALL time, so load order
 *   cannot matter.
 *
 * ⚠ NO hp/combat SNAPSHOT, unlike `wireServerEat`. That wrapper has to preserve
 *   live combat hp because an eat's envelope carries the server's stale-full hp
 *   mid-fight. A claim moves NOTHING — no hp, no gold, no item — so there is no
 *   field of this envelope that can fight the client's live view, and a snapshot
 *   would be ceremony pretending to be a safeguard.
 *
 * It applies on a REFUSAL too, and that is the point of wiring it at all: a
 * `not_yet` means the client's own kill count ran ahead of the server's, and the
 * envelope riding that refusal is how the number on screen is put back
 * (CLAUDE.md §6).
 */
export function installEnvelopeHook() {
  const M = w().HearthriseTrophyClaim;
  if (!M || typeof M.setTrophyClaimHooks !== 'function') return null;
  const h = (typeof M.getTrophyClaimHooks === 'function') ? M.getTrophyClaimHooks() : null;
  if (h && typeof h.onEnvelope === 'function') return M;
  M.setTrophyClaimHooks({
    onEnvelope(res) {
      const apply = w().applyServerEnvelope;
      return (typeof apply === 'function') ? apply(res, { intent: true }) : false;
    },
  });
  return M;
}

export function setupBestiaryTrophies() {
  const W = w();
  W.HearthriseTrophies = {
    noteEnvelope,
    indexForCombat,
    killsOfMonster,
    stageOfMonster,
    nextOfMonster,
    isClaimed,
    isClaimable,
    stageName,
    badgeHtml,
    nextThresholdHtml,
    claimButtonHtml,
    claim,
    installEnvelopeHook,
  };
  /* Installed at boot as well as lazily at claim time: the boot install is what
     makes the hook present for the in-page suite and for a claim fired before
     any other code has touched this module, and `installEnvelopeHook` is a no-op
     when a hook is already set. */
  installEnvelopeHook();
  /* A bare global too: src/net/accrue.js `settle()` calls this by name through
     window rather than importing, because net/accrue.js is imported BY the boot
     graph this module sits in and an import back would be a cycle — the same
     reason `hrNoteServerBestiary` and `hrNoteServerBounty` are reached that way. */
  W.hrNoteServerTrophies = noteEnvelope;
  /* The modal's onclick handler. Built from a template string like the rest of
     src/render/bestiary.js, so the entry point has to be a global. */
  W.hrClaimTrophy = (id, stage) => claim(id, stage);
}
