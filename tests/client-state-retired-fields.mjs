#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-state-retired-fields.mjs — A RETIRED KEY IS STRIPPED. AN
//                                         AUTHORITY KEY IS REFUSED. THEY ARE
//                                         NOT THE SAME THING.
//
//   node tests/client-state-retired-fields.mjs            # the guard
//   node tests/client-state-retired-fields.mjs --list     # the mutation catalogue
//   node tests/client-state-retired-fields.mjs --mutate=X # one arm
//   node tests/client-state-retired-fields.mjs --without  # the chain WITHOUT the
//                                                         # new file must be RED
//   node tests/client-state-retired-fields.mjs --selftest # every arm must bite
//
// Ships with: supabase/migrations/2026-09-23-client-state-retired-fields.sql
//
// ── THE BUG IT CLOSES, MEASURED ─────────────────────────────────────────────
// hr_put_client_state__ungated refused the WHOLE residue patch on any denied
// key. `gold` deserves that. `buffs` did not: it was a legitimate residue field
// until 2026-09-13 20:47 UTC, and one real player's hidden pre-b544 tab has been
// sending it ever since — 603 refusals by 2026-09-14, 569 on 2026-09-16, 927-955
// a day by 2026-09-22, roughly 99% of every refusal vitals reports. That account
// has saved no lootFilter, no achievements and no bestiary for nine days, and
// the noise hides any real burst underneath it.
//
// AFTER: the authority list still refuses the whole patch by name; a RETIRED
// name is stripped, journalled as `retired_field` (severity normal, one `why`
// per name so the breakdown says WHICH BUILD the tab is running) and the honest
// remainder saves.
//
// ── THE TWO ASSERTIONS THAT CARRY THE FILE ──────────────────────────────────
//   R2  {buffs:[…forged…], lootFilter:['junk']}  ->  ok:true, stripped ['buffs'],
//       lootFilter STORED and buffs NOT. Both halves are load-bearing: the first
//       is the outage this closes, the second is the security property of
//       2026-09-13-client-state-buffs-denylist.sql, which must survive intact.
//   R4  {gold:999, lootFilter:['junk']}  ->  forbidden_field/gold, NOTHING
//       stored, and NOT a retired_field occurrence. A forgery is never
//       reclassified as a stale bundle.
//
// ── WHERE IT RUNS ───────────────────────────────────────────────────────────
// Against a REAL PostgreSQL (PGlite) with the REAL migration chain from
// tests/schema-apply-order.json applied verbatim, and through the REAL GATED
// WRAPPER public.hr_put_client_state — the same entry point the browser calls,
// so hr_rpc_gate and the hr_note_rejection decorator are exercised rather than
// modelled. No credentials; production untouched.
//
// ── WHY --without EXISTS ────────────────────────────────────────────────────
// A guard that has never been red is not a guard (CLAUDE.md §4). `--without`
// replays the chain STOPPING at the migration before this lane's, i.e. exactly
// the database production is running today, and REQUIRES the assertions to fail.
// It is run as the first arm of --selftest, so the file cannot go green against
// a chain that does not contain its own migration.
//
// Exit: 0 green · 1 a real problem · 2 harness problem.
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { bootReplay } from './schema-replay.mjs';

const ROOT = new URL('../', import.meta.url);
const MIG = '2026-09-23-client-state-retired-fields.sql';
/* The last migration BEFORE this lane's. `--without` stops here, which rebuilds
   the body production runs today. Moving this constant when a file lands between
   them is the registration step. */
const MIG_PREV = '2026-09-22-pg-net-queue-lockdown.sql';
const UID = '000000c9-0000-0000-0000-0000000000c9';

/* The nine names the superseded 2026-09-14-client-state-projection-denylist.sql
   would have made AUTHORITY keys, and which are RETIRED here instead. `buffs` is
   the tenth and is tested on its own by R2, because it is the one actually in
   flight on a live tab. */
const NINE = ['streak', 'autoEatPct', 'foodSlot', 'combatStyle', 'toolCarry', 'renownHigh',
  'heroSlotsUnlocked', 'ownedThemes', 'ownedCosmetics'];
/* Client-only display/UX preferences that gate NOTHING server-side, so they can
   never join either list — which is what makes them honest fixtures. The same
   two 2026-09-13-client-state-buffs-denylist.sql §2(d) had to be repointed at
   when a later file denied `combatStyle` out from under it. */
const HONEST = ['lootFilter', 'lockedItems'];

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  x ${msg}`); } };

/* ── THE GATE-BLIND PAIR ───────────────────────────────────────────────────
   The migration's own §3 (an installed-body CODE hash) and §4 (the executed
   self-check) fire at APPLY time and catch almost everything below first, so an
   unblinded arm proves the MIGRATION can refuse rather than that THIS GUARD can
   see. The regression that actually brings the bug back is a LATER restatement,
   at which point §3 and §4 never run again and this file is what is left. Both
   are therefore short-circuited in gate-blind mode — narrowly: §3 keeps its two
   list assertions, §4 is skipped whole. */
const GATE_BLIND = [
  /* §3 WHOLE, at the one line only it carries: the CODE hash pin AND the two
     list assertions. Blinding only the pin left `buffs_back_on_the_deny_list`
     caught by the retired-list assertion instead, which is §3 working and is
     still not this guard's tick (MEASURED: the arm scored HARNESS). The `return`
     lands AFTER §3's own three-state guard, so a §0 that refused still raises. */
  ['  v_code := btrim(regexp_replace(\n              regexp_replace(replace(pg_get_functiondef(',
    '  return;  -- §3 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/client-state-retired-fields.mjs)\n'
    + '  v_code := btrim(regexp_replace(\n              regexp_replace(replace(pg_get_functiondef('],
  /* §4 whole, at its first probe statement. */
  ["    perform set_config('request.jwt.claim.sub', v_uid::text, true);",
    '    return;  -- §4 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/client-state-retired-fields.mjs)\n'
    + "    perform set_config('request.jwt.claim.sub', v_uid::text, true);"],
];

const MUTATIONS = {
  buffs_back_on_the_deny_list: {
    by: 'R2',
    why: 'THE SHIPPED OUTAGE, restored: `buffs` moves back to v_deny, so the hidden tab\'s whole '
       + 'patch is refused again and that player keeps losing every residue save',
    find: "    'buffs',\n    'streak','autoEatPct'",
    repl: "    'streak','autoEatPct'",
    also: ["    'farmPlots','farm','companions','offlineBudget'\n  ];",
      "    'farmPlots','farm','companions','offlineBudget','buffs'\n  ];"],
  },
  strip_is_a_noop: {
    by: 'R2',
    why: 'the key is counted as stripped but never removed from the patch, so the forgeable buff '
       + 'queue LANDS in client_state — the security property of the 2026-09-13 deny-list, gone '
       + 'rather than relaxed, behind an answer that says it was stripped',
    find: '      v_patch := v_patch - v_key;',
    repl: '      v_patch := v_patch;',
  },
  strip_is_silent: {
    by: 'R3',
    why: 'the strip is not journalled, so a save that silently did not happen is invisible again — '
       + 'which is the whole reason the 927-955 anonymous refusals a day were unreadable',
    find: '  foreach v_key in array v_strip loop\n    perform public.hr_record_rejection(',
    repl: '  foreach v_key in array array[]::text[] loop\n    perform public.hr_record_rejection(',
  },
  the_why_is_dropped: {
    by: 'R3',
    why: 'the journal records THAT something was stripped but not WHICH name, so a whole day of '
       + 'occurrences aggregates to {"(none)": n} — exactly the row 2026-09-14-rejection-field-'
       + 'detail.sql was written to stop producing',
    find: "      jsonb_build_object('field', v_key, 'why', v_key), 1);",
    repl: "      jsonb_build_object('field', v_key), 1);",
  },
  answer_hides_the_strip: {
    by: 'R2',
    why: '`stripped` is never reported, so a client has no way to learn it is sending a retired '
       + 'name and goes on sending it for ever',
    find: "    v_prev := v_prev || jsonb_build_object('stripped', to_jsonb(v_strip));",
    repl: '    v_prev := v_prev;',
  },
  only_the_first_name_bites: {
    by: 'R5',
    why: 'the loop runs over a single-element list, so the nine projection names are merged into '
       + 'client_state unchecked — the failure shape an array literal invites, and the one a '
       + 'one-key test would never see',
    find: '  foreach v_key in array v_retired loop\n    if v_patch ? v_key then',
    repl: "  foreach v_key in array array['buffs'] loop\n    if v_patch ? v_key then",
  },
  authority_key_is_merely_stripped: {
    by: 'R4',
    why: 'the deny loop stops refusing, so a forged {gold: 999} is filed as a retired name and '
       + 'stored — an authority key silently downgraded to a stale-bundle key, which is the one '
       + 'direction this change must never take',
    find: "  foreach v_key in array v_deny loop\n    if p_patch ? v_key then",
    repl: "  foreach v_key in array v_deny loop\n    if false then",
    also: ["    'buffs',\n    'streak','autoEatPct'", "    'gold',\n    'buffs',\n    'streak','autoEatPct'"],
  },
  strip_is_journalled_as_an_incident: {
    by: 'R3',
    why: 'the strip is filed with the escalation weight of fifty occurrences, so one stale tab '
       + 'fills hr_rejections_incident_idx and the "show me every incident this week" query — the '
       + 'reason that index exists — stops being answerable',
    find: "      jsonb_build_object('field', v_key, 'why', v_key), 1);",
    repl: "      jsonb_build_object('field', v_key, 'why', v_key), 60);",
  },
  strip_journals_before_the_put_lands: {
    by: 'R6',
    why: 'the strips are filed before the row is read, so a put that never lands (no character) '
       + 'still files a strip that did not happen — the journal starts over-reporting and the '
       + 'refusal count stops meaning anything',
    find: '  perform pg_advisory_xact_lock(hashtextextended',
    repl: "  foreach v_key in array v_strip loop\n"
        + "    perform public.hr_record_rejection(v_uid, v_slot, 'client_state_put', 'retired_field',\n"
        + "      jsonb_build_object('field', v_key, 'why', v_key), 1);\n"
        + '  end loop;\n'
        + '  perform pg_advisory_xact_lock(hashtextextended',
  },
};

/* A comment-only edit. If this turns the guard red, every tick above is a text
   read rather than a behavioural one and none of them is worth anything. */
const NEGATIVE_CONTROL = {
  find: '-- ── 2. THE LOCKDOWN, RE-STATED ──────────────────────────────────────────────',
  repl: '-- ── 2. THE LOCKDOWN, RE-STATED (comment-only negative control) ──────────────',
};

async function boot(mutate, gateBlind, extra, upTo) {
  const m = mutate ? MUTATIONS[mutate] : null;
  const pairs = [];
  if (m) { pairs.push([m.find, m.repl]); if (m.also) pairs.push(m.also); }
  if (extra) pairs.push([extra.find, extra.repl]);
  if (gateBlind) pairs.push(...GATE_BLIND.map((p) => p.slice()));
  const opts = {};
  if (pairs.length) opts.patches = new Map([[MIG, pairs]]);
  if (upTo) opts.upTo = upTo;
  const { db } = await bootReplay(opts);
  return db;
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

async function runAll(db, patched) {
  const q = (sql, p) => one(db, sql, p);

  // ── THE FIXTURE ─────────────────────────────────────────────────────────
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${UID}', false)`);
  const created = (await q('select public.hr_create_character(0) as r')).r;
  ok(created && created.created === true,
     `the probe character was created (${JSON.stringify(created)})`);

  /* THE REAL GATED WRAPPER, not __ungated: the browser calls this one, so
     hr_rpc_gate and the hr_note_rejection decorator are exercised rather than
     modelled. A raised error is an ANSWER, never a reason to abandon the run — a
     defect that makes the body violate a constraint must read as RED here, not
     as a harness failure, which is indistinguishable from "cannot see it". */
  const put = async (patch) => {
    try {
      return (await q('select public.hr_put_client_state(0, $1::jsonb, gen_random_uuid()) as r',
        [JSON.stringify(patch)])).r;
    } catch (e) {
      return { ok: false, error: 'RAISED', raised: String(e && e.message).split('\n')[0] };
    }
  };
  const putIdem = async (patch, idem) => {
    try {
      return (await q('select public.hr_put_client_state(0, $1::jsonb, $2::uuid) as r',
        [JSON.stringify(patch), idem])).r;
    } catch (e) {
      return { ok: false, error: 'RAISED', raised: String(e && e.message).split('\n')[0] };
    }
  };
  const bag = async () => (await q(
    'select coalesce(client_state, \'{}\'::jsonb) as b from public.player_state '
    + 'where user_id=$1 and slot=0', [UID])).b;
  const clear = () => db.query(
    "update public.player_state set client_state='{}'::jsonb where user_id=$1 and slot=0", [UID]);
  const row = async (code) => (await q(
    'select n, severity, whys, verbs, last_detail from public.hr_rejections '
    + 'where user_id=$1 and slot=0 and code=$2 and day=current_date', [UID, code])) || null;
  const retiredN = async () => Number((await row('retired_field'))?.n || 0);

  // ── R1. NOTHING BECAME CLIENT-REACHABLE ─────────────────────────────────
  // A restatement of a SECURITY DEFINER body is exactly where an ACL goes
  // missing, and create-or-replace preserving the ACL is a claim worth measuring
  // rather than repeating.
  ok((await q("select has_function_privilege('authenticated', "
    + "'public.hr_put_client_state(int,jsonb,uuid)', 'execute') as p")).p === true,
     'hr_put_client_state IS executable by authenticated (otherwise every residue save is dead)');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    ok((await q('select has_function_privilege($1, '
      + "'public.hr_put_client_state__ungated(int,jsonb,uuid)', 'execute') as p", [role])).p === false,
       `hr_put_client_state__ungated is NOT executable by ${role}`);
  }

  // ── R2. THE FIRST PUT: A RETIRED KEY IS STRIPPED, NOT REFUSED ───────────
  // The exact patch the hidden b<=543 tab has been sending since 2026-09-13.
  {
    await clear();
    const r = await put({
      buffs: [{ type: 'damage', magnitude: 9999, remainingMs: 9e9 }],
      lootFilter: ['junk'],
    });
    ok(r && r.ok === true,
       `a put carrying the retired \`buffs\` key was REFUSED: ${JSON.stringify(r)} — nine days of one `
       + 'player\'s saves are the cost of that refusal');
    ok(r && JSON.stringify(r.stripped) === JSON.stringify(['buffs']),
       `the answer must name what it stripped (stripped = ${JSON.stringify(r && r.stripped)}, expected `
       + '["buffs"]) — a silent strip is how a client never learns to stop sending it');
    ok(r && r.slot === 0 && Number(r.bytes) > 0,
       `the accepted envelope kept slot and bytes: ${JSON.stringify(r)}`);
    const b = await bag();
    ok(b && JSON.stringify(b.lootFilter) === JSON.stringify(['junk']),
       `the honest key that travelled with \`buffs\` was NOT stored (bag = ${JSON.stringify(b)})`);
    ok(b && !Object.prototype.hasOwnProperty.call(b, 'buffs'),
       `the forgeable buff queue was STORED (bag = ${JSON.stringify(b)}) — the security property of `
       + '2026-09-13-client-state-buffs-denylist.sql is GONE, not relaxed');
  }

  // ── R3. THE STRIP IS JOURNALLED, BY NAME, AT severity normal ────────────
  {
    const j = await row('retired_field');
    ok(!!j, 'the strip was not journalled at all — a save that silently did not happen is precisely '
       + 'what nine days of anonymous forbidden_field rows failed to say');
    ok(j && Number(j.n) === 1, `retired_field n = ${j && j.n}, expected 1`);
    ok(j && JSON.stringify(j.whys) === JSON.stringify({ buffs: 1 }),
       `whys = ${JSON.stringify(j && j.whys)}, expected {"buffs":1} — the breakdown IS the diagnosis: `
       + 'it says which build the tab is running');
    ok(j && j.severity === 'normal',
       `severity = ${j && j.severity}, expected normal — a tab that has not reloaded is not an attack, `
       + 'and hr_rejections_incident_idx has to stay answerable');
    ok(j && j.verbs && Object.prototype.hasOwnProperty.call(j.verbs, 'client_state_put'),
       `verbs = ${JSON.stringify(j && j.verbs)}, expected the real client_state_put gesture rather `
       + 'than an unattributable fallback');
    ok(j && j.last_detail && j.last_detail.field === 'buffs',
       `last_detail = ${JSON.stringify(j && j.last_detail)}, expected field "buffs"`);
  }

  // ── R4. AN AUTHORITY KEY IS STILL REFUSED, WHOLE ────────────────────────
  // `gold` is deliberate: on the deny-list since 2026-08-22 and moved by no
  // later file, so this arm stays honest under every list mutation planted here.
  {
    await clear();
    const before = await retiredN();
    const r = await put({ gold: 999, lootFilter: ['junk'] });
    ok(r && r.ok === false && r.error === 'forbidden_field' && r.field === 'gold',
       `a put carrying forged gold was not refused forbidden_field/gold: ${JSON.stringify(r)} — the `
       + 'authority half of this body is UNCHANGED by design');
    const b = await bag();
    ok(JSON.stringify(b) === '{}',
       `the refused patch still wrote client_state (bag = ${JSON.stringify(b)})`);
    ok((await retiredN()) === before,
       'the forged-gold refusal moved the retired_field counter — a forgery must never be '
       + 'classified as a stale bundle');
    const j = await row('forbidden_field');
    ok(j && j.last_detail && j.last_detail.field === 'gold',
       `the refusal journalled ${JSON.stringify(j && j.last_detail)}, expected field "gold" — the `
       + '2026-09-14 field seam must still see this path');
  }

  // ── R5. EVERY RETIRED NAME BITES, ON ITS OWN ────────────────────────────
  // Looped: a list that only strips the first name is the failure the loop
  // exists to catch, and one-key coverage would never see it.
  {
    for (const key of NINE) {
      await clear();
      const r = await put({ [key]: 'forged', lockedItems: { bronze_sword: true } });
      ok(r && r.ok === true && JSON.stringify(r.stripped) === JSON.stringify([key]),
         `the retired key ${key} did not strip cleanly: ${JSON.stringify(r)}`);
      const b = await bag();
      ok(b && !Object.prototype.hasOwnProperty.call(b, key),
         `${key} survived the strip and is now a second copy of a value the server owns `
         + `(bag = ${JSON.stringify(b)})`);
      ok(b && b.lockedItems && b.lockedItems.bronze_sword === true,
         `the honest key beside ${key} did not land (bag = ${JSON.stringify(b)})`);
    }
  }

  // ── R6. A PUT THAT NEVER LANDS FILES NOTHING ────────────────────────────
  // slot 3 has no character. The strip is computed, the put refuses, and a
  // journal row here would be a strip that did not happen.
  {
    const before = await retiredN();
    let r;
    try {
      r = (await q('select public.hr_put_client_state(3, $1::jsonb, gen_random_uuid()) as r',
        [JSON.stringify({ buffs: [], lootFilter: ['junk'] })])).r;
    } catch (e) { r = { ok: false, error: 'RAISED', raised: String(e && e.message).split('\n')[0] }; }
    ok(r && r.ok === false,
       `a put against a slot with no character was accepted: ${JSON.stringify(r)}`);
    ok((await retiredN()) === before,
       'a put that never reached the update still filed a retired_field occurrence — the journal '
       + 'now over-reports and the count stops meaning anything');
  }

  // ── R7. AUTHORITY WINS OVER RETIRED, IN THE SAME PATCH ──────────────────
  // A patch carrying BOTH is a forgery. It must be refused whole, store nothing,
  // and be filed as forbidden_field rather than as a stale bundle.
  {
    await clear();
    const before = await retiredN();
    const r = await put({ gold: 1e12, buffs: [{ type: 'damage', magnitude: 9999 }],
      lootFilter: ['junk'] });
    ok(r && r.ok === false && r.error === 'forbidden_field' && r.field === 'gold',
       `a patch carrying forged gold AND a retired name was not refused on the gold: `
       + `${JSON.stringify(r)}`);
    ok(JSON.stringify(await bag()) === '{}', 'the mixed forgery stored something');
    ok((await retiredN()) === before,
       'the mixed forgery filed a retired_field occurrence — the authority check must run FIRST');
  }

  // ── R8. AN HONEST PUT IS UNCHANGED, TO THE BYTE ─────────────────────────
  // The failure mode this whole family is most dangerous for, plus the envelope
  // claim: `stripped` is ABSENT when nothing was stripped, so no client and no
  // guard that reads an ordinary accepted put sees a new key.
  {
    await clear();
    const before = await retiredN();
    const r = await put({ lootFilter: ['junk'], houseTheme: 'forest',
      unlockedRecipes: { shrimp_recipe: true } });
    ok(r && r.ok === true, `an honest residue put was refused: ${JSON.stringify(r)}`);
    ok(r && !Object.prototype.hasOwnProperty.call(r, 'stripped'),
       `an ordinary accepted put reported \`stripped\` (${JSON.stringify(r)}) — the envelope must be `
       + 'unchanged when there is nothing to say');
    const b = await bag();
    ok(b && b.houseTheme === 'forest' && b.unlockedRecipes
       && b.unlockedRecipes.shrimp_recipe === true,
       `the honest put answered ok and stored ${JSON.stringify(b)} — \`unlockedRecipes\` is `
       + 'deliberately still residue: the client half that sends hr_recipe_learn is not built, so '
       + 'this bag is still the only record that a scroll was read');
    ok((await retiredN()) === before, 'an honest put filed a journal row');
    for (const h of HONEST) {
      await clear();
      const rr = await put({ [h]: h === 'lootFilter' ? ['junk'] : { bronze_sword: true } });
      ok(rr && rr.ok === true && !Object.prototype.hasOwnProperty.call(rr, 'stripped'),
         `${h} — a client-only preference that gates nothing server-side — was not saved cleanly: `
         + JSON.stringify(rr));
    }
  }

  // ── R9. A REPLAY IS ONE EFFECT, AND IT REMEMBERS THE STRIP ──────────────
  {
    await clear();
    const idem = '000000c9-0000-0000-0000-00000000dead';
    const first = await putIdem({ buffs: [{ type: 'damage', magnitude: 1 }],
      lootFilter: ['ore'] }, idem);
    const n1 = await retiredN();
    const again = await putIdem({ buffs: [{ type: 'damage', magnitude: 1 }],
      lootFilter: ['ore'] }, idem);
    ok(first && first.ok === true && JSON.stringify(first.stripped) === JSON.stringify(['buffs']),
       `the first put did not strip: ${JSON.stringify(first)}`);
    ok(again && again.replayed === true
       && JSON.stringify(again.stripped) === JSON.stringify(['buffs']),
       `the replayed key was not answered from the cache WITH its stripped list: `
       + JSON.stringify(again));
    ok((await retiredN()) === n1,
       'the replay filed a SECOND retired_field occurrence — one gesture, one effect, one row');
  }

  // ── R10. THE FILE RE-APPLIES AS A NOTICE, NOT A RE-INSTALL ──────────────
  // §0 recognises the body it installs and returns; §3 and §4 skip. A second
  // apply must leave the body byte-identical and must not raise.
  // SKIPPED on a patched chain: the file ON DISK is not the text that was
  // applied, so §0 correctly refuses and every mutation would score a tick here
  // that says nothing about the defect it planted.
  if (!patched) {
    const body = async () => (await q(
      "select pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'"
      + '::regprocedure) as d')).d;
    const before = await body();
    let reapplied = true;
    try {
      const sql = (await readFile(new URL(`supabase/migrations/${MIG}`, ROOT), 'utf8'))
        .replace(/\r\n/g, '\n');
      await db.exec(sql);
    } catch (e) { reapplied = false; ok(false, `the migration did not re-apply: ${e && e.message}`); }
    if (reapplied) {
      ok((await body()) === before, 'a second apply leaves hr_put_client_state__ungated byte-identical');
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  for (const [k, m] of Object.entries(MUTATIONS)) console.log(`${k}  [caught by ${m.by}]\n    ${m.why}\n`);
  console.log('negative control: comment-only edit (must NOT be caught)');
  console.log(`--without: the chain replayed upTo ${MIG_PREV} (i.e. production today) must be RED`);
  process.exit(0);
}

/* --without: the chain STOPPING before this lane's migration. Production today.
   Every R2/R3/R5 assertion must fail, or this guard would pass against a
   database that does not contain the fix and would prove nothing at all. */
async function without() {
  const save = failed; failed = 0;
  let threw = false;
  try { const db = await boot(null, false, null, MIG_PREV); await runAll(db, true); }
  catch (e) {
    if (e && e.harness) { console.error(`--without HARNESS: ${e.message}`); process.exit(2); }
    threw = true;
  }
  const red = failed > 0 || threw;
  const n = failed; failed = save;
  if (!red) {
    console.error('x --without STAYED GREEN: the guard passes against the chain WITHOUT '
      + `${MIG}, so it is measuring nothing this lane added.`);
    return false;
  }
  console.log(`  --without (chain upTo ${MIG_PREV}): RED, ${threw ? 'threw' : `${n} assertion(s)`} — `
    + 'the guard cannot pass against the database production runs today');
  return true;
}

if (argv.includes('--without')) {
  const good = await without();
  process.exit(good ? 0 : 1);
}

const only = (argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
if (only) {
  if (!MUTATIONS[only]) { console.error(`unknown mutation "${only}" — see --list`); process.exit(2); }
  const gateBlind = argv.includes('--gate-blind');
  try { const db = await boot(only, gateBlind); await runAll(db, true); }
  catch (e) { console.log(`${only}: RED (threw: ${String(e.message).split('\n')[0]})`); process.exit(0); }
  console.log(`${only}${gateBlind ? ' [gate-blind]' : ''}: ${failed ? `RED (${failed} assertion(s))` : 'GREEN'}`);
  process.exit(0);
}

if (argv.includes('--selftest')) {
  console.log('client-state-retired-fields --selftest: each mutation must turn the guard RED');
  {
    const save = failed; failed = 0;
    const db = await boot(null); await runAll(db);
    if (failed) { console.error(`\nFLOOR CHECK FAILED: the CLEAN pass is already red (${failed}).`); process.exit(2); }
    failed = save;
  }
  let bad = 0, n = 1;
  if (!(await without())) bad++;
  for (const name of Object.keys(MUTATIONS)) {
    for (const gateBlind of [false, true]) {
      n++;
      const label = gateBlind ? `${name} [gate-blind]` : name;
      const saveFail = failed; failed = 0; let threw = false;
      try { const db = await boot(name, gateBlind); await runAll(db, true); }
      catch (e) { threw = true; console.log(`  ${label}: RED (threw: ${String(e.message).split('\n')[0]})`); }
      const wentRed = failed > 0 || threw; failed = saveFail;
      if (gateBlind && threw) {
        bad++;
        console.error(`  x ${label}: the §3/§4 short-circuit did NOT take (the apply still threw), so this `
          + "arm demonstrated the MIGRATION's own gate again rather than the guard. Fix GATE_BLIND.");
        continue;
      }
      if (wentRed) { if (!threw) console.log(`  ${label}: RED (assertions failed) — caught by ${MUTATIONS[name].by}`); }
      else { bad++; console.error(`  x ${label}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
    }
  }
  {
    n++;
    const saveFail = failed; failed = 0; let threw = false;
    try { const db = await boot(null, false, NEGATIVE_CONTROL); await runAll(db, true); }
    catch (e) { threw = true; console.error(`  x negative control THREW: ${e && e.message}`); }
    const wentRed = failed > 0 || threw; failed = saveFail;
    if (wentRed) { bad++; console.error('  x negative control: a COMMENT-ONLY edit turned the guard red — '
      + 'its assertions read text, not behaviour, and every tick above is worthless'); }
    else console.log('  negative control (comment-only): GREEN, as required');
  }
  if (bad) { console.error(`\n${bad} arm(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${n} arms behaved (${Object.keys(MUTATIONS).length} defects x gate / gate-blind, `
    + 'plus --without and one negative control). The guard is non-vacuous in its own right.');
  process.exit(0);
}

try {
  const db = await boot(null);
  await runAll(db);
} catch (e) {
  if (e && e.harness) { console.error(`client-state-retired-fields HARNESS: ${e.message}`); process.exit(2); }
  throw e;
}
if (failed) { console.error(`\nclient-state-retired-fields: ${failed} assertion(s) FAILED.`); process.exit(1); }
console.log('client-state-retired-fields: a retired key is stripped and journalled by NAME at severity '
  + 'normal while the honest remainder saves and the forgeable shadow copy never lands, an authority key '
  + 'is still refused WHOLE and is never filed as retired, authority wins in a mixed patch, all ten '
  + 'retired names bite on their own, a put that never lands files nothing, an ordinary accepted put is '
  + 'byte-identical, a replay is one effect, and the file re-applies as a notice.');
process.exit(0);
