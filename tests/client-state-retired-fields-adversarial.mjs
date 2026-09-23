#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-state-retired-fields-adversarial.mjs — THE THREE PROPERTIES
//   THE STRIP INTRODUCED THAT ITS OWN GUARD DOES NOT MEASURE.
//
//   node tests/client-state-retired-fields-adversarial.mjs            # the guard
//   node tests/client-state-retired-fields-adversarial.mjs --list     # the arms
//   node tests/client-state-retired-fields-adversarial.mjs --mutate=X # one arm
//   node tests/client-state-retired-fields-adversarial.mjs --selftest # all must bite
//
// Written by the security-engineer role during the review of
// supabase/migrations/2026-09-23-client-state-retired-fields.sql. It does NOT
// duplicate tests/client-state-retired-fields.mjs, which already proves that a
// retired key strips, an authority key refuses, authority wins in a mixed patch
// and a replay is one effect. These are the three things the strip made
// possible that nothing measures:
//
//   X1  SIZE ACCOUNTING. The strip moved the merge from `p_patch` to `v_patch`.
//       If a later restatement merges the RAW patch while still reporting
//       `stripped`, the answer keeps saying the right thing while the forged
//       value lands AND eats the 256 KiB bag cap. 50 KB of retired `buffs` must
//       change `bytes` by nothing and the stored bag by nothing.
//
//   X2  ORDERING IS THE WHOLE FAIL-SAFE. Nothing in the body says a name cannot
//       be on both lists; what makes an authority key win is that the deny loop
//       runs FIRST and reads the RAW patch, so no strip can carry a name out
//       from under it. The arm proving this bites hoists the strip above the
//       deny loop, points the deny loop at the stripped remainder and puts
//       `gold` on both lists — the shape a later restatement "simplifying" the
//       body into one remainder would take.
//
//   X3  THE JOURNAL IS BOUNDED BY A CAP IN ANOTHER FILE. hr_record_rejection
//       folds the `whys` map at c_why_cap = 12 keys (2026-09-13-rejections-verb-
//       map-2.sql). v_retired holds TEN. The breakdown naming WHICH key a stale
//       tab sends — the entire diagnostic value of `retired_field` — therefore
//       survives on two names of headroom held in a file that does not mention
//       it. The list is read OUT OF THE INSTALLED BODY, never typed here, so the
//       arm grows with it: a put naming every installed name must yield ONE row,
//       n += that many, that many DISTINCT whys and no '(other)'.
//
// Runs against a REAL PostgreSQL (PGlite) with the REAL ordered chain, through
// the REAL GATED WRAPPER. No credentials; production untouched.
//
// Exit: 0 green · 1 a real problem · 2 harness problem.
// NO ?v= on the imports (tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-09-23-client-state-retired-fields.sql';
const UID = '000000ad-0000-0000-0000-0000000000ad';
const RETIRED = ['buffs', 'streak', 'autoEatPct', 'foodSlot', 'combatStyle', 'toolCarry',
  'renownHigh', 'heroSlotsUnlocked', 'ownedThemes', 'ownedCosmetics'];
/* hr_record_rejection's own cap on the whys map (2026-09-13-rejections-verb-map-2.sql,
   `c_why_cap constant int := 12`). Read from that file at run time rather than
   typed here, so this guard cannot go on believing a number the recorder changed. */
const WHY_CAP_SOURCE = 'supabase/migrations/2026-09-13-rejections-verb-map-2.sql';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  x ${msg}`); } };

/* §3's CODE-hash pin and §4's executed self-check fire at APPLY time and catch
   most of what is planted below first — which proves the MIGRATION can refuse,
   not that THIS guard can see. The regression that actually brings a defect back
   is a LATER restatement, at which point neither runs again and this file is all
   that is left. Same two short-circuits tests/client-state-retired-fields.mjs
   uses, for the same reason. */
const GATE_BLIND = [
  ['  v_code := btrim(regexp_replace(\n              regexp_replace(replace(pg_get_functiondef(',
    '  return;  -- §3 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/client-state-retired-fields-adversarial.mjs)\n'
    + '  v_code := btrim(regexp_replace(\n              regexp_replace(replace(pg_get_functiondef('],
  ["    perform set_config('request.jwt.claim.sub', v_uid::text, true);",
    '    return;  -- §4 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/client-state-retired-fields-adversarial.mjs)\n'
    + "    perform set_config('request.jwt.claim.sub', v_uid::text, true);"],
];

const STRIP_LOOP = '  v_patch := p_patch;\n'
  + '  foreach v_key in array v_retired loop\n'
  + '    if v_patch ? v_key then\n'
  + '      v_patch := v_patch - v_key;\n'
  + '      v_strip := v_strip || v_key;\n'
  + '    end if;\n'
  + '  end loop;\n';

const MUTATIONS = {
  /* X1. The merge reads the RAW patch again. `stripped` still names the key, so
     the answer is unchanged and only the bytes and the bag tell the truth. */
  merge_reads_the_raw_patch: {
    by: 'X1',
    why: 'the honest remainder is computed and then thrown away — v_new merges p_patch, so the '
       + 'forged value lands in client_state and eats the 256 KiB bag cap while `stripped` goes on '
       + 'naming it. The one edit that makes the answer lie without changing a word of it.',
    find: '  v_new := v_cur || v_patch;',
    repl: '  v_new := v_cur || p_patch;',
  },
  /* X1b. The cap is charged on the raw patch AFTER the strip, so a stale tab
     whose retired value is large loses the whole save it was about to make. */
  bag_cap_charged_on_the_raw_patch: {
    by: 'X1',
    why: 'the stored-size check is charged against the UNSTRIPPED patch, so a tab sending a large '
       + 'retired value is refused state_too_large for bytes that were never going to be stored — '
       + 'the outage this file closes, moved one branch further down',
    find: '  v_new := v_cur || v_patch;\n  if octet_length(v_new::text) > v_cap then',
    repl: '  v_new := v_cur || v_patch;\n  if octet_length((v_cur || p_patch)::text) > v_cap then',
  },
  /* X2. The authority check is pointed at the STRIPPED remainder and the strip
     is hoisted above it, and `gold` is put on BOTH lists. The realistic shape of
     this edit is a later restatement "simplifying" the body by computing the
     remainder once at the top and using it everywhere. */
  deny_reads_the_stripped_remainder: {
    by: 'X2',
    why: 'the deny loop is pointed at the stripped remainder instead of the raw patch and the strip '
       + 'is hoisted above it, so a name on BOTH lists is removed before the authority check can '
       + 'ever see it — an authority key silently downgraded to a stale-bundle key. The whole '
       + 'fail-safe of this design is that the deny loop runs FIRST and reads what the client '
       + 'actually sent.',
    find: STRIP_LOOP,
    repl: '',
    also: [
      ['  foreach v_key in array v_deny loop\n    if p_patch ? v_key then',
        STRIP_LOOP + '  foreach v_key in array v_deny loop\n    if v_patch ? v_key then'],
      ["    'buffs',\n    'streak','autoEatPct'", "    'gold',\n    'buffs',\n    'streak','autoEatPct'"],
    ],
  },
  /* X3. The list outgrows the recorder's cap. Ten names fit under twelve; a
     thirteenth folds the map to '(other)' and the diagnosis is gone. */
  the_retired_list_outgrows_the_why_cap: {
    by: 'X3',
    why: 'v_retired grows past hr_record_rejection\'s c_why_cap of 12, so the whys map folds to '
       + '"(other)" and `retired_field` stops saying WHICH key a stale tab is sending — which is '
       + 'the entire reason this code exists rather than a silent strip',
    find: "    'heroSlotsUnlocked','ownedThemes','ownedCosmetics'\n  ];",
    repl: "    'heroSlotsUnlocked','ownedThemes','ownedCosmetics',\n"
        + "    'padA','padB','padC','padD','padE'\n  ];",
  },
};

/* A comment-only edit. If this turns the guard red, every tick above is a text
   read rather than a behavioural one and none of them is worth anything. */
const NEGATIVE_CONTROL = {
  find: '-- ── 2. THE LOCKDOWN, RE-STATED ──────────────────────────────────────────────',
  repl: '-- ── 2. THE LOCKDOWN, RE-STATED (comment-only negative control) ──────────────',
};

async function boot(mutate, gateBlind, extra) {
  const m = mutate ? MUTATIONS[mutate] : null;
  const pairs = [];
  if (m) { pairs.push([m.find, m.repl]); if (m.also) pairs.push(...m.also); }
  if (extra) pairs.push([extra.find, extra.repl]);
  if (gateBlind) pairs.push(...GATE_BLIND.map((p) => p.slice()));
  const opts = {};
  if (pairs.length) opts.patches = new Map([[MIG, pairs]]);
  const { db } = await bootReplay(opts);
  return db;
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

async function runAll(db) {
  const q = (sql, p) => one(db, sql, p);
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${UID}', false)`);
  const created = (await q('select public.hr_create_character(0) as r')).r;
  ok(created && created.created === true,
     `the probe character was created (${JSON.stringify(created)})`);

  /* The REAL gated wrapper, not __ungated. A raised error is an ANSWER, never a
     reason to abandon the run: a defect that makes the body raise must read as
     RED here, not as a harness failure, which is indistinguishable from "cannot
     see it". */
  const put = async (patch) => {
    try {
      return (await q('select public.hr_put_client_state(0, $1::jsonb, gen_random_uuid()) as r',
        [JSON.stringify(patch)])).r;
    } catch (e) { return { ok: false, error: 'RAISED', raised: String(e && e.message).split('\n')[0] }; }
  };
  const bagText = async () => (await q(
    "select coalesce(client_state, '{}'::jsonb)::text as t, "
    + "octet_length(coalesce(client_state, '{}'::jsonb)::text) as n "
    + 'from public.player_state where user_id=$1 and slot=0', [UID]));
  const clear = () => db.query(
    "update public.player_state set client_state='{}'::jsonb where user_id=$1 and slot=0", [UID]);
  const rows = async (code) => (await db.query(
    'select n, whys, severity from public.hr_rejections '
    + 'where user_id=$1 and slot=0 and code=$2 and day=current_date', [UID, code])).rows;

  // ── X1. A STRIPPED KEY IS CHARGED TO NOBODY ─────────────────────────────
  // 50 KB of retired `buffs` beside one honest key. The answer's `bytes` is the
  // number the client's cap warning reads, and the stored bag is the thing the
  // 256 KiB cap protects; a strip that happens after either of them is a strip
  // that did not happen.
  {
    await clear();
    const r = await put({ buffs: 'x'.repeat(50000), lootFilter: ['junk'] });
    const b = await bagText();
    ok(r && r.ok === true && JSON.stringify(r.stripped) === JSON.stringify(['buffs']),
       `a 50 KB retired value was not stripped cleanly: ${JSON.stringify(r).slice(0, 200)}`);
    ok(b && !b.t.includes('"buffs"'),
       `the 50 KB retired value LANDED in client_state (${b && b.t.length} chars stored) — the `
       + 'forgeable shadow copy is in the bag and it has eaten the cap');
    ok(Number(r.bytes) === Number(b.n),
       `\`bytes\` (${r && r.bytes}) is not the size of what was actually stored (${b && b.n}) — the `
       + 'strip must be charged before the size is reported, or the number the client caps on is a '
       + 'number of bytes nobody stored');
    ok(Number(r.bytes) < 1000,
       `\`bytes\` came back ${r && r.bytes} for a patch whose only large key was stripped — the raw `
       + 'patch is being accounted for somewhere');

    // …and the bag cap is charged on the honest remainder, not on the raw patch.
    // A bag already near the cap must still accept a put whose overflow is
    // entirely retired.
    await db.query(
      "update public.player_state set client_state = jsonb_build_object('lootFilter', repeat('z', 200000)) "
      + 'where user_id=$1 and slot=0', [UID]);
    const r2 = await put({ buffs: 'y'.repeat(100000), houseTheme: 'forest' });
    ok(r2 && r2.ok === true,
       `a bag 200 KB full refused a put whose only over-cap key was RETIRED: ${JSON.stringify(r2)} — `
       + 'the stale tab loses the save anyway and the outage simply moved');
  }

  // ── X2. A NAME ON BOTH LISTS IS REFUSED, NOT STRIPPED ───────────────────
  // The property holds only because the deny loop runs FIRST and reads the RAW
  // patch, so no strip can carry a name out from under it. The arm that proves
  // this bites hoists the strip above the deny loop, points the deny loop at the
  // stripped remainder and puts `gold` on both lists — at which point the
  // forgery is quietly removed instead of refused, and the answer says ok.
  {
    await clear();
    const before = (await rows('retired_field'))[0];
    const r = await put({ gold: 1e12, buffs: [{ type: 'damage', magnitude: 9999 }],
      lootFilter: ['junk'] });
    ok(r && r.ok === false && r.error === 'forbidden_field' && r.field === 'gold',
       `a patch carrying BOTH a forged authority key and a retired one was not refused whole: `
       + JSON.stringify(r));
    const b = await bagText();
    ok(b && b.t === '{}',
       `the refused patch stored ${b && b.t} — an authority forgery must leave nothing behind`);
    ok(Number((await rows('retired_field'))[0]?.n || 0) === Number(before?.n || 0),
       'the authority refusal filed a retired_field occurrence — a forgery classified as a stale '
       + 'bundle is the one direction this change must never take');
    ok((await rows('forbidden_field')).length === 1,
       'the authority refusal was not journalled as forbidden_field');
  }

  // ── X3. THE INSTALLED LIST FITS THE RECORDER'S CAP ──────────────────────
  // The whole diagnostic value of `retired_field` is the whys breakdown, and the
  // cap that bounds it lives in hr_record_rejection — a file that has never
  // heard of v_retired. The list is read OUT OF THE INSTALLED BODY rather than
  // typed here, so this arm measures the list that actually shipped and grows
  // with it; a put naming every one of its names at once is the worst case an
  // honest stale tab can produce, and it must still come back as that many
  // distinct names in ONE row.
  {
    const installed = [...String((await q(
      "select substring(btrim(regexp_replace(regexp_replace(replace(pg_get_functiondef("
      + "'public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure), chr(13), ''), "
      + "'--[^' || chr(10) || ']*', '', 'g'), '[[:space:]]+', ' ', 'g')) "
      + "from 'v_retired constant text\\[\\] := array\\[(.*?)\\]') as l")).l || '')
      .matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]);
    ok(installed.length >= 10,
       `the v_retired scan read ${installed.length} name(s) out of the installed body (expected >= 10) `
       + '— the scan has drifted and this arm would pass VACUOUSLY');
    if (installed.length >= 10) {
      await clear();
      const before = Number((await rows('retired_field'))[0]?.n || 0);
      const patch = Object.fromEntries(installed.map((k) => [k, 'forged']));
      patch.lootFilter = ['junk'];
      const r = await put(patch);
      ok(r && r.ok === true && Array.isArray(r.stripped) && r.stripped.length === installed.length,
         `a put naming all ${installed.length} installed retired keys did not strip them all: `
         + JSON.stringify(r));
      const after = await rows('retired_field');
      ok(after.length === 1,
         `${after.length} hr_rejections rows for retired_field — the journal is a per-(user, slot, `
         + 'day, code) AGGREGATE and a row per call is unbounded client-drivable growth');
      ok(Number(after[0]?.n || 0) === before + installed.length,
         `n went ${before} -> ${after[0]?.n}, expected +${installed.length} — one occurrence per name `
         + 'stripped, or the count stops meaning anything');
      const whys = after[0]?.whys || {};
      ok(!Object.prototype.hasOwnProperty.call(whys, '(other)'),
         `the whys map folded to "(other)" (${JSON.stringify(whys)}) — v_retired has outgrown `
         + "hr_record_rejection's c_why_cap and `retired_field` no longer says WHICH key a stale tab "
         + 'is sending, which is the only reason it is a named code rather than a silent strip');
      ok(Object.keys(whys).length === installed.length,
         `the whys map holds ${Object.keys(whys).length} names for ${installed.length} stripped keys `
         + `(${JSON.stringify(whys)}) — a name lost to the cap, or two names that collide under `
         + "hr_rejection_why's lower-casing and are one name in the diagnosis");
      ok(after[0]?.severity === 'normal',
         `severity = ${after[0]?.severity} — a tab that has not reloaded is not an incident, and `
         + 'every retired name at once must not be what promotes it');
    }
  }
}

/* The cap itself, read from the recorder rather than believed. A source read,
   deliberately: the number lives in another file and the headroom this guard
   depends on is the difference between the two. */
async function capHeadroom() {
  const src = await (await import('node:fs/promises'))
    .readFile(new URL(`../${WHY_CAP_SOURCE}`, import.meta.url), 'utf8');
  const m = /c_why_cap\s+constant\s+int\s*:=\s*(\d+)/.exec(src);
  ok(!!m, `could not read c_why_cap out of ${WHY_CAP_SOURCE} — this guard's X3 arm is vacuous `
     + 'without it');
  if (!m) return;
  const cap = Number(m[1]);
  ok(RETIRED.length < cap,
     `v_retired holds ${RETIRED.length} names and hr_record_rejection caps the whys map at ${cap} — `
     + 'the breakdown is already folding');
  console.log(`  whys-cap headroom: ${RETIRED.length} retired name(s) under a cap of ${cap} `
    + `(${cap - RETIRED.length} to spare, in ${WHY_CAP_SOURCE})`);
}

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.includes('--list')) {
  for (const [k, m] of Object.entries(MUTATIONS)) console.log(`${m.by}  ${k}\n      ${m.why}\n`);
  process.exit(0);
}

const only = (argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);

if (argv.includes('--selftest')) {
  console.log('client-state-retired-fields-adversarial --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    for (const blind of [false, true]) {
      failed = 0;
      const label = `${name}${blind ? ' [gate-blind]' : ''}`;
      let threw = null;
      try {
        const db = await boot(name, blind);
        await runAll(db);
      } catch (e) { threw = String(e && e.message).split('\n')[0]; }
      if (threw) console.log(`  ${label}: RED (threw: ${threw})`);
      else if (failed) console.log(`  ${label}: RED (${failed} assertion(s) failed)`);
      else { console.error(`  ${label}: GREEN — NOT CAUGHT`); bad++; }
    }
  }
  failed = 0;
  try {
    const db = await boot(null, false, NEGATIVE_CONTROL);
    await runAll(db);
    await capHeadroom();
    if (failed) { console.error(`  negative control (comment-only): RED — ${failed} tick(s) are text reads`); bad++; }
    else console.log('  negative control (comment-only): GREEN, as required');
  } catch (e) { console.error(`  negative control threw: ${e && e.message}`); bad++; }
  if (bad) { console.error(`\n${bad} arm(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length * 2} arms behaved, plus one negative control.`);
  process.exit(0);
}

const db = await boot(only || null, argv.includes('--gate-blind'));
await runAll(db);
await capHeadroom();
if (failed) {
  console.error(`\nclient-state-retired-fields-adversarial: ${failed} assertion(s) FAILED.`);
  process.exit(1);
}
console.log('client-state-retired-fields-adversarial: a stripped key is charged to nobody (neither '
  + '`bytes` nor the bag cap), a name on both lists is refused rather than stripped because the deny '
  + 'loop runs first, and all ten retired names fit hr_record_rejection\'s whys cap as ten distinct '
  + 'names in one aggregate row.');
process.exit(0);
