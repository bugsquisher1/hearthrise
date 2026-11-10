// tests/_server-debt.mjs — ONE CHAIN PREFIX FOR EVERY MUTANT OF lane/c-server-debt's EIGHT FILES.
//
// The eight 2027-04-02 files sit together at the chain's end. A mutant planted through bootReplay's `patches` cuts the
// snapshot prefix at ITS file, so five guards with mutants in six different files would each build (and CI would pay
// for) a different 630-file prefix. They share one instead: the chain up to the last file BEFORE the lane (the snapshot
// every one of these guards restores), then the lane's own files applied here, one transaction each, the mutant's one
// edit made to its file's text in memory. tests/server-debt-second-apply.mjs reads the same list.
//
// A plain run never comes through here: it replays the WHOLE chain (bootReplay()), so a later file is judged too.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

export const PREV = '2027-03-26-signout-presence.sql';
export const FILES = Object.freeze([
  '2027-04-02-rate-refusals-recorded.sql',
  '2027-04-02-town-walk-mask.generated.sql',
  '2027-04-02-town-walk-mask.sql',
  '2027-04-02-residue-fields.generated.sql',
  '2027-04-02-residue-allowlist.sql',
  '2027-04-02-level-xp-ceiling.generated.sql',
  '2027-04-02-level-xp-ceiling.sql',
  '2027-04-02-dead-doors.sql',
]);
export const laneText = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');

/**
 * The chain up to PREV, then the lane's files in order up to `upTo` (inclusive; all eight when absent).
 * @param {{upTo?: string, mutant?: {file: string, from: string, to: string}}} [o]
 *   mutant: ONE edit of one file's text ('supabase/migrations/<file>'); its anchor must occur exactly once.
 * @returns {Promise<{db: any}>}  throws { replay: true } when a file refuses to apply (the message names it and why),
 *   { harness: true } when the mutant cannot be planted
 */
export async function bootLane({ upTo, mutant } = {}) {
  const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };
  if (upTo !== undefined && !FILES.includes(upTo)) throw harness('bootLane: ' + upTo + ' is not one of the lane\'s files');
  /* tests/mutant-control.mjs: plant NOTHING, keep the scope, so a mutant that still reads "caught" is caught by something else. */
  const plant = process.env.HR_MUTANT_CONTROL || process.env.HR_REPLAY_SCOPE_CONTROL ? null : (mutant || null);
  const target = plant ? String(plant.file).split('/').pop() : null;
  const last = upTo === undefined ? FILES.length - 1 : FILES.indexOf(upTo);
  if (target && (!FILES.includes(target) || FILES.indexOf(target) > last)) throw harness('bootLane: the mutant\'s file ' + target + ' is not applied by this boot');
  const { db } = await bootReplay({ upTo: PREV });
  for (const f of FILES.slice(0, last + 1)) {
    let sql = laneText(f);
    if (f === target) {
      const n = sql.split(plant.from).length - 1;
      if (n !== 1) throw harness(`mutant anchor matched ${n} times in ${f} (need exactly 1)`);
      const after = sql.replace(plant.from, () => plant.to);
      if (after === sql) throw harness(`the mutant on ${f} produced identical SQL`);
      sql = after;
    }
    try { await db.exec(`begin;\n${sql}\ncommit;`); }
    catch (err) {
      await db.exec('rollback').catch(() => {});
      const e = new Error(`THE LANE'S FILES DO NOT APPLY.\n  ${f} failed to apply: ${String(err && err.message || err).split('\n')[0]}`);
      e.replay = true; throw e;
    }
  }
  return { db };
}
