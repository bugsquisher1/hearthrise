#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/room-purpose.mjs — EVERY ROOM DOES ONE THING, ON THE SERVER PATH.
//
//   node tests/room-purpose.mjs             the guard
//   node tests/room-purpose.mjs --list      the mutation catalogue
//   node tests/room-purpose.mjs --selftest  every mutation must be CAUGHT
//   node tests/room-purpose.mjs --mutate=<id>
//
// Game-designer ruling 2026-10-22 (PRIORITY_BOARD Decisions): the Garden,
// Library and Trophy Room paid nothing. Now:
//   RP1 LIBRARY = runecrafting's bench. A Library rung read back through the
//       server's own perk channel (hr_perks_of -> src/core/perks.js makeBonus)
//       makes rune binding 2..10% faster, and nothing else: the Workshop no
//       longer speeds runecrafting, the Library speeds no other skill.
//   RP2 GARDEN = farm beds. Through the REAL hr_farm_plant on a replayed chain:
//       no Garden caps at 2 beds; the account's Garden rung (bought on a
//       sibling hero) adds farmPlots beds to every hero; past them is plot_cap.
//   RP3 NO ROOM PAYS XP OR YIELD (Master Design Reference §9), and every key a
//       rung pays is one the engine or the House window knows.
// The Trophy Room's mounts are proven where they are drawn: tests/world-town-home.mjs F.
// Ships with: 2026-11-23-room-purpose-room-perks.generated.sql, 2026-11-23-garden-beds.sql.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';
import { makeBonus, normalisePerkState, ROOM_PERKS, ROOM_PERK_KEYS } from '../src/core/perks.js';
import { actionIntervalMs, SPEED_KEYS } from '../src/core/pacing.js';

const MIG = '2026-11-23-garden-beds.sql';
const GATE_BLIND = [['  v_top int; v_g1 int;\nbegin\n', '  v_top int; v_g1 int;\nbegin\n  if true then return; end if;   -- selftest: §3 short-circuited\n']];
const MUTATIONS = {
  garden_ignored: {
    why: 'the cap forgets the Garden: a player pays for beds the plant verb never opens',
    find: "       + coalesce((select (rp.perks->>'farmPlots')::int", repl: "       + 0 * coalesce((select (rp.perks->>'farmPlots')::int",
  },
  garden_per_character: {
    why: 'the Garden is read for the planting hero only: one home per account becomes one home per hero',
    find: "      from public.hr_unlock_levels(p_user, p_slot)\n  )", repl: "      from public.hr_unlock_levels(p_user, p_slot) where false\n  )",
  },
  garden_flat: {
    why: 'every Garden rung reads as rung 1: upgrading the Garden pays nothing',
    find: "                      and rp.level = least(lv.garden,", repl: "                      and rp.level = least(1,",
  },
  plant_old_cap: {
    why: 'hr_farm_plant keeps the property-only cap: the Garden sells nothing',
    find: '  v_plot_cap := public.hr_farm_plot_cap(v_uid, p_slot);\n',
    repl: "  v_plot_cap := (coalesce((select max(level) from public.hr_unlock_levels(v_uid, p_slot) where unlock_id like 'property:%'), 0) + 1) * 2; -- hr_farm_plot_cap(v_uid, p_slot)\n",
  },
};
for (const m of Object.values(MUTATIONS)) m.also = GATE_BLIND;

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

function jsChecks() {
  // RP1 (JS half): the Library's ladder, read the way the engine reads it.
  const base = actionIntervalMs('runecrafting', 3000, { bonus: makeBonus({}) });
  for (let lv = 1; lv <= 5; lv++) {
    const ms = actionIntervalMs('runecrafting', 3000, { bonus: makeBonus({ rooms: { library: lv } }) });
    const want = Math.max(500, Math.floor(Math.floor(3000 * 1.6) * (1 - 0.02 * lv)));   // the ruling's 2/4/6/8/10%, restated
    ok(ms === want, `RP1: Library ${lv} binds a rune in ${ms} ms, expected ${want} (base ${base})`);
  }
  ok(actionIntervalMs('runecrafting', 3000, { bonus: makeBonus({ rooms: { workshop: 5 } }) }) === base, 'RP1: the Workshop still speeds runecrafting');
  for (const skill of ['crafting', 'cooking', 'smithing', 'prayer', 'mining']) {
    ok(actionIntervalMs(skill, 3000, { bonus: makeBonus({ rooms: { library: 5 } }) }) === actionIntervalMs(skill, 3000, { bonus: makeBonus({}) }),
      `RP1: the Library speeds ${skill}`);
  }
  ok(SPEED_KEYS.runeSpeed === 1, 'RP1: runeSpeed is not a speed key');
  // RP3: no XP or yield, every rung pays something, every key is known.
  const banned = /^(allXP|combatXP|farmYield|rested|restedXp|restedCap|yield_.*)$/;
  for (const [room, rungs] of Object.entries(ROOM_PERKS)) {
    rungs.forEach((r, i) => {
      ok(Object.keys(r).length > 0, `RP3: ${room} rung ${i + 1} pays nothing`);
      for (const k of Object.keys(r)) {
        ok(!banned.test(k), `RP3: ${room} rung ${i + 1} pays ${k} (a home never grants XP or yield)`);
        ok(ROOM_PERK_KEYS.includes(k), `RP3: ${room} rung ${i + 1} pays ${k}, not in ROOM_PERK_KEYS`);
      }
    });
  }
}

async function run(mutate) {
  problems.length = 0;
  if (!mutate) jsChecks();
  const m = mutate ? MUTATIONS[mutate] : null;
  if (mutate && !m) { const e = new Error(`unknown mutation: ${mutate}`); e.harness = true; throw e; }
  const { db } = await bootReplay({ patches: m ? new Map([[MIG, [[m.find, m.repl], ...m.also]]]) : undefined, upTo: MIG });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const as = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const gate = () => q('delete from public.hr_rate_counters');

  const u = (await one('select gen_random_uuid() as i')).i;
  await q('insert into auth.users (id) values ($1)', [u]);
  await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'room-purpose test')", [u]);
  await as(u);
  for (const s of [0, 1]) { await gate(); await q('select public.hr_create_character($1)', [s]); }
  const rung = async (slot, room, lv) => {
    const kind = (await one('select progress_kind k from public.hr_unlocks where unlock_id = $1', ['room:' + room])).k;
    await q("insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at) values ($1,$2,$3,$4,$5,'',null,now()) on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value", [u, slot, kind, 'room:' + room, lv]);
  };

  // RP1 (server half): the Library bought on hero 1 reaches hero 0's engine perk state.
  if (!mutate) {
    await rung(1, 'library', 3);
    const perks = (await one('select public.hr_perks_of($1, 0) p', [u])).p;
    const b = makeBonus(normalisePerkState(perks));
    ok(Math.abs(b('runeSpeed') - 0.06) < 1e-9, `RP1: hero 0's server perks pay runeSpeed ${b('runeSpeed')} from ${JSON.stringify(perks && perks.rooms)}`);
  }

  // RP2 THE GARDEN, through the real plant verb.
  const crop = await one(`select c.crop_id, c.seed_item from public.hr_crops c join public.hr_crop_plot_tier t on t.crop_id = c.crop_id
    where c.req_lv <= 1 and t.plot_tier <= (select plot_level from public.player_state where user_id = $1 and slot = 0) order by c.crop_id limit 1`, [u]);
  await q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,50) on conflict (user_id, slot, item_id) do update set qty = 50', [u, crop.seed_item]);
  const plant = async (idx) => { await as(u); await gate(); return (await one('select public.hr_farm_plant(0,$1,$2,gen_random_uuid()) v', [idx, crop.crop_id])).v; };
  let v = await plant(1);
  ok(v && v.ok === true, `RP2: bed 1 with no Garden answered ${JSON.stringify(v)}`);
  v = await plant(2);
  ok(v && v.error === 'plot_cap' && v.cap === 2, `RP2: bed 2 with no Garden answered ${JSON.stringify(v)}`);
  const beds = ROOM_PERKS.garden.map((r) => r.farmPlots);
  await rung(1, 'garden', 3);
  v = await plant(2 + beds[2] - 1);
  ok(v && v.ok === true, `RP2: the last Garden-3 bed (${2 + beds[2] - 1}) answered ${JSON.stringify(v)}`);
  v = await plant(2 + beds[2]);
  ok(v && v.error === 'plot_cap' && v.cap === 2 + beds[2], `RP2: past the Garden-3 beds answered ${JSON.stringify(v)}`);
  await rung(1, 'garden', beds.length);
  v = await plant(2 + beds[beds.length - 1]);
  ok(v && v.error === 'plot_cap' && v.cap === 2 + beds[beds.length - 1], `RP2: the top Garden rung answered ${JSON.stringify(v)} (top is ${2 + beds[beds.length - 1]})`);
  const acl = await one("select has_function_privilege('authenticated','public.hr_farm_plot_cap(uuid,integer)','execute') e");
  ok(!acl.e, 'RP2: authenticated may call hr_farm_plot_cap');
  await db.close?.();
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) { for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}`); process.exit(0); }
  const oneArg = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest') || oneArg) {
    const ids = oneArg ? [oneArg.slice('--mutate='.length)] : Object.keys(MUTATIONS);
    let slipped = 0;
    for (const id of ids) {
      let caught;
      try { const p = await run(id); caught = p.length ? p[0] : null; }
      catch (e) { if (e.harness) throw e; caught = 'refused at apply: ' + String(e.message).split('\n')[0].slice(0, 160); }
      if (caught) console.log(`  CAUGHT  ${id}: ${caught}`);
      else { slipped++; console.log(`  SLIPPED ${id}: ${MUTATIONS[id].why}`); }
    }
    console.log(slipped ? `room-purpose --selftest: ${slipped} mutation(s) SLIPPED` : `room-purpose --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('room-purpose: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('room-purpose: the Library binds runes faster through the server perk channel, the Garden adds farm beds to every hero through hr_farm_plant, no room pays XP or yield (RP1-RP3 green)');
  process.exit(0);
} catch (e) {
  console.error(`room-purpose: HARNESS ERROR — ${e.message}`);
  process.exit(2);
}
