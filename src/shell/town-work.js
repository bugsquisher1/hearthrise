// ════════════════════════════════════════════════════════════════════════
// src/shell/town-work.js — WHAT THE HERO DOES IN TOWN: GATHER, OR WORK A BENCH.
//
// The one home for the town activities a player starts and stops (designer
// ruling 2026-10-22, lane/b-town-skills): chopping, mining and fishing (a
// gathering node), and every bench recipe (Cooking, Smithing, Crafting,
// Runecrafting, and Inner Flame's fuels the bag's Burn names). The
// Gathering and crafting window (src/shell/windows/work.js) and the bag's Fuel
// the hearth / Cook all (src/shell/windows/inventory/bury.js) both start and stop through
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
import { TREES, ROCKS, FISH_SPOTS } from '../data/gathering.js';
import { ARTISAN_RECIPES_EVERY as ARTISAN_RECIPES } from '../data/recipes.js';   // the dark (switched) jobs too: a running one is shown; the bench offers one only where the server lists it
import { DRINK_ITEMS } from '../data/drinks.js';
import { ITEMS } from '../data/items.js';
import { SKILLS_DEF } from '../data/skills.js';
import { HUNT_TUNING } from '../data/hunt-tuning.js';
import { indexGatherNodes, gatherIntervalMs, gatherBagFullFor } from '../core/skill-sim.js';
import { indexArtisanRecipes, artisanIntervalMs, bagFullFor } from '../core/artisan-sim.js';
import { recipeInputs, gateOk } from '../core/artisan.js';
import { pacedXp } from '../core/pacing.js';
import { whole } from '../render/format.js';
import { itemName, itemNameFor } from './widgets/bits.js';
import { t } from '../render/player-text.js';
import { skillsOf, heldOf, bagCapOf, drawsOnStorage } from '../session/item-sections.js';
import { townWorkRunning } from '../session/town-poll.js';
import { townActivityWords } from '../session/party-sections.js';
import { predictTown, aheadQty, shownQty, lineParts, aheadStored } from './town-ticker.js';
import { skillShortWords } from './intent-words.js';
import { feeBlock, runsPaid, rowTax, benchPaidWords } from './bench-fee.js';
import { bestTool } from '../core/tools.js';
import { bankOf, shopOf } from '../session/item-sections.js';
import { benchTaxOf, benchRunOf, learnedRecipesOf } from '../session/bench-sections.js';
import { whereToGet, wherePlaces, toolEffect } from './item-lore.js';
import { recipeOutcomes, JEWELRY_ITEMS, JEWEL_PERKS } from '../data/jewelry.js';
import { GATHER_COUNT_DEFAULT } from '../data/hunt-after.js';

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
/* Where the inputs are, in words: "in bag" until the server says Storage counts too. */
const fromWords = (cs) => (drawsOnStorage(cs) ? 'in bag or Storage' : 'in bag');

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

/** The item a row makes, or null (a Hearth fuel makes nothing). */
export function productOf(w) { return w.kind === 'gather' ? w.row.prod : (w.row.output || null); }

/* A Cooking row that goes on the fire. A drink is pressed, brewed or steeped, so it is said as made ("Cooking Turnip: 0 cooked so far" over Turnip Juice, QA 2026-11-04). */
const isDish = (w) => w.skill === 'cooking' && !DRINK_ITEMS[productOf(w)];

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

/* "X" (Andy, Discord 2026-11-12): any whole count the server takes (player_state.active_left, 1..100000). */
export const BENCH_MAX = 100000;
/** A typed count clamped to 1..BENCH_MAX, or null when nothing number-like was typed. */
export function clampCount(raw) {
  const typed = String(raw == null ? '' : raw).trim();
  const n = Math.floor(Number(typed));
  if (!typed || !Number.isFinite(n)) return null;
  return Math.min(BENCH_MAX, Math.max(1, n));
}

/** The amount a bench row starts on: 1 for gear and tools, 'all' for stock. */
export function defaultCount(w) {
  const out = w && w.kind === 'artisan' ? productOf(w) : null;
  const def = out ? ITEMS[out] : null;
  const gear = !!def && (def.type === 'tool' || (typeof def.slot === 'string' && def.slot !== 'ammo'));
  return gear ? 1 : 'all';
}

/** Actions left on the hero's job (a bench run or, since 1009-job-counts.sql, a gathering job), from the server
    (`bench_run.left`), or null (no count: a bench until the bag runs out). */
export function leftOf(cs) {
  const b = cs && typeof cs.read === 'function' ? cs.read('bench_run') : null;
  return b && Number.isInteger(b.left) && b.left > 0 ? b.left : null;
}

/** THE JOB AS THE SERVER HOLDS IT (1009-job-counts.sql; the `bench_run` section): { left, count, next, ended } where `count` is
    the whole count it was set with, `next` its THEN (wait | hunt), and `ended` the last counted job the server ended ({ kind, id,
    count, done, left, next, end: count | stopped, at, next_state?, why? }) or null. Display only: every envelope replaces it. */
export function jobOf(cs) {
  const b = cs && typeof cs.read === 'function' ? cs.read('bench_run') : null;
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const e = b && b.ended && typeof b.ended === 'object' ? b.ended : null;
  return {
    left: leftOf(cs), count: b ? n(b.count) : null, next: b && b.next === 'hunt' ? 'hunt' : 'wait',
    ended: e && typeof e.kind === 'string' && typeof e.id === 'string' && n(e.count) !== null && n(e.done) !== null ? e : null,
  };
}

/** "Then waits in town" / "Then goes back to hunting": what the running counted job does at its end. */
export function nextLineWords(next) { return t(next === 'hunt' ? 'work.now_then_hunt' : 'work.now_then_wait'); }

/** One action's time in ms, for the tool the server says the hero holds (perks only make it shorter). */
export function actionMs(cs, w) {
  const st = { inventory: invOf(cs), equipment: eqOf(cs) };
  return w.kind === 'gather' ? gatherIntervalMs(st, w.skill, w.row, { items: ITEMS }) : artisanIntervalMs(st, w.skill, w.row, { items: ITEMS });
}

/** Actions the supply covers, cut to what the purse pays (the work bench tax: the engine stops the bench there). */
export function affordable(cs, w, runs) {
  const paid = runsPaid(cs, w);
  return paid === null ? runs : Math.min(runs, paid);
}

/**
 * The SERVER-clock ms by which the bench run the server holds has certainly spent its supply (or its count), so the
 * engine stops it on the next settle (the settle that pays its last action ends it: artisan-sim.js); null for anything
 * else (no bench, a hunt open, no watermark). From the server's own record only: its watermark, its bag + Storage, its
 * `bench_run.left`, and SLACK_MS. Report #68: an unwatched bench nobody settled kept saying "Fueling" with its fuel spent.
 */
export function benchSpentAtMs(cs) {
  const st = stateOf(cs);
  const w = workOf(cs);
  if (!w || w.kind !== 'artisan' || !townWorkRunning(st, cs.read('hunt'))) return null;
  const from = Date.parse(st.accrued_to);
  if (!Number.isFinite(from)) return null;
  const left = leftOf(cs);
  const runs = affordable(cs, w, left === null ? runsOf(w.row, supplyOf(cs)) : Math.min(left, runsOf(w.row, supplyOf(cs))));
  return from + runs * actionMs(cs, w) + SLACK_MS;
}

/** About how many pieces an hour of this node brings at `ms` a swing, to the nearest ten: a higher rung swings slower and may bring more, so seconds alone misread it (Andy 2026-11-05). */
export function perHourOf(w, ms) {
  const q = w.row.qty, each = q ? (Number(q[0]) + Number(q[1])) / 2 : 1;
  return Math.round((3600000 / ms) * each / 10) * 10;
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
  /* A dish names what goes on the fire ("cooking Raw Shrimp"), a drink or any other bench what it makes. */
  if (out && isDish(w)) return 'cooking ' + itemName(Object.keys(recipeInputs(w.row))[0] || out);
  if (out) return 'making ' + itemName(out);
  /* A fuel makes nothing: the Great Hearth burns it (src/data/hearth.js; every output-less row is a fuel) */
  return 'fueling the Great Hearth with ' + itemName(w.row.input);
}

/** The action as "You need … to ___" says it: "cook Raw Wolf Meat", "make Bronze Bar", "chop the Oak Tree", "burn Big Bones in the Great Hearth". */
export function doWords(w) {
  if (w.kind === 'gather') return (w.skill === 'woodcutting' ? 'chop the ' : w.skill === 'mining' ? 'mine the ' : 'fish at the ') + w.row.name;
  const out = productOf(w);
  if (out && isDish(w)) return 'cook ' + itemName(Object.keys(recipeInputs(w.row))[0] || out);
  if (out) return 'make ' + itemName(out);
  return 'burn ' + itemName(w.row.input) + ' in the Great Hearth';
}

/* The server's skill level for a row's skill, or null (not sent yet). */
const levelFor = (cs, skill) => { const sk = skillsOf(cs); return sk && sk[skill] && Number.isInteger(sk[skill].level) ? sk[skill].level : null; };

/* The first input a bench row is short of in the bag and Storage, { id, have, need }; else { inHand } for an input the hero wears
   (the bench spends the bag's: Klappa's Club, Steelgrate); else null. */
function inputShortOf(cs, w) {
  const inv = supplyOf(cs);
  const worn = Object.values(eqOf(cs));
  let inHand = null;
  for (const [id, need] of Object.entries(recipeInputs(w.row))) {
    const have = inv[id] || 0;
    if (have < need && worn.includes(id)) { inHand = inHand || id; continue; }
    if (have < need) return { id, have, need };
  }
  return inHand ? { inHand } : null;
}
/* "No Silk Thread in bag or Storage." / "Needs 4 Silk Thread, have 1." */
const shortWords = (cs, s) => (s.have ? 'Needs ' + whole(s.need) + ' ' + itemNameFor(s.id, s.need) + ', have ' + whole(s.have) + '.' : 'No ' + itemName(s.id) + ' ' + fromWords(cs) + '.');

/**
 * workBlock's line when its reason is an input the hero is short of, piece by piece so each place it names can be a link
 * (Tyler 2026-11-08): { head, places } (item-lore.js wherePlaces), or null when another reason holds the line.
 */
export function shortInputLine(cs, w, huntRunning) {
  const why = w.kind === 'artisan' ? workBlock(cs, w, huntRunning) : '';
  const s = why ? inputShortOf(cs, w) : null;
  if (!s || !s.id || !why.startsWith(shortWords(cs, s))) return null;
  return { head: shortWords(cs, s), places: wherePlaces(s.id) };
}

/* A full bag, said once for a bench and a gathering row alike. */
const roomWords = (id) => 'Bag full, no room for ' + itemName(id);

/** Why this row cannot start now (plain words), or '' when it can. Every number is the server's. */
export function workBlock(cs, w, huntRunning) {
  if (huntRunning) return 'Not while a hunt is running.';
  const lv = levelFor(cs, w.skill);
  if (lv === null) return 'Loading ' + skillWord(w.skill) + ' level…';
  if (lv < (w.row.req || 1)) return skillShortWords(w.skill, w.row.req, lv, doWords(w));
  if (w.kind === 'artisan') {
    /* A PATTERN'S RECIPE (src/data/patterns.js) opens for THIS hero once the server says it has read the pattern: the engine's own gate
       (artisan.js gateOk) on the envelope's learned set, fail-closed while unread (bench-sections.js learnedRecipesOf). */
    if (w.row.gated && !gateOk(w.row, learnedRecipesOf(cs))) return 'Needs the ' + itemName(w.row.gated) + ' recipe.';
    /* The row that says what is short says where it comes from (panel 2026-11-01: "No Silk Thread", and no word on where). A worn piece is
       not in the bag, and the bench spends the bag's: said last, so nobody takes a weapon off for a job the rest of the row can't do yet. */
    const short = inputShortOf(cs, w);
    if (short && short.id) { const where = whereToGet(short.id); return shortWords(cs, short) + (where ? ' ' + where + '.' : ''); }
    if (short) return 'Equipped: ' + itemName(short.inHand) + '. Unequip it first.';
    /* The bag's room (the engine's own test, artisan-sim.js bagFullFor, on the server's bag and stack cap): the
       product needs a new stack and the bag has none. The engine would stop the bench at once and say so. */
    const full = bagFullFor({ inventory: invOf(cs) }, w.row, w.skill, { bagCap: bagCapOf(cs), burns: false });
    if (full) return roomWords(full);
    /* The work bench tax (bench-fee.js): the server would stop it at the first craft and say so; say it before the press. */
    const broke = feeBlock(cs, w);
    if (broke) return broke;
  } else {
    /* A gather row's room, by the engine's own test (skill-sim.js gatherBagFullFor): the node stops at once on a full bag. */
    const full = gatherBagFullFor({ inventory: invOf(cs) }, w.row, { bagCap: bagCapOf(cs) });
    if (full) return roomWords(full);
  }
  return '';
}

const TOOLS = Object.freeze(Object.keys(ITEMS).filter((id) => ITEMS[id].type === 'tool'));
const pick = (skill, held) => bestTool(skill, held, {}, ITEMS);

/**
 * THE TOOL LINE, where the seconds are shown (panel 2026-11-01: a row went from 4.3 s to 4.8 s with no word). '' for a skill with no
 * tool a hero can get (the catalogue keeps rows for knives, needles, hammers and rods with no source yet). Reads the server's bag, its
 * Storage and the shop's offers: the tool in the bag that the times below already count, a better one sitting in Storage that doesn't,
 * or the first one to get.
 */
export function toolLine(cs, skill) {
  const row = TOOLS.filter((id) => ITEMS[id].toolSkill === skill && whereToGet(id));
  const inBag = pick(skill, invOf(cs));
  const stored = pick(skill, Object.fromEntries((bankOf(cs) || []).map((r) => [r.id, r.qty])));
  const better = stored && (!inBag || (stored.toolTier || 0) > (inBag.toolTier || 0)) ? itemName(stored.id) + ' in Storage, not counted' : '';
  if (inBag) return ['Tool: ' + itemName(inBag.id), toolEffect(inBag.id), better].filter(Boolean).join('\n');
  if (better) return better;
  if (!row.length) return '';
  const first = row.slice().sort((a, b) => (ITEMS[a].toolTier || 0) - (ITEMS[b].toolTier || 0))[0];
  const sold = ((shopOf(cs) || {}).offers || []).some((o) => o.item === first);
  return 'Tool: none\n' + itemName(first) + ': ' + (sold ? 'Shop' : whereToGet(first)) + '\n' + toolEffect(first);
}

/**
 * What moving `qty` of `id` out of the bag does to that skill's rate, or '' when nothing changes: only a tool in the bag counts, and
 * the best one at that (panel 2026-11-01: axes put away in silence).
 */
export function toolLossWords(cs, id, qty) {
  const it = ITEMS[id];
  if (!it || it.type !== 'tool') return '';
  const inv = invOf(cs);
  const before = pick(it.toolSkill, inv);
  if (!before || before.id !== id) return '';
  const left = (inv[id] || 0) - qty;
  if (left > 0) return '';
  const after = pick(it.toolSkill, Object.assign({}, inv, { [id]: 0 }));
  return skillWord(it.toolSkill) + ' slower without it' + (after ? ', ' + itemName(after.id) + ' takes over' : '');
}

/* ── The one run per character: the armed stop and the numbers it started from (display only). ── */
const RUNS = new WeakMap();
const runOf = (cs) => { let r = RUNS.get(cs); if (!r) { r = { timer: null, from: null }; RUNS.set(cs, r); } return r; };

function xpOf(cs, skill) { const sk = skillsOf(cs); return sk && sk[skill] ? sk[skill].xp : null; }

/* The engine refuses a row above its level as `activity_locked`; for town work that is the skill, not a hunt, and the
   words name it with both levels (the catalogue row's, the server's skill: intent-words.js skillShortWords). */
const skillRefusal = (cs, w) => (r) => (r && !r.ok && r.error === 'activity_locked'
  ? Object.assign({}, r, { error: 'level_too_low', skill: { id: w.skill, need: w.row.req || 1, have: levelFor(cs, w.skill), doing: doWords(w) } }) : r);

/** "Stopped chopping the Normal Tree" when pressing `w` replaces another town job the server says is running, else ''. One job at a time, and the
    press that ends one says so (newcomer panel 2026-11-01: a craft ended the woodcutting in silence). Read before the press lands. */
export function jobReplacedWords(cs, w) {
  const now = workOf(cs), st = stateOf(cs);
  if (!now || now.id === w.id || !townWorkRunning(st, typeof cs.read === 'function' ? cs.read('hunt') : null)) return '';
  const what = townActivityWords(st);
  return what ? 'Stopped ' + what : '';
}

/* AN ERRAND (supabase/migrations/2027-04-27-hearth-errand.sql hr_hearth_errand): a Hearth run of ONE, the bag's "Burn". The server
   remembers the job it interrupts and points the hero back at it when the run ends, so the press stops nothing, and nothing here
   arms a Stop: that Stop would land after the server's way back and end the job (the shell's settle of a spent bench,
   town-poll.js settleSpentBench, ends the run). */
const isErrand = (w, n) => w.kind === 'artisan' && w.skill === 'inner_flame' && n === 1;

/**
 * Start (or switch to) a work row: ONE set_activity. `send(fn, busy, done)` is the window's runIntent;
 * `repaint` repaints it when the armed stop fires while something else is in flight. Returns send's promise.
 */
export function startWork(cs, w, send, repaint, words, count, next) {
  const run = runOf(cs);
  /* A JOB'S COUNT AND "THEN" (1009-job-counts.sql): a gathering job always takes a count (the server refuses one without), a bench
     a whole count or All (null: until its inputs run out, which takes no THEN). The server ends the job at the count and does its
     THEN (the wire's `next`); a Hearth errand of one is a visit and goes back to the job it interrupted, so it sends none. */
  const n = Number.isInteger(count) && count > 0 ? count : w.kind === 'gather' ? GATHER_COUNT_DEFAULT : null;
  const errand = isErrand(w, n);
  const th = n === null || errand ? null : next === 'hunt' ? 'hunt' : 'wait';
  const activity = { kind: w.kind, id: w.id, ...(n !== null ? { count: n } : {}), ...(th ? { next: th } : {}) };
  const replaced = errand ? '' : jobReplacedWords(cs, w);
  return send(() => cs.edgeIntent('set_activity', { activity }).then(skillRefusal(cs, w)), 'Starting…', () => {
    clearTimeout(run.timer);
    run.timer = null;
    const bag = invOf(cs);
    const out = productOf(w);
    run.from = { id: w.id, xp: xpOf(cs, w.skill), skill: w.skill, out, made: out ? bag[out] || 0 : 0, burnt: bag[BURNT] || 0,
      /* a ROLLED job's every grade, so the end line can say what the dice made (src/data/jewelry.js) */
      outs: w.row && w.row.roll ? Object.fromEntries(recipeOutcomes(w.row).map((id) => [id, bag[id] || 0])) : null };
    if ((w.kind === 'artisan' || n !== null) && !errand) {
      const sup = supplyOf(cs);
      const runs = w.kind === 'gather' ? n : affordable(cs, w, n === null ? runsOf(w.row, sup) : Math.min(n, runsOf(w.row, sup)));
      const endAt = Date.now() + runs * actionMs(cs, w) + SLACK_MS;
      let asks = 0;
      const arm = () => { run.timer = setTimeout(fire, Math.max(0, Math.min(MAX_WAIT_MS, endAt - Date.now()))); };
      /* At the end of a run on All: stop (it collects). A COUNTED job is the server's to end (1009-job-counts.sql): its end runs
         its THEN, which a Stop would not, so the end asks for a settle (hello), and again in a moment while the job still shows.
         On a long run, every MAX_WAIT_MS: one settle so the bag and XP move. */
      const fire = () => {
        run.timer = null;
        const now = workOf(cs);
        if (!now || now.id !== w.id) { if (repaint) repaint(); return; }
        if (Date.now() < endAt) { if (typeof cs.hello === 'function') cs.hello(); arm(); return; }
        if (n !== null) {
          if (typeof cs.hello === 'function' && asks++ < 5) { cs.hello(); run.timer = setTimeout(fire, SLACK_MS * 2); }
          return;
        }
        /* Another press is in flight (runIntent answers `busy` and sends nothing): try again in a moment. */
        Promise.resolve(stopWork(cs, send)).then((r) => { if (r && r.error === 'busy' && !run.timer) run.timer = setTimeout(fire, 1000); });
      };
      arm();
    }
    /* The work line already says what runs (nowParts); a caller with its own words (the bag's Bury all) passes them. */
    return [replaced, words].filter(Boolean).join(' ');
  });
}

/* What a rolled run made, grade by grade, from two server envelopes: "41 Banded Signet", "3 Fine (2 Keen, 1 Surge)", "1 Hallmarked (Keen, Surge)". */
export function rolledWords(outs, bag) {
  const plain = [], grade = { fine: new Map(), hallmarked: new Map() };
  for (const [id, was] of Object.entries(outs)) {
    const n = (bag[id] || 0) - was;
    if (n <= 0) continue;
    const it = JEWELRY_ITEMS[id];
    if (!it) { plain.push(whole(n) + ' ' + itemNameFor(id, n)); continue; }
    const label = Object.keys(it.jewelPerks).map((p) => (JEWEL_PERKS[p] ? JEWEL_PERKS[p].name : p)).join(' and ');
    grade[it.jewelGrade].set(label, (grade[it.jewelGrade].get(label) || 0) + n);
  }
  const said = (m, word, each) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return total ? [whole(total) + ' ' + word + ' (' + [...m].map(([l, n]) => (each ? whole(n) + ' ' : '') + l).join(', ') + ')'] : [];
  };
  return plain.concat(said(grade.fine, 'Fine', true), said(grade.hallmarked, 'Hallmarked', grade.hallmarked.size > 1 || [...grade.hallmarked.values()].some((n) => n > 1)));
}

/* "Done: 7 Cooked Wolf Meat, 3 burnt, +245 Cooking XP." — every number a difference of two server envelopes. */
function doneWords(cs, from, xpBefore, sinceMs) {
  const xp = xpOf(cs, from.skill);
  const x0 = from.xp !== null ? from.xp : xpBefore;
  const bag = invOf(cs);
  const parts = [];
  const made = from.out && !from.outs ? (bag[from.out] || 0) - from.made : 0;
  const burnt = from.out ? (bag[BURNT] || 0) - from.burnt : 0;
  if (made > 0) parts.push(whole(made) + ' ' + itemNameFor(from.out, made));
  if (from.outs) parts.push(...rolledWords(from.outs, bag));
  if (burnt > 0) parts.push(whole(burnt) + ' burnt');
  if (xp !== null && x0 !== null && xp > x0) parts.push('+' + whole(xp - x0) + ' ' + skillWord(from.skill) + ' XP');
  const paid = benchPaidWords(cs, from.id, sinceMs);
  if (paid) parts.push(paid);
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
  const was = stateOf(cs);
  const sinceMs = was ? Date.parse(was.active_since) : NaN;
  return send(() => cs.edgeIntent('set_activity', { activity: { kind: 'idle' } }), 'Finishing…', () => {
    run.from = null;
    return from ? doneWords(cs, from, before, sinceMs) : 'Stopped.';
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
    left: leftOf(cs), bagCap: bagCapOf(cs), nowMs: at, refused, tax: rowTax(cs, workOf(cs)) });
  TICKS.set(cs, { rec, at, no, tick });
  return tick;
}

/** A gathering row's "N in bag", as the line above it and the bag window show it: the server's count, plus what the
    ticker is sure of on the node running (blind playtest 2026-10-31: "2 caught so far · 0 in your bag"). Nothing spends it. */
export function gatherBagWords(cs, w, running) {
  const out = productOf(w);
  return whole(shownQty(running ? tickOf(cs) : null, out, invOf(cs)[out] || 0).qty) + ' in bag';
}

/**
 * A COUNTED bench run as the server holds it, or null for a run until an input runs out (Andy 2026-11-18: the work line read
 * "8,300 Blank Rune left. Stops when materials run out" over a run of 300). { left, of, ahead, short }: `left` the server's
 * bench_run.left less the ticker's certain actions (`ahead`: it took some); `of` the run's whole count, the server's tally of this
 * run's crafts (bench_tax.run, one run per recipe and start: 2027-02-19-bench-tax.sql) plus its count left, null when no tally is
 * sent; `short` when the server's bag and Storage cover fewer actions than the count left, so the inputs stop it first.
 */
function countedRun(cs, w) {
  const left = w ? leftOf(cs) : null;
  if (left === null) return null;
  const tick = tickOf(cs);
  const done = tick ? tick.actions : 0;
  /* `of`: the job's whole count as the server holds it (1009-job-counts.sql bench_run.count); before it, the bench tax's tally */
  const job = jobOf(cs);
  const st = stateOf(cs);
  const run = benchTaxOf(cs) ? benchRunOf(cs) : undefined;
  const mine = !!run && run.recipe === w.id && run.since === Date.parse(st && st.active_since);
  const tally = { of: run === undefined ? null : left + (mine ? run.crafts : 0) };
  return { left: Math.max(0, left - done), of: job.count !== null && job.count >= left ? job.count : tally.of, ahead: done > 0, next: job.next,
    short: w.kind === 'artisan' && runsOf(w.row, supplyOf(cs)) < left };
}

/**
 * How far the run has got, as the line's parts [{ key, text, ahead }]: "12 cooked so far", "2 burnt", "2 more on
 * the fire", "30 Raw Shrimp left" ("1 to go", byRun below). Each number is the SERVER's bag plus the ticker's certain part (`ahead`: it
 * includes some). "So far" counts from the envelope the start answered with (this tab only); after a reload a node
 * says what the bag holds and a bench what is left. Every envelope replaces it; nothing spends it. `byRun`: a COUNTED run (the
 * server's bench_run.left) says what the run has to go, not the stock behind it: the bag's line. `counted` (countedRun): the work
 * line's count, "45 of 300 left", where the row under it says "Working on it now, 45 left".
 */
export function runParts(cs, w, byRun, counted) {
  if (!w) return [];
  const bag = invOf(cs);
  const tick = tickOf(cs);
  const run = RUNS.get(cs);
  const from = run && run.from && run.from.id === w.id ? run.from : null;
  const out = productOf(w);
  const parts = [];
  if (out && from) {
    const d = aheadQty(tick, out);
    /* a rolled run: every grade it made counts (src/data/jewelry.js) */
    const made = from.outs ? Object.entries(from.outs).reduce((a, [id, was]) => a + Math.max(0, (bag[id] || 0) - was), 0)
      : Math.max(0, (bag[out] || 0) + d - from.made);
    const burnt = Math.max(0, (bag[BURNT] || 0) - from.burnt);
    parts.push({ key: 'made', text: whole(made) + ' ' + (w.skill === 'cooking' && !isDish(w) ? 'made' : DONE_WORD[w.skill] || 'made') + ' so far', ahead: d !== 0 });
    if (burnt > 0) parts.push({ key: 'burnt', text: whole(burnt) + ' burnt' });
  } else if (out && w.kind === 'gather') {
    const s = shownQty(tick, out, bag[out] || 0);
    parts.push({ key: 'bag', text: whole(s.qty) + ' in bag', ahead: s.ahead !== 0 });
  }
  /* A dish that may burn: the actions done, not yet cooked or burnt (the payout says which). */
  if (tick && tick.unsure > 0) parts.push({ key: 'fire', text: whole(tick.unsure) + (w.row.roll ? ' more at the bench, grade still to come' : ' more on the fire'), ahead: true });
  if (counted) {
    const n = whole(counted.left);
    parts.push({ key: 'left', text: counted.of === null ? t('work.now_left', { n }) : t('work.now_left_of', { n, count: whole(counted.of) }), ahead: counted.ahead });
  } else if (w.kind === 'artisan') {
    const first = Object.keys(recipeInputs(w.row))[0];
    if (first) {
      /* What is left to spend: the bag plus the Storage the bench draws on, less the ticker's certain spend of both. */
      const d = aheadQty(tick, first) + aheadStored(tick, first);
      const left = Math.max(0, (supplyOf(cs)[first] || 0) + d);
      /* "Burn" is a run of ONE: its line says what the run has to go, never the stock (live v0.2.135: one Bone fed
         read "2,529 Bones left"): the server's count less the ticker's certain actions. */
      const run = byRun ? leftOf(cs) : null;
      const need = Math.max(1, recipeInputs(w.row)[first] || 1);
      if (run !== null) parts.push({ key: 'left', text: t('work.run_to_go', { n: whole(Math.max(0, Math.min(run - Math.round(-d / need), Math.floor(left / need)))) }), ahead: d !== 0 });
      else parts.push({ key: 'left', text: whole(left) + ' ' + itemNameFor(first, left) + ' left', ahead: d !== 0 });
    }
  }
  return parts;
}

/** The line that says what the hero is doing in town and how far it has got, as parts (town-ticker.js paintLine), or []. */
export function nowParts(cs) {
  const w = workOf(cs);
  if (!w) return [];
  const words = workWords(w);
  /* A counted run says its own count, ends at it and says what the hero does then (1009-job-counts.sql); it says the inputs stop
     it only where they run out first. A gathering job from before counts runs until a hunt starts. */
  const run = countedRun(cs, w);
  const how = runParts(cs, w, false, run);
  const tail = run && !run.short ? nextLineWords(run.next) : w.kind === 'gather' ? t('work.now_gather') : t('work.now_stops_out');
  return lineParts(words.charAt(0).toUpperCase() + words.slice(1), how, tail && '. ' + tail);
}
