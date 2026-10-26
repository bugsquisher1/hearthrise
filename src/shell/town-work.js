// ════════════════════════════════════════════════════════════════════════
// src/shell/town-work.js — WHAT THE HERO DOES IN TOWN: GATHER, OR WORK A BENCH.
//
// The one home for the town activities a player starts and stops (designer
// ruling 2026-10-22, lane/b-town-skills): chopping, mining and fishing (a
// gathering node), and every bench recipe (Cooking, Smithing, Crafting,
// Runecrafting, and the Prayer rites the bag's Bury all names). The Gathering
// and crafting window (src/shell/windows/work.js) and the bag's Bury all /
// Cook all (src/shell/windows/inventory/bury.js) both start and stop through
// here, so there is one path, not two.
//
// The server runs it. Start is ONE `set_activity` naming { kind:'gather', id:<node> }
// or { kind:'artisan', id:<recipe> }; the engine checks the level against its own
// catalogue (`activity_locked`), collects whatever ran before, and from then on:
//   · both settle AS THEY GO while the Work window or the bag is open: the
//     viewed character asks one settle per townPollMs (src/session/town-poll.js,
//     the engine's 15 s town floor), so the bag, the skill XP and the line below
//     ("Cooking Raw Shrimp: 12 cooked so far, 30 left.") move every settle
//     (Tyler 2026-10-22: "the bag needs to update in real time");
//   · unwatched, they keep running on the server and the next settle pays all of
//     it: a watched one, the stop below, a hunt's start (party-intents.js
//     settleTownActivity) or the next sign-in. A bench spends the SERVER's bag at
//     its own pace and stops itself when an input runs out; a bench run is also
//     armed to stop a little after the bag should be spent, so the "Done" words
//     land without a press.
// Stop is ONE `set_activity` { kind:'idle' }: the engine pays first. A start
// while something else runs is a switch, also ONE intent (the engine collects the
// old one first), so a player never has to stop before choosing again.
//
// Nothing here moves a number: every count, level and XP a control reads is the
// envelope's. The "Done: 37 Normal Logs, +185 Woodcutting XP." words are the
// difference of two server envelopes. The seconds per action are the shared core's
// interval for the tool the server says the hero holds (display only, sends nothing).
// Between payouts the line, the bag's stacks and the skill bars also count what the
// server's engine has certainly done since its watermark (tickOf: town-ticker.js,
// Tyler 2026-10-23), shown as pending and never spent.
// ════════════════════════════════════════════════════════════════════════
import { TREES, ROCKS, FISH_SPOTS } from '../data/gathering.js?v=0.2.52';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=0.2.52';
import { ITEMS } from '../data/items.js?v=0.2.52';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.52';
import { HUNT_TUNING } from '../data/hunt-tuning.js?v=0.2.52';
import { indexGatherNodes, gatherIntervalMs } from '../core/skill-sim.js?v=0.2.52';
import { indexArtisanRecipes, artisanIntervalMs, bagFullFor } from '../core/artisan-sim.js?v=0.2.52';
import { recipeInputs } from '../core/artisan.js?v=0.2.52';
import { pacedXp } from '../core/pacing.js?v=0.2.52';
import { whole } from '../render/format.js?v=0.2.52';
import { itemName } from './widgets/bits.js?v=0.2.52';
import { skillsOf, heldOf, bagCapOf, drawsOnStorage } from '../session/item-sections.js?v=0.2.52';
import { townWorkRunning } from '../session/town-poll.js?v=0.2.52';
import { predictTown, aheadQty, shownQty, lineParts, aheadStored } from './town-ticker.js?v=0.2.52';
import { skillShortWords } from './intent-words.js?v=0.2.52';

/** Every gathering node the engine runs, by id: { skill, node }. The same index the server builds (hr-accrue catalogue.js). */
export const GATHER_INDEX = indexGatherNodes({ woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS });
/** Every bench recipe, by id: { skill, recipe }. */
export const BENCH_INDEX = indexArtisanRecipes(ARTISAN_RECIPES);

/* A little past the paced time of the last action, so the engine has spent it before the stop collects. */
const SLACK_MS = 2000;
const MAX_WAIT_MS = 30 * 60 * 1000;
const BURNT = 'burnt_food';
/* "12 chopped so far": what one action did, by skill (any other bench "made"). */
const DONE_WORD = Object.freeze({ cooking: 'cooked', woodcutting: 'chopped', mining: 'mined', fishing: 'caught' });

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const skillWord = (s) => (SKILLS_DEF[s] && SKILLS_DEF[s].name) || s;
const stateOf = (cs) => (cs && typeof cs.read === 'function' ? cs.read('state') : null);
const invOf = (cs) => (cs && typeof cs.read === 'function' && cs.read('inventory')) || {};
const eqOf = (cs) => (cs && typeof cs.read === 'function' && cs.read('equipment')) || {};
/* SKILLS FROM STORAGE (Tyler 2026-10-25): what a bench's inputs are counted against, the bag plus the account's
   Storage where the server says so (item-sections.js heldOf). The bag alone (invOf) stays the tools and the room. */
const supplyOf = (cs) => heldOf(cs);
/* Where the inputs are, in words: "in your bag" until the server says Storage counts too. */
const fromWords = (cs) => (drawsOnStorage(cs) ? 'in your bag or Storage' : 'in your bag');

/** A work row: { kind, id, skill, row } for a gathering node or a bench recipe id, or null. */
export function workRow(kind, id) {
  if (kind === 'gather' && own(GATHER_INDEX, id)) return { kind, id, skill: GATHER_INDEX[id].skill, row: GATHER_INDEX[id].node };
  if (kind === 'artisan' && own(BENCH_INDEX, id)) return { kind, id, skill: BENCH_INDEX[id].skill, row: BENCH_INDEX[id].recipe };
  return null;
}

/** What the server says this hero is working on now (a work row), or null. */
export function workOf(cs) {
  const s = stateOf(cs);
  return s && typeof s.active_id === 'string' ? workRow(s.active_kind, s.active_id) : null;
}

/** The item a row makes, or null (a Prayer rite makes nothing). */
export function productOf(w) { return w.kind === 'gather' ? w.row.prod : (w.row.output || null); }

/** How many of the product one action makes: "45" for a rune bind, 1 for most. Gathering's range is its low end. */
export function yieldOf(w) {
  if (w.kind === 'gather') return Array.isArray(w.row.qty) ? w.row.qty[0] : 1;
  return Math.max(1, Number(w.row.outputQty) || 1);
}

/** How many actions `inv` covers for a bench recipe (pass supplyOf: the server's bag + Storage; 0 when an input is missing). */
export function runsOf(recipe, inv) {
  const ins = recipeInputs(recipe);
  let n = Infinity;
  for (const [id, need] of Object.entries(ins)) n = Math.min(n, Math.floor(((inv && inv[id]) || 0) / Math.max(1, need)));
  return n === Infinity ? 0 : n;
}

/* ── "MAKE N" (lane c-work-fixes 2026-10-22; 2026-12-01-bench-count.sql) ──
   A bench run can be told how many to make: the count rides the ONE set_activity and the
   server stops the bench after that many actions (player_state.active_left, projected as the
   `bench_run` section). The choices are 1, 5 or All; the default is 1 for something you WEAR
   or wield (a tool, a weapon, armour: you rarely want two) and All for everything else
   (bars, food, runes, ammo, whetstones: stock you use up). */
export const BENCH_COUNTS = Object.freeze([1, 5, 'all']);

/** The amount a bench row starts on: 1 for gear and tools, 'all' for stock. */
export function defaultCount(w) {
  const out = w && w.kind === 'artisan' ? productOf(w) : null;
  const def = out ? ITEMS[out] : null;
  const gear = !!def && (def.type === 'tool' || (typeof def.slot === 'string' && def.slot !== 'ammo'));
  return gear ? 1 : 'all';
}

/** Actions left on the hero's bench run, from the server (`bench_run.left`), or null (until the bag runs out). */
export function leftOf(cs) {
  const b = cs && typeof cs.read === 'function' ? cs.read('bench_run') : null;
  return b && Number.isInteger(b.left) && b.left > 0 ? b.left : null;
}

/** One action's time in ms, for the tool the server says the hero holds (perks only make it shorter). */
export function actionMs(cs, w) {
  const st = { inventory: invOf(cs), equipment: eqOf(cs) };
  return w.kind === 'gather' ? gatherIntervalMs(st, w.skill, w.row, { items: ITEMS }) : artisanIntervalMs(st, w.skill, w.row, { items: ITEMS });
}

/** XP one action pays at the pacing dial, whole (the server floors the same way). */
export function xpEach(w) { return Math.floor(pacedXp(w.skill, w.row.xp)); }

/** The verb phrase while it runs: "chopping the Normal Tree", "making Bronze Bar". */
function workWords(w) {
  if (w.kind === 'gather') {
    const verb = w.skill === 'woodcutting' ? 'chopping the ' : w.skill === 'mining' ? 'mining the ' : 'fishing at the ';
    return verb + w.row.name;
  }
  const out = productOf(w);
  /* A dish names what goes on the fire ("cooking Raw Shrimp"), any other bench what it makes. */
  if (out && w.skill === 'cooking') return 'cooking ' + itemName(Object.keys(recipeInputs(w.row))[0] || out);
  if (out) return 'making ' + itemName(out);
  /* A Prayer rite makes nothing: its own verb ("Bury Bones" -> "burying Bones"). */
  const [verb, ...rest] = String(w.row.name).split(' ');
  return ((/[^e]e$/.test(verb) ? verb.slice(0, -1) : verb) + 'ing').toLowerCase() + (rest.length ? ' ' + rest.join(' ') : '');
}

/** The action as "You need … to ___" says it: "cook Raw Wolf Meat", "make Bronze Bar", "chop the Oak Tree", "bury Bones". */
export function doWords(w) {
  if (w.kind === 'gather') return (w.skill === 'woodcutting' ? 'chop the ' : w.skill === 'mining' ? 'mine the ' : 'fish at the ') + w.row.name;
  const out = productOf(w);
  if (out && w.skill === 'cooking') return 'cook ' + itemName(Object.keys(recipeInputs(w.row))[0] || out);
  if (out) return 'make ' + itemName(out);
  const [verb, ...rest] = String(w.row.name).split(' ');
  return verb.toLowerCase() + (rest.length ? ' ' + rest.join(' ') : '');
}

/* The server's skill level for a row's skill, or null (not sent yet). */
const levelFor = (cs, skill) => { const sk = skillsOf(cs); return sk && sk[skill] && Number.isInteger(sk[skill].level) ? sk[skill].level : null; };

/** Why this row cannot start now (plain words), or '' when it can. Every number is the server's. */
export function workBlock(cs, w, huntRunning) {
  if (huntRunning) return 'Not while a hunt is running.';
  const lv = levelFor(cs, w.skill);
  if (lv === null) return 'Reading your ' + skillWord(w.skill) + ' level…';
  if (lv < (w.row.req || 1)) return skillShortWords(w.skill, w.row.req, lv, doWords(w));
  if (w.kind === 'artisan') {
    if (w.row.gated) return 'Needs the ' + itemName(w.row.gated) + ' recipe.';
    const inv = supplyOf(cs);
    for (const [id, need] of Object.entries(recipeInputs(w.row))) {
      const have = inv[id] || 0;
      if (have < need) return have ? 'Needs ' + whole(need) + ' ' + itemName(id) + ' (you have ' + whole(have) + ').' : 'No ' + itemName(id) + ' ' + fromWords(cs) + '.';
    }
    /* The bag's room (the engine's own test, artisan-sim.js bagFullFor, on the server's bag and stack cap): the
       product needs a new stack and the bag has none. The engine would stop the bench at once and say so. */
    const full = bagFullFor({ inventory: invOf(cs) }, w.row, w.skill, { bagCap: bagCapOf(cs), burns: false });
    if (full) return 'Your bag is full. Make room for ' + itemName(full) + ' first.';
  }
  return '';
}

/* ── The one run per character: the armed stop and the numbers it started from (display only). ── */
const RUNS = new WeakMap();
const runOf = (cs) => { let r = RUNS.get(cs); if (!r) { r = { timer: null, from: null }; RUNS.set(cs, r); } return r; };

function xpOf(cs, skill) { const sk = skillsOf(cs); return sk && sk[skill] ? sk[skill].xp : null; }

/* The engine refuses a row above its level as `activity_locked`; for town work that is the skill, not a hunt, and the
   words name it with both levels (the catalogue row's, the server's skill: intent-words.js skillShortWords). */
const skillRefusal = (cs, w) => (r) => (r && !r.ok && r.error === 'activity_locked'
  ? Object.assign({}, r, { error: 'level_too_low', skill: { id: w.skill, need: w.row.req || 1, have: levelFor(cs, w.skill), doing: doWords(w) } }) : r);

/**
 * Start (or switch to) a work row: ONE set_activity. `send(fn, busy, done)` is the window's runIntent;
 * `repaint` repaints it when the armed stop fires while something else is in flight. Returns send's promise.
 */
export function startWork(cs, w, send, repaint, words, count) {
  const run = runOf(cs);
  /* A whole count only on a bench row; anything else (All, a gathering node) runs until stopped or out. */
  const n = w.kind === 'artisan' && Number.isInteger(count) && count > 0 ? count : null;
  const activity = n === null ? { kind: w.kind, id: w.id } : { kind: w.kind, id: w.id, count: n };
  return send(() => cs.edgeIntent('set_activity', { activity }).then(skillRefusal(cs, w)), 'Starting…', () => {
    clearTimeout(run.timer);
    run.timer = null;
    const bag = invOf(cs);
    const out = productOf(w);
    run.from = { id: w.id, xp: xpOf(cs, w.skill), skill: w.skill, out, made: out ? bag[out] || 0 : 0, burnt: bag[BURNT] || 0 };
    if (w.kind === 'artisan') {
      const sup = supplyOf(cs);
      const runs = n === null ? runsOf(w.row, sup) : Math.min(n, runsOf(w.row, sup));
      const endAt = Date.now() + runs * actionMs(cs, w) + SLACK_MS;
      const arm = () => { run.timer = setTimeout(fire, Math.max(0, Math.min(MAX_WAIT_MS, endAt - Date.now()))); };
      /* At the end: stop (it collects). On a long run, every MAX_WAIT_MS: one settle (hello) so the bag and XP move. */
      const fire = () => {
        run.timer = null;
        const now = workOf(cs);
        if (!now || now.id !== w.id) { if (repaint) repaint(); return; }
        if (Date.now() < endAt) { if (typeof cs.hello === 'function') cs.hello(); arm(); return; }
        /* Another press is in flight (runIntent answers `busy` and sends nothing): try again in a moment. */
        Promise.resolve(stopWork(cs, send)).then((r) => { if (r && r.error === 'busy' && !run.timer) run.timer = setTimeout(fire, 1000); });
      };
      arm();
    }
    /* The work line already says what runs (nowParts); a caller with its own words (the bag's Bury all) passes them. */
    return words || '';
  });
}

/* "Done: 7 Cooked Wolf Meat, 3 burnt, +245 Cooking XP." — every number a difference of two server envelopes. */
function doneWords(cs, from, xpBefore) {
  const xp = xpOf(cs, from.skill);
  const x0 = from.xp !== null ? from.xp : xpBefore;
  const bag = invOf(cs);
  const parts = [];
  const made = from.out ? (bag[from.out] || 0) - from.made : 0;
  const burnt = from.out ? (bag[BURNT] || 0) - from.burnt : 0;
  if (made > 0) parts.push(whole(made) + ' ' + itemName(from.out));
  if (burnt > 0) parts.push(whole(burnt) + ' burnt');
  if (xp !== null && x0 !== null && xp > x0) parts.push('+' + whole(xp - x0) + ' ' + skillWord(from.skill) + ' XP');
  return parts.length ? 'Done: ' + parts.join(', ') + '.' : 'Stopped.';
}

/** Stop whatever runs: ONE set_activity idle; the engine pays what was done first. */
export function stopWork(cs, send) {
  const run = runOf(cs);
  clearTimeout(run.timer);
  run.timer = null;
  const on = workOf(cs);
  const from = run.from && on && run.from.id === on.id ? run.from
    : on ? { id: on.id, xp: null, skill: on.skill, out: null, made: 0, burnt: 0 } : null;
  const before = from ? xpOf(cs, from.skill) : null;
  return send(() => cs.edgeIntent('set_activity', { activity: { kind: 'idle' } }), 'Finishing…', () => {
    run.from = null;
    return from ? doneWords(cs, from, before) : 'Stopped.';
  });
}

/* ── THE TICKER (town-ticker.js): what the server's engine has certainly done since its watermark. ── */
const TICKS = new WeakMap();
/* Re-predicted at most once per engine sub-step (HUNT_TUNING.stepMs, the one source) of the server's clock, at the
   bucket's start (rounded down, never ahead). */
const STEP_MS = HUNT_TUNING.stepMs;

/**
 * The town ticker for this character now ({ actions, items, xp, unsure }), or null: no town work the server holds,
 * a hunt open, no server clock yet, or a refusal to settle standing on this record (CharacterSession.settleRefusal,
 * until a newer version). Memoised per record and STEP_MS, so every surface of one display tick reads one answer.
 */
export function tickOf(cs) {
  if (!cs || typeof cs.read !== 'function' || typeof cs.serverNow !== 'function') return null;
  const st = stateOf(cs);
  if (!townWorkRunning(st, cs.read('hunt'))) return null;
  const now = cs.serverNow();
  if (!Number.isFinite(now)) return null;
  const at = Math.floor(now / STEP_MS) * STEP_MS;
  const rec = cs.record || null;
  const no = cs.settleRefusal || null;
  const m = TICKS.get(cs);
  if (m && m.rec === rec && m.at === at && m.no === no) return m.tick;
  const refused = !!no && !(rec && no.version !== null && rec.version > no.version);
  /* The Storage a bench draws on after the bag: the supply less the bag (both the server's; empty when Storage does not count). */
  const bag = invOf(cs);
  const storage = {};
  for (const [id, n] of Object.entries(supplyOf(cs))) if (n > (bag[id] || 0)) storage[id] = n - (bag[id] || 0);
  const tick = predictTown({ w: workOf(cs), state: st, skills: skillsOf(cs), inventory: bag, storage, equipment: eqOf(cs),
    left: leftOf(cs), bagCap: bagCapOf(cs), nowMs: at, refused });
  TICKS.set(cs, { rec, at, no, tick });
  return tick;
}

/**
 * How far the run has got, as the line's parts [{ key, text, ahead }]: "12 cooked so far", "2 burnt", "2 more on
 * the fire", "30 Raw Shrimp left". Each number is the SERVER's bag plus the ticker's certain part (`ahead`: it
 * includes some). "So far" counts from the envelope the start answered with (this tab only); after a reload a node
 * says what the bag holds and a bench what is left. Every envelope replaces it; nothing spends it.
 */
export function runParts(cs, w) {
  if (!w) return [];
  const bag = invOf(cs);
  const tick = tickOf(cs);
  const run = RUNS.get(cs);
  const from = run && run.from && run.from.id === w.id ? run.from : null;
  const out = productOf(w);
  const parts = [];
  if (out && from) {
    const d = aheadQty(tick, out);
    const made = Math.max(0, (bag[out] || 0) + d - from.made);
    const burnt = Math.max(0, (bag[BURNT] || 0) - from.burnt);
    parts.push({ key: 'made', text: whole(made) + ' ' + (DONE_WORD[w.skill] || 'made') + ' so far', ahead: d !== 0 });
    if (burnt > 0) parts.push({ key: 'burnt', text: whole(burnt) + ' burnt' });
  } else if (out && w.kind === 'gather') {
    const s = shownQty(tick, out, bag[out] || 0);
    parts.push({ key: 'bag', text: whole(s.qty) + ' in your bag', ahead: s.ahead !== 0 });
  }
  /* A dish that may burn: the actions done, not yet cooked or burnt (the payout says which). */
  if (tick && tick.unsure > 0) parts.push({ key: 'fire', text: whole(tick.unsure) + ' more on the fire', ahead: true });
  if (w.kind === 'artisan') {
    const first = Object.keys(recipeInputs(w.row))[0];
    if (first) {
      /* What is left to spend: the bag plus the Storage the bench draws on, less the ticker's certain spend of both. */
      const d = aheadQty(tick, first) + aheadStored(tick, first);
      const left = Math.max(0, (supplyOf(cs)[first] || 0) + d);
      parts.push({ key: 'left', text: whole(left) + ' ' + itemName(first) + ' left', ahead: d !== 0 });
    }
  }
  return parts;
}

/** The line that says what the hero is doing in town and how far it has got, as parts (town-ticker.js paintLine), or []. */
export function nowParts(cs) {
  const w = workOf(cs);
  if (!w) return [];
  const words = workWords(w);
  const how = runParts(cs, w);
  const tail = w.kind === 'gather' ? 'It keeps going while you are away. A hunt stops it.' : 'It stops when they run out.';
  return lineParts(words.charAt(0).toUpperCase() + words.slice(1), how, '. ' + tail);
}
