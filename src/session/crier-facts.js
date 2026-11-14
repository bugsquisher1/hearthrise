// ════════════════════════════════════════════════════════════════════════
// src/session/crier-facts.js — WHAT A HERO HAS NOT DONE YET, FOR THE TOWN CRIERS.
//
// PURE over the server's projection (CLAUDE.md §6): every fact is read from
// what the envelope holds now, never from a client counter, so a crier says
// the same thing after a reload and on another device. A fact the server has
// not said yet is false, so an unknown is never a tip. The facts a line may
// key on are named in src/data/town-criers.js CRIER_FACTS; this is the one
// place that reads them.
//   crierFactsOf(cs)   { unhunted, no_blessing, storage_unused, untempered, no_task, task_open }
//                      each false, true, or an object with the line's words; null until the server has said the Level
// ════════════════════════════════════════════════════════════════════════
import { levelOf } from './character-sections.js?v=0.2.130';
import { bankOf, blessingsOf } from './item-sections.js?v=0.2.130';
import { tallyOf } from './tally-sections.js?v=0.2.130';
import { temperRowsOf } from './temper-sections.js?v=0.2.130';
import { tallyTask } from '../data/tally-tasks.js?v=0.2.130';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.130';

/** The facts for `cs`, or null while the server has not said its Level. */
export function crierFactsOf(cs) {
  const lv = levelOf(cs);
  if (!lv) return null;
  const bank = bankOf(cs);
  const bless = blessingsOf(cs);
  const temper = temperRowsOf(cs);
  const tally = tallyOf(cs);
  const open = tally ? tally.held.find((h) => !h.done) || null : null;
  const task = open ? tallyTask(open.task) : null;
  const ground = open && HUNT_INDEX[open.hunt] ? HUNT_INDEX[open.hunt].name : null;
  return {
    unhunted: lv.xp === 0,
    no_blessing: !!bless && !bless.tiers.some((t) => t.held),
    storage_unused: !!bank && bank.length === 0,
    /* gear with a ladder the hero has never begun, the smith's first rung on offer (temper-sections.js temperFirstRungOf's rule) */
    untempered: !!temper && [temper.blows, temper.armor].some((r) => !!r.ladder && r.ladder.rung === 0 && !!r.ladder.offer),
    no_task: !!tally && tally.held.length === 0,
    task_open: open && task && ground ? { label: task.label, count: open.target - open.kills, ground, hunt: open.hunt } : false,
  };
}
