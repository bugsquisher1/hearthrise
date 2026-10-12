// ════════════════════════════════════════════════════════════════════════
// src/core/spine-pointer.js — WHICH STEP THE POINTER SHOWS, AND WHAT GO DOES.
//
// Pure. The caller hands in the FACTS object src/core/spine-progress.js
// documents (the server's projection), widened by four record readings:
//   gold       the record's gold, or null while unknown
//   equipment  the record's worn set { slot: itemId|null }, or null
//   claimed    { questId: true } from the envelope's claimed quest rows, or
//              null when no complete statement has landed
// and the pointer rows (src/data/spine-pointer.js). Nothing here reads G, the
// DOM or a clock; a value the server has not stated is UNKNOWN (null) and an
// unknown is never "done", never "met" and never claimable.
//
// THE CURRENT STEP is the first row that is not done, or that is done with
// its server reward still unclaimed (so the button reads Claim before the bar
// moves on). `wears`, `item` and `cleared` needs are SOFT: the worn set and
// the bag can fall after the step, and no server fact counts a dungeon clear
// yet, so each counts as met once a later step is fully done. Taking the boots
// off never sends a veteran back to step 7.
// ════════════════════════════════════════════════════════════════════════

import { combatLevelOf } from './spine-progress.js?v=571';
import { levelFromXp } from './xp.js?v=571';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const SOFT = new Set(['wears', 'item', 'cleared']);

/** The server's figure a need is measured against, or null when unknown. */
export function factValue(facts, need) {
  const f = facts || {};
  switch (need && need.fact) {
    case 'count': {
      const c = f.counts;
      if (own(c, need.key) && fin(c[need.key])) return c[need.key];
      return f.countsComplete === true ? 0 : null;
    }
    case 'combat': return combatLevelOf(f);
    case 'level': {
      const s = f.skills;
      if (!s || typeof s !== 'object') return null;
      const xp = own(s, need.skill) ? Number(s[need.skill]) : 0;
      return fin(xp) ? levelFromXp(xp) : null;
    }
    case 'item': {
      const b = f.bag;
      if (!b || typeof b !== 'object') return null;
      return fin(b[need.id]) ? b[need.id] : 0;
    }
    case 'gold': return fin(f.gold) ? f.gold : null;
    case 'property': return fin(f.property) ? f.property : null;
    case 'workers': return fin(f.workers) ? f.workers : null;
    case 'cleared': {
      const c = f.counts, k = 'dungeon_clear:' + need.dungeon;
      return own(c, k) && fin(c[k]) ? c[k] : null;
    }
    case 'wears': {
      const e = f.equipment;
      if (!e || typeof e !== 'object') return null;
      return e[need.slot] ? 1 : 0;
    }
    default: return null;
  }
}

/** true, false, or null when the server has not stated it. */
export function needHolds(facts, need) {
  const v = factValue(facts, need);
  return v === null ? null : v >= need.min;
}

const holdsAll = (facts, row) => row.need.length > 0 && row.need.every((n) => needHolds(facts, n) === true);

/** Which rows are done. A soft need (one that can fall, or that the server
    cannot state yet) is forgiven behind the furthest step that is fully done. */
export function doneSteps(facts, rows) {
  const list = Array.isArray(rows) ? rows : [];
  let furthest = 0;
  list.forEach((r) => { if (holdsAll(facts, r)) furthest = Math.max(furthest, r.step); });
  return list.map((r) => r.need.length > 0 && r.need.every((n) => needHolds(facts, n) === true
    || (SOFT.has(n.fact) && furthest > r.step)));
}

/** Is this row's linked quest complete on the server's count and not yet paid? */
export function claimable(facts, row, quests) {
  const q = row && row.quest && quests ? quests[row.quest] : null;
  if (!q || !facts || !facts.claimed || typeof facts.claimed !== 'object') return false;
  if (facts.claimed[row.quest] === true) return false;
  const n = factValue(facts, { fact: 'count', key: q.checkKey });
  return n !== null && n >= q.goal;
}

/** Each part with its figure; in a chain, a later part met means the earlier ones are spent. */
export function partStates(facts, row) {
  const out = row.parts.map((p) => {
    const have = factValue(facts, p.need);
    return { part: p, have, min: p.need.min, known: have !== null, met: have !== null && have >= p.need.min };
  });
  if (row.chain) {
    for (let i = out.length - 2; i >= 0; i--) if (out[i + 1].met) out[i].met = true;
  }
  return out;
}

/**
 * THE POINTER.
 * @param facts   the server facts (see header)
 * @param rows    src/data/spine-pointer.js POINTER_STEPS
 * @param quests  src/data/goal-catalogue.js QUEST_REWARDS
 * @returns {{ready, finished, row, step, next, parts, go, reward, doneIds}}
 *   `next` is the row after this one (the next rung), or null on the last.
 *   There is no denominator: the road goes on past any "of N".
 *   go.kind: 'claim' (quest) or 'go' (route of the first part not met).
 */
export function pointerModel(facts, rows, quests) {
  const list = Array.isArray(rows) ? rows : [];
  const ready = !!facts && facts.countsComplete === true;
  const done = doneSteps(facts, list);
  const doneIds = list.filter((r, i) => done[i]).map((r) => r.id);
  const i = list.findIndex((r, k) => !done[k] || claimable(facts, r, quests));
  if (i < 0) return { ready, finished: true, row: null, step: null, next: null, parts: [], go: null, reward: null, doneIds };
  const row = list[i];
  const parts = partStates(facts, row);
  let go;
  if (done[i]) go = { kind: 'claim', quest: row.quest };
  else {
    /* Every part met but the step not confirmed (boots bought, never
       crafted): Go still lands on the step's first door. */
    const first = parts.find((p) => !p.met) || parts[0];
    go = { kind: 'go', route: first ? first.part.go : null };
  }
  const q = row.quest && quests ? quests[row.quest] : null;
  const reward = q ? { gold: q.gold || 0, items: Object.assign({}, q.items) } : null;
  return { ready, finished: false, row, step: row.step, next: list[i + 1] || null, parts, go, reward, doneIds };
}

/**
 * THE UNLOCK MOMENT, first-sighting style (src/features/climb-marks.js): the
 * first reading is a silent baseline, so a reload or a second device never
 * replays a moment; afterwards each newly done step is announced once.
 * @returns {{seen: Set<string>, fresh: string[]}}
 */
export function newlyDone(seen, doneIds) {
  const ids = Array.isArray(doneIds) ? doneIds : [];
  if (!seen) return { seen: new Set(ids), fresh: [] };
  const fresh = ids.filter((id) => !seen.has(id));
  const next = new Set(seen);
  fresh.forEach((id) => next.add(id));
  return { seen: next, fresh };
}

/** Every fact a step can need is stated, so a baseline is a real baseline. */
export function momentsKnown(facts) {
  const f = facts || {};
  return f.countsComplete === true && !!f.skills && fin(f.property) && fin(f.workers) && !!f.equipment;
}
