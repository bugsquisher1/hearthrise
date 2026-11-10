// tools/char-state.local.mjs — one character as a server holds it, read-only, one screen.
// For "a player says X": look before guessing.
//
//   node tools/char-state.local.mjs Fingerguns        by character name (case-insensitive)
//   node tools/char-state.local.mjs 0a47ba77 1        by user-id prefix + slot
//   node tools/char-state.local.mjs Fingerguns --env staging   on the staging project (default: production; tools/lib/env.mjs)
//
// The first line printed is the project. Prints the character sheet, its hunts (open + last 3, with the
// instance's settle lag), its outfit row, party rows, the hunt presets, today's refusals and the last ledger
// rows. SELECT-only via the Management API with the env's token file, inside a READ ONLY transaction.
// Local tool, not in CI.
import { readFileSync } from 'node:fs';
import { isMain } from '../tests/_is-main.mjs';
import { charLevelFromXp } from '../src/core/xp.js';
import { lagVerdict, WATCHED_SQL, watchedOf } from './lib/hunt-lag.mjs';
import { resolveEnv, runTool, scrub } from './lib/env.mjs';

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const short = (o) => JSON.stringify(o, (k, v) => (typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '…' : v)).slice(0, 400);

/**
 * @param {string[]} argv
 * @param {object} [deps]  { fetch, read, home, log, err }: injectable (tests/tool-env.mjs)
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, deps = {}) {
  const log = deps.log || console.log;
  const err = deps.err || console.error;
  const fetchImpl = deps.fetch || fetch;
  const env = resolveEnv({ argv, write: false, home: deps.home, read: deps.read || ((p) => readFileSync(p, 'utf8')) });
  const [who, slotArg] = env.rest.filter((a) => !String(a).startsWith('--'));
  log(env.banner);
  if (!who) { err('usage: node tools/char-state.local.mjs <name> | <user8> <slot> [--env staging|production]'); return 2; }

  async function q(sql) {
    const r = await fetchImpl(env.db, {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.token(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
    if (!r.ok) throw new Error(scrub(await r.text(), env).slice(0, 160));
    return r.json();
  }
  const rows = async (table, where, order, limit) => {
    try { return (await q(`select row_to_json(t) j from (select * from public.${table} where ${where} ${order ? 'order by ' + order : ''} limit ${limit || 5}) t`)).map((r) => r.j); }
    catch (e) { return [{ error: e.message.slice(0, 80) }]; }
  };

  const id = /^[0-9a-f]{6,}$/i.test(who)
    ? (await q(`select user_id, slot, name from public.character_names where user_id::text like ${lit(who + '%')} and slot = ${Number(slotArg) || 0}`))[0]
    : (await q(`select user_id, slot, name from public.character_names where lower(name) = lower(${lit(who)})`))[0];
  if (!id) { err(`no such character on ${env.name}`); return 1; }
  const W = `user_id = ${lit(id.user_id)} and slot = ${Number(id.slot)}`;

  const [sheet] = await rows('hr_character_sheets', W, '', 1);
  /* The Level the game shows (r09): player_state.level_xp on the shared curve, never the cached engine sheet's. */
  const [lx] = await q(`select level_xp from public.player_state where ${W}`);
  const hunts = await q(`select s.hunt_id, s.seat, s.unit_id, to_char(s.entered_at, 'HH24:MI') entered, to_char(s.ended_at, 'HH24:MI') ended, s.end_reason,
    s.leave_at is not null leaving, round(extract(epoch from now() - i.settled_to)) lag_s
    from public.hunt_sessions s left join public.hunt_instances i on i.id = s.instance_id where s.${W.replace(' and ', ' and s.')}
    order by s.entered_at desc limit 4`);
  log(`${id.name} · ${String(id.user_id).slice(0, 8)} slot ${id.slot}` + (lx ? ` · Level ${charLevelFromXp(Number(lx.level_xp))} (${lx.level_xp} Level XP)` : ''));
  if (sheet && sheet.sheet) { const s = typeof sheet.sheet === 'string' ? JSON.parse(sheet.sheet) : sheet.sheet;
    const v = (x) => (x && typeof x === 'object' ? JSON.stringify(x) : x);
    log(`  cached engine sheet (${String(sheet.computed_at || '?').slice(0, 16)}; stale once the Level or gear moved): Level ${v(s.level)} ${s.role || ''} (${s.weapon_type || '?'}) · HP ${v(s.max_hp)} · mana ${v(s.max_mana)} · dmg ${v(s.damage)} · def ${v(s.defence)} · regen ${v(s.regen_pct)}% · speed ${v(s.move_speed)}`); }
  /* per hero (hunt-lag.mjs watchedOf): the open instance's heroes, one of them viewed */
  const seats = (await q(`select o.user_id::text u, o.slot s from public.hunt_sessions o where o.ended_at is null and o.instance_id =
    (select s.instance_id from public.hunt_sessions s where s.${W.replace(' and ', ' and s.')} and s.ended_at is null limit 1)`)).map((r) => [r.u, r.s]);
  const watched = watchedOf(await q(WATCHED_SQL))(seats);
  log('Hunts:');
  for (const h of hunts) log(`  ${h.ended ? '   ' : 'NOW'} ${h.hunt_id} seat ${h.seat} unit ${h.unit_id} ${h.entered}–${h.ended || '…'} ${h.end_reason || ''}${h.leaving ? ' (leaving)' : ''}${h.ended ? '' : ` · server lag ${h.lag_s}s${(() => { const v = lagVerdict({ lagS: Number(h.lag_s), watched }); return v.code === 'ok' ? ' (' + v.note + ')' : ' ' + v.note; })()}`}`);
  for (const [label, table, where, order] of [['Outfit', 'player_outfits', W, ''], ['Party', 'hunt_party_members', W, ''], ['Hunt presets', 'player_hunt_presets', W, ''],
    ['Refusals today', 'hr_rejections', W + ' and day = current_date', 'last_at desc'], ['Ledger (last 5)', 'player_ledger', W, '1 desc']]) {
    const r = await rows(table, where, order, 5);
    log(`${label}: ${r.length ? '' : 'none'}`);
    for (const x of r) log('  ' + short(x));
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
