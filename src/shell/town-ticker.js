// ════════════════════════════════════════════════════════════════════════
// src/shell/town-ticker.js — TOWN WORK COUNTS UP BETWEEN PAYOUTS. DISPLAY ONLY.
//
// Tyler 2026-10-23: "Add a display-only ticker so town-work items and XP count
// up one at a time, replaced by the server's count each payout." The engine pays
// a town activity in windows (its 15 s town floor; the watched character asks one
// settle per townPollMs, src/session/town-poll.js), so the logs land about five
// at a time. Between payouts this says what the server's engine has already done.
//
// HOW IT PREDICTS: THE SERVER'S OWN LOOP, NEVER A SECOND COPY OF ITS RULES. The
// span the edge prices the window with (accrual.js accrueGather / accrueArtisan:
// src/core/skill-sim.js simulateSkillSpan for a node, src/core/artisan-sim.js
// simulateArtisanSpan for a bench) runs on a scratch copy of the server's numbers
// from the envelope: the pointer (active_kind / active_id), the window the server
// pays next (src/core/away.js creditWindow over accrued_to and active_since, to
// the server's clock now), the server's bag, worn set and levels (so the tool and
// its speed are the ones the server resolves), and the bench's "N left"
// (bench_run) as the run's budget, as the engine caps it. The interval, the slice
// loop, the level gate and the bench's own stop when an input runs out are the
// engine's.
//
// WHAT IT SHOWS IS WHAT IS CERTAIN, ROUNDED DOWN:
//   · no perks and no buffs (the client holds none of the server's bonus chain),
//     so the interval is the server's or longer: it never counts an action the
//     server has not finished by that instant;
//   · every roll on its smallest outcome (FLOOR_RNG): a yield range on its low
//     end, every chance on "no" (no extra yield, no saved inputs, no find), the
//     tool's double-yield carry from zero (it can only trail the server's);
//   · the one roll whose "no" is the GOOD outcome is cooking's burn
//     (artisan.js burnChance): while a dish can burn its product is a roll, so
//     the action is `unsure` ("2 more on the fire"), in no stack, and pays only
//     the burn's XP (burnXp), the less of the two outcomes;
//   · XP is each action's whole paced XP (the Work window's "N XP each"),
//     floored per action; the server's carried remainder can only pay more.
// Nothing is predicted for a pointer the server refused to settle
// (src/session/refusal.js settleRefusalOf), nor once the server's clock is more
// than HORIZON past the watermark (nobody watches, or the link is down: the
// server is not settling for us, so the display goes back to its numbers).
//
// IT IS NEVER SPENT (CLAUDE.md §6). The bag's pocket counts, the work line and
// the skill bars show it as pending (`is-ahead`, tokens only); every control
// (sell, eat, bury, deposit, "Makes up to N", the bench's "N left") reads the
// server's numbers. Nothing here is stored: each envelope replaces the inputs, so
// a payout restarts the count from the new watermark and a lower payout snaps it
// down; a stop or a hunt clears it with the pointer.
// ════════════════════════════════════════════════════════════════════════
import { simulateSkillSpan, gatherIntervalMs } from '../core/skill-sim.js?v=0.2.34';
import { simulateArtisanSpan, artisanIntervalMs } from '../core/artisan-sim.js?v=0.2.34';
import { creditWindow } from '../core/away.js?v=0.2.34';
import { burnChance, burnXp } from '../core/artisan.js?v=0.2.34';
import { pacedXp } from '../core/pacing.js?v=0.2.34';
import { levelOf } from '../core/xp.js?v=0.2.34';
import { ITEMS } from '../data/items.js?v=0.2.34';
import { SESSION_CONFIG } from '../session/config.js?v=0.2.34';
import { rows, text, cls } from '../render/paint.js?v=0.2.34';

/** Every roll on its smallest outcome: a range on its low end, a chance on "no" (yes only when certain). next() sits
    at the top of [0, 1), so a `next() < p` test reads "no" too. */
export const FLOOR_RNG = Object.freeze({
  next: () => 1 - Number.EPSILON,
  int: (lo) => Math.ceil(Number(lo) || 0),
  chance: (p) => Number(p) >= 1,
});

/** How far past the server's watermark a prediction may run: two polls and one action. A watched hero is settled once
    a poll (townPollMs) and the engine defers under one action, so only a server that is not settling for us passes it. */
export function horizonMs(stepMs) { return 2 * SESSION_CONFIG.townPollMs + Math.max(0, Number(stepMs) || 0); }

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const count = (n) => (Number.isSafeInteger(n) && n > 0 ? n : 0);

/**
 * What the server's engine has done on this hero's town work since its watermark, by `nowMs`: the certain part only.
 * Pure over the server's numbers.
 * @param {object} o
 *   w          the work row the server's pointer names ({ kind, id, skill, row }: town-work.js workRow)
 *   state      the envelope's `state` (active_kind, active_id, active_since, accrued_to)
 *   skills     { id: { xp, level } } (item-sections.js skillsOf)
 *   inventory  the envelope's bag; equipment its worn set
 *   left       the bench run's actions left (bench_run.left), or null (until an input runs out)
 *   nowMs      the server's clock now (CharacterSession.serverNow)
 *   refused    true while a settle refusal stands on this record
 * @returns {{ actions: number, items: object, xp: object, unsure: number } | null}
 *   items: { id: signed change } (the product up, the inputs down); xp: { skill: XP }; unsure: actions whose product
 *   is a roll. null when nothing may be predicted.
 */
export function predictTown(o) {
  const w = o && o.w;
  const st = o && o.state;
  if (!w || !st || o.refused || st.active_kind !== w.kind || st.active_id !== w.id) return null;
  const nowMs = Number(o.nowMs);
  const fromMs = Date.parse(st.accrued_to);
  const sinceMs = Date.parse(st.active_since);
  if (!Number.isFinite(nowMs) || !Number.isFinite(fromMs) || !Number.isFinite(sinceMs)) return null;
  const skills = {};
  for (const [id, r] of Object.entries(o.skills || {})) if (r && count(r.xp)) skills[id] = r.xp;
  const bag = {};
  for (const [id, n] of Object.entries(o.inventory || {})) if (count(n)) bag[id] = n;
  const scratch = { skillTargetId: w.id, skills, inventory: bag, equipment: o.equipment || {}, toolCarry: {}, stats: {}, buffs: [], unlockedRecipes: {} };
  const gather = w.kind === 'gather';
  const stepMs = gather ? gatherIntervalMs(scratch, w.skill, w.row, { items: ITEMS }) : artisanIntervalMs(scratch, w.skill, w.row, { items: ITEMS });
  const win = creditWindow({ watermarkMs: fromMs, activeSinceMs: sinceMs, nowMs, capMs: horizonMs(stepMs) });
  if (win.capped) return null;
  const burnable = !gather && w.skill === 'cooking' && !!w.row.output && burnChance(w.row, levelOf(skills, 'cooking'), 0) > 0;
  const items = {};
  let unsure = 0;
  const move = (id, n) => { items[id] = (items[id] || 0) + n; };
  /* The engine's own effects, on the scratch bag (a bench's next action checks it, as on the server). */
  const fx = {
    addItem(id, n) { bag[id] = (bag[id] || 0) + n; if (burnable && id === w.row.output) unsure++; else move(id, n); },
    removeItem(id, n) { const take = Math.min(n, bag[id] || 0); bag[id] = (bag[id] || 0) - take; move(id, -take); },
  };
  const one = Object.create(null);
  const ctx = { fromMs: win.fromMs, toMs: win.toMs, items: ITEMS, rng: FLOOR_RNG, away: true, fx };
  let sum;
  if (gather) {
    one[w.id] = { skill: w.skill, node: w.row };
    sum = simulateSkillSpan(scratch, Object.assign(ctx, { nodes: one }));
  } else {
    one[w.id] = { skill: w.skill, recipe: w.row };
    sum = simulateArtisanSpan(scratch, Object.assign(ctx, { recipes: one, maxActions: count(o.left) || null }));
  }
  const actions = count(sum && sum.ticks);
  const xpSkill = w.row.xpSkill || w.skill;
  const each = Math.floor(pacedXp(xpSkill, burnable ? burnXp(w.row) : w.row.xp));
  const xp = actions && each > 0 ? { [xpSkill]: actions * each } : {};
  for (const id of Object.keys(items)) if (!items[id]) delete items[id];
  return { actions, items, xp, unsure };
}

/** The ticker's certain change to the stack `id` (signed), or 0. */
export function aheadQty(tick, id) { return tick && own(tick.items, id) ? tick.items[id] : 0; }

/** The ticker's XP for `skill` not yet paid, or 0. */
export function aheadXp(tick, skill) { return tick && own(tick.xp, skill) ? tick.xp[skill] : 0; }

/** The stack as shown: the server's `qty` plus the ticker's change ({ qty, ahead }: ahead = the change, signed). */
export function shownQty(tick, id, qty) {
  const d = aheadQty(tick, id);
  return { qty: Math.max(0, (Number(qty) || 0) + d), ahead: d };
}

/** A line of parts [{ key, text, ahead }]: "Lead: part, part" + tail; a part's `ahead` marks a number that includes the ticker. */
export function lineParts(lead, parts, tail) {
  const out = [{ key: 'lead', text: lead + (parts.length ? ': ' : '') }];
  parts.forEach((p, i) => out.push({ key: p.key, text: (i ? ', ' : '') + p.text, ahead: !!p.ahead }));
  if (tail) out.push({ key: 'tail', text: tail });
  return out;
}

/** The line's words, as one string. */
export function lineText(parts) { return parts.map((p) => p.text).join(''); }

/** Paint a line's parts into `host` as keyed spans, patched in place; a pending part carries `is-ahead`. */
export function paintLine(host, parts, doc) {
  rows(host, parts, {
    key: (p) => p.key,
    build: () => doc.createElement('span'),
    patch: (el, p) => { text(el, p.text); cls(el, 'is-ahead', !!p.ahead); },
  });
}
