// ============================================================================
// tests/party-hunt-view.mjs — THE PARTY HUNT AS A MEMBER SEES IT: A MEMBER-ONLY
//                             READ, NAMES NEVER IDS, ITS OWN RATE BUCKET
//
//   node tests/party-hunt-view.mjs            the guard
//   node tests/party-hunt-view.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-15-party-hunt-view.sql (Game Designer A1-A3). The
// chain is replayed up to the file BEFORE it, then the file is executed here
// inside a transaction that is always rolled back, so a red self-check is a RED
// arm with the self-check's own message rather than a harness failure.
//
//   P-APPLY   the file applies; its §7 self-check passes. §7 drives a fixture
//             through the REAL hr_party_tick_settle (combat armed inside its
//             rolled-back block) and reads hr_party_hunt_view AS
//             `authenticated` at each step:
//               ATTENDED  v-attended: a present hunter's paid windows are what
//                         the view reads (xp, gold, kills, split, hunt kills)
//               AWAY      v-away: past the horizon → camping; mark moved with
//                         the horizon spent → still camping; real return →
//                         rejoining; next paid fire → hunting; v-clamp → 3
//                         drops today → camping_today
//             plus v-start, v-conserve (tally = ledger), v-ended, v-isolate,
//             v-nonmember, v-ids (no uuid in any answer), v-rate, k1-k6.
//   P-IDEM    a second apply is byte-identical (inventory + the four bodies +
//             the tally rows)
//   P-CLIENT  no client file reads share_bp / xp / gold off an hr_party_view
//             row (A2 retired them), and no client file reads
//             party_hunt_roster_log or party_hunt_tally directly. The hunt-view
//             readers (huntMemberRow, partyReceiptLine) are exempt by name:
//             those keys live on hr_party_hunt_view rows.
//
// --mutate plants a defect in §0-§6 of the file's text, executes it, then runs
// the UNCHANGED §7 and requires it to refuse on the named arm. The four the
// lane brief names: a non-member reads, ids leak, a member reads another party,
// the rate gate is missing — plus the state, tally, grant and key-set defects.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const MIG = '2026-10-15-party-hunt-view.sql';
const PREV = '2026-10-14-world-tick-presence-signal.sql';
const SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const SELF = '-- ── §7 SELF-CHECK';
if (SQL.indexOf(SELF) < 0) { console.error('harness: the migration has no §7 marker'); process.exit(2); }
const SIG = {
  view: 'public.hr_party_hunt_view(integer)',
  roster: 'public.hr_party_view(uuid)',
  gate: 'public.hr_rpc_gate(text)',
  tally: 'public.hr_party_hunt_tally_on_ledger()',
};
const S1_VIEW_MD5 = '6627e1a3de0a9efe7ad65f94810e1931';

const md5Of = async (db, sig) =>
  (await db.query(`select md5(replace(prosrc, chr(13), '')) as m from pg_proc where oid = '${sig}'::regprocedure`)).rows[0].m;
const bodies = async (db) => (await Promise.all(Object.values(SIG).map((s) => md5Of(db, s)))).join(',');

/** Apply `sql` in a rolled-back transaction; return null or the first error line. */
async function tryApply(db, sql, after) {
  await db.exec('begin;');
  try {
    await db.exec(sql);
    if (after) return await after();
    return null;
  } catch (e) {
    return String(e.message).split('\n')[0];
  } finally {
    await db.exec('rollback;');
  }
}

/* The b569 hunt card reads share_bp / xp / gold off hr_party_hunt_view's
   member rows, where they LIVE (the per-hunt tally, §4). A2 retired them from
   hr_party_view's ROSTER rows only. These named functions take a hunt-view
   answer and nothing else, so their bodies are cut out of the scan: a retired
   key read anywhere else in either file (the roster row, the screen) is still
   red, and an exempt reader that disappears or is renamed is red too. */
const HUNT_VIEW_READERS = { 'src/render/party-panel.js': ['huntMemberRow', 'partyReceiptLine'] };

/** Cut `function name(…) { … }` out of code; null when it is not there. */
function cutFunction(code, name) {
  const at = code.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = code.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(0, at) + code.slice(i + 1);
  }
  return null;
}

/** P-CLIENT: the static half of A2 and of "the view is the only read path". */
async function clientScan(override = {}) {
  const files = ['src/net/party.js', 'src/render/party-panel.js'];
  const bad = [];
  for (const f of files) {
    const src = f in override ? override[f] : await readFile(join(ROOT, f), 'utf8');
    // Code only: strip line and block comments so the header prose may name them.
    let code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const fn of HUNT_VIEW_READERS[f] || []) {
      const cut = cutFunction(code, fn);
      if (cut === null) { bad.push(`${f} has no hunt-view reader ${fn}() — the exemption names nothing`); continue; }
      code = cut;
    }
    for (const k of ['share_bp', '.xp', '.gold', "['xp']", "['gold']"]) {
      if (code.includes(k)) bad.push(`${f} reads ${k}`);
    }
    for (const t of ['party_hunt_roster_log', 'party_hunt_tally']) {
      if (code.includes(t)) bad.push(`${f} names ${t}`);
    }
  }
  return bad;
}

/* The scan's own mutation proof (--mutate): each plant must turn P-CLIENT red. */
async function scanMutantList() {
  const panel = await readFile(join(ROOT, 'src/render/party-panel.js'), 'utf8');
  const net = await readFile(join(ROOT, 'src/net/party.js'), 'utf8');
  const plant = (src, anchor, add) => {
    if (src.split(anchor).length - 1 !== 1) { console.error(`harness: scan mutant anchor matched != 1: ${anchor}`); process.exit(2); }
    return src.replace(anchor, () => anchor + add);
  };
  const M = [
    { name: 'rosterRowReadsXp', why: 'the ROSTER row (hr_party_view) renders a retired xp key',
      over: { 'src/render/party-panel.js': plant(panel, '  function memberRow(m, opts) {\n', '    var leak = m.xp;\n') } },
    { name: 'netReadsShare', why: 'the net layer reads share_bp off the roster answer',
      over: { 'src/net/party.js': net + '\nfunction leak(v) { return v.members[0].share_bp; }\n' } },
    { name: 'exemptReaderRenamed', why: 'an exempt hunt-view reader is renamed, so the exemption silently names nothing',
      over: { 'src/render/party-panel.js': panel.split('function partyReceiptLine(').join('function partyReceiptLine2(') } },
  ];
  return M;
}

async function runScanMutants(M) {
  let survived = 0;
  for (const m of M) {
    const bad = CONTROL ? await clientScan() : await clientScan(m.over);
    const hit = bad.length > 0;
    console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
    if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via P-CLIENT: ${bad[0]}`);
    else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: SURVIVED`); }
  }
  return { n: M.length, survived };
}

let db;
try { ({ db } = await bootReplay({ upTo: PREV })); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}
if ((await md5Of(db, SIG.roster)) !== S1_VIEW_MD5) {
  console.error('harness: the replayed chain before this file does not carry the hr_party_view body the file restates'); process.exit(2);
}

if (!MUTATE) {
  console.log('\nparty-hunt-view: a member-only read of the hunt, names never ids, its own rate bucket');
  const red = [];
  const err = await tryApply(db, SQL, async () => {
    const inv1 = JSON.stringify(await inventory(db));
    const b1 = await bodies(db);
    const t1 = JSON.stringify((await db.query('select * from public.party_hunt_tally order by 1, 2, 3')).rows);
    console.log('  ✓ P-APPLY — applied; §7 passed (k1-k6; v-start, v-attended, v-away, v-clamp, v-conserve, v-ended, v-isolate, v-nonmember, v-ids, v-rate)');
    try { await db.exec(SQL); } catch (e) { return `P-IDEM: the second apply RAISED: ${String(e.message).split('\n')[0]}`; }
    if (JSON.stringify(await inventory(db)) !== inv1 || (await bodies(db)) !== b1
        || JSON.stringify((await db.query('select * from public.party_hunt_tally order by 1, 2, 3')).rows) !== t1) {
      return 'P-IDEM: the second apply moved the schema, a body or a tally row';
    }
    console.log('  ✓ P-IDEM — a second apply is byte-identical (§0 accepted its own hr_party_view, §3 skipped, §7 passed twice)');
    return null;
  });
  if (err) { red.push(err.startsWith('P-') ? err.split(':')[0] : 'P-APPLY'); console.log(`  ✗ ${err}`); }
  const bad = await clientScan();
  if (bad.length) { red.push('P-CLIENT'); console.log(`  ✗ P-CLIENT — ${bad.join('; ')}`); }
  else console.log('  ✓ P-CLIENT — no client file reads the retired keys or the two server-only tables');
  await db.close();
  console.log(red.length ? `\nRED: ${red.join(', ')}`
    : '\nGREEN: members read their own party hunt by name, non-members read nothing, the poll has its own bucket');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate ────────────────────────────────────────────────────────────────
const MUTANTS = [
  // ── the four the lane brief names ──
  { name: 'nonMemberReads', why: 'the party is resolved by slot alone: an outsider reads somebody\'s party', expect: /§7 v-nonmember/,
    find: '  v_party := public.hr_party_of(v_uid, p_slot);\n',
    repl: '  v_party := coalesce(public.hr_party_of(v_uid, p_slot), (select m.party_id from public.party_member m where m.slot = p_slot and m.left_at is null order by m.joined_at limit 1));\n' },
  { name: 'idsLeakMember', why: 'a member row carries the member\'s auth.users id (Security E2)', expect: /§7 v-ids/,
    find: "               'me',        (m.user_id = v_uid and m.slot = p_slot),\n",
    repl: "               'me',        (m.user_id = v_uid and m.slot = p_slot), 'uid', m.user_id,\n" },
  { name: 'idsLeakStoppedBy', why: 'stopped_by is passed through: member_unpayable:<uuid> reaches the client', expect: /§7 v-(ended|ids)/,
    find: "      'stopped_by', split_part(v_hunt.stopped_by, ':', 1),\n", repl: "      'stopped_by', v_hunt.stopped_by,\n" },
  { name: 'otherPartyHunt', why: 'the live hunt is not filtered by party: a member reads another party\'s hunt', expect: /§7 v-/,
    find: '   where h.party_id = v_party and h.ended_at is null;\n', repl: '   where h.ended_at is null and (h.party_id = v_party or true);\n' },
  { name: 'otherPartyEvents', why: 'the event strip is not filtered by hunt: a member reads another party\'s drops by name', expect: /§7 v-isolate/,
    find: '           where l.hunt_id = v_hunt.id\n           order by l.id desc\n           limit c_events) e\n',
    repl: '           where l.hunt_id is not null\n           order by l.id desc\n           limit c_events) e\n' },
  { name: 'rateGateBypassed', why: 'the gate is named but never refuses (the hygiene detector\'s text match still passes)', expect: /§7 v-rate/,
    find: "  if not public.hr_rpc_gate('party_hunt_view') then\n", repl: "  if false and not public.hr_rpc_gate('party_hunt_view') then\n" },
  { name: 'bucketOnParty', why: 'the poll spends the party verbs\' 12/min bucket', expect: /§7 k4/,
    find: "  if not public.hr_rpc_gate('party_hunt_view') then\n", repl: "  if not public.hr_rpc_gate('party') then\n" },
  // ── the state machine ──
  { name: 'clampIgnored', why: 'a member held out by the 3/day clamp reads camping (fixable by coming back) — it is not', expect: /§7 v-clamp/,
    find: '                     and l2.event = \'drop\' and l2.day_key = v_day) >= c_max_drops_day\n',
    repl: '                     and l2.event = \'drop\' and l2.day_key = v_day) > c_max_drops_day\n' },
  { name: 'rejoiningNever', why: 'a returned member never reads rejoining', expect: /§7 v-away/,
    find: "              then 'rejoining'\n", repl: "              then 'camping'\n" },
  { name: 'rejoiningIgnoresHorizon', why: 'rejoining is promised while the horizon is spent (the settle will not rejoin)', expect: /§7 v-away/,
    find: "                                      * interval '1 millisecond' > now())\n",
    repl: "                                      * interval '1 millisecond' > '-infinity'::timestamptz)\n" },
  { name: 'shareWhileCamping', why: 'a camping member shows a split they are not earning', expect: /§7 v-clamp/,
    find: "               'share_bp',  case when s.state = 'hunting' then coalesce(t.share_bp, 0) else 0 end,\n",
    repl: "               'share_bp',  coalesce(t.share_bp, 0),\n" },
  { name: 'nullNotZero', why: 'a member with no tally reads NULL earnings, not 0', expect: /§7 v-start/,
    find: "               'xp',        coalesce(t.xp, 0),\n", repl: "               'xp',        t.xp,\n" },
  // ── the tally ──
  { name: 'tallyCrossParty', why: 'a ledger row naming another party\'s hunt is credited to that party\'s view', expect: /§7 v-conserve/,
    find: '                    where h.id = v_hunt and h.party_id = v_party) then\n', repl: '                    where h.id = v_hunt) then\n' },
  { name: 'tallyNotFolded', why: 'the tally overwrites instead of summing (the view under-reports a long hunt)', expect: /§7 v-conserve/,
    find: '       set xp       = t.xp + excluded.xp,\n', repl: '       set xp       = excluded.xp,\n' },
  { name: 'failsafeNarrowed', why: 'Security\'s mutant: the trigger\'s fail-safe catches one sqlstate, so an overflowing engine-authored row refuses the whole settle payout', expect: /§7 v-failsafe/,
    find: '  exception when others then\n    raise warning \'party_hunt_tally skipped',
    repl: '  exception when division_by_zero then\n    raise warning \'party_hunt_tally skipped' },
  // ── grants, policies, key set ──
  { name: 'viewGrantedAnon', why: 'hr_party_hunt_view is executable by anon', expect: /§7 k1/,
    find: 'grant execute on function public.hr_party_hunt_view(integer) to authenticated;\n',
    repl: 'grant execute on function public.hr_party_hunt_view(integer) to authenticated, anon;\n' },
  { name: 'rosterLogPolicy', why: 'a client SELECT policy is added on party_hunt_roster_log (a second read path)', expect: /§7 k2/,
    find: SELF, repl: 'create policy phv_leak on public.party_hunt_roster_log for select to authenticated using (true);\n' + SELF },
  { name: 'partyViewKeysBack', why: 'hr_party_view keeps a retired key (the frozen set is an equality)', expect: /§7 k5/,
    find: "               'recovering_until', ps.recovering_until) as row\n",
    repl: "               'recovering_until', ps.recovering_until, 'share_bp', null::int) as row\n" },
];

console.log('\nparty-hunt-view --mutate: every mutant must go RED on its named arm');
if ((await clientScan()).length) { console.error('harness: the unmutated client scan is red'); process.exit(2); }
const SCAN = await scanMutantList();
const control = await tryApply(db, SQL);
if (control) { console.error(`harness: the unmutated file is red (${control})`); process.exit(2); }
/* ONE declaration for every arm this run reports (tests/mutant-control.mjs counts them). */
console.log(`[mutants] ${MUTANTS.length + SCAN.length}`);
const scan = await runScanMutants(SCAN);
let survived = scan.survived;
for (const m of MUTANTS) {
  const n = SQL.split(m.find).length - 1;
  if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x`); process.exit(2); }
  const mutated = CONTROL ? SQL : SQL.replace(m.find, () => m.repl);
  const cut = mutated.indexOf(SELF);
  const got = await tryApply(db, mutated.slice(0, cut), async () => {
    try { await db.exec(mutated.slice(cut)); return null; } catch (e) { return String(e.message).split('\n')[0]; }
  });
  const hit = got !== null && m.expect.test(got);
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${got.slice(0, 160)}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${got === null ? 'SURVIVED' : `red only via ${got.slice(0, 300)}`}`); }
}
await db.close();
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length + scan.n - survived} arm(s) read caught`);
  process.exit(survived === MUTANTS.length + scan.n ? 0 : 1);
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length + scan.n} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
