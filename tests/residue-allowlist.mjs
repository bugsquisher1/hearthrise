#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/residue-allowlist.mjs — THE SERVER'S RESIDUE IS THE CLIENT'S ALLOWLIST, ON A REAL DATABASE.
//
//   node tests/residue-allowlist.mjs            the rules: the client's bounds, then the whole replayed chain (PGlite)
//   node tests/residue-allowlist.mjs --sizes    print each field's largest honest value against its bound
//   node tests/residue-allowlist.mjs --mutate   every planted defect must be refused, each for its own reason
//
// mutant-anchors: supabase/migrations/2027-04-02-residue-allowlist.sql, supabase/migrations/2027-04-02-residue-fields.generated.sql
//
// CLAUDE.md §6: "the residue is an ALLOWLIST". Architecture audit 2026-11-09 F4: it was one only in the
// browser; the server kept any key not on a deny list, up to 256 KiB a hero. The server's list is now
// generated from the client's (tools/gen-residue-fields.mjs). The migrations prove their contract in one
// transaction; this plays it as a client does, call by call on a committed database, through the gated RPC:
//   RA-0  THE CLIENT'S BOUNDS HOLD ITS OWN VALUES (no database): RESIDUE_BYTES names exactly RESIDUE_FIELDS;
//         the largest value each sanitizer lets through, built from the game's real ids, fits its field's
//         bound; a full late-game bag (every bag mark, every Storage mark, eight hunt cards, every other
//         field at its largest) fits the total; and the total is under the sum of the bounds
//   RA-1  ONE LIST: the server's rows and total are the client's (and the generated file is in sync)
//   RA-2  EVERY HONEST FIELD IS STORED: each field's largest value is accepted and read back as sent
//   RA-3  A KEY NO LIST NAMES REFUSES THE WHOLE PATCH: the old authority names, the old retired names, a
//         250 KiB junk key, a name off by case; the honest field beside it is not stored; the stored bag is
//         byte for byte what it was; one journal row a day names the put
//   RA-4  A FIELD OVER ITS BOUND, A PATCH OVER THE TOTAL, A BAG OVER THE TOTAL: each refused by its own
//         code, nothing stored; no stored bag is ever over the total
//   RA-5  A BAG STORED UNDER THE OLD RULE: untouched by a refused put, tidied to its listed fields by an
//         accepted one, and never touched by the apply itself
//   RA-6  ONE KEY, ONE EFFECT; a key used by another verb is refused; the answer carries no `stripped`
//   RA-7  THE DOORS: anon cannot ask; nobody but the owner reaches the ungated body, the list or the total
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { OUT_FILE as LIST } from '../tools/gen-residue-fields.mjs';

const FILE = '2027-04-02-residue-allowlist.sql';
const U = (i) => '000000c0-0000-4000-a000-00402c' + String(i).padStart(6, '0');
const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
const src = (p) => import(pathToFileURL(join(ROOT, ...p.split('/'))).href);
/* JSON with every object's keys in order: jsonb keeps a value, not the order its keys were sent in. */
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));

/**
 * The largest value each residue sanitizer lets through, built from the game's real ids (never a made-up
 * 64-letter id): what an honest client can send at the very most. `full` is a late-game bag at once: the
 * same, but the hunt cards as a hunt writes them (one death line, not six of the longest).
 */
export async function honest() {
  const R = await src('src/session/residue.js');
  const { ITEMS } = await src('src/data/items.js');
  const { HUNTS } = await src('src/data/hunts.js');
  const { HUD_WIDGETS } = await src('src/data/hud-widgets.js');
  const { FLOAT_TYPES, LOG_TYPES } = await src('src/data/combat-text.js');
  const { TOWN_ZOOM } = await src('src/data/world/view-zoom.js');
  const items = Object.keys(ITEMS).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const hunt = HUNTS.map((h) => h.id).sort((a, b) => b.length - a.length)[0];
  const idOf = (r) => (typeof r === 'string' ? r : r.id);
  /* a count as large as a stack gets, and a seen-order far past any a player reaches (one a change) */
  const seen = (n) => Object.fromEntries(items.slice(0, n).map((id, i) => [id, [100000, 99999999 - i]]));
  const big = -123456789012.345;                                   // a number as long as the game's own get
  const line = (n) => 'A Coppercap Brute struck the last blow. '.repeat(8).slice(0, n);
  const card = (i, deaths, len) => ({
    id: ('00000000-0000-4000-a000-' + String(i).padStart(12, '0')), hunt, at: 1799999999999, reason: 'supplies_out_gold', forfeit: true, tier: 'dangerous',
    by: 'A Hero With A Forty Letter Name Is Here!'.slice(0, 40), why: 'supplies_out_gold', ms: 86400000, kills: 99999, xp: big, gold: big, lootValue: big,
    balance: big, died: 9, balanceH: big, rawXpH: big,
    loot: items.slice(0, 6).map((id) => [id, 100000]), supplies: items.slice(6, 14).map((id) => [id, 'store', big]),
    preset: 99, hoursLimit: 24, bag: items.slice(14, 30).map((id) => [id, 100000, 1]),
    deaths: Array.from({ length: deaths }, () => line(len)), loss: line(len),
  });
  const widgets = HUD_WIDGETS.map(idOf);
  const classes = ['desktop', 'phone'];
  const most = {
    hudLayout: Object.fromEntries(classes.map((c) => [c, Object.fromEntries(widgets.map((id) => [id,
      { anchor: 'tl', dx: -4096, dy: -4096, opacity: 0.4123456789012345, visible: false, folded: false }]))])),
    combatText: Object.fromEntries(FLOAT_TYPES.map(idOf).map((id) => [id, { regular: false, boss: false }])),
    combatLog: { off: LOG_TYPES.map(idOf), scope: 'party' },
    bagSeen: seen(R.BAG_SEEN_MAX),
    bagView: { cat: 'consumables_and_food', sort: 'newest', advanced: true },
    storeView: { cat: 'consumables_and_food', sort: 'newest' },
    storeSeen: seen(R.STORE_SEEN_MAX),
    alerts: { off: Array.from({ length: 16 }, (_, i) => ('kind' + i).padEnd(32, 'a')),
      seen: Array.from({ length: R.ALERTS_SEEN_MAX }, (_, i) => 'abcdefgh:' + String(i).padEnd(120, 'Z')) },
    huntSummaries: Array.from({ length: 8 }, (_, i) => card(i, 6, 280)),
    awaySeen: { s: 'S'.repeat(64), at: Number.MAX_SAFE_INTEGER, xp: Number.MAX_SAFE_INTEGER, gold: Number.MAX_SAFE_INTEGER, kills: Number.MAX_SAFE_INTEGER, sx: Number.MAX_SAFE_INTEGER, n: Number.MAX_SAFE_INTEGER },
    winSize: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [('w' + i).padEnd(32, 'a'), [4096, 4096]])),
    panelAlpha: 100,
    coach: { min: true, seen: 's'.repeat(256), read: Array.from({ length: R.COACH_READ_MAX }, (_, i) => ('c' + i).padEnd(64, 'a')), back: 'B'.repeat(64) },
    marketView: { cat: 'consumables_and_food', sort: 'newest', deliver: 'storage', source: 'storage' },
    marketSeen: Number.MAX_SAFE_INTEGER,
    townZoom: { z: TOWN_ZOOM.steps[TOWN_ZOOM.steps.length - 1], at: Number.MAX_SAFE_INTEGER },
    shareReplay: { on: false, at: Number.MAX_SAFE_INTEGER },
    idleMotion: { on: false, at: Number.MAX_SAFE_INTEGER },
  };
  const full = Object.assign({}, most, { huntSummaries: Array.from({ length: 8 }, (_, i) => card(i, 1, 160)) });
  return { R, most, full };
}

/** RA-0, no database. */
export async function clientRules() {
  const fails = [];
  const no = (m) => fails.push(m);
  const { R, most, full } = await honest();
  const fields = R.RESIDUE_FIELDS, cap = R.RESIDUE_BYTES || {}, total = R.RESIDUE_TOTAL_BYTES;
  for (const f of fields) if (!Number.isInteger(cap[f])) no(`RA-0: ${f} has no bound in RESIDUE_BYTES (the server would refuse it unknown_field)`);
  for (const f of Object.keys(cap)) if (!fields.includes(f)) no(`RA-0: RESIDUE_BYTES bounds ${f}, which is not a residue field`);
  for (const f of Object.keys(most)) if (!fields.includes(f)) no(`RA-0: HARNESS: this guard builds ${f}, which is not a residue field`);
  let sumFull = 0, sumCaps = 0;
  for (const f of fields) {
    if (!(f in most)) { no(`RA-0: ${f} is a residue field this guard builds no largest value for: add one, with its bound`); continue; }
    const kept = R.sanitizeResidueField(f, most[f]);
    if (JSON.stringify(kept) !== JSON.stringify(most[f])) no(`RA-0: HARNESS: the largest ${f} this guard builds is trimmed by its own sanitizer (it is not a value a client holds)`);
    const b = bytes(kept);
    if (b > cap[f]) no(`RA-0: the largest honest ${f} is ${b} bytes, over its bound ${cap[f]}: the server would refuse a value the client holds`);
    sumFull += bytes(R.sanitizeResidueField(f, full[f])) + f.length + 4;
    sumCaps += cap[f] || 0;
  }
  if (!Number.isInteger(total)) no('RA-0: RESIDUE_TOTAL_BYTES is not a whole number');
  if (sumFull > total) no(`RA-0: a full late-game bag is ${sumFull} bytes, over the total ${total}`);
  if (total >= sumCaps) no(`RA-0: the total ${total} is not under the sum of the bounds ${sumCaps}: it bounds nothing`);
  return { fails, sizes: fields.map((f) => [f, f in most ? bytes(R.sanitizeResidueField(f, most[f])) : null, cap[f]]), sumFull, sumCaps, total };
}

/* As `authenticated`, each call its OWN transaction. */
async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}
const rows = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
let seq = 0;
const idem = () => '000000c0-0000-4000-a000-9' + String(++seq).padStart(11, '0');

async function person(db, i) {
  const uid = U(i);
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Residue Probe ' + i]);
  await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'residue-allowlist test') on conflict (user_id) do nothing", [uid]);
  const c = await as(db, uid, 'select public.hr_create_character(0)');
  if (!c || c.ok !== true) throw new Error('HARNESS: hr_create_character refused: ' + JSON.stringify(c));
  return uid;
}
const stored = (db, uid) => one(db, 'select client_state::text from public.player_state where user_id = $1 and slot = 0', [uid]);
const journal = (db, uid) => rows(db, 'select code, slot, n::int as n, verbs, severity from public.hr_rejections where user_id = $1 order by code', [uid]);

export async function rules(db) {
  const fails = [];
  const no = (m) => fails.push(m);
  const { R, most } = await honest();
  /* every put through the gated RPC a client calls; its own rate bucket cleared so the limit is not what is measured */
  const put = async (uid, patch, key) => {
    await db.query("delete from public.hr_rate_counters where user_id = $1", [uid]);
    return as(db, uid, 'select public.hr_put_client_state(0, $1::jsonb, $2::uuid)', [JSON.stringify(patch), key || idem()]);
  };

  // RA-1 ─ one list
  const list = Object.fromEntries((await rows(db, 'select field, max_bytes from public.hr_residue_fields')).map((r) => [r.field, r.max_bytes]));
  if (JSON.stringify(Object.keys(list).sort()) !== JSON.stringify(R.RESIDUE_FIELDS.slice().sort())) no('RA-1: the server lists ' + Object.keys(list).sort() + ', the client ' + R.RESIDUE_FIELDS.slice().sort());
  for (const f of R.RESIDUE_FIELDS) if (list[f] !== R.RESIDUE_BYTES[f]) no(`RA-1: ${f} is bounded ${list[f]} on the server and ${R.RESIDUE_BYTES[f]} in the client`);
  const total = await one(db, 'select public.hr_residue_total_bytes()');
  if (total !== R.RESIDUE_TOTAL_BYTES) no(`RA-1: the total is ${total} on the server and ${R.RESIDUE_TOTAL_BYTES} in the client`);

  // RA-2 ─ every honest field, at its largest, is stored as sent (each on a fresh hero, so the total is not what is measured)
  const a = await person(db, 1);
  for (const f of R.RESIDUE_FIELDS) {
    await db.query("update public.player_state set client_state = '{}'::jsonb where user_id = $1 and slot = 0", [a]);
    const v = await put(a, { [f]: most[f] });
    const back = JSON.parse(await stored(db, a))[f];
    if (!v || v.ok !== true) no(`RA-2: the largest honest ${f} (${bytes(most[f])} bytes) answered ${JSON.stringify(v)}`);
    else if (canon(R.sanitizeResidueField(f, back)) !== canon(most[f])) no(`RA-2: ${f} was not stored as sent`);
  }
  if ((await journal(db, a)).length) no('RA-2: an accepted put was journalled: ' + JSON.stringify(await journal(db, a)));

  // RA-3 ─ a key no list names refuses the whole patch
  const b = await person(db, 2);
  let v = await put(b, { panelAlpha: 80, townZoom: most.townZoom });
  if (!v || v.ok !== true || JSON.stringify(Object.keys(v).sort()) !== '["bytes","ok","slot"]') no('RA-3: HARNESS: an honest put answered ' + JSON.stringify(v));
  const before = await stored(db, b);
  const forged = ['gold', 'gems', 'hearth_tokens', 'hearthTokens', 'skills', 'inventory', 'bank', 'equipment', 'rooms', 'marks', 'restedXp', 'rested_xp',
    'farmPlots', 'farm', 'companions', 'offlineBudget',                                                   // the old authority deny list
    'buffs', 'streak', 'autoEatPct', 'foodSlot', 'combatStyle', 'toolCarry', 'renownHigh', 'heroSlotsUnlocked', 'ownedThemes', 'ownedCosmetics',   // the old retired list
    'junk', 'hudlayout', 'HUDLAYOUT', 'hudLayout ', '__proto__', ''];
  for (const k of forged) {
    v = await put(b, { panelAlpha: 55, [k]: k === 'junk' ? 'x'.repeat(250 * 1024) : 1 });
    const want = k === 'junk' ? 'patch_too_large' : 'unknown_field';   // 250 KiB is over the total before a key is read
    if (!v || v.ok !== false || v.error !== want || (want === 'unknown_field' && v.field !== k) || 'stripped' in v) no(`RA-3: a put naming ${JSON.stringify(k)} answered ${JSON.stringify(v).slice(0, 160)}`);
    if (await stored(db, b) !== before) { no(`RA-3: a refused put naming ${JSON.stringify(k)} changed the stored bag`); break; }
  }
  v = await put(b, { junk: 'x'.repeat(2000) });
  if (!v || v.error !== 'unknown_field' || v.field !== 'junk') no('RA-3: a small junk key answered ' + JSON.stringify(v));
  let j = await journal(db, b);
  const uf = j.find((r) => r.code === 'unknown_field');
  if (!uf || uf.n !== forged.length || uf.slot !== 0 || !uf.verbs || uf.verbs.hr_put_client_state !== forged.length || uf.severity !== 'normal') no('RA-3: the refusals are not one journal row naming the put: ' + JSON.stringify(j));
  if (j.some((r) => r.code === 'forbidden_field' || r.code === 'retired_field')) no('RA-3: an old list still answers: ' + JSON.stringify(j));

  // RA-4 ─ over a bound, over the total
  const c = await person(db, 3);
  for (const f of R.RESIDUE_FIELDS) {
    v = await put(c, { [f]: 'x'.repeat(list[f]) });              // its JSON text is the bound + 2
    if (!v || v.ok !== false || v.error !== 'field_too_large' || v.field !== f || v.cap !== list[f]) no(`RA-4: a ${f} two bytes over its bound answered ${JSON.stringify(v)}`);
  }
  if (await stored(db, c) !== '{}') no('RA-4: a field over its bound was stored: ' + String(await stored(db, c)).slice(0, 80));
  let sum = 0, hit = null;
  for (const f of Object.keys(list).sort((x, y) => list[y] - list[x])) {
    const was = await stored(db, c);
    v = await put(c, { [f]: 'y'.repeat(list[f] - 2) });          // exactly at its bound
    if (v && v.ok === true) { sum = v.bytes; if (v.bytes > total) no(`RA-4: a bag of ${v.bytes} bytes was stored over the total`); continue; }
    if (v && v.error === 'state_too_large' && v.cap === total) { hit = f; if (await stored(db, c) !== was) no('RA-4: a put refused state_too_large changed the stored bag'); break; }
    no(`RA-4: filling the bag with ${f} answered ${JSON.stringify(v)}`); break;
  }
  if (!hit) no('RA-4: every field at its bound fits the total (' + sum + ' bytes stored): the total bounds nothing');
  if ((await one(db, 'select max(octet_length(client_state::text)) from public.player_state')) > total) no('RA-4: a stored bag is over the total');

  // RA-5 ─ a bag stored under the old rule
  const d = await person(db, 4);
  const old = { panelAlpha: 70, oldJunk: 'z'.repeat(5000), gold: 123, coach: { min: true } };
  await db.query('update public.player_state set client_state = $2::jsonb where user_id = $1 and slot = 0', [d, JSON.stringify(old)]);
  const oldText = await stored(db, d);
  v = await put(d, { nope: 1 });
  if (!v || v.error !== 'unknown_field' || await stored(db, d) !== oldText) no('RA-5: a refused put touched a bag stored under the old rule');
  v = await put(d, { panelAlpha: 90 });
  const tidy = JSON.parse(await stored(db, d));
  if (!v || v.ok !== true || JSON.stringify(Object.keys(tidy).sort()) !== '["coach","panelAlpha"]' || tidy.panelAlpha !== 90 || !tidy.coach || tidy.coach.min !== true) no('RA-5: after an accepted put the old bag is ' + JSON.stringify(tidy).slice(0, 120));

  // RA-6 ─ one key, one effect
  const key = idem();
  v = await put(d, { panelAlpha: 40 }, key);
  const once = await stored(db, d);
  const again = await put(d, { panelAlpha: 10 }, key);
  if (!v || v.ok !== true || !again || again.ok !== true || again.replayed !== true || await stored(db, d) !== once) no('RA-6: a replayed key answered ' + JSON.stringify(again) + ' or wrote the bag again');
  await db.query("update public.player_intents set intent = 'another_verb' where user_id = $1 and intent_id = $2::uuid", [d, key]);
  v = await put(d, { panelAlpha: 20 }, key);
  if (!v || v.error !== 'intent_mismatch' || await stored(db, d) !== once) no('RA-6: a key held by another verb answered ' + JSON.stringify(v));

  // RA-7 ─ the doors
  const priv = await rows(db, `select r, has_function_privilege(r, 'public.hr_put_client_state__ungated(integer,jsonb,uuid)', 'execute') as ungated,
                                      has_function_privilege(r, 'public.hr_put_client_state(integer,jsonb,uuid)', 'execute') as gated,
                                      has_function_privilege(r, 'public.hr_residue_total_bytes()', 'execute') as total,
                                      has_table_privilege(r, 'public.hr_residue_fields', 'select,insert,update,delete,truncate') as list
                                 from unnest(array['anon', 'authenticated', 'service_role', 'hr_engine']) r`);
  for (const p of priv) {
    if (p.ungated || p.total || p.list) no(`RA-7: ${p.r} reaches the ungated put, the total or the list`);
    if (p.gated !== (p.r === 'authenticated')) no(`RA-7: ${p.r} ${p.gated ? 'can' : 'cannot'} ask the gated put`);
  }
  const body = await one(db, "select prosrc from pg_proc where oid = 'public.hr_put_client_state__ungated(integer,jsonb,uuid)'::regprocedure");
  if (/v_deny|v_retired/.test(body) || !/hr_residue_fields/.test(body)) no('RA-7: the put the chain ends with reads a deny list again, or not the allowlist');
  return fails;
}

/* ── THE MUTANTS: each plants one defect; the replay (a self-check) or a rule must refuse it FOR ITS REASON. ── */
export const MUTANTS = [
  { name: 'a key no list names is stored', file: 'supabase/migrations/' + FILE,
    from: "    if not found then\n      return jsonb_build_object('ok', false, 'error', 'unknown_field', 'field', left(v_key, 64)); end if;",
    to: '    if not found then continue; end if;',
    expect: '§2(c): a put naming "junk" answered' },
  { name: 'a field is not held to its own bound', file: 'supabase/migrations/' + FILE,
    from: '    if octet_length((p_patch -> v_key)::text) > v_max then', to: '    if false then',
    expect: '§2(d): a ' },
  { name: 'the merged bag is not held to the total', file: 'supabase/migrations/' + FILE,
    from: "  if octet_length(v_new::text) > v_cap then\n    return jsonb_build_object('ok', false, 'error', 'state_too_large', 'cap', v_cap); end if;", to: '',
    expect: '§2(d): a bag of' },
  { name: 'a key stored under the old rule is carried forward', file: 'supabase/migrations/' + FILE,
    from: '   where exists (select 1 from public.hr_residue_fields f where f.field = e.key);', to: '   where true;',
    expect: '§2(e): after an accepted put the old bag is' },
  { name: 'the row is written before the bag is judged', file: 'supabase/migrations/' + FILE,
    from: "  v_new := v_new || p_patch;\n  if octet_length(v_new::text) > v_cap then",
    to: "  v_new := v_new || p_patch;\n  update public.player_state set updated_at = now() where user_id = v_uid and slot = v_slot;\n  if octet_length(v_new::text) > v_cap then",
    expect: '§2(d): a put refused state_too_large wrote the hero\'s row' },
  { name: 'the ungated body is left open to clients', file: 'supabase/migrations/' + FILE,
    from: 'revoke all on function public.hr_put_client_state__ungated(integer, jsonb, uuid) from public, anon, authenticated, service_role;',
    to: 'grant execute on function public.hr_put_client_state__ungated(integer, jsonb, uuid) to authenticated;',
    expect: '§2(a): authenticated can execute the ungated put' },
  { name: 'the list is left readable by clients', file: 'supabase/migrations/' + LIST,
    from: 'revoke all on public.hr_residue_fields from public, anon, authenticated, service_role;', to: 'revoke all on public.hr_residue_fields from public, anon;',
    expect: 'holds a privilege on hr_residue_fields' },
  { name: 'a field the client does not list is on the server\'s list', file: 'supabase/migrations/' + LIST,
    from: "  ('alerts', ", to: "  ('gold', 64),\n  ('alerts', ",
    expect: 'residue-fields: the rows are not the generated list' },
];

async function main() {
  process.on('beforeExit', () => { console.log('  ✗ residue-allowlist stopped before its verdict (a query never settled)'); process.exit(1); });
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  if (process.argv.includes('--sizes')) {
    const c = await clientRules();
    for (const [f, b, cap] of c.sizes) console.log('  ' + f.padEnd(14) + String(b).padStart(7) + ' of ' + String(cap).padStart(6));
    console.log('  a full late-game bag ' + c.sumFull + ' of ' + c.total + '; the bounds sum to ' + c.sumCaps);
    for (const f of c.fails) console.log('  ✗ ' + f);
    process.exit(c.fails.length ? 1 : 0);
  }
  /* ONE MUTANT, IN ITS OWN PROCESS: exit 0 caught, 10 escaped, 20 a harness fault, 30 the wrong reason */
  if (process.argv.includes('--mutant')) {
    const mu = MUTANTS[Number(process.argv[process.argv.indexOf('--mutant') + 1])];
    const mig = mu.file.split('/').pop();
    let fails;
    try { fails = await rules((await bootReplay({ patches: new Map([[mig, [[mu.from, mu.to]]]]), upTo: FILE })).db); }
    catch (e) {
      if (e && e.harness) { console.log('harness: ' + String(e.message).split('\n')[0]); process.exit(20); }
      fails = ['replay refused it: ' + String(e.message).split('\n')[1]];
    }
    if (!fails.length) { console.log('NOT caught: ' + mu.name); process.exit(10); }
    if (!fails.some((f) => f.includes(mu.expect))) { console.log('refused for ANOTHER reason (wanted "' + mu.expect + '"): ' + fails[0].slice(0, 200)); process.exit(30); }
    console.log(fails.find((f) => f.includes(mu.expect)).slice(0, 150));
    process.exit(0);
  }
  const client = await clientRules();
  if (process.argv.includes('--mutate')) {
    const clean = [...client.fails, ...await rules((await bootReplay({ upTo: FILE })).db)];
    if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
    console.log('  ✓ clean control green');
    let bad = 0, ran = 0;
    for (const [i, mu] of MUTANTS.entries()) {
      if (only && !mu.name.includes(only)) continue;
      ran++;
      const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'residue-allowlist.mjs'), '--mutant', String(i)], { encoding: 'utf8', timeout: 900000 });
      const said = String(r.stdout || '').trim().split('\n').pop() || String(r.stderr || '').trim().split('\n').pop() || '';
      if (r.status === 0) console.log('  ✓ ' + mu.name + ' — caught (' + said + ')');
      else { console.log('  ✗ ' + mu.name + ' — ' + (r.status === 10 ? 'NOT caught' : r.status === 30 ? said : 'harness (exit ' + r.status + '): ' + said)); bad++; }
    }
    console.log(bad || !ran ? 'residue-allowlist --mutate: ' + bad + ' escaped of ' + ran : 'residue-allowlist --mutate: ' + ran + '/' + ran + ' mutants caught');
    if (!ran) bad = 1;
    process.exit(bad ? 1 : 0);
  }
  const { db } = await bootReplay();
  const fails = [...client.fails, ...await rules(db)];
  const g = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen-residue-fields.mjs'), '--check'], { encoding: 'utf8' });
  if (g.status !== 0) fails.push('RA-1: ' + String(g.stderr || g.stdout || '').trim().split('\n')[0]);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'residue-allowlist: ' + fails.length + ' rule(s) RED'
    : 'residue-allowlist: the server\'s list is the client\'s; every honest field is stored; a key no list names, a field over its bound and a bag over the total are refused whole and journalled with nothing written; an old bag is tidied only by an accepted put');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
