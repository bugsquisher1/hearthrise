// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/journal.mjs — WHAT HAPPENED, WITH ITS EVIDENCE.
//
// PURE bookkeeping. The runner hands it every action, the server's answer and the hero's holdings
// before and after (bag + Storage + worn, read from the server's own envelope), and it keeps:
//   obtained   item -> { first: in-game hour, via: [labels], hero }   a count that ROSE while an action ran
//   used       item -> { first, via: [labels], hero }                  a count that FELL (sold, eaten, a craft's
//                                                                     input, planted, paid), or a piece worn
//   crafted    recipe -> { first, times, made }                        an artisan job whose output rose
//   gathered   node -> { first, items }                                a gathering job whose product rose
//   grounds    ground:tier -> { first, minutes, deaths, ends: {reason: n}, level }
//   sinks      offer -> { first, gold } | refusals                     a purchase the server took
//   refusals   [{ hour, hero, action, error, body }]                   every no, quoted
//   stalls     [{ hour, hero, why, state }]                            the brain had nothing sensible to do
//   samples    [{ hour, hero, level, xp, skills, gold, stamina }]      the pace line
// The labels come from the action ("drop on mosslight_glade", "made by smithing", "sold"), so the report
// can say how a thing was reached, not only that it was.
// ════════════════════════════════════════════════════════════════════════

import { ITEMS } from '../../../src/data/items.js';

/** Holdings as one map: item -> count, over bag, Storage and the worn set. */
export function holdingsOf(v) {
  const out = {};
  for (const src of [v.bag || {}, v.storage || {}]) for (const [id, n] of Object.entries(src)) out[id] = (out[id] || 0) + Number(n || 0);
  for (const id of Object.values(v.worn || {})) if (id) out[id] = (out[id] || 0) + 1;
  return out;
}

export function newJournal() {
  return { obtained: {}, used: {}, crafted: {}, gathered: {}, grounds: {}, sinks: {}, refusals: [], stalls: [], samples: [], actions: [], kills: {}, notes: [] };
}

const first = (book, id, hour, hero, label) => {
  const row = book[id] || (book[id] = { first: hour, hero, via: [] });
  if (!row.via.includes(label)) row.via.push(label);
  return row;
};

/** What an action is called in the evidence: where a drop came from, what a craft fed. */
export function labelOf(a) {
  switch (a.type) {
    case 'hunt': return { up: 'drop on ' + a.ground + (a.tier && a.tier !== 'normal' ? ' (' + a.tier + ')' : ''), down: 'used on a hunt (' + a.ground + ')' };
    case 'work': return a.kind === 'gather' ? { up: 'gathered (' + a.id + ')', down: 'gathering (' + a.id + ')' } : { up: 'made by ' + a.skill + ' (' + a.id + ')', down: a.skill + ' input (' + a.id + ')' };
    case 'sell': return { up: 'sold (?)', down: 'sold to the shop' };
    case 'buy': return { up: 'bought (' + a.offer + ')', down: 'paid for ' + a.offer };
    case 'unlock': return { up: 'unlocked (' + a.offer + ')', down: 'paid for ' + a.offer };
    case 'plant': return { up: 'planted (?)', down: 'planted (' + a.crop + ')' };
    case 'harvest': return { up: 'harvested', down: 'harvest (?)' };
    case 'equip': return { up: 'equip (?)', down: 'equip (?)' };
    case 'burn': return { up: 'burn (?)', down: 'burnt in the Great Hearth' };
    default: return { up: a.type, down: a.type };
  }
}

/**
 * One action's evidence. `before` / `after` are holdingsOf() maps; `answer` the hands' entry (ok, error, body).
 * Equip moves a piece from the bag to the worn set (holdings do not change): a piece seen worn is "used: worn".
 */
export function record(j, { hour, hero, action, answer, before, after, wornAfter }) {
  const lab = labelOf(action);
  j.actions.push({ hour: round(hour), hero, rule: action.rule, type: action.type, what: action.ground || action.id || action.offer || action.crop || (action.lines && action.lines.map((l) => l.item).join(',')) || (action.map && Object.values(action.map).join(',')) || '',
    ok: !answer || answer.ok, error: answer && !answer.ok ? answer.error : null, why: action.why });
  if (answer && !answer.ok) {
    j.refusals.push({ hour: round(hour), hero, action: action.type + ' ' + (action.key || ''), error: answer.error, body: trim(answer.body) });
    return;
  }
  const ids = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const id of ids) {
    const d = (after[id] || 0) - (before[id] || 0);
    if (d > 0 && !/\(\?\)$/.test(lab.up)) first(j.obtained, id, round(hour), hero, lab.up);
    if (d < 0 && !/\(\?\)$/.test(lab.down)) first(j.used, id, round(hour), hero, lab.down);
    if (d > 0 && action.type === 'work' && action.kind === 'artisan') {
      const r = j.crafted[action.id] || (j.crafted[action.id] = { first: round(hour), hero, times: 0, made: {} });
      r.made[id] = (r.made[id] || 0) + d;
    }
    if (d > 0 && action.type === 'work' && action.kind === 'gather') {
      const r = j.gathered[action.id] || (j.gathered[action.id] = { first: round(hour), hero, items: {} });
      r.items[id] = (r.items[id] || 0) + d;
    }
  }
  if (action.type === 'work' && action.kind === 'artisan' && j.crafted[action.id]) j.crafted[action.id].times++;
  /* a tool held through a gathering job of its skill was used by it (items.js toolSkill; the engine's speed boost reads it) */
  if (action.type === 'work' && action.kind === 'gather') for (const id of Object.keys(before || {})) if (ITEMS[id] && ITEMS[id].toolSkill === action.skill) first(j.used, id, round(hour), hero, action.skill + ' tool');
  /* an inner_flame bench burns its input with no output: the input fell, the skill rose (the journal sees the fall) */
  for (const id of Object.values(wornAfter || {})) if (id) first(j.used, id, round(hour), hero, 'worn');
  if ((action.type === 'buy' || action.type === 'unlock') && !j.sinks[action.offer]) j.sinks[action.offer] = { first: round(hour), hero };
}

/** The brain had nothing sensible to do: the hero's state goes with it, so the finding can be read alone. */
export function stall(j, { hour, hero, why, v }) {
  j.stalls.push({ hour: round(hour), hero, why, state: { level: v.level, gold: v.gold, staminaMin: Math.round(v.staminaMin), skills: v.skills, bagKinds: Object.keys(v.bag).length, worn: v.worn } });
}

export function sample(j, { hour, hero, v, huntH = null }) {
  j.samples.push({ hour: round(hour), hero, huntH: huntH === null ? null : round(huntH), level: v.level, xp: v.levelXp, skills: { ...v.skills }, gold: v.gold, staminaMin: Math.round(v.staminaMin) });
}

/** A hunt stretch's outcome on one ground and tier. */
export function huntOutcome(j, { hour, hero, ground, tier, minutes, end, level, lastLevel, tally }) {
  const k = ground + ':' + tier;
  const g = j.grounds[k] || (j.grounds[k] = { first: round(hour), hero, level, minutes: 0, stretches: 0, deaths: 0, ends: {}, xp: 0, kills: 0, coins: 0, supplyGold: 0 });
  g.minutes += minutes;
  g.stretches++;
  if (end) g.ends[end] = (g.ends[end] || 0) + 1;
  if (end === 'died') g.deaths++;
  if (tally) { g.xp += tally.xp; g.kills += tally.kills; g.coins += tally.coins; g.supplyGold += tally.supplyGold; }
  g.lastLevel = lastLevel || level;
  g.xpPerH = g.minutes > 0 ? Math.round(g.xp / (g.minutes / 60)) : null;
  g.netPerH = g.minutes > 0 ? Math.round((g.coins - g.supplyGold) / (g.minutes / 60)) : null;
}

/** Several shards' journals as one: a book's row keeps its earliest hour and every label; lists concatenate. */
export function mergeJournals(list) {
  const out = newJournal();
  for (const j of list) {
    for (const book of ['obtained', 'used']) for (const [id, row] of Object.entries(j[book] || {})) {
      const have = out[book][id];
      if (!have) out[book][id] = { ...row, via: row.via.slice() };
      else { for (const l of row.via) if (!have.via.includes(l)) have.via.push(l); if (row.first < have.first) { have.first = row.first; have.hero = row.hero; } }
    }
    for (const book of ['crafted', 'gathered', 'sinks', 'grounds']) for (const [id, row] of Object.entries(j[book] || {})) {
      const have = out[book][id];
      if (!have || row.first < have.first) out[book][id] = row;
    }
    for (const list2 of ['refusals', 'stalls', 'samples', 'actions', 'notes']) out[list2].push(...(j[list2] || []));
  }
  return out;
}

const round = (h) => Math.round(h * 100) / 100;
function trim(b) {
  if (!b || typeof b !== 'object') return b;
  const out = {};
  /* the answer's own words: scalars as they are, a list or object (a party's `seats`, a refusal's `detail`) as short JSON; the envelope's sections never */
  for (const [k, v] of Object.entries(b)) {
    if (typeof v !== 'object' || v === null) out[k] = typeof v === 'string' ? v.slice(0, 200) : v;
    else if (['seats', 'detail', 'missing', 'need', 'why'].includes(k)) out[k] = JSON.stringify(v).slice(0, 400);
  }
  return out;
}
