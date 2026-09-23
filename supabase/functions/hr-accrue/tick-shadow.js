// ============================================================================
// supabase/functions/hr-accrue/tick-shadow.js — ONE TICK, THROUGH THE ONE ENGINE.
//
// Step 1 of the live-world sequence (docs/planning/LIVE_WORLD_BRIEF.md): run
// the engines on a server clock for active characters and record what we WOULD
// write, compared against what accrual-on-return actually writes.
//
// The whole point of shadow mode is stated by what this file does not import:
// there is no Supabase client here, no `fetch`, no `node:fs` write, no service
// role key. A shadow tick's output is an object that is compared and discarded.
//
// ONE ENGINE. Every number below comes out of `computeAccrual`, which is the
// same function `supabase/functions/hr-accrue/index.ts` calls. This file
// decides WHEN to call it and carries state between calls; it never decides
// what a tick is worth.
// ============================================================================

import { computeAccrual, CALLER_AUTHORITY } from './accrual.js';
import { hashSeed } from '../../../src/core/rng.js';
import { planWindows, countersFromProgress } from './tick-contract.js';
import { engineStateOf } from './envelope.js';

/* ── THE SEED, PER WINDOW, FROM THE WATERMARK ───────────────────────────────
   Production does NOT hand the engine a constant. `hr-accrue/index.ts` (~L641)
   derives it as `hr_seed(user, slot, 'accrue:' || accrued_to)` — a label that
   NAMES THE WATERMARK, mixed with a 256-bit secret held in a table with RLS on,
   so a player cannot predict their own rolls (server-authority review S20).
   Every settle window therefore already draws a distinct stream, and that is
   the mechanism the tick inherits unchanged: a tick window's watermark is its
   `fromMs`, so labelling by it gives every tick its own stream with NO new
   column, NO new engine input and nothing for Security to grant.

   THE SPIKE HAS NO SECRET, and must not invent one. It uses `hashSeed` from
   src/core/rng.js over the SAME LABEL SHAPE, which reproduces the production
   property this file is testing (distinct stream per watermark) without
   reproducing the property it is not (unpredictability). The real service
   calls `hr_seed` exactly as the edge does. */
export function seedFor(userId, slot, watermarkMs) {
  return hashSeed(String(userId), String(slot), 'accrue:' + new Date(watermarkMs).toISOString());
}

/* The in-memory character the tick holds between windows. In production this is
   hydrated once from `hr_state_of` on session start and re-hydrated from it on
   any refusal; here it is a fixture. It is deliberately the SAME SHAPE as
   `computeAccrual`'s input object, so "what the tick holds" and "what the
   engine reads" cannot drift apart. */
export function hydrate(fixture) {
  const c = JSON.parse(JSON.stringify(fixture));
  c.skills = c.skills || {};
  c.inventory = c.inventory || {};
  c.equipment = c.equipment || {};
  return c;
}

/* ── ADVANCE: the SHADOW half of hr_apply ───────────────────────────────────
   In step 2 this function is DELETED and each window's delta goes through
   `hr_apply` itself, which is the only thing allowed to decide whether a delta
   may land. It exists here only so the shadow loop can carry a character
   forward across windows without a database, and it implements exactly the
   arithmetic accrual.js's own contract documents for each key — no clamps, no
   catalogue, no authority. If you find yourself adding a RULE here rather than
   an assignment, you are writing the second copy of hr_apply that this whole
   architecture exists to prevent. */
export function advance(char, res) {
  if (!res || !res.accrued) return char;
  const d = res.delta || {};
  /* ── THE CUMULATIVE HALF, FOR THE CARRIER (2026-09-23) ──────────────────
     `char` is the state AFTER this window; `char._chain` is the MOVEMENT this
     chain has proposed since it was seeded from `hr_state_of`. Armed, nobody
     needs it — hr_apply wrote each window and the next fire reads the row
     back. In SHADOW the database is not the carrier (nothing is written), so
     `tick-contract.js` `shadowStateOf` serialises this into the jsonb the
     fence stores, and the maps are the BOUND: only the keys a window actually
     moved are ever in it. `_`-prefixed, so it is scratch and `engineStateOf`
     (which forwards exactly ENGINE_STATE_KEYS) can never hand it to the
     engine as an input. */
  const ch = char._chain || (char._chain = {
    gold: 0, xp: {}, items: {}, bestiaryKills: {},
    deathsToday: 0, deathsLifetime: 0, vigourMin: 0, activity: null,
  });
  if (typeof d.gold === 'number') {
    char.gold = Math.max(0, Math.floor((char.gold || 0) + d.gold));
    ch.gold += Math.floor(d.gold);
  }
  for (const k of Object.keys(d.xp || {})) {
    char.skills[k] = (char.skills[k] || 0) + Number(d.xp[k] || 0);
    ch.xp[k] = (ch.xp[k] || 0) + Number(d.xp[k] || 0);
  }
  for (const k of Object.keys(d.items || {})) {
    const q = (char.inventory[k] || 0) + Number(d.items[k] || 0);
    if (q > 0) char.inventory[k] = q; else delete char.inventory[k];
    ch.items[k] = (ch.items[k] || 0) + Number(d.items[k] || 0);
  }
  if (typeof d.hp === 'number') char.hp = d.hp;
  if (typeof d.fight !== 'undefined') char.fight = d.fight;
  if (typeof d.ammo_carry !== 'undefined') char.ammoCarry = d.ammo_carry;
  if (typeof d.tool_carry !== 'undefined') char.toolCarry = d.tool_carry;
  if (typeof d.consec_falls !== 'undefined') char.consecFalls = d.consec_falls;
  if (typeof d.recovering_until !== 'undefined') {
    char.recoveringUntilMs = d.recovering_until ? Date.parse(d.recovering_until) : 0;
  }
  if (d.activity && d.activity.kind) {
    char.activeKind = d.activity.kind; char.activeId = d.activity.id;
    ch.activity = { kind: d.activity.kind, id: d.activity.id ?? null };
  }
  if (d.accrued_to) char.accruedToMs = Date.parse(d.accrued_to);
  /* The bestiary counters the charm index reads. Server-owned rows in
     production (`hr_bestiary_of`); here, the kills the window just proposed. */
  if (res.summary && res.summary.kills > 0 && char.activeKind === 'combat' && char.activeId) {
    char.bestiaryKills = char.bestiaryKills || {};
    char.bestiaryKills[char.activeId] = (char.bestiaryKills[char.activeId] || 0) + res.summary.kills;
    ch.bestiaryKills[char.activeId] = (ch.bestiaryKills[char.activeId] || 0) + res.summary.kills;
  }
  /* ── THE THREE COUNTERS hr_apply WOULD HAVE WRITTEN (2026-09-23) ─────────
     NOT an arithmetic of our own and NOT a rule: `countersFromProgress` sums
     the `progress` ops THE ENGINE ITSELF FILED on this delta — `stat:deaths`
     under period '' and under today's UTC day, and `daily:ev:vigour_min`.
     hr_apply applies each as `progress = progress + add` against those exact
     rows, and `hr_state_of` projects them back as `deaths_lifetime`,
     `deaths_today` and the vigour block, which is where the engine reads them
     from on the next window.

     THEY WERE MISSING FROM THIS FUNCTION AND BOTH RUN IN THE PAYING
     DIRECTION. `recoveryFor()` prices a fall from the two death counters, so
     a chain that never advances them hands the character the first-death
     novice grace on every window of the night — the `noDeathCounters` mutant
     of tests/world-tick-combat-parity.mjs, permanently on. `vigourMult`
     decays against `spent_min`, so a budget that refills itself every window
     never decays at all. */
  const counters = countersFromProgress(d.progress);
  if (counters.deathsLifetime) {
    char.deathsLifetimeBefore = (Number(char.deathsLifetimeBefore) || 0) + counters.deathsLifetime;
    ch.deathsLifetime += counters.deathsLifetime;
  }
  if (counters.deathsToday) {
    char.deathsTodayBefore = (Number(char.deathsTodayBefore) || 0) + counters.deathsToday;
    ch.deathsToday += counters.deathsToday;
  }
  if (counters.vigourMin && char.vigour && typeof char.vigour === 'object') {
    char.vigour = Object.assign({}, char.vigour,
      { spent_min: (Number(char.vigour.spent_min) || 0) + counters.vigourMin });
    ch.vigourMin += counters.vigourMin;
  }
  return char;
}

/* One shadow tick. `opts.perturb` is the mutation hook the parity guard uses to
   prove itself red; it is never set by the service. */
export function shadowTick(char, fromMs, toMs, catalogues, opts) {
  const o = opts || {};
  const input = {
    userId: char.userId,
    slot: char.slot,
    nowMs: toMs,
    accruedToMs: fromMs,
    activeSinceMs: char.activeSinceMs,
    activeKind: char.activeKind,
    activeId: char.activeId,
    capMs: char.capMs,
    /* NOT a per-character constant. The watermark is `fromMs`, exactly as the
       edge's label is `accrue:<accrued_to>`; `char.seed` is honoured only when
       a fixture pins one, which is how the guard can hold the stream still and
       isolate a different variable. */
    /* ── `seedOf` IS THE PRODUCTION SEED SEAM (2026-09-21, milestone 1b) ──
       `seedFor` below is a HASH OVER VISIBLE VALUES (user, slot, watermark)
       and nothing else — which is right for a fixture run and WRONG on the
       wire: the client can read its own `accrued_to`, so a player could
       predict their own rolls (server-authority review S20). Production hands
       this hook `hr_seed(user, slot, 'accrue:' || <watermark>)`, which mixes a
       256-bit secret held in a table with RLS on and no grant to any client
       role — the SAME label `hr-accrue/index.ts` derives for an accrue, so a
       tick window draws the stream an accrue would have drawn.
       Absent (every offline caller) the behaviour is unchanged, which is what
       keeps tests/world-tick-parity.mjs measuring the same thing it did. */
    seed: (o.fixedSeed && char.seed) ? char.seed
      : (typeof o.seedOf === 'function' ? o.seedOf(fromMs)
                                        : seedFor(char.userId, char.slot, fromMs)),
    /* ── THE CHARACTER'S STATE, AS ONE LIST (2026-09-22) ──────────────────
       `engineStateOf` forwards exactly `ENGINE_STATE_KEYS` from ./envelope.js —
       the SAME list `engineInputsFromEnvelope` fills from `hr_state_of`, so a
       field that reaches the accrue path reaches a tick window too. It used to
       be thirteen names written out here, and the four that were missing
       (`enchant`, `combatStyle`, the auto-eat trio, `hearthfindReady`) were
       inputs the engine reads and a tick silently priced without. Only keys the
       character actually HOLDS are forwarded: several of these are
       presence-of-key switches, so an offline fixture that never had the column
       must keep reading as "no column". */
    ...engineStateOf(char),
    bestiaryKills: char.bestiaryKills,
    items: catalogues.items,
    monsters: catalogues.monsters,
    /* THE GATHER CHANNEL'S INPUTS (2026-09-18, step-2 prep). `nodes` is the
       gather index and `toolCarry` is the server-owned sub-action remainder of
       the tool double roll; without them `computeAccrual` refuses a `gather`
       pointer as an unknown node and the tick settles nothing. All five keys
       are `undefined` for the combat fixtures, so the combat arms are
       byte-identical to before — asserted by P1..P5 staying green.
       `toolCarry: null` is NOT the same as absent and must survive: null means
       "the column does not exist for this character", and emitting the key
       against an hr_apply that does not implement it is a 409. */
    nodes: catalogues.nodes,
    /* NOT from the envelope: `hr_perks_of` is its own read and the tick does
       not make it yet, so this is undefined in production and a fixture's
       pinned value offline. Under-paying, and named in the lane report. */
    perks: char.perks,
    /* `goals` WAS HERE AND WAS DEAD (removed 2026-09-22, milestone 3).
       `computeAccrual` builds its own counter — `const goals = makeGoalCounter()`
       (accrual.js :1759/:3232) — and never reads `inp.goals`; `hr-accrue/index.ts`
       does not pass one either. A key the engine ignores is not harmless: it
       reads as a plumbed input, so the next author wires a real goal model into
       it and it silently does nothing. Found by the M3 key-set parity arm
       (tests/world-tick-combat-parity.mjs C1), which compares this object
       against index.ts's own source in BOTH directions for exactly that reason. */
    /* ══ THE COMBAT CHANNEL'S INPUTS ═══════════════════════════════════════
       ELEVEN KEYS A GATHER WINDOW DOES NOT NEED AND A COMBAT WINDOW CANNOT BE
       CORRECT WITHOUT — the auto-eat trio, the two death counters,
       `combatXpAccruedToMs`, `hearthfindReady`, `enchant`, `combatStyle`,
       `buffs` and `ammoCarry`. They ARE NOT LISTED HERE ANY MORE: every one of
       them is in `ENGINE_STATE_KEYS` and arrives through the
       `...engineStateOf(char)` spread above (M1f, 2026-09-22). Listing them a
       second time here is not redundant, it is WRONG — the explicit key would
       sit after the spread and overwrite a present value with `char.X`, and for
       the presence-of-key switches (`buffs`, `ammoCarry`) it would turn an
       ABSENT key into an explicit `undefined`, which is the "this database has
       no column" signal spelled as a value. One list, in envelope.js, read by
       the accrue path and by a tick window alike (AWAY-12).

       ⚠ THIS BLOCK WAS THE MILESTONE and the two measurements that bought it
         stand, on the SAME character, window and seed over ten minutes:

         · auto-eat absent  ->  48 kills / 276 gold / 2,464 xp / 5 deaths,
           against 139 / 788 / 6,568 / 0 with it. -65.0% gold, -62.5% xp.
           That is `src/core/auto-eat.js`'s own -63%..-99% band, reproduced by
           the CALLER instead of by a missing handler.
         · the death counters absent -> `recoveryFor()` prices every fall from
           zero, so a character with six deaths today is handed the FIRST-DEATH
           novice grace (0 ms, then 120,000 ms) where the accrue path charges
           3,840,000 ms — and the ledger row it writes says `deaths_today: 1`.
           Recovery is the COST of dying, so this one runs in the PAYING
           direction. A mint, and a silent one.

       WHY NO GUARD SAW IT: tests/world-tick-parity.mjs `accrualOnReturn` DOES
       pass the auto-eat keys and this object did not, and P1 compares the two
       for byte-identity — green, because the only auto-eat fixture is a maxed
       character at 99 HP fighting a slime who never reaches the 50% threshold.
       The guard was blind, not wrong. tests/world-tick-combat-parity.mjs C1
       closes the class STRUCTURALLY: it derives the accrue path's key set from
       `hr-accrue/index.ts`'s own source and requires this object to match it,
       so a key added there and not here is red on that commit. */
    /* NOT an envelope key and NOT in ENGINE_STATE_KEYS: `hr_companion_xp_of`
       is its own read, exactly as `perks` above. Named at every call site. */
    companionXpBacked: char.companionXpBacked,
    /* ── THE ATTENDED TOP-UP IS STRUCTURALLY ABSENT, NOT FORGOTTEN ─────────
       Every term of `min(claimed, attendedKillCap, MAX_FIDELITY x sim) - sim`
       is priced against the SPAN. Hand sixty windows the same claim and it is
       paid sixty times; split the claim and the arithmetic is undefined. There
       is no correct way for a 10 s window to carry one, so the tick never
       does, and `settleCombatSession` THROWS on a caller that supplies one
       rather than letting a null look like an oversight
       (WORLD_TICK_DESIGN.md 16.6, guard C10). */
    attended: null,
    /* THE CALLER. 'tick', not the borrowed 'collect' (`finalWindow` before
       2026-09-18). A tick window is exempt from ACCRUE_MIN_MS like a collect —
       10 s is below the floor and there is no later call that would see a
       longer span — but unlike a collect its remainder IS deferrable, because
       the tick's NEXT window starts at the watermark this one stamps. Under the
       borrowed spelling settledWatermarkMs stamped `now()` and the tick forfeit
       the sub-action remainder every cadence; see accrual.js accrualCaller.
       The chaining half of the contract is the loop's, not this function's:
       the next window's `fromMs` MUST be `delta.accrued_to` of this one, which
       is what shadowSpan does and what world-tick-parity P5a asserts. */
    caller: o.caller || 'tick',
    /* THE RUNTIME FENCE (Security, 2026-09-18). `accrualCaller` honours 'tick'
       and 'collect' only against this imported object identity, so the
       privilege belongs to code that can `import`, never to a request body.
       The tick service holds it because it IS server code; the token cannot
       travel over the wire. */
    callerAuthority: CALLER_AUTHORITY,
  };
  const final = o.perturb ? o.perturb(input) : input;
  /* The guard reads the input the engine ACTUALLY got, so checkpoint
     continuity ("window i was handed window i-1's `fight`") is asserted on the
     real value rather than on the value the loop meant to pass. */
  if (typeof o.onInput === 'function') o.onInput(final);
  return computeAccrual(final);
}
