// ════════════════════════════════════════════════════════════════════════
// tests/hearthfind-authority.mjs — THE HEARTHFIND's SQL half, PROVEN ON A REAL
// DATABASE (supabase/migrations/2026-09-08-hearthfind.sql + its generated
// catalogue), by EXECUTION against the ordered migration chain (bootReplay).
//
// The JS half — the seeded roll, the byte-parity between the attended replay and
// the away span — is asserted by tests/hearthfind-roll.mjs. This guard asserts
// the half that lives in Postgres:
//
//   1. A HONEST FIND PAYS ONCE: the trophy lands in player_inventory (qty 1), a
//      `kind='hearthfind'` player_ledger row is written carrying the odds it
//      beat, a world_finds row is broadcast, and the APPLY RECEIPT carries the
//      find so an AWAY settle can reveal it on return.
//   2. THE ODDS ARE THE SERVER'S. The journalled `one_in` equals the catalogue
//      row, and there is no delta field that could have supplied it.
//   3. EVERY SHAPE REFUSAL is `bad_hearthfind` and moves NOTHING: not an object,
//      an unknown sub-key, an unknown item, an unknown source, a MISMATCHED
//      pair (a real trophy from a real source that does not pay it).
//   4. THE ONE DOOR: a hearthfind trophy in the ordinary `items` delta is
//      refused, so the only path that can create one is the path that journals
//      and broadcasts it. "Never broadcast what the ledger did not journal" is
//      then true by construction.
//   5. THE DAILY CLAMP: the 4th find in a UTC day is DROPPED — no item, no
//      ledger row, no broadcast — while the rest of the apply still lands.
//   6. THE BROADCAST CLAMP: a second find inside 30 s still pays the trophy and
//      the ledger row but writes NO second world_finds row.
//   7. NO CLIENT WRITE PATH: world_finds has no insert/update/delete policy and
//      no client write grant, and IS readable by `authenticated`.
//   8. NO MINT LEAK: a hearthfind ledger row carries gold_in = xp_in = 0, and no
//      hearthfind trophy is tradeable, vendorable, or a priced currency.
//   9. IDEMPOTENT RE-APPLY: applying the migration a second time is a no-op —
//      hr_apply is not double-patched and the clamps are not duplicated.
//
// ── THE MUTATION PROOF (run: node tests/hearthfind-authority.mjs --selftest) ──
// Each entry plants a REAL defect this suite claims to catch; --selftest demands
// every one turns the run RED. A guard that cannot be made to fail is not a guard.
//
// Run GREEN:  node tests/hearthfind-authority.mjs
// Prove RED:  node tests/hearthfind-authority.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { bootReplay } from './schema-replay.mjs';

const FILE = '2026-09-08-hearthfind.sql';
const CAT = '2026-09-08-hearthfind-catalogue.generated.sql';
const uidFor = (n) => `000000f1-0000-0000-0000-0000000000${n}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────── */
const MUTATIONS = {
  pair_check_off: {
    file: FILE,
    why: 'the catalogue lookup is disarmed — the engine names any (source, item) pair it likes and '
       + 'hr_apply pays it, so a compromised engine mints the rarest item in the game from a slime',
    find: "      if v_hf_one is null then\n        perform public.hr_reject('bad_hearthfind',",
    repl: "      if v_hf_one is null then v_hf_one := 5000; v_hf_hours := 250; end if;\n      if false then\n        perform public.hr_reject('bad_hearthfind',",
  },
  band_check_off: {
    file: CAT,
    why: 'the catalogue CHECK on expected_hours is gone — an operator (or a bad generation) can '
       + 'store a 2-hour "hearthfind", and Postgres, the last line of defence on the Designer\'s '
       + '100-400 hour band, stops refusing it',
    find: '      check (expected_hours is not null\n             and expected_hours >= 100 and expected_hours <= 400);',
    repl: '      check (expected_hours is not null);',
  },
  floor_off: {
    file: FILE,
    why: 'the RUNTIME hours band is gone — defence-in-depth against a row that reached the table '
       + 'past the CHECK (a hand INSERT, a restored dump, a future generator bug) is deleted, and '
       + 'such a row would pay a "hearthfind" at any rate at all',
    find: '      if v_hf_hours is null or v_hf_hours < 100 or v_hf_hours > 400 then',
    repl: '      if false then',
  },
  one_door_off: {
    file: FILE,
    why: 'a hearthfind trophy can be minted through the ordinary items delta — the mint no longer '
       + 'implies a ledger row or a broadcast, so the board and the journal can disagree',
    find: "        perform public.hr_reject('bad_hearthfind',\n          jsonb_build_object('why', 'a hearthfind trophy cannot be minted through items'));",
    repl: '        null;',
  },
  daily_clamp_off: {
    file: FILE,
    why: 'the 3-per-UTC-day ceiling is gone — an automated client can farm the board and the '
       + 'collection log without limit',
    find: '      if v_hf_today >= c_max_hf_per_day then',
    repl: '      if false then',
  },
  cosmetics_client_writable: {
    file: FILE,
    why: 'player_cosmetics is granted to the client roles — a player (or a leaked service key) can '
       + 'INSERT themselves the Wonderkeeper title with no find, no ledger row and no 1-in-22,750 '
       + 'roll behind it, which turns the rarest achievement in the game into a text field',
    find: '  grant select on public.player_cosmetics to authenticated;',
    repl: '  grant select, insert, update on public.player_cosmetics to authenticated, service_role;',
  },
  cosmetic_carries_a_number: {
    file: FILE,
    why: 'the cosmetic table grows a numeric column — a cosmetic that can carry a number is one '
       + 'migration from being a STAT, and the ruling\'s "no stat perk, ever" would then rest on a '
       + 'convention instead of on a shape a reviewer can execute',
    find: '  granted_at timestamptz not null default now(),',
    repl: '  granted_at timestamptz not null default now(),\n  power int not null default 0,',
  },
  broadcast_clamp_off: {
    file: FILE,
    why: 'the 30-second broadcast clamp is gone — one character can flood every other player\'s '
       + 'global channel, which is a social-surface denial of service',
    find: '        if v_hf_last is null or v_hf_last < now() - c_hf_broadcast then',
    repl: '        if true then',
  },
  odds_from_delta: {
    file: FILE,
    // ⚠ PAIRED, for the same reason floor_off is: "read the odds off the delta"
    //   is unreachable while the sub-key allowlist refuses the field, so the
    //   mutation opens the allowlist AND rewires the journal. The allowlist is
    //   therefore proven to be the control that keeps the odds server-authored.
    why: 'the sub-key allowlist is opened AND the journalled odds come from the delta — the number a '
       + 'player reads and screenshots ("1 in 40,000") becomes a client-authored claim',
    pairs: [
      ['      if exists (select 1 from jsonb_object_keys(v_hf) as t(hk)' + "\n"
       + "                  where hk <> all (array['item','source_kind','source_id','dropped'])) then",
       '      if false then'],
      ["                              'source_id', v_hf_src, 'one_in', v_hf_one,",
       "                              'source_id', v_hf_src, 'one_in', coalesce((p_delta->'hearthfind'->>'one_in')::bigint, v_hf_one),"],
    ],
  },
  subkeys_open: {
    file: FILE,
    why: 'unknown sub-keys are accepted — a field this arm does not implement (one_in, qty, at) '
       + 'looks like it worked, which is the b341 failure class on the rarest event in the game',
    find: "      if exists (select 1 from jsonb_object_keys(v_hf) as t(hk)\n                  where hk <> all (array['item','source_kind','source_id','dropped'])) then",
    repl: '      if false then',
  },
  world_finds_writable: {
    file: FILE,
    why: 'world_finds gains a client INSERT policy — any signed-in player can post a find they never '
       + 'made to every other player\'s screen, with no ledger row behind it',
    find: "create policy world_finds_read on public.world_finds for select to anon, authenticated using (true);",
    repl: "create policy world_finds_read on public.world_finds for select to anon, authenticated using (true);\n"
        + "create policy world_finds_forge on public.world_finds for insert to authenticated with check (true);\n"
        + "grant insert on public.world_finds to authenticated;",
  },
  reveal_lost_on_retry: {
    file: FILE,
    why: 'hr_state_of projects hearthfind_last as NULL for a character who DID find something today '
       + '- so a settle whose reply is lost to a dropped connection is retried, comes back ok, and '
       + 'the rarest thing that has ever happened to that player is never shown to them',
    find: '         order by l.at desc limit 1),',
    repl: '         order by l.at desc limit 0),',
  },
  world_finds_service_writable: {
    file: FILE,
    why: 'service_role keeps its default INSERT on world_finds - and service_role bypasses RLS, so '
       + 'a leaked service key posts forged world-record finds with no ledger row behind them',
    find: '  revoke all on public.world_finds from public, anon, authenticated, service_role;',
    repl: '  revoke all on public.world_finds from public, anon, authenticated;\n'
        + '  grant insert on public.world_finds to service_role;',
  },
  discard_not_journalled: {
    file: FILE,
    why: 'a second find inside one span is dropped SILENTLY - the player loses a 1-in-thousands '
       + 'roll and no query in the database can ever say that it happened',
    find: '      if coalesce(v_hf_drop, 0) > 0 then',
    repl: '      if false then',
  },
  trophy_vendorable: {
    file: CAT,
    why: 'a hearthfind trophy becomes vendorable — the rarest event in the game starts minting gold, '
       + 'and a gold faucet nobody balanced is attached to a 1-in-6000 roll',
    find: "  if v_bad > 0 then\n    raise exception '% hearthfind trophies are tradeable or vendorable — a find would mint gold or reach the market', v_bad;\n  end if;",
    repl: "  update public.hr_items set value = 5000 where item_id in (select item_id from public.hr_hearthfind_items);",
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

/* A mutation is either one (find, repl) pair or a `pairs` list, because two of
   the defects below are only REACHABLE as a pair: the runtime one_in floor is
   unreachable while the catalogue's CHECK constraint holds, and "read the odds
   off the delta" is unreachable while the sub-key allowlist refuses the field.
   A mutation that cannot be reached is not a proof of anything, so each of those
   plants BOTH halves and the guard must still go red. */
async function boot(mutate) {
  const m = MUTATIONS[mutate];
  const patches = mutate
    ? new Map([[m.file, m.pairs || [[m.find, m.repl]]]])
    : undefined;
  const { db } = await bootReplay(patches ? { patches } : {});
  return db;
}

async function seed(db, uid) {
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state
      (user_id, slot, gold, gems, hp, max_hp, version, active_kind, active_id, accrued_to)
    values ('${uid}', 0, 0, 0, 10, 10, 1, 'idle', null, now())
    on conflict (user_id, slot) do update set version = 1, hp = 10, max_hp = 10;`);
  await db.exec(`delete from public.player_inventory where user_id='${uid}' and slot=0;`);
  await db.exec(`delete from public.player_ledger where user_id='${uid}' and slot=0;`);
  await db.exec(`delete from public.world_finds where user_id='${uid}' and slot=0;`);
}

/* Call as the ENGINE. hr_apply is executable by hr_engine and by nothing a
   request can arrive as; the version is read BEFORE the role switch because
   hr_engine holds no table grants at all (that is the point of the role). */
function applier(db, uid) {
  return async (delta, key) => {
    const v = Number((await db.query(
      `select version from public.player_state where user_id=$1 and slot=0`, [uid])).rows[0].version);
    await db.exec('set role hr_engine');
    try {
      const r = await db.query(
        'select public.hr_apply($1::uuid,$2::int,$3::bigint,$4::uuid,$5::jsonb) as res',
        [uid, 0, v, key || uuid(), JSON.stringify(delta)]);
      return r.rows[0].res;
    } finally { await db.exec('reset role'); }
  };
}

const invQty = async (db, uid, id) => {
  const r = await db.query(
    `select coalesce(qty,0) q from public.player_inventory where user_id=$1 and slot=0 and item_id=$2`,
    [uid, id]);
  return r.rows.length ? Number(r.rows[0].q) : 0;
};
const ledgerRows = async (db, uid) => (await db.query(
  `select item_id, qty, gold, gold_in, xp_in, qty_in, meta from public.player_ledger
    where user_id=$1 and slot=0 and kind='hearthfind' order by id asc`, [uid])).rows;
const findRows = async (db, uid) => (await db.query(
  `select item_id, source_kind, source_id, one_in from public.world_finds
    where user_id=$1 and slot=0 order by id asc`, [uid])).rows;

async function runAll(db) {
  /* THE SOURCE IS READ OUT OF THE SERVER'S OWN CATALOGUE, never named here: a
     test that hard-coded an item id would silently start testing nothing the day
     the designer retunes src/data/hearthfind.js. */
  const src = (await db.query(
    `select source_kind, source_id, item_id, one_in, expected_hours
       from public.hr_hearthfind_sources
      order by one_in asc, source_id asc`)).rows;
  ok(src.length >= 2, 'SETUP: the hearthfind catalogue carries fewer than two sources');
  const S = src[0];
  const other = src.find((r) => r.item_id !== S.item_id) || src[1];
  const find = (o = {}) => ({
    hearthfind: {
      item: o.item ?? S.item_id,
      source_kind: o.kind ?? S.source_kind,
      source_id: o.id ?? S.source_id,
      ...(o.extra || {}),
    },
    journal: { kind: 'hearthfind', intent: 'accrue' },
  });

  // ── 1+2. AN HONEST FIND PAYS ONCE, WITH THE SERVER'S OWN ODDS. ───────────
  {
    const A = uidFor('a1');
    await seed(db, A);
    const apply = applier(db, A);
    const r = await apply(find());
    ok(r && r.ok === true, `an honest find was refused: ${JSON.stringify(r && r.error)}`);
    ok(await invQty(db, A, S.item_id) === 1,
      `the trophy did not land in the bag (qty ${await invQty(db, A, S.item_id)}, expected 1)`);
    const led = await ledgerRows(db, A);
    ok(led.length === 1, `${led.length} hearthfind ledger rows, expected exactly 1`);
    ok(led.length === 1 && Number(led[0].meta.one_in) === Number(S.one_in),
      `the journalled odds are ${led.length && led[0].meta.one_in}, but the catalogue says ${S.one_in} — `
      + 'the number a player screenshots must be the server\'s');
    ok(led.length === 1 && Number(led[0].gold_in) === 0 && Number(led[0].xp_in) === 0
       && Number(led[0].gold) === 0,
      'a hearthfind ledger row carries gold or XP — a find must move no currency at all');
    ok(led.length === 1 && Number(led[0].qty_in) === 1,
      'the trophy did not enter the daily item budget (qty_in must be 1)');
    const wf = await findRows(db, A);
    ok(wf.length === 1, `${wf.length} world_finds rows, expected exactly 1`);
    ok(wf.length === 1 && wf[0].item_id === S.item_id && Number(wf[0].one_in) === Number(S.one_in),
      'the broadcast row disagrees with the catalogue');
    // THE RECEIPT — this is what makes an AWAY find revealable on return.
    ok(r.hearthfind && r.hearthfind.item === S.item_id
       && Number(r.hearthfind.one_in) === Number(S.one_in)
       && r.hearthfind.broadcast === true && Number(r.hearthfind.nth_today) === 1,
      `the apply receipt does not carry the find (${JSON.stringify(r && r.hearthfind)}) — an away `
      + 'find would be silently banked with nothing to reveal');

    // ── THE COSMETICS (Designer ruling §6). A find pays a moment: one trophy,
    //    one collection-log row, an equippable TITLE and a homestead PLINTH —
    //    and NOTHING else. All server-owned, written here under the lock.
    const cos = (await db.query(
      `select kind, code, name from public.player_cosmetics
        where user_id=$1 and slot=0 order by kind, code`, [A])).rows;
    ok(cos.some((c) => c.kind === 'title'),
      `the find granted no title (${JSON.stringify(cos)}) — the ruling pays an equippable title`);
    ok(cos.some((c) => c.kind === 'plinth'),
      'the find granted no plinth — the ruling pays a homestead plinth on the first find');
    const cat = (await db.query(
      `select title_code, title_name from public.hr_hearthfind_items where item_id=$1`,
      [S.item_id])).rows[0];
    ok(!!cat && cos.some((c) => c.kind === 'title' && c.code === cat.title_code
                                && c.name === cat.title_name),
      'the granted title is not the CATALOGUE\'s title for this trophy — the code and the name '
      + 'must be looked up server-side, never hand-typed into hr_apply and never taken from a delta');
    ok(Array.isArray(r.hearthfind.unlocked) && r.hearthfind.unlocked.length === 2,
      `the receipt reports ${JSON.stringify(r.hearthfind && r.hearthfind.unlocked)} unlocked, `
      + 'expected the title and the plinth — the reveal must not have to ask a second time');
    ok(r.hearthfind.set_complete === false,
      'one trophy reported the FULL SET complete — Wonderkeeper is four distinct trophies');

    // THE GLOBAL ORDINAL. "The Nth ever found in Hearthrise", counted from the
    // journal (never from world_finds, which the broadcast clamp suppresses).
    ok(Number(r.hearthfind.nth_ever) === 1,
      `the first find in an empty realm reported ordinal ${r.hearthfind && r.hearthfind.nth_ever}, `
      + 'expected 1 — the ordinal counts the finds BEFORE this one, plus one');
    ok(led.length === 1 && Number(led[0].meta.nth_ever) === 1,
      'the ordinal is not journalled — a shareable card would outlive the only record of its claim');

    // THE PROJECTION. A server row nobody projects is a row the player never
    // sees (the residue-ahead class in reverse), and CLAUDE.md §6 forbids
    // parking earned state in the residue as a shortcut.
    const st = ((await db.query(`select public.hr_state_of($1,0) s`, [A])).rows[0].s || {}).state || {};
    ok(Array.isArray(st.hearthfind_titles) && st.hearthfind_titles.length === 1
       && st.hearthfind_titles[0].code === cat.title_code,
      `hr_state_of projects ${JSON.stringify(st.hearthfind_titles)} — the earned title must come `
      + 'back on the envelope, not out of the client residue');
    ok(st.hearthfind_plinth === true,
      'hr_state_of does not project the plinth unlock — it would be lost on reload');
  }

  // ── 2b. A DUPLICATE PAYS NOTHING NEW (ruling §6). ────────────────────────
  // "Duplicates increment + re-broadcast, pay nothing." The trophy stacks and
  // the ordinal advances, but the unlock is idempotent: a second Emberheart
  // must not re-unlock Emberborn, and a replayed apply must not double-grant.
  {
    const A2 = uidFor('ac');
    await seed(db, A2);
    const apply = applier(db, A2);
    const first = await apply(find());
    const before = Number((await db.query(
      `select count(*) n from public.player_cosmetics where user_id=$1`, [A2])).rows[0].n);
    const r2 = await apply(find());
    const after = Number((await db.query(
      `select count(*) n from public.player_cosmetics where user_id=$1`, [A2])).rows[0].n);
    ok(r2 && r2.ok === true, 'a duplicate find was refused');
    ok(after === before,
      `a duplicate find granted ${after - before} extra cosmetic row(s) — the unlock must be `
      + 'idempotent, or a replayed apply double-grants');
    ok(Array.isArray(r2.hearthfind.unlocked) && r2.hearthfind.unlocked.length === 0,
      'the receipt claims a duplicate unlocked something');
    /* RELATIVE, not absolute: the ordinal is GLOBAL, so it counts every find
       every earlier block in this file made. Asserting a literal here would be
       asserting the order of the test file, not the behaviour. */
    ok(Number(r2.hearthfind.nth_ever) === Number(first.hearthfind.nth_ever) + 1,
      `the duplicate reported ordinal ${r2.hearthfind.nth_ever} after ${first.hearthfind.nth_ever} — `
      + 'the realm ordinal advances even when the unlock does not');
  }

  // ── 3. EVERY SHAPE REFUSAL IS bad_hearthfind AND MOVES NOTHING. ──────────
  {
    const B = uidFor('b2');
    await seed(db, B);
    const apply = applier(db, B);
    const cases = [
      ['not an object', { hearthfind: 'x', journal: { kind: 'hearthfind', intent: 'accrue' } }],
      ['unknown sub-key', find({ extra: { one_in: 2 } })],
      ['unknown item', find({ item: 'bronze_sword' })],
      ['unknown source id', find({ id: 'not_a_real_source' })],
      ['unknown source kind', find({ kind: 'crop' })],
      ['mismatched pair', find({ item: other.item_id === S.item_id ? 'bronze_sword' : other.item_id })],
      ['over-long field', find({ id: 'x'.repeat(200) })],
      // `dropped` IS ACCEPTED AS A COUNT AND NOTHING ELSE. It journals a
      // rejection row and grants nothing, so every non-integer, negative,
      // fractional or absurd value is a hard refusal like any other forgery.
      ['dropped not a number', find({ extra: { dropped: '2' } })],
      ['dropped negative', find({ extra: { dropped: -1 } })],
      ['dropped fractional', find({ extra: { dropped: 1.5 } })],
      ['dropped absurd', find({ extra: { dropped: 1000 } })],
    ];
    for (const [name, delta] of cases) {
      const r = await apply(delta);
      ok(r && r.error === 'bad_hearthfind',
        `"${name}" was not refused bad_hearthfind (got ${JSON.stringify(r && (r.error || r.ok))})`);
    }
    ok((await ledgerRows(db, B)).length === 0, 'a refused find still wrote a ledger row');
    ok((await findRows(db, B)).length === 0, 'a refused find still broadcast');
    ok(await invQty(db, B, S.item_id) === 0, 'a refused find still paid a trophy');
  }

  // ── 4. THE ONE DOOR: items may not mint a trophy. ────────────────────────
  {
    const C = uidFor('c3');
    await seed(db, C);
    const apply = applier(db, C);
    const r = await apply({ items: { [S.item_id]: 5 }, journal: { kind: 'accrue', intent: 'accrue' } });
    ok(r && r.error === 'bad_hearthfind',
      `the items delta minted a hearthfind trophy (${JSON.stringify(r && (r.error || r.ok))}) — the `
      + 'mint no longer implies a ledger row, so the board and the journal can disagree');
    ok(await invQty(db, C, S.item_id) === 0, 'the refused items delta still paid the trophy');
    // …and an ORDINARY item is unaffected. Without this the guard could pass by
    // refusing every items delta, which would break the whole game.
    const r2 = await apply({ items: { bronze_sword: 1 }, journal: { kind: 'accrue', intent: 'accrue' } });
    ok(r2 && r2.ok === true, `an ordinary items delta was collaterally refused: ${JSON.stringify(r2 && r2.error)}`);
  }

  // ── 5. THE DAILY CLAMP drops the 4th find and keeps the rest of the apply. ─
  {
    const D = uidFor('d4');
    await seed(db, D);
    const apply = applier(db, D);
    for (let i = 0; i < 3; i++) {
      const r = await apply(find());
      ok(r && r.ok === true, `find #${i + 1} of the day was refused: ${JSON.stringify(r && r.error)}`);
    }
    ok((await ledgerRows(db, D)).length === 3, 'the first three finds of the day did not all land');
    const r4 = await apply({ ...find(), gold: 1234 });
    ok(r4 && r4.ok === true,
      `the 4th find REFUSED the whole apply (${JSON.stringify(r4 && r4.error)}) — a player would lose `
      + 'their entire night\'s accrual for being lucky a fourth time');
    ok((await ledgerRows(db, D)).length === 3,
      `the 4th find was paid anyway (${(await ledgerRows(db, D)).length} rows) — the daily ceiling is gone`);
    ok(await invQty(db, D, S.item_id) === 3, 'the 4th trophy was granted past the daily ceiling');
    ok(!r4.hearthfind, 'the receipt reveals a find that was never paid');
    const gold = Number((await db.query(
      `select gold from public.player_state where user_id=$1 and slot=0`, [D])).rows[0].gold);
    ok(gold === 1234, `the rest of the apply was rolled back with the dropped find (gold ${gold})`);
  }

  // ── 6. THE BROADCAST CLAMP suppresses the ROW, never the value. ──────────
  {
    const E = uidFor('e5');
    await seed(db, E);
    const apply = applier(db, E);
    await apply(find());
    const r2 = await apply(find());
    ok(r2 && r2.ok === true, `the second find inside 30 s was refused: ${JSON.stringify(r2 && r2.error)}`);
    ok((await ledgerRows(db, E)).length === 2,
      'the broadcast clamp suppressed the LEDGER row — it must only suppress the public line');
    ok(await invQty(db, E, S.item_id) === 2, 'the broadcast clamp suppressed the TROPHY');
    ok((await findRows(db, E)).length === 1,
      `${(await findRows(db, E)).length} broadcast rows inside 30 s — one character can flood the world channel`);
    ok(r2.hearthfind && r2.hearthfind.broadcast === false,
      'the receipt claims a broadcast that was suppressed');
  }

  // ── 6a. A RETRIED SETTLE DOES NOT LOSE THE REVEAL. ──────────────────────
  // hr_apply's replay path returns a FRESH hr_state_of envelope, never the
  // stored receipt (revision 2 stored the whole envelope per intent: ~690 MB
  // per player per day at the rate limit). So the receipt's `hearthfind` field
  // exists only on the FIRST response, and a settle whose reply is lost to a
  // dropped connection would come back ok with nothing to reveal -- the trophy
  // safe, the moment gone. `hearthfind_last` is the projection that closes it.
  {
    const F = uidFor('f5');
    await seed(db, F);
    const apply = applier(db, F);
    const key = uuid();
    const first = await apply(find(), key);
    ok(first && first.ok === true, `the first apply failed: ${JSON.stringify(first && first.error)}`);
    ok(first.hearthfind && first.hearthfind.item === S.item_id, 'the first apply carried no receipt');
    const again = await apply(find(), key);
    ok(again && again.replayed === true,
      `the same intent key did not replay (${JSON.stringify(again && (again.error || again.ok))})`);
    ok((await ledgerRows(db, F)).length === 1, 'the replay granted a SECOND find — idempotency is broken');
    ok((again.state||{}).hearthfind_last && (again.state||{}).hearthfind_last.item === S.item_id
       && Number((again.state||{}).hearthfind_last.one_in) === Number(S.one_in),
      `a retried settle lost the reveal (hearthfind_last=${JSON.stringify(again && (again.state||{}).hearthfind_last)}) `
      + '— the rarest thing that has ever happened to this player would never be shown to them');
    // A character with no find today projects null, so the client cannot
    // re-reveal yesterday's trophy on every load.
    const E = uidFor('f6');
    await seed(db, E);
    const st = (await db.query('select public.hr_state_of($1, 0) s', [E])).rows[0].s;
    ok(st && st.state && (st.state.hearthfind_last ?? null) === null,
      `hearthfind_last is ${JSON.stringify(st && st.state && st.state.hearthfind_last)} for a character with no find today`);
  }

  // ── 6b. A DROPPED SECOND FIND IS JOURNALLED, NOT VANISHED. ──────────────
  // hr_apply grants ONE find per apply. If the engine rolled two in one settled
  // span the surplus is reported as `dropped` and recorded through
  // hr_record_rejection — aggregated per (character, code, day), never one row
  // per event (the game_events lesson: 1.6M rows from six players in four days).
  // Before this, the second find simply ceased to exist and no query could ever
  // have told you so.
  {
    const G = uidFor('e6');
    await seed(db, G);
    const apply = applier(db, G);
    const r = await apply(find({ extra: { dropped: 1 } }));
    ok(r && r.ok === true, `a find reporting a discard was refused: ${JSON.stringify(r && r.error)}`);
    // The discard grants NOTHING extra: still one trophy, still one ledger row.
    ok(await invQty(db, G, S.item_id) === 1,
      `${await invQty(db, G, S.item_id)} trophies paid for a find with dropped:1 — the discard count `
      + 'must never become a quantity');
    ok((await ledgerRows(db, G)).length === 1, 'dropped:1 wrote more than one ledger row');
    const rej = (await db.query(
      `select count(*)::int c from public.hr_rejections
        where user_id = $1 and code = 'hearthfind_span_discard'`, [G])).rows[0].c;
    ok(Number(rej) === 1,
      `${rej} hearthfind_span_discard rejection rows, expected exactly 1 — a find the player rolled `
      + 'and never received must be visible in the database, not only in an argument about probability');
    // …and an ORDINARY find writes NO discard row, or the counter would be noise.
    const H = uidFor('e7');
    await seed(db, H);
    await applier(db, H)(find());
    const none = (await db.query(
      `select count(*)::int c from public.hr_rejections
        where user_id = $1 and code = 'hearthfind_span_discard'`, [H])).rows[0].c;
    ok(Number(none) === 0, 'a find with nothing dropped still journalled a discard');
  }

  // ── 7. NO CLIENT WRITE PATH TO world_finds; it IS publicly readable. ─────
  {
    const w = (await db.query(
      `select count(*)::int c from pg_policies where schemaname='public' and tablename='world_finds'
        and cmd in ('INSERT','UPDATE','DELETE','ALL')`)).rows[0].c;
    ok(Number(w) === 0, `${w} write policies on world_finds — a player could post a find they never made`);
    const g = (await db.query(
      `select count(*)::int c from information_schema.role_table_grants
        where table_schema='public' and table_name='world_finds'
          and grantee in ('anon','authenticated','service_role','PUBLIC')
          and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`)).rows[0].c;
    // service_role IS IN THIS LIST. Supabase's default ACL grants all three
    // roles on a new public table, and service_role bypasses RLS entirely, so
    // "no client write path" is only true if the revoke named all four. This is
    // the assertion behind the migration's self-check (i).
    ok(Number(g) === 0, `${g} client/service write grants on world_finds`);
    const rls = (await db.query(
      `select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='world_finds'`)).rows[0];
    ok(rls && rls.relrowsecurity === true, 'RLS is not enabled on world_finds');
    const sel = (await db.query(
      `select count(*)::int c from information_schema.role_table_grants
        where table_schema='public' and table_name='world_finds'
          and grantee='authenticated' and privilege_type='SELECT'`)).rows[0].c;
    ok(Number(sel) === 1,
      'world_finds is not readable by authenticated — the board is invisible and the feature is a '
      + 'private ledger row');
  }

  // ── 8. NO MINT LEAK. The Feature Slate\'s explicit "must NOT". ────────────
  {
    const bad = (await db.query(
      `select count(*)::int c from public.hr_hearthfind_items h
         join public.hr_items i on i.item_id = h.item_id
        where i.tradeable or i.value <> 0`)).rows[0].c;
    ok(Number(bad) === 0,
      `${bad} hearthfind trophies are tradeable or vendorable — a find would reach the market or mint gold`);
    const cur = (await db.query(
      `select count(*)::int c from public.hr_hearthfind_items
        where item_id in ('hearth_token','muster_seal','dungeon_scrip')`)).rows[0].c;
    ok(Number(cur) === 0, 'a priced currency is on the hearthfind allowlist');
    const minted = (await db.query(
      `select coalesce(sum(gold_in),0)::int g, coalesce(sum(xp_in),0)::int x
         from public.player_ledger where kind='hearthfind'`)).rows[0];
    ok(Number(minted.g) === 0 && Number(minted.x) === 0,
      `hearthfind rows have minted ${minted.g} gold / ${minted.x} XP across the whole suite`);
  }

  // ── 10. THE RUNTIME HOURS BAND is defence in depth, and it BITES. ───────
  // The catalogue CHECK refuses an out-of-band row, so the band check inside
  // hr_apply is only reachable by a row that got past it — a hand INSERT, a
  // restored dump, a future generator bug. To PROVE it rather than assume it,
  // this block removes the CHECK (on a throwaway PGlite database, never
  // production), plants a 2-hour source, and demands hr_apply pays nothing.
  //
  // ⚠ THE UNIT IS HOURS, not a per-roll denominator (Designer ruling §4). A
  //   2-hour source is the defect: at the shipped rates that is a find every
  //   couple of sessions, i.e. the rarest event in the game becomes routine.
  //   The old form of this block planted a 1-in-10 oneIn, which said nothing
  //   comparable across sources whose roll rates differ by more than 12x.
  {
    const F = uidFor('f6');
    await seed(db, F);
    const apply = applier(db, F);
    /* The ORIGINAL definition is captured and restored VERBATIM. Re-adding a
       hand-written `check (one_in >= 5000 ...)` instead would repair a weakened
       catalogue on the way past and make band_check_off unfalsifiable - the test
       would be asserting its own restore rather than the migration's. */
    const conDef = (await db.query(
      `select pg_get_constraintdef(c.oid) d from pg_constraint c
        where c.conrelid = 'public.hr_hearthfind_sources'::regclass and c.contype = 'c'
          and c.conname = 'hr_hearthfind_sources_hours_band'`)).rows[0];
    ok(!!conDef, 'SETUP: hr_hearthfind_sources has no CHECK on expected_hours at all');
    await db.exec('alter table public.hr_hearthfind_sources drop constraint hr_hearthfind_sources_hours_band');
    await db.query(
      `update public.hr_hearthfind_sources set expected_hours = 2 where source_kind=$1 and source_id=$2`,
      [S.source_kind, S.source_id]);
    const r = await apply(find());
    ok(r && r.error === 'bad_hearthfind',
      `a 2-expected-hour "hearthfind" was PAID (${JSON.stringify(r && (r.error || r.ok))}) — the runtime `
      + 'band is the only thing standing between a corrupt catalogue row and a common drop with a fanfare');
    ok((await ledgerRows(db, F)).length === 0, 'the out-of-band find still journalled');
    ok(await invQty(db, F, S.item_id) === 0, 'the out-of-band find still paid a trophy');
    await db.query(
      `update public.hr_hearthfind_sources set expected_hours = $3 where source_kind=$1 and source_id=$2`,
      [S.source_kind, S.source_id, S.expected_hours]);
    await db.exec('alter table public.hr_hearthfind_sources add constraint hr_hearthfind_sources_hours_band '
      + (conDef ? conDef.d : 'check (expected_hours >= 100 and expected_hours <= 400)'));
    // …and the CHECK itself refuses the row, so the floor is a SECOND lock and
    // not the only one. band_check_off is the mutation that proves this bites.
    let refused = false;
    try {
      await db.query(
        `update public.hr_hearthfind_sources set expected_hours = 2 where source_kind=$1 and source_id=$2`,
        [S.source_kind, S.source_id]);
    } catch { refused = true; }
    ok(refused, 'the catalogue CHECK admits a 2-hour source — Postgres has stopped refusing to STORE '
      + 'an out-of-band rate, which is the last line of defence on the Designer\'s 100-400 hour band');
  }

  // ── 9. IDEMPOTENT RE-APPLY. ─────────────────────────────────────────────
  {
    const sql = (await readFile(new URL(`../supabase/migrations/${FILE}`, import.meta.url), 'utf8'))
      .replace(/\r\n/g, '\n');
    const before = (await db.query(
      `select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) d`)).rows[0].d;
    await db.exec(sql);
    const after = (await db.query(
      `select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) d`)).rows[0].d;
    ok(before === after,
      're-applying the migration CHANGED hr_apply — the patch is not a no-op on re-apply, so a '
      + 'repeated apply double-inserts the clamps');
    const n = (after.match(/c_max_hf_per_day/g) || []).length;
    /* declare + the `v_hf_today >= c_max_hf_per_day` test + the rejection
       payload's `'limit', c_max_hf_per_day`. A double-applied patch doubles it. */
    ok(n === 3, `c_max_hf_per_day appears ${n} times in hr_apply (declare + test + payload = 3); `
      + 'more than that means the anchored patch was inserted twice');
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('hearthfind-authority --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const saveFail = failed; failed = 0; let threw = false;
    try {
      const db = await boot(name);
      await runAll(db);
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
  await runAll(db);
  if (failed) { console.error(`\nhearthfind-authority: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('hearthfind-authority: all assertions passed (an honest find pays one trophy + one '
    + 'ledger row + one broadcast + a receipt, with the SERVER\'s odds; every shape forgery is '
    + 'bad_hearthfind and moves nothing; the items delta cannot mint a trophy; the 3-per-UTC-day '
    + 'clamp drops the find without costing the apply; the 30s clamp suppresses only the public '
    + 'line; world_finds is public-read and client-unwritable; no hearthfind row mints gold, XP or '
    + 'a priced currency; re-apply is a no-op).');
  process.exit(0);
}
