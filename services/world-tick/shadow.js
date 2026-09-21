// ============================================================================
// services/world-tick/shadow.js — the SHADOW TICK LOOP.
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

import { computeAccrual, CALLER_AUTHORITY } from '../../supabase/functions/hr-accrue/accrual.js';
import { hashSeed } from '../../src/core/rng.js';
import { planWindows } from './contract.js';

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
  if (typeof d.gold === 'number') char.gold = Math.max(0, Math.floor((char.gold || 0) + d.gold));
  for (const k of Object.keys(d.xp || {})) char.skills[k] = (char.skills[k] || 0) + Number(d.xp[k] || 0);
  for (const k of Object.keys(d.items || {})) {
    const q = (char.inventory[k] || 0) + Number(d.items[k] || 0);
    if (q > 0) char.inventory[k] = q; else delete char.inventory[k];
  }
  if (typeof d.hp === 'number') char.hp = d.hp;
  if (typeof d.fight !== 'undefined') char.fight = d.fight;
  if (typeof d.ammo_carry !== 'undefined') char.ammoCarry = d.ammo_carry;
  if (typeof d.tool_carry !== 'undefined') char.toolCarry = d.tool_carry;
  if (typeof d.consec_falls !== 'undefined') char.consecFalls = d.consec_falls;
  if (typeof d.recovering_until !== 'undefined') {
    char.recoveringUntilMs = d.recovering_until ? Date.parse(d.recovering_until) : 0;
  }
  if (d.activity && d.activity.kind) { char.activeKind = d.activity.kind; char.activeId = d.activity.id; }
  if (d.accrued_to) char.accruedToMs = Date.parse(d.accrued_to);
  /* The bestiary counters the charm index reads. Server-owned rows in
     production (`hr_bestiary_of`); here, the kills the window just proposed. */
  if (res.summary && res.summary.kills > 0 && char.activeKind === 'combat' && char.activeId) {
    char.bestiaryKills = char.bestiaryKills || {};
    char.bestiaryKills[char.activeId] = (char.bestiaryKills[char.activeId] || 0) + res.summary.kills;
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
    seed: (o.fixedSeed && char.seed) ? char.seed : seedFor(char.userId, char.slot, fromMs),
    hp: char.hp,
    maxHp: char.maxHp,
    gold: char.gold,
    skills: char.skills,
    inventory: char.inventory,
    equipment: char.equipment,
    fight: char.fight,
    consecFalls: char.consecFalls,
    recoveringUntilMs: char.recoveringUntilMs,
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
    toolCarry: char.toolCarry,
    perks: char.perks,
    buffs: char.buffs,
    goals: char.goals,
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

/* Run [fromMs, toMs] as a chain of cadence windows. Returns every proposed
   delta and the character the chain ended on. Writes nothing. */
export function shadowSpan(char0, fromMs, toMs, catalogues, opts) {
  const o = opts || {};
  const cadenceMs = Math.floor(o.cadenceMs || 10000);
  const char = hydrate(char0);
  /* The character's own combat tick, derived from SERVER-OWNED equipment by the
     engine itself — never a cadence, never a client value. Asking the engine
     for it (a one-window probe) rather than re-deriving it here keeps the
     alignment rule on the same number the simulation will actually use. */
  const probe = shadowTick(hydrate(char0), fromMs, toMs, catalogues, {});
  const tickMs = Number(probe.tickMs) || 2400;
  const anchorMs = Number(char.activeSinceMs) || fromMs;
  const windows = o.windows ? o.windows(anchorMs, fromMs, toMs, cadenceMs, tickMs)
                            : planWindows(anchorMs, fromMs, toMs, cadenceMs, tickMs);
  const results = [];
  for (const w of windows) {
    let input = null;
    const res = shadowTick(char, w.fromMs, w.toMs, catalogues,
      Object.assign({}, o, { onInput: (i) => { input = i; } }));
    results.push({ window: w, input, res });
    advance(char, res);
  }
  return { tickMs, windows, results, char, probe };
}
