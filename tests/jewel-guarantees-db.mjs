#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/jewel-guarantees-db.mjs — CRAFTED JEWELRY'S GUARANTEE LAYER, PLAYED ON THE REPLAYED CHAIN WITH THE SHIPPED ENGINE
//   (Tyler 2026-11-14: crafted high-end jewelry "RNG", "with some items that can guarantee some things"; board 2026-11-15 (d);
//   src/data/jewelry.js JEWEL_GUARANTEES, supabase/migrations/2027-04-24-jewel-guarantees.sql, hr-accrue set-activity.js).
//
//   G-DARK     the chain as applied holds jewel_guarantees off, for no account
//   G-OFF      with the switch off: the hero's envelope lists the open rolled jobs and no dark one, and set_activity on a dark
//              job answers activity_unsupported naming the switch, before anything moves (pointer, bag, purse, ledger)
//   G-ON       the switch on for this account: the envelope lists every job, each with its kind's odds at the hero's SERVER Crafting
//              level, equal to the engine's own rollOdds (the table the bench rolls with), and its guarantee; another account stays dark
//   G-VIEWED   the real door: set_activity starts "a Crown Shard and the Rat King's Crown in a Banded Signet", the owner's stop settles it:
//              each job spent one of each input and made one Hallmarked Banded Signet with Follow-through, no gold moved, one craft row
//   G-CLOSED   the same job with the browser closed (the world tick): the same spend, the same guarantee on every piece made
//   G-CARRY    a made piece keeps its rolls by keeping its id: worn (the equip verb puts the row on a ring slot, its perks the catalogue's),
//              moved to Storage and back, and listable on the Weighhouse at its grade's ceiling
//   G-FORGED   no client door makes a roll or a perk: hr_apply is the engine's alone, a Hallmark to a pair the catalogue doesn't hold is
//              refused, and a recipe id that isn't a catalogue job is unknown_activity
//   G-IDEM     a second apply of both files (their self-checks included) moves nothing, and a re-apply keeps the switch where it was
//
//   node tests/jewel-guarantees-db.mjs            the guard
//   node tests/jewel-guarantees-db.mjs --mutate   planted defects (edge copy, or the migration, whose own §4 must refuse it)
//
// mutant-anchors: supabase/functions/hr-accrue/set-activity.js src/core/artisan.js supabase/migrations/2027-04-24-jewel-guarantees.sql
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';
import { plant } from './hunt-core/fixtures/h1.js';
import { ITEMS } from '../src/data/items.js';
import { ARTISAN_RECIPES_EVERY } from '../src/data/recipes.js';
import { JEWEL_SWITCH, rollOdds, JEWELRY_ITEMS } from '../src/data/jewelry.js';
import { recipeInputs } from '../src/core/artisan.js';
import { OUT_FILE as JOBS_FILE } from '../tools/gen-jewel-jobs.mjs';

const MUTATE = process.argv.includes('--mutate');
const FN = 'supabase/functions/hr-accrue';
const MIG = '2027-04-24-jewel-guarantees.sql';
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';
const DARK = ARTISAN_RECIPES_EVERY.crafting.filter((r) => r.switch === JEWEL_SWITCH);
const OPEN = ARTISAN_RECIPES_EVERY.crafting.filter((r) => r.roll && !r.switch);
const BOTH = DARK.find((r) => r.perk && r.roll === 'seal');
const CRAFTS = 6;

let seq = 0;
const nextUid = () => `000000c2-0000-4000-8000-0000000c${String(++seq).padStart(4, '0')}`;
const idem = () => crypto.randomUUID();
const js = (v) => String(JSON.stringify(v === undefined ? null : v));
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };

async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  catch (e) { return { threw: String(e.message).split('\n')[0] }; }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
  }
}
const engineExec = (db) => async (text, params) => {
  await db.exec('begin'); await db.exec('set local role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
};

/* A hero made the real way: Level 20, Crafting `craft`, a purse, a bag. */
async function hero(db, { craft = 30, bag = {}, purse = 1000 } = {}) {
  const uid = nextUid();
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Jeweller ' + seq]);
  const name = 'Jeweller' + String.fromCharCode(97 + (seq % 26)) + String.fromCharCode(97 + Math.floor(seq / 26) % 26);
  const h = await as(db, uid, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', [name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
  await db.query('delete from public.player_inventory where user_id = $1 and slot = 0', [uid]);
  for (const [id, n] of Object.entries(bag)) await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [uid, id, n]);
  await db.query("update public.player_state set level_xp = public.hr_char_xp_for_level(20) where user_id = $1 and slot = 0", [uid]);
  await db.query(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, 'crafting', public.hr_skill_xp_for_level('crafting', $2))
                  on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, craft]);
  await db.query('update public.account_wallet set gold = $2 where user_id = $1', [uid, purse]);
  return uid;
}
const switchOn = (db, uids) => db.query("update public.hr_feature_switches set scope = 'accounts', accounts = $1::uuid[] where switch_id = $2", [uids, JEWEL_SWITCH]);
const switchOff = (db) => db.query("update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = $1", [JEWEL_SWITCH]);
const section = async (db, uid) => (await one(db, 'select public.hr_state_of($1, 0) s', [uid]) || {}).jewel_jobs;
const bagOf = async (db, uid) => Object.fromEntries((await db.query('select item_id, qty from public.player_inventory where user_id = $1 and slot = 0', [uid])).rows.map((r) => [r.item_id, Number(r.qty)]));
const viewOf = async (db, uid) => {
  const r = (await db.query(`select ps.active_kind, ps.active_id, (select gold from public.account_wallet w where w.user_id = ps.user_id)::bigint as purse
                               from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid])).rows[0];
  return { kind: r.active_kind, id: r.active_id, purse: Number(r.purse), bag: await bagOf(db, uid),
    crafts: Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and slot = 0 and kind = 'craft'", [uid])) };
};
async function rewind(db, uid, agoS) {
  await db.query('update public.player_state set active_since = active_since - make_interval(secs => $2), accrued_to = accrued_to - make_interval(secs => $2) where user_id = $1 and slot = 0', [uid, agoS]);
  await db.query('update public.hr_return_anchor set real_return_at = real_return_at - make_interval(secs => $2) where user_id = $1 and slot = 0', [uid, agoS]);
}
async function fire(db, tick, uids) {
  await db.query('select public.hr_tick_enrol(200)');
  const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
  await db.query('select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)', [holder]);
  try {
    return (await tick.runTick({ exec: engineExec(db), body: { op: 'tick', roster: uids.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 } })).body;
  } catch (e) { return { RAISED: String(e.message).slice(0, 200) }; }
}

/* What a guarantee job made: every made row its outcome, its perk and its grade; the inputs spent whole jobs. */
function judgeRun(job, before, after) {
  const per = recipeInputs(job);
  const spent = Object.keys(per).map((id) => ((before[id] || 0) - (after[id] || 0)) / per[id]);
  const made = Object.entries(after).filter(([id, q]) => JEWELRY_ITEMS[id] && q > (before[id] || 0)).map(([id, q]) => [id, q - (before[id] || 0)]);
  const pieces = made.reduce((a, [, q]) => a + q, 0);
  if (!(spent[0] > 0) || spent.some((n) => n !== spent[0])) return `spent ${js(spent)} jobs of ${js(per)}`;
  if (pieces !== spent[0]) return `${pieces} pieces for ${spent[0]} jobs`;
  for (const [id] of made) {
    const it = JEWELRY_ITEMS[id];
    if (!job.outcomes.includes(id)) return `made ${id}, not one of the job's outcomes`;
    if (job.perk && !(job.perk in it.jewelPerks)) return `made ${id} without ${job.perk}`;
    if (job.roll === 'seal' && it.jewelGrade !== 'hallmarked') return `made a ${it.jewelGrade} ${id}`;
  }
  return null;
}

async function arms(db, edge) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  await db.query('delete from public.hr_rate_counters');
  const stock = Object.fromEntries(Object.entries(recipeInputs(BOTH)).map(([id, q]) => [id, q * CRAFTS]));
  const start = (uid, job) => edge.setActivity({ exec: engineExec(db), user: uid, slot: 0, intentId: idem(), activity: { kind: 'artisan', id: job.id } });
  const stop = (uid) => edge.setActivity({ exec: engineExec(db), user: uid, slot: 0, intentId: idem(), activity: { kind: 'idle', id: null } });

  /* ── G-DARK: the chain as applied leaves the switch off for everyone ── */
  const applied = (await db.query('select scope, accounts from public.hr_feature_switches where switch_id = $1', [JEWEL_SWITCH])).rows[0];
  arm('G-DARK', !!applied && applied.scope === 'off' && applied.accounts.length === 0, `the applied chain holds ${JEWEL_SWITCH} off, for no account`,
    `the applied switch reads ${js(applied)}`);

  /* ── G-OFF ── */
  await switchOff(db);
  const off = await hero(db, { bag: stock });
  const s0 = await section(db, off);
  const listed = new Set(((s0 && s0.jobs) || []).map((j) => j.recipe));
  const before0 = await viewOf(db, off);
  const r0 = await start(off, BOTH);
  const after0 = await viewOf(db, off);
  arm('G-OFF', !!s0 && OPEN.every((r) => listed.has(r.id)) && DARK.every((r) => !listed.has(r.id))
      && r0.status === 409 && r0.body.error === 'activity_unsupported' && r0.body.switch === JEWEL_SWITCH
      && js(after0) === js(before0) && after0.kind === 'idle',
    `the envelope lists the ${OPEN.length} open jobs and none of the ${DARK.length} dark ones; set_activity refused ${BOTH.id} naming ${JEWEL_SWITCH}, nothing moved`,
    `switch off: ${js({ listed: [...listed], answer: r0, before0, after0 }).slice(0, 700)}`);

  /* ── G-ON ── */
  const on = await hero(db, { bag: stock, craft: 37 });
  const other = await hero(db, { craft: 37 });
  await switchOn(db, [on]);
  const bad = [];
  for (const lv of [1, 15, 37, 60, 99]) {
    await db.query("update public.player_skills set xp = public.hr_skill_xp_for_level('crafting', $2) where user_id = $1 and slot = 0 and skill_id = 'crafting'", [on, lv]);
    const s = await section(db, on);
    if (!s || s.level !== lv || s.jobs.length !== OPEN.length + DARK.length) { bad.push(`at ${lv}: ${js(s).slice(0, 200)}`); continue; }
    for (const j of s.jobs) {
      const r = ARTISAN_RECIPES_EVERY.crafting.find((x) => x.id === j.recipe), o = rollOdds(r.roll, lv);
      if (j.fine !== o.fine || j.hallmarked !== o.hallmarked || j.plain !== o.plain || j.perk !== (r.perk || null) || j.kind !== r.roll)
        bad.push(`${j.recipe} at ${lv}: ${js(j)} against the engine's ${js(o)}`);
    }
  }
  await db.query("update public.player_skills set xp = public.hr_skill_xp_for_level('crafting', 37) where user_id = $1 and slot = 0 and skill_id = 'crafting'", [on]);
  const sOther = await section(db, other);
  const otherDark = ((sOther && sOther.jobs) || []).filter((j) => DARK.some((r) => r.id === j.recipe));
  arm('G-ON', !bad.length && otherDark.length === 0,
    `every job at Crafting 1, 15, 37, 60 and 99 shows the engine's odds and its guarantee; an account the switch doesn't name sees no dark job`,
    `switch on: ${bad.concat(otherDark.map((j) => 'other sees ' + j.recipe)).join('; ').slice(0, 700)}`);

  /* ── G-VIEWED: the real start, ten minutes, the owner's stop ── */
  const vb = await bagOf(db, on);
  const sv = await start(on, BOTH);
  await rewind(db, on, 600);
  const st = await stop(on);
  const va = await viewOf(db, on);
  const vWhy = judgeRun(BOTH, vb, va.bag);
  arm('G-VIEWED', sv.status === 200 && st.status === 200 && !vWhy && va.purse === 1000 && va.crafts >= 1 && va.kind === 'idle',
    `set_activity started ${BOTH.id}; the stop paid ${CRAFTS - (va.bag.banded_signet || 0)} Hallmarked Follow-through rings for their inputs, no gold, journalled`,
    `the viewed path: ${js({ start: sv.status, startErr: sv.body && sv.body.error, stop: st.status, why: vWhy, va }).slice(0, 700)}`);

  /* ── G-CLOSED: the same job, browser closed, the world tick ── */
  const closed = await hero(db, { bag: stock, craft: 37 });
  await switchOn(db, [on, closed]);
  const cb = await bagOf(db, closed);
  const sc = await start(closed, BOTH);
  /* the browser closes: no presence, so the world tick owns the hero */
  await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 0', [closed]);
  await db.query('select public.hr_tick_enrol(200)');
  await rewind(db, closed, 600);
  const fc = await fire(db, edge.tick, [closed]);
  const ca = await viewOf(db, closed);
  const cWhy = judgeRun(BOTH, cb, ca.bag);
  arm('G-CLOSED', sc.status === 200 && !cWhy && ca.purse === 1000 && ca.crafts >= 1,
    'the world tick with the browser closed paid the same guarantee on every piece, no gold, journalled',
    `the closed path: ${js({ start: sc.status, fire: fc, why: cWhy, ca }).slice(0, 700)}`);

  /* ── G-CARRY: a made piece by its id, worn, to Storage and back, listable ── */
  const madeId = Object.keys(va.bag).find((id) => JEWELRY_ITEMS[id]);
  let carry = 'no piece made';
  if (madeId) {
    const eq = await edge.equip({ exec: engineExec(db), user: on, slot: 0, intentId: idem(), equip: { ring1: madeId } });
    const worn = await one(db, "select item_id from public.player_equipment where user_id = $1 and slot = 0 and equip_slot = 'ring1'", [on]);
    const off1 = await edge.equip({ exec: engineExec(db), user: on, slot: 0, intentId: idem(), equip: { ring1: null } });
    const back = (await bagOf(db, on))[madeId] || 0;
    const dep = await as(db, on, 'select public.hr_bank_move(0, $1, 1, $2, $3::uuid)', [madeId, 'deposit', idem()]);
    const banked = Number(await one(db, 'select qty from public.account_bank where user_id = $1 and item_id = $2', [on, madeId]) || 0);
    const wd = await as(db, on, 'select public.hr_bank_move(0, $1, 1, $2, $3::uuid)', [madeId, 'withdraw', idem()]);
    const mk = (await db.query('select listable, ceiling_each from public.hr_market_items where item_id = $1', [madeId])).rows[0];
    const ceil = Number(await one(db, 'select ceiling from public.hr_market_ceilings where item_id = $1', [madeId]));
    carry = (eq.status === 200 && worn === madeId && off1.status === 200 && back >= 1 && dep && dep.ok === true && banked === 1 && wd && wd.ok === true
      && mk && mk.listable === true && Number(mk.ceiling_each) === ceil && ITEMS[madeId].slot === 'ring') ? null
      : js({ madeId, eq: eq.status, eqErr: eq.body && eq.body.error, worn, off1: off1.status, back, dep, banked, wd, mk, ceil });
  }
  arm('G-CARRY', carry === null, `${madeId} was worn on ring1, moved to Storage and back, and lists on the Weighhouse up to its grade's ceiling`, `the carry: ${String(carry).slice(0, 700)}`);

  /* ── G-FORGED ── */
  const forged = await hero(db, { bag: { banded_signet_follow: 1, road_carnelian: 1 }, craft: 45, purse: 100000 });
  const viaApply = await as(db, forged, `select public.hr_apply($1::uuid, 0, (select version from public.player_state where user_id = $1 and slot = 0), $2::uuid,
      '{"items": {"banded_signet_keen_follow": 1}}'::jsonb)`, [forged, idem()]);
  const viaHallmark = await as(db, forged, 'select public.hr_hallmark(0, $1, $2, 25000, $3::uuid)', ['banded_signet_follow', 'banded_signet_keen_surge', idem()]);
  await switchOn(db, [on, closed, forged]);
  const viaRecipe = await edge.setActivity({ exec: engineExec(db), user: forged, slot: 0, intentId: idem(), activity: { kind: 'artisan', id: BOTH.id + '_x' } });
  const fa = await viewOf(db, forged);
  arm('G-FORGED', !!(viaApply && viaApply.threw && /permission denied/.test(viaApply.threw))
      && viaHallmark && viaHallmark.error === 'unknown_hallmark' && viaRecipe.status === 409 && viaRecipe.body.error === 'unknown_activity'
      && fa.purse === 100000 && !fa.bag.banded_signet_keen_follow && !fa.bag.banded_signet_keen_surge && fa.bag.banded_signet_follow === 1,
    'a client cannot reach hr_apply, a Hallmark to an unpaired row is unknown_hallmark, a made-up job id is unknown_activity; nothing moved',
    `forged: ${js({ viaApply, viaHallmark, viaRecipe: viaRecipe.body, fa }).slice(0, 700)}`);
  return red;
}

async function loadEdge(root) {
  const tick = await import(pathToFileURL(join(root, FN, 'tick.js')).href + `?m=${seq}`);
  const sa = await import(pathToFileURL(join(root, FN, 'set-activity.js')).href + `?m=${seq}`);
  const eq = await import(pathToFileURL(join(root, FN, 'equip.js')).href + `?m=${seq}`);
  return { tick, setActivity: sa.runSetActivity, equip: eq.runEquip };
}
async function prepare(db) {
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'jewel-guarantees-db') on conflict (key) do update set enabled = true");
  await db.query('update public.hr_tick_config set enabled = true where id');
}

/* An edge mutant runs the arms on a planted copy; a migration mutant must be refused by the file's own §4 (or turn an arm red). */
const EDGE_MUTANTS = [
  { arm: 'G-OFF', why: 'set_activity never asks the switch', file: `${FN}/set-activity.js`, from: '  if (!sw) return true;\n  const on', to: '  return true;\n  const on' },
  { arm: 'G-VIEWED', why: 'the bench forgets the boss gem\'s perk', file: 'src/core/artisan.js', from: 'const fixed = recipe.perk || null;', to: 'const fixed = null;' },
];
const SQL_MUTANTS = [
  { why: 'the section ignores the switch', expect: /jewel-guarantees §4\(b\)/, edits: [['(j.switch_id is null or public.hr_feature_on(j.switch_id, p_user))', 'true']] },
  { why: 'the section reads the odds at Crafting 1', expect: /jewel-guarantees §4\(c\)/, edits: [['join public.hr_jewel_odds o on o.kind = j.kind and o.level = v_lv', 'join public.hr_jewel_odds o on o.kind = j.kind and o.level = 1']] },
  { why: 'the file opens the switch for everyone', expect: /^$/, edits: [["('jewel_guarantees', 'off',", "('jewel_guarantees', 'everyone',"]], arm: 'G-DARK' },
];

async function main() {
  let db;
  if (!MUTATE) {
    try { ({ db } = await bootReplay()); } catch (e) { console.error(`jewel-guarantees-db: HARNESS — ${String(e.message).split('\n').slice(0, 3).join(' ').slice(0, 900)}`); process.exit(2); }
    try {
      await prepare(db);
      const edge = await loadEdge(ROOT);
      console.log('\njewel-guarantees-db — a boss gem fixes a perk, a boss Trophy fixes Hallmarked, dark until the switch names you\n');
      /* the arms first: G-DARK reads the switch as the chain applied it */
      const red = await arms(db, edge);
      const SNAP = `select md5(string_agg(t::text, ',' order by recipe_id)) j, (select md5(string_agg(o::text, ',' order by kind, level)) from public.hr_jewel_odds o) o,
                           md5(pg_get_functiondef('public.hr_jewel_jobs_view(uuid,integer)'::regprocedure)) f,
                           (select scope || ':' || accounts::text from public.hr_feature_switches where switch_id = '${JEWEL_SWITCH}') s
                      from public.hr_jewel_jobs t`;
      await db.query("update public.hr_feature_switches set scope = 'testers' where switch_id = $1", [JEWEL_SWITCH]);
      const s1 = js((await db.query(SNAP)).rows);
      let again = null;
      for (const f of [JOBS_FILE, MIG]) {
        const src = readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
        try { await db.exec(`begin;\n${src}\ncommit;`); } catch (e) { await db.exec('rollback').catch(() => {}); again = f + ': ' + String(e.message).split('\n')[0]; }
      }
      const s2 = js((await db.query(SNAP)).rows);
      const idemOk = again === null && s1 === s2 && /testers/.test(s2);
      console.log(idemOk ? '  ✓ G-IDEM — a second apply of both files (their self-checks included) moves nothing, the switch stays where it was set'
        : `  ✗ G-IDEM — ${again || 'the second apply moved state: ' + s1 + ' -> ' + s2}`);
      if (!idemOk) red.set('G-IDEM', 'second apply');
      console.log(red.size ? `\njewel-guarantees-db: RED (${red.size})` : '\njewel-guarantees-db: green');
      process.exitCode = red.size ? 1 : 0;
    } catch (e) {
      console.error(`jewel-guarantees-db: HARNESS — ${String(e.stack || e.message).slice(0, 900)}`); process.exitCode = 2;
    } finally { await db.close().catch(() => {}); }
    return;
  }
  console.log('\njewel-guarantees-db --mutate\n');
  let survived = 0;
  for (const mu of EDGE_MUTANTS) {
    const p = plant([[mu.file, mu.from, mu.to]], [FN]);
    try {
      ({ db } = await bootReplay());
      await prepare(db);
      const red = await arms(db, await loadEdge(p.root));
      if (red.has(mu.arm)) console.log(`  CAUGHT  ${mu.why} -> ${mu.arm}: ${String(red.get(mu.arm)).slice(0, 160)}`);
      else { console.error(`  MISSED  ${mu.why} (${mu.arm})`); survived++; }
    } catch (e) { console.error(`jewel-guarantees-db: HARNESS — ${mu.why}: ${e.message}`); process.exit(2); }
    finally { await db.close().catch(() => {}); p.done(); }
  }
  for (const mu of SQL_MUTANTS) {
    let mdb = null, caught = null;
    try { ({ db: mdb } = await bootReplay({ patches: new Map([[MIG, mu.edits]]), upTo: LAST_PATCHED })); }
    catch (e) {
      if (e && e.harness) { console.error(`jewel-guarantees-db: HARNESS — ${mu.why}: ${e.message}`); process.exit(2); }
      if (mu.expect.test(String(e.message))) caught = 'the file\'s own §4 refused it: ' + String(e.message).split('\n')[0];
    }
    if (!caught && mdb) {
      try {
        if (mu.arm) {
          /* the file applied with its defect (it is the chain's last): the arms judge the database it built */
          await prepare(mdb);
          const red = await arms(mdb, await loadEdge(ROOT));
          if (red.has(mu.arm)) caught = mu.arm + ': ' + String(red.get(mu.arm)).slice(0, 160);
        }
      } finally { await mdb.close().catch(() => {}); }
    } else if (mdb) await mdb.close().catch(() => {});
    if (caught) console.log(`  CAUGHT  ${mu.why} -> ${caught.slice(0, 200)}`);
    else { console.error(`  MISSED  ${mu.why}`); survived++; }
  }
  const total = EDGE_MUTANTS.length + SQL_MUTANTS.length;
  console.log(survived ? `\njewel-guarantees-db --mutate: ${survived} of ${total} survived` : `\njewel-guarantees-db --mutate: ${total} mutants, 0 survived`);
  process.exitCode = survived ? 1 : 0;
}

main();
