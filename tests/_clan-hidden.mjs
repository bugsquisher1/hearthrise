// ════════════════════════════════════════════════════════════════════════
// tests/_clan-hidden.mjs — THE CASTLE'S SERVER CALLS ARE HIDDEN, NEVER DROPPED (Part C X-04 and T-12; lane/c-social FB-12).
//
// The four clan guards (clan-economy-sinks, clan-feast-catalogue-drift, clan-deposit-ownership, clan-journal-guard) boot the 2026-08 clan
// chain alone and call the castle's calls as the database owner, so they prove those bodies still do what they did. This helper adds the
// two promises FB-12 makes about the same calls on the WHOLE chain, cheaply, with no second boot:
//   NEVER DROPPED  every hidden call is still a function on the replayed chain (tests/schema-drift.baseline.json, the fingerprint the
//                  chain rebuilds to, which tests/schema-drift.mjs holds on every run)
//   REFUSED        1041-social-clans.sql hides every one (its grants block revokes it from every request role) and its §5 self-check names
//                  every one, so the replay that runs that self-check (tests/schema-drift.mjs) proves no request role can run it and that
//                  `authenticated` calling one is refused 42501
// A guard names the calls it exercises; a name outside the list, a call dropped, or a call the migration stopped hiding is a finding.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The castle's calls the first build hides (the chapter 14 castle builds on them), plus the superseded free create and display-name invite.
   The clan tavern's rested grant is not here: it went with the rested bank (1040-rested-bank-cut.sql, FB-2, Tyler's S-9 c). */
export const CLAN_HIDDEN_CALLS = Object.freeze([
  'clan_contribute', 'clan_contribute__ungated', 'clan_create', 'clan_deposit', 'clan_deposit__ungated',
  'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit', 'clan_feast_deposit__ungated',
  'clan_invite', 'clan_invites_list', 'clan_seat_read', 'clan_seat_read__ungated',
  'clan_upkeep_settle', 'clan_vice_set', 'clan_vice_set__ungated',
  'clan_vote_cast', 'clan_vote_cast__ungated', 'clan_vote_close', 'clan_vote_close__ungated',
  'clan_vote_open', 'clan_vote_open__ungated', 'clan_vote_read', 'clan_vote_read__ungated',
  'clan_work_labour', 'clan_work_labour__ungated', 'clan_work_post', 'clan_work_post__ungated',
  'clan_work_supply', 'clan_work_supply__ungated',
]);

/* The array literal a block of 1041-social-clans.sql names its hidden calls in, as a list of names, or null. */
function namesIn(sql, from) {
  const at = sql.indexOf(from);
  if (at < 0) return null;
  const end = sql.indexOf(']', at + from.length);
  return end < 0 ? null : [...sql.slice(at + from.length, end).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/**
 * Findings for `names` (the calls a guard exercises): each must be on CLAN_HIDDEN_CALLS, still a function on the replayed chain, revoked
 * from every request role by 1036's grants block, and named by 1036's executed self-check. [] when every promise holds. `o` swaps a
 * source for a mutant ({ baseline, sql }).
 */
export function hiddenProblems(names, o = {}) {
  const out = [];
  const baseline = o.baseline ?? JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-drift.baseline.json'), 'utf8'));
  const sql = (o.sql ?? readFileSync(join(ROOT, 'supabase', 'migrations', '1041-social-clans.sql'), 'utf8')).replace(/\r\n/g, '\n');
  const fns = new Set(((baseline.inventory || baseline).functions || []).map((f) => String(f).replace(/\(.*$/, '')));
  const grants = namesIn(sql, "where n.nspname = 'public' and p.proname = any (array[") || [];
  const check = namesIn(sql, 'c_hidden constant text[] := array[') || [];
  for (const n of names) {
    if (!CLAN_HIDDEN_CALLS.includes(n)) out.push(n + ' is not on the hidden list (tests/_clan-hidden.mjs CLAN_HIDDEN_CALLS)');
    if (!fns.has(n)) out.push(n + ' was DROPPED from the replayed chain (X-04: hide, never drop): it is not in tests/schema-drift.baseline.json');
    if (!grants.includes(n)) out.push(n + ' is not revoked from every request role by 1041-social-clans.sql (its grants block no longer names it)');
    if (!check.includes(n)) out.push(n + ' is not proved refused by 1041-social-clans.sql §5 (its self-check no longer names it)');
  }
  return out;
}

/**
 * THE CHECK BITES (its standing proof, run by tests/clan-economy-sinks.mjs E17): a call dropped from the chain, a call the grants block
 * stopped hiding, a call the self-check stopped proving and an open call named as hidden must each be a finding; the real sources must
 * give none. [] when it bites.
 */
export function hiddenSelftest() {
  const out = [];
  const baseline = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-drift.baseline.json'), 'utf8'));
  const sql = readFileSync(join(ROOT, 'supabase', 'migrations', '1041-social-clans.sql'), 'utf8').replace(/\r\n/g, '\n');
  const n = 'clan_contribute';
  if (hiddenProblems([n]).length) out.push('the real sources already report ' + n);
  const dropped = { ...baseline, inventory: { ...baseline.inventory, functions: baseline.inventory.functions.filter((f) => !f.startsWith(n + '(')) } };
  if (!hiddenProblems([n], { baseline: dropped }).some((p) => /DROPPED/.test(p))) out.push('a dropped call slipped');
  const cut = (marker) => { const at = sql.indexOf(marker); return sql.slice(0, at) + sql.slice(at).replace("'" + n + "', ", ''); };
  if (!hiddenProblems([n], { sql: cut("where n.nspname = 'public' and p.proname = any (array[") }).some((p) => /not revoked/.test(p))) out.push('a call the grants block stopped hiding slipped');
  if (!hiddenProblems([n], { sql: cut('c_hidden constant text[] := array[') }).some((p) => /not proved refused/.test(p))) out.push('a call the self-check stopped proving slipped');
  if (!hiddenProblems(['clan_join']).some((p) => /not on the hidden list/.test(p))) out.push('an open call passed as hidden');
  return out;
}
