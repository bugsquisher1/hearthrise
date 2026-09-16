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

import { computeAccrual } from '../../supabase/functions/hr-accrue/accrual.js';
import { planWindows } from './contract.js';

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
    seed: char.seed,
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
    /* THE CALLER FLAG. A tick window is settled the instant it closes: there is
       no "next call" that would see a longer span, which is the exact condition
       `finalWindow` names in accrual.js (b531's collect-before-switch). Reusing
       it is correct TODAY and is still the wrong spelling for production —
       see the design doc's "caller taxonomy" open question. */
    finalWindow: true,
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
