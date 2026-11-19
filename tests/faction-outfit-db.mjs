#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/faction-outfit-db.mjs — A FACTION LOOK, CLAIMED, WORN, RELOADED, SWAPPED AND STILL WORN, ON THE REPLAYED CHAIN
//   (supabase/migrations/2027-05-19-faction-outfit-path.sql and its outfits catalogue; src/data/outfits.js STAGED_OUTFITS, earnedOnly;
//   Tyler 2026-11-14: outfit unlocks per faction, both earnable by swapping sides, earned sets kept on a swap).
//
//   node tests/faction-outfit-db.mjs            the guard
//   node tests/faction-outfit-db.mjs --mutate   every planted defect must turn its arm red (--only a,b: those alone)
//
// mutant-anchors: supabase/migrations/2027-05-19-faction-outfit-path.sql supabase/migrations/2027-05-19-faction-outfit-path-outfits-catalogue.generated.sql supabase/migrations/2027-04-22-faction-standing.sql src/data/outfits.js
//
//   FO-PLAY   as the client calls it, signed in: a hero past Krell with the standing claims the Flamebearer, wears it (hr_outfit_set),
//             reloads (hr_load, the browser's read: worn and owned), and its party mate's party view and the town look show it; claims
//             the Hearth Shield and wears that look; swaps to the other side (the week and the ten hours are fixtures, the verbs real);
//             reloads: both looks still owned, the shield look still worn and still shown; wears the Flamebearer again; claims the
//             Emberkeeper with the new side's standing and owns both sides' looks
//   FO-ADDON  an add-on look needs its outfit's piece too: the add-on alone owns nothing; a stranger with no claim owns no look and is
//             refused not_owned, while a claimer beside it owns its own; the `factions` switch off shuts the claim door and takes no
//             look away (still owned, still worn: a switch closes doors, never a possession)
//   FO-DOORS  the other three doors answer exactly as the reader before this file (2027-04-30-sweeps-coat.sql's body, put back in a
//             savepoint): a free row is everyone's, a premium row the premium hero's, a bundle row its user's; a faction look is owned
//             exactly when every piece it names is claimed
//   FO-GRANT  the reader is no client's, no client verb is added; hr_outfits_pieces_shape refuses a premium look, a bundle look, an
//             empty, a null, a malformed and a fifth piece
//   FO-AGAIN  both files applied a second time at the chain end move nothing (bodies, rows, the column, the CHECK); the catalogue
//             refuses to land while the reader is the one before the hand file (every hero would own every look)
//   FO-DATA   src/data/outfits.js: valid; a staged look has no sheet and says so the day one lands; an add-on look starts with its
//             outfit's piece; a piece twice is refused; no look shows two add-ons (the designer 2026-11-18: both held, one shown); earnedOnly holds a pieces row back as it holds a bundle row; the looks and
//             src/data/factions.js agree (tools/gen-outfits.mjs lookPieceProblems: every piece dresses a look, a look is one side's)
// TRUE CONCURRENCY is unverified here (PGlite is one backend): a claim is ordered by hr_hunt_lock, a wear reads its own snapshot.
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bootReplay } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HAND = '2027-05-19-faction-outfit-path.sql';
const CATALOGUE = '2027-05-19-faction-outfit-path-outfits-catalogue.generated.sql';
const PRE_FILE = '2027-04-30-sweeps-coat.sql';
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const A = '000000c0-0000-4000-a000-0000fa0fdb01';   // the claimer
const B = '000000c0-0000-4000-a000-0000fa0fdb02';   // its party mate, and the stranger
const C = '000000c0-0000-4000-a000-0000fa0fdb03';   // a premium hero, for the doors
const H = 3600000;
const idem = () => crypto.randomUUID();
const harness = (m) => Object.assign(new Error(m), { harness: true });
const q = async (db, sql, p) => (await db.query(sql, p)).rows;
const one = async (db, sql, p) => { const r = await q(db, sql, p); return r[0] ? Object.values(r[0])[0] : undefined; };

/* As PostgREST calls it: the JWT subject, `set role authenticated`, a fresh rate counter. Each arm runs in one transaction; a call that
   raises answers { raised } (rolled back to its own savepoint), so a verb that errors instead of refusing by code is the arm's finding. */
async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.query('savepoint fo_call');
  await db.exec('set role authenticated');
  try { return await one(db, sql, params); }
  catch (e) { await db.query('rollback to savepoint fo_call'); return { ok: false, raised: String(e.message).split('\n')[0] }; }
  finally { await db.exec('reset role'); }
}
const claim = (db, uid, piece) => as(db, uid, 'select public.hr_faction_outfit_claim(0, $1, $2::uuid)', [piece, idem()]);
const wear = (db, uid, look) => as(db, uid, "select public.hr_outfit_set(0, $1, '{}'::jsonb, $2::uuid)", [look, idem()]);
const reload = (db, uid) => as(db, uid, 'select public.hr_load(0)');
const owned = async (db, uid) => (await one(db, 'select public.hr_outfit_owned($1::uuid, 0)', [uid])) || [];
const townLook = async (db, uid) => { const l = await one(db, 'select public.hr_town_look($1::uuid, 0)', [uid]); return l && l.outfit ? l.outfit.id : null; };

/* A named hero on slot 0, made as the client makes one (hr_load answers only a named one). */
async function hero(db, uid, name) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'faction-outfit-db') on conflict (user_id) do nothing`, [uid]);
  const c = await as(db, uid, 'select public.hr_create_character(0)');
  if (!c || c.ok !== true) throw harness('a probe hero was refused: ' + JSON.stringify(c));
  const n = await as(db, uid, 'select public.hr_character_name_set(0, $1, $2::uuid)', [name, idem()]);
  if (!n || n.ok !== true) throw harness('a probe name was refused: ' + JSON.stringify(n));
}
/* Past Krell (the server's own kill count, a fixture: the join's subject is faction-standing-db), joined to `side` through the verb. */
async function joined(db, uid, side) {
  await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
    select $1, 0, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now() from public.hr_faction_rule r where r.id
    on conflict (user_id, slot, kind, key, period_key) do update set value = 1`, [uid]);
  const v = await as(db, uid, 'select public.hr_faction_join(0, $1, $2::uuid)', [side, idem()]);
  if (!v || v.ok !== true) throw harness('a probe join was refused: ' + JSON.stringify(v));
}
/* Standing on a side, a fixture (the settle's credit is faction-standing-db's subject; the table only rises). */
const standing = (db, uid, side, ms) => db.query(`insert into public.hr_faction_standing as s (user_id, slot, faction, ms) values ($1, 0, $2, $3)
  on conflict (user_id, slot, faction) do update set ms = greatest(s.ms, excluded.ms)`, [uid, side, ms]);

async function ctx(db) {
  const rule = (await q(db, 'select join_monster, swap_ms, cooldown_ms from public.hr_faction_rule where id'))[0];
  const sides = (await q(db, 'select faction_id from public.hr_factions order by ord')).map((r) => r.faction_id);
  const pieces = Object.fromEntries((await q(db, 'select piece_id, faction, need_ms from public.hr_faction_outfits')).map((r) => [r.piece_id, { side: r.faction, need: Number(r.need_ms) }]));
  const looks = Object.fromEntries((await q(db, 'select outfit_id, pieces from public.hr_outfits where pieces is not null')).map((r) => [r.outfit_id, r.pieces]));
  const need = (ids) => Math.max(...ids.map((p) => pieces[p].need));
  if (!rule || sides.length !== 2 || !looks.flamebearer || !looks.flamebearer_shield || !looks.emberkeeper) {
    throw harness('the faction catalogue or the faction looks are not on the chain: ' + JSON.stringify({ rule, sides, looks: Object.keys(looks) }));
  }
  return { rule: { swap_ms: Number(rule.swap_ms), cooldown_ms: Number(rule.cooldown_ms) }, sides, pieces, looks, need };
}

/* The party: B named, A invites B by name (the first invite makes the party), lists it, B joins. */
async function party(db) {
  const inv = await as(db, A, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', ['Outfit Second', idem()]);
  if (!inv || inv.ok !== true) throw harness('the invite was refused: ' + JSON.stringify(inv));
  const pid = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [A]);
  await db.query("update public.hunt_parties set hunt_id = 'mill_cellar' where id = $1", [pid]);
  const listed = await as(db, A, 'select public.hr_hunt_party_list(0, true, $1::uuid)', [idem()]);
  if (!listed || listed.ok !== true) throw harness('the listing was refused: ' + JSON.stringify(listed));
  const j = await as(db, B, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [pid, idem()]);
  if (!j || j.ok !== true) throw harness('the join was refused: ' + JSON.stringify(j));
}
/* What B's party view shows of A: the look the server names for A's seat. */
async function seenByMate(db) {
  const v = await one(db, 'select public.hr_hunt_party_view($1::uuid, 0)', [B]);
  const m = v && Array.isArray(v.members) ? v.members.find((x) => x.name === 'Outfit First') : null;
  return m ? (m.outfit ? m.outfit.id : null) : 'no seat';
}

const ARMS = {
  'FO-PLAY': async (db, X) => {
    const bad = [];
    const [flame, ember] = X.sides;
    await hero(db, A, 'Outfit First');
    await hero(db, B, 'Outfit Second');
    await joined(db, A, flame);
    await party(db);
    await standing(db, A, flame, X.need(X.looks.flamebearer_shield));
    /* CLAIM -> OWNED -> SET */
    let v = await claim(db, A, 'flamebearer');
    if (!v || v.ok !== true) bad.push('FO-PLAY the claim answered ' + JSON.stringify(v));
    let own = await owned(db, A);
    if (!own.includes('flamebearer') || own.includes('flamebearer_shield')) bad.push('FO-PLAY after the Flamebearer\'s claim the hero owns ' + JSON.stringify(own));
    v = await wear(db, A, 'flamebearer');
    if (!v || v.ok !== true || !v.outfit || v.outfit.worn !== 'flamebearer') bad.push('FO-PLAY the wear answered ' + JSON.stringify(v));
    /* RELOAD -> SHOWN: the browser's own read, the party mate's view, the town */
    let env = await reload(db, A);
    if (!env || !env.outfit || env.outfit.worn !== 'flamebearer' || !env.outfit.owned.includes('flamebearer')) bad.push('FO-PLAY a reload reads ' + JSON.stringify(env && env.outfit));
    if ((await seenByMate(db)) !== 'flamebearer') bad.push('FO-PLAY the party mate sees ' + JSON.stringify(await seenByMate(db)));
    if ((await townLook(db, A)) !== 'flamebearer') bad.push('FO-PLAY the town look is ' + JSON.stringify(await townLook(db, A)));
    /* THE ADD-ON */
    v = await claim(db, A, 'flamebearer_shield');
    v = v && v.ok === true ? await wear(db, A, 'flamebearer_shield') : v;
    if (!v || v.ok !== true || v.outfit.worn !== 'flamebearer_shield') bad.push('FO-PLAY the Hearth Shield\'s look answered ' + JSON.stringify(v));
    /* THE SWAP: the week passed and the ten hours credited are fixtures; the start and the finish are the verbs */
    await db.query('update public.hr_faction_members set changed_at = now() - make_interval(secs => $2::bigint / 1000.0 + 1) where user_id = $1 and slot = 0', [A, X.rule.cooldown_ms]);
    v = await as(db, A, 'select public.hr_faction_swap_start(0, $1, $2::uuid)', [ember, idem()]);
    if (!v || v.ok !== true) bad.push('FO-PLAY the swap start answered ' + JSON.stringify(v));
    await db.query('update public.hr_faction_members set swap_ms = $2 where user_id = $1 and slot = 0', [A, X.rule.swap_ms]);
    v = await as(db, A, 'select public.hr_faction_swap_finish(0, $1::uuid)', [idem()]);
    if (!v || v.ok !== true || !v.faction || v.faction.faction !== ember) bad.push('FO-PLAY the swap finish answered ' + JSON.stringify(v && (v.faction ? v.faction.faction : v)));
    /* STILL WORN: reload, the mate, the town; both looks still owned; the outfit's own look still wearable */
    env = await reload(db, A);
    own = env && env.outfit ? env.outfit.owned : [];
    if (!env || !env.outfit || env.outfit.worn !== 'flamebearer_shield' || !own.includes('flamebearer') || !own.includes('flamebearer_shield')) {
      bad.push('FO-PLAY after the swap a reload reads ' + JSON.stringify(env && env.outfit));
    }
    if (!env || !env.factions || env.factions.faction !== ember || !env.factions.pieces.filter((p) => p.held).map((p) => p.id).includes('flamebearer_shield')) {
      bad.push('FO-PLAY after the swap the faction section reads ' + JSON.stringify(env && env.factions && { faction: env.factions.faction, pieces: env.factions.pieces }));
    }
    if ((await seenByMate(db)) !== 'flamebearer_shield' || (await townLook(db, A)) !== 'flamebearer_shield') bad.push('FO-PLAY after the swap the mate sees ' + JSON.stringify(await seenByMate(db)) + ', the town ' + JSON.stringify(await townLook(db, A)));
    v = await wear(db, A, 'flamebearer');
    if (!v || v.ok !== true || v.outfit.worn !== 'flamebearer') bad.push('FO-PLAY after the swap the Flamebearer could not be worn: ' + JSON.stringify(v));
    /* THE OTHER SIDE'S OUTFIT, earned on it: a hero who swapped owns both sides' looks */
    await standing(db, A, ember, X.need(X.looks.emberkeeper));
    v = await claim(db, A, 'emberkeeper');
    own = await owned(db, A);
    if (!v || v.ok !== true || !own.includes('emberkeeper') || !own.includes('flamebearer') || !own.includes('flamebearer_shield')) bad.push('FO-PLAY with both sides earned the hero owns ' + JSON.stringify(own));
    return bad;
  },

  'FO-ADDON': async (db, X) => {
    const bad = [];
    const [flame] = X.sides;
    await hero(db, A, 'Outfit First');
    await hero(db, B, 'Outfit Second');
    await joined(db, A, flame);
    await joined(db, B, flame);
    for (const u of [A, B]) await standing(db, u, flame, X.need(X.looks.flamebearer_shield));
    /* A claims the outfit and wears it; B, the stranger beside it, claimed nothing */
    await claim(db, A, 'flamebearer');
    await wear(db, A, 'flamebearer');
    let own = await owned(db, B);
    if (Object.keys(X.looks).some((l) => own.includes(l))) bad.push('FO-ADDON a hero with no claim owns ' + JSON.stringify(own.filter((l) => X.looks[l])));
    for (const look of ['flamebearer', 'flamebearer_shield']) {
      const v = await wear(db, B, look);
      if (!v || v.error !== 'not_owned') bad.push(`FO-ADDON a stranger wearing ${look} answered ` + JSON.stringify(v));
    }
    /* the add-on alone: its look needs the outfit's piece too */
    const v = await claim(db, B, 'flamebearer_shield');
    if (!v || v.ok !== true) bad.push('FO-ADDON the add-on\'s claim answered ' + JSON.stringify(v));
    own = await owned(db, B);
    if (own.includes('flamebearer_shield') || own.includes('flamebearer')) bad.push('FO-ADDON the add-on\'s piece alone owns ' + JSON.stringify(own.filter((l) => X.looks[l])));
    const w = await wear(db, B, 'flamebearer_shield');
    if (!w || w.error !== 'not_owned') bad.push('FO-ADDON the add-on alone was worn: ' + JSON.stringify(w));
    /* THE SWITCH OFF: the claim door shuts, no look is taken away */
    await db.query("update public.hr_feature_switches set scope = 'off' where switch_id = 'factions'");
    const shut = await claim(db, A, 'flamebearer_shield');
    if (!shut || shut.error !== 'feature_off') bad.push('FO-ADDON with the switch off a claim answered ' + JSON.stringify(shut));
    own = await owned(db, A);
    const env = await reload(db, A);
    if (!own.includes('flamebearer') || !env || !env.outfit || env.outfit.worn !== 'flamebearer' || (await townLook(db, A)) !== 'flamebearer') {
      bad.push('FO-ADDON with the switch off the claimer owns ' + JSON.stringify(own) + ' and wears ' + JSON.stringify(env && env.outfit && env.outfit.worn));
    }
    return bad;
  },

  'FO-DOORS': async (db, X) => {
    const bad = [];
    const [flame] = X.sides;
    await hero(db, A, 'Outfit First');
    await hero(db, B, 'Outfit Second');
    await hero(db, C, 'Outfit Third');
    /* the premium door observable: the beta switch off, C premium for a day, A and B free */
    await db.query("update public.hr_flags set enabled = false where key = 'beta_premium'");
    await db.query("update public.player_state set premium_until = now() + interval '1 day' where user_id = $1 and slot = 0", [C]);
    /* the bundle door: A used the Key Warden's bundle (the cosmetic row hr_outfit_bundle_use writes, a fixture) */
    await db.query("insert into public.player_cosmetics (user_id, slot, kind, code, name) values ($1, 0, 'outfit', 'sweeps_coat', 'Key Warden')", [A]);
    /* the faction door: A holds the outfit and the light; C the shield alone */
    await joined(db, A, flame);
    await joined(db, C, flame);
    await standing(db, A, flame, X.need([...X.looks.flamebearer_shield, ...X.looks.flamebearer_light]));
    await standing(db, C, flame, X.need([...X.looks.flamebearer_shield, ...X.looks.flamebearer_light]));
    for (const p of ['flamebearer', 'flamebearer_light']) await claim(db, A, p);
    await claim(db, C, 'flamebearer_shield');
    const held = { [A]: ['flamebearer', 'flamebearer_light'], [B]: [], [C]: ['flamebearer_shield'] };
    /* THE ORACLE: the reader before this file (put back under another name in a savepoint), on every row that is no faction look; and
       a faction look exactly when every piece it names is held */
    const pre = MIG(PRE_FILE).match(/create or replace function public\.hr_outfit_owned\(p_user uuid, p_slot integer\)[\s\S]*?\n\$plc\$;/);
    if (!pre) throw harness(`no hr_outfit_owned body in ${PRE_FILE}`);
    await db.query('savepoint fo_pre');
    await db.exec(pre[0].replace('public.hr_outfit_owned(', 'public.hrfo_owned_pre('));
    const rows = await q(db, 'select outfit_id, pieces from public.hr_outfits order by sort');
    for (const u of [A, B, C]) {
      const before = (await one(db, 'select public.hrfo_owned_pre($1::uuid, 0)', [u])) || [];
      const want = rows.filter((r) => (r.pieces ? r.pieces.every((p) => held[u].includes(p)) : before.includes(r.outfit_id))).map((r) => r.outfit_id);
      const got = await owned(db, u);
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`FO-DOORS ${u.slice(-1)} owns ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
    await db.query('rollback to savepoint fo_pre');
    /* the doors observable at all: the oracle tells the heroes apart on every door */
    const own = { A: await owned(db, A), B: await owned(db, B), C: await owned(db, C) };
    if (!own.A.includes('sweeps_coat') || own.B.includes('sweeps_coat') || !own.C.includes('brute') || own.A.includes('brute')
      || !own.A.includes('flamebearer_light') || own.C.includes('flamebearer_shield') || !own.B.includes('knight')) {
      bad.push('FO-DOORS the doors are not told apart: ' + JSON.stringify(own));
    }
    return bad;
  },

  'FO-GRANT': async (db) => {
    const bad = [];
    for (const role of ['anon', 'authenticated', 'service_role']) {
      if (await one(db, "select has_function_privilege($1, 'public.hr_outfit_owned(uuid,integer)', 'execute')", [role])) bad.push(`FO-GRANT ${role} executes hr_outfit_owned`);
    }
    for (const role of ['anon', 'authenticated']) {
      if (await one(db, "select has_table_privilege($1, 'public.hr_outfits', 'select,insert,update,delete') or has_table_privilege($1, 'public.hr_faction_claims', 'select,insert,update,delete')", [role])) {
        bad.push(`FO-GRANT ${role} reaches the outfit catalogue or the claims`);
      }
    }
    /* no new client verb: the outfit and faction verbs on the baseline are exactly these six */
    const verbs = (await q(db, `select proname from public.hr_client_rpc_baseline where grantee = 'authenticated' and (proname like 'hr\\_outfit%' or proname like 'hr\\_faction%') order by proname`)).map((r) => r.proname);
    if (verbs.join() !== 'hr_faction_join,hr_faction_outfit_claim,hr_faction_swap_finish,hr_faction_swap_start,hr_outfit_bundle_use,hr_outfit_set') bad.push('FO-GRANT the client outfit and faction verbs are ' + JSON.stringify(verbs));
    /* THE CHECK: each malformed look refused */
    const tries = [['a premium look', "true, '{}', 990, null, '{flamebearer}'"], ['a bundle look', "false, '{}', 990, 'sweeps_coat_bundle', '{flamebearer}'"],
      ['no piece', "false, '{}', 990, null, '{}'"], ['a null piece', "false, '{}', 990, null, array['flamebearer', null]::text[]"],
      ['a malformed piece', "false, '{}', 990, null, '{Flame Bearer}'"], ['five pieces', "false, '{}', 990, null, '{a,b,c,d,e}'"]];
    for (const [what, vals] of tries) {
      await db.query('savepoint fo_chk');
      try {
        await db.query(`insert into public.hr_outfits (outfit_id, premium, regions, sort, bundle, pieces) values ('probe_shape', ${vals})`);
        bad.push(`FO-GRANT hr_outfits stored ${what}`);
      } catch (e) {
        if (!/hr_outfits_pieces_shape|hr_outfits_bundle_shape/.test(String(e.message))) bad.push(`FO-GRANT ${what} raised another error: ${String(e.message).split('\n')[0]}`);
      }
      await db.query('rollback to savepoint fo_chk');
    }
    try { await db.query('select public.hr_assert_grant_hygiene(true)'); } catch (e) { bad.push('FO-GRANT grant hygiene: ' + String(e.message).split('\n')[0]); }
    return bad;
  },

  'FO-AGAIN': async (db, X, mutant) => {
    const bad = [];
    const text = (f) => (mutant && mutant.sql && mutant.sql[0] === f ? MIG(f).replace(mutant.sql[1], mutant.sql[2]) : MIG(f));
    const image = () => one(db, `select jsonb_build_object(
        'defs', (select jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, ''))
                   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('hr_outfit_owned', 'hr_outfit_set', 'hr_outfit_view', 'hr_town_look')),
        'rows', (select jsonb_agg(to_jsonb(o) order by o.outfit_id) from public.hr_outfits o),
        'dyes', (select jsonb_agg(to_jsonb(d) order by d.idx) from public.hr_outfit_dyes d),
        'cols', (select jsonb_agg(c.column_name || ':' || c.data_type order by c.column_name) from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'hr_outfits'),
        'cons', (select jsonb_agg(c.conname || ':' || pg_get_constraintdef(c.oid) order by c.conname) from pg_constraint c where c.conrelid = 'public.hr_outfits'::regclass),
        'comment', col_description('public.hr_outfits'::regclass, (select attnum from pg_attribute where attrelid = 'public.hr_outfits'::regclass and attname = 'pieces')))`);
    const before = await image();
    await db.query('savepoint fo_again');
    for (const f of [HAND, CATALOGUE]) {
      try { await db.exec(text(f)); } catch (e) { bad.push(`FO-AGAIN a second apply of ${f} RAISED: ${String(e.message).split('\n')[0]}`); break; }
    }
    if (!bad.length) {
      const after = await image();
      const moved = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
      if (moved.length) bad.push('FO-AGAIN a second apply moved ' + moved.join(', '));
    }
    await db.query('rollback to savepoint fo_again');
    /* THE ORDER: with the reader as it was before the hand file, the catalogue refuses (it would make every hero own every look) */
    const pre = MIG(PRE_FILE).match(/create or replace function public\.hr_outfit_owned\(p_user uuid, p_slot integer\)[\s\S]*?\n\$plc\$;/);
    if (!pre) throw harness(`no hr_outfit_owned body in ${PRE_FILE}`);
    await db.query('savepoint fo_order');
    await db.exec(pre[0]);
    let landed = true;
    try { await db.exec(text(CATALOGUE)); } catch (e) {
      landed = false;
      if (!/PRECONDITION: apply 2027-05-19-faction-outfit-path\.sql first/.test(String(e.message))) bad.push('FO-AGAIN before the reader the catalogue raised another error: ' + String(e.message).split('\n')[0]);
    }
    if (landed) bad.push('FO-AGAIN the catalogue landed while the reader owned every faction look for everyone');
    await db.query('rollback to savepoint fo_order');
    return bad;
  },

  'FO-DATA': async (db, X, mutant) => {
    const bad = [];
    const dir = mkdtempSync(join(tmpdir(), 'fo-data-'));
    let n = 0;
    try {
      /* the two data modules, copied (the mutant's edits and each plant applied to the copy), imported fresh */
      const load = async (edits = {}) => {
        const sub = join(dir, String(n++));
        const src = (f) => {
          let s = readFileSync(join(ROOT, 'src', 'data', f), 'utf8');
          for (const [find, repl] of [...((mutant && mutant.js && mutant.js[0] === f) ? [mutant.js.slice(1)] : []), ...(edits[f] || [])]) {
            if (s.split(find).length !== 2) throw harness(`FO-DATA the edit is not in ${f} exactly once: ${find.slice(0, 80)}`);
            s = s.replace(find, () => repl);
          }
          return s;
        };
        mkdirSync(sub);
        writeFileSync(join(sub, 'outfits.js'), src('outfits.js'));
        writeFileSync(join(sub, 'hunt-outfits.js'), src('hunt-outfits.js'));
        return import(pathToFileURL(join(sub, 'outfits.js')).href);
      };
      const O = await load();
      if (O.validate().length) bad.push('FO-DATA outfits.js reads invalid: ' + O.validate().join('; '));
      const { OUTFITS } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'hunt-outfits.js')).href);
      for (const id of Object.keys(O.STAGED_OUTFITS)) if (OUTFITS[id] || O.OUTFIT_ROWS[id]) bad.push(`FO-DATA ${id} is staged and has a sheet or a listed row`);
      if (!O.earnedOnly({ bundle: null, pieces: ['flamebearer'] }) || !O.earnedOnly(O.OUTFIT_ROWS.sweeps_coat) || O.earnedOnly(O.OUTFIT_ROWS.knight)) {
        bad.push('FO-DATA earnedOnly does not hold back a pieces row and a bundle row, or holds back a free one');
      }
      /* THE PLANTS: each must be refused by validate */
      const plants = [
        ['a staged look whose sheet landed', { 'hunt-outfits.js': [["  sweeps_coat: 'outfit_sweeps_coat',\n", "  sweeps_coat: 'outfit_sweeps_coat',\n  flamebearer: 'outfit_flamebearer',\n"]] }, /flamebearer: its sheet has landed/],
        ['an add-on look not on its outfit', { 'outfits.js': [["  flamebearer_shield: Object.freeze(['flamebearer', 'flamebearer_shield']),", "  flamebearer_shield: Object.freeze(['flamebearer_shield', 'flamebearer']),"]] }, /flamebearer_shield: its first piece flamebearer_shield owns no outfit/],
        ['a piece twice', { 'outfits.js': [["  emberkeeper_coal: Object.freeze(['emberkeeper', 'emberkeeper_coal']),", "  emberkeeper_coal: Object.freeze(['emberkeeper', 'emberkeeper']),"]] }, /emberkeeper_coal: it names a piece twice/],
        /* the designer 2026-11-18: a hero holding both add-ons shows one, so no look shows two */
        ['a look of both add-ons', { 'outfits.js': [["  emberkeeper_coal: Object.freeze(['emberkeeper', 'emberkeeper_coal']),", "  emberkeeper_coal: Object.freeze(['emberkeeper', 'emberkeeper_coal']),\n  emberkeeper_both: Object.freeze(['emberkeeper', 'emberkeeper_lantern', 'emberkeeper_coal']),"]] }, /emberkeeper_both: it shows 2 add-ons, and a look shows one/],
      ];
      for (const [what, edits, want] of plants) {
        const P = await load(edits);
        if (!P.validate().some((p) => want.test(p))) bad.push(`FO-DATA validate passes ${what}: ${JSON.stringify(P.validate())}`);
      }
      /* the looks against the faction data, as the generator reads them */
      const G = await import(pathToFileURL(join(ROOT, 'tools', 'gen-outfits.mjs')).href);
      const F = await import(pathToFileURL(join(ROOT, 'src', 'data', 'factions.js')).href);
      const lp = G.lookPieceProblems(G.lookRows(O), F.FACTION_OUTFITS);
      if (lp.length) bad.push('FO-DATA the looks and factions.js disagree: ' + lp.join('; '));
      /* and the server's rows are those looks */
      const served = Object.fromEntries((await q(db, 'select outfit_id, pieces from public.hr_outfits where pieces is not null')).map((r) => [r.outfit_id, r.pieces]));
      const data = Object.fromEntries(G.lookRows(O).filter(([, r]) => r.pieces).map(([id, r]) => [id, [...r.pieces]]));
      if (JSON.stringify(Object.keys(served).sort().map((k) => [k, served[k]])) !== JSON.stringify(Object.keys(data).sort().map((k) => [k, data[k]]))) {
        bad.push('FO-DATA the server serves ' + JSON.stringify(served) + ', the data has ' + JSON.stringify(data));
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
    return bad;
  },
};

/* ── THE PLANTED DEFECTS: a live body edited (fn, find, replace), a statement run (ddl), a file's text edited for its re-apply (sql),
   or a data module's copy edited (js). ── */
const OWNED = 'public.hr_outfit_owned(uuid,integer)';
const FINISH = 'public.hr_faction_swap_finish(integer,uuid)';
export const MUTANTS = {
  claims_ignored: { arm: 'FO-ADDON', why: 'every hero owns every faction look', db: [OWNED, '                      then o.pieces <@ v_held\n', '                      then true\n'] },
  any_piece: { arm: 'FO-ADDON', why: 'one piece of a look owns it', db: [OWNED, '                      then o.pieces <@ v_held\n', '                      then o.pieces && v_held\n'] },
  anyones_claims: { arm: 'FO-ADDON', why: 'another hero\'s claims own a look', db: [OWNED, 'from public.hr_faction_claims c where c.user_id = p_user and c.slot = p_slot;', 'from public.hr_faction_claims c where c.slot = p_slot;'] },
  switch_takes_looks: { arm: 'FO-ADDON', why: 'the switch off takes an earned look away', db: [OWNED, '                      then o.pieces <@ v_held\n', "                      then o.pieces <@ v_held and public.hr_feature_on('factions', p_user)\n"] },
  swap_drops_claims: { arm: 'FO-PLAY', why: 'a swap takes the old side\'s looks away',
    db: [FINISH, '  update public.hr_faction_members set faction = m.swap_to,', '  delete from public.hr_faction_claims where user_id = v_uid and slot = p_slot;\n  update public.hr_faction_members set faction = m.swap_to,'] },
  bundle_door_moved: { arm: 'FO-DOORS', why: 'the bundle door owns the Key Warden for everyone', db: [OWNED, 'then exists (select 1 from public.player_cosmetics c', 'then true or exists (select 1 from public.player_cosmetics c'] },
  premium_door_moved: { arm: 'FO-DOORS', why: 'a free hero owns the premium outfits', db: [OWNED, 'else not o.premium or public.hr_premium_active(p_user, p_slot, now()) end);', 'else true end);'] },
  reader_to_client: { arm: 'FO-GRANT', why: 'a client can read any hero\'s owned list', ddl: 'grant execute on function public.hr_outfit_owned(uuid, integer) to authenticated' },
  check_dropped: { arm: 'FO-GRANT', why: 'a premium faction look can be stored', ddl: 'alter table public.hr_outfits drop constraint hr_outfits_pieces_shape' },
  pin_lost: { arm: 'FO-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image', sql: [HAND, "'cfe9a082905a659b73b0b9ca8c4e565e', 'e96a36a681fe324d084ce26baa25ac44')", "'cfe9a082905a659b73b0b9ca8c4e565e', '00000000000000000000000000000000')"] },
  catalogue_unguarded: { arm: 'FO-AGAIN', why: 'the catalogue lands before the reader reads the claims',
    sql: [CATALOGUE, "     or strpos((select prosrc from pg_proc where oid = 'public.hr_outfit_owned(uuid,integer)'::regprocedure), 'hr_faction_claims') = 0\n", ''] },
  look_written_free: { arm: 'FO-AGAIN', why: 'the catalogue writes a faction look with no pieces', sql: [CATALOGUE, "  ('flamebearer', false, '{}', 10, null, '{flamebearer}'),", "  ('flamebearer', false, '{}', 10, null, null),"] },
  earned_drops_pieces: { arm: 'FO-DATA', why: 'a faction look would list for a hero who does not own it', js: ['outfits.js', 'export const earnedOnly = (r) => !!r && (!!r.bundle || !!r.pieces);', 'export const earnedOnly = (r) => !!r && !!r.bundle;'] },
  staged_sheet_unchecked: { arm: 'FO-DATA', why: 'a landed sheet leaves its look hidden', js: ['outfits.js', "    if (OUTFITS[id]) out.push(id + ': its sheet has landed, so its row moves into OUTFIT_ROWS with its label, regions and parts');\n", ''] },
  two_addons_one_look: { arm: 'FO-DATA', why: 'a look may show both add-ons', js: ['outfits.js', "    if (Array.isArray(pieces) && pieces.length > 2) out.push(id + ': it shows ' + (pieces.length - 1) + ' add-ons, and a look shows one');\n", ''] },
  addon_off_outfit: { arm: 'FO-DATA', why: 'an add-on look need not start with its outfit', js: ['outfits.js', "    if (Array.isArray(pieces) && pieces.length > 1 && !single.has(pieces[0])) out.push(id + ': its first piece ' + pieces[0] + ' owns no outfit of its own');\n", ''] },
};

async function plant(db, m) {
  if (m.ddl) return db.exec(m.ddl);
  if (!m.db) return null;
  const [sig, find, repl] = m.db;
  const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [sig])).replace(/\r/g, '');
  if (def.split(find).length !== 2) throw harness(`the mutant's line is not in ${sig} exactly once: ${find.slice(0, 80)}`);
  return db.exec(def.replace(find, () => repl));
}

async function runArm(name, mutant) {
  const { db } = await bootReplay();
  try {
    /* the factions open, as the Coordinator opens them (2027-04-23-faction-section.sql) */
    await db.query("update public.hr_feature_switches set scope = 'everyone' where switch_id = 'factions'");
    const X = await ctx(db);
    await db.query('begin');
    try {
      if (mutant) await plant(db, mutant);
      return await ARMS[name](db, X, mutant);
    } finally { await db.query('rollback').catch(() => {}); }
  } finally { await db.close().catch(() => {}); }
}

async function main() {
  const mutate = process.argv.includes('--mutate');
  const red = [];
  for (const name of Object.keys(ARMS)) {
    try {
      const bad = await runArm(name);
      if (bad.length) red.push(...bad); else console.log(`  ✓ ${name}`);
    } catch (e) { console.error(`faction-outfit-db HARNESS ${name}: ${e.stack || e}`); process.exit(2); }
  }
  if (red.length) { console.error(`faction-outfit-db ${mutate ? '--mutate: the CLEAN arms are red' : 'RED'}:\n  ` + red.join('\n  ')); process.exit(1); }
  if (!mutate) { console.log(`faction-outfit-db: green, ${Object.keys(ARMS).length} arms`); return; }
  let missed = 0, ran = 0;
  const only = process.argv.includes('--only') ? String(process.argv[process.argv.indexOf('--only') + 1] || '').split(',') : null;
  for (const [id, m] of Object.entries(MUTANTS)) {
    if (only && !only.includes(id)) continue;
    let bad;
    try { bad = await runArm(m.arm, m); } catch (e) { if (e.harness) { console.error(`  HARNESS ${id}: ${e.message}`); process.exit(2); } bad = ['threw: ' + String(e.message).split('\n')[0]]; }
    console.log(`  ${bad.length ? 'CAUGHT' : 'MISSED'} ${id} by ${m.arm} (${m.why})${bad.length ? ': ' + bad[0].slice(0, 110) : ''}`);
    ran++; if (!bad.length) missed++;
  }
  if (missed) { console.error(`faction-outfit-db --mutate: ${missed} of ${ran} MISSED`); process.exit(1); }
  console.log(`faction-outfit-db --mutate: clean arms green, all ${ran} mutants run caught`);
}

if (isMain(import.meta.url)) main();
