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
// 2026-10-22: 2026-11-02-hero-creation.sql's §6 drew its random probe names
// checking only character_names, but hr_create_hero also refuses a BLOCKED
// name and another account's display name, so the replay went red whenever a
// draw hit one. Its draws now exit only on a name the RPC accepts. HC below
// forces the first three draws to a blocked name, an account's display name
// and a character's name (all seeded), so each arm is exercised every run.
//
//   node tests/names-selfcheck-collision.mjs           the guard (both files)
//   node tests/names-selfcheck-collision.mjs --mutate  each mutant must turn the replay red:
//       fixed_fremulon   the fixed 'Fremulon' probe name restored
//       hc_pre_fix       hero-creation's old draw (character_names only) over the forced draws
//       hc_no_blocklist  the draw no longer asks hr_validate_display_name
//       hc_no_profiles   the draw no longer checks accounts' display names
//       hc_no_characters the draw no longer checks characters' names
// mutant-anchors: supabase/migrations/2026-10-29-character-names-everywhere.sql supabase/migrations/2026-11-02-hero-creation.sql
// Exit: 0 green (or every mutant caught) · 1 red · 2 harness.
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

// ── HC: 2026-11-02-hero-creation.sql §6 ─────────────────────────────────────
const HC = '2026-11-02-hero-creation.sql';
const U3 = '000000c0-0000-4000-8000-00000f2e0003';
const U4 = '000000c0-0000-4000-8000-00000f2e0004';
const BLOCKED = 'Zhdildo';          // folds to a substring blocklist stem: hr_validate_display_name says 'blocked'
const ACCOUNT = 'Zhtakenacct';      // another account's display name
const HERO = 'Zhtakenhero';         // another character's name
const HC_SEED = `
insert into auth.users (id) values ('${U3}'), ('${U4}') on conflict (id) do nothing;
insert into public.profiles (id, display_name) values ('${U3}', '${ACCOUNT}') on conflict (id) do update set display_name = excluded.display_name;
insert into public.player_state (user_id, slot) values ('${U4}', 0) on conflict do nothing;
insert into public.character_names (user_id, slot, name, canonical) values ('${U4}', 0, '${HERO}', public.hr_canon_display_name('${HERO}'));
`;
const DRAW = "    v_n1 := 'Zh' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');";
/* The first three draws are the three names the RPC refuses; the fourth is random as shipped. */
const FORCE = [DRAW, `    v_n1 := case when v_n1 is null then '${BLOCKED}' when v_n1 = '${BLOCKED}' then '${ACCOUNT}' when v_n1 = '${ACCOUNT}' then '${HERO}'
              else 'Zh' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop') end;`];
const ARM_BLOCK = "exit when coalesce(public.hr_validate_display_name(v_n1)->>'ok', '') = 'true'\n      and not exists (select 1 from public.character_names";
const ARM_HERO = "\n      and not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n1))";
const ARM_ACCT = "\n      and not exists (select 1 from public.profiles where display_name is not null and public.hr_canon_display_name(display_name) = public.hr_canon_display_name(v_n1));";
const HC_EXIT = ARM_BLOCK.split('\n')[0] + ARM_HERO + ARM_ACCT;

const MUTANTS = {
  fixed_fremulon: { file: FILE, pairs: [[
    "v_n1 := 'Zq' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');\n    exit when not exists",
    "v_n1 := 'Fremulon';\n    exit when true or not exists",
  ]], caught: /character_names_canonical|duplicate key/ },
  hc_pre_fix: { file: HC, pairs: [FORCE, [HC_EXIT,
    'exit when not exists (select 1 from public.character_names where canonical = public.hr_canon_display_name(v_n1));']], caught: /VERIFY\(a\).*bad_name.*blocked/ },
  hc_no_blocklist: { file: HC, pairs: [FORCE, [ARM_BLOCK, 'exit when true\n      and not exists (select 1 from public.character_names']], caught: /VERIFY\(a\).*bad_name.*blocked/ },
  hc_no_profiles: { file: HC, pairs: [FORCE, [ARM_ACCT, ';']], caught: /VERIFY\(a\).*name_taken/ },
  hc_no_characters: { file: HC, pairs: [FORCE, [ARM_HERO, '']], caught: /VERIFY\(a\).*name_taken/ },
};

async function runNames(patches) {
  const { db } = await bootReplay({ seedBefore: new Map([[FILE, SEED]]), upTo: FILE, ...(patches ? { patches: new Map([[FILE, patches]]) } : {}) });
  const rows = (await db.query(`select name from public.character_names where user_id in ('${U1}', '${U2}') order by name`)).rows.map((r) => r.name);
  return rows.join(',') === 'Cheeseburger Eddie,Fremulon' ? [] : [`the seeded names changed: ${rows}`];
}

async function runHero(pairs) {
  const { db } = await bootReplay({ seedBefore: new Map([[HC, HC_SEED]]), upTo: HC, patches: new Map([[HC, pairs]]) });
  const names = (await db.query(`select name from public.character_names where user_id = '${U4}'`)).rows.map((r) => r.name).join(',');
  const acct = (await db.query(`select display_name from public.profiles where id = '${U3}'`)).rows.map((r) => r.display_name).join(',');
  return names === HERO && acct === ACCOUNT ? [] : [`HC the seeded names changed: character ${names}, account ${acct}`];
}

const run = (m) => (m.file === FILE ? runNames(m.pairs) : runHero(m.pairs));

if (process.argv.includes('--mutate')) {
  let escaped = 0;
  for (const [name, m] of Object.entries(MUTANTS)) {
    let err = null;
    try { await run(m); } catch (e) { err = e; }
    if (err && err.harness) { console.error(`  ✗ ${name}: harness: ${String(err.message).split('\n')[0]}`); process.exit(2); }
    const text = err ? String(err.failures?.at(-1)?.error || err.message) : '';
    if (err && m.caught.test(text)) console.log(`  ✓ ${name} — caught (${text.split('\n')[0].slice(0, 120)})`);
    else { console.error(`  ✗ ${name} — ${err ? 'red for another reason: ' + text.slice(0, 200) : 'ESCAPED: the replay applied'}`); escaped++; }
  }
  if (escaped) { console.error(`names-selfcheck-collision --mutate: ${escaped} escaped`); process.exit(1); }
  console.log(`names-selfcheck-collision --mutate: ${Object.keys(MUTANTS).length}/${Object.keys(MUTANTS).length} caught`);
} else {
  const fails = [];
  try { fails.push(...await runNames()); } catch (e) { fails.push(String(e.message).split('\n')[0]); }
  try { fails.push(...await runHero([FORCE])); } catch (e) { fails.push('HC ' + String(e.failures?.at(-1)?.error || e.message).split('\n')[0]); }
  if (fails.length) { console.error('names-selfcheck-collision: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('names-selfcheck-collision: green — the names §4 applies over real characters named Fremulon and Cheeseburger Eddie and leaves them alone; hero-creation §6 draws past a blocked name, an account\'s name and a character\'s name');
}
