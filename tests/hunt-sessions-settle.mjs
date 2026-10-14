#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-sessions-settle.mjs — HUNT SESSIONS, THE SETTLE (lane C2,
// ruling HR-2026-10-14 §2 / §4 / §5 row C2).
//
//   node tests/hunt-sessions-settle.mjs            the guard
//   node tests/hunt-sessions-settle.mjs --mutate   every planted defect must be CAUGHT
//
// The settle is ./supabase/functions/hr-accrue/hunt-settle.js (read → engine →
// hr_hunt_apply). The DB arms drive THOSE exported pieces against the real
// replayed chain (PGlite, as the hr_engine role), choosing each window's end
// the way the world tick's clock would — so the guard grades the bytes that
// deploy, not a transcription.
//
// ARMS
//   TICK-2     (a) source: nothing under hr-accrue/** reaches the away receipt,
//              the attended kill read or hr_credit_kills; the hunt settle
//              (hunt-settle.js, hunt-seed.js, accrual.js accrueCombat) carries
//              no `away` key, no ctx.away read and no presence/cap/horizon read.
//              (b) behaviour: a hunt window is byte-identical under every
//              presence- and away-era input (accrued_to, active_since, the
//              offline cap, the live combat-XP watermark, Auto-Eat, stance,
//              stop rules, the Retreat counter, the attended ledger).
//   SEED       the per-swing seed is HMAC-SHA256 keyed by the session's 64-bit
//              secret: equal to an independent reference, distinct per swing /
//              session / secret, and two secrets whose TEXT collides under the
//              32-bit FNV-1a mix it replaced still seed differently; an
//              unseeded swing is refused.
//   MAXHP      a hitpoints level-up never LOWERS max HP (the FX-4 root cause).
//   FENCE      a hunter is never priced by the old path: the engine answers
//              hunt_open; the database refuses a bare combat accrue row.
//   TICK-1     N world-tick windows (90 s) == ONE span, through the database:
//              tally, bag, the character (gold, xp, inventory, hp, max hp,
//              buffs, recovery, fight), the session clock — with heals and a
//              Feast fired by the action bar.
//   BOTH-PATH  a death with a client connected (settles at irregular instants,
//              as hunt_settle / a collect cut them) writes the SAME rows as a
//              death with none (tick windows only): the death rows, the fall
//              and end events, the tally, the bag, the end.
//   TALLY      tally = Σ ledger rows stamped with the session (coins, kills,
//              deaths, xp, loot, supplies); bag loaded = left + used.
//   PRESS      a press lands at the first swing boundary at or after it and
//              never before; with nothing in the bag it is refused bag_empty.
//   END        a bag that runs dry ends the hunt heals_out at its boundary, the
//              pointer goes idle and the `ended` event is journalled.
//   TICK-0     cron to edge: hr_tick_cron_run leases the due session and queues
//              its own `hunts` body; the shipped runTick settles from that body
//              over the real driver — one stamped accrue row, the clock
//              advanced, a malformed selector dropped, a selector naming
//              another session skipped by name.
//   BESTIARY   the hunt settle prices hr_bestiary_of: 20,000 counted kills of
//              every spawn pay differently from none (the read is not dropped
//              or mis-folded).
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } from './world-tick-token-shims.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const FN = join('supabase', 'functions', 'hr-accrue');

async function loadEdge(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return {
    HS: await import(u(join(FN, 'hunt-settle.js'))),
    AC: await import(u(join(FN, 'accrual.js'))),
    SEED: await import(u(join(FN, 'hunt-seed.js'))),
    TR: await import(u(join(FN, 'tick-reads.js'))),
    IN: await import(u(join(FN, 'intents.js'))),
    TK: await import(u(join(FN, 'tick.js'))),
    HUNTS: await import(u('src/data/hunts.js')),
    AR: await import(u('src/core/action-rules.js')),
    XP: await import(u('src/core/xp.js')),
    RS: await import(u('src/data/rule-subjects.js')),
    MONSTERS: (await import(u('src/data/monsters.js'))).MONSTERS,
    ITEMS: (await import(u('src/data/items.js'))).ITEMS,
    root,
  };
}

const canon = (v) => {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
};
const firstDiff = (a, b) => {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return `at char ${i}: …${a.slice(Math.max(0, i - 80), i + 80)}… vs …${b.slice(Math.max(0, i - 80), i + 80)}…`;
};
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

// ═══════════════════════════════════════════════════════════════════════
// ENGINE ARMS (no database)
// ═══════════════════════════════════════════════════════════════════════
const T0 = Date.UTC(2026, 9, 14, 12, 0, 0);
const SID = '00000000-0000-4000-8000-0000000c2e01';
const SECRET = '-4611686018427387904';

function huntInput(M, extra) {
  const hs = M.AR.newHuntSession({ id: SID, huntFromMs: T0, nextSwingAtMs: T0,
    bag: { cooked_shrimp: { loaded: 20, left: 20 }, hunters_feast: { loaded: 2, left: 2 } },
    slots: [M.RS.DEFAULT_PRESET.slots[0],
      { item: 'hunters_feast', on: true, conditions: [{ subject: 'buff_missing:drop_rate' }] }],
    fallsLimit: 6 });
  return Object.assign({
    userId: '00000000-0000-4000-8000-0000000c2eaa', slot: 0, nowMs: T0 + 900000,
    activeKind: 'combat', activeId: 'mill_cellar', activeSinceMs: T0 - 1000, accruedToMs: T0,
    hp: 10, maxHp: 10, gold: 0, skills: { attack: 1200, strength: 1200, defense: 1200, hitpoints: 1200 },
    inventory: {}, equipment: {}, fight: {}, recoveringUntilMs: 0, consecFalls: 0,
    deathsTodayBefore: 0, deathsLifetimeBefore: 0, buffs: [],
    vigour: { budget_min: 720, spent_min: 0, day_key: '2026-10-14' },
    monsters: M.MONSTERS, items: M.ITEMS, huntSession: hs,
    huntWindow: { fromMs: T0, toMs: T0 + 900000 }, huntSecret: SECRET,
  }, extra || {});
}

const ENGINE_ARMS = {
  'TICK-2': async (M) => {
    const problems = [];
    // (a) THE SOURCE.
    const dir = join(M.root, FN);
    const gone = /away-receipt|withAwayReceipt|receiptRescue|last_away_receipt|hr_attended_kills|hr_credit_kills|ATTENDED_MAX_FIDELITY|normaliseAttended|attendedKillCap/;
    for (const f of readdirSync(dir).filter((n) => /\.(js|ts)$/.test(n))) {
      const code = stripComments(readFileSync(join(dir, f), 'utf8'));
      const m = code.match(gone);
      if (m) problems.push(`${f} still names \`${m[0]}\` in code (the away receipt / attended credit are deleted, ruling §3)`);
    }
    const presence = /\baway\b|presence|last_seen|capMs|cap_ms|hr_accrue_cap_ms|hr_offline_cap_ms|return_anchor|horizon/;
    for (const f of ['hunt-settle.js', 'hunt-seed.js']) {
      const code = stripComments(readFileSync(join(dir, f), 'utf8'));
      const m = code.match(presence);
      if (m) problems.push(`${f} reads \`${m[0]}\` — the hunt settle may not consult presence, a cap or ctx.away (TICK-2)`);
    }
    const acc = stripComments(readFileSync(join(dir, 'accrual.js'), 'utf8'));
    const i = acc.indexOf('function accrueCombat(');
    const j = acc.indexOf('\nfunction ', i + 10);
    const body = i >= 0 ? acc.slice(i, j > i ? j : undefined) : '';
    if (!body) problems.push('accrual.js has no accrueCombat — the combat body moved; re-point TICK-2');
    for (const re of [/\baway\s*:/, /ctx\.away/, /\.away\b/, /inp\.capMs/, /presence|last_seen|horizon|return_anchor/]) {
      const m = body.match(re);
      if (m) problems.push(`accrueCombat (the combat body) contains \`${m[0]}\` — combat reads no ctx.away and no presence (TICK-2)`);
    }
    // (b) THE BEHAVIOUR: presence / away-era inputs are inert for a session.
    const base = M.AC.computeAccrual(huntInput(M));
    if (!base.accrued || !base.hunt) problems.push(`the reference hunt window did not settle (${base.reason})`);
    const variants = {
      accruedToMs: T0 - 7200000, activeSinceMs: T0 - 86400000, capMs: 1, combatXpAccruedToMs: T0 + 600000,
      autoEatEnabled: true, autoEatPct: 90, autoEatFood: 'cooked_shrimp', huntStance: 'careful',
      huntStop: { rules: [{ rule: 'hours', value: 1 }] }, consecFalls: 5,
      attended: { ok: true, from: new Date(T0).toISOString(), to: new Date(T0 + 900000).toISOString(), total: 999, kills: { rat: 999 } },
      lastSeenAt: new Date(T0).toISOString(), caller: 'collect',
    };
    for (const [k, v] of Object.entries(variants)) {
      const out = M.AC.computeAccrual(huntInput(M, { [k]: v }));
      const a = canon({ d: base.delta, h: base.hunt, b: base.huntBuffs });
      const b = canon({ d: out.delta, h: out.hunt, b: out.huntBuffs });
      if (a !== b) problems.push(`the hunt window moved when \`${k}\` changed — a session read a presence/away-era input ${firstDiff(a, b)}`);
    }
    return problems;
  },

  SEED: async (M) => {
    const problems = [];
    const f = M.SEED.swingSeederFor(SECRET, SID);
    const ref = (secret, sid, i) => {
      const d = createHmac('sha256', 'hearthrise:hunt-swing:v1:' + secret).update(`hunt:${sid}:${i}`, 'utf8').digest();
      return d.readUInt32BE(0);
    };
    for (const i of [0, 1, 2, 77, 123456]) {
      if (f(i) !== ref(SECRET, SID, i)) problems.push(`swing ${i}: the seeder is not HMAC-SHA256(secret, 'hunt:<session>:<i>')`);
    }
    if (f(5) !== M.SEED.swingSeederFor(SECRET, SID)(5)) problems.push('the seeder is not deterministic');
    const seen = new Set(Array.from({ length: 256 }, (_, i) => f(i)));
    if (seen.size < 250) problems.push(`256 swings produced only ${seen.size} distinct seeds`);
    if (M.SEED.swingSeederFor(SECRET, SID)(9) === M.SEED.swingSeederFor(SECRET, '00000000-0000-4000-8000-0000000c2e02')(9)) {
      problems.push('two sessions share a swing seed');
    }
    /* KEY WIDTH. Two secrets whose TEXT collides under 32-bit FNV-1a (the mix
       this replaced) must still seed differently: a keyed MAC carries all 64
       bits; a 32-bit text hash carries 32, so once collided, every swing of
       both sessions is the same roll. Found by a birthday search over 64-bit
       decimal secrets (deterministic from a fixed start). */
    const fnv = (s) => { let h = 0x811c9dc5; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); } return h >>> 0; };
    const seenFnv = new Map(); let pair = null;
    for (let n = 1n; !pair && n < 400000n; n++) {
      const s = String(1000000000000000000n + 7919n * n);   // 19 digits: inside hr_seed's signed 64-bit range
      const h = fnv(s);
      if (seenFnv.has(h)) pair = [seenFnv.get(h), s]; else seenFnv.set(h, s);
    }
    if (!pair) problems.push('CONTROL: no FNV-1a text collision found — the key-width arm proves nothing');
    else {
      const a = M.SEED.swingSeederFor(pair[0], SID); const b = M.SEED.swingSeederFor(pair[1], SID);
      let same = 0; for (let i = 0; i < 16; i++) if (a(i) === b(i)) same++;
      if (same > 1) problems.push(`two 64-bit secrets that collide as 32-bit text seed ${same}/16 swings identically — the mix is not keyed by the whole secret`);
    }
    for (const bad of ['', 'abc', '1.5', null]) {
      let threw = false; try { M.SEED.swingSeederFor(bad, SID); } catch { threw = true; }
      if (!threw) problems.push(`a malformed secret ${JSON.stringify(bad)} was accepted`);
    }
    const st = { activeMonster: 'rat', playerHp: 10, playerMaxHp: 10, stats: {}, inventory: {},
      huntSession: M.AR.newHuntSession({ id: SID, huntFromMs: T0, bag: {}, slots: [] }) };
    const { simulateSpan } = await import(pathToFileURL(join(M.root, 'src/core/combat-sim.js')).href);
    let refused = false;
    try { simulateSpan(st, { fromMs: T0, toMs: T0 + 10000, tickMs: 2400, monsters: M.MONSTERS, items: M.ITEMS,
      bonus: () => 0, weakness: () => ({ dropMult: 1 }), playerRolls: () => ({ accuracy: 0.5, maxHit: 2, critChance: 0 }),
      monsterRolls: () => ({ accuracy: 0.5, maxHit: 1 }) }); } catch { refused = true; }
    if (!refused) problems.push('an UNSEEDED hunt swing ran — the engine must refuse a swing with no ctx.swingSeed');
    return problems;
  },

  MAXHP: async (M) => {
    /* Max HP 10 at hitpoints level 5: a level-up inside the window must not
       pull max HP DOWN to the level. The rule is one line of the ONE fx.addXp
       both a hunt and a legacy span run; the hunt reports the max HP it ended
       the window at. */
    const problems = [];
    const lv6 = M.XP.xpForLevel(6) - 1;
    const inp = huntInput(M, { skills: { attack: 50000, strength: 50000, defense: 50000, hitpoints: lv6 }, hp: 10, maxHp: 10 });
    inp.huntWindow = { fromMs: T0, toMs: T0 + 300000 };
    const out = M.AC.computeAccrual(inp);
    const lv = M.XP.levelFromXp(lv6 + Number((out.delta && out.delta.xp && out.delta.xp.hitpoints) || 0));
    if (!(lv > 5)) problems.push(`CONTROL — hitpoints did not level inside the window (level ${lv})`);
    else if (!(out.maxHp >= 10)) problems.push(`a hitpoints level-up to ${lv} lowered max HP 10 to ${out.maxHp} (FX-4)`);
    if (out.delta && out.delta.hp > Math.max(10, lv)) problems.push(`hp ${out.delta.hp} exceeds max HP`);
    return problems;
  },

  FENCE: async (M) => {
    const inp = huntInput(M, { huntOpen: true, capMs: 43200000, seed: 3 });
    delete inp.huntSession;
    const out = M.AC.computeAccrual(inp);
    const problems = [];
    if (out.accrued || out.reason !== M.AC.SKIP.HUNT_OPEN) problems.push(`the old path priced a hunter (${out.reason})`);
    if (!M.IN.SAFE_SKIP_REASONS.includes('hunt_open')) problems.push('hunt_open is not classified SAFE (a switch would treat it as a refusal)');
    return problems;
  },
};

// ═══════════════════════════════════════════════════════════════════════
// DATABASE ARMS (the real chain, PGlite, as hr_engine)
// ═══════════════════════════════════════════════════════════════════════
const UID = '00000000-0000-4000-8000-0000000c2d01';
async function q(db, sql, params) { return (await db.query(sql, params)).rows; }
async function one(db, sql, params) { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; }
const makeExec = (db) => async (text, params) => {
  await db.exec('set role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
};
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const idem = () => crypto.randomUUID();

async function admin(db, delta) {
  const v = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [UID]);
  const exec = makeExec(db);
  const [r] = await exec('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
    [UID, v, idem(), JSON.stringify({ ...delta, journal: { kind: 'admin', intent: 'c2_probe' } })]);
  if (!r || !r.r || r.r.ok !== true) throw new Error('admin apply refused: ' + JSON.stringify(r && r.r));
}

/* A probe character on a hunt that started `minutesAgo` minutes ago. */
async function hunter(db, M, o) {
  await db.query('insert into auth.users (id) values ($1)', [UID]);
  await asUser(db, UID);
  const c = await one(db, 'select public.hr_create_character(0)');
  if (!c || c.created !== true) throw new Error('probe character refused: ' + JSON.stringify(c));
  await db.query('delete from public.player_inventory where user_id = $1 and slot = 0', [UID]);
  for (const [item, qty] of Object.entries(o.inv || {})) {
    await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [UID, item, qty]);
  }
  await db.query(`update public.hr_hunt_config set enabled = true where id`);
  if (o.skillsLevel) {
    const xp = M.XP.xpForLevel(o.skillsLevel);
    await admin(db, { xp: { attack: xp, strength: xp, defense: xp, hitpoints: xp } });
    await asUser(db, UID);
  }
  if (o.hp) { await admin(db, { hp: o.hp }); await asUser(db, UID); }
  if (o.slots) {
    const r = await one(db, 'select public.hr_action_set_put(0, 0, $1, $2::jsonb, $3::uuid)', ['C2', JSON.stringify(o.slots), idem()]);
    if (!r || r.ok !== true) throw new Error('action set refused: ' + JSON.stringify(r));
  }
  const e = await one(db, 'select public.hr_hunt_enter(0, $1, $2::jsonb, 0, $3, null, $4::uuid)',
    [o.hunt || 'mill_cellar', JSON.stringify(o.bag || []), o.falls ?? null, idem()]);
  if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
  const sid = e.session.id;
  await db.query(`update public.hunt_sessions set entered_at = now() - make_interval(mins => $2 + 1),
                    hunt_from = date_trunc('second', now() - make_interval(mins => $2)),
                    settled_to = date_trunc('second', now() - make_interval(mins => $2)),
                    next_swing_at = date_trunc('second', now() - make_interval(mins => $2)) where id = $1`, [sid, o.minutesAgo]);
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  const from = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = $1`, [sid]));
  return { sid, from };
}

/* ONE settle of the open session ending at `toMs` — hunt-settle.js's own
   pieces, in settleOnce's order. */
async function settleTo(db, M, toMs, o = {}) {
  const exec = makeExec(db);
  const [read] = await exec(M.HS.HUNT_READ_SQL, [UID, 0, null]);
  const h = read.hunt; const env = read.state;
  if (!h || h.open !== true) return { skipped: 'closed' };
  const hs = M.HS.huntSessionFromRead(h);
  let press = null;
  if (o.pressAtMs != null) { press = { slot: o.pressSlot ?? 0, at: o.pressAtMs }; hs.presses = [...hs.presses, press]; }
  const perks = await M.TR.readTickPerks(exec, UID, 0);
  const bestiaryKills = await M.TR.readTickBestiary(exec, UID, 0);
  const engIn = M.HS.huntEngineInputs({ user: UID, slot: 0, env, hs,
    nowMs: new Date(read.now).getTime(), fromMs: Number(h.settled_to_ms), toMs, perks, bestiaryKills,
    secret: h.secret, pressAtMs: press ? press.at : null });
  const out = M.AC.computeAccrual(engIn);
  if (!out.accrued) return { skipped: out.reason };
  const res = await M.HS.commitHuntSettle(exec, { user: UID, slot: 0, sessionId: String(h.id), version: env.version,
    intentId: idem(), out, press, project: false });
  if (!res || res.ok !== true) throw new Error(`settle to ${new Date(toMs).toISOString()} refused: ${JSON.stringify(res).slice(0, 400)}`);
  return { res, out };
}

async function snapshot(db, sid) {
  return one(db, `
    select jsonb_build_object(
      'gold', ps.gold, 'hp', ps.hp, 'max_hp', ps.max_hp, 'buffs', ps.buffs, 'fight', ps.fight,
      'recovering_until', ps.recovering_until, 'active', ps.active_kind || ':' || coalesce(ps.active_id, ''),
      'skills', (select jsonb_object_agg(skill_id, xp) from public.player_skills where user_id = $1 and slot = 0),
      'inv', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = $1 and slot = 0),
      'stats', (select jsonb_object_agg(kind || ':' || key || ':' || period_key, value) from public.player_progress
                 where user_id = $1 and slot = 0 and kind <> 'daily'),
      'session', (select jsonb_build_object('swing', swing_index, 'next', next_swing_at, 'settled_to', settled_to,
                    'falls', falls, 'down', down, 'cooldowns', cooldowns, 'ended_at', ended_at, 'end_reason', end_reason)
                    from public.hunt_sessions where id = $2),
      'bag', (select jsonb_object_agg(item_id, jsonb_build_array(qty_loaded, qty_left)) from public.hunt_bag where session_id = $2),
      'tally', (select to_jsonb(t) - 'updated_at' - 'ledger_hwm' - 'raw_xp' from public.hunt_session_tally t where session_id = $2),
      'deaths', (select jsonb_agg(jsonb_build_array(meta->>'monster', meta->>'recovery_ms', meta->>'deaths_today',
                   meta->>'deaths_lifetime', meta->>'resume_hp', meta->>'food_in_bag') order by id)
                   from public.player_ledger where session_id = $2 and kind = 'combat' and intent = 'death'),
      /* The timeline in TIME order (a settle inserts a window's events in its
         own order). Rare drops as the SET of items: hr_hunt_settle_session
         journals one rare_drop per item per settle (C1), so how many rows a
         repeated item gets is a property of the cut, not of the hunt; level_up
         and vigour_low are stamped at their settle's end for the same reason. */
      'events', (select jsonb_agg(jsonb_build_array(type, at, data) order by at, type, data::text)
                   from public.hunt_session_events where session_id = $2 and type in ('fall', 'slot_dry', 'ended')),
      'rare_items', (select jsonb_agg(distinct data->>'item') from public.hunt_session_events
                      where session_id = $2 and type = 'rare_drop'))
      from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [UID, sid]);
}

async function inTx(db, fn) {
  await db.query('begin');
  try { return await fn(); } finally { await db.query('rollback'); }
}
/* ONE hunter, TWO timelines: run `cutsA` (window ends, ms), snapshot, roll
   back to the savepoint, run `cutsB`, snapshot. Same session, same secret,
   same instants — so any difference is the settle's, never the fixture's. */
async function compareRuns(db, M, fixture, cutsA, cutsB) {
  return inTx(db, async () => {
    const { sid, from } = await hunter(db, M, fixture);
    const run = async (cuts) => {
      for (const t of cuts(from)) {
        const r = await settleTo(db, M, t);
        if (r.skipped === 'closed') break;
      }
      return snapshot(db, sid);
    };
    await db.query('savepoint c2_runs');
    const a = await run(cutsA);
    await db.query('rollback to savepoint c2_runs');
    const b = await run(cutsB);
    return { a, b, sid, from };
  });
}

const STRONG = {
  minutesAgo: 45, skillsLevel: 25, inv: { cooked_shrimp: 30, hunters_feast: 3 },
  bag: [{ item: 'cooked_shrimp', qty: 25 }, { item: 'hunters_feast', qty: 3 }],
  slots: [{ item: '*heal', on: true, conditions: [{ subject: 'self_hp_pct', op: '<=', value: 50 }] },
    { item: 'hunters_feast', on: true, conditions: [{ subject: 'buff_missing:drop_rate' }] }],
};
const WEAK = { minutesAgo: 30, inv: {}, bag: [], falls: 1, hunt: 'goblin_warren' };
const SPAN_MS = 30 * 60000;
const ticksOf = (stepMs, spanMs) => (from) => Array.from({ length: Math.ceil(spanMs / stepMs) }, (_, i) => Math.min(from + (i + 1) * stepMs, from + spanMs));

const DB_ARMS = {
  'TICK-1': async (db, M) => {
    const r = await compareRuns(db, M, STRONG, ticksOf(90000, SPAN_MS), (from) => [from + SPAN_MS]);
    const a = canon(r.a); const b = canon(r.b);
    const problems = [];
    if (a !== b) problems.push(`20 x 90 s tick windows differ from one 30 min span ${firstDiff(a, b)}`);
    const t = r.b.tally || {};
    if (!(t.kills > 0)) problems.push(`CONTROL: the strong fixture killed nothing (${JSON.stringify(r.b).slice(0, 600)})`);
    if (!((t.supplies || {}).hunters_feast > 0)) problems.push('CONTROL: the action bar never fired a Feast — the buff queue was not exercised');
    if (!((t.supplies || {}).cooked_shrimp > 0)) problems.push('CONTROL: no heal was eaten');
    return problems;
  },
  'BOTH-PATH': async (db, M) => {
    /* The connected client cuts the timeline wherever it presses — odd
       instants, two within a second, one that lands on a swing boundary. */
    const odd = (from) => [37123, 131000, 132000, 300000, 348411, 349000, 600000, 777777, 901001, 1200000, 1500000, SPAN_MS]
      .map((d) => from + d);
    const r = await compareRuns(db, M, WEAK, ticksOf(90000, SPAN_MS), odd);
    const a = canon(r.a); const b = canon(r.b);
    const problems = [];
    if (a !== b) problems.push(`a death with a client connected wrote different rows than one with none ${firstDiff(a, b)}`);
    if (!((r.a.deaths || []).length > 0)) problems.push('CONTROL: the weak fixture never fell — the arm proves nothing about deaths');
    if (!r.a.session || r.a.session.end_reason !== 'falls') problems.push(`CONTROL: the weak hunt ended '${r.a.session && r.a.session.end_reason}', not on its fall`);
    return problems;
  },
  TALLY: async (db, M) => inTx(db, async () => {
    const { sid, from } = await hunter(db, M, STRONG);
    for (const t of ticksOf(120000, 20 * 60000)(from)) await settleTo(db, M, t);
    const r = await q(db, `
      select t.coins, t.kills, t.deaths, t.xp, t.loot, t.supplies,
             (select coalesce(sum(gold), 0) from public.player_ledger where session_id = $1 and kind <> 'hunt') as l_coins,
             (select coalesce(sum((meta->>'kills')::bigint), 0) from public.player_ledger where session_id = $1 and kind <> 'hunt' and meta ? 'kills') as l_kills,
             (select count(*) from public.player_ledger where session_id = $1 and kind = 'combat' and intent = 'death') as l_deaths,
             (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select x.key k, sum(x.value::numeric) v
                from public.player_ledger l, jsonb_each_text(coalesce(l.meta->'delta'->'x', '{}'::jsonb)) x
               where l.session_id = $1 and l.kind <> 'hunt' group by 1) s) as l_xp,
             (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select x.key k, sum(x.value::numeric) v
                from public.player_ledger l, jsonb_each_text(coalesce(l.meta->'delta'->'i', '{}'::jsonb)) x
               where l.session_id = $1 and l.kind <> 'hunt' group by 1) s) as l_loot,
             (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (select x.key k, sum(x.value::numeric) v
                from public.player_ledger l, jsonb_each_text(coalesce(l.meta->'items', '{}'::jsonb)) x
               where l.session_id = $1 and l.intent = 'hunt_consume' group by 1) s) as l_sup,
             (select count(*) from public.player_ledger where session_id = $1 and kind = 'combat' and intent = 'accrue') as settles,
             (select count(*) from public.hunt_bag b where b.session_id = $1
                and b.qty_loaded <> b.qty_left + coalesce((t.supplies->>b.item_id)::bigint, 0)) as bag_bad
        from public.hunt_session_tally t where t.session_id = $1`, [sid]);
    const x = r[0]; const problems = [];
    const n = (o) => canon(Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Number(v)])));
    if (Number(x.coins) !== Number(x.l_coins)) problems.push(`tally coins ${x.coins} <> Σ ledger gold ${x.l_coins}`);
    if (Number(x.kills) !== Number(x.l_kills)) problems.push(`tally kills ${x.kills} <> Σ meta.kills ${x.l_kills}`);
    if (Number(x.deaths) !== Number(x.l_deaths)) problems.push(`tally deaths ${x.deaths} <> death rows ${x.l_deaths}`);
    if (n(x.xp) !== n(x.l_xp)) problems.push(`tally xp ${n(x.xp)} <> Σ ledger xp ${n(x.l_xp)}`);
    if (n(x.loot) !== n(x.l_loot)) problems.push(`tally loot ${n(x.loot)} <> Σ ledger items ${n(x.l_loot)}`);
    if (n(x.supplies) !== n(x.l_sup)) problems.push(`tally supplies ${n(x.supplies)} <> Σ consumption rows ${n(x.l_sup)}`);
    if (Number(x.bag_bad) !== 0) problems.push(`${x.bag_bad} bag line(s) break loaded = left + used`);
    if (!(Number(x.settles) >= 5) || !(Number(x.kills) > 0)) problems.push(`CONTROL: ${x.settles} settles, ${x.kills} kills — the fixture did not hunt`);
    return problems;
  }),
  PRESS: async (db, M) => inTx(db, async () => {
    const problems = [];
    const fixture = { minutesAgo: 20, skillsLevel: 25, hp: 20, inv: { cooked_shrimp: 10 }, bag: [{ item: 'cooked_shrimp', qty: 10 }],
      slots: [{ item: '*heal', on: false, conditions: [] }] };
    const { sid, from } = await hunter(db, M, fixture);
    const at = from + 7000;                       // two boundaries already behind it at a 2.4 s swing
    const r1 = await settleTo(db, M, at, { pressAtMs: at, pressSlot: 0 });
    let s = await snapshot(db, sid);
    const used = Number(((s.tally || {}).supplies || {}).cooked_shrimp || 0);
    const queued = await one(db, 'select jsonb_array_length(presses) from public.hunt_sessions where id = $1', [sid]);
    if (used === 0 && queued !== 1) problems.push(`the press neither fired nor stayed queued (queued ${queued})`);
    if (used === 0) await settleTo(db, M, from + 60000);
    s = await snapshot(db, sid);
    const cd = Number((s.session.cooldowns || {}).heal || 0);
    if (!(Number(((s.tally || {}).supplies || {}).cooked_shrimp || 0) === 1)) problems.push('the press did not fire exactly one heal');
    if (!(cd - 2000 >= at)) problems.push(`the press fired at ${cd - 2000 - from} ms into the window — BEFORE it was pressed at ${at - from} ms`);
    if (!(r1.res && r1.out)) problems.push('CONTROL: the press settle did not run');
    // a press with nothing in the bag that could fire it is refused, nothing written
    await db.query('update public.hunt_bag set qty_left = 0 where session_id = $1', [sid]);
    const exec = makeExec(db);
    const [read] = await exec(M.HS.HUNT_READ_SQL, [UID, 0, null]);
    const [r] = await exec(`select public.hr_hunt_apply($1::uuid, 0, $2::uuid, $3::bigint, $4::uuid, '{}'::text::jsonb, '{}'::text::jsonb, null, $5::text::jsonb) as r`,
      [UID, sid, read.state.version, idem(), JSON.stringify({ slot: 0, at: Date.now() - 1000 })]);
    if (!r || !r.r || r.r.error !== 'bag_empty') problems.push(`a press on an empty bag answered ${JSON.stringify(r && r.r)}`);
    return problems;
  }),
  END: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, { minutesAgo: 10, hp: 2, inv: { cooked_shrimp: 3 }, bag: [{ item: 'cooked_shrimp', qty: 3 }] });
    await settleTo(db, M, from + 5 * 60000);
    const s = await snapshot(db, sid);
    if (s.session.end_reason !== 'heals_out') problems.push(`a dry bag ended the hunt '${s.session.end_reason}', not heals_out`);
    if (!s.active.startsWith('idle')) problems.push(`the pointer is ${s.active} after the hunt ended`);
    if (!(s.events || []).some((e) => e[0] === 'ended')) problems.push('no `ended` event was journalled');
    const endedMs = new Date(s.session.ended_at).getTime();
    if (!(endedMs > from && endedMs < from + 5 * 60000)) problems.push('ended_at is not inside the settled window');
    return problems;
  }),
  /* TICK-0 — CRON TO EDGE. hr_tick_cron_run's (3c) body, off the pg_net
     queue, handed to `runTick` (the function index.ts's op:'tick' calls) over
     the real driver: the open session is settled once through settleHunt, the
     window lands as ONE accrue row stamped with the session, the clock
     advances, and a selector naming another session settles nothing. */
  'TICK-0': async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, STRONG);
    /* The world tick's own kill switch gates its hunt cohort too (the replay
       ships it off); production runs it on. */
    await db.query('update public.hr_tick_config set enabled = true where id');
    const exec = makeExec(db);
    const fire = async (hunts) => (await M.TK.runTick({ exec,
      body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts } })).body;
    const stamped = async () => one(db, `select count(*)::int from public.player_ledger
                                          where session_id = $1 and kind = 'combat' and intent = 'accrue'`, [sid]);
    const other = await fire([{ user_id: UID, slot: 0, session_id: '00000000-0000-4000-8000-0000000c2eff' }]);
    if (!other.hunts || other.hunts.settled !== 0 || (other.hunts.reasons || {}).session_changed !== 1 || await stamped() !== 0) {
      problems.push(`a selector naming another session was not skipped by name: ${JSON.stringify(other.hunts)}`);
    }
    /* THE CRON LEG: hr_tick_cron_run (3c) leases the due session through
       hr_hunt_roster and queues its OWN body; that body, read off the pg_net
       queue, is what runTick is handed (plus one malformed selector, which
       parseHunts must drop). Supabase's pgcrypto / vault / pg_net are the
       token guards' pinned shims. */
    await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
    await db.query(`update public.hr_tick_config set flush_seconds = 90, cadence_seconds = 10, batch_limit = 200,
                      lease_ms = 30000, shards = 1,
                      edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
    await db.query('delete from net.http_request_queue');
    await db.query('select public.hr_tick_cron_run()');
    const bodies = (await q(db, `select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`))
      .map((r) => JSON.parse(r.b)).filter((b) => Array.isArray(b.hunts));
    const huntBody = bodies[0];
    if (bodies.length !== 1 || !huntBody || huntBody.hunts.length !== 1 || huntBody.hunts[0].session_id !== sid
        || huntBody.hunts[0].user_id !== UID || huntBody.hunts[0].slot !== 0 || (huntBody.roster || []).length !== 0) {
      problems.push(`the cron did not queue ONE hunts body naming this session: ${JSON.stringify(bodies).slice(0, 300)}`);
      return problems;
    }
    huntBody.hunts.push({ user_id: 'not-a-uuid', slot: 0, session_id: sid });
    const f = (await M.TK.runTick({ exec, body: huntBody })).body;
    const rows = await stamped();
    const to = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = $1`, [sid]));
    if (!f.hunts || f.hunts.settled !== 1) problems.push(`runTick did not settle the hunt cohort: ${JSON.stringify(f)}`);
    if (rows !== 1) problems.push(`one tick settle wrote ${rows} accrue row(s) stamped with the session, not 1`);
    if (!(to > from + 40 * 60000)) problems.push(`the session clock did not advance to the fire's now (settled_to ${to - from} ms past the start)`);
    if (f.processed !== 0 || f.shadowed !== 0) problems.push(`an empty roster processed rows: ${JSON.stringify(f)}`);
    return problems;
  }),
  /* BESTIARY — THE HUNT SETTLE PRICES THE CHARM AND THE TROPHY. hr_bestiary_of
     is not an envelope field; settleHunt reads it (./tick-reads.js) and hands
     it to the engine. The same session, the same instant (one transaction),
     settled once with no counters and once with 20,000 server-counted kills of
     every monster the hunt spawns: the value it pays must differ. A dropped or
     mis-folded read prices both alike. (Until lane C2 this was
     tests/world-tick-bestiary-parity.mjs, on the retired solo combat tick.) */
  BESTIARY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid } = await hunter(db, M, STRONG);
    const exec = makeExec(db);
    const spawns = (M.HUNTS.HUNT_INDEX.mill_cellar || {}).spawns || [];
    if (spawns.length < 2) problems.push('CONTROL: mill_cellar spawns fewer than two monsters');
    const value = async () => canon(await one(db, `select jsonb_build_object(
        'gold', ps.gold, 'hp', ps.hp,
        'skills', (select jsonb_object_agg(skill_id, xp) from public.player_skills where user_id = $1 and slot = 0),
        'inv', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = $1 and slot = 0),
        'tally', (select jsonb_build_object('coins', t.coins, 'kills', t.kills, 'xp', t.xp, 'loot', t.loot)
                    from public.hunt_session_tally t where t.session_id = $2))
      from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [UID, sid]));
    await db.query('savepoint bestiary');
    const bare = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid });
    const vBare = await value();
    await db.query('rollback to savepoint bestiary');
    for (const s of spawns) {
      await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value)
                      values ($1, 0, 'stat', 'ev:kill_monster:' || $2, '', 20000)`, [UID, s.monster]);
    }
    const reported = await one(db, `select count(*)::int from public.hr_bestiary_of($1::uuid, 0) where kills = 20000`, [UID]);
    if (reported !== spawns.length) problems.push(`CONTROL: hr_bestiary_of reports ${reported} of ${spawns.length} planted counters`);
    const charmed = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid });
    const vCharmed = await value();
    if (bare.outcome !== 'paid' || charmed.outcome !== 'paid') {
      problems.push(`CONTROL: a settle did not pay (${bare.outcome}/${bare.reason}, ${charmed.outcome}/${charmed.reason})`);
    } else if (vBare === vCharmed) {
      problems.push('20,000 kills of every spawn priced the hunt exactly as none — the settle dropped or mis-folded the bestiary read');
    }
    return problems;
  }),
};

// ═══════════════════════════════════════════════════════════════════════
async function runArms(root, db, only) {
  const M = await loadEdge(root);
  const out = {};
  for (const [name, arm] of Object.entries(ENGINE_ARMS)) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await arm(M); } catch (e) { out[name] = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
  }
  if (db) {
    for (const [name, arm] of Object.entries(DB_ARMS)) {
      if (only && !only.includes(name)) continue;
      try { out[name] = await arm(db, M); } catch (e) { out[name] = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
    }
  }
  return out;
}

/* JS mutants: planted in a temp copy of the edge + src/core + src/data. */
const MUTANTS = [
  { arm: 'TICK-2', name: 'the combat ctx is away again', file: join(FN, 'accrual.js'),
    from: "    fromMs: credit.fromMs,\n    toMs: hs0 ? huntToMs : credit.toMs,", to: "    away: true,\n    fromMs: credit.fromMs,\n    toMs: hs0 ? huntToMs : credit.toMs," },
  { arm: 'TICK-2', name: 'a session window starts at the absence watermark', file: join(FN, 'accrual.js'),
    from: 'const fromMs = Math.floor(nat(w.fromMs, -1));', to: 'const fromMs = Math.floor(nat(inp.accruedToMs, nat(w.fromMs, -1)));' },
  { arm: 'SEED', name: 'the per-swing seed is the 32-bit FNV text mix again', file: join(FN, 'hunt-seed.js'),
    from: "const d = createHmac('sha256', key).update(swingSeedLabel(sessionId, i), 'utf8').digest();",
    to: "const s = secret + ' ' + swingSeedLabel(sessionId, i); let x = 0x811c9dc5; for (let k = 0; k < s.length; k++) { x ^= s.charCodeAt(k); x = Math.imul(x, 0x01000193); } const d = [x >>> 24 & 255, x >>> 16 & 255, x >>> 8 & 255, x & 255];" },
  { arm: 'MAXHP', name: 'a hitpoints level-up sets max HP to the level', file: join(FN, 'accrual.js'),
    from: "fightSkills === state.skills && ev.to > state.playerMaxHp) state.playerMaxHp = ev.to;", to: "fightSkills === state.skills) state.playerMaxHp = ev.to;" },
  { arm: 'FENCE', name: 'the engine prices a hunter on the old path', file: join(FN, 'accrual.js'),
    from: '  if (inp.huntOpen === true) return { accrued: false, reason: SKIP.HUNT_OPEN };', to: '' },
  { arm: 'PRESS', name: 'a press fires before it was made', file: 'src/core/action-rules.js',
    from: '    if (p.at > v.atMs) { out.keep.push(entry); continue; }', to: '' },
  /* (Measuring at the window START is an equivalent mutant: a session's
     settled_to IS its next swing. The defect worth a guard is the read clock.) */
  { arm: 'TICK-1', name: 'the buff queue is measured at the read clock, not the swing clock', file: join(FN, 'accrual.js'),
    from: 'buffs: buffQueueFromServer(inp.buffs, hs0 ? hs0.nextSwingAtMs : credit.fromMs),', to: 'buffs: buffQueueFromServer(inp.buffs, nowMs),' },
  { arm: 'BOTH-PATH', name: 'a knocked-out foe is not carried across a settle', file: join(FN, 'accrual.js'),
    from: "            ? Math.floor(state.monsterHp) : Math.max(1, Math.floor(nat(m.hp, 1))),", to: "            ? Math.floor(state.monsterHp) : 0," },
  { arm: 'END', name: 'a dry heal line does not end the hunt', file: 'src/core/action-rules.js',
    from: '  heals_out: (hs) => essentialOut(hs, \'heal\'),', to: '  heals_out: () => false,' },
  { arm: 'TICK-0', name: 'the world tick drops its hunt cohort', file: join(FN, 'tick.js'),
    from: '  if (body.hunts.length) {', to: '  if (false) {' },
  { arm: 'BESTIARY', name: 'the hunt settle drops the bestiary read', file: join(FN, 'hunt-settle.js'),
    from: '  const bestiaryKills = await readTickBestiary(exec, user, slot);', to: '  const bestiaryKills = null;' },
  { arm: 'BESTIARY', name: 'the bestiary read counts rows instead of summing kills', file: join(FN, 'set-activity.js'),
    from: 'jsonb_object_agg(monster_id, kills)', to: 'jsonb_object_agg(monster_id, 1)' },
];

/* DB mutants: planted in a LIVE function body of the booted chain (create or
   replace), the arm run, the body restored. */
const DB_MUTANTS = [
  { arm: 'TALLY', name: 'the fold counts one kill the ledger does not hold', fn: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
    find: 'kills = t.kills + v_kills,', replace: 'kills = t.kills + v_kills + 1,' },
  { arm: 'TALLY', name: 'the fold drops the consumption rows', fn: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
    find: "supplies = public.hr_jsonb_add(t.supplies, v_sup)", replace: "supplies = t.supplies" },
  { arm: 'TICK-0', name: 'the cron queues its hunts body with no selectors', fn: 'public.hr_tick_cron_run()',
    find: "'hunts', v_hunts)::text);", replace: "'hunts', '[]'::jsonb)::text);" },
];

/* SQL mutants: planted in the migration TEXT; its own §10 must refuse each. */
const SQL_MUTANTS = [
  { name: 'the value half is not stamped with the session (tally loses it)', find: "    perform set_config('hr.hunt_session', p_session::text, true);\n    v_a := public.hr_apply(", replace: '    v_a := public.hr_apply(' },
  { name: 'a refused session half leaves the value half written', find: "  exception when sqlstate 'HR000' then\n    get stacked diagnostics", replace: "  exception when sqlstate 'XX999' then\n    get stacked diagnostics" },
  { name: 'the fence trigger is not installed', find: 'create trigger hr_hunt_accrue_fence before insert on public.player_ledger', replace: 'create trigger hr_hunt_accrue_fence_off before update on public.player_ledger' },
];

async function main() {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    console.error(`✗ the chain would not replay: ${String(e.message).slice(0, 600)}`);
    process.exit(1);
  }
  if (MUTATE) {
    let bad = 0;
    /* --mutant=<text> re-runs only the mutants whose name contains it (a re-check, never the record). */
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const picked = (list) => list.filter((m) => !pick || m.name.includes(pick));
    for (const m of picked(MUTANTS)) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-c2-'));
      try {
        cpSync(join(ROOT, 'src', 'core'), join(dir, 'src', 'core'), { recursive: true });
        cpSync(join(ROOT, 'src', 'data'), join(dir, 'src', 'data'), { recursive: true });
        cpSync(join(ROOT, FN), join(dir, FN), { recursive: true });
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error(`✗ mutant "${m.name}": marker not found exactly once in ${m.file}`); bad++; continue; }
        writeFileSync(p, src.replace(m.from, () => m.to));
        const res = await runArms(dir, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    for (const m of picked(DB_MUTANTS)) {
      const def = String(await one(db, `select pg_get_functiondef($1::regprocedure)`, [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { console.error(`✗ db mutant "${m.name}": anchor not found exactly once`); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.replace));
      try {
        const res = await runArms(ROOT, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { await db.exec(def); }
    }
    for (const m of picked(SQL_MUTANTS)) {
      let refused = null;
      try {
        await bootReplay({ patches: new Map([['2026-10-22-hunt-sessions-settle.sql', [[m.find, m.replace]]]]), upTo: LAST_PATCHED });
      } catch (e) { refused = String(e.message); }
      if (refused && !e2harness(refused)) console.log(`✓ §10 refuses: ${m.name}`);
      else { console.error(`✗ §10 applied: ${m.name}${refused ? ' (' + refused.slice(0, 200) + ')' : ''}`); bad++; }
    }
    const total = picked(MUTANTS).length + picked(DB_MUTANTS).length + picked(SQL_MUTANTS).length;
    console.log(bad ? `hunt-sessions-settle --mutate: ${bad} mutant(s) survived` : `hunt-sessions-settle --mutate: all ${total} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const res = await runArms(ROOT, db, onlyArg ? onlyArg.slice(7).split(',') : undefined);
  let bad = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { bad++; for (const p of problems) console.error(`✗ ${name}: ${p}`); }
    else console.log(`✓ ${name}`);
  }
  console.log(bad ? `hunt-sessions-settle: ${bad} arm(s) red` : `hunt-sessions-settle: all ${Object.keys(res).length} arms green`);
  process.exit(bad ? 1 : 0);
}
/* A harness error (an anchor that moved) is never "caught". */
function e2harness(msg) { return /patch anchor matched|produced identical SQL|did not land verbatim/.test(msg); }

main();
