// ════════════════════════════════════════════════════════════════════════
// src/features/coach.js — FIRST STEPS, RUN (window.HearthriseCoach). b573.
//
// Rows: src/data/coach.js. Drawing: src/render/coach.js. This file decides
// WHICH card shows, WHERE it points and WHEN it moves on.
//
// ── THE STEP IS THE FIRST FALSE FACT ────────────────────────────────────
// Nothing here stores "the player is on step 4". Every reading derives the
// step from the server's facts (`currentIndex`, pure): the first row whose
// facts do not all hold, after the last row whose PERSISTENT facts do. So a
// reload lands on the same step with no saved pointer, a step done on another
// device is done here, and a forged client field cannot move the guide: no
// fact reads a G value the client writes (tests/coach-rows.mjs C2).
//
// Two facts are not re-stated by a later envelope: `sold` (the edge's answer
// to a sale) and `activity`. A step that rests on one counts as done once any
// LATER persistent step is (you cannot have planted without getting here),
// and info cards are remembered for the session only. The one thing written
// down is `G.coachDismissed` — display-only residue (src/net/client-state.js
// RESIDUE_FIELDS): the player finished or skipped the guide on this hero.
//
// ── WHO SEES IT ─────────────────────────────────────────────────────────
// A hero within COACH_ADVANCED_LEVELS of the start kit, on a first hero whose
// account is under a day old or on any later hero (a second hero re-runs it),
// that has not dismissed it. Never before the record has answered: an unknown
// fact is "not yet", and an unknown character is not a new one.
// ════════════════════════════════════════════════════════════════════════

import { COACH_STEPS, COACH_LOOT, COACH_FOE, COACH_ADVANCED_LEVELS, COACH_RETURNING_MS } from '../data/coach.js?v=574';
import { START_SKILL_XP } from '../data/start-kit.js?v=574';
import { SKILLS_DEF } from '../data/skills.js?v=574';
import * as Draw from '../render/coach.js?v=574';

const PERSISTENT = new Set(['count', 'xp', 'kills']);
const LOCKED = '.locked, .is-locked, [disabled], [aria-disabled="true"]';
/* What a ringed control may open on top of itself: the seed picker, the item
   flyout, a confirm. A press inside one is the step continuing, not a stray. */
const FOLLOW = '.modal.show, .qm-overlay, .hr-sheet, .inv-detail, .inv-detail-wrap, [role="dialog"]:not(.hr-coach-card), [role="alertdialog"]';

const acked = Object.create(null);   // info rows read this session, by hero
let sold = false;                    // the edge accepted a sale this session
let running = false, parked = false, lastKey = null, celebrating = false, lastIdx = -1;
let lastHero = null;
let pin = null;                      // test seam: pinned facts

/* ── FACTS ────────────────────────────────────────────────────────────── */

function lvl(xp) {
  const f = typeof window !== 'undefined' ? window.levelFromXp : null;
  return typeof f === 'function' ? f(Number(xp) || 0) : 1;
}

/** The server's facts right now, or null while the record has not answered. */
export function facts() {
  if (pin) return pin;
  const R = typeof window !== 'undefined' ? window.HearthriseReveal : null;
  const f = R && typeof R.facts === 'function' ? R.facts() : null;
  if (!f || !f.skills || !f.countsComplete) return null;
  const G = window.G || {};
  const b = G._bestiaryTrophies;
  const A = window.HearthriseActivity;
  const st = A && typeof A.getActivityState === 'function' ? A.getActivityState() : null;
  const act = st && st.lastServerActivity;
  return {
    counts: f.counts || {}, skills: f.skills, bag: f.bag || null,
    kills: (b && b.killsByMonster && typeof b.killsByMonster === 'object') ? b.killsByMonster : {},
    sold, activity: !!(act && act.kind && act.kind !== 'idle'),
  };
}

/** One fact against the facts, pure. */
export function holds(need, f) {
  if (!f) return false;
  if (need.fact === 'count') return (Number(f.counts && f.counts[need.key]) || 0) >= need.min;
  if (need.fact === 'xp') return (Number(f.skills && f.skills[need.skill]) || 0) >= need.min;
  if (need.fact === 'kills') return (Number(f.kills && f.kills[need.monster]) || 0) >= need.min;
  if (need.fact === 'sold') return !!f.sold;
  if (need.fact === 'activity') return !!f.activity;
  return false;
}

function rowDone(row, f, ack) {
  if (row.kind === 'info') return !!(ack && ack[row.id]);
  return row.done.length > 0 && row.done.every((n) => holds(n, f));
}
function persistentDone(row, f) {
  return row.kind !== 'info' && row.done.length > 0 && row.done.every((n) => PERSISTENT.has(n.fact) && holds(n, f));
}

/**
 * THE CURRENT STEP, pure: the first row not done after the last row whose
 * persistent facts all hold. `rows.length` = the guide is finished.
 */
export function currentIndex(rows, f, ack) {
  let floor = -1;
  rows.forEach((r, i) => { if (persistentDone(r, f)) floor = i; });
  for (let i = floor + 1; i < rows.length; i++) if (!rowDone(rows[i], f, ack)) return i;
  return rows.length;
}

/** Levels past the start kit, from the server's skills. */
export function levelsGained(skills) {
  if (!skills) return null;
  let n = 0;
  for (const id of Object.keys(SKILLS_DEF)) n += lvl(skills[id]) - lvl(START_SKILL_XP[id] || 0);
  return n;
}

function heroKey() {
  const A = window.HearthriseAuth, P = window.HearthriseProfile;
  const uid = A && typeof A.currentUserId === 'function' ? A.currentUserId() : null;
  const slot = P && typeof P.activeSlot === 'function' ? P.activeSlot() : 0;
  return (uid || 'anon') + ':' + slot;
}

function accountAgeMs() {
  const A = window.HearthriseAuth;
  const s = A && typeof A.getSession === 'function' ? A.getSession() : null;
  const at = s && s.user && Date.parse(s.user.created_at);
  return Number.isFinite(at) ? Date.now() - at : null;
}

/**
 * MAY THIS HERO SEE THE GUIDE? Pure over its inputs: `{gained, slot, ageMs,
 * dismissed}`. Unknown levels → no (the record has not answered).
 */
export function eligible(o) {
  if (!o || o.dismissed) return false;
  if (o.gained == null || o.gained > COACH_ADVANCED_LEVELS) return false;
  if ((o.slot || 0) === 0 && o.ageMs != null && o.ageMs > COACH_RETURNING_MS) return false;
  return true;
}

function eligibleNow(f) {
  const G = window.G || {};
  const P = window.HearthriseProfile;
  return eligible({
    dismissed: !!G.coachDismissed, gained: levelsGained(f && f.skills),
    slot: P && typeof P.activeSlot === 'function' ? P.activeSlot() : 0, ageMs: accountAgeMs(),
  });
}

/* ── ANCHORS ──────────────────────────────────────────────────────────── */

function shows(id) {
  const R = window.HearthriseReveal;
  return !id || !R || typeof R.shows !== 'function' || R.shows(id);
}

/** The loot the sell step names: the rat's drop in the bag, else any sellable stack. */
export function lootId(bag) {
  const b = bag || (window.G && window.G.inventory) || {};
  const price = (id) => (typeof window.vendorPrice === 'function' ? window.vendorPrice(id) : 1);
  const kit = ['cooked_shrimp', 'shrimp', 'turnip_seed', 'bronze_arrows', 'air_rune', 'coarse_whetstone'];
  const hit = COACH_LOOT.find((id) => b[id] > 0 && price(id) > 0);
  if (hit) return hit;
  return Object.keys(b).find((id) => b[id] > 0 && kit.indexOf(id) < 0 && price(id) > 0) || COACH_LOOT[0];
}

function fill(s, loot) {
  const name = (window.ITEMS && window.ITEMS[loot] && window.ITEMS[loot].n) || String(loot).replace(/_/g, ' ');
  return String(s).replace(/\{loot\}/g, loot).replace(/\{lootName\}/g, name);
}

function foeOk(hop) {
  if (!hop.foe) return true;
  const G = window.G || {};
  if (G.activeMonster) return false;
  const M = window.MONSTERS && window.MONSTERS[hop.foe];
  const n = document.getElementById('arena-foe-name');
  return !!(M && n && n.textContent.trim() === M.name);
}

/** A hop's element on screen, or null: laid out, open, behind an open door. */
export function hopElement(hop, loot) {
  if (!shows(hop.reveal) || !foeOk(hop)) return null;
  const list = document.querySelectorAll(fill(hop.sel, loot));
  for (const el of list) {
    if (!Draw.laidOut(el)) continue;
    if (el.matches(LOCKED) || el.closest('.locked, .is-locked')) continue;
    return el;
  }
  return null;
}

/** The deepest open hop of a row: {el, hop, last} or null. */
export function resolve(row, loot) {
  for (let i = row.path.length - 1; i >= 0; i--) {
    const el = hopElement(row.path[i], loot);
    if (el) return { el, hop: row.path[i], last: i === row.path.length - 1 };
  }
  return null;
}

function busyRunning(row) {
  if (!row.watch) return null;
  const el = document.querySelector(row.watch);
  if (row.id === 'fight') { const G = window.G || {}; return (G.activeMonster === COACH_FOE && el && Draw.laidOut(el)) ? el : null; }
  return (el && Draw.laidOut(el)) ? el : null;
}

/* ── THE LOOP ─────────────────────────────────────────────────────────── */

function progressOf(row, f) {
  const p = row.progress;
  if (!p || !f) return null;
  const have = Math.min(p.min, Number(f.counts && f.counts[p.key]) || 0);
  return { have, need: p.min, label: p.label, text: have + '/' + p.min };
}

function ack(id) { (acked[heroKey()] = acked[heroKey()] || {})[id] = true; }

/** Finish or skip: written down for this hero, and the coach leaves. */
export function dismiss() {
  if (window.G) window.G.coachDismissed = true;
  running = false;
  Draw.hide();
  spine();
}

function spine() {
  const S = window.HearthriseSpine;
  if (S && typeof S.render === 'function') { try { S.render(); } catch (e) {} }
}

function paint(row, idx, f) {
  const loot = lootId(f && f.bag);
  const hit = resolve(row, loot);
  const watching = row.kind === 'act' ? busyRunning(row) : null;
  const target = watching || (hit && hit.el) || null;
  const lead = (!watching && hit && !hit.last && hit.hop.say) ? fill(hit.hop.say, loot) : '';
  const buttons = [];
  if (row.kind === 'info') {
    buttons.push({ label: row.primary || 'Got it', primary: true, on: () => {
      if (row.opens === 'discord') openDiscord();
      advance(row);
    } });
    if (row.secondary) buttons.unshift({ label: row.secondary, on: () => advance(row) });
  }
  Draw.show({
    key: row.id, kicker: 'First steps · ' + (idx + 1) + ' of ' + COACH_STEPS.length,
    title: row.title, lead, body: fill(row.body, loot), progress: progressOf(row, f),
    buttons, skip: idx === COACH_STEPS.length - 1 ? '' : 'Skip guide', onSkip: dismiss,
    anchor: target, waiting: !!watching,
    follow: (t) => !!(t.closest && t.closest(FOLLOW)),
  });
}

function openDiscord() {
  const D = window.HearthriseDiscord;
  const url = D && D.INVITE;
  if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) {} }
  if (window.G) window.G.discordSeen = true;
}

function advance(row) {
  ack(row.id);
  if (row.id === COACH_STEPS[COACH_STEPS.length - 1].id) { Draw.celebrate(dismiss, 500); return; }
  /* The tick has already played: the next reading paints, it does not celebrate twice. */
  celebrating = true;
  Draw.celebrate(() => { celebrating = false; lastIdx = -1; tick(); }, 500);
}

/** One reading: start, move on, or leave. Returns the step index shown, or -1. */
export function tick() {
  if (parked || celebrating) return lastIdx;
  const f = facts();
  const hero = heroKey();
  if (hero !== lastHero) { if (lastHero !== null) reset(); lastHero = hero; }
  if (!running) {
    /* The harness has no record: the guide starts there only when a test pins its facts. */
    if (window.__HR_TEST_HARNESS__ && !pin) return -1;
    if (!f || !eligibleNow(f)) { if (Draw.isUp()) Draw.hide(); return -1; }
    /* The front door goes first: a name prompt, the downloads sheet or any other
       sheet already up finishes before the guide mounts (once mounted, they all
       queue behind its `.ftue-root`). */
    const S = window.HearthriseSheet;
    if (document.querySelector('.hr-id-scrim, .hr-dl-scrim') || (S && typeof S.anyOpen === 'function' && S.anyOpen())) return -1;
    running = true;
  }
  const G = window.G || {};
  if (G.coachDismissed) { running = false; Draw.hide(); spine(); return -1; }
  const idx = currentIndex(COACH_STEPS, f, acked[heroKey()]);
  if (idx >= COACH_STEPS.length) { dismiss(); return -1; }
  const row = COACH_STEPS[idx];
  if (lastIdx >= 0 && idx > lastIdx && Draw.isUp() && !celebrating) {
    /* The server just counted the step: the tick, then the next card slides in. */
    celebrating = true;
    lastIdx = idx;
    Draw.celebrate(() => { celebrating = false; spine(); paint(row, idx, facts()); }, 900);
    return idx;
  }
  const moved = lastIdx !== idx;
  lastIdx = idx;
  if (moved) spine();
  paint(row, idx, f);
  return idx;
}

/** Is the guide on screen (the spine bar steps aside until the hand-off card)? */
export function hidesSpine() {
  return running && Draw.isUp() && lastIdx >= 0 && lastIdx < COACH_STEPS.length - 1;
}

/** Settings → Replay guide: clear this hero's dismissal and start again from
 *  the first step the server has not seen done (any hero, any level). */
export function replay() {
  if (window.G) window.G.coachDismissed = false;
  delete acked[heroKey()];
  lastIdx = -1; celebrating = false; parked = false;
  if (!facts()) return -1;
  running = true;
  return tick();
}

/** A new hero (slot switch): forget the session's reads. */
function reset() {
  running = false; lastIdx = -1; celebrating = false; sold = false;
  Draw.hide();
}

if (typeof window !== 'undefined') {
  window.HearthriseCoach = Object.freeze({
    steps: COACH_STEPS, facts, holds, currentIndex, eligible, levelsGained, lootId, resolve, hopElement,
    tick, dismiss, replay, hidesSpine, flash: Draw.flash, isUp: Draw.isUp,
    /* Test seams. */
    __pin(f) { const was = pin; pin = f || null; return was; },
    __park(on) { const was = parked; parked = !!on; if (on) Draw.hide(); return was; },
    __reset() { reset(); Object.keys(acked).forEach((k) => delete acked[k]); pin = null; },
    __force(on) { running = !!on; },
    __draw: Draw,
  });
  window.addEventListener('hearthrise:server-sold', () => { sold = true; setTimeout(() => { try { tick(); } catch (e) {} }, 0); });
  window.addEventListener('hearthrise:reveal', () => { try { tick(); } catch (e) {} });
  if (!window.__HR_TEST_HARNESS__) setInterval(() => { try { tick(); } catch (e) {} }, 700);
}
