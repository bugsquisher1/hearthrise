#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/open-beta.mjs — THE INVITE GATE IS A SWITCH, GRADED AGAINST REAL
//                       POSTGRESQL.
//
//   node tests/open-beta.mjs             # the guard
//   node tests/open-beta.mjs --list      # the mutation catalogue
//   node tests/open-beta.mjs --selftest  # every mutation must be CAUGHT
//   node tests/open-beta.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-08-23-open-beta.sql
//
// ── WHAT THIS EXISTS FOR ────────────────────────────────────────────────
// b457 made an invite code mandatory; open-beta makes that conditional on a
// row. A switch has FOUR behaviours, not one, and three of them are the kind
// that fail silently:
//
//   · gate OFF, no code       → allowed        (the new normal)
//   · gate OFF, bad code      → REFUSED        (the ruling — a typo must not
//                                               silently succeed)
//   · gate OFF, valid code    → allowed AND CONSUMED, exactly once
//   · gate ON, anything       → b457, byte for byte  (re-closing must work)
//
// Only the first of those is exercised by using the game. The other three are
// exactly the shape that reads as fine and is discovered months later by
// counting accounts against invites — which is how b457's own 5-of-8 was found.
//
// ── WHY IT ADDS TWO COLUMNS TO THE FIXTURE ──────────────────────────────
// tests/sql/pglite-fixture.sql declares auth.users as (id, email): the
// migrations only ever use it as an FK target, so a one-column table is
// behaviourally identical FOR THEM. It is not identical for THIS gate, whose
// authority is a trigger that reads `raw_user_meta_data.invite_code` — with the
// fixture as-is, every code-bearing path is unreachable and both migrations
// skip their trigger checks with a notice.
//
// So this file adds `raw_user_meta_data` / `raw_app_meta_data` to the fixture's
// auth.users AFTER the replay and drives the real trigger through them. The
// columns are added here rather than in pglite-fixture.sql on purpose: doing it
// globally would silently switch on b457's own checks 9-12 inside every
// replay-based test in the repo, which is a change with a blast radius that has
// nothing to do with this one.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend. "One code, one account" rests on
//     the consume UPDATE's `used_by is null` predicate, which is asserted
//     present and exercised as a serial replay; two simultaneous signups on one
//     code are not reachable here.
//   · GoTrue. The hook is called directly with the event shape GoTrue sends;
//     that GoTrue really sends that shape, really registers the hook, and
//     really propagates the error envelope is tests/beta-invite-gate.mjs --live.
//   · The dashboard half (email confirmations, auth rate limits, anonymous
//     sign-ins) — see §9 of the migration. No migration and no test in this
//     repo can read it; --live checks two of the four.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-08-23-open-beta.sql';
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each is a defect somebody could plausibly write while "simplifying" the
   switch, and each must turn this guard RED. A guard that cannot demonstrate
   it sees failure is broken, not passing.

   Some mutations are caught by the MIGRATION's own §7 (the replay refuses to
   apply, which `run` reports as caught) and some only by the assertions below.
   Both count; `--selftest` prints which tier caught each, because a catalogue
   where every entry is caught by the migration would mean this file's
   assertions are decoration. */
const MUTATIONS = {
  bad_code_waved_through: {
    why: 'THE RULING, DELETED: with the gate open an UNKNOWN code is accepted instead of refused. '
       + 'A player who mistypes their real code gets an account, believes the code was spent, and '
       + 'the real one sits unused forever — and the enumeration signal disappears at exactly the '
       + 'moment the code space is being guessed at',
    find: "  if not coalesce(v_found, false) then return 'invite_unknown'; end if;",
    repl: "  if not coalesce(v_found, false) then return case when public.hr_beta_gate_is_open() then null else 'invite_unknown' end; end if;",
  },
  fail_open_on_missing_row: {
    why: 'hr_beta_gate_is_open() defaults to OPEN when the beta_gate row is absent. A deleted or '
       + 'never-seeded row would then silently open the beta with nobody able to tell — the exact '
       + 'invisible-failure class this whole program exists to prevent',
    find: "  return coalesce(v_v, 'on') = 'off';",
    repl: "  return coalesce(v_v, 'off') = 'off';",
  },
  open_arm_swallows_the_code: {
    why: 'the trigger checks the switch BEFORE it checks whether a code was supplied, so with the '
       + 'gate open a code-bearing signup takes the codeless path and NEVER CONSUMES. '
       + 'beta_invites.used_by silently stops meaning anything and one code becomes unlimited accounts',
    find: '  if v_code is null and public.hr_beta_gate_is_open() then',
    repl: '  if public.hr_beta_gate_is_open() then',
  },
  open_signup_not_journalled: {
    why: 'a codeless account is created without a beta_signup_log row, so the abuse trail covers '
       + 'only the invited accounts — i.e. it stops covering the population that just became '
       + 'unbounded. Journalling every signup is the property b457 bought and this must not spend',
    find: "      values ('open', new.id, jsonb_build_object('layer', 'trigger', 'gate', 'off'));",
    repl: "      values ('open', new.id, jsonb_build_object('layer', 'trigger', 'gate', 'off')) on conflict do nothing;",
    // ^ a no-op-looking edit that in fact still inserts; the REAL mutation is
    //   the guard below, which deletes the insert outright.
    also: true,
  },
  open_signup_journal_deleted: {
    why: 'the outcome=\'open\' journal row is removed entirely — every codeless account is created '
       + 'with no record at all',
    find: `    insert into public.beta_signup_log (outcome, user_id, detail)
      values ('open', new.id, jsonb_build_object('layer', 'trigger', 'gate', 'off'));
    return new;`,
    repl: '    return new;',
  },
  gate_cannot_be_closed: {
    why: 'the invite_required arm returns NULL unconditionally, so the switch is one-way: setting '
       + 'beta_gate=\'on\' no longer closes the beta and nobody notices until an audit counts '
       + 'accounts against invites',
    find: `    if public.hr_beta_gate_is_open() then return null; end if;
    return 'invite_required';`,
    repl: '    return null;',
  },
  no_account_brake: {
    why: 'the per-IP codeless-signup brake is deleted. Opening the gate removed the only thing that '
       + 'bounded account creation; without this brake one script can mint accounts as fast as '
       + 'GoTrue will answer',
    find: "      if not public.hr_rate_ok(v_key, v_bucket, v_limit, interval '1 day') then",
    repl: '      if false then',
  },
  brake_hits_code_bearing_signups: {
    why: 'the account brake stops being scoped to CODELESS signups, so a player redeeming a real '
       + 'invite code from a shared or CGNAT address is refused for somebody else\'s traffic — a '
       + 'seat that cannot be claimed',
    find: '    v_open := v_code is null and public.hr_beta_gate_is_open();',
    repl: '    v_open := public.hr_beta_gate_is_open();',
  },
  message_hint_lies_when_closed: {
    why: 'the open-beta hint ("you can leave the invite code blank") stops being conditional on the '
       + 'switch, so a CLOSED beta tells every refused player the field is optional',
    find: "  if public.hr_beta_gate_is_open() and p_reason in ('invite_unknown', 'invite_used') then",
    repl: "  if p_reason in ('invite_unknown', 'invite_used') then",
  },
  btrim_spaces_only: {
    why: 'hr_beta_code_norm reverts to one-argument btrim(), which trims SPACES ONLY. A real code '
       + 'pasted out of a chat window with a trailing newline then matches nothing and is refused '
       + 'with "check it for typos" — and there is no typo to find. This is the b457 bug §1b fixes',
    find: "  select nullif(left(upper(btrim(coalesce(p_code, ''), E' \\t\\r\\n')), 64), '')",
    repl: "  select nullif(left(upper(btrim(coalesce(p_code, ''))), 64), '')",
  },
  code_norm_unbounded: {
    why: 'hr_beta_code_norm loses its 64-character bound. The refusal path WRITES the presented code '
       + 'to beta_signup_log, and that path is now reachable by anyone on the internet rather than '
       + 'only by somebody holding a code — so a 10 MB "code" becomes a 10 MB journal row, repeatable',
    find: "left(upper(btrim(coalesce(p_code, ''), E' \\t\\r\\n')), 64)",
    repl: "upper(btrim(coalesce(p_code, ''), E' \\t\\r\\n'))",
  },
  settings_domain_unconstrained: {
    why: 'the beta_gate value loses its domain CHECK, so `update … set value = \'Off\'` succeeds and '
       + 'reads as "not exactly off" — the operator believes the beta is open and it is closed',
    find: "      and (key <> 'beta_gate' or value in ('on', 'off'))",
    repl: '      and (key is not null)',
  },
};
delete MUTATIONS.open_signup_not_journalled;   // superseded by …_journal_deleted

const U = (n) => `0000beef-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROBE_A = 'ZZOPEN-AAA';
const PROBE_B = 'ZZOPEN-BBB';
const PROBE_C = 'ZZOPEN-CCC';

/** One end-to-end run against a freshly replayed database. */
async function run(mutate) {
  const patches = mutate
    ? new Map([[MIG, [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]])
    : undefined;
  const { db } = await bootReplay({ patches, upTo: MIG });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];

  /* THE FIXTURE'S auth.users IS (id, email). The gate's authority reads
     raw_user_meta_data, so without these two columns every code-bearing path is
     unreachable and this whole file would grade the hook only. See the header
     for why they are added here and not in pglite-fixture.sql. */
  await db.exec(`
    alter table auth.users add column if not exists raw_user_meta_data jsonb;
    alter table auth.users add column if not exists raw_app_meta_data  jsonb;`);

  /* THE SESSION IS `postgres`, WHICH THE TRIGGER'S OPERATOR BYPASS WAVES
     THROUGH. Without this every trigger assertion below would pass against a
     gate that does nothing — the always-null-probe shape. `is_local = false`
     because PGlite runs each query in its own implicit transaction. */
  await q("select set_config('hearthrise.invite_gate_force','yes',false)");

  for (const code of [PROBE_A, PROBE_B, PROBE_C]) {
    await q('insert into public.beta_invites (code, note) values ($1, $2)', [code, 'open-beta guard probe']);
  }

  const setGate = (v) => q('update public.hr_settings set value = $1 where key = $2', [v, 'beta_gate']);
  const isOpen = async () => (await one('select public.hr_beta_gate_is_open() as r')).r;

  /** A real signup, through the real AFTER INSERT trigger. */
  const signup = async (n, meta) => {
    try {
      await q('insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3::jsonb)',
        [U(n), `probe${n}@invalid.test`, meta === undefined ? null : JSON.stringify(meta)]);
      return { ok: true, err: null };
    } catch (e) {
      return { ok: false, err: String(e && e.message || e) };
    }
  };
  const exists = async (n) =>
    Number((await one('select count(*)::text c from auth.users where id = $1', [U(n)])).c) === 1;
  const usedBy = async (code) =>
    (await one('select used_by from public.beta_invites where code = $1', [code])).used_by;
  const journal = async (n, outcome) => Number((await one(
    'select count(*)::text c from public.beta_signup_log where user_id = $1 and outcome = $2',
    [U(n), outcome])).c);
  const journalAny = async (outcome) => Number((await one(
    'select count(*)::text c from public.beta_signup_log where outcome = $1', [outcome])).c);

  /** The hook, called with the event shape GoTrue sends. */
  const hook = async ({ ip = '203.0.113.9', email = 'h@invalid.test', code, app } = {}) => {
    const ev = {
      metadata: ip ? { ip_address: ip } : {},
      user: {
        email,
        user_metadata: code === undefined ? {} : { invite_code: code },
        ...(app ? { app_metadata: app } : {}),
      },
    };
    return (await one('select public.hr_signup_gate($1::jsonb) as r', [JSON.stringify(ev)])).r;
  };
  const reason = async (code) =>
    (await one('select public.hr_beta_gate_reason($1) as r', [code === undefined ? null : code])).r;

  const obs = {};
  let n = 0;

  // ── A. THE SWITCH ITSELF ─────────────────────────────────────────────
  obs.seeded = await isOpen();
  ok(obs.seeded === true, 'A1: the migration must leave beta_gate OPEN — it is the whole point of the file');
  await setGate('on');
  ok((await isOpen()) === false, 'A2: beta_gate=\'on\' still reads as OPEN — the switch does nothing');
  await setGate('off');
  ok((await isOpen()) === true, 'A3: beta_gate=\'off\' does not read as OPEN — the switch is one-way');

  // FAIL CLOSED. Delete the row and the gate must CLOSE, not open. This is the
  // assertion that separates "a switch" from "a switch with a safe default".
  await q("delete from public.hr_settings where key = 'beta_gate'");
  obs.missingRow = await isOpen();
  ok(obs.missingRow === false,
    'A4: with the beta_gate row MISSING the gate reads OPEN — it must fail CLOSED. A lost row would '
    + 'silently open the beta, which is invisible; failing closed breaks signup loudly and is fixed in minutes');
  ok((await reason(null)) === 'invite_required',
    'A5: with the setting missing, a codeless signup is still allowed — the fail-closed default is not wired through the rule');
  await q("insert into public.hr_settings (key, value) values ('beta_gate','off')");

  // The domain CHECK: a plausible typo must be refused by the DATABASE.
  let typoRefused = false;
  try { await q("update public.hr_settings set value = 'Off' where key = 'beta_gate'"); }
  catch { typoRefused = true; }
  ok(typoRefused,
    'A6: hr_settings accepted beta_gate=\'Off\' — the domain CHECK is gone, so a plausible-looking '
    + 'typo leaves the gate CLOSED while the operator believes it is open');
  ok((await isOpen()) === true, 'A6b: the refused typo changed the switch anyway');

  // ── B. THE CLIENT CONTRACT: FOUR SPELLINGS OF "NO CODE" ──────────────
  // The login-wall form is being built against this. All four must mean the
  // same thing, or "make the field optional" becomes "send the key but empty".
  for (const [label, v] of [['absent (null)', null], ['empty string', ''],
                            ['whitespace', '   '], ['tab/newline', '\t\n ']]) {
    ok((await reason(v)) === null, `B: gate OFF — an invite_code that is ${label} is still refused; `
      + 'the client must be able to omit the field OR send an empty string');
  }
  // THE PASTE CASE, which b457 got wrong: one-argument btrim() trims SPACES
  // ONLY, so a real code copied out of a chat window with a trailing newline
  // matched nothing and was refused with "check it for typos" — and there was
  // no typo to find. §1b's explicit whitespace set is what fixes it.
  ok((await reason(`  ${PROBE_A.toLowerCase()}\r\n`)) === null,
    'B: a VALID code with a trailing newline (i.e. PASTED out of Discord) is refused. Postgres\'s '
    + 'one-argument btrim trims spaces only; hr_beta_code_norm needs the explicit E\' \\t\\r\\n\' set');
  // …and the SUPERSET property: the wider trim must not move any input that
  // already worked.
  ok((await one('select public.hr_beta_code_norm($1) as r', ['  friend-001  '])).r === 'FRIEND-001',
    'B: the normalisation changed an input that already worked — the btrim fix is not a superset');
  ok((await one('select public.hr_beta_code_norm($1) as r', ['ok'])).r === 'OK',
    'B: hr_beta_code_norm no longer upper-cases');
  await setGate('on');
  for (const [label, v] of [['absent (null)', null], ['empty string', '']]) {
    ok((await reason(v)) === 'invite_required',
      `B: gate ON — an invite_code that is ${label} is no longer refused; the closed beta leaks`);
  }
  await setGate('off');

  // ── C. GATE OFF — THE AUTHORITY (the trigger), not just the hook ─────
  ok((await signup(++n, undefined)).ok, 'C1: gate OFF — a codeless signup was REFUSED by the trigger');
  ok(await exists(n), 'C1: gate OFF — the codeless signup left no account');
  ok((await journal(n, 'open')) === 1,
    'C1: gate OFF — a codeless account was created WITHOUT an outcome=\'open\' journal row. Every '
    + 'account must be in the abuse trail, and the codeless population is the one that just became unbounded');
  obs.c1Consumed = Number((await one(
    "select count(*)::text c from public.beta_invites where used_by is not null")).c);
  ok(obs.c1Consumed === 0, 'C1: a codeless signup CONSUMED an invite code');

  const c2 = await signup(++n, { invite_code: '' });
  ok(c2.ok, 'C2: gate OFF — a signup with invite_code:"" was refused; the empty string must mean "no code"');
  ok((await journal(n, 'open')) === 1, 'C2: the empty-string signup was not journalled \'open\'');

  const c3n = ++n;
  ok((await signup(c3n, { invite_code: `  ${PROBE_A.toLowerCase()} ` })).ok,
    'C3: gate OFF — a VALID code was refused (normalisation is broken)');
  ok((await usedBy(PROBE_A)) === U(c3n),
    'C3: gate OFF — a valid code did NOT consume. beta_invites.used_by is the record of which seat '
    + 'went to whom; if the open path swallows codes, it stops meaning anything');
  ok((await journal(c3n, 'granted')) === 1, 'C3: the consumed code was not journalled \'granted\'');

  const c4 = await signup(++n, { invite_code: 'NO-SUCH-CODE-9Q7X' });
  ok(!c4.ok,
    'C4: THE RULING — gate OFF, a BOGUS code created an account. A typo now succeeds silently, the '
    + 'player\'s real code is never spent, and the enumeration signal is gone');
  ok(!(await exists(n)), 'C4: the refused account exists anyway');
  ok(/not recognised/i.test(c4.err || ''), `C4: the refusal message is not the invite_unknown copy: ${c4.err}`);
  ok(/leave the invite code blank/i.test(c4.err || ''),
    'C4: gate OFF — the refusal does not tell the player the field is optional, which is the one '
    + 'thing they need to hear');

  const c5 = await signup(++n, { invite_code: PROBE_A });
  ok(!c5.ok, 'C5: gate OFF — a REPLAY of an already-consumed code created a SECOND account. '
    + '"One code, one account" died the moment the beta opened');
  ok((await usedBy(PROBE_A)) === U(c3n), 'C5: the refused replay disturbed the first owner');

  // ── D. GATE ON — b457, BYTE FOR BYTE ─────────────────────────────────
  await setGate('on');
  const d1 = await signup(++n, undefined);
  ok(!d1.ok, 'D1: gate ON — an account with NO invite code was created. The switch cannot be turned back on');
  ok(!(await exists(n)), 'D1: the refused account exists anyway');
  ok(/closed beta/i.test(d1.err || ''), `D1: the closed-beta refusal message changed: ${d1.err}`);
  ok(!/leave the invite code blank/i.test(d1.err || ''),
    'D1: gate ON — the refusal tells the player the field is optional, which is a lie while the beta is closed');

  const d2 = await signup(++n, { invite_code: 'NO-SUCH-CODE-9Q7X' });
  ok(!d2.ok, 'D2: gate ON — a forged invite code created an account');

  const d3n = ++n;
  ok((await signup(d3n, { invite_code: PROBE_B })).ok, 'D3: gate ON — a valid code was refused');
  ok((await usedBy(PROBE_B)) === U(d3n), 'D3: gate ON — a valid code did not consume');

  // The admin bypass still reads app_metadata ONLY. `raw_user_meta_data` is
  // whatever the browser sent; if the trigger read the flag from there, one
  // extra signup field would skip the gate entirely — a total bypass, one word
  // away, in a body this file restates.
  const d4 = await signup(++n, { hr_invite_bypass: 'true' });
  ok(!d4.ok,
    'D4: a CLIENT-SETTABLE hr_invite_bypass in user_metadata created an account — the trigger reads '
    + 'the wrong metadata bag and the gate is fully bypassable');
  await setGate('off');
  const d5 = await signup(++n, { hr_invite_bypass: 'true' });
  ok(d5.ok, 'D5: gate OFF — a codeless signup that happens to carry junk metadata was refused');

  // ── E. THE HOOK — the player-facing layer ────────────────────────────
  await setGate('on');
  obs.hookClosed = await hook({});
  ok(obs.hookClosed && obs.hookClosed.error, 'E1: gate ON — the hook ALLOWED a codeless signup');
  ok(String(obs.hookClosed?.error?.http_code) === '403',
    `E1: a closed-beta refusal is HTTP ${obs.hookClosed?.error?.http_code} (want 403)`);
  await setGate('off');
  obs.hookOpen = await hook({});
  ok(obs.hookOpen && !obs.hookOpen.error,
    `E2: gate OFF — the hook REFUSED a codeless signup: ${obs.hookOpen?.error?.message}`);
  ok((await hook({ code: 'NO-SUCH-CODE-9Q7X' }))?.error,
    'E3: gate OFF — the hook ALLOWED an unknown invite code');
  ok(!(await hook({ code: PROBE_C }))?.error, 'E4: gate OFF — the hook REFUSED a valid code');
  ok(!(await hook({ code: PROBE_C, app: { hr_invite_bypass: 'true' } }))?.error,
    'E5: the app_metadata admin bypass was refused');
  ok((await usedBy(PROBE_C)) === null,
    'E6: THE HOOK CONSUMED A CODE. It runs outside the insert\'s transaction and GoTrue calls the '
    + 'signup path for an already-registered address without inserting — a consuming hook burns codes '
    + 'for accounts that were never created');

  // ── F. THE CODELESS ACCOUNT BRAKE ────────────────────────────────────
  // 10/day/IP, live only while the gate is open. Drive past it, then prove a
  // DIFFERENT IP is unaffected — without that control, "the hook refuses
  // everything" would pass this section.
  const BRAKE_IP = '198.51.100.200';
  let braked = 0;
  let firstRefusalAt = 0;
  for (let i = 1; i <= 14; i++) {
    const r = await hook({ ip: BRAKE_IP, email: `brake${i}@invalid.test` });
    if (r && r.error) { braked++; if (!firstRefusalAt) firstRefusalAt = i; }
  }
  obs.braked = braked;
  obs.firstRefusalAt = firstRefusalAt;
  ok(braked > 0,
    'F1: 14 codeless signups from ONE IP against a limit of 10 were never braked. Opening the gate '
    + 'removed the only bound on account creation; this brake is what replaced it');
  ok(firstRefusalAt === 11,
    `F2: the brake first refused at attempt ${firstRefusalAt} — the limit is not 10/day/IP`);
  ok((await hook({ ip: BRAKE_IP, email: 'late@invalid.test' }))?.error?.http_code === 429,
    'F3: the account brake does not answer HTTP 429');
  ok(!(await hook({ ip: '198.51.100.201', email: 'other@invalid.test' }))?.error,
    'F4 (CONTROL): a DIFFERENT IP was braked — the limit is global, and one visitor can lock every '
    + 'other one out of signing up');
  ok(!(await hook({ ip: BRAKE_IP, code: PROBE_C, email: 'coded@invalid.test' }))?.error,
    'F5: the CODELESS brake also refused a code-bearing signup from the same IP. A player redeeming a '
    + 'real invite from a shared/CGNAT address would lose a seat to somebody else\'s traffic');
  ok((await journalAny('refused_signup_throttled')) >= 1,
    'F6: the account brake journalled nothing — an invisible limit is not a signal');
  // …and with the gate CLOSED the new brake must not exist at all, or "gate on
  // is byte-identical to b457" is false.
  await setGate('on');
  const closedBrake = await hook({ ip: BRAKE_IP, code: PROBE_C, email: 'closed@invalid.test' });
  ok(!closedBrake?.error, 'F7: gate ON — a valid-code signup from the exhausted IP was refused; the '
    + 'open-beta brake is leaking into the closed-beta path');
  await setGate('off');

  // ── G. THE COPY SURVIVED THE DELEGATION ──────────────────────────────
  // hr_beta_gate_message is b457's and is deliberately NOT restated. Prove the
  // new layer delegates rather than re-implements: a copy refactor that
  // replaced the one string a refused player reads would otherwise be silent.
  await setGate('on');
  for (const [r, phrase] of [['invite_required', 'closed beta'],
                             ['invite_unknown', 'not recognised'],
                             ['invite_used', 'already been used'],
                             ['refused_throttled', 'Too many invite attempts']]) {
    const [a, b] = [
      (await one('select public.hr_beta_signup_message($1) as r', [r])).r,
      (await one('select public.hr_beta_gate_message($1) as r', [r])).r,
    ];
    ok(a === b, `G: gate ON — hr_beta_signup_message('${r}') no longer matches b457's hr_beta_gate_message`);
    ok(String(a).includes(phrase), `G: the ${r} message lost its key phrase "${phrase}": ${a}`);
  }
  ok(/connection today/.test(
    (await one("select public.hr_beta_signup_message('refused_signup_throttled') as r")).r),
  'G: the new throttle message is missing');
  await setGate('off');

  // ── H. STRUCTURE — the locks the migration asserts, re-asserted here ──
  // The migration asserts these at apply time. They are re-asserted here
  // because a LATER migration is what would quietly undo them, and this file
  // runs against the whole chain rather than against one apply.
  obs.policies = Number((await one(
    "select count(*)::text c from pg_policies where schemaname='public' and tablename='hr_settings'")).c);
  ok(obs.policies === 0, 'H1: public.hr_settings has a policy — a client that could write it owns account creation');
  obs.grants = (await q(`select string_agg(g || ':' || p, ', ') as bad
      from unnest(array['anon','authenticated','public']) g
      cross join unnest(array['select','insert','update','delete']) p
     where has_table_privilege(g, 'public.hr_settings', p)`))[0].bad;
  ok(obs.grants === null, `H2: public.hr_settings is reachable by ${obs.grants}`);
  obs.fnGrants = (await q(`select string_agg(g || ':' || f, ', ') as bad
      from unnest(array['anon','authenticated','service_role','public']) g
      cross join unnest(array['public.hr_beta_gate_is_open()','public.hr_beta_signup_message(text)',
                              'public.hr_signup_gate(jsonb)','public.hr_beta_gate_reason(text)']) f
     where has_function_privilege(g, f, 'execute')`))[0].bad;
  ok(obs.fnGrants === null, `H3: a privileged gate function is client-executable: ${obs.fnGrants}`);
  // hr_beta_code_norm's 64-char bound is now reachable by anyone on the
  // internet rather than only by someone holding a code: the refusal path
  // WRITES the presented code to beta_signup_log.
  obs.normLen = Number((await one(
    'select length(public.hr_beta_code_norm(repeat($1, 5000)))::text l', ['Z'])).l);
  ok(obs.normLen === 64,
    `H4: hr_beta_code_norm bounds at ${obs.normLen} characters, not 64 — the journal write on the '
    + 'refusal path is unbounded, and that path is now open to the whole internet`);
  // The trigger is still the authority.
  obs.trigger = Number((await one(`select count(*)::text c from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relname='users' and c.relnamespace='auth'::regnamespace
       and t.tgname='hr_beta_invite_gate' and not t.tgisinternal and t.tgenabled='O'
       and (t.tgtype & 1)=1 and (t.tgtype & 4)=4 and (t.tgtype & 2)=0`)).c);
  ok(obs.trigger === 1, 'H5: the AFTER INSERT row trigger is no longer attached and enabled on auth.users');

  await db.close?.();
  return obs;
}

// ── CLI ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const mutateArg = (argv.find((a) => a.startsWith('--mutate=')) || '').split('=')[1];

if (argv.includes('--list')) {
  console.log('open-beta mutation catalogue:\n');
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`  ${id}\n      ${m.why}\n`);
  process.exit(0);
}

/** A mutated run is CAUGHT if the assertions fail OR the replay refuses to
 *  apply (the migration's own §7 self-check is a real detector and a mutation
 *  it kills is a mutation that cannot reach production). */
async function graded(id) {
  problems.length = 0;
  try {
    await run(id);
    return { caught: problems.length > 0, by: 'guard', detail: problems.slice(0, 2) };
  } catch (e) {
    if (e.harness) throw e;             // a broken anchor is not a caught mutation
    return { caught: true, by: 'migration §7', detail: [String(e.message).split('\n')[1] || e.message] };
  }
}

if (argv.includes('--selftest')) {
  let bad = 0;
  const byMigration = [];
  const byGuard = [];
  for (const id of Object.keys(MUTATIONS)) {
    let r;
    try { r = await graded(id); }
    catch (e) { console.error(`  HARNESS  ${id}: ${e.message}`); bad++; continue; }
    if (!r.caught) {
      console.error(`  MISSED   ${id} — ${MUTATIONS[id].why}`);
      bad++;
    } else {
      (r.by === 'guard' ? byGuard : byMigration).push(id);
      console.log(`  caught   ${id}  [${r.by}]  ${String(r.detail[0] || '').slice(0, 110)}`);
    }
  }
  console.log(`\n${Object.keys(MUTATIONS).length - bad}/${Object.keys(MUTATIONS).length} mutations caught`
    + ` (${byGuard.length} by this guard, ${byMigration.length} by the migration's own self-check).`);
  if (!byGuard.length) {
    console.error('  FAIL  every mutation was caught by the MIGRATION — this guard\'s assertions are decoration');
    bad++;
  }
  process.exit(bad ? 1 : 0);
}

try {
  const obs = await run(mutateArg || null);
  if (problems.length) {
    console.error(`open-beta: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  FAIL  ${p}`);
    process.exit(1);
  }
  console.log('open-beta: OK — the gate is a switch, it fails CLOSED, gate=off allows a codeless signup '
    + 'and still refuses a bogus one, a valid code still consumes exactly once, gate=on restores b457 '
    + 'at the trigger, and the per-IP account brake bites at '
    + `${obs.firstRefusalAt} with a different-IP control.`);
} catch (e) {
  console.error(`open-beta: HARNESS/REPLAY FAILURE — ${e.message}`);
  if (e.failures) console.error(JSON.stringify(e.failures, null, 2));
  process.exit(2);
}
