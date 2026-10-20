// ════════════════════════════════════════════════════════════════════════
// tests/names-selfcheck-collision.mjs — THE NAMES §4 NEVER COLLIDES WITH A
//                                       REAL CHARACTER'S NAME.
//
// 2026-10-20: the prod apply of 2026-10-29-character-names-everywhere.sql
// rolled back because its §4 probe inserted the fixed name 'Fremulon' and a
// real character on prod already held it (character_names_canonical). The
// probe names are now generated per run and checked absent. This replays the
// chain with real characters named Fremulon and Cheeseburger Eddie seeded in
// front of the file; the file must still apply and leave the seeded rows alone.
//
//   node tests/names-selfcheck-collision.mjs           the guard
//   node tests/names-selfcheck-collision.mjs --mutate  the fixed 'Fremulon'
//       probe name restored: the replay must fail on the seeded collision.
// Exit: 0 green (or the mutant caught) · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';

const FILE = '2026-10-29-character-names-everywhere.sql';
const U1 = '000000c0-0000-4000-8000-00000f2e0001';
const U2 = '000000c0-0000-4000-8000-00000f2e0002';
const SEED = `
insert into auth.users (id) values ('${U1}'), ('${U2}') on conflict (id) do nothing;
insert into public.player_state (user_id, slot) values ('${U1}', 0), ('${U2}', 0) on conflict do nothing;
insert into public.character_names (user_id, slot, name, canonical) values
  ('${U1}', 0, 'Fremulon', public.hr_canon_display_name('Fremulon')),
  ('${U2}', 0, 'Cheeseburger Eddie', public.hr_canon_display_name('Cheeseburger Eddie'));
`;
const MUTANT = [[
  "v_n1 := 'Zq' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');\n    exit when not exists",
  "v_n1 := 'Fremulon';\n    exit when true or not exists",
]];

async function run(patches) {
  const { db } = await bootReplay({ seedBefore: new Map([[FILE, SEED]]), upTo: FILE, ...(patches ? { patches: new Map([[FILE, patches]]) } : {}) });
  const rows = (await db.query(`select name from public.character_names where user_id in ('${U1}', '${U2}') order by name`)).rows.map((r) => r.name);
  return rows.join(',') === 'Cheeseburger Eddie,Fremulon' ? [] : [`the seeded names changed: ${rows}`];
}

if (process.argv.includes('--mutate')) {
  let threw = false;
  try { await run(MUTANT); } catch (e) { threw = /character_names_canonical|duplicate key/.test(String(e.message)); if (!threw) { console.error('mutant threw something else: ' + e.message); process.exit(2); } }
  if (!threw) { console.error('names-selfcheck-collision --mutate: ESCAPED (a fixed probe name applied over a real Fremulon)'); process.exit(1); }
  console.log('names-selfcheck-collision --mutate: caught (the fixed probe name collides with the seeded Fremulon)');
} else {
  let fails;
  try { fails = await run(); } catch (e) { fails = [String(e.message).split('\n')[0]]; }
  if (fails.length) { console.error('names-selfcheck-collision: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('names-selfcheck-collision: green — the names §4 applies over real characters named Fremulon and Cheeseburger Eddie and leaves them alone');
}
