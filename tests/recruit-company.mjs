#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/recruit-company.mjs — THE RECRUITED COMPANY'S FIRST PARTY HUNT: THE BOW SHOOTS, AND EVERY NEW TALENT POINT IS SPENT AS SUGGESTED,
//   WINDOW OPEN OR BROWSER CLOSED (lane/recruits-ammo-talents, 2026-11-23; the first-hour walk on the set: "Bren: none loaded (no attacks)"
//   for the whole first party hunt, and a recruit asked about points it would spend the same way; docs/design/redesign/20-v030-the-roads.md
//   section 3.3; supabase/migrations/1038-start-kits.sql THE SHOT, 1053-recruits.sql, 1069-talent-standing-rule.sql; CLAUDE.md §4 both paths).
//
// On the replayed chain with the SHIPPED edge, through the client's own doors: a brand-new account makes ONE Club hero (hr_create_hero),
// reaches Level 5 (its level_xp set as its hunts would leave it, the one fixture shortcut), presses for its recruits (hr_recruit_company),
// seats them (hr_hunt_party_invite_own) and starts the company's hunt on the Sewer (hr_hunt_party_start). The hunt is settled by the world
// tick (tick.js runTick: the browser closed) and by the player's own settle watching the bow (hunt-settle.js settleHunt: the hunt viewed).
//   RCO-HUNT      the switch off (as shipped): through each door, ten minutes on the Sewer, the bow recruit lands blows (its Ranged XP
//                 rises), as the Club leader does; the bow wears its shot the whole hunt. CONTROL: the hunt settled its span
//   RCO-SPENT     Talents lit (inside the arm): each recruit arrives at Level 5 with every point spent along ITS job's suggested road for the
//                 party plan, exactly the catalogue's first points in order, and its envelope says so (talents.spent = points, auto party)
//   RCO-STANDING  Talents lit, each door: the Club leader one XP under Level 6 hunts; the settle that lands Level 6 spends its new point
//                 (one standing log row from Level 5), and the two doors leave the same build
//   RCO-SETTING   Talents lit, as the signed-in client (role authenticated): "Spend as suggested" off answers the hero's envelope with auto
//                 null and a Level gained banks its point; on spends it at once; the same key answers its receipt and spends nothing
//
//   node tests/recruit-company.mjs              the guard
//   node tests/recruit-company.mjs --arm=hunt   one arm
//   node tests/recruit-company.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//
// mutant-anchors: supabase/migrations/1038-start-kits.sql supabase/migrations/1069-talent-standing-rule.sql
//   (each mutant is planted in a live body read from the booted chain with pg_get_functiondef and restored after its arm)
// ci-step: db-replay | The recruited company's first party hunt - the bow shoots and Talent points are spent as suggested, both doors (1038, 1069)
// ci-run: node tests/recruit-company.mjs
// ci-run: node tools/mutant-gate.mjs node tests/recruit-company.mjs --mutate
//
// WHAT IT CANNOT PROVE: true concurrency (PGlite is one backend); the lock order that serialises the standing rule with a press is argued
// in 1069's header (both hold the hero's player_state row before hero_talents).
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q, makeExec } = H;
const ROOT = H.ROOT;
const SEWER = 'millrace_sewer';
const SPAN = 10 * 60000;
const COLORS = '{"head":1,"body":2,"legs":3,"feet":0}';
const idem = () => crypto.randomUUID();
const uidOf = (n) => '00000000-0000-4000-8000-0000000fd' + String(n).padStart(3, '0');
const rewind = (db) => db.query("select setval('public.hr_test_uuid_seq', 1000, false)");
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await asUser(db, uid);
  const v = await one(db, sql, params);
  await asUser(db, '');
  return v;
}
/* the signed-in client's own role: a verb it may not execute throws here, as PostgREST would refuse it */
async function asClient(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await asUser(db, uid);
  await db.exec('set role authenticated');
  try { return await one(db, sql, params); } finally { await db.exec('reset role'); await asUser(db, ''); }
}
const lit = (db, on) => db.query('update public.hr_talent_rules set live = $1 where id', [on]);
const levelOf = async (db, uid, slot) => Number(await one(db, 'select public.hr_level_of($1::uuid, $2::int)', [uid, slot]));
const skillXp = async (db, uid, slot, skill) => Number(await one(db, 'select coalesce(xp, 0)::text from public.player_skills where user_id = $1 and slot = $2 and skill_id = $3', [uid, slot, skill]) || 0);
const build = async (db, uid, slot) => (await q(db, 'select nodes, spent from public.hero_talents where user_id = $1 and slot = $2', [uid, slot]))[0] || { nodes: {}, spent: 0 };
const points = async (db, L) => Number(await one(db, 'select public.hr_talent_points($1::int)', [L]));
const discOf = (db, uid, slot) => one(db, 'select d.discipline from public.hr_talent_disciplines d where d.role_key = public.hr_hunt_weapon_of($1::uuid, $2::int)', [uid, slot]);
/* the first `n` steps of a discipline's suggested road for the party plan, as the catalogue orders them */
async function roadOf(db, disc, n) {
  const rows = await q(db, `select node_id, pick from public.hr_talent_suggest where discipline = $1 and plan = 'party' order by seq limit $2`, [disc, n]);
  return Object.fromEntries(rows.map((r) => [r.node_id, r.pick === null ? true : r.pick]));
}
const sameJson = (a, b) => H.canon(a) === H.canon(b);

async function boot() {
  const { db } = await bootReplay();
  await H.pinDice(db);
  return db;
}

/* A brand-new account: ONE Club hero, Level 5, the recruit press. Answers the company { uid, heroes: [{ slot, set }] } or { err }. */
async function company(db, uid, name) {
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query('update public.hr_tick_config set enabled = true where id');
  await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
  await db.query('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'recruit-company') on conflict do nothing", [uid]);
  const made = await as(db, uid, `select public.hr_create_hero(0, $1, '${COLORS}'::jsonb, $2::uuid, 'club')`, [name, idem()]);
  if (!made || made.ok !== true) return { err: 'the first hero answered ' + JSON.stringify(made) };
  await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level((select at_level from public.hr_recruit_rules)) where user_id = $1 and slot = 0', [uid]);
  const r = await as(db, uid, 'select public.hr_recruit_company(null::text[], $1::uuid)', [idem()]);
  if (!r || r.ok !== true) return { err: 'the press answered ' + JSON.stringify(r && { ok: r.ok, error: r.error }) };
  return { uid, heroes: r.heroes };
}
/* The company's hunt through the client's doors: each recruit seated by the leader, ONE Start; then every session and the instance
   backdated to the same whole second, SPAN + 1 minute ago. Answers { sids: { slot: id }, from } or { err }. */
async function partyHunt(db, uid, slots) {
  for (const s of slots) {
    const v = await as(db, uid, 'select public.hr_hunt_party_invite_own(0, $1::int, $2::uuid)', [s, idem()]);
    if (!v || v.ok !== true) return { err: `seating hero ${s} answered ` + JSON.stringify(v && { ok: v.ok, error: v.error }) };
  }
  const st = await as(db, uid, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [SEWER, idem()]);
  if (!st || st.ok !== true) return { err: 'the Start answered ' + JSON.stringify(st && { ok: st.ok, error: st.error, seats: st.seats }) };
  const rows = await q(db, 'select id, slot, instance_id from public.hunt_sessions where user_id = $1 and ended_at is null order by slot', [uid]);
  if (rows.length !== slots.length + 1) return { err: `the Start opened ${rows.length} sessions for ${slots.length + 1} heroes` };
  const t = `date_trunc('second', now() - make_interval(mins => ${SPAN / 60000 + 1}))`;
  for (const x of rows) await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [x.id]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [rows[0].instance_id]);
  const from = Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [rows[0].instance_id]));
  return { sids: Object.fromEntries(rows.map((x) => [x.slot, x.id])), from };
}
/* SPAN of the hunt through one door: `closed` the world tick (one fire to the end), `viewed` the player's settle watching `viewer`. */
async function play(db, M, uid, h, door, viewer) {
  const exec = makeExec(db);
  const sid = h.sids[viewer];
  const cuts = door === 'closed' ? [h.from + SPAN] : [h.from + 7001, h.from + 61234, h.from + 200001, h.from + 333333, h.from + SPAN];
  for (const at of cuts) {
    for (let guard = 0; guard < 80; guard++) {
      const s = (await q(db, 'select settled_to, ended_at from public.hunt_sessions where id = $1', [sid]))[0];
      if (s.ended_at || Date.parse(s.settled_to) >= at) break;
      if (door === 'closed') {
        await db.query('delete from public.hunt_tick_lease');
        const r = (await M.TK.runTick({ exec, grounds: {}, atMs: at, body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: [{ user_id: uid, slot: viewer, session_id: sid }] } })).body;
        if (!r.hunts || r.hunts.settled < 1) return { err: 'the world tick settled nothing: ' + JSON.stringify(r.hunts || r).slice(0, 300) };
      } else {
        const v = await M.HS.settleHunt({ exec, user: uid, slot: viewer, mode: 'settle', bucket: null, project: true, live: true, atMs: at, minWindowMs: 0, grounds: {} });
        if (v.outcome !== 'paid') return { err: 'the player\'s settle answered ' + JSON.stringify({ o: v.outcome, r: v.reason }).slice(0, 300) };
      }
    }
  }
  return { settled: Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = $1', [sid])) - h.from };
}
const BOW = async (db, uid) => Number(await one(db, `select slot from public.player_equipment where user_id = $1 and equip_slot = 'weapon' and item_id = 'practice_bow'`, [uid]));

/* ── RCO-HUNT: the switch off, as shipped ─────────────────────────────────── */
async function huntArm(db, M) {
  const bad = [];
  for (const door of ['closed', 'viewed']) {
    const tag = `RCO-HUNT the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
    const r = await H.inTx(db, async () => {
      await rewind(db);
      await lit(db, false);
      const uid = uidOf(door === 'closed' ? 1 : 2);
      const c = await company(db, uid, door === 'closed' ? 'Bowguard Ana' : 'Bowguard Eda');
      if (c.err) return c;
      const bow = await BOW(db, uid);
      if (!(bow > 0)) return { err: 'CONTROL: no recruit holds the practice bow' };
      const shot = await one(db, "select item_id from public.player_equipment where user_id = $1 and slot = $2 and equip_slot = 'ammo'", [uid, bow]);
      const before = { bow: await skillXp(db, uid, bow, 'ranged'), lead: await skillXp(db, uid, 0, 'melee') };
      const h = await partyHunt(db, uid, c.heroes.map((x) => x.slot));
      if (h.err) return h;
      const p = await play(db, M, uid, h, door, bow);
      if (p.err) return p;
      return { shot, before, after: { bow: await skillXp(db, uid, bow, 'ranged'), lead: await skillXp(db, uid, 0, 'melee') }, settled: p.settled,
        worn: await one(db, "select item_id from public.player_equipment where user_id = $1 and slot = $2 and equip_slot = 'ammo'", [uid, bow]) };
    });
    if (r.err) { bad.push(`${tag} ${r.err}`); continue; }
    if (!(r.settled >= SPAN - 1000)) bad.push(`${tag} CONTROL: the hunt settled ${r.settled} ms of ${SPAN}`);
    if (!(r.after.lead > r.before.lead)) bad.push(`${tag} CONTROL: the Club leader landed nothing (Melee XP ${r.before.lead} -> ${r.after.lead})`);
    if (!r.shot) bad.push(`${tag} the bow recruit arrived with nothing in its ammo slot`);
    if (!(r.after.bow > r.before.bow)) bad.push(`${tag} the bow recruit landed no blow in ${SPAN / 60000} minutes (Ranged XP ${r.before.bow} -> ${r.after.bow}, shot ${r.shot})`);
    if (r.shot && r.worn !== r.shot) bad.push(`${tag} the bow's shot ${r.shot} left its slot (${r.worn})`);
  }
  return bad;
}

/* ── RCO-SPENT: recruits arrive spent along their own roads ─────────────────── */
async function spentArm(db) {
  return H.inTx(db, async () => {
    await rewind(db);
    const bad = [];
    await lit(db, true);
    const uid = uidOf(3);
    const c = await company(db, uid, 'Roadguard Ana');
    if (c.err) return [`RCO-SPENT ${c.err}`];
    const discs = new Set();
    for (const h of [{ slot: 0 }, ...c.heroes]) {
      const L = await levelOf(db, uid, h.slot);
      const want = await points(db, L);
      const disc = await discOf(db, uid, h.slot);
      discs.add(disc);
      const b = await build(db, uid, h.slot);
      const road = await roadOf(db, disc, want);
      if (!(want > 0) || b.spent !== want || !sameJson(b.nodes, road)) {
        bad.push(`RCO-SPENT hero ${h.slot} (${disc}, Level ${L}) holds ${JSON.stringify(b.nodes)} (${b.spent} of ${want}), its road's first ${want}: ${JSON.stringify(road)}`);
      }
      const e = await as(db, uid, 'select public.hr_load($1)', [h.slot]);
      const t = e && e.talents;
      if (!t || t.spent !== want || t.points !== want || t.auto !== 'party') bad.push(`RCO-SPENT hero ${h.slot}'s envelope reads talents ${JSON.stringify(t && { spent: t.spent, points: t.points, auto: t.auto })}`);
    }
    if (discs.size !== 4) bad.push(`RCO-SPENT CONTROL: the company walks ${discs.size} roads, not four`);
    return bad;
  });
}

/* ── RCO-STANDING: the Level a hunt lands spends its point, both doors ───────── */
async function standingArm(db, M) {
  const bad = [];
  const got = {};
  for (const door of ['closed', 'viewed']) {
    const tag = `RCO-STANDING the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
    const r = await H.inTx(db, async () => {
      await rewind(db);
      await lit(db, true);
      const uid = uidOf(door === 'closed' ? 4 : 5);
      const c = await company(db, uid, door === 'closed' ? 'Standguard Ana' : 'Standguard Eda');
      if (c.err) return c;
      await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level(6) - 1 where user_id = $1 and slot = 0', [uid]);
      const pre = { level: await levelOf(db, uid, 0), build: await build(db, uid, 0) };
      const h = await partyHunt(db, uid, c.heroes.map((x) => x.slot));
      if (h.err) return h;
      const p = await play(db, M, uid, h, door, 0);
      if (p.err) return p;
      const L = await levelOf(db, uid, 0);
      return { pre, level: L, build: await build(db, uid, 0), want: await points(db, L), settled: p.settled,
        log: await q(db, "select n, level, meta from public.hero_talent_log where user_id = $1 and slot = 0 and verb = 'suggested' and meta->>'standing' = 'true' order by id", [uid]) };
    });
    if (r.err) { bad.push(`${tag} ${r.err}`); continue; }
    got[door] = r;
    if (r.pre.level !== 5 || r.pre.build.spent !== 4) bad.push(`${tag} CONTROL: before the hunt the leader is Level ${r.pre.level} with ${r.pre.build.spent} spent (the rule spent Level 5's points?)`);
    if (!(r.level >= 6)) bad.push(`${tag} CONTROL: ${SPAN / 60000} minutes on the Sewer left the leader at Level ${r.level}`);
    else if (r.build.spent !== r.want) bad.push(`${tag} the leader reached Level ${r.level} with ${r.build.spent} of ${r.want} points spent`);
    else if (!r.log.some((x) => Number(x.meta.from_level) === 5 && x.level === r.level)) bad.push(`${tag} the settle's spend is not journalled from Level 5: ${JSON.stringify(r.log)}`);
  }
  if (got.closed && got.viewed && got.closed.level === got.viewed.level && !sameJson(got.closed.build.nodes, got.viewed.build.nodes)) {
    bad.push(`RCO-STANDING the two doors disagree at Level ${got.closed.level}: ${JSON.stringify(got.closed.build.nodes)} vs ${JSON.stringify(got.viewed.build.nodes)}`);
  }
  return bad;
}

/* ── RCO-SETTING: the setting through the client's own role ─────────────────── */
async function settingArm(db) {
  return H.inTx(db, async () => {
    await rewind(db);
    const bad = [];
    await lit(db, true);
    const uid = uidOf(6);
    const c = await company(db, uid, 'Setguard Ana');
    if (c.err) return [`RCO-SETTING ${c.err}`];
    const slot = c.heroes[0].slot;
    const off = await asClient(db, uid, 'select public.hr_talent_auto_set($1, null, $2::uuid)', [slot, idem()]);
    if (!off || off.ok !== true || off.auto !== null || !off.envelope || !off.envelope.talents || off.envelope.talents.auto !== null) {
      bad.push('RCO-SETTING off answered ' + JSON.stringify(off && { ok: off.ok, error: off.error, auto: off.auto, env: off.envelope && off.envelope.talents && off.envelope.talents.auto }));
    }
    const spent5 = (await build(db, uid, slot)).spent;
    await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level(8) where user_id = $1 and slot = $2', [uid, slot]);
    if ((await build(db, uid, slot)).spent !== spent5) bad.push(`RCO-SETTING with the setting off a Level 5 -> 8 rise spent (${spent5} -> ${(await build(db, uid, slot)).spent})`);
    const key = idem();
    const on = await asClient(db, uid, 'select public.hr_talent_auto_set($1, $2, $3::uuid)', [slot, 'party', key]);
    const want = await points(db, 8);
    if (!on || on.ok !== true || on.auto !== 'party' || on.spent !== want - spent5 || !on.envelope || !on.envelope.talents
        || on.envelope.talents.spent !== want || on.envelope.talents.auto !== 'party') {
      bad.push('RCO-SETTING on answered ' + JSON.stringify(on && { ok: on.ok, error: on.error, auto: on.auto, spent: on.spent, env: on.envelope && on.envelope.talents && { spent: on.envelope.talents.spent, auto: on.envelope.talents.auto } }) + ` (want ${want - spent5} spent, ${want} in all)`);
    }
    const again = await asClient(db, uid, 'select public.hr_talent_auto_set($1, $2, $3::uuid)', [slot, 'party', key]);
    if (!again || again.ok !== true || 'envelope' in again || again.spent !== (on && on.spent)
        || Number(await one(db, "select count(*)::int from public.hero_talent_log where user_id = $1 and slot = $2 and verb = 'auto'", [uid, slot])) !== 2) {
      bad.push('RCO-SETTING the same key answered ' + JSON.stringify(again && { ok: again.ok, spent: again.spent, envelope: 'envelope' in again }));
    }
    return bad;
  });
}

const ARMS = { hunt: huntArm, spent: spentArm, standing: standingArm, setting: settingArm };

/* ── THE MUTANTS: each planted in the booted chain's live body, restored after its arm ─────────────────────── */
const MUTANTS = [
  /* the walk's own P1, judged by the hunt: without the load the bow lands nothing through either door (Ranged XP 0 -> 0) */
  { name: 'a server-made bow goes on empty (the walk\'s P1)', arm: 'hunt', want: /^RCO-HUNT the (browser closed|hunt viewed): the bow recruit landed no blow/,
    fn: 'public.hr_create_character__as(integer,text)', find: "   where l.kit = 'practice' and l.set_id = v_set and l.worn and l.loads is not null;", replace: '   where false;' },
  { name: 'the standing rule never spends', arm: 'standing', want: /^RCO-STANDING .*points spent/,
    fn: 'public.hr_talent_standing()', find: '  if v_to <= v_from then return null; end if;', replace: '  return null;' },
  { name: 'recruits arrive unspent (the rule skips a Level written whole)', arm: 'spent', want: /^RCO-SPENT hero [123]/,
    fn: 'public.hr_talent_standing()', find: '  if v_to <= v_from then return null; end if;', replace: '  if v_to <= v_from or v_to - v_from > 1 then return null; end if;' },
  { name: 'the rule walks the solo road', arm: 'spent', want: /^RCO-SPENT hero/,
    fn: 'public.hr_talent_walk(uuid,integer,text)', find: 'where x.discipline = disc and x.plan = p_plan order by x.seq', replace: "where x.discipline = disc and x.plan = 'solo' order by x.seq" },
  { name: 'the setting is never written', arm: 'setting', want: /^RCO-SETTING (off answered|with the setting off)/,
    fn: 'public.hr_talent_auto_set(integer,text,uuid)', find: '  update public.player_state set talent_auto = p_plan where', replace: '  update public.player_state set talent_auto = talent_auto where' },
  { name: 'the setting answers no envelope', arm: 'setting', want: /^RCO-SETTING (off|on) answered/,
    fn: 'public.hr_talent_auto_set(integer,text,uuid)', find: "  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));", replace: '  return v_r;' },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

async function main() {
  let db;
  try { db = await boot(); } catch (e) { console.error('recruit-company: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  const M = await H.loadEdge(ROOT);
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    let escaped = 0;
    for (const m of list) {
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split('\r').join('');
      if (def.split(m.find).length !== 2) { console.error(`HARNESS: ${m.fn} has no single ${JSON.stringify(m.find.slice(0, 70))}`); process.exit(2); }
      await db.exec(def.replace(m.find, () => m.replace));
      let got = [];
      try { got = await runArm(db, M, m.arm); } finally { await db.exec(def); }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 200)}`);
      if (process.env.RCO_ALL) for (const x of got) console.log('      ' + x);   // every finding of the arm, not just the first
    }
    console.log(escaped ? `recruit-company --mutate: ${escaped} ESCAPED` : `recruit-company --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const bad = [];
  for (const name of Object.keys(ARMS)) {
    if (only && name !== only) continue;
    const got = await runArm(db, M, name);
    console.log((got.length ? '✗ ' : '✓ ') + name);
    bad.push(...got);
  }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? `recruit-company: ${bad.length} FAILED`
    : 'recruit-company: green (the bow recruit shoots its first party hunt both ways; recruits arrive spent on their own roads; a Level a hunt lands spends its point both ways; the setting answers its envelope)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
