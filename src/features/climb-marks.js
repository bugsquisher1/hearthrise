// ════════════════════════════════════════════════════════════════════════
// src/features/climb-marks.js — MARKS OF THE CLIMB: the level moment, fired on
// the SERVER's level only.
//
// ── NOTHING HERE OWNS A NUMBER (CLAUDE.md §1, §6) ───────────────────────────
// A level is window.HearthriseSkillRecord.skillLevelOf (server XP, no
// prediction) or a row of the server's own away receipt (levelUps). A reading
// that is not a whole level of 1 or more is no reading at all. The first
// sighting of a skill is a silent baseline, so a reload or a second device
// never replays a mark; a fall (a new character in the slot) re-bases silently.
//
// ── ONE MOMENT PER RISE ─────────────────────────────────────────────────────
// A rise gets one plain banner (window.hrLevelUpNotice, which this wraps once to
// learn what the client path already announced) and at most one ceremony: the
// Mastery sheet when 99 is newly crossed, else the Mark banner for the highest
// new mark. Marks go to the Chronicle under the ids chronicle.js derives, so
// the record is idempotent. The only G write is HearthriseChronicle.record.
// Companion banners come from the server's companionLevelUp only. The suite
// parks the watcher (src/features/smoke-test.js).
// ════════════════════════════════════════════════════════════════════════

import { CLIMB_MARKS, MARK_NAMES, MARK_LORE, MASTERY_LORE } from '../data/mark-lore.js?v=562';
import { COMPANION_MAX_LEVEL } from './companions.js?v=562';

/* An away receipt older than this is history, not a moment (accrue.js's rule). */
const RECEIPT_FRESH_MS = 30 * 60 * 1000;

let lastKey = null;
let base = {};
let announced = new Set();
let shown = new Set();
let receiptAt = null;
let masteryQueue = [];
let parked = false;
let petListening = false;

const isLevel = (v) => Number.isInteger(v) && v >= 1;

function marksCrossed(from, to) {
  return CLIMB_MARKS.filter((m) => from < m && m <= to);
}

function resetFor(key) {
  lastKey = key;
  base = {};
  announced = new Set();
  shown = new Set();
  receiptAt = null;
}

/** The rises since the last reading of this uid:slot. Pure over module state. */
function observe(key, levels) {
  if (key !== lastKey) resetFor(key);
  const rises = [];
  for (const skill of Object.keys(levels || {})) {
    const lv = levels[skill];
    if (!isLevel(lv)) continue;
    const was = base[skill];
    if (was === undefined) { base[skill] = lv; continue; }
    if (lv > was) rises.push({ skill, from: was, to: lv, marks: marksCrossed(was, lv) });
    base[skill] = lv;
  }
  return rises;
}

/** The rises a fresh, unseen away receipt states. */
function fromReceipt(summary, now) {
  if (!summary || summary.restored === true) return [];
  const at = Number(summary.at);
  if (!(at > 0) || !(now - at < RECEIPT_FRESH_MS) || at === receiptAt) return [];
  if (!Array.isArray(summary.levelUps)) return [];
  receiptAt = at;
  const by = {};
  for (const row of summary.levelUps) {
    if (!row || !row.skill) continue;
    const from = Number(row.from), to = Number(row.to);
    if (!isLevel(from) || !isLevel(to)) continue;
    const cur = by[row.skill];
    by[row.skill] = cur ? { from: Math.min(cur.from, from), to: Math.max(cur.to, to) } : { from, to };
  }
  return Object.keys(by).filter((sk) => by[sk].to > by[sk].from)
    .map((sk) => ({ skill: sk, from: by[sk].from, to: by[sk].to, marks: marksCrossed(by[sk].from, by[sk].to) }));
}

function markFor(level) {
  const k = String(level);
  return MARK_NAMES[k] ? { name: MARK_NAMES[k], lore: MARK_LORE[k] } : null;
}

const masteryLore = (sk) => MASTERY_LORE[sk] || null;

const skillName = (sk) => {
  const D = window.SKILLS_DEF || {};
  return (D[sk] && D[sk].name) || sk;
};

/* The client path's own banner counts as the rise's banner: noted, not repeated. */
function wrapNotice() {
  const orig = window.hrLevelUpNotice;
  if (typeof orig !== 'function' || orig.__climbMarks) return;
  const wrapped = function (skill, level) {
    announced.add(skill + ':' + level);
    return orig.apply(this, arguments);
  };
  wrapped.__climbMarks = true;
  window.hrLevelUpNotice = wrapped;
}

const busy = () => !!document.querySelector('.ftue-root')
  || !!(window.HearthriseSheet && window.HearthriseSheet.anyOpen());

function drainMastery() {
  if (!masteryQueue.length || busy() || typeof window.hrOpenMastery !== 'function') return;
  window.hrOpenMastery(masteryQueue.shift());
}

function celebrate(rise) {
  const { skill, to, marks } = rise;
  if (!announced.has(skill + ':' + to) && typeof window.hrLevelUpNotice === 'function') {
    window.hrLevelUpNotice(skill, to);
  }
  const fresh = marks.filter((m) => !shown.has(skill + ':' + m));
  const C = window.HearthriseChronicle;
  for (const m of fresh) {
    shown.add(skill + ':' + m);
    const text = m >= 99 ? 'Mastered ' + skillName(skill) + ' — level 99' : 'Reached ' + skillName(skill) + ' ' + m;
    if (C && typeof C.record === 'function') C.record('skill', text, { id: 'skill:' + skill + ':' + m, level: m });
  }
  if (fresh.includes(99)) masteryQueue.push(skill);
  else if (fresh.length && typeof window.showLevelupCelebration === 'function') {
    window.showLevelupCelebration(skill, fresh[fresh.length - 1]);
  }
}

function onPetLevel(p) {
  if (parked || !p || p.source !== 'server') return;
  const def = window.COMPANIONS && window.COMPANIONS[p.id];
  if (!def || typeof window.hrPetLevelNotice !== 'function') return;
  const level = Number(p.level);
  window.hrPetLevelNotice(level >= COMPANION_MAX_LEVEL
    ? 'Your ' + def.n + ' has grown as far as a companion can'
    : 'Your ' + def.n + ' reached level ' + level);
}

function listenPets() {
  const E = window.HearthriseEvents;
  if (petListening || !E || typeof E.on !== 'function') return;
  E.on('companionLevelUp', onPetLevel);
  petListening = true;
}

function liveTick() {
  if (parked) return;
  wrapNotice();
  listenPets();
  const A = window.HearthriseAuth, P = window.HearthriseProfile, SR = window.HearthriseSkillRecord;
  const uid = A && typeof A.currentUserId === 'function' ? A.currentUserId() : null;
  if (!uid || !SR || typeof SR.skillLevelOf !== 'function') return;
  const key = uid + ':' + (P && typeof P.activeSlot === 'function' ? P.activeSlot() : 0);
  const levels = {};
  for (const id of Object.keys(window.SKILLS_DEF || {})) levels[id] = SR.skillLevelOf(window.G, id);
  const rises = observe(key, levels).concat(fromReceipt(window.G && window.G.lastOfflineSummary, Date.now()));
  for (const r of rises) celebrate(r);
  drainMastery();
}

export function setupClimbMarks() {
  window.HearthriseClimbMarks = {
    observe, fromReceipt, marksCrossed, markFor, masteryLore,
    __reset() { resetFor(null); masteryQueue = []; },
    __setPollEnabled(on) { const was = !parked; parked = !on; return was; },
  };
  wrapNotice();
  listenPets();
  setInterval(() => { try { liveTick(); } catch (e) {} }, 3000);
}
