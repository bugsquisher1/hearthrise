// ════════════════════════════════════════════════════════════════════════
// tests/recovery-rest.mjs — THE RECOVERY RULE's SQL half, PROVEN ON A REAL
// DATABASE (supabase/migrations/2026-09-06-recovering-until.sql, rev. 2).
//
// The JS half of the rule — the ladder, the 40% resume, the gating, the
// per-death payload — is asserted by tests/accrual-engine.mjs RECOVER-1..8.
// This guard asserts the half that lives in Postgres, by EXECUTION against the
// real ordered migration chain (bootReplay):
//
//   1. hr_rest EATS. A knocked-out, hurt character with provisions in the bag is
//      healed to FULL, the timer is CLEARED, and the SERVER chose what to eat —
//      no quantity, item id or heal value crosses the wire.
//   2. hr_rest is ALL-OR-NOTHING. A bag that cannot cover the missing health is
//      refused `insufficient_food` and NOTHING is eaten (the b372 half-undo).
//   3. hr_rest is IDEMPOTENT. A replayed intent id eats no second meal.
//   4. hr_rest refuses a FREE CURE (`not_hurt`) and a character who is UP
//      (`not_recovering`).
//   5. hr_rest refuses an UNPAID WINDOW (`collect_first`) — clearing the line
//      before the window is priced would let the engine re-simulate the
//      knockout as fighting time and PAY the player for their recovery.
//   6. hr_apply WRITES `recovering_until` absolute, REFUSES a forgery past the
//      ceiling (`bad_recovering`), ADMITS an honest 64-minute ladder stamp, and
//      is NOT voided by an activity switch (exploit R2).
//   7. hr_apply FANS OUT the death ledger: one `player_ledger` row per death,
//      kind='combat' intent='death', value-free, and REFUSES an over-long array.
//   8. hr_set_auto_eat STAMPS `auto_eat_set_at` on EVERY call — including the
//      "Keep it off" call — and hr_state_of projects `auto_eat_touched`, so the
//      one-time switch-on offer can never be made twice.
//
// ── THE MUTATION PROOF (run: node tests/recovery-rest.mjs --selftest) ──────
// Each entry plants a REAL defect this suite claims to catch; --selftest demands
// every one turns the run RED. A guard that cannot be made to fail is not a guard.
//
// Run GREEN:  node tests/recovery-rest.mjs
// Prove RED:  node tests/recovery-rest.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const FILE = '2026-09-06-recovering-until.sql';
const uidFor = (n) => `000000e5-0000-0000-0000-0000000000${n}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────── */
const MUTATIONS = {
  rest_eats_nothing: {
    file: FILE,
    why: 'hr_rest clears the timer without consuming provisions — a free cure, and the ladder deleted',
    find: '      update public.player_inventory\n         set qty = qty - v_take',
    repl: '      update public.player_inventory\n         set qty = qty - 0',
  },
  rest_partial_ok: {
    file: FILE,
    why: 'the shortfall check is disarmed — a bag that cannot cover the gap is eaten anyway and the '
       + 'character stands up for free (worse: it eats AND stands them up)',
    find: "    if v_left > 0 then\n      perform public.hr_reject('insufficient_food'",
    repl: "    if false then\n      perform public.hr_reject('insufficient_food'",
  },
  rest_replay_off: {
    file: FILE,
    why: 'the idempotency replay branch is removed — a double tap on a flaky connection eats twice',
    find: "  if v_cached is not null then\n    return public.hr_state_of(v_uid, v_slot) || v_cached || jsonb_build_object('replayed', true);",
    repl: "  if false then\n    return public.hr_state_of(v_uid, v_slot) || v_cached || jsonb_build_object('replayed', true);",
  },
  rest_free_cure: {
    file: FILE,
    why: 'the full-health refusal is gone — a character at max HP clears their timer for nothing',
    find: "    if v_need <= 0 then perform public.hr_reject('not_hurt'); end if;",
    repl: '    if false then perform public.hr_reject(\'not_hurt\'); end if;',
  },
  rest_mid_window: {
    file: FILE,
    why: 'the unpaid-window refusal is gone — the knockout is cleared BEFORE it is priced, so the '
       + 'next settle re-simulates it as fighting time and PAYS the player for their recovery',
    find: "    if v_st.active_kind <> 'idle' and now() - v_st.accrued_to >= c_collect_grace then\n      perform public.hr_reject('collect_first'",
    repl: "    if false then\n      perform public.hr_reject('collect_first'",
  },
  rest_not_recovering: {
    file: FILE,
    why: 'hr_rest works on a character who is UP — a free full heal on demand, once per hour',
    find: "    if v_st.recovering_until is null or v_st.recovering_until <= now() then\n      perform public.hr_reject('not_recovering');",
    repl: "    if false then\n      perform public.hr_reject('not_recovering');",
  },
  ceiling_back_to_15m: {
    file: FILE,
    why: 'the hr_apply ceiling is back at rev. 1\'s 15 minutes, so every honest stamp from the fifth '
       + 'fall of a day onward is refused as a forgery and the top of the ladder silently disappears',
    find: '  c_max_recover_ms constant int := 4200000;',
    repl: '  c_max_recover_ms constant int := 900000;',
  },
  ceiling_off: {
    file: FILE,
    why: 'the blast radius on recovering_until is gone — a compromised engine can park a character '
       + 'face-down for a week',
    find: '        if v_recover > now() + make_interval(secs => c_max_recover_ms / 1000.0) then',
    repl: '        if false then',
  },
  deaths_unbounded: {
    file: FILE,
    why: 'the death-row array is unbounded — one settle can write a ledger row per tick, which is '
       + 'the game_events mistake (1.6M rows from six players) at ledger scale',
    find: "      if jsonb_array_length(p_delta->'deaths') > c_max_death_rows then",
    repl: '      if false then',
  },
  deaths_not_written: {
    file: FILE,
    why: 'the death-ledger fan-out is gone — a death leaves no audit trail and the rung it was '
       + 'charged at is unrecoverable after the fact',
    find: "    if p_delta ? 'deaths' then\n      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop\n        insert into public.player_ledger",
    repl: "    if false then\n      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop\n        insert into public.player_ledger",
  },
  autoeat_stamp_off: {
    file: FILE,
    why: 'hr_set_auto_eat no longer stamps auto_eat_set_at, so `auto_eat_touched` never becomes true '
       + 'and the one-time switch-on offer is made on every single boot, forever',
    find: '         auto_eat_set_at  = now(),',
    repl: '         auto_eat_pct     = v_pct,',
  },
  touched_not_projected: {
    file: FILE,
    why: 'hr_state_of stops projecting auto_eat_touched, so the client cannot tell a DECISION from a '
       + 'default and re-prompts a player who said "Keep it off"',
    find: "      'auto_eat_touched', (v_st.auto_eat_set_at is not null),",
    repl: "      'auto_eat_touched_x', (v_st.auto_eat_set_at is not null),",
  },
  recovery_refuses_gathering: {
    js: 'supabase/functions/hr-accrue/set-activity.js',
    why: 'the recovery refusal widens back to every payable kind (rev. 2) — a knocked-out player is '
       + 'refused the fishing that is the CURE the knockout exists to teach, which is the 45-minute '
       + 'dead sit measured on live b524',
    find: '  if (recoveryRefuses(decl.kind)) {',
    repl: '  if (PAYABLE_KINDS.includes(decl.kind)) {',
  },
  recovery_refuses_nothing: {
    js: 'supabase/functions/hr-accrue/set-activity.js',
    why: 'the recovery refusal is disarmed entirely — a knocked-out character starts a FIGHT, which '
       + 'is exploit R1: earning combat output while down, and the whole ladder deleted',
    find: '  if (recoveryRefuses(decl.kind)) {',
    repl: '  if (false) {',
  },
  counters_not_projected: {
    file: FILE,
    why: 'hr_state_of stops projecting deaths_today, so the ladder always reads 0 and EVERY fall is '
       + "the day's free one — the whole escalation deleted, silently",
    find: "      'deaths_today',    coalesce((select pp.value from public.player_progress pp",
    repl: "      'deaths_today_x',  coalesce((select pp.value from public.player_progress pp",
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

async function boot(mutate) {
  const m = mutate ? MUTATIONS[mutate] : null;
  const patches = (m && !m.js)
    ? new Map([[m.file, [[m.find, m.repl]]]])
    : undefined;
  const { db } = await bootReplay(patches ? { patches } : {});
  return db;
}

/* ── THE EDGE INTENT, IMPORTED — AND PATCHABLE (b527) ───────────────────
   §10 asserts a rule that lives in JAVASCRIPT (set-activity.js §1b) against the
   real SQL chain this file already boots, so the mutation catalogue had to learn
   to patch a JS file as well as a migration. Same contract as the SQL half: the
   anchor must match EXACTLY ONCE and must change the text — a planted bug that
   was never planted is decoration.

   THE WHOLE FUNCTION DIRECTORY IS COPIED, at the same depth relative to the repo
   root, because these modules reach ../../../src/core/** and a lone patched file
   would import the UNPATCHED siblings (which is how a mutation slips). */
const REPO = new URL('..', import.meta.url);
async function loadIntent(mutate) {
  const { readFile, writeFile, mkdtemp, cp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const root = fileURLToPath(REPO);
  const m = mutate ? MUTATIONS[mutate] : null;
  if (!m || !m.js) {
    return import(pathToFileURL(join(root, 'supabase/functions/hr-accrue/set-activity.js')).href
      + `?t=${Date.now()}${Math.random()}`);
  }
  const src = (await readFile(join(root, m.js), 'utf8')).replace(/\r\n/g, '\n');
  const n = src.split(m.find).length - 1;
  if (n !== 1) throw new Error(`mutation ${mutate}: anchor matched ${n} times (need exactly 1)`);
  const after = src.replace(m.find, m.repl);
  if (after === src) throw new Error(`mutation ${mutate}: produced identical text`);
  const base = await mkdtemp(join(tmpdir(), 'hr-rr-'));
  await cp(join(root, 'supabase/functions/hr-accrue'), join(base, 'supabase/functions/hr-accrue'), { recursive: true });
  await cp(join(root, 'src'), join(base, 'src'), { recursive: true });
  await writeFile(join(base, m.js), after, 'utf8');
  return import(pathToFileURL(join(base, m.js)).href);
}

/* Call as the PLAYER. auth.uid() reads `request.jwt.claim.sub` — the GUC
   Supabase surfaces the JWT subject on, and the seam tests/auto-eat-authority
   .mjs and tests/conservation-fuzz.mjs already drive. */
async function asPlayer(db, uid, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  const r = await db.query(sql, params);
  return r.rows[0];
}

/** A character who is KNOCKED OUT and hurt, with `bag` provisions. */
async function seed(db, uid, o = {}) {
  const hp = o.hp ?? 4;
  const maxHp = o.maxHp ?? 10;
  const until = o.until === null ? 'null' : `now() + interval '${o.untilSecs ?? 600} seconds'`;
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  const kind = o.activeKind ?? 'idle';
  /* `player_state_activity_chk`: a non-idle pointer must name a target. */
  const aid = kind === 'idle' ? 'null' : "'slime'";
  await db.exec(`insert into public.player_state
      (user_id, slot, gold, gems, hp, max_hp, version, active_kind, active_id, accrued_to, recovering_until)
    values ('${uid}', 0, 0, 0, ${hp}, ${maxHp}, 1, '${kind}', ${aid},
            now() - interval '${o.unpaidSecs ?? 0} seconds', ${until})
    on conflict (user_id, slot) do update set
      hp = ${hp}, max_hp = ${maxHp}, version = 1, active_kind = '${kind}', active_id = ${aid},
      accrued_to = now() - interval '${o.unpaidSecs ?? 0} seconds', recovering_until = ${until};`);
  await db.exec(`delete from public.player_inventory where user_id='${uid}' and slot=0;`);
  for (const [id, qty] of Object.entries(o.bag || {})) {
    await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                   values ('${uid}', 0, '${id}', ${qty});`);
  }
}

const rest = (db, uid, intent) => asPlayer(db, uid,
  'select public.hr_rest($1::int, $2::uuid) as r', [0, intent]).then((row) => row.r);
const stateRow = async (db, uid) => (await db.query(
  `select hp, max_hp, recovering_until, auto_eat_enabled, auto_eat_set_at, version
     from public.player_state where user_id=$1 and slot=0`, [uid])).rows[0];
const invQty = async (db, uid, id) => {
  const r = await db.query(
    `select coalesce(qty,0) q from public.player_inventory where user_id=$1 and slot=0 and item_id=$2`,
    [uid, id]);
  return r.rows.length ? Number(r.rows[0].q) : 0;
};

async function runAll(db, mutate) {
  /* THE PROVISION IS READ OUT OF THE SERVER'S OWN CATALOGUE, never named here:
     a test that hard-coded an item id would silently start testing nothing the
     day src/data changes. The weakest auto-eatable food is the one hr_rest's
     "weakest first" order picks, so it is also the one whose count is
     predictable. */
  const foods = (await db.query(
    `select item_id, heals from public.hr_items
      where auto_eatable and coalesce(heals,0) > 0 order by heals asc, item_id asc limit 2`)).rows;
  ok(foods.length >= 2, 'SETUP: the catalogue carries fewer than two auto-eatable foods');
  const WEAK = foods[0].item_id;
  const WEAK_HEALS = Number(foods[0].heals);
  const STRONG = foods[foods.length - 1].item_id;

  // ── 1. hr_rest EATS, HEALS TO FULL, CLEARS THE TIMER. ─────────────────────
  {
    const A = uidFor('a1');
    const maxHp = 10 + WEAK_HEALS * 3;
    await seed(db, A, { hp: 10, maxHp, bag: { [WEAK]: 50 } });
    const before = await invQty(db, A, WEAK);
    const r = await rest(db, A, uuid());
    ok(r && r.ok === true, `hr_rest ok (got ${JSON.stringify(r && r.error)})`);
    const st = await stateRow(db, A);
    ok(Number(st.hp) === Number(st.max_hp), `rested to FULL (${st.hp}/${st.max_hp})`);
    ok(st.recovering_until === null, 'the recovery timer was CLEARED');
    const eaten = before - (await invQty(db, A, WEAK));
    ok(eaten > 0, 'hr_rest ate nothing at all');
    /* THE SERVER CHOSE THE AMOUNT: exactly enough of the WEAKEST food to cover
       the gap, and not one unit more. The client sent no quantity. */
    ok(eaten === Math.ceil((Number(st.max_hp) - 10) / WEAK_HEALS),
      `hr_rest ate ${eaten} x ${WEAK} to cover ${Number(st.max_hp) - 10} HP at ${WEAK_HEALS} each — `
      + `expected ${Math.ceil((Number(st.max_hp) - 10) / WEAK_HEALS)}. The server picks the amount; `
      + 'over-eating is a value transfer nobody asked for.');
    ok(Number(r.rested.healed_hp) >= Number(st.max_hp) - 10, 'the receipt under-reports the heal');
    const led = (await db.query(
      `select count(*)::int c from public.player_ledger
        where user_id=$1 and slot=0 and kind='combat' and intent='rest'`, [A])).rows[0].c;
    ok(Number(led) === 1, `one journalled rest row (got ${led})`);
  }

  // ── 2. ALL-OR-NOTHING on a bag that cannot cover the gap. ─────────────────
  {
    const B = uidFor('b2');
    await seed(db, B, { hp: 1, maxHp: 100000, bag: { [WEAK]: 2 } });
    const r = await rest(db, B, uuid());
    ok(r && r.error === 'insufficient_food',
      `a bag that cannot cover the gap is refused insufficient_food (got ${r && r.error})`);
    ok(await invQty(db, B, WEAK) === 2,
      'a REFUSED rest still ate the bag — the worst outcome available (hungry AND still down)');
    const st = await stateRow(db, B);
    ok(st.recovering_until !== null, 'a refused rest cleared the timer anyway');
    ok(Number(st.hp) === 1, 'a refused rest healed anyway');
  }

  // ── 3. IDEMPOTENT: one meal per intent id. ───────────────────────────────
  {
    const C = uidFor('c3');
    await seed(db, C, { hp: 1, maxHp: 1 + WEAK_HEALS, bag: { [WEAK]: 50 } });
    const key = uuid();
    const r1 = await rest(db, C, key);
    ok(r1 && r1.ok === true, `first rest ok (got ${JSON.stringify(r1 && r1.error)})`);
    const after1 = await invQty(db, C, WEAK);
    /* Put the character back on the floor and replay the SAME key. A verb that
       is not replay-safe eats a second meal on every lost response. */
    await db.exec(`update public.player_state set hp = 1,
                     recovering_until = now() + interval '600 seconds'
                   where user_id='${C}' and slot=0;`);
    const r2 = await rest(db, C, key);
    ok(r2 && r2.replayed === true, `replay marked replayed:true (got ${JSON.stringify(r2 && r2.error)})`);
    ok(await invQty(db, C, WEAK) === after1, 'a replayed rest ate a SECOND meal');
  }

  // ── 4. THE TWO FUSES: no free cure, and nothing to rest off. ─────────────
  {
    const D = uidFor('d4');
    await seed(db, D, { hp: 10, maxHp: 10, bag: { [WEAK]: 50 } });   // knocked out, FULL health
    const r = await rest(db, D, uuid());
    ok(r && r.error === 'not_hurt',
      `a rest that heals nothing is refused not_hurt (got ${r && r.error})`);
    const st = await stateRow(db, D);
    ok(st.recovering_until !== null, 'a not_hurt refusal cleared the timer — that IS the free cure');

    const E = uidFor('e5');
    await seed(db, E, { hp: 1, maxHp: 100, until: null, bag: { [WEAK]: 500 } });
    const r2 = await rest(db, E, uuid());
    ok(r2 && r2.error === 'not_recovering',
      `a character who is UP is refused not_recovering (got ${r2 && r2.error})`);
    ok(await invQty(db, E, WEAK) === 500, 'a not_recovering refusal ate the bag');
  }

  // ── 5. THE UNPAID WINDOW. ────────────────────────────────────────────────
  {
    const F = uidFor('f6');
    await seed(db, F, { hp: 1, maxHp: 100, bag: { [WEAK]: 500 },
      activeKind: 'combat', unpaidSecs: 600 });
    const r = await rest(db, F, uuid());
    ok(r && r.error === 'collect_first',
      `an unpaid window is refused collect_first (got ${r && r.error}). Clearing the line before it `
      + 'is priced lets the settle re-simulate the knockout as fighting time and PAY for it.');
    const st = await stateRow(db, F);
    ok(st.recovering_until !== null, 'a collect_first refusal cleared the timer anyway');
  }

  // ── 6. hr_apply: absolute write, ceiling, and NOT voided by a switch. ────
  {
    const G = uidFor('a7');
    await seed(db, G, { hp: 5, maxHp: 10, until: null });
    /* ⚠ THE VERSION IS READ BEFORE THE ROLE SWITCH. hr_engine holds NO table
       grants (that is the whole point of the role), so a `select` on
       player_state inside the switch is a 42501 — the definer function is the
       only thing it may call. */
    const apply = async (delta) => {
      const v = Number((await db.query(
        `select version from public.player_state where user_id=$1 and slot=0`, [G])).rows[0].version);
      await db.exec('set role hr_engine');
      try {
        const r = await db.query('select public.hr_apply($1::uuid,$2::int,$3::bigint,$4::uuid,$5::jsonb) as res',
          [G, 0, v, uuid(), JSON.stringify(delta)]);
        return r.rows[0].res;
      } finally { await db.exec('reset role'); }
    };
    /* (a) AN HONEST 64-MINUTE LADDER STAMP IS ADMITTED. This is the assertion
       that would have caught rev. 1's 15-minute ceiling silently deleting the
       top four rungs of the ladder in production. */
    const cap = new Date(Date.now() + 3840000 + 5000).toISOString();
    const rc = await apply({ recovering_until: cap, journal: { kind: 'combat', intent: 'test' } });
    ok(rc && rc.ok === true,
      `an honest 64-minute (RECOVERY_CAP_MS) stamp was refused: ${JSON.stringify(rc && rc.error)}. `
      + 'The ceiling must admit the ladder\'s own cap or the top rungs never land.');
    ok((await stateRow(db, G)).recovering_until !== null, 'hr_apply did not write recovering_until');
    /* (b) A FORGERY PAST THE CEILING IS REFUSED, NOT CLAMPED. */
    const week = new Date(Date.now() + 7 * 86400000).toISOString();
    const rf = await apply({ recovering_until: week, journal: { kind: 'combat', intent: 'test' } });
    ok(rf && rf.error === 'bad_recovering',
      `a week-long stamp was accepted (got ${JSON.stringify(rf && rf.ok)}) — the blast radius is gone`);
    /* (c) EXPLOIT R2: an activity switch does NOT cure a knockout. */
    const before = (await stateRow(db, G)).recovering_until;
    const rs = await apply({ activity: { kind: 'idle', id: null }, journal: { kind: 'combat', intent: 'test' } });
    ok(rs && rs.ok === true, `the activity switch itself failed: ${JSON.stringify(rs && rs.error)}`);
    const after = (await stateRow(db, G)).recovering_until;
    ok(after !== null && String(after) === String(before),
      'an activity switch cleared recovering_until — "switch to fishing, switch back" is a free cure');
  }

  // ── 7. THE DEATH LEDGER: one row per death, value-free, and BOUNDED. ─────
  {
    const H = uidFor('a8');
    await seed(db, H, { hp: 5, maxHp: 10, until: null });
    const apply = async (delta) => {
      const v = Number((await db.query(
        `select version from public.player_state where user_id=$1 and slot=0`, [H])).rows[0].version);
      await db.exec('set role hr_engine');
      try {
        const r = await db.query('select public.hr_apply($1::uuid,$2::int,$3::bigint,$4::uuid,$5::jsonb) as res',
          [H, 0, v, uuid(), JSON.stringify(delta)]);
        return r.rows[0].res;
      } finally { await db.exec('reset role'); }
    };
    const row = (n) => ({ monster: 'slime', recovery_ms: n * 120000, deaths_today: n,
      deaths_lifetime: n + 10, resume_hp: 4, auto_eat_enabled: false, food_in_bag: false });
    const r = await apply({ deaths: [row(1), row(2), row(3)],
      journal: { kind: 'combat', intent: 'accrue' } });
    ok(r && r.ok === true, `a delta with death rows was refused: ${JSON.stringify(r && r.error)}`);
    const led = (await db.query(
      `select count(*)::int c, sum(coalesce(gold,0)+coalesce(gold_in,0)+coalesce(xp_in,0)
                                   +coalesce(qty_in,0))::int v
         from public.player_ledger
        where user_id=$1 and slot=0 and kind='combat' and intent='death'`, [H])).rows[0];
    ok(Number(led.c) === 3, `three deaths wrote ${led.c} ledger rows — it must be exactly one each`);
    ok(Number(led.v) === 0,
      'a death ledger row carries a VALUE stamp — a death moves no value and must never enter the '
      + 'daily progression budget or a conservation sum');
    const meta = (await db.query(
      `select meta from public.player_ledger where user_id=$1 and intent='death'
        order by id asc limit 1`, [H])).rows[0].meta;
    ok(Number(meta.deaths_today) === 1 && Number(meta.recovery_ms) === 120000
       && meta.monster === 'slime',
      `the death row does not carry the rung it was charged at (${JSON.stringify(meta)})`);
    /* THE BOUND. 25 rows is over the 24 the ladder can produce; hr_apply must
       REFUSE rather than write, or a compromised engine has a per-tick ledger. */
    const many = Array.from({ length: 25 }, (_, i) => row(i + 1));
    const rb = await apply({ deaths: many, journal: { kind: 'combat', intent: 'accrue' } });
    ok(rb && rb.error === 'bad_deaths',
      `a 25-row death array was accepted (${JSON.stringify(rb && rb.ok)}) — the fan-out is unbounded`);
    const after = (await db.query(
      `select count(*)::int c from public.player_ledger where user_id=$1 and intent='death'`,
      [H])).rows[0].c;
    ok(Number(after) === 3, `the refused delta still wrote rows (${after} total, expected 3)`);
  }

  // ── 8. THE AUTO-EAT TOUCH STAMP. ─────────────────────────────────────────
  {
    const I = uidFor('a9');
    await seed(db, I, { hp: 5, maxHp: 10, until: null });
    let st = await stateRow(db, I);
    ok(st.auto_eat_set_at === null,
      'a fresh character already carries a touch stamp — every one of them would be denied the '
      + 'one-time switch-on offer');
    let env = (await db.query(`select public.hr_state_of($1::uuid, 0) as e`, [I])).rows[0].e;
    ok(env.state.auto_eat_touched === false,
      `hr_state_of does not project auto_eat_touched:false for an untouched character `
      + `(got ${JSON.stringify(env.state.auto_eat_touched)})`);

    /* "KEEP IT OFF" — the answer that must ALSO silence the offer. It is the
       call this stamp exists for: switching it ON obviously counts as a
       decision, and a stamp that only fired on the way on would re-prompt the
       one population that has already said no. */
    const off = await asPlayer(db, I,
      'select public.hr_set_auto_eat($1::int,$2::boolean,$3::text,$4::int,$5::boolean) as r',
      [0, false, null, null, false]);
    ok(off.r && off.r.ok === true, `hr_set_auto_eat(false) failed: ${JSON.stringify(off.r)}`);
    st = await stateRow(db, I);
    ok(st.auto_eat_set_at !== null,
      'hr_set_auto_eat(false) did NOT stamp auto_eat_set_at — a player who chose "Keep it off" '
      + 'would be re-prompted on every boot, forever');
    ok(st.auto_eat_enabled === false, 'hr_set_auto_eat(false) turned it ON');
    env = (await db.query(`select public.hr_state_of($1::uuid, 0) as e`, [I])).rows[0].e;
    ok(env.state.auto_eat_touched === true,
      'hr_state_of does not project the touch, so the client cannot tell a DECISION from a default');

    /* AND THE MIGRATION DID NOT BULK-WRITE THE SWITCH. `auto_eat_enabled` has
       exactly one writer; a row that is enabled with no stamp proves a second. */
    const bad = (await db.query(
      `select count(*)::int c from public.player_state where auto_eat_enabled and auto_eat_set_at is null`
    )).rows[0].c;
    ok(Number(bad) === 0,
      `${bad} row(s) are auto_eat_enabled with no touch stamp — something other than hr_set_auto_eat `
      + 'wrote the switch');
  }

  // ── 9. THE LADDER'S COUNTERS ARE PROJECTED AS SCALARS. ───────────────────
  {
    const J = uidFor('b1');
    await seed(db, J, { hp: 5, maxHp: 10, until: null });
    await db.exec(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
                   values ('${J}', 0, 'stat', 'deaths', '', 17, 'active'),
                          ('${J}', 0, 'stat', 'deaths', public.hr_utc_day_key(now()), 4, 'active');`);
    const env = (await db.query(`select public.hr_state_of($1::uuid, 0) as e`, [J])).rows[0].e;
    ok(Number(env.state.deaths_lifetime) === 17 && Number(env.state.deaths_today) === 4,
      `hr_state_of projects deaths_lifetime=${env.state.deaths_lifetime} / `
      + `deaths_today=${env.state.deaths_today}, expected 17 / 4. If these read 0 the ladder gives `
      + "every fall the day's free rung and the whole escalation is deleted, silently.");
    /* AND THEY SURVIVE A TRUNCATED `progress` ARRAY. 1200 ordinary rows push the
       deaths rows out of hr_state_of's LIMIT-ed projection; the scalars are read
       directly and must be unaffected. THAT is why they are scalars.
       ⚠ NOT `ev:loot:%` / `ev:kill_monster:%` rows — those two populations are
         deliberately EXCLUDED from the generic envelope (Slices 1+2, served by
         hr_collection_of / hr_bestiary_of), so padding with them truncates
         nothing and the assertion below would be vacuous. */
    await db.exec(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
                   select '${J}', 0, 'quest', 'pad_row_'||g, '', 1, 'active'
                     from generate_series(1, 1200) g;`);
    const env2 = (await db.query(`select public.hr_state_of($1::uuid, 0) as e`, [J])).rows[0].e;
    ok(env2.progress_truncated === true,
      'SETUP: the progress array did not truncate, so the assertion below is vacuous');
    ok(Number(env2.state.deaths_lifetime) === 17 && Number(env2.state.deaths_today) === 4,
      'the death counters vanished when the progress array truncated. A survival mechanic must not '
      + 'depend on a truncatable read — that is the whole reason they are their own scalars.');
  }

  // ── 10. THE RECOVERY WINDOW REFUSES **COMBAT**, AND NOTHING ELSE. ────────
  /* THE RULING (game-designer, 2026-09-08, rev. 3). Rev. 2's set-activity.js
     §1b refused every payable kind while `recovering_until` was ahead. Measured
     on live b524 that left a solvent Fishing-9 / Cooking-15 character with an
     empty food bag NO LEGAL MOVE for 45 minutes: the rule blocked the very
     gathering that is the CURE the knockout exists to teach. Rev. 3 refuses
     `combat` alone — `RECOVERY_REFUSED_KINDS` in src/core/away.js, the ONE array
     both runtimes read.

     THIS IS THE AWAY/ENGINE DOOR of §4's both-path rule (the attended door is
     src/features/smoke-test.js RECOVER-16). It runs the REAL intent module — the
     same bytes tools/pack-edge.mjs ships — against the REAL migration chain this
     file already boots, so neither half is modelled.

     WHAT IT DOES NOT PROVE, stated rather than implied: the `hr_engine` role.
     The seam here runs as the owner; tests/activity-intent.mjs drives the same
     module under `set local role hr_engine` and that is where the grants are
     asserted. This section is about ONE branch — which declared kinds §1b
     refuses — and the role does not participate in it.

     ⚠ THE LADDER IS UNTOUCHED BY DESIGN AND §10d SAYS SO. `recoveryFor` prices
       FIGHTERS; its bands are ratios of a foodless fighter to a fed one, both
       fighting. If a change to the refusal ever moved a rung, that is a repricing
       nobody asked for and it fails here rather than in a player's night. */
  {
    const sa = await loadIntent(mutate);
    const away = await import('../src/core/away.js');
    /* The seam index.ts hands the module: one statement, rows out. */
    const exec = async (text, params) => (await db.query(text, params)).rows;

    const K = uidFor('c1');
    await db.exec(`insert into auth.users (id) values ('${K}') on conflict (id) do nothing;`);
    /* Made the way a real player's is — hr_create_character reads auth.uid(),
       so it is called AS the player, exactly as PostgREST would. */
    const made = await asPlayer(db, K, 'select public.hr_create_character(0) as r');
    ok(made && made.r && (made.r.ok === true || made.r.error === 'already_exists'),
      `SETUP: hr_create_character returned ${JSON.stringify(made && made.r)}`);

    /* THE TARGETS COME OUT OF THE SERVER'S OWN CATALOGUE. A test that named a
       node id would silently start testing nothing the day src/data changes. */
    const pick = async (kind) => (await db.query(
      `select activity_id as id from public.hr_activities
        where kind = $1 and coalesce(req_lv, 1) <= 1 order by activity_id limit 1`, [kind])).rows[0];
    const GATHER = await pick('gather');
    const COMBAT = await pick('combat');
    ok(!!GATHER && !!COMBAT,
      `SETUP: the catalogue has no level-1 gather/combat row (${JSON.stringify({ GATHER, COMBAT })})`);

    const knock = async (aheadSecs) => db.exec(
      `update public.player_state
          set recovering_until = ${aheadSecs === null ? 'null' : `now() + interval '${aheadSecs} seconds'`},
              active_kind = 'idle', active_id = null, accrued_to = now()
        where user_id = '${K}' and slot = 0;`);
    const call = (kind, id) => sa.runSetActivity({
      exec, user: K, slot: 0, intentId: uuid(), activity: { kind, id },
    });

    if (GATHER && COMBAT) {
      // (a) THE RULE ITSELF, from its one definition.
      ok(away.recoveryRefuses('combat') && !away.recoveryRefuses('gather')
        && !away.recoveryRefuses('artisan'),
        'RECOVERY_REFUSED_KINDS is not the rev. 3 set (combat only): '
        + JSON.stringify(away.RECOVERY_REFUSED_KINDS));
      ok(away.RECOVERY_REFUSED_KINDS.every((k) => sa.SETTABLE_KINDS.includes(k)),
        'a refused kind is not even SETTABLE — §1b is gating a door that does not exist');

      // (b) KNOCKED OUT: the fight is refused, with the countdown on the refusal.
      await knock(900);
      const fight = await call('combat', COMBAT.id);
      ok(fight.status === 409 && fight.body && fight.body.error === 'recovering',
        `a knocked-out character was allowed to declare COMBAT: ${fight.status} `
        + `${JSON.stringify(fight.body).slice(0, 200)}. That is exploit R1 — earning combat output `
        + 'while down — and it deletes the ladder the whole Recovery Rule is made of');
      ok(Number(fight.body.remaining_ms) > 0 && !!fight.body.until,
        `the refusal carried no countdown (${JSON.stringify(fight.body).slice(0, 160)}): a client `
        + 'that cannot render the wait polls instead');
      const afterFight = (await db.query(
        'select active_kind, active_id from public.player_state where user_id=$1 and slot=0', [K])).rows[0];
      ok(afterFight.active_kind === 'idle' && afterFight.active_id === null,
        `the refused fight still moved the pointer to ${afterFight.active_kind}:${afterFight.active_id}`);

      // (c) AND THE CURE IS OPEN, at full rate, in the same window.
      const fish = await call('gather', GATHER.id);
      ok(fish.status === 200 && fish.body && fish.body.ok === true,
        `a knocked-out character was REFUSED gathering: ${fish.status} `
        + `${JSON.stringify(fish.body).slice(0, 200)}. Rev. 3 allows it: refusing the cure is the `
        + '45-minute dead sit measured on live b524, where a solvent player had no legal move');
      const afterFish = (await db.query(
        'select active_kind, active_id, recovering_until from public.player_state '
        + 'where user_id=$1 and slot=0', [K])).rows[0];
      ok(afterFish.active_kind === 'gather' && afterFish.active_id === GATHER.id,
        `the allowed gather run did not land on the pointer (${afterFish.active_kind}:${afterFish.active_id})`);
      ok(afterFish.recovering_until && new Date(afterFish.recovering_until).getTime() > Date.now(),
        'declaring a gather run CLEARED the recovery line — gathering during recovery must not be a '
        + 'free way off the floor (exploit R2: the window is not voided by an activity switch)');

      // (d) THE LADDER DID NOT MOVE. The refusal narrowed; the price of falling did not.
      ok(away.recoveryFor({ deathsTodayBefore: 0, deathsLifetimeBefore: 99 }) === 0
        && away.recoveryFor({ deathsTodayBefore: 1, deathsLifetimeBefore: 99 }) === away.RECOVERY_BASE_MS
        && away.recoveryFor({ deathsTodayBefore: 20, deathsLifetimeBefore: 99 }) === away.RECOVERY_CAP_MS,
        'the recovery LADDER moved with the refusal narrowing. It prices FIGHTERS and its bands are '
        + 'ratios of a foodless fighter to a fed one, both fighting — letting a downed character fish '
        + 'changes no number in that table, so any change here is an unasked-for repricing');

      // (e) THE CONTROL. Stand them up and the fight goes through, or (b) proves nothing.
      await knock(null);
      const up = await call('combat', COMBAT.id);
      ok(up.status === 200 && up.body && up.body.ok === true,
        `CONTROL: a character who is UP could not declare combat: ${up.status} `
        + `${JSON.stringify(up.body).slice(0, 200)} — §1b is refusing more than the window`);
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('recovery-rest --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const saveFail = failed; failed = 0; let threw = false;
    try {
      const db = await boot(name);
      await runAll(db, name);
    } catch (e) {
      threw = true;
      console.log(`  ${name}: RED (threw / failed to apply: ${String(e.message).split('\n')[0]})`);
    }
    const wentRed = failed > 0 || threw;
    failed = saveFail;
    if (wentRed) { if (!threw) console.log(`  ${name}: RED (assertions failed) — ${MUTATIONS[name].why}`); }
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  if (bad) { console.error(`\n${bad} mutation(s) not caught — the guard is not proving what it claims.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
} else {
  const db = await boot(null);
  await runAll(db, null);
  if (failed) { console.error(`\nrecovery-rest: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('recovery-rest: all assertions passed (hr_rest eats/heals/clears, all-or-nothing, '
    + 'replay-safe, not_hurt + not_recovering + collect_first fuses; hr_apply admits the 64-minute '
    + 'ladder cap, refuses a forgery, is not voided by an activity switch; the death ledger is one '
    + 'value-free row per death and bounded; hr_set_auto_eat stamps the touch on every call and '
    + 'hr_state_of projects it; the ladder counters survive a truncated progress array; and '
    + 'set_activity §1b refuses COMBAT alone inside the window while gathering runs at full rate, '
    + 'without clearing the line or moving the ladder).');
  process.exit(0);
}
