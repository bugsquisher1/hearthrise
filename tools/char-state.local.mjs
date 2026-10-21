// tools/char-state.local.mjs — one character as the live server holds it, read-only, one screen.
// For "a player says X": look before guessing.
//
//   node tools/char-state.local.mjs Fingerguns        by character name (case-insensitive)
//   node tools/char-state.local.mjs 0a47ba77 1        by user-id prefix + slot
//
// Prints the character sheet, its hunts (open + last 3, with the instance's settle lag), party rows,
// the hunt presets, today's refusals and the last ledger rows. SELECT-only via the Management API
// with ~/.supabase-token, inside a READ ONLY transaction. Local tool, not in CI.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const tok = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
const [who, slotArg] = process.argv.slice(2);
if (!who) { console.error('usage: node tools/char-state.local.mjs <name> | <user8> <slot>'); process.exit(2); }
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
async function q(sql) {
  const r = await fetch('https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
  if (!r.ok) throw new Error((await r.text()).slice(0, 160));
  return r.json();
}
const rows = async (table, where, order, limit) => {
  try { return (await q(`select row_to_json(t) j from (select * from public.${table} where ${where} ${order ? 'order by ' + order : ''} limit ${limit || 5}) t`)).map((r) => r.j); }
  catch (e) { return [{ error: e.message.slice(0, 80) }]; }
};
const short = (o) => JSON.stringify(o, (k, v) => (typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '…' : v)).slice(0, 400);

const id = /^[0-9a-f]{6,}$/i.test(who)
  ? (await q(`select user_id, slot, name from public.character_names where user_id::text like ${lit(who + '%')} and slot = ${Number(slotArg) || 0}`))[0]
  : (await q(`select user_id, slot, name from public.character_names where lower(name) = lower(${lit(who)})`))[0];
if (!id) { console.error('no such character'); process.exit(1); }
const W = `user_id = ${lit(id.user_id)} and slot = ${Number(id.slot)}`;
const U = `user_id = ${lit(id.user_id)}`;

const [sheet] = await rows('hr_character_sheets', W, '', 1);
const hunts = await q(`select s.hunt_id, s.seat, s.unit_id, to_char(s.entered_at, 'HH24:MI') entered, to_char(s.ended_at, 'HH24:MI') ended, s.end_reason,
  s.leave_at is not null leaving, round(extract(epoch from now() - i.settled_to)) lag_s
  from public.hunt_sessions s left join public.hunt_instances i on i.id = s.instance_id where s.${W.replace(' and ', ' and s.')}
  order by s.entered_at desc limit 4`);
console.log(`${id.name} · ${String(id.user_id).slice(0, 8)} slot ${id.slot}`);
if (sheet && sheet.sheet) { const s = typeof sheet.sheet === 'string' ? JSON.parse(sheet.sheet) : sheet.sheet;
  const v = (x) => (x && typeof x === 'object' ? JSON.stringify(x) : x);
  console.log(`  Level ${v(s.level)} ${s.role || ''} (${s.weapon_type || '?'}) · HP ${v(s.max_hp)} · mana ${v(s.max_mana)} · dmg ${v(s.damage)} · def ${v(s.defence)} · regen ${v(s.regen_pct)}% · speed ${v(s.move_speed)}`); }
console.log('Hunts:');
for (const h of hunts) console.log(`  ${h.ended ? '   ' : 'NOW'} ${h.hunt_id} seat ${h.seat} unit ${h.unit_id} ${h.entered}–${h.ended || '…'} ${h.end_reason || ''}${h.leaving ? ' (leaving)' : ''}${h.ended ? '' : ` · server lag ${h.lag_s}s${Number(h.lag_s) > 32 ? ' FREEZING' : ''}`}`);
for (const [label, table, where, order] of [['Party', 'hunt_party_members', W, ''], ['Hunt presets', 'player_hunt_presets', W, ''],
  ['Refusals today', 'hr_rejections', W + ' and day = current_date', 'last_at desc'], ['Ledger (last 5)', 'player_ledger', W, '1 desc']]) {
  const r = await rows(table, where, order, 5);
  console.log(`${label}: ${r.length ? '' : 'none'}`);
  for (const x of r) console.log('  ' + short(x));
}
