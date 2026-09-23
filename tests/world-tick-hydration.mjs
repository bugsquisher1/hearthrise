// ============================================================================
// tests/world-tick-hydration.mjs — WHAT THE TICK HANDS THE ENGINE, FROM A REAL
// `hr_state_of` ENVELOPE.
//
//   node tests/world-tick-hydration.mjs            run the guard
//   node tests/world-tick-hydration.mjs --mutate   restore the defect, prove red
//   node tests/world-tick-hydration.mjs --verbose  print every measurement
//
// ── THE DEFECT THIS EXISTS FOR, MEASURED ON PRODUCTION ─────────────────────
// 2026-09-22 22:37–22:42 UTC, gather shadow armed for one character at Mining
// 61–64 on `mithril_rock`. EVERY row in `hr_tick_shadow` carried
// `would_ticks: 0, would_qty: 0` and a delta of
//   {journal:{kind:'gather', meta:{ms:20000, ticks:0, qty:0, node:'mithril_rock',
//    skill:'mining', src:'tick', capped:false}}, activity:{kind:'idle', id:null}, …}
// — the engine hit the gather LEVEL gate (accrual.js: `stoppedBy ===
// STOP_REASON.LEVEL` ⇒ `delta.activity = {kind:'idle'}`) and the tick would
// have ENDED the activity of a character who can mine that node, every window.
// The SAME character's ACCRUE path had just paid +3,375 items for a 12 h
// absence off the SAME projection.
//
// The cause was hydration, not arithmetic: `tick.js` passed `env.state` where
// `tick-gather.js sessionFromRoster` expected the whole envelope. `hr_state_of`
// is TWO levels — `state` holds the player_state columns, the TOP LEVEL holds
// `skills`, `inventory`, `equipment`, `enchant`, `buffs`, `version` — so the
// session carried `skills {}` (Mining 0) and a level-60 node refused it.
//
// ── WHY THE EXISTING GUARDS COULD NOT SEE IT ───────────────────────────────
// tests/world-tick-parity.mjs drives `services/world-tick/fixtures/*.json`,
// which are already in POST-hydration camelCase engine shape. They prove the
// LOOP is right and say nothing about where its fields came from. So this file
// starts one step earlier: a probe character is written into a real PGlite
// replay of the repo's own chain, `hr_state_of` projects it, and the envelope
// that comes back — not a fixture of one — is what both paths are fed.
//
// ── FOUR CLAIMS ─────────────────────────────────────────────────────────────
//  H1 THE SHIPPED ENTRY, END TO END. `runTick` — the function index.ts calls —
//     fires against the real `hr_tick_settle` for a Mining-61 character on
//     `mithril_rock` and journals a shadow row with `would_ticks > 0`,
//     `would_qty > 0` and NO `activity` key. This is the production
//     measurement, reproduced.
//  H2 CALLER PARITY ON ONE WINDOW. The tick's session and the accrue path's
//     engine input, built from the SAME envelope and handed the SAME seed and
//     the SAME [from, to], simulate the same number of actions. The tick is a
//     caller of the engine, not a second engine (AWAY-12).
//  H3 NO FIELD OF THE SESSION COMES FROM THE REQUEST BODY. The roster names a
//     user and a slot; a body that also names a skill level, an inventory, a
//     cap or a version must change nothing about what the engine is handed.
//  H4 THE CHAIN STILL PAYS. The same window settled at the production 10 s
//     cadence pays the same actions as the one-shot window (time conservation
//     across the hydrated session, not just across a fixture).
//
// NO NETWORK. PGlite, in process, the repo's own migration chain — production
// is untouched and no credential is read.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { bootReplay, ROOT } from './schema-replay.mjs';
import { runTick } from '../supabase/functions/hr-accrue/tick.js';
import { sessionFromRoster, settleGatherSession, GATHER_CATALOGUES }
  from '../supabase/functions/hr-accrue/tick-gather.js';
import { engineInputsFromEnvelope, ENGINE_INPUT_KEYS }
  from '../supabase/functions/hr-accrue/envelope.js';
import { computeAccrual, CALLER_AUTHORITY } from '../supabase/functions/hr-accrue/accrual.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from '../supabase/functions/hr-accrue/catalogue.js';

const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const VERBOSE = ARGS.includes('--verbose');

const problems = [];
const judge = (id, pass, good, bad) => {
  if (pass) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems.push(id); }
};
const group = (t) => console.log(`\n${t}`);
const say = (s) => { if (VERBOSE) console.log(s); };

/* ── THE PROBE CHARACTER ─────────────────────────────────────────────────────
   Mining 61 on `mithril_rock` (req 60, 8000 ms) with a Mithril Pickaxe in the
   BAG — `bestTool` reads inventory and equipment alike, and the bag is the
   shape the production character was in. 302,288 xp is the first xp at level
   61 (src/core/xp.js `levelFromXp`), i.e. the narrowest possible margin over
   the gate: one lost skills map and this character is level 0, which is
   exactly the failure being reproduced. */
const NODE = 'mithril_rock';
const SKILL = 'mining';
const TOOL = 'mithril_pickaxe';
const XP_AT_61 = 302288;
const U = (n) => `00000000-0000-4000-8000-0000000d${String(n).padStart(4, '0')}`;

/* The window. 90 s is the flush period `tick.js` settles at (DEFAULT_FLUSH_MS),
   so this is one fire's worth of one character. */
const FLUSH_MS = 90000;
const CADENCE_MS = 10000;
const SEED = 918273645;

console.log(`world-tick-hydration: the envelope the tick hands the engine${MUTATE ? '  [--mutate: env.state-only hydration restored]' : ''}`);

const { db, failures } = await bootReplay({});
if (failures.length) {
  console.error('the schema replay did not complete:', failures);
  process.exit(2);
}

/* ── THE MUTATION ───────────────────────────────────────────────────────────
   `--mutate` restores the DEFECT — `sessionFromRoster(row, env.state)` — in a
   COPY of the function directory under the OS temp dir, never in the tracked
   file (Security review 2026-09-20, finding S-UM-1: a guard that patches a repo
   file and restores it in a `finally` does not restore it on a SIGKILL). The
   copy sits at the same depth relative to its base, because accrual.js reaches
   `../../../src/core/**`. H1 then imports `runTick` from the copy, so the
   mutation reaches the SHIPPED entry and not a re-implementation of it. */
async function tickEntry() {
  if (!MUTATE) return { runTick, sessionFromRoster, dir: join(ROOT, 'supabase', 'functions', 'hr-accrue') };
  const base = await mkdtemp(join(tmpdir(), 'hr-wth-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'), dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });

  const tickSrc = await readFile(join(dir, 'tick.js'), 'utf8');
  const marker = '  }, env);';
  if (!tickSrc.includes(marker)) {
    console.error('--mutate: tick.js no longer hydrates with `}, env);` — the mutation cannot be '
      + 'applied, so a green run would prove nothing. Read tick.js before trusting this guard.');
    process.exit(2);
  }
  await writeFile(join(dir, 'tick.js'), tickSrc.replace(marker, '  }, st);'), 'utf8');

  const m = await import(pathToFileURL(join(dir, 'tick.js')).href);
  const g = await import(pathToFileURL(join(dir, 'tick-gather.js')).href);
  return { runTick: m.runTick, sessionFromRoster: g.sessionFromRoster, dir };
}

/** The one-statement seam index.ts hands the tick, as the real role. */
const execSeam = async (text, params) => {
  await db.exec('begin'); await db.exec('set local role hr_engine');
  try { return (await db.query(text, params)).rows; }
  finally { await db.exec('commit'); }
};

/** Write one probe character, gathering `mithril_rock` since two hours ago with
    `accrued_to` one flush period behind the server clock. */
async function seed(u, o) {
  const opt = o || {};
  await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
  await db.exec(`
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                     active_kind, active_id, active_since)
    values ('${u}', 0, 0, 0, 40, 40, 1, now() - interval '95 seconds',
            'gather', '${NODE}', now() - interval '2 hours')
    on conflict (user_id, slot) do update set version = 1, gold = 0,
      accrued_to = now() - interval '95 seconds',
      active_kind = 'gather', active_id = '${NODE}';`);
  await db.exec(`delete from public.player_skills    where user_id = '${u}';`);
  await db.exec(`delete from public.player_inventory where user_id = '${u}';`);
  await db.exec(`
    insert into public.player_skills (user_id, slot, skill_id, xp)
    values ('${u}', 0, '${SKILL}', ${opt.xp == null ? XP_AT_61 : opt.xp}),
           ('${u}', 0, 'hitpoints', 12000);`);
  if (opt.tool !== false) {
    await db.exec(`
      insert into public.player_inventory (user_id, slot, item_id, qty)
      values ('${u}', 0, '${TOOL}', 1);`);
  }
  await db.exec(`delete from public.hr_tick_ownership where user_id = '${u}';`);
  await db.exec(`
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values ('${u}', 0, 'gather', true, '${opt.holder || 'proofs'}', now() + interval '5 minutes');`);
}

/** `hr_state_of` + the cap + the clock, in one statement, exactly as tickOne
    and index.ts's accrue path each read them. */
async function envelopeOf(u) {
  const [row] = (await db.query(
    'select public.hr_state_of($1::uuid, $2::int) as state,'
    + ' public.hr_offline_cap_ms($1::uuid, $2::int) as cap_ms,'
    + ' now()::timestamptz as now', [u, 0])).rows;
  return { env: row.state, capMs: Number(row.cap_ms) || 0, nowMs: new Date(row.now).getTime() };
}

let entry;
try {
  entry = await tickEntry();

  /* ── THE FIXTURE IS REAL, AND SAYS SO FIRST ──────────────────────────────
     Every claim below is worthless if the probe cannot mine the node anyway.
     `hr_activities` is the generated catalogue the fence validates against, so
     it is the thing to ask — not src/data, which is the copy this guard is
     trying to prove the server agrees with. */
  group('H0  the probe is a character who CAN mine this node');
  {
    const [act] = (await db.query(
      "select req_skill, req_lv from public.hr_activities where kind = 'gather' and activity_id = $1",
      [NODE])).rows;
    judge('H0a', !!act && act.req_skill === SKILL,
      `hr_activities knows ${NODE} as a ${act && act.req_skill} node at level ${act && act.req_lv}`,
      `hr_activities has no gather row for ${NODE} — the catalogue migration did not replay, so `
      + 'nothing below measures what it claims');
    if (!act) throw new Error('no catalogue row');
    const [lv] = (await db.query('select public.hr_level_from_xp($1::bigint) as lv', [XP_AT_61])).rows;
    judge('H0b', Number(lv.lv) >= Number(act.req_lv),
      `the probe's ${XP_AT_61} xp is ${SKILL} level ${lv.lv}, at or above the node's ${act.req_lv}`,
      `the probe is ${SKILL} level ${lv.lv} and the node needs ${act.req_lv} — fix the fixture, `
      + 'not the assertion');
    judge('H0c', (ITEMS[TOOL] || {}).toolSkill === SKILL,
      `${TOOL} is a ${SKILL} tool (tier ${(ITEMS[TOOL] || {}).toolTier}), so the bag alone `
      + 'equips the speed and double-yield ladder',
      `${TOOL} is not a ${SKILL} tool in src/data/items.js`);
  }

  // ── H1 ── THE SHIPPED ENTRY, END TO END ───────────────────────────────────
  group('H1  runTick against the real fence — the production measurement');
  let h1Row = null;
  {
    const u = U(1);
    const holder = (await db.query(
      "select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).rows[0].h;
    await seed(u, { holder });
    await db.exec('update public.hr_tick_config set enabled = true, shadow = true where id;');
    await db.exec(`delete from public.hr_tick_shadow where user_id = '${u}';`);

    let fire; let raised = '';
    try {
      fire = (await entry.runTick({
        exec: execSeam,
        body: { op: 'tick', roster: [{ user_id: u, slot: 0 }],
          cadence_ms: CADENCE_MS, flush_ms: FLUSH_MS },
      })).body;
    } catch (e) { raised = String(e.message).slice(0, 160); }

    const rows = (await db.query(
      'select would_ticks, would_qty, would_gold, delta from public.hr_tick_shadow'
      + ` where user_id = '${u}' order by id`)).rows;
    h1Row = rows[0] || null;
    say(`      fire   : ${JSON.stringify(fire && { processed: fire.processed, shadowed: fire.shadowed, skipped: fire.skipped, refused: fire.refused, reasons: fire.reasons })}`);
    say(`      shadow : ${JSON.stringify(h1Row)}`);

    judge('H1a', !raised && rows.length === 1,
      `the fire journalled one shadow window (${JSON.stringify(fire && { shadowed: fire.shadowed, skipped: fire.skipped, refused: fire.refused, reasons: fire.reasons })})`,
      raised ? `the fire THREW: ${raised}`
        : `the fire journalled ${rows.length} shadow rows — expected exactly 1. `
          + `verdict: ${JSON.stringify(fire)}`);

    /* THE CLAIM. `would_ticks` is `meta.ticks` — the ACTIONS the engine ran.
       Zero on a 90 s window at a ~6.4 s action interval is the defect verbatim. */
    judge('H1b', !!h1Row && Number(h1Row.would_ticks) > 0,
      `the tick would have mined ${h1Row && h1Row.would_ticks} actions in ${FLUSH_MS / 1000}s — `
      + 'the engine saw the skills map',
      `would_ticks = ${h1Row && h1Row.would_ticks} for a Mining-61 character on a level-60 node. `
      + 'The session was hydrated from `env.state`, where no skills live, so the engine priced '
      + `this character at ${SKILL} 0 and refused the node. delta: ${JSON.stringify(h1Row && h1Row.delta)}`);

    judge('H1c', !!h1Row && Number(h1Row.would_qty) > 0,
      `and would have banked ${h1Row && h1Row.would_qty} ore`,
      `would_qty = ${h1Row && h1Row.would_qty} — nothing was gathered`);

    /* THE OTHER HALF, AND THE ONE THAT COSTS A PLAYER SOMETHING. A LEVEL stop
       does not merely pay zero: accrual.js answers `activity:{kind:'idle'}`,
       which in step 2 is hr_apply ENDING the activity. A tick that mis-hydrates
       does not under-pay a gathering character, it stops them gathering. */
    const act = h1Row && h1Row.delta && h1Row.delta.activity;
    judge('H1d', !act,
      'the proposed delta carries NO `activity` key — the tick is not about to end this '
      + "character's gathering",
      `the proposed delta would have set activity to ${JSON.stringify(act)}. A LEVEL stop makes `
      + 'the tick END the activity of a character who can mine that node — every window, for '
      + 'every gatherer, the moment shadow becomes step 2.');
  }

  // ── H2 ── CALLER PARITY ON ONE WINDOW ─────────────────────────────────────
  group('H2  one window, one envelope: the tick and the accrue path agree');
  {
    const u = U(2);
    await seed(u);
    const { env, capMs, nowMs } = await envelopeOf(u);

    /* Not `env.state.skills` — the point of the whole file. Named here so a
       reader can see the two levels of the projection in one place. */
    say(`      envelope top-level keys : ${Object.keys(env).sort().join(', ')}`);
    say(`      envelope.state keys     : ${Object.keys(env.state).sort().join(', ')}`);
    judge('H2a', env.skills && typeof env.skills[SKILL] === 'object'
        && Number(env.skills[SKILL].xp) === XP_AT_61 && env.state[SKILL] === undefined,
      `hr_state_of projects skills at the TOP level as {xp, level} (${SKILL}: `
      + `${JSON.stringify(env.skills && env.skills[SKILL])}) and NOT inside \`state\``,
      'hr_state_of no longer projects skills where this guard expects them — read the projection '
      + `before trusting the rest of this file. top-level skills: ${JSON.stringify(env.skills)}`);

    const fromMs = Date.parse(env.state.accrued_to);
    const toMs = fromMs + FLUSH_MS;

    /* THE TICK, one poll of the whole window: cadence = flush, so the loop
       makes exactly one engine call over [from, to] and there is no
       decomposition to explain a difference away. */
    const session = entry.sessionFromRoster({
      user_id: u, slot: 0, shard: 0,
      active_kind: env.state.active_kind,
      active_id: env.state.active_id,
      active_since: env.state.active_since,
      accrued_to: new Date(fromMs).toISOString(),
      version: env.version,
      cap_ms: capMs,
    }, MUTATE ? env.state : env);
    const run = settleGatherSession(session, fromMs, toMs, {
      cadenceMs: FLUSH_MS, flushMs: FLUSH_MS, seedOf: () => SEED, holder: 'proofs',
    });
    /* `writeIntent` returns the RPC CALL — `{rpc, args:{p_delta, …}, window}` —
       because that is what step 2 hands hr_tick_settle. The journal meta is the
       same object hr_tick_shadow stores in its `delta` column, which is why H1
       and H2 can be compared to each other. */
    const tickDelta = run.intents[0] && run.intents[0].args && run.intents[0].args.p_delta;
    const tickMeta = tickDelta && tickDelta.journal && tickDelta.journal.meta;

    /* THE ACCRUE PATH, the same window, the same seed, off the same envelope.
       Every field that is not the envelope's is named here exactly as
       index.ts names it — including `caller:'accrue'`, because the two callers
       differ ONLY in the floor exemption and the watermark stamp, and a 90 s
       window is over ACCRUE_MIN_MS either way. */
    const accrue = computeAccrual({
      userId: u,
      slot: 0,
      nowMs: toMs,
      ...engineInputsFromEnvelope(env, nowMs),
      accruedToMs: fromMs,
      capMs,
      actionBudget: null,
      attended: null,
      seed: SEED,
      bestiaryKills: null,
      perks: null,
      unlockedRecipes: null,
      items: ITEMS,
      monsters: MONSTERS,
      nodes: GATHER_NODES,
      recipes: ARTISAN_RECIPES_ALL,
      caller: 'accrue',
      callerAuthority: CALLER_AUTHORITY,
    });
    const accrueMeta = accrue.accrued && accrue.delta.journal && accrue.delta.journal.meta;
    say(`      tick   : ${JSON.stringify(tickMeta)}`);
    say(`      accrue : ${JSON.stringify(accrueMeta)}`);

    judge('H2b', !!accrueMeta && Number(accrueMeta.ticks) > 0,
      `the accrue path prices the window at ${accrueMeta && accrueMeta.ticks} actions — the `
      + 'control this comparison needs',
      'the ACCRUE path settled nothing over this window, so H2c would compare two zeroes and '
      + `pass on the defect. reason: ${accrue.reason}`);

    judge('H2c', !!tickMeta && !!accrueMeta
        && Number(tickMeta.ticks) === Number(accrueMeta.ticks),
      `the tick and the accrue path both ran ${tickMeta && tickMeta.ticks} actions over the same `
      + 'window from the same envelope and the same seed (AWAY-12: one engine, two callers)',
      `the two callers disagree: tick ${tickMeta && tickMeta.ticks} actions vs accrue `
      + `${accrueMeta && accrueMeta.ticks}. One of them is not reading the envelope the other is.`);

    judge('H2d', !!tickMeta && Number(tickMeta.qty) === Number(accrueMeta && accrueMeta.qty),
      `and banked the same ${tickMeta && tickMeta.qty} ore`,
      `yields differ: tick ${tickMeta && tickMeta.qty} vs accrue ${accrueMeta && accrueMeta.qty}`);

    /* THE FIELD LIST ITSELF. Both callers spread ONE map, so the property
       worth asserting is that the map fills every key it declares from an
       envelope that HAS them — a silently absent key is how this class of
       defect is invisible. */
    /* UNDER --mutate THE MAP IS FED `env.state` TOO, because the mutation is
       "hydrate from env.state" and it must reach every reader of the envelope,
       not only the tick entry. A claim that cannot go red is not a claim. */
    const hy = engineInputsFromEnvelope(MUTATE ? env.state : env, nowMs);
    const empty = ['skills', 'inventory'].filter((k) => Object.keys(hy[k] || {}).length === 0);
    /* AND THE SESSION CARRIES EVERY KEY THE MAP DECLARES. `sessionFromRoster`
       overrides four of them from the roster row; none of the rest may be
       dropped on the way through, or the tick is back to handing the engine
       `undefined` for a field the accrue path fills. */
    const missing = ENGINE_INPUT_KEYS.filter((k) => !(k in session));
    judge('H2f', missing.length === 0,
      `the tick's session carries all ${ENGINE_INPUT_KEYS.length} keys engineInputsFromEnvelope `
      + 'declares — nothing is lost between the envelope and the loop',
      `the session is missing ${missing.join(', ')} — sessionFromRoster drops fields the map fills`);

    judge('H2e', empty.length === 0 && hy.activeId === NODE && hy.hp > 0,
      `engineInputsFromEnvelope filled skills(${Object.keys(hy.skills).length}) / `
      + `inventory(${Object.keys(hy.inventory).length}) / hp(${hy.hp}) / activeId(${hy.activeId}) `
      + 'from one envelope',
      `engineInputsFromEnvelope returned empty ${empty.join(' and ')} for a character who has `
      + 'them — the map is reading the wrong level of the projection');
  }

  // ── H3 ── NOTHING COMES FROM THE REQUEST BODY ─────────────────────────────
  group('H3  the request body cannot reach the engine');
  {
    const u = U(3);
    const holder = (await db.query(
      "select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).rows[0].h;
    await seed(u, { holder });
    await db.exec(`delete from public.hr_tick_shadow where user_id = '${u}';`);

    /* A HOSTILE ROSTER ENTRY. Every field a mis-written entry might forward:
       a skills map, an inventory, an equipment map, a cap, a version, a
       watermark, an activity. `runTick` must read all seven off the database
       and none off this object. */
    const hostile = {
      user_id: u, slot: 0,
      skills: { [SKILL]: 99999999 }, inventory: { [TOOL]: 99 }, equipment: {},
      cap_ms: 999999999, version: 9999,
      accrued_to: '1970-01-01T00:00:00.000Z',
      active_kind: 'combat', active_id: 'goblin',
      state: { hp: 9999, gold: 999999, skills: { [SKILL]: 99999999 } },
    };
    await entry.runTick({
      exec: execSeam,
      body: { op: 'tick', roster: [hostile], cadence_ms: CADENCE_MS, flush_ms: FLUSH_MS },
    });
    const rows = (await db.query(
      'select would_ticks, would_qty, version, delta from public.hr_tick_shadow'
      + ` where user_id = '${u}' order by id`)).rows;
    const row = rows[0] || null;
    say(`      shadow : ${JSON.stringify(row)}`);

    /* The honest comparison is against H1, which fired the SAME character shape
       with a bare `{user_id, slot}` entry. Identical numbers mean the extra
       fields were inert; a difference in either direction means one of them
       was read. */
    judge('H3a', !!row && !!h1Row
        && Number(row.would_ticks) === Number(h1Row.would_ticks)
        && Number(row.would_qty) === Number(h1Row.would_qty),
      `a roster entry carrying a forged skills map, inventory, cap, version and watermark `
      + `produced the same window as a bare one (${row && row.would_ticks} actions, `
      + `${row && row.would_qty} ore) — every field came off hr_state_of`,
      `the forged roster entry changed the window: ${row && row.would_ticks}/${row && row.would_qty} `
      + `vs ${h1Row && h1Row.would_ticks}/${h1Row && h1Row.would_qty} from a bare entry. A request `
      + 'field reached the engine.');

    judge('H3b', !!row && Number(row.version) === 1,
      'the journalled version is the DATABASE\'s 1, not the body\'s 9999',
      `the shadow row carries version ${row && row.version} — the body named it`);

    judge('H3c', !!row && row.delta && row.delta.journal
        && row.delta.journal.meta && row.delta.journal.meta.node === NODE,
      `and the window is still a ${NODE} gather, not the body's 'goblin' combat`,
      `the body's activity pointer was honoured: ${JSON.stringify(row && row.delta && row.delta.journal)}`);
  }

  // ── H4 ── THE CHAIN STILL PAYS AT THE PRODUCTION CADENCE ──────────────────
  group('H4  the same window at the 10 s cadence conserves the actions');
  {
    const u = U(4);
    await seed(u);
    const { env, capMs } = await envelopeOf(u);
    const fromMs = Date.parse(env.state.accrued_to);
    const toMs = fromMs + FLUSH_MS;
    const row = {
      user_id: u, slot: 0, shard: 0,
      active_kind: env.state.active_kind,
      active_id: env.state.active_id,
      active_since: env.state.active_since,
      accrued_to: new Date(fromMs).toISOString(),
      version: env.version,
      cap_ms: capMs,
    };
    const envIn = MUTATE ? env.state : env;
    const one = settleGatherSession(entry.sessionFromRoster(row, envIn), fromMs, toMs,
      { cadenceMs: FLUSH_MS, flushMs: FLUSH_MS, seedOf: () => SEED, holder: 'proofs' });
    const many = settleGatherSession(entry.sessionFromRoster(row, envIn), fromMs, toMs,
      { cadenceMs: CADENCE_MS, flushMs: FLUSH_MS, seedOf: () => SEED, holder: 'proofs' });
    const ticksOf = (r) => {
      const d = r.intents[0] && r.intents[0].args && r.intents[0].args.p_delta;
      return (d && d.journal) ? Number(d.journal.meta.ticks) : 0;
    };
    say(`      one-shot ${ticksOf(one)} actions in ${one.polls} poll(s); `
      + `cadence ${ticksOf(many)} actions in ${many.polls} poll(s)`);

    judge('H4a', ticksOf(many) > 0,
      `the 10 s cadence chain settled ${ticksOf(many)} actions over ${many.polls} polls`,
      `the 10 s cadence chain settled ZERO actions over ${many.polls} polls — the hydrated `
      + 'session never reaches the node');
    judge('H4b', ticksOf(many) === ticksOf(one),
      'and exactly as many as the one-shot window — the carry crosses the poll boundary '
      + '(RULE 1: chain on the engine\'s watermark)',
      `decomposition lost actions: ${ticksOf(many)} at a 10 s cadence vs ${ticksOf(one)} in one `
      + 'call. The sub-action remainder is being forfeited, not carried.');
    judge('H4c', many.unsettledMs < 12000,
      `the unsettled tail is ${many.unsettledMs} ms — under one action interval, owed not lost`,
      `the unsettled tail is ${many.unsettledMs} ms, which is more than one action interval`);
  }
} finally {
  try { await db.close(); } catch { /* the replay owns its own lifetime */ }
}

// ── THE VERDICT ─────────────────────────────────────────────────────────────
console.log('');
if (MUTATE) {
  /* UNDER --mutate THE GUARD MUST BE RED, AND RED FOR THE RIGHT REASON. The
     mutation is precisely the shipped defect, so the arms that must fail are
     the ones that measure what the engine was handed. If it passes, this file
     has stopped being a guard. */
  const MUST_FAIL = ['H1b', 'H1c', 'H1d', 'H2c', 'H2d', 'H2e', 'H4a'];
  const missed = MUST_FAIL.filter((id) => !problems.includes(id));
  if (missed.length) {
    console.log(`world-tick-hydration --mutate: FAILED — env.state-only hydration did NOT turn `
      + `${missed.join(', ')} red. The guard does not bite; do not trust a green run of it.`);
    process.exit(1);
  }
  console.log(`world-tick-hydration --mutate: green — restoring \`sessionFromRoster(row, env.state)\` `
    + `turns ${MUST_FAIL.join(', ')} red (${problems.length} arms red in total). The guard bites.`);
  process.exit(0);
}
if (problems.length) {
  console.log(`world-tick-hydration: FAILED — ${problems.join(', ')}`);
  process.exit(1);
}
console.log('world-tick-hydration: green — one envelope, one field list, and the tick hands the '
  + 'engine what the accrue path hands it.');
