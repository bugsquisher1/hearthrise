// ════════════════════════════════════════════════════════════════════════
// tests/away-receipt-journal.mjs — THE AWAY RECEIPT THE SERVER KEEPS, AND THE
//                                  NINETY-SECOND ONE IT MUST NOT.
//
// Ruling (Principal Game Designer, 2026-09-07): THE REALM KEEPS THE LAST
// AWAY-CLASSIFIED RECEIPT, because a receipt the server PAID is progression,
// not preference. `G.lastOfflineSummary` is a NO_SYNC field (src/net/events.js
// :93) so one reload deletes the Home "While you were away" card for a night the
// server already paid, journalled and banked.
//
// ── THE TWO WAYS THIS FEATURE CAN GO WRONG, AND THEY PULL OPPOSITE WAYS ─────
//   A. IT WRITES TOO LITTLE — an away night stores nothing and the card is still
//      empty after a reload. That is the bug this feature exists to delete.
//   B. IT WRITES TOO OFTEN — the 90 s settle cadence stores a receipt on every
//      tick. That is the game_events mistake with a new name: 1.6M rows /
//      229 MB from SIX players in FOUR days, by journalling every event. At the
//      cadence, one column write per 90 s per character is ~40/hour each; at
//      100x the current players that is a write storm on the hottest row in the
//      database, for a card nobody asked to be re-rendered.
// A guard that only checked (A) would pass on a build that shipped (B), which is
// why the sync case is asserted as loudly as the away case, ON BOTH SIDES.
//
// ── WHAT IT GRADES, AND WHY IT CAN ───────────────────────────────────────────
//   1. THE SHIPPED BUILDER, not a transcription. `awayReceiptFor` lives in
//      supabase/functions/hr-accrue/away-receipt.js — plain ESM that imports in
//      Node and Deno — precisely so this file can import THE CODE THAT DEPLOYS.
//      An inline helper in index.ts (Deno TypeScript) could only be tested by
//      copying it here, and a guard that grades a copy stays green while the
//      shipped code drifts.
//   2. THE SHIPPED SQL, executed. hr_apply is called FOR REAL on a PGlite replay
//      of the whole migration chain: a valid receipt LANDS and is PROJECTED, and
//      an oversized / unknown-key / negative / sync-sized one is REFUSED with
//      `bad_receipt`. A string-match on the migration would prove only that
//      somebody typed the word.
//   3. THE TWO ALLOWLISTS AGREE. hr_apply REFUSES an unknown key rather than
//      ignoring it, so a field added to the builder and not to c_receipt_keys
//      does not degrade — it 409s every away settle in production. The lists are
//      compared field for field.
//   4. THE THREE COPIES OF SYNC_MAX_MS AGREE (src/net/accrue.js, away-receipt.js,
//      the migration). A classifier that means 10 minutes on one side and 10
//      seconds on another is case (B) wearing a green tick.
//   5. index.ts RECOMPUTES the receipt on every degrade attempt. The clamp
//      ladder halves the span; a receipt computed ONCE would be refused as
//      sync-sized after a halving and 409 the whole absence over a card.
//   6. A RESTORED RECEIPT REACHES NO CREDITING SEAM (F1, security 2026-09-07).
//      The client seeds `G.lastOfflineSummary` from the projection so the Home
//      card survives a reload — and a seeded receipt classifies as 'away' by
//      construction, which is exactly what legacy.js's `creditServerAwayKills`
//      credits on. Uncorrected, every reload-then-switch re-credited last
//      night's kills into lifetime `stats.kills`, the kill dailies and — through
//      the `updateDaily` wrapper chain the Muster hangs off — into
//      `world_event_contribute(p_event_key, p_points)` on a SHARED world-event
//      meter, with client-supplied points. Both defences are graded: the seam
//      refuses a `restored` summary AT SOURCE, and the one shipped call site
//      passes the receipt THIS envelope paid for (`written.paidReceipt`) rather
//      than reading the ambient holder.
//   7. THE CLASSIFIER READS THE CREDITED SPAN, NOT THE EARNING SPAN, driven
//      through the real engine on the b345 night (12 h absence, eight Raw Shrimp
//      gone in 30 s). `windowEnvelope` publishes both onto one summary on
//      adjacent lines; reading the wrong one deletes the receipt from the exact
//      absence the card exists to explain.
//   8. THE CARD IS NEVER WORTH THE NIGHT (F2). `bad_receipt` is not a clamp, so
//      the degrade ladder never sees it: one receipt the database disagrees with
//      would 409 EVERY away settle for EVERY player until a redeploy.
//      `receiptRescue` re-applies the same delta with the key deleted, and the
//      SQL half proves hr_apply then accepts it.
//   9. BOTH MAP BOUNDS ARE PROVED SEPARATELY. The 2 KB size door (V2) is checked
//      BEFORE the 64-entry cap (V7), and the oversized fixture is 10 KB across
//      400 entries — so it trips SIZE and, until AWAY-RECEIPT-35c, the entry cap
//      had no executing proof anywhere and could have been deleted silently.
//
// Run GREEN:  node tests/away-receipt-journal.mjs
// Prove RED:  node tests/away-receipt-journal.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';
import { bootReplay } from './schema-replay.mjs';
import {
  awayReceiptFor, withAwayReceipt, classifiesAway, receiptRescue,
  AWAY_RECEIPT_KEYS, AWAY_RECEIPT_SYNC_MAX_MS, AWAY_RECEIPT_MAX_LADDER,
  AWAY_RECEIPT_MAX_MAP,
} from '../supabase/functions/hr-accrue/away-receipt.js';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from '../supabase/functions/hr-accrue/catalogue.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = '2026-09-07-last-away-receipt.sql';
const MIG_PATH = join(ROOT, 'supabase', 'migrations', MIG);
const INDEX_TS = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts');
const CLIENT = join(ROOT, 'src', 'net', 'accrue.js');
const LEGACY = join(ROOT, 'src', 'legacy.js');
const RECORD = join(ROOT, 'src', 'net', 'record.js');

const SELFTEST = process.argv.includes('--selftest');
let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

const uid = '000000a7-0000-0000-0000-000000000001';

/* ── THE FIXTURE SPANS ──────────────────────────────────────────────────────
   Shaped exactly like `computeAccrual`'s return (`{ grantMs, foodEaten, summary }`)
   — the object index.ts hands the builder. Three spans, one per classification
   the ruling names. */
const AWAY_NIGHT = () => ({
  grantMs: 3 * 3600000,
  foodEaten: 8,
  delta: { accrued_to: new Date().toISOString(), gold: 2000 },
  summary: {
    awayMs: 3 * 3600000, paidMs: 2.5 * 3600000, gold: 1234,
    xp: { attack: 5000, hitpoints: 1600 }, items: { oak_log: 40, raw_shrimp: -8 },
    kills: 42, crits: 3, burnt: 0,
    stoppedBy: 'out_of_supply', stoppedById: 'raw_shrimp', stoppedSkill: 'cooking',
    stoppedPerHour: 940,
    died: false, diedTo: null, deaths: 0, recoverMs: 0, recoverLadder: [],
    autoEat: { enabled: true, pct: 50, hadFood: true },
    blessed: false, featuredMs: 0,
  },
});
/* ── THE b345 HEADLINE NIGHT, AS THE ENGINE ACTUALLY COMPUTES IT ────────────
   Not a hand-written summary: assertion (g) below exists precisely because the
   two spans on a real summary are produced by real code, and a fixture that
   set them by hand would be asserting that this file can type. Same anchor and
   seed as tests/artisan-accrual.mjs — a window that differs between guards is
   how two away paths come to disagree about when a night happened. */
const STARVE_FROM = Date.UTC(2026, 2, 14, 20, 0, 0);
const STARVE_SKILLS = Object.freeze({
  cooking: 13034431, smithing: 13034431, crafting: 13034431, prayer: 13034431,
  woodcutting: 13034431, mining: 13034431, fishing: 13034431,
  attack: 1000, strength: 1000, defense: 1000, hitpoints: 1000,
});
const STARVE_NIGHT = () => computeAccrual({
  userId: '00000000-0000-4000-8000-000000000001', slot: 0,
  nowMs: STARVE_FROM + 12 * 3600000, accruedToMs: STARVE_FROM, activeSinceMs: STARVE_FROM,
  activeKind: 'artisan', activeId: 'cook_shrimp', capMs: 12 * 3600000, seed: 0x5eed1234,
  hp: 60, maxHp: 60, gold: 0, skills: STARVE_SKILLS, equipment: {},
  inventory: { [ARTISAN_RECIPES_ALL.cook_shrimp.recipe.input]: 8 },
  autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {}, perks: null,
  unlockedRecipes: { cook_shrimp: true },
  items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_ALL,
});
/* Assertions 43-47 and the rescue mutation drive the same refusal/delta pair. */
const RESCUE_REFUSAL = Object.freeze({ ok: false, error: 'bad_receipt', why: 'unknown key' });

/* THE 90-SECOND CADENCE SETTLE. This is the one that must store NOTHING. */
const SYNC_TICK = () => ({
  grantMs: 90000, foodEaten: 0,
  delta: { accrued_to: new Date().toISOString(), gold: 12 },
  summary: {
    awayMs: 90000, paidMs: 90000, gold: 12, xp: { attack: 40 }, items: { bones: 1 },
    kills: 3, crits: 0, burnt: 0, died: false, deaths: 0, recoverMs: 0,
    recoverLadder: [], blessed: false, featuredMs: 0,
  },
});
/* A DEATH ALWAYS SPEAKS (b343) — even two minutes in. */
const SHORT_DEATH = () => {
  const o = SYNC_TICK();
  o.summary.died = true; o.summary.diedTo = 'ancient_bear'; o.summary.deaths = 1;
  o.summary.recoverMs = 120000; o.summary.recoverLadder = [120000];
  o.summary.awayMs = 120000; o.summary.paidMs = 120000; o.grantMs = 120000;
  return o;
};

/* ── PARSE c_receipt_keys OUT OF THE SHIPPED MIGRATION ──────────────────────
   Read, never retyped. The whole point of assertion 3 is that the two lists
   cannot drift, so hardcoding the SQL list here would defeat it. */
function sqlReceiptKeys(sql) {
  const at = sql.indexOf('c_receipt_keys constant text[] := array[');
  if (at < 0) return null;
  const end = sql.indexOf('];', at);
  if (end < 0) return null;
  return sql.slice(at, end)
    .split('\n').map((l) => l.replace(/--.*$/, ''))          // strip comment lines
    .join('\n')
    .match(/'([a-zA-Z]+)'/g)
    ?.map((s) => s.slice(1, -1)) ?? null;
}

// ── 1. THE BUILDER ──────────────────────────────────────────────────────────
function builderSection(migSql) {
  // (a) AN AWAY SPAN PRODUCES A RECEIPT, WITH EXACTLY THE ALLOWLISTED FIELDS.
  const r = awayReceiptFor(AWAY_NIGHT(), 1_800_000_000_000);
  ok(!!r, 'AWAY-RECEIPT-1: a 3-hour away span produced NO receipt — the Home card stays empty after a reload, '
        + 'which is the whole bug this feature deletes');
  if (r) {
    const extra = Object.keys(r).filter((k) => !AWAY_RECEIPT_KEYS.includes(k));
    ok(extra.length === 0,
      `AWAY-RECEIPT-2: the builder emitted un-allowlisted key(s) ${JSON.stringify(extra)}. hr_apply REFUSES an `
      + 'unknown delta key rather than ignoring it, so this does not degrade — it 409s EVERY away settle');
    ok(r.awayMs === 3 * 3600000 && r.paidMs === 2.5 * 3600000 && r.kills === 42 && r.gold === 1234,
      'AWAY-RECEIPT-3: the credited totals did not survive the builder — the card would render a night that '
      + 'does not match the one hr_apply paid');
    ok(r.stoppedBy === 'out_of_supply' && r.stoppedById === 'raw_shrimp' && r.stoppedSkill === 'cooking'
       && r.stoppedPerHour === 940,
      'AWAY-RECEIPT-4: the stop was dropped — b345: eight Raw Shrimp against an eight-hour absence must not '
      + 'render as eight hours of honest pay');
    ok(r.items && r.items.raw_shrimp === -8,
      'AWAY-RECEIPT-5: the items map is not SIGNED — auto-eat debits the food it ate and the card has to be '
      + 'able to say where the Cooked Shark stack went');
    ok(r.autoEat && r.autoEat.enabled === true && r.autoEat.pct === 50 && r.autoEat.hadFood === true,
      'AWAY-RECEIPT-6: autoEat is not the {enabled,pct,hadFood} OBJECT summaryFromAway reads — "auto-eat was '
      + 'off", "your threshold was 20%" and "your bag was empty" are three different sentences');
    ok(r.at === 1_800_000_000_000,
      'AWAY-RECEIPT-7: `at` is not the injected server instant — the card must not stamp a client clock');
    ok(JSON.stringify(r).length <= 2048,
      `AWAY-RECEIPT-8: an ordinary night serialises to ${JSON.stringify(r).length} bytes, over hr_apply's 2 KB bound`);
  }

  // (b) THE CADENCE SETTLE STORES NOTHING. Case (B) — the expensive failure.
  ok(classifiesAway(SYNC_TICK()) === false,
    'AWAY-RECEIPT-9: a 90 s cadence settle CLASSIFIES AS AWAY — every settle would write the hottest row in '
    + 'the database ~40x/hour/character (the game_events lesson: 1.6M rows / 229 MB from six players in four days)');
  ok(awayReceiptFor(SYNC_TICK()) === null,
    'AWAY-RECEIPT-10: the builder produced a receipt for a 90 s sync');
  const syncDelta = withAwayReceipt({ accrued_to: 'now', gold: 12 }, SYNC_TICK());
  ok(!('last_away_receipt' in syncDelta),
    'AWAY-RECEIPT-11: withAwayReceipt attached the key to a SYNC delta — hr_apply would refuse it with '
    + 'bad_receipt and 409 the settle');
  const awayDelta = withAwayReceipt({ accrued_to: 'now', gold: 2000 }, AWAY_NIGHT());
  ok('last_away_receipt' in awayDelta,
    'AWAY-RECEIPT-12: withAwayReceipt did NOT attach the key to an away delta');

  // (c) A DEATH ALWAYS SPEAKS, WHATEVER THE SPAN (b343).
  const d = awayReceiptFor(SHORT_DEATH());
  ok(!!d && d.died === true && d.diedTo === 'ancient_bear' && d.deaths === 1,
    'AWAY-RECEIPT-13: a two-minute span that ended in a DEATH stored nothing — a death always speaks, and the '
    + '"You died to X — auto-eat was off" sentence is the one a player most needs after a reload');

  // (d) BOUNDS. Refused server-side; the builder must not propose them either.
  const big = AWAY_NIGHT();
  big.summary.recoverLadder = Array.from({ length: 200 }, () => 120000);
  big.summary.items = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`it_${i}`, i + 1]));
  const b = awayReceiptFor(big);
  ok(b.recoverLadder.length <= AWAY_RECEIPT_MAX_LADDER,
    `AWAY-RECEIPT-14: the ladder was not bounded (${b.recoverLadder.length} rungs)`);
  ok(Object.keys(b.items).length <= 64,
    `AWAY-RECEIPT-15: the items map was not bounded (${Object.keys(b.items).length} entries)`);
  const neg = AWAY_NIGHT();
  neg.summary.kills = -5; neg.summary.gold = -1;
  const n = awayReceiptFor(neg);
  ok(n.kills === 0 && n.gold === 0,
    'AWAY-RECEIPT-16: a negative count survived the builder — hr_apply refuses it, so this is a 409 rather '
    + 'than a display bug');

  // (e) THE TWO ALLOWLISTS AGREE.
  const sqlKeys = sqlReceiptKeys(migSql);
  ok(Array.isArray(sqlKeys) && sqlKeys.length > 0,
    `AWAY-RECEIPT-17: could not read c_receipt_keys out of ${MIG} — the parity check is vacuous`);
  if (sqlKeys) {
    const onlyJs = AWAY_RECEIPT_KEYS.filter((k) => !sqlKeys.includes(k));
    const onlySql = sqlKeys.filter((k) => !AWAY_RECEIPT_KEYS.includes(k));
    ok(onlyJs.length === 0,
      `AWAY-RECEIPT-18: the builder can emit ${JSON.stringify(onlyJs)} and hr_apply's c_receipt_keys does not `
      + 'allow it — hr_apply REFUSES an unknown key, so every away settle would 409');
    ok(onlySql.length === 0,
      `AWAY-RECEIPT-19: hr_apply allows ${JSON.stringify(onlySql)} and nothing can produce it — a delta key `
      + 'no shipped code writes is an unreviewed door into player_state');
  }

  // (f) THE THREE COPIES OF SYNC_MAX_MS AGREE.
  ok(/c_sync_max_ms constant bigint := 600000;/.test(migSql),
    'AWAY-RECEIPT-20: hr_apply no longer carries c_sync_max_ms = 600000 (SYNC_MAX_MS) — the server would stop '
    + 'being the one that decides what an absence is');
  ok(AWAY_RECEIPT_SYNC_MAX_MS === 600000,
    'AWAY-RECEIPT-21: away-receipt.js SYNC_MAX_MS drifted from src/net/accrue.js:3545');

  /* ── (g) THE CLASSIFIER READS THE CREDITED SPAN, NOT THE EARNING SPAN ──────
     Driven through the REAL engine, because this is the one property of the
     classifier that cannot be checked by reading it: `windowEnvelope`
     (accrual.js) publishes TWO spans onto one summary and they differ by three
     orders of magnitude on the headline night —

       awayMs  the CREDITED span   (12 h — what the server paid time for)
       paidMs  the EARNING span    (30.7 s — where the eight Raw Shrimp ran out)

     `classifiesAway` must read the first. Reading the second would silently
     delete the receipt from the exact absence the card exists to explain
     (b345's "eight Raw Shrimp against an eight-hour absence"), and the two
     fields sit on adjacent lines of windowEnvelope, so the mistake is one
     rename away. Measured 2026-09-07 against the shipped catalogue: 8 shrimp on
     the cooking bench over a 12 h window stop the run at 30,720 ms. */
  const twelveHourStarve = STARVE_NIGHT();
  const starve = twelveHourStarve.summary || {};
  ok(twelveHourStarve.accrued === true && starve.paidMs > 0 && starve.paidMs < 60000
     && starve.awayMs === 12 * 3600000,
    'AWAY-RECEIPT-40 HARNESS: the b345 fixture no longer produces "a twelve-hour window that earned for half '
    + `a minute" (accrued=${twelveHourStarve.accrued}, awayMs=${starve.awayMs}, paidMs=${starve.paidMs}) — `
    + 'the assertion below would then prove nothing. Re-pick a bench/stock that exhausts early.');
  ok(classifiesAway(twelveHourStarve) === true,
    'AWAY-RECEIPT-41: a TWELVE-HOUR absence whose supplies ran out 30 seconds in does not classify as away — '
    + 'the classifier is reading `paidMs` (the earning span) where it must read `awayMs` (the credited span). '
    + 'This is the b345 headline night, the one the card exists to explain, and it would store nothing');
  ok(!!awayReceiptFor(twelveHourStarve),
    'AWAY-RECEIPT-42: the b345 headline night (12 h absence, supplies gone in 30 s) stored NO receipt');

  /* ── (h) THE CARD IS NEVER WORTH THE NIGHT (F2) ────────────────────────────
     `bad_receipt` is not a clamp, so index.ts's degrade ladder never sees it:
     without a rescue, one receipt the database disagrees with 409s EVERY away
     settle for EVERY player until a redeploy. `receiptRescue` is the shipped
     decision, graded here rather than transcribed. */
  const refusal = RESCUE_REFUSAL;
  const carried = withAwayReceipt({ accrued_to: 'now', gold: 2000 }, AWAY_NIGHT());
  const rescued = receiptRescue(refusal, carried);
  ok(!!rescued && !('last_away_receipt' in rescued) && rescued.gold === 2000
     && rescued.accrued_to === 'now',
    `AWAY-RECEIPT-43: a bad_receipt refusal is not rescued into the SAME delta minus the key (${JSON.stringify(rescued)}) `
    + '— the whole absence stays hostage to the card: watermark frozen, night unpaid, until a redeploy');
  ok(carried.last_away_receipt && !('last_away_receipt' in (rescued || { last_away_receipt: 1 })),
    'AWAY-RECEIPT-44: the rescue MUTATED the delta it was handed instead of returning a copy — the caller still '
    + 'holds the rejected object and the degrade ladder would re-send it');
  ok(receiptRescue({ ok: false, error: 'gold_clamp', why: 'x' }, carried) === null,
    'AWAY-RECEIPT-45: the rescue fires on a CLAMP — that is the degrade ladder’s job, and dropping the card '
    + 'would hide a real clamp behind a silently smaller-looking apply');
  ok(receiptRescue({ ok: true }, carried) === null,
    'AWAY-RECEIPT-46: the rescue fires on a SUCCESSFUL apply — it would re-apply the delta a second time');
  ok(receiptRescue(refusal, { accrued_to: 'now', gold: 12 }) === null,
    'AWAY-RECEIPT-47: a bad_receipt answer to a delta that carried NO receipt was "rescued" — that is a '
    + 'different defect, and a retry that changes nothing would double the write and mask it');
}

// ── 2. THE SHELL: index.ts ──────────────────────────────────────────────────
function shellSection(shell, client, legacy, record) {
  const code = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(/from '\.\/away-receipt\.js'/.test(code),
    'AWAY-RECEIPT-22: index.ts does not import ./away-receipt.js — an inline copy cannot be graded by this guard');
  const calls = (code.match(/withAwayReceipt\(/g) || []).length;
  ok(calls >= 2,
    `AWAY-RECEIPT-23: index.ts calls withAwayReceipt ${calls}x. It must be called at BOTH apply sites — the `
    + 'first attempt AND inside the degrade ladder. The ladder HALVES the span, and a receipt computed once '
    + 'would be refused as sync-sized after a halving and 409 the WHOLE absence over a card');
  ok(!/mergeAux\s*=\s*[\s\S]{0,200}withAwayReceipt/.test(code),
    'AWAY-RECEIPT-24: the receipt was folded into mergeAux — mergeAux also rides the POINTER-IDLE settle, '
    + 'which has no span and must never carry a receipt');
  /* The forfeit path pays NOTHING and moves only the watermark. A receipt there
     would narrate a night that was explicitly not paid. */
  const forfeitAt = code.indexOf('accrue_forfeit');
  ok(forfeitAt < 0 || !/last_away_receipt/.test(code.slice(Math.max(0, forfeitAt - 400), forfeitAt + 400)),
    'AWAY-RECEIPT-25: the FORFEIT delta carries a receipt — it pays nothing, so a receipt there is a card '
    + 'narrating a night the server refused to pay for');

  // The client seed: fills a hole, never overwrites this session's receipt.
  ok(/export function reconcileAwayReceipt/.test(client),
    'AWAY-RECEIPT-26: src/net/accrue.js has no reconcileAwayReceipt — the projection would arrive and nothing '
    + 'would read it');
  ok(/if \(G\.lastOfflineSummary\) return null;/.test(client),
    'AWAY-RECEIPT-27: reconcileAwayReceipt does not yield to an in-session receipt — a stored receipt would '
    + "overwrite the settle the player is looking at, and re-announce last night's absence on every envelope");
  ok(/if \(!\('last_away_receipt' in st\)\) return null;/.test(client),
    'AWAY-RECEIPT-28: the client COALESCES the projection instead of testing PRESENCE — a database that '
    + 'predates the column would render a fabricated empty night instead of saying nothing');
  /* ── GRADE THE CODE, NOT A MENTION OF IT ───────────────────────────────────
     Every assertion below anchors on a CALL or an assignment, against a
     comment-stripped copy. Measured: the first cut of AWAY-RECEIPT-54 matched
     `reconcileAwayReceipt` anywhere in record.js, so deleting the hydration step
     left the import line and the block comment behind and the guard stayed
     green — a guard that reads prose is a guard that reads nothing. */
  const strip = (src) => String(src || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const clientCode = strip(client);
  const legacyCode = strip(legacy);
  const recordCode = strip(record);
  ok(/summary\.restored = true;/.test(clientCode),
    'AWAY-RECEIPT-48: the seeded summary is no longer MARKED `restored` — it is the only thing that tells a '
    + 'crediting seam apart from a paid one, and without it a restored night is indistinguishable from a '
    + 'night that was just paid');

  /* ── THE SEAM. A RESTORED RECEIPT MUST REACH NO CREDITING PATH (F1) ────────
     `creditServerAwayKills` replays the server's away KILL TOTAL through the
     LIVE counter seams: `stats.kills`, the this-fight streak, `updateQuest`,
     and `updateDaily('kill_any')` — which is the wrapper chain the Muster hangs
     off (src/features/muster.js), turning the count into
     `world_event_contribute(p_event_key, p_points)` with CLIENT-SUPPLIED points
     against a SHARED world-event meter.

     A restored receipt classifies as 'away' by construction, so before this
     lane every reload-then-switch would have re-credited last night's kills
     into another player's leaderboard, bounded only by the per-player event cap.
     Both defences are asserted, because either alone is one careless caller from
     being reopened. */
  ok(/if\(s\.restored===true\)return 0;/.test(legacyCode),
    'AWAY-RECEIPT-49: creditServerAwayKills no longer refuses a RESTORED receipt at source. A receipt the '
    + 'server restored from player_state describes a night that was paid, journalled and banked hours ago; '
    + 'crediting it re-feeds updateDaily(‘kill_any’) into the Muster’s SHARED world_event_contribute meter '
    + 'on every reload');
  ok(!/const s=summary\|\|G\.lastOfflineSummary;/.test(legacyCode),
    'AWAY-RECEIPT-50: creditServerAwayKills fell back to the ambient `G.lastOfflineSummary` again. "Credit '
    + 'whatever is lying in the holder" IS the bug: any applier may have seeded that holder, including the '
    + 'boot seed with a night from hours ago');
  ok(/creditServerAwayKills\(written&&written\.paidReceipt\)/.test(legacyCode),
    'AWAY-RECEIPT-51: applyServerEnvelope no longer credits from `written.paidReceipt` — the receipt for the '
    + 'delta THIS envelope applied. Reading G.lastOfflineSummary here is what let a restored receipt reach the '
    + 'kill counters and the shared world-event meter');
  ok(/written\.paidReceipt = /.test(clientCode),
    'AWAY-RECEIPT-52: accrue.js applyEnvelope no longer hands back `written.paidReceipt`, so the call site '
    + 'above has nothing to credit and an away night would stop moving the kill counters entirely (the Paione '
    + '2026-08-18 regression, reopened)');
  ok(/written\.restoredReceipt = reconcileAwayReceipt\(/.test(clientCode),
    'AWAY-RECEIPT-53: the RESTORED seed and the PAID receipt share a field name again. One field with two '
    + 'meanings is exactly how a restored receipt comes to be credited as a paid one');

  /* THE BOOT SEED. Without it the feature is inert on the case it was built
     for: applyEnvelopeState runs ONLY on `accrued:true`, and the boot after an
     absence has been paid answers {accrued:false, reason:'idle'}. */
  ok(/reconcileAwayReceipt\(G, verdict\.body\)/.test(recordCode),
    'AWAY-RECEIPT-54: record.js no longer hydrates the away receipt from the hr_load body. applyEnvelopeState '
    + 'runs only on accrued:true, so on an IDLE boot nothing seeds the card and the whole feature renders '
    + 'nothing for a night the server paid — the original bug, now with a storage bill attached');
}

// ── 3. THE SQL, EXECUTED ────────────────────────────────────────────────────
async function sqlSection(db) {
  // A character with a THREE-HOUR unpaid window, created by the server's own RPC.
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
  const created = (await db.query('select public.hr_create_character(0) as res')).rows[0].res;
  ok(created && created.created === true, `AWAY-RECEIPT-29 HARNESS: could not create the probe character: ${JSON.stringify(created)}`);
  const backdate = async () => db.exec(
    `update public.player_state set accrued_to = now() - interval '3 hours',
       active_kind='combat', active_id='rat', active_since = now() - interval '3 hours'
     where user_id = '${uid}' and slot = 0`);
  const version = async () => Number((await db.query(
    `select version from public.player_state where user_id = '${uid}' and slot = 0`)).rows[0].version);
  const applyDelta = async (delta) => {
    await backdate();
    const v = await version();
    const r = await db.query(
      `select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text::jsonb) as res`,
      [uid, v, JSON.stringify(delta)]);
    return r.rows[0].res;
  };
  const journal = { kind: 'admin', intent: 'guard:away-card' };

  // (a) THE CONTROL: the SHIPPED builder's own output is accepted verbatim.
  //     This is the assertion that ties the two halves together — not a
  //     hand-written fixture that happens to satisfy the SQL.
  const receipt = awayReceiptFor(AWAY_NIGHT());
  let res = await applyDelta({ accrued_to: 'now', gold: 2000, journal, last_away_receipt: receipt });
  ok(res && res.ok === true,
    `AWAY-RECEIPT-30 CONTROL: hr_apply REFUSED the shipped builder's own away receipt (${JSON.stringify(res)}). `
    + 'Every refusal probe below would then prove nothing');
  const stored = (await db.query(
    `select last_away_receipt from public.player_state where user_id = '${uid}' and slot = 0`)).rows[0].last_away_receipt;
  ok(stored && Number(stored.kills) === 42,
    `AWAY-RECEIPT-31: the receipt did not land in player_state.last_away_receipt (${JSON.stringify(stored)})`);
  const env = (await db.query(`select public.hr_state_of('${uid}'::uuid, 0) as res`)).rows[0].res;
  ok(env && env.state && env.state.last_away_receipt && Number(env.state.last_away_receipt.kills) === 42,
    'AWAY-RECEIPT-32: hr_state_of does not project last_away_receipt — the boot envelope carries nothing and '
    + 'the Home card is still empty after a reload');

  // (a-ii) AND IT ROUND-TRIPS THROUGH THE CLIENT'S ONE TRANSLATOR. A projection
  //        that stores fine and renders as "0h, +0 items" is the bug still shipped.
  const { summaryFromAway } = await import('../src/net/accrue.js');
  const card = summaryFromAway(env.state.last_away_receipt, env);
  ok(card && card.gainedKills === 42 && card.gainedGold === 1234 && card.awayMs === 3 * 3600000
     && card.stoppedById === 'raw_shrimp',
    `AWAY-RECEIPT-33: the stored receipt does not round-trip through summaryFromAway (${JSON.stringify(card)}) — `
    + 'the column would be populated and the card would still say nothing');

  // (a-iii) AND THE CLIENT SEED IS DRIVEN FOR REAL, against that same envelope.
  //         The source assertions below (26-28) say the rules are written down;
  //         this says they WORK, on the projection hr_state_of actually produced.
  const { reconcileAwayReceipt } = await import('../src/net/accrue.js');
  const freshG = {};
  const seeded = reconcileAwayReceipt(freshG, env);
  ok(!!seeded && !!freshG.lastOfflineSummary && freshG.lastOfflineSummary.gainedKills === 42,
    `AWAY-RECEIPT-33b: a BOOT G was not seeded from state.last_away_receipt (${JSON.stringify(seeded)}) — the `
    + 'column would be populated, projected, and the Home card would still be empty after a reload');
  /* `?? {}` on BOTH sides deliberately: when the projection is missing (the
     state_of_stops_projecting mutation) 33b already reports it, and a TypeError
     here would be a HARNESS crash dressed up as a catch. */
  ok(Number((freshG.lastOfflineSummary || {}).at) === Number((env.state.last_away_receipt || {}).at),
    "AWAY-RECEIPT-33c: the seed restamped `at` instead of keeping the SERVER instant — serverAwaySpanMs treats "
    + 'a receipt under 30 minutes old as fresh, so every reload would look like a brand-new absence');
  const liveG = { lastOfflineSummary: { gainedKills: 7, marker: 'this session' } };
  ok(reconcileAwayReceipt(liveG, env) === null && liveG.lastOfflineSummary.marker === 'this session',
    'AWAY-RECEIPT-33d: the seed OVERWROTE an in-session receipt — the player would watch the settle they are '
    + "looking at be replaced by last night's, on every envelope");
  const blindG = {};
  ok(reconcileAwayReceipt(blindG, { state: {} }) === null && !blindG.lastOfflineSummary,
    'AWAY-RECEIPT-33e: an envelope with NO last_away_receipt key seeded something — a database that predates '
    + 'the column must render silence, never a fabricated empty night');

  // (b) A SETTLE THAT DOES NOT CARRY THE KEY MUST NOT ERASE IT (ABSOLUTE).
  await applyDelta({ accrued_to: 'now', gold: 1, journal });
  const after = (await db.query(
    `select last_away_receipt from public.player_state where user_id = '${uid}' and slot = 0`)).rows[0].last_away_receipt;
  ok(after && Number(after.kills) === 42,
    'AWAY-RECEIPT-34: a cadence settle WITHOUT the key erased the stored receipt — the key is not absolute, so '
    + 'the card would survive for exactly 90 seconds');

  // (c) THE REFUSALS. Each mutates ONE field of the builder's own output.
  const probes = [
    ['sync-sized', { ...receipt, awayMs: 300000, paidMs: 300000, grantMs: 300000, died: false, deaths: 0 },
      'a 90 s / 5 min cadence receipt was ACCEPTED — the server must be the one that refuses it, because the '
      + 'edge is one deploy away from sending it'],
    ['unknown key', { ...receipt, freeGold: 999999 },
      'an un-allowlisted key was ACCEPTED — unknown keys must be REFUSED, never stripped', 'unknown key'],
    ['negative', { ...receipt, kills: -1 }, 'a negative count was ACCEPTED'],
    ['over-window', { ...receipt, awayMs: 9 * 86400000, grantMs: 9 * 86400000 },
      'a NINE-DAY span was accepted against a THREE-HOUR window — the card could narrate a night that did not elapse'],
    ['oversized', { ...receipt, items: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`padpadpad_${i}`, i + 1])) },
      'a receipt over the 2 KB bound was ACCEPTED', 'too large'],
    ['gold over delta', { ...receipt, gold: 999999999 },
      'the receipt claimed more gold than the apply moved — a player-facing lie with a number on it'],
    ['not an object', 'a string', 'a non-object receipt was ACCEPTED'],
  ];
  for (const [name, bad, why, expectWhy] of probes) {
    const r = await applyDelta({ accrued_to: 'now', gold: 2000, journal, last_away_receipt: bad });
    ok(r && r.ok === false && r.error === 'bad_receipt',
      `AWAY-RECEIPT-35 [${name}]: expected bad_receipt, got ${JSON.stringify(r)} — ${why}`);
    /* ── AND FOR THE REASON IT SAYS IT IS ──────────────────────────────────
       Two bounds guard the maps — the 2 KB SIZE door (V2, checked first) and
       the 64-ENTRY cap (V7, checked later) — and until this line the guard read
       only the CODE, which both produce. Measured 2026-09-07: the `oversized`
       fixture is 10,490 bytes across 400 entries, so it trips SIZE and the
       entry cap had NO executing proof anywhere; a build that deleted the entry
       cap outright stayed green on both halves. Asserting the `why` is what
       keeps the two rules from silently trading places. */
    if (expectWhy) {
      ok(r && r.why === expectWhy,
        `AWAY-RECEIPT-35b [${name}]: refused for "${r && r.why}", expected "${expectWhy}". The two map bounds `
        + 'are checked in order (size, then entry count) and a probe that trips the wrong one leaves the other '
        + 'rule unproven');
    }
  }
  /* THE 64-ENTRY CAP, PROVED, AND ITS CONTROL. 65 short-named entries serialise
     to well under the 2 KB door (measured: 915 bytes), so this is the only
     shape that can reach V7 at all — and the 64-entry twin must be ACCEPTED, or
     "refused" would prove nothing but that the map was present. */
  const shortMap = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`i${i}`, i + 1]));
  const over = await applyDelta({ accrued_to: 'now', gold: 2000, journal,
    last_away_receipt: { ...receipt, items: shortMap(AWAY_RECEIPT_MAX_MAP + 1) } });
  ok(over && over.ok === false && over.error === 'bad_receipt' && over.why === 'too many entries',
    `AWAY-RECEIPT-35c: a ${AWAY_RECEIPT_MAX_MAP + 1}-entry items map UNDER the 2 KB door was not refused for `
    + `"too many entries" (${JSON.stringify(over)}) — the entry cap is the bound that stops a pathological map `
    + 'reaching the size door in the first place, and nothing else executes it');
  const under = await applyDelta({ accrued_to: 'now', gold: 2000, journal,
    last_away_receipt: { ...receipt, items: shortMap(AWAY_RECEIPT_MAX_MAP) } });
  ok(under && under.ok === true,
    `AWAY-RECEIPT-35d CONTROL: a legal ${AWAY_RECEIPT_MAX_MAP}-entry map was REFUSED (${JSON.stringify(under)}) — `
    + 'the cap is off by one and an honest night with a full bag would 409');

  /* ── THE RESCUE, END TO END (F2) ───────────────────────────────────────────
     Assertions 43-47 grade the shipped DECISION; this proves the thing it
     decides is actually true of the database: hr_apply refuses the delta over
     the receipt, and the SAME delta with the key deleted is accepted. Without
     that, "retry without the receipt" would be a hope rather than a rescue. */
  const poisoned = { accrued_to: 'now', gold: 2000, journal,
    last_away_receipt: { ...receipt, freeGold: 999999 } };
  const refused = await applyDelta(poisoned);
  ok(refused && refused.error === 'bad_receipt',
    `AWAY-RECEIPT-35e HARNESS: the poisoned delta was not refused (${JSON.stringify(refused)})`);
  const rescuedDelta = receiptRescue(refused, poisoned);
  const paid = rescuedDelta ? await applyDelta(rescuedDelta) : null;
  ok(paid && paid.ok === true,
    `AWAY-RECEIPT-35f: the RESCUED delta (the same apply with last_away_receipt deleted) was refused too `
    + `(${JSON.stringify(paid)}). The rescue is the only thing standing between one receipt the database `
    + 'disagrees with and EVERY away settle 409ing until a redeploy');
  // Without an accrual there is no window to bound the span against.
  const noWin = await db.query(
    `select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text::jsonb) as res`,
    [uid, await version(), JSON.stringify({ gold: 5, journal, last_away_receipt: receipt })]);
  ok(noWin.rows[0].res && noWin.rows[0].res.error === 'bad_receipt',
    'AWAY-RECEIPT-36: a receipt with NO accrued_to was accepted — there is no window to bound its span against');

  // (d) THE SHORT DEATH IS STILL ACCEPTED. The sync rule must not swallow the
  //     one receipt that always has to speak.
  const dres = await applyDelta({ accrued_to: 'now', gold: 2000, journal,
    last_away_receipt: awayReceiptFor(SHORT_DEATH()) });
  ok(dres && dres.ok === true,
    `AWAY-RECEIPT-37: a two-minute DEATH receipt was refused (${JSON.stringify(dres)}) — a death always speaks (b343)`);

  // (e) NO LEDGER ROW OF ITS OWN. Journal rule 6, stated as a count.
  const rows = Number((await db.query(
    `select count(*)::int as n from public.player_ledger where user_id = '${uid}' and intent like '%receipt%'`)).rows[0].n);
  ok(rows === 0,
    `AWAY-RECEIPT-38: the receipt wrote ${rows} ledger row(s) of its own — it rides the apply row hr_apply `
    + 'already writes (the game_events lesson)');

  // (f) THE COLUMN IS NOT CLIENT-WRITABLE, AND THE RPC IS NOT CLIENT-CALLABLE.
  const pol = Number((await db.query(
    `select count(*)::int as n from pg_policies where schemaname='public' and tablename='player_state'
       and cmd in ('UPDATE','INSERT','ALL')
       and ('authenticated' = any(roles) or 'anon' = any(roles) or 'public' = any(roles))`)).rows[0].n);
  ok(pol === 0,
    `AWAY-RECEIPT-39: player_state carries ${pol} client write policy(ies) — a client could author its own `
    + 'away receipt, which is "+9,999,999 gold while you were away" on its own Home screen');
}

/* ── THE GATE-BLIND PAIR ───────────────────────────────────────
   Every SQL mutation below is ALSO run with the migration's own SEC4 self-check
   short-circuited. A tick that only means "the apply threw" is the
   renown-faucet lesson: it proves the MIGRATION can fail, not that THIS GUARD
   can see anything. SEC4 fires at apply time and ONCE ONLY; the regression that
   actually brings these defects back is a LATER migration restating hr_apply
   from a stale template, at which point SEC4 never runs again and this guard is
   the only thing left standing. So each SQL defect is caught TWICE — once by
   the gate, once by the guard alone. */
const GATE_BLIND = [
  "  raise notice 'receipt self-check PASSED:",
  `  if false then raise notice 'unreachable'; end if;
exception when others then
  raise notice 'SEC4 SHORT-CIRCUITED FOR THE MUTATION PROOF: %', sqlerrm;
  -- the rest of the original PASSED notice, commented out on one line: `,
];

/* ── MUTATIONS ─────────────────────────────────────────────────────────────
   Each plants a REAL defect in REAL shipped text and must turn this guard RED.
   A guard that has never been red is not a guard. */
const MUTATIONS = {
  sync_writes_a_receipt: {
    kind: 'js',
    why: 'CASE (B), THE EXPENSIVE ONE: the classifier is disabled, so every 90 s cadence settle writes the '
       + 'hottest row in the database — the game_events mistake with a new name',
    find: '  if (!classifiesAway(out)) return null;',
    repl: '  if (false) return null;',
  },
  away_writes_nothing: {
    kind: 'js',
    why: 'CASE (A): the builder never produces a receipt, so the Home card is still empty after a reload — '
       + 'the bug this feature exists to delete',
    find: '  if (!classifiesAway(out)) return null;',
    repl: '  if (true) return null;',
  },
  builder_grows_a_key: {
    kind: 'js',
    why: 'a field is added to the builder and not to hr_apply c_receipt_keys. hr_apply REFUSES an unknown key '
       + 'rather than ignoring it, so this does not degrade — it 409s EVERY away settle in production',
    find: '    blessed: s.blessed === true,',
    repl: '    blessed: s.blessed === true,\n    attendedCap: 999,',
  },
  sql_drops_the_sync_rule: {
    kind: 'sql',
    why: 'the SERVER stops refusing a sync-sized receipt, so the whole defence rests on one line of an Edge '
       + 'Function that is one deploy away from changing',
    find: "        if coalesce((v_receipt->>'awayMs')::bigint, 0) < c_sync_max_ms",
    repl: "        if false and coalesce((v_receipt->>'awayMs')::bigint, 0) < c_sync_max_ms",
  },
  sql_drops_the_window_bound: {
    kind: 'sql',
    why: 'the span is no longer bounded by now() - accrued_to, so a compromised engine can write "you were '
       + 'away for nine days" against a ninety-second window',
    find: '        foreach v_rkey in array c_receipt_ms_keys loop\n          if coalesce((v_receipt->>v_rkey)::bigint, 0) > v_window_ms then',
    repl: '        foreach v_rkey in array c_receipt_ms_keys loop\n          if false and coalesce((v_receipt->>v_rkey)::bigint, 0) > v_window_ms then',
  },
  sql_drops_the_entry_cap: {
    kind: 'sql',
    why: 'the per-map entry cap is gone. It is the bound that stops a pathological xp/items map reaching the '
       + '2 KB door at all, and until AWAY-RECEIPT-35c it had NO executing proof anywhere: the oversized probe '
       + 'is 10 KB across 400 entries, so it trips the SIZE rule first and this one could be deleted silently',
    find: "            if (select count(*) from jsonb_object_keys(v_receipt->v_rkey) as t(rk)) > c_max_receipt_keys then",
    repl: "            if false and (select count(*) from jsonb_object_keys(v_receipt->v_rkey) as t(rk)) > c_max_receipt_keys then",
  },
  sql_strips_unknown_keys: {
    kind: 'sql',
    why: 'unknown keys are ignored instead of refused — the door hr_apply exists to keep shut',
    find: "          if not (v_rkey = any(c_receipt_keys)) then",
    repl: "          if false and not (v_rkey = any(c_receipt_keys)) then",
  },
  state_of_stops_projecting: {
    kind: 'sql',
    why: 'the receipt is stored and never projected — the column fills up and the card stays empty, which is '
       + 'the original bug with a storage bill attached',
    find: "      'last_away_receipt', v_st.last_away_receipt,$anc$);",
    repl: "      'lastAwayReceipt', v_st.last_away_receipt,$anc$);",
  },
  classifier_reads_the_earning_span: {
    kind: 'js',
    why: 'classifiesAway reads `paidMs` (the span that EARNED) where it must read `awayMs` (the span that was '
       + 'CREDITED). They sit on adjacent lines of accrual.js windowEnvelope and differ by three orders of '
       + 'magnitude on the b345 night - a twelve-hour absence whose supplies ran out 30 s in would store '
       + 'nothing, which is the one night the card exists to explain',
    find: '  return num(s.awayMs) >= AWAY_RECEIPT_SYNC_MAX_MS',
    repl: '  return num(s.paidMs) >= AWAY_RECEIPT_SYNC_MAX_MS',
  },
  rescue_never_fires: {
    kind: 'js',
    why: 'a bad_receipt refusal is no longer rescued, so ONE receipt the database disagrees with 409s EVERY '
       + 'away settle for EVERY player until a redeploy - watermark frozen, night unpaid, over a Home card',
    find: "  if (!('last_away_receipt' in delta)) return null;",
    repl: '  return null;',
  },
  legacy_credits_a_restored_receipt: {
    kind: 'client',
    file: 'legacy',
    why: 'the SOURCE defence is gone: a receipt the server RESTORED (a night paid, journalled and banked hours '
       + 'ago) is credited again - lifetime kills, the kill dailies, and through updateDaily the Muster\u2019s '
       + 'SHARED world_event_contribute meter, on every reload',
    find: '  if(s.restored===true)return 0;',
    repl: '  if(false)return 0;',
  },
  legacy_credits_the_ambient_holder: {
    kind: 'client',
    file: 'legacy',
    why: 'the STRUCTURAL defence is gone: the crediting seam reads the ambient G.lastOfflineSummary again '
       + 'instead of the receipt this envelope paid for, so whatever any applier last seeded gets credited',
    find: 'creditServerAwayKills(written&&written.paidReceipt)',
    repl: 'creditServerAwayKills(G.lastOfflineSummary)',
  },
  record_stops_seeding_the_boot: {
    kind: 'client',
    file: 'record',
    why: 'the boot hydration is gone, and applyEnvelopeState runs ONLY on accrued:true - so on an IDLE boot '
       + 'nothing seeds the card and the whole feature renders nothing for a night the server paid',
    find: "hydrationStep('away-receipt', () => reconcileAwayReceipt(G, verdict.body));",
    repl: "hydrationStep('away-receipt', () => {});",
  },
  client_overwrites_the_session: {
    kind: 'client',
    why: "the stored receipt overwrites the receipt the player is looking at, and re-announces last night's "
       + 'absence on every envelope',
    find: '  if (G.lastOfflineSummary) return null;',
    repl: '  if (false) return null;',
  },
};

async function main() {
  const migSql = (await readFile(MIG_PATH, 'utf8')).replace(/\r\n/g, '\n');
  const shell = await readFile(INDEX_TS, 'utf8');
  const client = (await readFile(CLIENT, 'utf8')).replace(/\r\n/g, '\n');
  const legacy = (await readFile(LEGACY, 'utf8')).replace(/\r\n/g, '\n');
  const record = (await readFile(RECORD, 'utf8')).replace(/\r\n/g, '\n');

  if (!SELFTEST) {
    builderSection(migSql);
    shellSection(shell, client, legacy, record);
    const { db } = await bootReplay();
    await sqlSection(db);
    if (failed) {
      console.error(`\naway-receipt-journal: ${failed} failure(s).`);
      process.exit(1);
    }
    console.log('away-receipt journal: the builder stores an away night — including the b345 night that earned for '
      + 'thirty seconds — and NOTHING on the 90 s cadence; a death always speaks; the two allowlists and the '
      + 'three copies of SYNC_MAX_MS agree; index.ts recomputes the receipt on every degrade attempt and rescues '
      + 'a refused one instead of 409ing the night; a RESTORED receipt renders the card and reaches no crediting '
      + 'seam; and hr_apply — executed — accepts the shipped builder\'s own output, projects it, keeps it across '
      + 'a settle that omits it, accepts the rescued delta and a map at exactly the entry cap, and refuses '
      + 'sync-sized, over-window, oversized, over-entry-cap, unknown-key, negative, gold-over-delta, window-less '
      + 'and non-object receipts with bad_receipt.');
    return;
  }

  // ── SELFTEST: every mutation must be CAUGHT ───────────────────────────────
  let missed = 0;
  for (const [name, m] of Object.entries(MUTATIONS)) {
    failed = 0;
    try {
      if (m.kind === 'js') {
        // Patch the shipped module on disk-in-memory and re-import it via a data
        // URL, so the mutation grades THE SAME CODE the green run graded.
        const src = await readFile(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'away-receipt.js'), 'utf8');
        if (!src.includes(m.find)) { console.error(`  HARNESS: anchor missing for ${name}`); missed++; continue; }
        const mutated = src.replace(m.find, m.repl);
        const mod = await import('data:text/javascript;base64,' + Buffer.from(mutated).toString('base64'));
        const r = mod.awayReceiptFor(AWAY_NIGHT());
        const syncR = mod.awayReceiptFor(SYNC_TICK());
        if (name === 'sync_writes_a_receipt') ok(syncR === null, 'mutation: the sync stored a receipt');
        if (name === 'away_writes_nothing') ok(!!r, 'mutation: the away night stored nothing');
        if (name === 'builder_grows_a_key') {
          const sqlKeys = sqlReceiptKeys(migSql) || [];
          ok(Object.keys(r || {}).every((k) => sqlKeys.includes(k)), 'mutation: the builder grew an un-allowlisted key');
        }
        if (name === 'classifier_reads_the_earning_span') {
          /* The SAME engine-computed night assertion 41 reads, against the
             mutated module - not a hand-made summary, or the mutation would be
             graded on a fixture instead of on the b345 case. */
          ok(mod.classifiesAway(STARVE_NIGHT()) === true,
            'mutation: the b345 night (12 h absence, supplies gone in 30 s) stopped classifying as away');
        }
        if (name === 'rescue_never_fires') {
          const carried = mod.withAwayReceipt({ accrued_to: 'now', gold: 2000 }, AWAY_NIGHT());
          ok(!!mod.receiptRescue(RESCUE_REFUSAL, carried),
            'mutation: a bad_receipt refusal is no longer rescued into the same delta minus the key');
        }
      } else if (m.kind === 'client') {
        /* THREE client-side files carry rules this guard grades - the seed
           (src/net/accrue.js), the crediting seam (src/legacy.js) and the boot
           hydration (src/net/record.js) - so a mutation names WHICH. Defaulting
           to `client` leaves the original entries unchanged. */
        const src = { client, legacy, record };
        const which = m.file || 'client';
        if (!src[which].includes(m.find)) { console.error(`  HARNESS: anchor missing for ${name} in ${which}`); missed++; continue; }
        src[which] = src[which].replace(m.find, m.repl);
        shellSection(shell, src.client, src.legacy, src.record);
      } else {
        if (!migSql.includes(m.find)) { console.error(`  HARNESS: anchor missing for ${name}`); missed++; continue; }
        /* GATE-BLIND: SEC4 is short-circuited, so the only thing left that can
           see this defect is this guard's own assertions. That is the reading
           that matters — see the GATE_BLIND header. */
        const { db } = await bootReplay({
          patches: new Map([[MIG, [[m.find, m.repl], GATE_BLIND]]]),
        });
        builderSection(migSql.replace(m.find, m.repl));
        await sqlSection(db);
      }
    } catch (e) {
      // A mutation that makes the chain fail to apply is CAUGHT, but say so:
      // "the migration can fail" is not the same evidence as "the guard sees it".
      failed++;
      console.log(`  (${name} was caught by the REPLAY, not by an assertion: ${String(e.message).slice(0, 120)})`);
    }
    if (failed === 0) { console.error(`  MISSED  ${name} — ${m.why}`); missed++; }
    else console.log(`  caught  ${name}`);
  }
  if (missed) {
    console.error(`\naway-receipt-journal --selftest: ${missed} mutation(s) NOT caught. `
      + 'A guard that has never been red is not a guard.');
    process.exit(1);
  }
  console.log(`away-receipt-journal --selftest: all ${Object.keys(MUTATIONS).length} mutations caught.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
