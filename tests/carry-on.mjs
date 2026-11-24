#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/carry-on.mjs — CARRY ON: ONE PRESS FOR THE ACCOUNT, NO HUNT WITHOUT ONE (lane/c-carry-on; build plan L07; Tyler RULED 27-1, 2026-11-20).
//   supabase/migrations/1024-carry-on.sql, src/session/carry-on-intents.js, src/shell/carry-on.js (the away card and the end card).
//
//   node tests/carry-on.mjs              the guard (the replayed chain, the real engine, the real client modules)
//   node tests/carry-on.mjs --arm=closed one arm
//   node tests/carry-on.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//   node tests/carry-on.mjs --world [--shots DIR]   MANUAL, a real Chromium on tools/qa/local-world.mjs (not a CI arm): two heroes hunt,
//                                        the tab closes, the tick ends both hunts, the player signs back in and presses Play; the
//                                        return card shows Carry on with the server's plan, ONE press sends both back, Storage first
//
// mutant-anchors: supabase/migrations/1024-carry-on.sql supabase/migrations/1025-own-heroes-apart.sql supabase/migrations/1051-company-start.sql src/shell/carry-on.js src/session/carry-on-intents.js src/core/upgrade-pick.js supabase/functions/hr-accrue/company-wear.js
// ci-step: db-replay | Carry on - one press for the account, both paths, the refusals, two presses one restart
// ci-run: node tests/carry-on.mjs
// ci-run: node tools/mutant-gate.mjs node tests/carry-on.mjs --mutate
//
//   CO-CLOSED  BOTH PATHS, THE BROWSER CLOSED: four heroes of one account on four different last plans (the Cellar alone; the Thicket on a
//              harder tier with an hours limit; a party of the account's own two on the Cellar) hunt with nobody watching; the world tick's
//              engine ends every hunt on stamina; time passes and NO hunt starts by itself. The account comes back: the plan names all four,
//              each topped up from Storage to its last loaded count (Storage drawn in slot order); ONE press puts all four back, each on its
//              own ground, tier, hours and party (one instance for the two), Storage less what they took, one journal row a line taken
//   CO-VIEWED  BOTH PATHS, THE HUNT VIEWED: the real client (CharacterSession, carry-on-intents.js, the end card's press in src/shell/carry-on.js)
//              over the replayed server: a leader of a party the account fills alone watches the hunt end; its card reads "Hunt again, both";
//              the press reads the plan and sends ONE hr_carry_on naming the two slots and the plan's gold; both heroes are read again and
//              each shows its new hunt open
//   CO-REFUSE  a hero that cannot go is named and the others still go: out of stamina (a party member: its leader still goes), a ground
//              outgrown, a hero in another account's party that is not hunting (party_leader); none of them is started or touched
//   CO-IDEM    two presses are one restart: the same key answers its receipt and starts nothing; a new key finds every hero busy
//              (nothing_to_carry_on); a gold figure that is not the plan's refuses quote_changed and moves nothing
//   CO-BLESS   a death that used the ONE Blessing (1063-level-costs.sql): the plan prices it at the hero's Level (the server's price,
//              hours of the wage), the press buys it back through hr_blessing_buy (journalled, the purse less exactly that), the hero blessed
//   CO-LOOT    the hero's loot plan runs first (a sell rule: the stack sold, the purse up) and the hero still goes
//   CO-WORDS   the plan in the player's words: a line a hero, Storage and the store said, a refusal named, no semicolon or dash
//   CO-APART   (1025-own-heroes-apart.sql) the account's own two in a party, browser closed: the leader runs out of stamina and the member,
//              its box unsaid, hunts on (its panel reads off); ticked, it goes home with its leader (party_member_left)
//   CO-APPLY   a second apply of 1051-company-start.sql (the press's owner now) moves no body and no baseline row
// THE COMPANY (lane/c-company FB-6, 1051-company-start.sql; designer D-2, D-11; S-14 a; RD-Q6 a: a company is 1 to 4 heroes):
//   CO-FOUR    FOUR HUNTS FROM ONE PRESS, THE HUNT VIEWED: the real client's away card (src/shell/carry-on.js followCarry, pressCarry) reads the
//              server's plan for the four of CO-CLOSED and sends ONE hr_carry_on; the four hunts open (the party's two as one instance) and
//              every hero's page shows its hunt (CO-CLOSED is the same four with the browser closed)
//   CO-ONE     A COMPANY OF ONE: a new account's one hero with no hunt has nothing to start; its plan's ground (hr_hero_plan_set, the step a
//              recruit or a "Change the plan" takes) is one press away, viewed (the client's press); the hunt runs with the browser closed
//              and ends; the next press goes again
//   CO-DOOR    THE PARTY DOOR WITH A HUNTING HERO: inviting an own hero that is hunting is not refused: it is planned in (pending, the
//              section names the partner, the plan says it joins); the hunt ends with the browser closed; the next press seats it and both
//              go as one party (one instance), and the plan is spent
//   CO-SETUP   EACH GROUND POINTS AT A SETUP: a pointer to a saved Setup is used by the next press (the session plays it, it is the Setup
//              in use); a pointer to no Setup is refused unknown_preset; a ground with no pointer goes on the first Setup
//   CO-DRESS   A TANK WITH NO ARMOR AT THE END CARD IS DRESSED AT THE NEXT START WITH NO PRESS (D-2): its hunt ends with the browser closed,
//              armor waits in its bag; the client's press carries the "Wear upgrades" picks (wearListOf) and the server puts them on through
//              hr_apply's gate; a piece another going own hero holds is passed through Storage; with the line off nothing is sent, the hero
//              goes in what it wears, and "Needs you" says better gear waits
//   CO-LINES   the company's lines, set once for all through the client: "If one falls" all come home ticks every hero's box, the rest
//              hunt on unsays them (S-14 a); "Wear upgrades" off reads off in every hero's section and in the plan
//   CO-REGEAR  "EQUIP UPGRADES AND GO BACK IN" (D-2 rule 8): two heroes out hunting, a Platebody found mid-hunt in one bag; the card offers
//              the one press for that hero only; the press leaves (the lap passes with the world tick between the page's reads), the server
//              dresses it (company_wear) and the Start sends it back to the same ground; the other hero's hunt never moves; the page sends
//              exactly leave, wear, plan, Start
//   CO-CONTROLS the three plan controls through the real client (src/session/company-intents.js): the plan's ground (the next Start goes
//              there), the ground's Setup (Go as starts on it; a Setup never saved is refused), the leader pinned and unpinned (the shield
//              leads again); each answer's envelope is taken with no second read; a forged slot never goes out
//   CO-LEAD    THE LEADER (D-2 2.2): hr_role_rank's order is src/data/hunt-roles.js ROLE_ORDER (one row decides both); at the press a
//              party of own heroes is led by its front hero (the shield), and a pinned leader holds; another account's party is never re-led
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { ownHeroSlots } from './_slots.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q } = H;
const ROOT = H.ROOT;
const FILE = '1051-company-start.sql';
const CELLAR = 'mill_cellar', THICKET = 'meadowbrook_thicket', FOOD = 'cooked_shrimp';
const [A, B] = H.UIDS;
const idem = () => crypto.randomUUID();
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
/* One call as a player: its rate counters cleared (a fixture presses faster than a hand), then the claim put back. */
async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await asUser(db, uid);
  try { return await one(db, sql, params); } finally { await asUser(db, ''); }
}
const plan = (db, uid, slots = null) => as(db, uid, 'select public.hr_carry_on_plan($1::int[])', [slots]);
const press = (db, uid, gold, slots = null, key = idem()) => as(db, uid, 'select public.hr_carry_on($1::int[], $2::bigint, $3::uuid)', [slots, gold, key]);
const openOf = async (db, uid) => (await q(db, `select slot, hunt_id, hours_limit, instance_id, preset from public.hunt_sessions
  where user_id = $1 and ended_at is null order by slot`, [uid]));
const bankOf = async (db, uid) => Number(await one(db, 'select coalesce((select qty from public.account_bank where user_id = $1 and item_id = $2), 0)::text', [uid, FOOD]));
const nowMs = async (db) => Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::text'));

/* An account's heroes in slots 0..n-1, named, idle, each with `food` of the food; slot 0 owns the account's extra slots as a buyer does. */
const NAMES = { [A]: ['Wren', 'Bryn', 'Tess', 'Dorn'], [B]: ['Marlow'] };
async function heroes(db, M, uid, n, food = 20) {
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name`, [uid, NAMES[uid][0]]);
  for (let s = 0; s < n; s++) {
    await asUser(db, uid);
    const c = await one(db, 'select public.hr_create_character($1)', [s]);
    if (!c || c.ok !== true) throw new Error('hero ' + s + ' refused: ' + JSON.stringify(c));
    if (s === 0 && n > 1) await ownHeroSlots((sql, p) => db.query(sql, p), uid, n - 1);
    /* a hero has a name before the game loads it (hr_load: needs_name) */
    const named = await as(db, uid, 'select public.hr_character_name_set($1, $2, $3::uuid)', [s, NAMES[uid][s], idem()]);
    if (!named || named.ok !== true) throw new Error('hero ' + s + ' name refused: ' + JSON.stringify(named));
  }
  await asUser(db, '');
  await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1", [uid]);
  await db.query('delete from public.player_inventory where user_id = $1', [uid]);
  for (let s = 0; s < n; s++) await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, $2, $3, $4)', [uid, s, FOOD, food]);
}
const levelTo = (db, M, uid, slot, lv) => db.query('update public.player_state set level_xp = $3 where user_id = $1 and slot = $2', [uid, slot, M.XP.charXpForLevel(lv)]);

/* Every open hunt of `uid` arrived `minutes` ago with `staminaMs` of stamina from then: the engine ends each on stamina. */
async function backdate(db, uid, minutes, staminaMs) {
  const t = `date_trunc('second', now() - make_interval(mins => ${Number(minutes)}))`;
  const sids = (await q(db, 'select id, slot, instance_id from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]));
  for (const s of sids) {
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [s.id]);
    await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [s.instance_id]);
    await db.query(`update public.player_state set stamina_ms = $3, stamina_at = ${t} where user_id = $1 and slot = $2`, [uid, s.slot, staminaMs]);
  }
}
/* THE WORLD TICK, browser closed: the engine settles every open hunt of `uid` to the database's now, slice by slice, until none is open. */
async function tickUntilHome(db, M, uid, o = {}) {
  const exec = H.makeExec(db);
  const toMs = o.toMs || await nowMs(db);
  for (let pass = 0; pass < 60; pass++) {
    const open = await openOf(db, uid);
    if (!open.length) return;
    /* `o.toMs`: settle every open hunt to that instant and stop there (a hunt with stamina left stays out) */
    if (o.toMs && pass > 0 && (await q(db, `select 1 from public.hunt_sessions h join public.hunt_instances i on i.id = h.instance_id
        where h.user_id = $1 and h.ended_at is null and i.settled_to < to_timestamp($2::double precision / 1000) - interval '2 seconds'`, [uid, toMs])).length === 0) return;
    for (const s of open) {
      /* the REAL grounds (grounds: {} = the engine's own catalogue): the settle harness's default is its fixture Cellar, whose wolves the
         replayed chain's bounds would rightly refuse */
      const p = await M.HS.readHuntSettle({ exec, user: uid, slot: s.slot, grounds: {}, atMs: toMs }, 'tick');
      if (p.answer) continue;
      const out = await M.HS.proposeHuntSettle(p, p.toMs, 0);
      if (!out.out.accrued) continue;
      const res = await M.HS.commitHuntSettle(exec, { ...out.commit, project: null });
      if (!res || res.ok !== true) throw new Error('the tick refused: ' + JSON.stringify(res).slice(0, 300));
    }
    await db.query(`delete from public.hr_rate_counters where bucket = 'apply'`);
  }
  throw new Error('HARNESS: the tick never brought every hero home: ' + JSON.stringify(await openOf(db, uid)));
}
/* Each phase's ended sessions an hour back: a fixture in one transaction enters every session at the same now(). */
const ageEnded = (db, uid) => db.query(`update public.hunt_sessions set entered_at = entered_at - interval '1 hour' where user_id = $1 and ended_at is not null`, [uid]);

/* THE FOUR LAST PLANS: slot 0 the Cellar alone; slot 1 the Thicket on its harder tier for 2 hours; slots 2 and 3 a party of the account's own. */
async function fourPlans(db, M) {
  await heroes(db, M, A, 4);
  await levelTo(db, M, A, 1, 6);
  const tiers = (await q(db, 'select tier from public.hr_ground_tiers where hunt_id = $1 order by tier', [THICKET])).map((r) => r.tier).filter((x) => x !== 'normal');
  const tier = tiers[0] || 'normal';
  if (tier !== 'normal') {
    const r = await as(db, A, 'select public.hr_hunt_tier_set(1, $1, $2, $3::uuid)', [THICKET, tier, idem()]);
    if (!r || r.ok !== true) throw new Error('tier refused: ' + JSON.stringify(r));
  }
  const bag = JSON.stringify([{ item: FOOD, qty: 20 }]);
  let r = await as(db, A, `select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)`, [CELLAR, bag, idem()]);
  if (!r || r.ok !== true) throw new Error('slot 0 enter refused: ' + JSON.stringify(r));
  r = await as(db, A, `select public.hr_hunt_enter(1, $1, $2::jsonb, 0, 2, $3::uuid)`, [THICKET, bag, idem()]);
  if (!r || r.ok !== true) throw new Error('slot 1 enter refused: ' + JSON.stringify(r));
  r = await as(db, A, 'select public.hr_hunt_party_invite_own(2, 3, $1::uuid)', [idem()]);
  if (!r || r.ok !== true) throw new Error('own invite refused: ' + JSON.stringify(r));
  r = await as(db, A, 'select public.hr_hunt_party_start(2, $1, $2::uuid)', [CELLAR, idem()]);
  if (!r || r.ok !== true) throw new Error('party start refused: ' + JSON.stringify(r));
  const party = await one(db, 'select public.hr_hunt_party_of($1::uuid, 2)', [A]);
  await backdate(db, A, 6, 60000);
  return { tier, party };
}
/* Hunted, home on their own, and each hero ate 15 of its 20. */
async function homeHungry(db, M) {
  const f = await fourPlans(db, M);
  await tickUntilHome(db, M, A);
  await db.query('update public.player_inventory set qty = 5 where user_id = $1 and item_id = $2', [A, FOOD]);
  await ageEnded(db, A);
  return f;
}

/* ── CO-CLOSED ─────────────────────────────────────────────────────────── */
async function closedArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    const { tier, party } = await homeHungry(db, M);
    const ends = await q(db, `select slot, end_reason from public.hunt_sessions where user_id = $1 order by slot, entered_at`, [A]);
    if (ends.length !== 4 || ends.some((e) => !['stamina', 'party_member_left'].includes(e.end_reason))) bad.push('CO-CLOSED HARNESS: the tick ended ' + JSON.stringify(ends));
    /* time passes with nobody here: the tick settles nothing, the after-hunt sweep starts no hunt */
    await db.query("select public.hr_hunt_after_sweep()").catch(() => null);
    if ((await openOf(db, A)).length) bad.push('CO-CLOSED a hunt started with no press: ' + JSON.stringify(await openOf(db, A)));
    await db.query('insert into public.account_bank (user_id, item_id, qty, updated_at) values ($1, $2, 40, now()) on conflict (user_id, item_id) do update set qty = 40', [A, FOOD]);
    const p = await plan(db, A);
    const go = (p && p.heroes || []).filter((h) => h.state === 'go');
    const took = (s) => ((p.heroes.find((h) => h.slot === s) || {}).storage || []).reduce((n, l) => n + l.qty, 0);
    if (!p || p.ok !== true || go.length !== 4 || p.go !== 4) bad.push('CO-CLOSED the plan reads ' + JSON.stringify(p));
    else if (took(0) !== 15 || took(1) !== 15 || took(2) !== 10 || took(3) !== 0) bad.push('CO-CLOSED Storage is not shared in slot order: ' + JSON.stringify(p.heroes.map((h) => [h.slot, h.storage, h.short])));
    if (await bankOf(db, A) !== 40) bad.push('CO-CLOSED the plan read moved Storage');
    const v = await press(db, A, p ? p.gold : 0);
    const open = await openOf(db, A);
    if (!v || v.ok !== true || v.went !== 4 || open.length !== 4) return bad.concat('CO-CLOSED the press answered ' + JSON.stringify(v) + ', open ' + JSON.stringify(open));
    const at = (s) => open.find((o) => o.slot === s);
    if (at(0).hunt_id !== CELLAR || at(0).hours_limit !== null) bad.push('CO-CLOSED slot 0 went on ' + JSON.stringify(at(0)));
    if (at(1).hunt_id !== THICKET || at(1).hours_limit !== 2) bad.push('CO-CLOSED slot 1 lost its ground or hours: ' + JSON.stringify(at(1)));
    const t1 = await one(db, 'select tier from public.hunt_instances where id = $1', [at(1).instance_id]);
    if ((t1 || 'normal') !== tier) bad.push('CO-CLOSED slot 1 went on tier ' + t1 + ', its last was ' + tier);
    if (at(2).instance_id !== party || at(3).instance_id !== party || at(2).hunt_id !== CELLAR) bad.push('CO-CLOSED the party did not go together: ' + JSON.stringify([at(2), at(3), party]));
    const loaded = await q(db, `select h.slot, b.qty_loaded::int as q from public.hunt_bag b join public.hunt_sessions h on h.id = b.session_id
                                 where h.user_id = $1 and h.ended_at is null and b.item_id = $2 order by h.slot`, [A, FOOD]);
    if (JSON.stringify(loaded.map((x) => [x.slot, x.q])) !== JSON.stringify([[0, 20], [1, 20], [2, 15], [3, 5]])) bad.push('CO-CLOSED the bags went out as ' + JSON.stringify(loaded));
    if (await bankOf(db, A) !== 0) bad.push('CO-CLOSED Storage kept ' + (await bankOf(db, A)) + ', want 0');
    const rows = Number(await one(db, `select count(*)::text from public.player_ledger where user_id = $1 and kind = 'bank' and intent = 'bank_withdraw' and item_id = $2`, [A, FOOD]));
    if (rows !== 3) bad.push('CO-CLOSED ' + rows + ' withdraw journal rows, want 3 (one a line taken)');
    return bad;
  });
}

/* ── CO-REFUSE ─────────────────────────────────────────────────────────── */
async function refuseArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await homeHungry(db, M);
    /* slot 3 (the party's member) out of stamina; slot 0 at the Cellar's exit Level */
    await db.query('update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = $1 and slot = 3', [A]);
    const exit = Number(await one(db, 'select ends_at_level::text from public.hr_hunt_grounds where hunt_id = $1', [CELLAR]));
    await levelTo(db, M, A, 0, exit);
    const p = await plan(db, A);
    const why = (s) => (p.heroes.find((h) => h.slot === s) || {}).why;
    if (why(3) !== 'no_stamina' || why(0) !== 'outgrown' || p.go !== 2) bad.push('CO-REFUSE the plan reads ' + JSON.stringify(p.heroes.map((h) => [h.slot, h.state, h.why])));
    const bank0 = await bankOf(db, A), inv0 = await q(db, 'select slot, qty from public.player_inventory where user_id = $1 and item_id = $2 order by slot', [A, FOOD]);
    const v = await press(db, A, p.gold);
    const open = (await openOf(db, A)).map((o) => o.slot);
    if (!v || v.went !== 2 || JSON.stringify(open) !== '[1,2]') bad.push('CO-REFUSE the press answered ' + JSON.stringify(v && v.heroes.map((h) => [h.slot, h.state, h.why])) + ', open ' + JSON.stringify(open));
    const inv1 = await q(db, 'select slot, qty from public.player_inventory where user_id = $1 and item_id = $2 and slot in (0, 3) order by slot', [A, FOOD]);
    if (JSON.stringify(inv1) !== JSON.stringify(inv0.filter((r) => r.slot === 0 || r.slot === 3))) bad.push('CO-REFUSE a hero that stayed had its bag touched: ' + JSON.stringify(inv1));
    if (await bankOf(db, A) !== bank0) bad.push('CO-REFUSE Storage moved with no Storage line planned');
    /* A REFUSAL AT THE DOOR ITSELF (the plan cannot see it: the play cap, lowered to 2 here): the two after the cap are named, their
       steps rolled back (the Storage they would have taken stays), the first two still go */
    await db.query("select public.hr_hunt_close(h.id, 'stamina', now(), true) from public.hunt_sessions h where h.user_id = $1 and h.ended_at is null", [A]);
    await ageEnded(db, A);
    await levelTo(db, M, A, 0, 1);
    await db.query('update public.player_state set stamina_ms = 3600000, stamina_at = now() where user_id = $1', [A]);
    await db.query('update public.player_inventory set qty = 5 where user_id = $1 and item_id = $2', [A, FOOD]);
    await db.query('insert into public.account_bank (user_id, item_id, qty, updated_at) values ($1, $2, 60, now()) on conflict (user_id, item_id) do update set qty = 60', [A, FOOD]);
    await db.query("update public.hr_hunt_limits set value = 2 where key = 'max_concurrent'");
    const p2 = await plan(db, A);
    const v2 = await press(db, A, p2.gold);
    const open2 = (await openOf(db, A)).map((o) => o.slot);
    const took = (v2 && v2.heroes || []).filter((h) => h.state === 'went').reduce((n, h) => n + (h.storage || []).reduce((a, l) => a + l.qty, 0), 0);
    const named = (v2 && v2.heroes || []).filter((h) => h.state === 'no').map((h) => [h.slot, h.why]);
    if (p2.go !== 4 || !v2 || v2.went !== 2 || open2.length !== 2 || JSON.stringify(named.map((x) => x[1])) !== '["too_many_playing","too_many_playing"]'
        || await bankOf(db, A) !== 60 - took) {
      bad.push('CO-REFUSE at the door: planned ' + (p2 && p2.go) + ', went ' + (v2 && v2.went) + ', open ' + JSON.stringify(open2) + ', named ' + JSON.stringify(named) + ', Storage ' + (await bankOf(db, A)) + ' (want ' + (60 - took) + ')');
    }
    await db.query("update public.hr_hunt_limits set value = 4 where key = 'max_concurrent'");
    await db.query("select public.hr_hunt_close(h.id, 'stamina', now(), true) from public.hunt_sessions h where h.user_id = $1 and h.ended_at is null", [A]);
    await ageEnded(db, A);
    /* another account's party, not hunting: its leader starts it, never this press */
    await heroes(db, M, B, 1);
    await db.query('update public.player_state set level_xp = 0 where user_id = $1 and slot = 0', [A]);
    let r = await as(db, B, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', [NAMES[A][0], idem()]);
    if (!r || r.ok !== true) return bad.concat('CO-REFUSE HARNESS: the invite answered ' + JSON.stringify(r));
    const inv = await one(db, 'select id from public.hunt_party_invites where to_user = $1 and to_slot = 0 order by created_at desc limit 1', [A]).catch(() => null);
    r = inv ? await as(db, A, 'select public.hr_hunt_party_accept(0, $1::uuid, $2::uuid)', [inv, idem()]) : null;
    if (!r || r.ok !== true) return bad.concat('CO-REFUSE HARNESS: the accept answered ' + JSON.stringify(r));
    const q2 = await plan(db, A, [0]);
    const h0 = q2.heroes[0] || {};
    if (h0.state !== 'no' || h0.why !== 'party_leader' || !h0.detail || h0.detail.leader !== await one(db, 'select public.hr_character_name($1::uuid, 0)', [B])) bad.push('CO-REFUSE a hero in another account\'s party reads ' + JSON.stringify(h0));
    return bad;
  });
}

/* ── CO-IDEM ───────────────────────────────────────────────────────────── */
async function idemArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await homeHungry(db, M);
    const p = await plan(db, A);
    let v = await press(db, A, p.gold + 1);
    if (!v || v.error !== 'quote_changed' || (await openOf(db, A)).length) bad.push('CO-IDEM another gold figure answered ' + JSON.stringify(v && v.error) + ' and opened ' + (await openOf(db, A)).length);
    const key = idem();
    v = await press(db, A, p.gold, null, key);
    const n = Number(await one(db, 'select count(*)::text from public.hunt_sessions where user_id = $1', [A]));
    /* rule 11: the press carries every hero it sent as it left them (`envelopes` by slot); the receipt a same key answers has none */
    const went = (v && Array.isArray(v.heroes) ? v.heroes : []).filter((h) => h.state === 'went').map((h) => String(h.slot));
    const envs = v && v.envelopes && typeof v.envelopes === 'object' ? v.envelopes : {};
    if (!went.length || !went.every((s) => envs[s] && envs[s].state && Number.isInteger(envs[s].version))) bad.push('CO-IDEM the press carried no envelope of a hero it sent: ' + JSON.stringify(Object.keys(envs)) + ' for ' + JSON.stringify(went));
    const receipt = v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'envelopes')) : v;
    const v2 = await press(db, A, p.gold, null, key);
    if (JSON.stringify(v2) !== JSON.stringify(receipt) || Number(await one(db, 'select count(*)::text from public.hunt_sessions where user_id = $1', [A])) !== n) bad.push('CO-IDEM the same key twice started more: ' + JSON.stringify(v2).slice(0, 200));
    const v3 = await press(db, A, p.gold);
    if (!v3 || v3.error !== 'nothing_to_carry_on' || Number(await one(db, 'select count(*)::text from public.hunt_sessions where user_id = $1', [A])) !== n) bad.push('CO-IDEM a second press answered ' + JSON.stringify(v3).slice(0, 200));
    /* ...and says why: each hero is out hunting (busy), never "refused" */
    else if (!v3.plan || v3.plan.heroes.length !== 4 || v3.plan.heroes.some((h) => h.state !== 'busy' || h.why !== 'hunting')) bad.push('CO-IDEM a second press reads the heroes as ' + JSON.stringify(v3.plan && v3.plan.heroes.map((h) => [h.slot, h.state, h.why])));
    return bad;
  });
}

/* ── CO-BLESS ──────────────────────────────────────────────────────────── */
async function blessArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await heroes(db, M, A, 1);
    const lv = 34;
    await levelTo(db, M, A, 0, lv);
    /* the ONE Blessing at the hero's Level, twice over: the first buy and the carry-on's buy back */
    const fund = 2 * Number(await one(db, 'select public.hr_blessing_price(1, $1)::text', [lv]));
    await db.query(`insert into public.account_wallet (user_id, gold) values ($1, $2) on conflict (user_id) do update set gold = excluded.gold`, [A, fund]);
    for (const tier of [1]) {
      const price = Number(await one(db, 'select public.hr_blessing_price($1, $2)::text', [tier, lv]));
      const r = await as(db, A, 'select public.hr_blessing_buy(0, $1, $2, $3::uuid)', [tier, price, idem()]);
      if (!r || r.ok !== true) return ['CO-BLESS HARNESS: the first Blessing ' + tier + ' answered ' + JSON.stringify(r)];
    }
    const r = await as(db, A, `select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)`, [THICKET, JSON.stringify([{ item: FOOD, qty: 20 }]), idem()]);
    if (!r || r.ok !== true) return ['CO-BLESS HARNESS: the enter answered ' + JSON.stringify(r)];
    const sid = r.session.id;
    /* the death the settle priced: its event, the Blessings it used (the settle's own body), the hunt ended died */
    await db.query(`insert into public.hunt_session_events (session_id, user_id, slot, type, at, data) values ($1, $2, 0, 'death', now(), '{}'::jsonb)`, [sid, A]);
    await db.query(`select public.hr_blessing_take($1::uuid, 0, $2::uuid, '[{"melee": 100}]'::jsonb, now())`, [A, sid]);
    await db.query(`select public.hr_hunt_close($1::uuid, 'died', now(), true)`, [sid]);
    await ageEnded(db, A);
    const purse0 = Number(await one(db, 'select public.hr_purse_of($1::uuid)::text', [A]));
    const want = [1].map(async (t) => Number(await one(db, 'select public.hr_blessing_price($1, $2)::text', [t, lv])));
    const prices = await Promise.all(want);
    const p = await plan(db, A);
    const h = p.heroes[0] || {};
    const sum = prices.reduce((a, b) => a + b, 0);
    if (h.state !== 'go' || p.gold !== sum || JSON.stringify((h.bless || []).map((b) => [b.tier, b.price])) !== JSON.stringify(prices.map((x, i) => [i + 1, x]))) bad.push('CO-BLESS the plan reads ' + JSON.stringify(p));
    if (!(sum > 0)) bad.push('CO-BLESS CONTROL: Blessings at Level ' + lv + ' are free (' + sum + ')');
    const buys = () => one(db, `select count(*)::int from public.player_ledger where user_id = $1 and kind = 'shop' and intent like 'blessing_buy:%' and gold < 0`, [A]);
    const rows0 = Number(await buys());
    const v = await press(db, A, p.gold);
    const held = (await q(db, 'select tier from public.player_blessings where user_id = $1 and slot = 0 order by tier', [A])).map((x) => Number(x.tier));
    const purse1 = Number(await one(db, 'select public.hr_purse_of($1::uuid)::text', [A]));
    const rows = Number(await buys()) - rows0;
    if (!v || v.went !== 1 || JSON.stringify(held) !== '[1]' || purse0 - purse1 !== sum || rows !== 1) {
      bad.push('CO-BLESS the press answered ' + JSON.stringify(v && v.heroes) + ', held ' + JSON.stringify(held) + ', purse ' + purse0 + ' -> ' + purse1 + ' (want -' + sum + '), ' + rows + ' journal rows');
    }
    return bad;
  });
}

/* ── CO-LOOT ───────────────────────────────────────────────────────────── */
async function lootArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await heroes(db, M, A, 1);
    const junk = await one(db, `select v.item_id from public.hr_hunt_vendor_value v where v.unit > 0 and public.hr_loot_plan_refusal(v.item_id, 'sell') is null
                                  and v.item_id <> $1 order by v.unit desc, v.item_id limit 1`, [FOOD]);
    if (!junk) return ['CO-LOOT HARNESS: no sellable item in the catalogue'];
    const unit = Number(await one(db, 'select unit::text from public.hr_hunt_vendor_value where item_id = $1', [junk]));
    const r = await as(db, A, `select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)`, [CELLAR, JSON.stringify([{ item: FOOD, qty: 20 }]), idem()]);
    if (!r || r.ok !== true) return ['CO-LOOT HARNESS: the enter answered ' + JSON.stringify(r)];
    await db.query(`select public.hr_hunt_close($1::uuid, 'stamina', now(), true)`, [r.session.id]);
    await ageEnded(db, A);
    await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 7)', [A, junk]);
    const lr = await as(db, A, 'select public.hr_loot_rule_set(0, $1, $2, $3::uuid)', [junk, 'sell', idem()]);
    if (!lr || lr.ok !== true) return ['CO-LOOT HARNESS: the rule answered ' + JSON.stringify(lr)];
    const p = await plan(db, A);
    if (!p.heroes[0] || p.heroes[0].loot !== true) bad.push('CO-LOOT the plan does not say the loot plan runs: ' + JSON.stringify(p.heroes[0]));
    const purse0 = Number(await one(db, 'select public.hr_purse_of($1::uuid)::text', [A]));
    const v = await press(db, A, p.gold);
    const left = Number(await one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)::text', [A, junk]));
    const purse1 = Number(await one(db, 'select public.hr_purse_of($1::uuid)::text', [A]));
    const h = v && v.heroes && v.heroes[0];
    if (!v || v.went !== 1 || left !== 0 || purse1 - purse0 !== 7 * unit || !h || !h.loot_done || h.loot_done.sold !== 7 * unit) {
      bad.push('CO-LOOT the press answered ' + JSON.stringify(h) + ', ' + left + ' left, purse +' + (purse1 - purse0) + ' (want +' + 7 * unit + ')');
    }
    return bad;
  });
}

/* ── CO-VIEWED: the real client over the replayed server ───────────────── */
const CAST = { p_slots: 'int[]', p_gold: 'bigint', p_idem: 'uuid', p_slot: 'int', p_wear: 'jsonb', p_line: 'text', p_value: 'text', p_hunt: 'text' };
/* The server link the client holds (src/session/server.js's answer shape), each RPC run as `uid` on the replayed chain. */
function bridge(db, uid) {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push([name, args]);
    if (!/^hr_[a-z0-9_]+$/.test(name)) throw new Error('bridge: ' + name);
    const keys = Object.keys(args || {});
    const sql = 'select public.' + name + '(' + keys.map((k, i) => k + ' => $' + (i + 1) + (CAST[k] ? '::' + CAST[k] : '')).join(', ') + ') as r';
    const vals = keys.map((k) => (CAST[k] === 'jsonb' && args[k] !== null && args[k] !== undefined ? JSON.stringify(args[k]) : args[k]));
    await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
    await asUser(db, uid);
    try { return { ok: true, status: 200, closed: false, body: (await q(db, sql, vals))[0].r }; }
    finally { await asUser(db, ''); }
  };
  /* THE ENGINE'S VERB the company's Start asks (hr-accrue company_wear): parsed as index.ts parses it and run as hr_engine, as the edge runs
     it; every other engine call answers as a dropped network (the session's settle is not this test's subject). */
  const accrue = async (body) => {
    calls.push(['hr-accrue', body]);
    const R = await imp('supabase/functions/hr-accrue/request.js');
    const intent = R.parseIntent(body);
    if (intent.verb !== 'company_wear') return { ok: false, status: 0, closed: false, error: 'network' };
    const CW = await imp('supabase/functions/hr-accrue/company-wear.js');
    await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
    const out = await CW.runCompanyWear({ exec: H.makeExec(db), user: uid, slot: intent.slot, intentId: intent.intentId, slots: intent.slots });
    return { ok: true, status: out.status, closed: false, body: out.body };
  };
  return { calls, rpc, accrue };
}
async function viewedArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    const C = await imp('src/session/character-session.js');
    const S = await imp('src/shell/carry-on.js');
    const HS = await imp('src/session/hunt-sections.js');
    await heroes(db, M, A, 2);
    let r = await as(db, A, 'select public.hr_hunt_party_invite_own(0, 1, $1::uuid)', [idem()]);
    if (!r || r.ok !== true) return ['CO-VIEWED HARNESS: the own invite answered ' + JSON.stringify(r)];
    r = await as(db, A, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [CELLAR, idem()]);
    if (!r || r.ok !== true) return ['CO-VIEWED HARNESS: the party start answered ' + JSON.stringify(r)];
    await backdate(db, A, 6, 60000);
    const server = bridge(db, A);
    const timers = { setTimer: () => 0, clearTimer: () => {} };
    const cs0 = new C.CharacterSession({ slot: 0, uid: A, server, ...timers, viewed: true });
    const cs1 = new C.CharacterSession({ slot: 1, uid: A, server, ...timers, viewed: false });
    const account = { server, character: (s) => [cs0, cs1][s] || null, characters: () => [cs0, cs1] };
    await cs0.load(); await cs1.load();
    if (!HS.huntOf(cs0) || HS.huntOf(cs0).ended) {
      const last = server.calls.filter(([n]) => n === 'hr_load').length;
      if (process.env.CO_DEBUG) { const ans = await server.rpc('hr_load', { p_slot: 0 }); console.error('DEBUG', cs0.lastVerdict, JSON.stringify(ans).slice(0, 600)); }
      return ['CO-VIEWED HARNESS: the viewed hero is not hunting: ' + JSON.stringify(HS.huntOf(cs0)) + ' (status ' + cs0.status + ', ' + last + ' reads, sections '
        + JSON.stringify(cs0.record ? Object.keys(cs0.record.data || {}).slice(0, 40) : null) + ', open ' + JSON.stringify(await openOf(db, A)) + ')'];
    }
    /* the hunt ends while the player watches (the hunter's own settle is the engine's; here the tick's), and the page reads it */
    await tickUntilHome(db, M, A);
    await ageEnded(db, A);
    await cs0.load(); await cs1.load();
    if (!HS.huntOf(cs0) || !HS.huntOf(cs0).ended) return ['CO-VIEWED HARNESS: the viewed hunt did not end: ' + JSON.stringify(HS.huntOf(cs0))];
    const ctx = { account, character: cs0, peers: () => [cs0, cs1] };
    const own = S.ownPartyOf(ctx, cs0);
    if (JSON.stringify(own) !== '[0,1]' || S.againAllWords(own ? own.length : 0) !== 'Hunt again, both') bad.push('CO-VIEWED the end card reads ' + JSON.stringify(own) + ' / ' + S.againAllWords(own ? own.length : 0));
    const sc = { pending: false, msg: '' };
    const before = server.calls.length;
    await S.againAll(ctx, cs0, sc, () => {}, own || [0, 1]);
    const sent = server.calls.slice(before).filter(([n]) => n === 'hr_carry_on');
    if (sent.length !== 1 || JSON.stringify(sent[0][1].p_slots) !== '[0,1]' || sent[0][1].p_gold !== 0 || Object.keys(sent[0][1]).sort().join() !== 'p_gold,p_idem,p_slots') bad.push('CO-VIEWED the press sent ' + JSON.stringify(sent));
    const h0 = HS.huntOf(cs0), h1 = HS.huntOf(cs1);
    if (!h0 || h0.ended || !h1 || h1.ended || h0.huntId !== CELLAR) bad.push('CO-VIEWED after the press the page shows ' + JSON.stringify([h0 && [h0.huntId, h0.ended], h1 && [h1.huntId, h1.ended]]) + ' (' + sc.msg + ')');
    if ((await openOf(db, A)).length !== 2) bad.push('CO-VIEWED the server holds ' + (await openOf(db, A)).length + ' open hunts, want 2');
    if (!/sent out/.test(sc.msg)) bad.push('CO-VIEWED the card says ' + JSON.stringify(sc.msg));
    return bad;
  });
}

/* ── CO-WORDS (pure) ───────────────────────────────────────────────────── */
async function wordsArm() {
  const bad = [];
  const S = await imp('src/shell/carry-on.js');
  const I = await imp('src/session/carry-on-intents.js');
  const p = I.planOf({ go: 1, gold: 450, heroes: [
    { slot: 0, state: 'go', name: 'Wren', hunt: THICKET, tier: 'normal', storage: [{ item: FOOD, qty: 40 }], short: [{ item: FOOD, qty: 5 }], bless: [{ tier: 1, price: 450 }], bless_gold: 450, loot: true, job: 'gather' },
    { slot: 1, state: 'no', name: 'Bryn', why: 'no_stamina' },
    { slot: 2, state: 'no', name: 'Tess', why: 'party_leader', detail: { leader: 'Marlow' } },
    { slot: 3, state: 'parked', name: 'Dorn' },
    { slot: 4, state: 'busy', name: 'Ash' },
    { slot: 9, state: 'go', name: 'Out of range' }] });
  const lines = S.carryLinesOf(p);
  const txt = lines.map((l) => l.text);
  if (lines.length !== 4 || p.heroes.length !== 5) bad.push('CO-WORDS a busy or out-of-range hero got a line: ' + JSON.stringify(txt));
  /* (lane/scale-early-grounds) the Thicket is on the Danger scale: its line says the Risk the hero goes back on (Steady, the default) */
  if (!/^Wren: Meadowbrook Thicket \(Steady\) · From Storage: 40 Cooked Shrimp · Short: 5 Cooked Shrimp \(store refills in the hunt\) · Bless again: 450 gp · Loot plan first · Stops gathering$/.test(txt[0] || '')) bad.push('CO-WORDS the go line reads ' + JSON.stringify(txt[0]));
  if (txt[1] !== 'Bryn: stays in town (no stamina left)' || txt[2] !== 'Tess: waiting for Marlow (party leader)' || txt[3] !== 'Dorn: unchanged') bad.push('CO-WORDS the other lines read ' + JSON.stringify(txt.slice(1)));
  if (txt.some((s) => /[;—–]/.test(s))) bad.push('CO-WORDS a line has a semicolon or a dash: ' + JSON.stringify(txt));
  /* a Danger scale ground has no tier (visual pass 2: "The Muster Barrows, Normal."): the line names the hero's Risk, Steady where none is read */
  const scale = I.planOf({ go: 2, gold: 0, heroes: [
    { slot: 0, state: 'go', name: 'Wren', hunt: 'muster_barrows', tier: 'normal' }, { slot: 1, state: 'go', name: 'Bryn', hunt: 'muster_barrows', tier: 'normal' }] });
  const onRisk = S.carryLinesOf(scale, (slot) => (slot === 0 ? 'bold' : null)).map((l) => l.text);
  if (onRisk[0] !== 'Wren: The Muster Barrows (Bold)' || onRisk[1] !== 'Bryn: The Muster Barrows (Steady)') bad.push('CO-WORDS a scale ground reads ' + JSON.stringify(onRisk));
  if (S.againAllWords(2) !== 'Hunt again, both' || S.againAllWords(3) !== 'Hunt again, all three' || S.againAllWords(4) !== 'Hunt again, all four') bad.push('CO-WORDS the end card reads ' + [2, 3, 4].map(S.againAllWords).join(' / '));
  if (I.scopeOf([1, 1]) !== undefined || I.scopeOf([6]) !== undefined || JSON.stringify(I.scopeOf([3, 0])) !== '[0,3]' || I.scopeOf(null) !== null) bad.push('CO-WORDS the scope rule lets a bad slot list through');
  return bad;
}

/* ── CO-APPLY ──────────────────────────────────────────────────────────── */
async function applyArm(db) {
  return H.inTx(db, async () => {
    const snap = async () => JSON.stringify([
      await q(db, `select p.oid::regprocedure::text as f, md5(replace(prosrc, chr(13), '')) as m, coalesce(p.proacl::text, '') as acl from pg_proc p
                    where p.proname in ('hr_carry_on', 'hr_carry_on_plan', 'hr_carry_on_plan_of', 'hr_carry_on_scope_ok', 'hr_carry_on_wear_ok', 'hr_company_line_set',
                      'hr_hero_plan_set', 'hr_ground_setup_set', 'hr_party_lead_set', 'hr_party_seat_own', 'hr_company_view', 'hr_company_seat_pending',
                      'hr_party_lead_of', 'hr_role_rank', 'hr_hero_ground_of', 'hr_tally_take_on_entry', 'hr_company_wear_apply') order by 1`),
      await q(db, `select proname, identity_args, grantee, note from public.hr_client_rpc_baseline
                    where proname like 'hr_carry_on%' or proname in ('hr_company_line_set', 'hr_hero_plan_set', 'hr_ground_setup_set', 'hr_party_lead_set') order by 1`)]);
    const before = await snap();
    if (!before.includes('hr_carry_on_plan_of') || !before.includes('hr_company_line_set')) return ['CO-APPLY CONTROL: the functions are not in the chain'];
    try { await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n')); }
    catch (e) { return ['CO-APPLY the second apply RAISED: ' + String(e.message).split('\n')[0]]; }
    return (await snap()) === before ? [] : ['CO-APPLY the second apply moved a body or a baseline row'];
  });
}

/* ── CO-APART (1025-own-heroes-apart.sql): the account's own heroes end together only if the player says so ── */
async function apartArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    const run = async (tick) => {
      await db.query('savepoint co_apart');
      try {
        await heroes(db, M, A, 2);
        let r = await as(db, A, 'select public.hr_hunt_party_invite_own(0, 1, $1::uuid)', [idem()]);
        if (!r || r.ok !== true) throw new Error('own invite: ' + JSON.stringify(r));
        if (tick) {
          r = await as(db, A, 'select public.hr_party_leave_together_set(1, true, $1::uuid)', [idem()]);
          if (!r || r.ok !== true) throw new Error('tick: ' + JSON.stringify(r));
        }
        r = await as(db, A, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [CELLAR, idem()]);
        if (!r || r.ok !== true) throw new Error('party start: ' + JSON.stringify(r));
        await backdate(db, A, 6, 60000);
        /* the member has stamina for the whole window, the leader for one minute of it */
        await db.query('update public.player_state set stamina_ms = 3600000 where user_id = $1 and slot = 1', [A]);
        const party = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [A]);
        const shown = await as(db, A, `select public.hr_state_of($1::uuid, 1)->'party'->'leave_together'`, [A]);
        /* the world tick, the browser closed, to now */
        await tickUntilHome(db, M, A, { toMs: await nowMs(db) });
        const ends = await q(db, 'select slot, end_reason from public.hunt_sessions where user_id = $1 order by slot', [A]);
        return { ends: ends.map((e) => [e.slot, e.end_reason]), shown, said: await one(db, 'select public.hr_party_leave_together_of($1::uuid, 1, $2::uuid)', [A, party]) };
      } finally { await db.query('rollback to savepoint co_apart'); }
    };
    const unsaid = await run(false);
    if (JSON.stringify(unsaid.ends) !== '[[0,"stamina"],[1,null]]' || unsaid.shown !== false || unsaid.said !== false) {
      bad.push('CO-APART unsaid, the account\'s own member ended ' + JSON.stringify(unsaid.ends) + ' (panel ' + unsaid.shown + '), want the leader home on stamina and the member hunting on');
    }
    const ticked = await run(true);
    if (JSON.stringify(ticked.ends) !== '[[0,"stamina"],[1,"party_member_left"]]' || ticked.shown !== true) {
      bad.push('CO-APART ticked, the member ended ' + JSON.stringify(ticked.ends) + ' (panel ' + ticked.shown + '), want it home with its leader');
    }
    return bad;
  });
}

/* ── THE COMPANY (1051-company-start.sql) ───────────────────────────────── */
/* An equip as the engine's equip intent lands it (hr_apply under hr_engine). */
async function equipVia(db, uid, slot, delta) {
  const v = await one(db, 'select version from public.player_state where user_id = $1 and slot = $2', [uid, slot]);
  const [row] = await H.makeExec(db)('select public.hr_apply($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text::jsonb) as r',
    [uid, slot, v, idem(), JSON.stringify({ equip: delta, journal: { kind: 'equip', intent: 'equip' } })]);
  return row && row.r;
}
/* The real client over the replayed server: one CharacterSession a hero, the account's read of them, each loaded. */
async function clientOf(db, uid, slots) {
  const C = await imp('src/session/character-session.js');
  const server = bridge(db, uid);
  const timers = { setTimer: () => 0, clearTimer: () => {} };
  const list = slots.map((s, i) => new C.CharacterSession({ slot: s, uid, server, ...timers, viewed: i === 0 }));
  const account = { server, character: (s) => list.find((c) => c.slot === s) || null, characters: () => list };
  for (const cs of list) await cs.load();
  return { server, list, account, ctx: { account, character: list[0], peers: () => list } };
}
/* The away card's plan as its controller reads it (followCarry), awaited. */
async function cardPlan(S, ctx) {
  S.followCarry(ctx, () => {}, true);
  for (let i = 0; i < 400 && !S.carryPlanFor(ctx); i++) await new Promise((r) => setImmediate(r));
  return S.carryPlanFor(ctx);
}
const homeAll = async (db, uid) => {
  await db.query("select public.hr_hunt_close(h.id, 'stamina', now(), true) from public.hunt_sessions h where h.user_id = $1 and h.ended_at is null", [uid]);
  await ageEnded(db, uid);
};

/* ── CO-FOUR: four hunts from one press, the hunt viewed (the away card's own press) ── */
async function fourArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    const { party } = await homeHungry(db, M);
    await db.query('insert into public.account_bank (user_id, item_id, qty, updated_at) values ($1, $2, 40, now()) on conflict (user_id, item_id) do update set qty = 40', [A, FOOD]);
    const S = await imp('src/shell/carry-on.js');
    const HS = await imp('src/session/hunt-sections.js');
    const { server, list, ctx } = await clientOf(db, A, [0, 1, 2, 3]);
    const plan = await cardPlan(S, ctx);
    if (!plan || plan.go !== 4) return ['CO-FOUR the card read the plan ' + JSON.stringify(plan)];
    const before = server.calls.length;
    let dismissed = null;
    await S.pressCarry(ctx, () => {}, (slots) => { dismissed = slots; });
    const sent = server.calls.slice(before).filter(([n]) => n === 'hr_carry_on');
    if (sent.length !== 1 || sent[0][1].p_slots !== null) bad.push('CO-FOUR the card sent ' + JSON.stringify(sent.map((c) => c[1])));
    const open = await openOf(db, A);
    const at = (s) => open.find((o) => o.slot === s) || {};
    if (open.length !== 4 || at(2).instance_id !== party || at(3).instance_id !== party) bad.push('CO-FOUR the server holds ' + JSON.stringify(open));
    const shown = list.map((cs) => { const h = HS.huntOf(cs); return h && !h.ended ? h.huntId : null; });
    if (shown.some((h) => !h)) bad.push('CO-FOUR a hero\'s page does not show its hunt: ' + JSON.stringify(shown));
    if (JSON.stringify((dismissed || []).slice().sort()) !== '[0,1,2,3]') bad.push('CO-FOUR the card read ' + JSON.stringify(dismissed) + ' as gone');
    return bad;
  });
}

/* ── CO-ONE: a company of one, viewed then closed ── */
async function oneArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await heroes(db, M, A, 1);
    const p0 = await plan(db, A);
    if (!p0 || p0.ok !== true || p0.go !== 0 || p0.heroes.length !== 0) bad.push('CO-ONE a hero with no hunt and no plan reads ' + JSON.stringify(p0));
    const r = await as(db, A, 'select public.hr_hero_plan_set(0, $1, $2::uuid)', [CELLAR, idem()]);
    if (!r || r.ok !== true) return bad.concat('CO-ONE the plan ground answered ' + JSON.stringify(r));
    /* VIEWED: the client's press on the plan the server reads */
    const I = await imp('src/session/carry-on-intents.js');
    const { list, account } = await clientOf(db, A, [0]);
    const read = await I.carryOnPlan(account, list[0], null);
    const h = read.ok && read.plan.heroes[0];
    if (!h || h.state !== 'go' || h.hunt !== CELLAR) bad.push('CO-ONE the client read the plan ' + JSON.stringify(read));
    const v = await I.carryOn(account, list[0], read.ok ? read.plan.gold : 0, null, [], null);
    const open = await openOf(db, A);
    if (!v || v.ok !== true || open.length !== 1 || open[0].hunt_id !== CELLAR || open[0].preset !== 0) bad.push('CO-ONE one press for a company of one answered ' + JSON.stringify(v) + ', open ' + JSON.stringify(open));
    /* CLOSED: the hunt runs with nobody watching and ends; the next press goes again, on what it did last */
    await backdate(db, A, 6, 60000);
    await tickUntilHome(db, M, A);
    await ageEnded(db, A);
    if ((await openOf(db, A)).length) bad.push('CO-ONE a hunt started with no press');
    const p1 = await plan(db, A);
    const v1 = await press(db, A, p1.gold);
    if (!v1 || v1.went !== 1 || (await openOf(db, A)).length !== 1) bad.push('CO-ONE the next press answered ' + JSON.stringify(v1));
    return bad;
  });
}

/* ── CO-DOOR: the party door with a hunting hero ── */
async function doorArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await heroes(db, M, A, 2);
    let r = await as(db, A, `select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)`, [CELLAR, JSON.stringify([{ item: FOOD, qty: 20 }]), idem()]);
    if (!r || r.ok !== true) return ['CO-DOOR HARNESS: the enter answered ' + JSON.stringify(r)];
    r = await as(db, A, 'select public.hr_hunt_party_invite_own(1, 0, $1::uuid)', [idem()]);
    if (!r || r.ok !== true || r.pending !== true) return bad.concat('CO-DOOR the door with a hunting hero answered ' + JSON.stringify(r));
    const sect = await one(db, `select public.hr_state_of($1::uuid, 0)->'company'`, [A]);
    if (!sect || !sect.joins || sect.joins.slot !== 1) bad.push('CO-DOOR the hunting hero\'s section reads ' + JSON.stringify(sect));
    const p = await plan(db, A);
    const h0 = p.heroes.find((h) => h.slot === 0) || {};
    if (h0.state !== 'busy' || h0.joins !== NAMES[A][1]) bad.push('CO-DOOR the plan reads ' + JSON.stringify(p.heroes));
    /* the hunt ends with the browser closed; the next press seats it beside its partner and both go as one party */
    await backdate(db, A, 6, 60000);
    await tickUntilHome(db, M, A);
    await ageEnded(db, A);
    const p2 = await plan(db, A);
    const v = await press(db, A, p2.gold);
    const open = await openOf(db, A);
    const party0 = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [A]), party1 = await one(db, 'select public.hr_hunt_party_of($1::uuid, 1)', [A]);
    if (!v || v.went !== 2 || open.length !== 2 || !open[0].instance_id || open[0].instance_id !== open[1].instance_id || !party0 || party0 !== party1) {
      bad.push('CO-DOOR the next press answered ' + JSON.stringify(v && v.heroes) + ', open ' + JSON.stringify(open) + ', parties ' + party0 + ' / ' + party1);
    }
    if (await one(db, 'select party_with from public.hero_plans where user_id = $1 and slot = 0', [A]) !== null) bad.push('CO-DOOR the plan\'s seat was not spent');
    return bad;
  });
}

/* ── CO-SETUP: each ground points at one of the hero's Setups ── */
async function setupArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await heroes(db, M, A, 1);
    for (const [n, name] of [[0, 'Plain'], [1, 'Cellar kit']]) {
      const r = await as(db, A, 'select public.hr_hunt_preset_save(0, $1, $2, $3::uuid)', [n, name, idem()]);
      if (!r || r.ok !== true) return ['CO-SETUP HARNESS: saving setup ' + n + ' answered ' + JSON.stringify(r)];
    }
    let r = await as(db, A, 'select public.hr_hunt_preset_apply(0, 0, $1::uuid)', [idem()]);
    r = await as(db, A, `select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)`, [CELLAR, JSON.stringify([{ item: FOOD, qty: 20 }]), idem()]);
    if (!r || r.ok !== true) return ['CO-SETUP HARNESS: the enter answered ' + JSON.stringify(r)];
    await homeAll(db, A);
    r = await as(db, A, 'select public.hr_ground_setup_set(0, $1, 1, $2::uuid)', [CELLAR, idem()]);
    if (!r || r.ok !== true) return ['CO-SETUP the pointer answered ' + JSON.stringify(r)];
    const p = await plan(db, A);
    if ((p.heroes[0] || {}).preset !== 1) bad.push('CO-SETUP the plan reads Setup ' + JSON.stringify(p.heroes[0]));
    const v = await press(db, A, p.gold);
    const open = await openOf(db, A);
    const inUse = Number(await one(db, 'select public.hr_hunt_active_set($1::uuid, 0)', [A]));
    if (!v || v.went !== 1 || !open[0] || open[0].preset !== 1 || inUse !== 1) bad.push('CO-SETUP the press answered ' + JSON.stringify(v && v.heroes) + ', session Setup ' + (open[0] || {}).preset + ', in use ' + inUse);
    r = await as(db, A, 'select public.hr_ground_setup_set(0, $1, 4, $2::uuid)', [CELLAR, idem()]);
    if (!r || r.error !== 'unknown_preset') bad.push('CO-SETUP a pointer to no Setup answered ' + JSON.stringify(r));
    /* a ground with no pointer goes on the first Setup */
    await homeAll(db, A);
    await db.query('delete from public.hunt_density where user_id = $1 and hunt_id = $2', [A, THICKET]);
    r = await as(db, A, 'select public.hr_hero_plan_set(0, $1, $2::uuid)', [THICKET, idem()]);
    await db.query('update public.hero_plans set updated_at = now() + interval \'1 second\' where user_id = $1 and slot = 0', [A]);
    const p2 = await plan(db, A);
    const h = p2.heroes[0] || {};
    if (h.hunt !== THICKET || h.preset !== 0) bad.push('CO-SETUP a ground with no pointer reads ' + JSON.stringify(h));
    return bad;
  });
}

/* ── CO-DRESS: a tank with no armor at the end card is dressed at the next Start with no press (D-2) ── */
/* THE SERVER PICKS (hr-accrue company_wear, src/core/upgrade-pick.js over hr_state_of; hr_company_wear_apply decides). Three runs:
     viewed    the hunt ended, the page read the bag (the Platebody in it) and pressed
     closed    the hunt ended with the browser closed and the Platebody dropped into the bag AFTER the page last read it: the page never saw
               it, and the server still puts it on (the pick is the server's, not the browser's)
     off       the company's line is off: nothing is sent, the tank goes in what it wears, and Needs you says better gear waits */
async function dressArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    const S = await imp('src/shell/carry-on.js');
    const N = await imp('src/shell/needs-you.js');
    const ARMOR = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
    const run = async (mode) => {
      await db.query('savepoint co_dress');
      try {
        await heroes(db, M, A, 2);
        /* the tank (the starting blade and shield) with no armor at all; its partner wears a Bronze Helm and holds a spare */
        await db.query('delete from public.player_equipment where user_id = $1 and equip_slot = any ($2::text[])', [A, ARMOR]);
        await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 1, $2, 2)', [A, 'bronze_helm']);
        let r = await equipVia(db, A, 1, { helmet: 'bronze_helm' });
        if (!r || r.ok !== true) throw new Error('HARNESS: the partner\'s helm answered ' + JSON.stringify(r));
        for (const s of [0, 1]) {
          r = await as(db, A, `select public.hr_hunt_enter($1, $2, $3::jsonb, 0, null, $4::uuid)`, [s, CELLAR, JSON.stringify([{ item: FOOD, qty: 20 }]), idem()]);
          if (!r || r.ok !== true) throw new Error('HARNESS: hero ' + s + ' could not enter: ' + JSON.stringify(r));
        }
        await backdate(db, A, 6, 60000);
        await tickUntilHome(db, M, A);
        await ageEnded(db, A);
        if (mode === 'off') { r = await as(db, A, `select public.hr_company_line_set('wear_upgrades', 'off', $1::uuid)`, [idem()]); if (!r || r.ok !== true) throw new Error('HARNESS: the line answered ' + JSON.stringify(r)); }
        const drop = () => db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 1) on conflict (user_id, slot, item_id) do update set qty = 1', [A, 'bronze_platebody']);
        if (mode !== 'closed') await drop();
        const { server, list, ctx } = await clientOf(db, A, [0, 1]);
        /* CLOSED: the Platebody lands after the page's last read; the browser holds a bag without it */
        if (mode === 'closed') await drop();
        const seen = Object.keys((list[0].read('inventory') || {}));
        const needs = N.rankNeeds(N.needsRowsOf({ peers: () => list, plan: null, wearOn: mode !== 'off' }));
        const plan = await cardPlan(S, ctx);
        if (!plan || plan.go !== 2 || plan.wearOn !== (mode !== 'off')) throw new Error('HARNESS: the card read the plan ' + JSON.stringify(plan));
        const calls0 = server.calls.length;
        await S.pressCarry(ctx, () => {}, () => {});
        const sent = server.calls.slice(calls0);
        const worn = Object.fromEntries((await q(db, 'select equip_slot, item_id from public.player_equipment where user_id = $1 and slot = 0', [A])).map((x) => [x.equip_slot, x.item_id]));
        const spare = Number(await one(db, `select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 1 and item_id = 'bronze_helm'), 0)::text`, [A]));
        const passed = Number(await one(db, `select count(*)::text from public.player_ledger where user_id = $1 and kind = 'bank' and item_id = 'bronze_helm'`, [A]));
        const wearSent = sent.filter(([n, a]) => n === 'hr-accrue' && a && a.verb === 'company_wear');
        const pressSent = sent.filter(([n]) => n === 'hr_carry_on');
        return { worn, spare, passed, needs, seen, wearSent, pressSent, open: (await openOf(db, A)).length, said: S.carryLinesOf(S.carryPlanFor(ctx) || { heroes: [] }) };
      } finally { await db.query('rollback to savepoint co_dress'); }
    };
    for (const mode of ['viewed', 'closed']) {
      const v = await run(mode);
      if (mode === 'closed' && v.seen.includes('bronze_platebody')) bad.push('CO-DRESS CONTROL: the page saw the Platebody it should not have');
      if (v.wearSent.length !== 1 || JSON.stringify(v.wearSent[0][1].slots) !== '[0,1]' || Object.keys(v.wearSent[0][1]).sort().join() !== 'intentId,slot,slots,verb') {
        bad.push('CO-DRESS ' + mode + ': the page sent ' + JSON.stringify(v.wearSent.map((c) => c[1])));
      }
      if (v.pressSent.length !== 1 || 'p_wear' in v.pressSent[0][1]) bad.push('CO-DRESS ' + mode + ': the press sent ' + JSON.stringify(v.pressSent.map((c) => c[1])));
      if (v.worn.body !== 'bronze_platebody' || v.worn.helmet !== 'bronze_helm' || v.open !== 2) bad.push('CO-DRESS ' + mode + ': the tank went out in ' + JSON.stringify(v.worn) + ' (' + v.open + ' hunts open)');
      if (v.spare !== 0 || v.passed !== 2) bad.push('CO-DRESS ' + mode + ': the spare helm was not passed through Storage: partner keeps ' + v.spare + ', ' + v.passed + ' bank rows');
      if (!v.said.some((l) => /Equipped .*Bronze Platebody/.test(l.text))) bad.push('CO-DRESS ' + mode + ': the card does not say what went on: ' + JSON.stringify(v.said.map((l) => l.text)));
      if (mode === 'viewed' && v.needs.shown.some((r) => r.kind === 'gear_choice')) bad.push('CO-DRESS with the line on, Needs you still asks: ' + JSON.stringify(v.needs.shown));
    }
    const off = await run('off');
    if (off.worn.body || off.worn.helmet || off.open !== 2 || off.wearSent.length) bad.push('CO-DRESS with the line off the tank went out in ' + JSON.stringify(off.worn) + ' after ' + off.wearSent.length + ' wear asks');
    if (!off.needs.shown.some((r) => r.kind === 'gear_choice' && /Better gear waiting: 1 hero$/.test(r.text))) bad.push('CO-DRESS with the line off Needs you reads ' + JSON.stringify(off.needs));
    return bad;
  });
}

/* ── CO-LINES: the company's lines, set once for all through the client ── */
async function linesArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    await heroes(db, M, A, 2);
    const I = await imp('src/session/carry-on-intents.js');
    const CS = await imp('src/session/company-sections.js');
    const { server, list, account } = await clientOf(db, A, [0, 1]);
    const boxes = async () => (await q(db, 'select party_leave_together as b from public.player_state where user_id = $1 order by slot', [A])).map((x) => x.b);
    let r = await I.setCompanyLine(account, list[0], 'if_one_falls', 'all_home');
    if (!r.ok || JSON.stringify(await boxes()) !== '[true,true]' || (CS.companyPlanOf(list[1]) || {}).falls !== 'all_home') bad.push('CO-LINES all come home: ' + JSON.stringify([r, await boxes(), CS.companyPlanOf(list[1])]));
    r = await I.setCompanyLine(account, list[1], 'if_one_falls', 'hunt_on');
    if (!r.ok || JSON.stringify(await boxes()) !== '[null,null]' || (CS.companyPlanOf(list[0]) || {}).falls !== 'hunt_on') bad.push('CO-LINES the rest hunt on: ' + JSON.stringify([r, await boxes(), CS.companyPlanOf(list[0])]));
    r = await I.setCompanyLine(account, list[0], 'wear_upgrades', 'off');
    const plan = await I.carryOnPlan(account, list[0], null);
    if (!r.ok || (CS.companyPlanOf(list[0]) || {}).wearOn !== false || (CS.companyPlanOf(list[1]) || {}).wearOn !== false || !plan.ok || plan.plan.wearOn !== false) {
      bad.push('CO-LINES wear upgrades off reads ' + JSON.stringify([CS.companyPlanOf(list[0]), plan.ok && plan.plan.wearOn]));
    }
    const n = server.calls.length;
    r = await I.setCompanyLine(account, list[0], 'wear_upgrades', 'maybe');
    if (r.ok || r.error !== 'bad_intent' || server.calls.length !== n) bad.push('CO-LINES a bad value went out: ' + JSON.stringify(r));
    return bad;
  });
}

/* ── CO-LEAD: the leader is the front hero by ROLE_ORDER, and a pin holds ── */
async function leadArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    const { ROLE_ORDER } = await imp('src/data/hunt-roles.js');
    const ranks = await q(db, 'select r, public.hr_role_rank(r) as k from unnest($1::text[]) r', [ROLE_ORDER]);
    if (ranks.some((x, i) => Number(x.k) !== i + 1) || Number(await one(db, `select public.hr_role_rank('no_such_role')`)) !== 99) bad.push('CO-LEAD hr_role_rank is not ROLE_ORDER: ' + JSON.stringify(ranks));
    await heroes(db, M, A, 2);
    /* the starting kit is a blade and a shield (a tank): hero 0 puts its shield away (a blade alone), hero 1 keeps its (the tank); hero 0 opens
       the party, so it leads before the press */
    const e = await equipVia(db, A, 0, { shield: null });
    if (!e || e.ok !== true) return ['CO-LEAD HARNESS: the shield off answered ' + JSON.stringify(e)];
    let r = await as(db, A, 'select public.hr_hunt_party_invite_own(0, 1, $1::uuid)', [idem()]);
    if (!r || r.ok !== true) return ['CO-LEAD HARNESS: the own invite answered ' + JSON.stringify(r)];
    const party = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [A]);
    const roles = await q(db, 'select m.slot, public.hr_party_seat_role($1::uuid, m.user_id, m.slot) as role from public.hunt_party_members m where m.party_id = $1 order by m.slot', [party]);
    if (JSON.stringify(roles.map((x) => x.role)) !== '["melee_dps","tank"]') return ['CO-LEAD HARNESS: the roles are ' + JSON.stringify(roles)];
    r = await as(db, A, 'select public.hr_hero_plan_set(0, $1, $2::uuid)', [CELLAR, idem()]);
    if (!r || r.ok !== true) return ['CO-LEAD HARNESS: the plan ground answered ' + JSON.stringify(r)];
    const leader = async () => Number(await one(db, 'select leader_slot from public.hunt_parties where id = $1', [party]));
    let p = await plan(db, A);
    let v = await press(db, A, p.gold);
    if (!v || v.went !== 2 || await leader() !== 1) bad.push('CO-LEAD at the press the party is led by slot ' + await leader() + ' (want the shield, 1): ' + JSON.stringify(v && v.heroes));
    /* pinned: hero 0 leads and holds through the next press */
    await homeAll(db, A);
    r = await as(db, A, 'select public.hr_party_lead_set(1, 0, $1::uuid)', [idem()]);
    const sect = await one(db, `select public.hr_state_of($1::uuid, 1)->'company'`, [A]);
    if (!r || r.ok !== true || await leader() !== 0 || !sect || sect.lead_pinned !== true) bad.push('CO-LEAD the pin answered ' + JSON.stringify(r) + ', leader ' + await leader() + ', section ' + JSON.stringify(sect));
    p = await plan(db, A);
    v = await press(db, A, p.gold);
    if (!v || v.went !== 2 || await leader() !== 0) bad.push('CO-LEAD a pinned leader did not hold the press: slot ' + await leader());
    r = await as(db, A, 'select public.hr_party_lead_set(0, null, $1::uuid)', [idem()]);
    if (!r || r.error !== 'party_hunting') bad.push('CO-LEAD a running party was re-led: ' + JSON.stringify(r));
    await homeAll(db, A);
    r = await as(db, A, 'select public.hr_party_lead_set(0, null, $1::uuid)', [idem()]);
    if (!r || r.ok !== true || await leader() !== 1) bad.push('CO-LEAD unpinned, the front hero did not lead again: ' + JSON.stringify(r) + ', slot ' + await leader());
    /* another account's party is never re-led */
    await heroes(db, M, B, 1);
    r = await as(db, A, 'select public.hr_hunt_party_leave(1, $1::uuid)', [idem()]);
    r = await as(db, B, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', [NAMES[A][1], idem()]);
    const inv = await one(db, 'select id from public.hunt_party_invites where to_user = $1 and to_slot = 1 order by created_at desc limit 1', [A]).catch(() => null);
    r = inv ? await as(db, A, 'select public.hr_hunt_party_accept(1, $1::uuid, $2::uuid)', [inv, idem()]) : null;
    if (!r || r.ok !== true) return bad.concat('CO-LEAD HARNESS: joining another account\'s party answered ' + JSON.stringify(r));
    r = await as(db, A, 'select public.hr_party_lead_set(1, 1, $1::uuid)', [idem()]);
    if (!r || r.error !== 'not_own_party') bad.push('CO-LEAD another account\'s party answered ' + JSON.stringify(r));
    return bad;
  });
}

/* ── CO-REGEAR: "Equip upgrades and go back in" (D-2 rule 8), the visiting player's one press ── */
async function regearArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    const I = await imp('src/session/carry-on-intents.js');
    const N = await imp('src/shell/needs-you.js');
    await heroes(db, M, A, 2);
    await db.query(`delete from public.player_equipment where user_id = $1 and slot = 0 and equip_slot = 'body'`, [A]);
    for (const s of [0, 1]) {
      const r = await as(db, A, `select public.hr_hunt_enter($1, $2, $3::jsonb, 0, null, $4::uuid)`, [s, CELLAR, JSON.stringify([{ item: FOOD, qty: 20 }]), idem()]);
      if (!r || r.ok !== true) return ['CO-REGEAR HARNESS: hero ' + s + ' could not enter: ' + JSON.stringify(r)];
    }
    /* two minutes in, an hour of stamina left each: both still hunting after the world tick */
    await backdate(db, A, 2, 3600000);
    await tickUntilHome(db, M, A, { toMs: await nowMs(db) });
    const first = await openOf(db, A);
    if (first.length !== 2) return ['CO-REGEAR HARNESS: the heroes are not out: ' + JSON.stringify(first)];
    /* a Bronze Platebody found mid-hunt waits in hero 0's bag: nothing changes inside the hunt (D-2 rule 7) */
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'bronze_platebody', 1) on conflict (user_id, slot, item_id) do update set qty = 1`, [A]);
    const { server, list, account } = await clientOf(db, A, [0, 1]);
    const needs = N.rankNeeds(N.needsRowsOf({ peers: () => list, plan: null, wearOn: true }));
    const row = needs.shown.find((r) => r.kind === 'gear_choice');
    if (!row || row.go !== 'regear' || !Array.isArray(row.slots) || !row.slots.includes(0) || row.label !== 'Equip upgrades and go back in') return bad.concat('CO-REGEAR the card offers ' + JSON.stringify(needs.shown));
    /* THE PRESS: hero 0 leaves; its hunt ends at the next lap with the browser's pause between reads (here the world tick, the lap passed);
       then the server dresses it and the Start sends it back. Hero 1 is never touched. */
    const calls0 = server.calls.length;
    const pause = async () => {
      await db.query(`update public.hunt_sessions set leave_at = least(leave_at, now() - interval '1 second') where user_id = $1 and ended_at is null and leave_at is not null`, [A]);
      await tickUntilHome(db, M, A, { toMs: await nowMs(db) });
    };
    /* the press for hero 0 alone (the row names every hero out hunting with plain upgrades; one is enough to prove the other stays) */
    const r = await I.regear(account, list[0], [0], { tries: 5, pause });
    /* the intents only: the session's own reads (hr_load, the engine's hello with no verb) are not the press's */
    const sent = server.calls.slice(calls0).filter(([n, a]) => n !== 'hr_load' && !(n === 'hr-accrue' && !a.verb)).map(([n, a]) => (n === 'hr-accrue' ? 'edge:' + a.verb : n));
    const open = await openOf(db, A);
    const s0 = open.find((o) => o.slot === 0), s1 = open.find((o) => o.slot === 1);
    const body = await one(db, `select item_id from public.player_equipment where user_id = $1 and slot = 0 and equip_slot = 'body'`, [A]);
    const ended0 = await one(db, `select end_reason from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is not null order by entered_at desc limit 1`, [A]);
    if (!r || r.ok !== true || r.plan.went !== 1) bad.push('CO-REGEAR the press answered ' + JSON.stringify(r));
    if (!s0 || s0.hunt_id !== CELLAR || s0.instance_id === (first.find((o) => o.slot === 0) || {}).instance_id || ended0 !== 'left') bad.push('CO-REGEAR hero 0 is out on ' + JSON.stringify(s0) + ' after a hunt ended ' + ended0);
    if (body !== 'bronze_platebody') bad.push('CO-REGEAR hero 0 went back in ' + body + ', not the Bronze Platebody');
    if (!s1 || s1.instance_id !== (first.find((o) => o.slot === 1) || {}).instance_id) bad.push('CO-REGEAR hero 1\'s hunt moved: ' + JSON.stringify(s1));
    if (JSON.stringify(sent) !== '["hr_hunt_leave","hr_carry_on_plan","edge:company_wear","hr_carry_on"]') bad.push('CO-REGEAR the page sent ' + JSON.stringify(sent));
    return bad;
  });
}

/* ── CO-CONTROLS: the three plan controls through the real client (company-intents.js), each answered by the hero's envelope ── */
async function controlsArm(db, M) {
  return H.inTx(db, async () => {
    const bad = [];
    const C = await imp('src/session/company-intents.js');
    const CS = await imp('src/session/company-sections.js');
    const P = await imp('src/shell/windows/company-pane.js');
    await heroes(db, M, A, 2);
    let r = await as(db, A, `select public.hr_hunt_preset_save(0, 1, 'Cellar kit', $1::uuid)`, [idem()]);
    if (!r || r.ok !== true) return ['CO-CONTROLS HARNESS: the Setup answered ' + JSON.stringify(r)];
    const { server, list, account } = await clientOf(db, A, [0, 1]);
    const loads = () => server.calls.filter(([n]) => n === 'hr_load').length;
    /* THE PLAN'S GROUND: the next Start goes there; the hero's own envelope says so with no second read */
    let l0 = loads();
    r = await C.setHeroPlan(account, list[0], CELLAR);
    if (!r.ok || (CS.companyPlanOf(list[0]) || {}).planHunt !== CELLAR || loads() !== l0) bad.push('CO-CONTROLS the plan ground: ' + JSON.stringify([r, CS.companyPlanOf(list[0]), loads() - l0]));
    const p = await plan(db, A, [0]);
    if ((p.heroes[0] || {}).hunt !== CELLAR || (p.heroes[0] || {}).state !== 'go') bad.push('CO-CONTROLS the Start would not go to the plan ground: ' + JSON.stringify(p.heroes));
    /* THE GROUND'S SETUP: Go as starts on it; a Setup the hero never saved is refused and nothing moves */
    l0 = loads();
    r = await C.setGroundSetup(account, list[0], CELLAR, 1);
    if (!r.ok || CS.groundSetupOf(list[0], CELLAR) !== 1 || P.goAsOf(list[0], CELLAR) !== 1 || loads() !== l0) bad.push('CO-CONTROLS the ground\'s Setup: ' + JSON.stringify([r, CS.groundSetupOf(list[0], CELLAR)]));
    r = await C.setGroundSetup(account, list[0], CELLAR, 4);
    if (r.ok || r.error !== 'unknown_preset' || CS.groundSetupOf(list[0], CELLAR) !== 1) bad.push('CO-CONTROLS a pointer to no Setup answered ' + JSON.stringify(r));
    /* THE LEADER: hero 0 a blade alone, hero 1 the shield; pinned, unpinned; a forged slot never goes out */
    const e = await equipVia(db, A, 0, { shield: null });
    if (!e || e.ok !== true) return bad.concat('CO-CONTROLS HARNESS: the shield off answered ' + JSON.stringify(e));
    r = await as(db, A, 'select public.hr_hunt_party_invite_own(1, 0, $1::uuid)', [idem()]);
    if (!r || r.ok !== true) return bad.concat('CO-CONTROLS HARNESS: the own invite answered ' + JSON.stringify(r));
    for (const cs of list) await cs.load();
    const party = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [A]);
    const leader = async () => Number(await one(db, 'select leader_slot from public.hunt_parties where id = $1', [party]));
    r = await C.setPartyLead(account, list[0], 0);
    if (!r.ok || await leader() !== 0 || !(CS.companyPlanOf(list[1]) || {}).leadPinned) bad.push('CO-CONTROLS the pin: ' + JSON.stringify([r, await leader(), CS.companyPlanOf(list[1])]));
    r = await C.setPartyLead(account, list[1], null);
    if (!r.ok || await leader() !== 1 || (CS.companyPlanOf(list[0]) || {}).leadPinned) bad.push('CO-CONTROLS unpinned, the shield does not lead: ' + JSON.stringify([r, await leader()]));
    const n = server.calls.length;
    r = await C.setPartyLead(account, list[0], 9);
    if (r.ok || r.error !== 'bad_intent' || server.calls.length !== n) bad.push('CO-CONTROLS a forged slot went out: ' + JSON.stringify(r));
    return bad;
  });
}

const ARMS = { closed: closedArm, viewed: viewedArm, refuse: refuseArm, idem: idemArm, bless: blessArm, loot: lootArm, apart: apartArm, words: wordsArm, apply: applyArm,
  four: fourArm, one: oneArm, door: doorArm, setup: setupArm, dress: dressArm, lines: linesArm, lead: leadArm, regear: regearArm, controls: controlsArm };

/* ── THE MUTANTS: a defect planted in the booted chain's live body (SQL) or a served copy of a client module ── */
const FN = { plan: 'public.hr_carry_on_plan_of(uuid,integer[])', press: 'public.hr_carry_on(integer[],bigint,uuid)', wear: 'public.hr_company_wear_apply(uuid,integer[],jsonb,uuid)' };
const MUTANTS = [
  { name: 'Storage is read whole for every hero (not shared in order)', arm: 'closed', want: /^CO-CLOSED (Storage is not shared|the bags went|Storage kept|the press)/, fn: FN.plan,
    find: 'v_avail := greatest(0, v_b.stored - coalesce((v_drawn->>v_b.item_id)::bigint, 0));', replace: 'v_avail := greatest(0, v_b.stored);' },
  { name: 'no Storage first: the bag goes as it is', arm: 'closed', want: /^CO-CLOSED (the bags went|Storage kept|\d+ withdraw)/, fn: FN.press,
    find: "        if public.hr_bank_move_stack(v_uid, v_slot, v_x->>'item', (v_x->>'qty')::bigint, 'withdraw', v_cap) is null then", replace: '        if false then' },
  { name: 'the party goes where the hero last was, not where its party is', arm: 'closed', want: /^CO-CLOSED/, fn: FN.plan,
    find: '      v_hunt := coalesce(v_p.hunt_id, public.hr_hero_ground_of(v_p.leader_user, v_p.leader_slot), v_hunt,', replace: "      v_hunt := coalesce('meadowbrook_thicket', v_hunt," },
  { name: 'the hours limit is dropped', arm: 'closed', want: /^CO-CLOSED slot 1 lost/, fn: FN.plan,
    find: '    v_hours := case when v_s.id is not null and v_s.hunt_id = v_hunt then v_s.hours_limit end;', replace: '    v_hours := null;' },
  { name: 'a refused hero stops the press for all', arm: 'refuse', want: /^(CO-REFUSE at the door|THREW)/, fn: FN.press,
    find: "    exception when sqlstate 'HRC70' then", replace: "    exception when sqlstate 'HRC79' then" },
  { name: 'the door\'s predicate is not asked', arm: 'refuse', want: /^CO-REFUSE the plan/, fn: FN.plan,
    find: "      v_r := public.hr_hunt_enter_check(p_uid, v_st.slot, v_hunt, '[]'::jsonb, v_preset, v_hours);", replace: '      v_r := null;' },
  { name: 'another account\'s idle party is joined', arm: 'refuse', want: /^CO-REFUSE a hero in another account/, fn: FN.plan,
    find: '      if v_p.leader_user <> p_uid\n', replace: '      if false and v_p.leader_user <> p_uid\n' },
  { name: 'the key is never kept', arm: 'idem', want: /^CO-IDEM the same key/, fn: FN.press,
    find: "    values (v_uid, p_idem, coalesce((select min((h->>'slot')::int) from jsonb_array_elements(v_out) h), 0), c_verb, v_r, now())",
    replace: "    values (v_uid, gen_random_uuid(), coalesce((select min((h->>'slot')::int) from jsonb_array_elements(v_out) h), 0), c_verb, v_r, now())" },
  { name: 'the gold figure is not checked', arm: 'idem', want: /^CO-IDEM another gold figure/, fn: FN.press,
    find: "  if (v_plan->>'gold')::bigint is distinct from p_gold then", replace: '  if false then' },
  { name: 'a busy hero is started again', arm: 'idem', want: /^CO-IDEM (a second press|the same key)/, fn: FN.plan,
    find: '    if v_s.id is not null and v_s.ended_at is null then\n', replace: '    if false then\n' },
  { name: 'Blessings are not bought back', arm: 'bless', want: /^CO-BLESS/, fn: FN.press,
    find: "      for v_x in select e from jsonb_array_elements(coalesce(v_h->'bless', '[]'::jsonb)) e order by (e->>'tier')::int loop",
    replace: "      for v_x in select e from jsonb_array_elements('[]'::jsonb) e order by (e->>'tier')::int loop" },
  { name: 'the loot plan never runs', arm: 'loot', want: /^CO-LOOT the press/, fn: FN.press,
    find: "      if coalesce((v_h->>'loot')::boolean, false) then", replace: '      if false then' },
  { name: 'an unsaid box reads on in the account\'s own party (the old default)', arm: 'apart', want: /^CO-APART unsaid/, fn: 'public.hr_party_leave_together_of(uuid,integer,uuid)',
    find: 'exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.user_id <> p_user))', replace: 'true)' },
  { name: 'a said box is not read', arm: 'apart', want: /^CO-APART ticked/, fn: 'public.hr_party_leave_together_of(uuid,integer,uuid)',
    find: 'select coalesce((select ps.party_leave_together from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot),',
    replace: 'select coalesce(null::boolean,' },
  { name: 'the end card sends no slots (the whole account)', arm: 'viewed', want: /^CO-VIEWED the press sent/, src: ['src/shell/carry-on.js',
    'await runIntent(sc, repaint, () => carryOn(ctx.account, cs, plan.gold, slots, jobs, wearFor(ctx, plan))', 'await runIntent(sc, repaint, () => carryOn(ctx.account, cs, plan.gold, null, jobs, wearFor(ctx, plan))'] },
  /* since lane/c-next-reds (rule 11) the press takes each touched hero's carried envelope, reading only when one is missing */
  { name: 'the press updates no hero (takes no envelope, reads none)', arm: 'viewed', want: /^CO-VIEWED after the press/, src: ['src/session/carry-on-intents.js',
    '    await Promise.all(touched.map((o) => o.load(isObj(envs[o.slot]) ? envs[o.slot] : null)));', '    void touched; void envs;'] },
  { name: 'a refusal reads as the hero\'s state', arm: 'words', want: /^CO-WORDS the other lines/, src: ['src/shell/carry-on.js',
    "        : t('away.carry_no', { name, why: lower(refusalWords(h.why || 'refused')) }) });", "        : t('away.carry_parked', { name }) });"] },
  /* THE COMPANY (1051-company-start.sql) */
  { name: 'the card presses for the hero on screen only', arm: 'four', want: /^CO-FOUR/, src: ['src/shell/carry-on.js',
    '  try { r = await carryOn(ctx.account, cs, plan.gold, null, jobs, wear); }', '  try { r = await carryOn(ctx.account, cs, plan.gold, [cs.slot], jobs, wear); }'] },
  { name: 'the plan\'s ground is never read', arm: 'one', want: /^CO-ONE/, fn: FN.plan,
    find: '    v_hunt := case when v_planned then v_st.plan_hunt else v_s.hunt_id end;', replace: '    v_hunt := v_s.hunt_id;' },
  { name: 'the door refuses a hunting hero again', arm: 'door', want: /^CO-DOOR the door/, fn: 'public.hr_party_seat_own(uuid,integer,integer)',
    find: '  if v_them.id is not null or (v_pid is null and v_self.id is not null) then',
    replace: "  if v_them.id is not null then return jsonb_build_object('ok', false, 'error', 'member_hunting'); end if;\n  if false then" },
  { name: 'the planned seat is never taken', arm: 'door', want: /^CO-DOOR the next press/, fn: 'public.hr_company_seat_pending(uuid,integer)',
    find: '  perform public.hr_party_seat_into(v_target, p_uid, p_slot);', replace: "  return 'waits';" },
  { name: 'the ground\'s Setup is not read', arm: 'setup', want: /^CO-SETUP the (plan|press)/, fn: FN.plan,
    find: '    v_preset := coalesce(public.hr_ground_setup_of(p_uid, v_st.slot, v_hunt), 0);', replace: '    v_preset := 0;' },
  { name: 'the server puts nothing on', arm: 'dress', want: /^CO-DRESS (viewed|closed): the tank went out/, fn: FN.wear,
    find: "    if v_kind = 'idle' and v_s.id is null then v_free := v_free || v_slot; end if;", replace: '    null;' },
  { name: 'the press dresses with the line off', arm: 'dress', want: /^CO-DRESS with the line off/, src: ['src/shell/carry-on.js',
    "const wearFor = (ctx, plan) => (plan.wearOn ? plan.heroes.filter((h) => h.state === 'go').map((h) => h.slot) : null);",
    "const wearFor = (ctx, plan) => plan.heroes.filter((h) => h.state === 'go').map((h) => h.slot);"] },
  { name: 'nothing passes between heroes', arm: 'dress', want: /^CO-DRESS (viewed|closed): the (tank|spare)/, src: ['src/core/upgrade-pick.js',
    '      const donor = own ? null : [...left].find(([s2, m]) => s2 !== slot && (m.get(id) || 0) > 0);', '      const donor = null;'] },
  { name: 'the server picks from the browser\'s view (an empty bag)', arm: 'dress', want: /^CO-DRESS (viewed|closed): the tank went out/, src: ['supabase/functions/hr-accrue/company-wear.js',
    '    .map((h) => ({ slot: h.slot, input: wearInputOf((k) => h.env[k]) })));', "    .map((h) => ({ slot: h.slot, input: wearInputOf((k) => (k === 'inventory' ? {} : h.env[k])) })));"] },
  { name: '"If one falls" writes no box', arm: 'lines', want: /^CO-LINES all come home/, fn: 'public.hr_company_line_set(text,text,uuid)',
    find: "      update public.player_state set party_leave_together = case when p_value = 'all_home' then true end,", replace: '      update public.player_state set party_leave_together = party_leave_together,' },
  { name: 'the leader is not worked out at the press', arm: 'lead', want: /^CO-LEAD at the press/, fn: FN.press,
    find: '    update public.hunt_parties set leader_user = v_l.user_id, leader_slot = v_l.slot\n     where id = v_id and (leader_user, leader_slot) is distinct from (v_l.user_id, v_l.slot);\n    -- A PARTY',
    replace: '    -- A PARTY' },
  { name: 'a pin is not held', arm: 'lead', want: /^CO-LEAD (the pin|a pinned)/, fn: 'public.hr_party_lead_of(uuid)',
    find: '  if v_p.lead_pin_user is not null and exists', replace: '  if false and exists' },
  { name: 'the role order drifts from ROLE_ORDER', arm: 'lead', want: /^CO-LEAD hr_role_rank/, fn: 'public.hr_role_rank(text)',
    find: "array['tank', 'melee_dps', 'ranger', 'mage', 'healer']", replace: "array['melee_dps', 'tank', 'ranger', 'mage', 'healer']" },
  { name: 'the visiting press never leaves (the hunt is never over)', arm: 'regear', want: /^CO-REGEAR/, src: ['src/session/carry-on-intents.js',
    '    const r = await h.leaveHunt();', '    const r = { ok: true };'] },
  { name: 'the visiting press goes back in undressed', arm: 'regear', want: /^CO-REGEAR (hero 0 went back|the page sent)/, src: ['src/session/carry-on-intents.js',
    '  return carryOn(account, cs, read.plan.gold, scope, [], scope);', '  return carryOn(account, cs, read.plan.gold, scope, [], null);'] },
  { name: 'the plan ground is not kept', arm: 'controls', want: /^CO-CONTROLS the plan ground/, fn: 'public.hr_hero_plan_set(integer,text,uuid)',
    find: '  insert into public.hero_plans as hp (user_id, slot, hunt_id, updated_at) values (v_uid, p_slot, p_hunt, now())\n    on conflict (user_id, slot) do update set hunt_id = excluded.hunt_id, updated_at = now();\n',
    replace: '' },
  { name: 'a ground points at a Setup the hero never saved', arm: 'controls', want: /^CO-CONTROLS a pointer to no Setup/, fn: 'public.hr_ground_setup_set(integer,text,integer,uuid)',
    find: '  if p_preset <> 0 and not exists', replace: '  if false and not exists' },
  { name: 'another account\'s party is re-led', arm: 'lead', want: /^CO-LEAD another account/, fn: 'public.hr_party_lead_set(integer,integer,uuid)',
    find: '  if not public.hr_party_is_own(v_party, v_uid) then', replace: '  if false then' },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

/* A client mutant: the module's text, planted in place for the arm and put back after (the file is restored even on a throw). */
async function withSrc([file, find, replace], fn) {
  const { writeFileSync } = await import('node:fs');
  const path = join(ROOT, file);
  const was = readFileSync(path, 'utf8');
  const lf = was.replace(/\r\n/g, '\n');
  if (lf.split(find).length !== 2) throw new Error(`HARNESS: ${file} has no single ${JSON.stringify(find.slice(0, 70))}`);
  writeFileSync(path, lf.replace(find, () => replace));
  try { return await fn(); } finally { writeFileSync(path, was); }
}

/* ── --world: the return card in a real Chromium (tools/qa/local-world.mjs); manual, never a CI arm ── */
async function worldRun(shots) {
  const { openWorld } = await import(pathToFileURL(join(ROOT, 'tools/qa/local-world.mjs')).href);
  const world = await openWorld({ tickMs: false });
  const q = async (sql, p) => (await world.db.query(sql, p)).rows;
  const bad = [];
  try {
    const p = await world.play({ account: 'carry', viewport: { width: 1440, height: 900 }, shots });
    await p.createHero('Wren');
    const uid = (await q('select id from auth.users where email = $1', [p.email]))[0].id;
    /* a second hero, as a buyer of the slot holds it (a fixture: the slot price is not this test's subject) */
    await ownHeroSlots((sql, a) => world.db.query(sql, a), uid, 1);
    const asU = async (sql) => { await q(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]); try { return (await q(sql))[0]; } finally { await q(`select set_config('request.jwt.claim.sub', '', false)`); } };
    await asU('select public.hr_create_character(1) r');
    await asU(`select public.hr_character_name_set(1, 'Bryn', gen_random_uuid()) r`);
    await q(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 1`, [uid]);
    await p.enterHunt(CELLAR);
    const e1 = await asU(`select public.hr_hunt_enter(1, '${CELLAR}', '[{"item":"${FOOD}","qty":20}]'::jsonb, 0, null, gen_random_uuid()) r`);
    if (!e1 || !e1.r || e1.r.ok !== true) return ['CO-WORLD HARNESS: the second hero could not enter: ' + JSON.stringify(e1)];
    /* two minutes of stamina each from the hunt's own start; Storage holds food */
    await q(`update public.player_state ps set stamina_ms = 120000, stamina_at = h.hunt_from from public.hunt_sessions h
              where ps.user_id = $1 and h.user_id = ps.user_id and h.slot = ps.slot and h.ended_at is null`, [uid]);
    await q(`insert into public.account_bank (user_id, item_id, qty, updated_at) values ($1, $2, 60, now()) on conflict (user_id, item_id) do update set qty = 60`, [uid, FOOD]);
    await p.page.waitForTimeout(6000);   // the page stamps the hunt it shows (away-recap.js) before the tab goes
    await p.close();
    await world.wait(30, { away: true });
    const ends = await q('select end_reason from public.hunt_sessions where user_id = $1 order by slot', [uid]);
    if (ends.length !== 2 || ends.some((x) => x.end_reason !== 'stamina')) bad.push('CO-WORLD HARNESS: the tick ended ' + JSON.stringify(ends));
    await q('update public.player_inventory set qty = 4 where user_id = $1 and item_id = $2', [uid, FOOD]);
    const p2 = await world.play({ account: 'carry', viewport: { width: 1440, height: 900 }, shots });
    if (await p2.page.$('[data-app="play"][data-slot="0"]')) await p2.page.click('[data-app="play"][data-slot="0"]');
    const live = await p2.page.waitForSelector('[data-hs-win="away"] .haway-carry:not([hidden]) [data-hs-act="away-carry"]:not([disabled])', { timeout: 90000 }).then(() => true, () => false);
    const shot = await p2.shot('return-card');
    const text = await p2.page.evaluate(() => document.querySelector('.haway-carry')?.innerText.replace(/\s+/g, ' ') || '');
    console.log('  return card: ' + text + (shot ? '  (' + shot + ')' : ''));
    if (!live || !/Wren: Mill Cellar, Normal\. From Storage: 16 Cooked Shrimp\./.test(text) || !/Bryn: Mill Cellar, Normal\. From Storage: 16 Cooked Shrimp\./.test(text)) bad.push('CO-WORLD the card reads ' + JSON.stringify(text));
    else {
      await p2.page.click('[data-hs-win="away"] [data-hs-act="away-carry"]');
      await p2.page.waitForFunction(() => !document.querySelector('[data-hs-win="away"]'), null, { timeout: 60000 }).catch(() => {});
      await p2.shot('after-press');
      const open = await q('select slot, hunt_id from public.hunt_sessions where user_id = $1 and ended_at is null order by slot', [uid]);
      const bank = await q('select qty from public.account_bank where user_id = $1 and item_id = $2', [uid, FOOD]);
      if (open.length !== 2 || open.some((o) => o.hunt_id !== CELLAR) || Number((bank[0] || {}).qty) !== 28) bad.push('CO-WORLD after the press: open ' + JSON.stringify(open) + ', Storage ' + JSON.stringify(bank));
    }
    if (p2.errors.length || p2.offsite.length) bad.push('CO-WORLD the page logged ' + JSON.stringify(p2.errors.slice(0, 3)) + ' offsite ' + JSON.stringify(p2.offsite.slice(0, 3)));
  } finally { await world.close(); }
  return bad;
}

async function main() {
  if (process.argv.includes('--world')) {
    const i = process.argv.indexOf('--shots');
    const bad = await worldRun(i > 0 ? process.argv[i + 1] : null).catch((e) => ['CO-WORLD THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]);
    for (const b of bad) console.log('FAIL  ' + b);
    console.log(bad.length ? `carry-on --world: ${bad.length} FAILED` : 'carry-on --world: green (the return card, one press, both heroes back, Storage first)');
    process.exit(bad.length ? 1 : 0);
  }
  const M = await H.loadEdge(ROOT);
  const mutate = process.argv.includes('--mutate') || process.argv.includes('--selftest');
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  let db = null;
  if (mutate || !only || only !== 'words') {
    try { ({ db } = await bootReplay()); await H.pinDice(db); await db.query('grant usage on sequence public.hr_test_uuid_seq to hr_engine'); }
    catch (e) { console.error('carry-on: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  }
  if (mutate) {
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    let escaped = 0;
    for (const m of list) {
      let got = [];
      if (m.fn) {
        const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split('\r').join('');
        if (def.split(m.find).length !== 2) { console.error(`HARNESS: ${m.fn} has no single ${JSON.stringify(m.find.slice(0, 70))}`); process.exit(2); }
        await db.exec(def.replace(m.find, () => m.replace));
        try { got = await runArm(db, M, m.arm); } finally { await db.exec(def); }
      } else {
        /* a fresh import per plant: the module cache would keep the unplanted copy */
        got = await withSrc(m.src, async () => {
          const { spawnSync } = await import('node:child_process');
          const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'carry-on.mjs'), '--arm=' + m.arm], { encoding: 'utf8', cwd: ROOT, maxBuffer: 1 << 26 });
          return String(r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL  ')).map((l) => l.slice(6));
        });
      }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 160)}`);
    }
    console.log(escaped ? `carry-on --mutate: ${escaped} ESCAPED` : `carry-on --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const bad = [], ran = [];
  for (const name of Object.keys(ARMS)) {
    if (only && name !== only) continue;
    ran.push(name);
    const got = await runArm(db, M, name);
    console.log((got.length ? '✗ ' : '✓ ') + name);
    bad.push(...got);
  }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? `carry-on: ${bad.length} FAILED` : 'carry-on: green (' + ran.join(', ') + ')');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
