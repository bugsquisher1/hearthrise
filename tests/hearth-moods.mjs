#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hearth-moods.mjs — THE GREAT HEARTH BURNS ONE THING AT A TIME, AND ITS SMOKE FOLLOWS (lane/c-hearth-moods; Tyler 2026-11-18:
//   "When someone opens the chest ... the fire should turn green and blow our dark green and black smoke. Just be sure to have a 'priority'
//   if two people are using the hearth for different things it doesn't break the game." 2027-05-05-hearth-moods.sql; src/world/hearth-burn.js.)
//
//   node tests/hearth-moods.mjs             the guard
//   node tests/hearth-moods.mjs --list      the mutation catalogue
//   node tests/hearth-moods.mjs --selftest  every planted defect must turn its arm red
//   node tests/hearth-moods.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-05-05-hearth-moods.sql
//
// The real chain replayed (PGlite), the real verbs (hr_chest_open, hr_hearth_burn, hr_town_show, hr_town_view), the real client modules:
//   HM-RANK    ONE WINNER, highest first, through a stranger's town read: the chest's window, a named flame, a bought powder, the plain fire
//              (null); each answer names its kind; as the windows end the next one down shows
//   HM-EXTEND  a second key during a window EXTENDS it (one row, ends 10 s past the press, its start kept), never queues; a replayed key moves nothing
//   HM-CAP     keys every 2 s for two minutes: no green run longer than 30 s, green at most (span + 30) / 2 of the time, and never stuck off; a resting
//              square shows nothing for a key until a whole 10 s of credit is back
//   HM-PAUSE   NOTHING PAID IS LOST: a powder and a named flame burning or queued when the chest opens (and when it extends) each show for every
//              second they were booked for; a named flame and a powder booked DURING the window start when it ends (the seconds counted by a
//              sweep of the rows with the read's own priority)
//   HM-ROLLBACK a refused press, a press rolled back with its transaction and another chest write no window
//   HM-WALL    the Game Master's hero colours nothing and moves no flame
//   HM-AGAIN   a second apply is byte-identical: bodies, grants, triggers, the table; the window on the square stays
//   HM-CLIENT  the town read's kind and window key reach the World; the fire swaps to the chest's art only when the atlas has it (else the plain
//              fire); the flue's smoke is poured on the winner's ladder (none for the plain fire); the chest's puff plays once a window, from the
//              first frame that sees it, rising whole pixels, and again for a new window; core/ambient.js draws the pour and the puffs
//   HM-DATA    every flame has a smoke ladder on the palette (and no ladder names a flame that isn't); the shipped plume poured comes out in
//              exactly its ladder's three colours; the chest's row names hearth_fire_chest; the puff is one turn of the plume, a pixel a beat;
//              none of this reaches the edge bundle
// TRUE CONCURRENCY (two players at once): tests/town-shows-race.mjs R11-R14 on real PostgreSQL 17 backends.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = '2027-05-05-hearth-moods.sql';
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const MAP = 'town_common';
const A = '000000c0-0000-4000-a000-0000901f7a01';   // buys a powder
const B = '000000c0-0000-4000-a000-0000901f7a02';   // burns a named fuel
const C = '000000c0-0000-4000-a000-0000901f7a03';   // opens the chest
const V = '000000c0-0000-4000-a000-0000901f7a04';   // a stranger reading the town
const W = '000000c0-0000-4000-a000-0000901f7a05';   // the Game Master
const idem = () => crypto.randomUUID();
const BURST = 'public.hr_hearth_chest_burst()';
const PAUSE = 'public.hr_hearth_pause(text,timestamp with time zone,timestamp with time zone)';
const AFTER = 'public.hr_hearth_named_after_burst()';
const FREE = 'public.hr_town_show_free_at(text,text)';
const FLAME = 'public.hr_hearth_flame_of(text)';

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). ddl: a statement in it. sql: an edit of the migration's TEXT the arm
   re-applies. js: a client module, copied and edited. Each names the arm that must go red. */
export const MUTANTS = {
  chest_never_first: { arm: 'HM-RANK', why: 'the square never shows the chest\'s window',
    db: [FLAME, '      where b.map_id = p_map and b.starts_at <= now() and b.ends_at > now()),\n', '      where false),\n'] },
  bought_over_named: { arm: 'HM-RANK', why: 'a powder outranks a named flame',
    db: [FLAME, '      where f.map_id = p_map and f.starts_at <= now() and f.ends_at > now()\n', "      where f.map_id = p_map and f.starts_at <= now() and f.ends_at > now() and not exists (select 1 from public.town_shows x where x.map_id = p_map and x.sink_id = 'powder' and x.starts_at <= now() and x.ends_at > now())\n"] },
  no_kind: { arm: 'HM-RANK', why: 'the answer does not say which class won',
    db: [FLAME, "'flame', 'chest', 'kind', 'chest', 'item', null,", "'flame', 'chest', 'item', null,"] },
  window_queues: { arm: 'HM-EXTEND', why: 'a second key starts a new window over the first instead of extending it',
    db: [BURST, '  if found and v_b.ends_at > v_now then\n', '  if false then\n'] },
  window_never_grows: { arm: 'HM-EXTEND', why: 'a second key during a window adds nothing',
    db: [BURST, '    v_until := least(greatest(v_b.ends_at, v_now + c_secs), v_b.ends_at + v_b.credit);\n', '    v_until := v_b.ends_at;\n'] },
  no_cap: { arm: 'HM-CAP', why: 'keys back to back hold it green forever',
    db: [BURST, '    v_until := least(greatest(v_b.ends_at, v_now + c_secs), v_b.ends_at + v_b.credit);\n', '    v_until := greatest(v_b.ends_at, v_now + c_secs);\n'] },
  no_rest: { arm: 'HM-CAP', why: 'a dry square opens a new window at once, so back-to-back windows dodge the cap',
    db: [BURST, '  if v_credit < c_secs then return null; end if;\n', ''] },
  no_refill: { arm: 'HM-CAP', why: 'the credit never comes back, so the chest goes dark for good',
    db: [BURST, '  v_credit := case when found then least(c_cap, v_b.credit + (v_now - v_b.ends_at)) else c_cap end;\n', '  v_credit := case when found then v_b.credit else c_cap end;\n'] },
  no_pause: { arm: 'HM-PAUSE', why: 'a new window burns over a powder and a named flame, which lose those seconds',
    db: [BURST, '  perform public.hr_hearth_pause(v_map, v_now, v_until);\n', ''] },
  extension_no_pause: { arm: 'HM-PAUSE', why: 'an extension burns over the flames it covers',
    db: [BURST, '    if v_until > v_b.ends_at then perform public.hr_hearth_pause(v_map, v_b.ends_at, v_until); end if;\n', ''] },
  named_not_paused: { arm: 'HM-PAUSE', why: 'the chest eats a burning named flame\'s seconds',
    db: [PAUSE, "   where f.map_id = p_map and f.ends_at > p_from;\n", "   where false;\n"] },
  named_booked_under: { arm: 'HM-PAUSE', why: 'a named flame booked in the window starts under it',
    db: [AFTER, '  if v_end is not null and new.starts_at < v_end then\n', '  if false then\n'] },
  powder_booked_under: { arm: 'HM-PAUSE', why: 'a powder booked in the window starts under it',
    db: [FREE, "    case when p_sink = 'powder' then (select b.ends_at from public.hearth_bursts b where b.map_id = p_map) end)\n", '    null)\n'] },
  any_chest_burns: { arm: 'HM-ROLLBACK', why: 'another chest colours the Hearth',
    db: [BURST, " and o.chest_id = 'great_hearth') then return null; end if;\n", ') then return null; end if;\n'] },
  wall_open: { arm: 'HM-WALL', why: 'the Game Master\'s key pauses everyone\'s flames',
    db: [BURST, '  if public.hr_gm_walled(new.user_id) then return null; end if;\n', ''] },
  repin_lost: { arm: 'HM-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image',
    sql: [FILE, "'6c841b157520be382feef27d277fda3b', '4ff4ccd6ddf31c48de6dae774d332cfe'", "'6c841b157520be382feef27d277fda3b', '00000000000000000000000000000000'"] },
  helper_for_clients: { arm: 'HM-AGAIN', why: 'a client can call the pause', ddl: 'grant execute on function public.hr_hearth_pause(text, timestamptz, timestamptz) to authenticated' },
  client_drops_kind: { arm: 'HM-CLIENT', why: 'the World never hears the window is the chest\'s, so it never puffs',
    js: ['src/session/town-presence.js', [["    kind: FLAME_KINDS.includes(h.kind) ? h.kind : null, key: h.flame + '@' + from,", "    kind: null, key: h.flame + '@' + from,"]]] },
  smoke_unpoured: { arm: 'HM-CLIENT', why: 'the smoke stays grey whatever the fire burns',
    js: ['src/world/hearth-burn.js', [["const smokeOf = (flame) => (flame && Object.hasOwn(POURS, 'smoke_' + flame) ? 'smoke_' + flame : null);", 'const smokeOf = () => null;']]] },
  puff_every_read: { arm: 'HM-CLIENT', why: 'the puff starts again on every frame, so it never ends',
    js: ['src/world/hearth-burn.js', [["if (h && h.kind === 'chest' && h.key !== puffKey) { puffKey = h.key; puffAt = now; }", "if (h && h.kind === 'chest') { puffKey = h.key; puffAt = now; }"]]] },
  puff_per_extension: { arm: 'HM-CLIENT', why: 'a window stretched by a second key puffs again',
    js: ['src/session/town-presence.js', [["key: h.flame + '@' + from,", "key: h.flame + '@' + until,"]]] },
  chest_plain_fire: { arm: 'HM-CLIENT', why: 'the chest\'s window draws the plain fire though the atlas has its green',
    js: ['src/world/hearth-burn.js', [['const FLAMES = Object.freeze({ ...NAMED_FLAMES, ...SHOW_FLAMES, ...CHEST_FLAMES });', 'const FLAMES = Object.freeze({ ...NAMED_FLAMES, ...SHOW_FLAMES });']]] },
  life_ignores_pour: { arm: 'HM-CLIENT', why: 'the map\'s life draws the flue in its own grey under any flame',
    js: ['src/world/core/ambient.js', [['    if (pour) d.pour = pour;\n', '']]] },
  ladder_off_flame: { arm: 'HM-DATA', why: 'a flame has no smoke of its own',
    js: ['src/data/world/palette.js', [['    borax: Object.freeze([0x3d6234, 0x557a3e, 0x73944c]),       // leaf 3-5\n', '']]] },
  ladder_off_palette: { arm: 'HM-DATA', why: 'a smoke colour is not on hr-world-56-v2',
    js: ['src/data/world/palette.js', [['chest: Object.freeze([0x17141a, 0x16241a, 0x2c4a2c])', 'chest: Object.freeze([0x17141a, 0x16241a, 0x2c4a2d])']]] },
  chest_wrong_art: { arm: 'HM-DATA', why: 'the chest\'s row names art the art lane does not draw',
    js: ['src/data/world/hearth-moods.js', [["export const CHEST_FLAMES = Object.freeze({ chest: flame('chest', 'burns green') });", "export const CHEST_FLAMES = Object.freeze({ chest: flame('chest_burst', 'burns green') });"]]] },
  puff_half_pixels: { arm: 'HM-DATA', why: 'the puff rises off the life beat, a fraction of a pixel a frame',
    js: ['src/data/world/hearth-moods.js', [['  risePx: 24,\n', '  risePx: 37,\n']]] },
};

const q = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; };
const claims = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true)`,
  [uid || '', uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '', JSON.stringify({ 'cf-connecting-ip': '198.51.100.' + (uid ? parseInt(uid.slice(-2), 16) % 200 + 10 : 1) })]);
/* A verb as a signed-in player presses it: its session, its role. */
async function as(db, uid, sql, params) {
  await claims(db, uid);
  await db.exec('set local role authenticated');
  /* the verb's own error is the one reported (a failed statement aborts the transaction, so the reset after it fails too) */
  let r, err = null;
  try { r = await one(db, sql, params); } catch (e) { err = e; }
  try { await db.exec('reset role'); await claims(db, null); } catch (e) { if (!err) err = e; }
  if (err) throw err;
  return r;
}
async function hero(db, uid, name) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'hearth-moods guard') on conflict (user_id) do nothing`, [uid]);
  const dye = await one(db, 'select min(idx) from public.hr_outfit_dyes');
  const r = await as(db, uid, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [0, name, JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye }), idem()]);
  if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${name}): ` + JSON.stringify(r)), { harness: true });
  await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [uid]);
}
/* the square as the arm wants it: nothing burning (every row rolled back with the arm) */
async function square(db) {
  for (const t of ['hearth_bursts', 'hearth_flames', 'town_shows']) await db.query(`delete from public.${t} where map_id = $1`, [MAP]);
  await db.query('delete from public.hr_rate_counters');
}
const calm = (db) => db.query('delete from public.hr_rate_counters');
/* TIME PASSES: now() is one instant in a transaction, so every Hearth row of the map moves back by the span */
async function age(db, secs) {
  for (const t of ['hearth_bursts', 'hearth_flames', 'town_shows']) {
    await db.query(`update public.${t} set starts_at = starts_at - make_interval(secs => $2), ends_at = ends_at - make_interval(secs => $2) where map_id = $1`, [MAP, secs]);
  }
}
const keys = (db, uid, n) => db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_key_bronze', $2) on conflict (user_id, slot, item_id) do update set qty = excluded.qty", [uid, n]);
const open = async (db, uid, count = 1, key = idem()) => { await calm(db); return as(db, uid, "select public.hr_chest_open(0, 'great_hearth', 'bronze', $1::int, 0, $2::uuid)", [count, key]); };
/* A KEY USED, as the press writes it (its chest_opens row, then its one luck update), for runs longer than a hero's six a week. A key family no
   week counts. The real press is proven first in every arm that uses this. */
async function pressRow(db, uid, chest = 'great_hearth') {
  await db.query('insert into public.chest_luck (user_id, slot) values ($1, 0) on conflict (user_id, slot) do nothing', [uid]);
  const n = Number(await one(db, 'select opens from public.chest_luck where user_id = $1 and slot = 0', [uid])) + 1;
  await db.query(`insert into public.chest_opens (user_id, slot, n, chest_id, key_id, key_family, stokes, cinders_spent, dry, chance_ppm, roll, intent_id)
                  values ($1, 0, $2, $3, 'bronze', 'zz_probe', 0, 0, 0, 0, 999999, gen_random_uuid())`, [uid, n, chest]);
  await db.query('update public.chest_luck set opens = $2 where user_id = $1 and slot = 0', [uid, n]);
}
const buy = async (db, uid, show = 'cinnabar') => {
  await calm(db);
  const price = Number((await one(db, 'select public.hr_town_sink_quote($1, $2, $3)', [uid, MAP, 'powder'])).price);
  return as(db, uid, 'select public.hr_town_show(0, $1, $2::bigint, $3::uuid)', [show, price, idem()]);
};
const burn = async (db, uid) => { await calm(db); return as(db, uid, 'select public.hr_hearth_burn(0, $1, $2::uuid)', ['den_knot', idem()]); };
const flameOf = (db) => one(db, 'select public.hr_hearth_flame_of($1)', [MAP]);
const townRead = async (db) => { await calm(db); const r = await as(db, V, 'select public.hr_town_view(0, $1, null, null, null, null, null)', [MAP]); return r && r.hearth; };
const windowRow = (db) => q(db, 'select extract(epoch from starts_at - now())::float8 s, extract(epoch from ends_at - now())::float8 e, extract(epoch from credit)::float8 c, opens, user_id from public.hearth_bursts where map_id = $1', [MAP]).then((r) => r[0] || null);

/* THE SECONDS EACH FLAME SHOWS, by the read's own priority over the rows as they stand (s relative to now): the chest's window, else the named
   flame that started last, else the powder that started first. The window's past is the row's own span (one window an arm). */
async function shown(db) {
  const rows = await q(db, `select 'chest' k, 'chest' id, extract(epoch from starts_at - now())::float8 s, extract(epoch from ends_at - now())::float8 e from public.hearth_bursts where map_id = $1
    union all select 'named', item_id, extract(epoch from starts_at - now())::float8, extract(epoch from ends_at - now())::float8 from public.hearth_flames where map_id = $1
    union all select 'bought', show_id || ':' || id, extract(epoch from starts_at - now())::float8, extract(epoch from ends_at - now())::float8 from public.town_shows where map_id = $1 and sink_id = 'powder'`, [MAP]);
  const cuts = [...new Set(rows.flatMap((r) => [r.s, r.e]))].sort((x, y) => x - y);
  const out = {};
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t = (cuts[i] + cuts[i + 1]) / 2;
    const live = rows.filter((r) => r.s <= t && r.e > t);
    const w = live.find((r) => r.k === 'chest') || live.filter((r) => r.k === 'named').sort((x, y) => y.s - x.s)[0]
      || live.filter((r) => r.k === 'bought').sort((x, y) => x.s - y.s)[0];
    if (w) out[w.id] = Math.round(((out[w.id] || 0) + cuts[i + 1] - cuts[i]) * 1000) / 1000;
  }
  return { rows, out };
}
const near = (a, b) => Math.abs(a - b) < 0.01;

const ARMS = {
  'HM-RANK': async (db) => {
    const out = [];
    await square(db);
    for (const [u, n] of [[A, 'Hearthrank'], [B, 'Hearthburn'], [C, 'Hearthkey'], [V, 'Hearthlook']]) await hero(db, u, n);
    await db.query('update public.account_wallet set gold = 1000000 where user_id = $1', [A]);
    await db.query("insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, 'inner_flame', 50000000) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp", [B]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'den_knot', 2) on conflict (user_id, slot, item_id) do update set qty = excluded.qty", [B]);
    await keys(db, C, 3);
    /* (d) the plain fire */
    const plain = await townRead(db);
    if (plain !== null) out.push('a quiet square reads ' + JSON.stringify(plain));
    /* (c) a bought powder */
    const p = await buy(db, A);
    if (!p || p.ok !== true) return out.concat('the powder was refused: ' + JSON.stringify(p));
    const r1 = await townRead(db);
    if (!r1 || r1.flame !== 'cinnabar' || r1.kind !== 'bought') out.push('a powder reads ' + JSON.stringify(r1));
    /* (b) a named flame over it, the powder burning on under it (paused, not moved) */
    await age(db, 2);
    const n = await burn(db, B);
    if (!n || n.ok !== true) return out.concat('the named fuel was refused: ' + JSON.stringify(n));
    const r2 = await townRead(db);
    if (!r2 || r2.flame !== 'amber' || r2.kind !== 'named') out.push('a named flame over a powder reads ' + JSON.stringify(r2));
    /* (a) the chest's window over both */
    const c = await open(db, C);
    if (!c || c.ok !== true) return out.concat('the chest was refused: ' + JSON.stringify(c));
    const r3 = await townRead(db);
    if (!r3 || r3.flame !== 'chest' || r3.kind !== 'chest' || r3.item !== null || r3.until_ms - r3.from_ms !== 10000) out.push('the chest over both reads ' + JSON.stringify(r3));
    if (r3 && r3.by !== 'Hearthkey') out.push('the window does not name its opener: ' + JSON.stringify(r3 && r3.by));
    /* the windows end in order: the named flame again, then the powder, then the plain fire */
    await age(db, 10.5);
    const r4 = await townRead(db);
    if (!r4 || r4.kind !== 'named') out.push('the window over, the square reads ' + JSON.stringify(r4));
    await age(db, 60);
    const r5 = await townRead(db);
    if (!r5 || r5.kind !== 'bought') out.push('the named flame over, the square reads ' + JSON.stringify(r5));
    await age(db, 30);
    const r6 = await townRead(db);
    if (r6 !== null) out.push('everything over, the square reads ' + JSON.stringify(r6));
    return out;
  },

  'HM-EXTEND': async (db) => {
    const out = [];
    await square(db);
    await hero(db, C, 'Hearthkey');
    await keys(db, C, 3);
    const c1 = await open(db, C);
    const w1 = await windowRow(db);
    if (!c1 || c1.ok !== true || !w1 || !near(w1.s, 0) || !near(w1.e, 10) || !near(w1.c, 20) || w1.opens !== 1) return out.concat('one key made ' + JSON.stringify({ c1, w1 }));
    await age(db, 4);
    const key = idem();
    const c2 = await open(db, C, 1, key);
    const w2 = await windowRow(db);
    const rows = Number(await one(db, 'select count(*) from public.hearth_bursts where map_id = $1', [MAP]));
    if (!c2 || c2.ok !== true || rows !== 1 || !w2 || !near(w2.s, -4) || !near(w2.e, 10) || !near(w2.c, 16) || w2.opens !== 2) {
      out.push('a second key 4 s in made ' + JSON.stringify({ rows, w2, c2: c2 && (c2.error || c2.ok) }));
    }
    const again = await open(db, C, 1, key);
    const w3 = await windowRow(db);
    if (!again || again.ok !== true || JSON.stringify(w3) !== JSON.stringify(w2)) out.push('a replayed key moved the window: ' + JSON.stringify({ w2, w3 }));
    return out;
  },

  'HM-CAP': async (db) => {
    const out = [];
    await square(db);
    await hero(db, C, 'Hearthkey');
    await keys(db, C, 1);
    const c1 = await open(db, C);
    if (!c1 || c1.ok !== true) return out.concat('the first key was refused: ' + JSON.stringify(c1));
    /* a key every 2 s for two minutes, read every second */
    let green = 0, run = 0, longest = 0, seen = 0;
    for (let s = 1; s <= 120; s++) {
      await age(db, 1);
      if (s % 2 === 0) await pressRow(db, C);
      const w = await windowRow(db);
      const on = !!w && w.s <= 0 && w.e > 0;
      if (on) { green++; run++; seen++; longest = Math.max(longest, run); } else run = 0;
    }
    if (longest > 30) out.push(`keys every 2 s held the square green ${longest} s in a row`);
    if (green > (120 + 30) / 2) out.push(`keys every 2 s held it green ${green} of 120 s`);
    if (green < 45) out.push(`keys every 2 s held it green only ${green} of 120 s: the chest went dark`);
    /* a dry square: a key with 6 s of credit back shows nothing; 4 s later a whole 10 s, and a new window */
    await square(db);
    await pressRow(db, C);
    for (let i = 0; i < 7; i++) { await age(db, 4); await pressRow(db, C); }
    const dry = await windowRow(db);
    if (!dry || !near(dry.e - dry.s, 30) || !near(dry.c, 0)) out.push('a run of keys reads ' + JSON.stringify(dry));
    await age(db, dry ? dry.e + 6 : 6);
    await pressRow(db, C);
    const rest = await windowRow(db);
    if (!rest || rest.e > 0) out.push('a resting square went green on 6 s of credit: ' + JSON.stringify(rest));
    await age(db, 4);
    await pressRow(db, C);
    const back = await windowRow(db);
    if (!back || !near(back.s, 0) || !near(back.e, 10) || back.opens !== 1) out.push('a rested square did not open a new window: ' + JSON.stringify(back));
    return out;
  },

  'HM-PAUSE': async (db) => {
    const out = [];
    await square(db);
    for (const [u, n] of [[A, 'Hearthrank'], [B, 'Hearthburn'], [C, 'Hearthkey']]) await hero(db, u, n);
    await db.query('update public.account_wallet set gold = 1000000 where user_id = $1', [A]);
    await db.query("insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, 'inner_flame', 50000000) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp", [B]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'den_knot', 3) on conflict (user_id, slot, item_id) do update set qty = excluded.qty", [B]);
    await keys(db, C, 6);
    const secs = Number(await one(db, "select secs from public.hr_hearth_named where item_id = 'den_knot'"));
    /* (1) a powder burning 5 s when the chest opens, the window stretched 3 s later */
    if ((await buy(db, A)).ok !== true) return out.concat('the powder was refused');
    await age(db, 5);
    if ((await open(db, C)).ok !== true) return out.concat('the chest was refused');
    await age(db, 3);
    if ((await open(db, C)).ok !== true) return out.concat('the second key was refused');
    const s1 = await shown(db);
    const p1 = Object.entries(s1.out).filter(([k]) => k.startsWith('cinnabar:'));
    if (p1.length !== 1 || !near(p1[0][1], 30)) out.push('a powder burning under the chest shows ' + JSON.stringify(s1.out) + ' of its 30 s');
    if (!near(s1.out.chest || 0, 13)) out.push('the window shows ' + s1.out.chest + ' s, not 10 + the 3 the second key added');
    /* (2) a named flame burning 10 s, a powder queued behind it: the chest opens, then stretches */
    await square(db);
    if ((await buy(db, A)).ok !== true) return out.concat('the second powder was refused');
    if ((await burn(db, B)).ok !== true) return out.concat('the named fuel was refused');
    await age(db, 10);
    if ((await open(db, C)).ok !== true) return out.concat('the chest over the named flame was refused');
    await age(db, 6);
    if ((await open(db, C)).ok !== true) return out.concat('the key over the named flame was refused');
    const s2 = await shown(db);
    if (!near(s2.out.den_knot || 0, secs)) out.push(`a named flame under the chest shows ${s2.out.den_knot} of its ${secs} s: ` + JSON.stringify(s2.out));
    if (!near(Object.entries(s2.out).filter(([k]) => k.startsWith('cinnabar:')).reduce((a, [, v]) => a + v, 0), 30)) out.push('a powder queued behind it shows ' + JSON.stringify(s2.out));
    /* (3) a window open: a named flame and a powder booked DURING it start when it ends, every second shown */
    await square(db);
    if ((await open(db, C)).ok !== true) return out.concat('the chest on a quiet square was refused');
    await age(db, 2);
    const w3 = await windowRow(db);
    /* the powder first, alone (no named flame to wait behind), then the named flame (which the powder then waits for, as ever) */
    const p3 = await buy(db, A);
    if (!p3 || p3.ok !== true) return out.concat('a powder booked during the window was refused: ' + JSON.stringify(p3));
    const bought3 = (await shown(db)).rows.find((r) => r.k === 'bought');
    if (!bought3 || !w3 || bought3.s < w3.e - 0.001) out.push('a powder booked in the window starts under it: ' + JSON.stringify({ bought3, w3 }));
    const n3 = await burn(db, B);
    if (!n3 || n3.ok !== true) return out.concat('a named flame booked during the window was refused: ' + JSON.stringify(n3));
    const s3 = await shown(db);
    const named3 = s3.rows.find((r) => r.k === 'named');
    if (!named3 || !w3 || named3.s < w3.e - 0.001) out.push('a named flame booked in the window starts under it: ' + JSON.stringify({ named3, w3 }));
    if (!near(s3.out.den_knot || 0, secs) || !near(Object.entries(s3.out).filter(([k]) => k.startsWith('cinnabar:')).reduce((a, [, v]) => a + v, 0), 30)) out.push('flames booked in the window show ' + JSON.stringify(s3.out));
    return out;
  },

  'HM-ROLLBACK': async (db) => {
    const out = [];
    await square(db);
    await hero(db, C, 'Hearthkey');
    await keys(db, C, 2);
    if ((await open(db, C)).ok !== true) return out.concat('the first key was refused');
    await age(db, 3);
    const was = JSON.stringify(await windowRow(db));
    /* refused: five keys from one */
    const refused = await open(db, C, 5);
    if (!refused || refused.ok === true) out.push('five keys from one answered ' + JSON.stringify(refused));
    if (JSON.stringify(await windowRow(db)) !== was) out.push('a refused press moved the window');
    /* rolled back: the press's own transaction undone */
    await db.exec('savepoint hm_press');
    const inside = await open(db, C);
    const during = JSON.stringify(await windowRow(db));
    await db.exec('rollback to savepoint hm_press');
    if (!inside || inside.ok !== true || during === was) out.push('CONTROL: the press inside the savepoint did not reach the window: ' + JSON.stringify(inside));
    if (JSON.stringify(await windowRow(db)) !== was) out.push('a press rolled back left its window behind');
    /* another chest */
    await pressRow(db, C, 'zz_other_chest');
    if (JSON.stringify(await windowRow(db)) !== was) out.push('another chest moved the Hearth\'s window');
    return out;
  },

  'HM-WALL': async (db) => {
    const out = [];
    await square(db);
    await hero(db, A, 'Hearthrank');
    await db.query('update public.account_wallet set gold = 1000000 where user_id = $1', [A]);
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [W]);
    await db.query("insert into public.hr_gm_accounts (user_id, note) values ($1, 'hearth-moods guard')", [W]);
    /* through the wall's door, as PostgREST names the call (hr_access_check reads request.path) */
    await db.query("select set_config('request.path', '/rpc/hr_create_hero', true)");
    await hero(db, W, 'Hearthgm');
    await db.query("select set_config('request.path', '', true)");
    await keys(db, W, 1);
    if ((await buy(db, A)).ok !== true) return out.concat('the powder was refused');
    await age(db, 2);
    const before = JSON.stringify((await shown(db)).rows);
    /* the door refuses the walled account the press itself (hr_gm_walled), so the wall here is the window's own: the press's writes, made
       as if a walled press got through */
    await db.exec('savepoint hm_door');
    const door = await open(db, W).catch((e) => ({ refused: String(e.message) }));
    await db.exec('rollback to savepoint hm_door');
    if (!door || door.ok === true || !/hr_gm_walled/.test(String(door.refused || door.error))) out.push('CONTROL: the door let the walled hero press: ' + JSON.stringify(door));
    await pressRow(db, W);
    if (await windowRow(db)) out.push('the Game Master\'s key opened a window on the square');
    if (JSON.stringify((await shown(db)).rows) !== before) out.push('the Game Master\'s key moved the square\'s flames');
    /* CONTROL: the same writes for a real hero open a window */
    await pressRow(db, A);
    if (!(await windowRow(db))) out.push('CONTROL: a real hero\'s key opened no window');
    return out;
  },

  'HM-AGAIN': async (db, X, mutant) => {
    const out = [];
    const text = mutant && mutant.sql ? plantSql(MIG(FILE), mutant.sql) : MIG(FILE);
    const inventory = async () => JSON.stringify(await q(db, `select 'fn' k, p.oid::regprocedure::text n, md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, '') v from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname in ('hr_hearth_flame_of', 'hr_town_show_free_at', 'hr_hearth_pause', 'hr_hearth_chest_burst', 'hr_hearth_named_after_burst')
      union all select 'trigger', t.tgrelid::regclass::text || '.' || t.tgname, md5(pg_get_triggerdef(t.oid)) from pg_trigger t
        where not t.tgisinternal and t.tgrelid in ('public.hearth_bursts'::regclass, 'public.chest_luck'::regclass, 'public.hearth_flames'::regclass)
      union all select 'column', a.attname, format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull from pg_attribute a
        where a.attrelid = 'public.hearth_bursts'::regclass and a.attnum > 0 and not a.attisdropped
      union all select 'acl', 'hearth_bursts', coalesce((select c.relacl::text from pg_class c where c.oid = 'public.hearth_bursts'::regclass), '') || ':' || (select count(*) from pg_policies where tablename = 'hearth_bursts')
      order by 1, 2`));
    /* a window on the square, which a second apply must leave standing */
    await square(db);
    await hero(db, C, 'Hearthkey');
    await keys(db, C, 1);
    if ((await open(db, C)).ok !== true) return out.concat('CONTROL: the press was refused');
    const was = await inventory();
    const row = JSON.stringify(await windowRow(db));
    if (!/hr_hearth_chest_burst/.test(was) || !/credit/.test(was)) return out.concat('CONTROL: the inventory does not hold the file\'s objects');
    await db.exec('savepoint again');
    try { await db.exec(text); } catch (e) { out.push('the second apply refused: ' + String(e.message).split('\n')[0].slice(0, 180)); await db.exec('rollback to savepoint again'); return out; }
    if ((await inventory()) !== was) out.push('a second apply moved a body, a grant, a trigger or the table');
    if (JSON.stringify(await windowRow(db)) !== row) out.push('a second apply moved the window on the square');
    /* no client reaches a helper or the table */
    for (const role of ['anon', 'authenticated']) {
      for (const f of [PAUSE, BURST, AFTER, FREE, FLAME]) if (await one(db, 'select has_function_privilege($1, $2, \'execute\')', [role, f])) out.push(role + ' can call ' + f);
      if (await one(db, "select has_table_privilege($1, 'public.hearth_bursts', 'select,insert,update,delete')", [role])) out.push(role + ' reaches the table');
    }
    return out;
  },

  'HM-CLIENT': async (db, X) => {
    const out = [];
    const { TP, HB, AM } = X;
    /* THE TOWN READ: kind and the window's key, replaced by every answer */
    const clock = 1000;
    let answer = { ok: true, body: { ok: true, walkers: [], gone: [], cursor: 1, full: true, me: null,
      hearth: { flame: 'chest', kind: 'chest', item: null, by: 'Harrow', from_ms: 5000, until_ms: 15000, now_ms: 6000, queued: 0 } } };
    const tp = new TP.TownPresence({ server: { rpc: async () => answer }, slot: 0, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => clock });
    tp.show('town_common');
    await tp.read();
    const h1 = tp.hearth();
    if (!h1 || h1.kind !== 'chest' || h1.key !== 'chest@5000' || h1.endsAt !== clock + 9000) out.push('the chest\'s window read as ' + JSON.stringify(h1));
    answer = { ok: true, body: { ...answer.body, cursor: 2, hearth: { ...answer.body.hearth, until_ms: 19000, now_ms: 7000 } } };
    await tp.read();
    const h2 = tp.hearth();
    if (!h2 || h2.key !== h1.key || h2.endsAt !== clock + 12000) out.push('a stretched window read as ' + JSON.stringify(h2));
    answer = { ok: true, body: { ...answer.body, cursor: 3, hearth: { flame: 'cinnabar', kind: 'zz', item: null, by: null, from_ms: 5000, until_ms: 35000, now_ms: 6000, queued: 0 } } };
    await tp.read();
    if (!tp.hearth() || tp.hearth().kind !== null) out.push('a kind the server never sends was kept: ' + JSON.stringify(tp.hearth()));
    tp.destroy();
    /* THE WORLD */
    const life = [{ id: 'hearth_smoke', px: 3776, py: 1300, phase: 7 }, { id: 'chimney_smoke', px: 900, py: 700, phase: 3 }];
    const map = { T: 32, ambient: [{ id: 'hearth_fire', x: 117, y: 48, lift: 86 }], life };
    const all = new Proxy({}, { get: (t, k) => ({ id: k }), has: () => true });
    const noChestArt = new Proxy({}, { get: (t, k) => (String(k).endsWith('_chest') ? undefined : { id: k }) });
    const env = (flame) => ({ place: { x: 1, y: 1, gx: 1, gy: 1 }, units: [], walkers: [], me: null, active: null, burn: null, flame, xp: null, hero: { x: 1, y: 1 } });
    const chest = (from, until, at) => ({ flame: 'chest', kind: 'chest', key: 'chest@' + from, item: null, by: null, startedAt: at, endsAt: at + (until - from), queued: 0 });
    const v1 = HB.createHearthView(map, { sprites: all });
    const f0 = v1.frame(env(chest(5000, 15000, 20000)), 20000);
    if (!f0.ambientSwap || f0.ambientSwap.hearth_fire !== 'hearth_fire_chest') out.push('the chest\'s window left the fire ' + JSON.stringify(f0.ambientSwap));
    if (!f0.lifeTint || !f0.lifeTint.pour || f0.lifeTint.pour.hearth_smoke !== 'smoke_chest') out.push('the chest\'s smoke is ' + JSON.stringify(f0.lifeTint && f0.lifeTint.pour));
    const v0 = HB.createHearthView(map, { sprites: noChestArt });
    const fp = v0.frame(env(chest(5000, 15000, 20000)), 20000);
    if (fp.ambientSwap !== null) out.push('with no chest art the fire swapped to ' + JSON.stringify(fp.ambientSwap) + ' (the plain fire, never a missing sprite)');
    /* the puff: once a window, from the first frame that sees it, rising a whole pixel a beat */
    const puffs = [];
    for (let t = 20000; t < 32000; t += 100) {
      const lt = v1.frame(env(chest(5000, 15000, 20000)), t).lifeTint;
      if (lt && lt.puffs.length) puffs.push({ t, p: lt.puffs });
    }
    if (puffs.length !== 30 || puffs[0].t !== 20000) out.push(`the puff played on ${puffs.length} frames from ${puffs[0] && puffs[0].t} (one 3 s puff from the first frame expected)`);
    if (puffs.some(({ p }) => p.length !== 3 || p.some((x) => x.id !== 'hearth_smoke' || x.pour !== 'smoke_chest' || !Number.isInteger(x.py) || !Number.isInteger(x.px)))) out.push('a puff is not three whole-pixel chest plumes: ' + JSON.stringify(puffs[0]));
    const rise = puffs.length ? puffs[0].p[0].py - puffs[puffs.length - 1].p[0].py : 0;
    if (rise < 20 || rise > 24) out.push('the puff rose ' + rise + ' px over its 3 s');
    /* a second key stretches the window mid-puff: the same window, so the puff runs out on its first clock */
    const v2 = HB.createHearthView(map, { sprites: all });
    v2.frame(env(chest(5000, 15000, 20000)), 20000);
    v2.frame(env(chest(5000, 19000, 20000)), 21000);
    const stretched = v2.frame(env(chest(5000, 19000, 20000)), 23500).lifeTint;
    if (!stretched || stretched.puffs.length) out.push('a stretched window puffed again: ' + JSON.stringify(stretched && stretched.puffs.length));
    const next = v1.frame(env(chest(60000, 70000, 60000)), 60000).lifeTint;
    if (!next || next.puffs.length !== 3) out.push('a new window did not puff');
    /* the other flames: their own smoke, never a puff; the plain fire smokes as drawn */
    const bought = v1.frame(env({ flame: 'cinnabar', kind: 'bought', key: 'cinnabar@1', startedAt: 70000, endsAt: 100000 }), 70100).lifeTint;
    if (!bought || bought.pour.hearth_smoke !== 'smoke_cinnabar' || bought.puffs.length) out.push('a powder\'s smoke is ' + JSON.stringify(bought));
    const named = v1.frame(env({ flame: 'amber', kind: 'named', key: 'amber@1', startedAt: 70000, endsAt: 100000 }), 70100).lifeTint;
    if (!named || named.pour.hearth_smoke !== 'smoke_amber' || named.puffs.length) out.push('a named flame\'s smoke is ' + JSON.stringify(named));
    const plain = v1.frame(env(null), 70100);
    if (plain.lifeTint !== null || plain.ambientSwap !== null) out.push('the plain fire draws ' + JSON.stringify(plain.lifeTint));
    /* THE MAP'S LIFE (core/ambient.js): the pour on the flue alone, and a puff from its first frame */
    const sprite = (id) => ({ anims: { idle: { fps: 8, loop: true } }, frame: id === 'hearth_smoke' ? [60, 96] : [34, 48], anchor: id === 'hearth_smoke' ? [18, 90] : [10, 44], layer: 'air', class: 'plume' });
    const book = { sprite, frames: (id) => (id === 'hearth_smoke' ? 24 : 16), frame: (id, a, d, i) => ({ set: 'townlife', sx: i * 100, sy: id === 'hearth_smoke' ? 0 : 500, w: 60, h: 96 }) };
    const view = { ox: 0, oy: 0, w: 5000, h: 3000 };
    const tint = { pour: { hearth_smoke: 'smoke_chest' }, puffs: [{ id: 'hearth_smoke', px: 3770, py: 1290, age: 260, pour: 'smoke_chest' }] };
    const drawn = AM.lifeDraws({ life }, book, 1000, view, 32, tint).air;
    const flue = drawn.filter((d) => d.id === 'hearth_smoke'), stack = drawn.filter((d) => d.id === 'chimney_smoke');
    if (flue.length !== 2 || flue.some((d) => d.pour !== 'smoke_chest')) out.push('the flue drew ' + JSON.stringify(flue.map((d) => d.pour)));
    if (stack.length !== 1 || stack[0].pour) out.push('a home\'s chimney took the Hearth\'s pour');
    const puff = flue.find((d) => d.x === 3770 - 18);
    if (!puff || puff.sx !== 2 * 100) out.push('the puff at 260 ms drew frame ' + (puff && puff.sx / 100) + ', not 2');
    const bare = AM.lifeDraws({ life }, book, 1000, view, 32, null).air;
    if (bare.some((d) => d.pour) || bare.length !== 2) out.push('with no tint the life drew ' + JSON.stringify(bare.map((d) => [d.id, d.pour])));
    /* compose hands the tint over */
    if (!/lifeDraws\(map, book, state\.t \|\| 0, view, T, state\.lifeTint \|\| null\)/.test(X.composeSrc)) out.push('compose.js does not hand state.lifeTint to lifeDraws');
    return out;
  },

  'HM-DATA': async (db, X) => {
    const out = [];
    const { HD, GS, MOODS, PAL, POUR, AL } = X;
    const flames = [...Object.keys(HD.FLAMES), ...Object.keys(GS.SHOW_FLAMES), ...Object.keys(MOODS.CHEST_FLAMES)];
    if (new Set(flames).size !== flames.length) out.push('two flame tables share an id: ' + flames.join(','));
    const palette = new Set(Object.values(JSON.parse(readFileSync(join(ROOT, 'art/world/palette.json'), 'utf8')).ramps).flat());
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    for (const f of flames.filter((f) => f !== 'fire')) {
      const ladder = PAL.PALETTE_RGB.smoke[f];
      if (!ladder || !POUR.POURS['smoke_' + f]) { out.push('the flame ' + f + ' has no smoke'); continue; }
      if (ladder.length !== 3) out.push('the ' + f + ' smoke is not three colours');
      for (const c of ladder) if (!palette.has(hex(c))) out.push('the ' + f + ' smoke ' + hex(c) + ' is not on hr-world-56-v2');
    }
    for (const f of Object.keys(PAL.PALETTE_RGB.smoke)) if (!flames.includes(f) || f === 'fire') out.push('a smoke ladder names no flame: ' + f);
    if (MOODS.CHEST_FLAMES.chest.fire !== 'hearth_fire_chest') out.push('the chest\'s fire is ' + MOODS.CHEST_FLAMES.chest.fire + ', not the art lane\'s hearth_fire_chest');
    if (!(AL.EMITTERS.great_hearth || []).some((e) => e.clip === MOODS.SMOKE_CLIP)) out.push('the Great Hearth gives off no ' + MOODS.SMOKE_CLIP);
    /* the shipped plume, poured: exactly its ladder's three colours (the chest's black and dark greens), the air untouched */
    const { decodePNG } = await import(pathToFileURL(join(ROOT, 'tools/world-art/png.mjs')).href);
    const atlas = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-townlife.json'), 'utf8')).sprites[MOODS.SMOKE_CLIP];
    const img = decodePNG(readFileSync(join(ROOT, 'assets/world/atlas-townlife.png')));
    const [w, h] = atlas.frame, cells = atlas.anims.idle.dirs.s;
    const px = new Uint8ClampedArray(w * h * cells.length * 4);
    cells.forEach(([sx, sy], n) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(img.data.subarray(((sy + y) * img.width + sx + x) * 4, ((sy + y) * img.width + sx + x) * 4 + 4), ((n * h + y) * w + x) * 4); });
    for (const f of ['chest', 'cinnabar', 'honey']) {
      const p = POUR.pourPixels(Uint8ClampedArray.from(px), 'smoke_' + f);
      const got = new Set();
      for (let i = 0; i < p.length; i += 4) if (p[i + 3] >= 128) got.add('#' + [p[i], p[i + 1], p[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
      const want = new Set(PAL.PALETTE_RGB.smoke[f].map(hex));
      if (got.size !== want.size || [...got].some((c) => !want.has(c))) out.push(`the plume poured ${f} comes out ${[...got].join(',')}, not ${[...want].join(',')}`);
    }
    /* the puff: one turn of the plume, a whole pixel each life beat */
    const turn = (cells.length * 1000) / atlas.anims.idle.fps;
    if (MOODS.SMOKE_BURST.ms !== turn) out.push(`the puff lasts ${MOODS.SMOKE_BURST.ms} ms, the plume turns in ${turn}`);
    if (MOODS.SMOKE_BURST.ms / MOODS.SMOKE_BURST.risePx !== 1000 / AL.LIFE_BEAT_FPS) out.push('the puff does not rise a whole pixel a life beat');
    /* none of it reaches the edge */
    for (const f of ['src/data/world/hearth-moods.js', 'src/world/pour.js', 'src/data/world/palette.js', 'src/world/hearth-burn.js']) {
      if (X.edgeFiles.some((n) => n.endsWith(f.replace(/^src\//, '')))) out.push(f + ' is in the edge bundle');
    }
    return out;
  },
};

function plantSql(text, [, find, repl]) {
  if (text.split(find).length !== 2) throw Object.assign(new Error('sql mutant anchor not found once: ' + find.slice(0, 80)), { harness: true });
  return text.replace(find, () => repl);
}

let EDGE_FILES = [];
async function loadReaders(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  return {
    TP: await import(u('src/session/town-presence.js')),
    HB: await import(u('src/world/hearth-burn.js')),
    AM: await import(u('src/world/core/ambient.js')),
    HD: await import(u('src/data/hearth.js')),
    GS: await import(u('src/data/gold-sinks.js')),
    MOODS: await import(u('src/data/world/hearth-moods.js')),
    PAL: await import(u('src/data/world/palette.js')),
    POUR: await import(u('src/world/pour.js')),
    AL: await import(u('src/data/world/ambient-life.js')),
    composeSrc: readFileSync(join(root, 'src/world/core/compose.js'), 'utf8'),
    edgeFiles: EDGE_FILES,
  };
}

/* One arm in its own transaction, the planted defect (if any) inside it. */
async function runArm(db, X, id, mutant) {
  await db.query('begin');
  try {
    if (mutant && mutant.db) {
      const [fn, find, repl] = mutant.db;
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
      if (def.split(find).length !== 2) throw Object.assign(new Error(`mutant anchor not found once in ${fn}: ${find.slice(0, 80)}`), { harness: true });
      await db.exec(def.replace(find, () => repl));
    }
    if (mutant && mutant.ddl) await db.exec(mutant.ddl);
    return await ARMS[id](db, X, mutant);
  } finally { await db.query('rollback'); await claims(db, null).catch(() => {}); }
}

async function main() {
  if (process.argv.includes('--list')) { for (const [id, m] of Object.entries(MUTANTS)) console.log(`${id}  [${m.arm}]  ${m.why}`); return; }
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  const { pack } = await import('../tools/pack-edge.mjs');
  EDGE_FILES = (await pack('hr-accrue')).files.map((f) => f.name);
  const X = await loadReaders(ROOT);
  const pick = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
  if (!(process.argv.includes('--selftest') || pick)) {
    let bad = 0;
    for (const id of Object.keys(ARMS)) {
      let p;
      try { p = await runArm(db, X, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 600)]; }
      if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
    }
    console.log(bad ? `hearth-moods: ${bad} arm(s) red` : `hearth-moods: all ${Object.keys(ARMS).length} arms green`);
    process.exit(bad ? 1 : 0);
  }
  if (pick && !MUTANTS[pick]) { console.error('unknown mutant ' + pick); process.exit(2); }
  let missed = 0;
  const ids = pick ? [pick] : Object.keys(MUTANTS);
  for (const id of ids) {
    const m = MUTANTS[id];
    let p;
    try {
      if (m.js) {
        const dir = mkdtempSync(join(tmpdir(), 'hr-hm-'));
        try {
          cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
          const f = join(dir, m.js[0]);
          let src = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
          for (const [find, repl] of m.js[1]) {
            if (src.split(find).length !== 2) throw Object.assign(new Error('js mutant anchor not found once: ' + find.slice(0, 60)), { harness: true });
            src = src.replace(find, () => repl);
          }
          writeFileSync(f, src);
          p = await runArm(db, await loadReaders(dir), m.arm, null);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      } else p = await runArm(db, X, m.arm, m);
    } catch (e) {
      if (e && e.harness) { console.error(`✗ ${id}: harness: ${e.message}`); missed++; continue; }
      p = ['threw: ' + String(e && e.message || e).slice(0, 200)];
    }
    if (p.length) console.log(`✓ ${m.arm} goes red on ${id}: ${m.why}`);
    else { console.error(`✗ ${m.arm} stayed GREEN on ${id}: ${m.why}`); missed++; }
  }
  console.log(missed ? `hearth-moods --selftest: ${missed} of ${ids.length} mutant(s) survived` : `hearth-moods --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
