#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/envelope-contract.mjs — THE SERVER'S ENVELOPE IS WHAT THE CLIENT READS.
//
//   node tests/envelope-contract.mjs            the guard
//   node tests/envelope-contract.mjs --mutate   every renamed server field must be CAUGHT
//
// Two server-vs-client shape mismatches shipped in a row (the `party` section
// projected `seats` while the party panel read `members`; the `hunt` section
// projected the raw world while huntOf read `session_id` / `hero` / decoded
// units). Each reader degrades a missing field to null ("show nothing"), so a
// mismatch never throws: the screen just says "Not in a hunt." This guard is
// the class kill. On the REAL replayed chain (PGlite) it:
//   1. puts a premium two-hero party on a hunt and settles it through the
//      PLAYER DOOR (hunt-settle.js settleHunt, project: true) — the exact body
//      a client receives, timeline keys included;
//   2. hands that body to the REAL src/session/character-session.js
//      (applyEnvelope + the timeline ingest + the pose reconcile);
//   3. runs EVERY client section reader over it and requires each field the
//      widgets draw to be present (not null), per section (CONTRACT below);
//   4. greps src/** for every section key a reader reads (`read('k')`,
//      `read(cs, 'k')`, `section(cs, 'k')`) and requires each to be either in
//      CONTRACT or in PENDING (a client read the server does not project yet,
//      with its owner) — a new reader key with no contract fails here, and a
//      PENDING key the server starts projecting must move to CONTRACT.
// --mutate renames one field in each server producer (the live function body,
// rolled back; the settle response in a temp copy of the edge) and requires
// the section that reads it to go red.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate');
const FN = join('supabase', 'functions', 'hr-accrue');

/* Client reads the server does not project yet (next server lane, CONFLICTS.md 2026-10-18 party UI
   + alpha windows). Each must be ABSENT from the real envelope; when the server adds one, it moves
   to CONTRACT in the same commit. */
export const PENDING = Object.freeze({
  name: 'per-character names (nameOf falls back to hunt.hero.name, which IS contracted)',
  bag_rules: 'alpha bag window: locks, loot filter, restock targets',
  shop: 'alpha shop window: offers, bids, refill quote',
  hunt_presets: 'alpha hunt presets (gear + restock per preset)',
  role: 'the worn weapon\'s role as a section (roleIdOf falls back to the party seat, which IS contracted)',
  party_invites: 'party invites (hr_hunt_party_invite, next server lane)',
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const missing = (obj, keys) => keys.filter((k) => obj == null || obj[k] === null || obj[k] === undefined);

/* What each reader must yield on a premium party hunt that has settled six minutes.
   Each entry: the envelope key(s) it covers, and a check over the readers' output. */
function contract(R, cs, body, tl) {
  const out = [];
  const need = (sec, cond, msg) => { if (!cond) out.push({ sec, msg }); };
  // hunt
  const h = R.HS.huntOf(cs);
  need('hunt', !!h, 'huntOf reads no hunt (the screen says "Not in a hunt."): ' + JSON.stringify(body.hunt).slice(0, 240));
  if (h) {
    const m = missing(h, ['sessionId', 'huntId']).concat(missing(h.hero, ['unit', 'name', 'level', 'hp', 'hpMax', 'mana', 'manaMax', 'hpRegen', 'manaRegen', 'xpPct', 'falls']).map((k) => 'hero.' + k));
    need('hunt', !m.length, 'huntOf misses ' + m.join(', '));
    const units = Array.from(h.units.values());
    need('hunt', units.some((u) => u.side === 'hero') && units.every((u) => u.side === 'hero' || u.kind), 'the pose has no hero, or a monster with no kind: ' + JSON.stringify(units.slice(0, 4)));
    need('hunt', h.units.has(h.hero.unit), 'the viewed hero ' + h.hero.unit + ' is not a pose unit');
    need('hunt', units.every((u) => isNum(u.hp) && isNum(u.hpMax)), 'a pose unit has no hp / hp_max');
    const loot = R.IS.huntLootOf(cs);
    need('hunt', Array.isArray(loot), 'huntLootOf reads no hunt.loot');
    need('hunt', R.IS.nameOf(cs) !== null, 'nameOf has no name (hunt.hero.name)');
  }
  // the pose reconciles the timeline (character-session _play)
  const pose = body.hunt && body.hunt.pose;
  need('hunt', !!pose && Number.isSafeInteger(pose.at_ms) && Array.isArray(pose.units) && pose.units.every((u) => [u.u, u.x, u.y].every(Number.isSafeInteger)),
    'hunt.pose is not {at_ms, units[{u, x, y}]}: ' + JSON.stringify(pose).slice(0, 200));
  // the settle response's timeline
  need('hunt_track', Array.isArray(body.hunt_track) && body.hunt_track.length > 0 && tl.units().length > 0,
    'the timeline holds no steps from hunt_track: ' + JSON.stringify(body.hunt_track && body.hunt_track.slice(0, 2)));
  need('hunt_events', Array.isArray(body.hunt_events) && body.hunt_events.length > 0 && body.hunt_events.every((e) => typeof e.id === 'string' && Number.isSafeInteger(e.atMs)),
    'hunt_events is not [{id, type, atMs}]');
  /* The decision events the hunt summary reads (lane action-engine): a rule id on the events a slot decided, and
     every rule_wait as { u, t, rule, why }. */
  const evs = Array.isArray(body.hunt_events) ? body.hunt_events : [];
  need('hunt_events', evs.some((e) => ['cast', 'eat', 'drink', 'shot'].includes(e.type) && typeof e.rule === 'string' && e.rule.length > 0)
    && evs.filter((e) => e.type === 'rule_wait').every((e) => [e.u, e.t].every(Number.isInteger) && typeof e.rule === 'string' && typeof e.why === 'string'),
    'hunt_events carry no slot decision with a rule id, or a rule_wait is malformed: ' + JSON.stringify(evs.filter((e) => e.type === 'cast' || e.type === 'rule_wait').slice(0, 3)));
  need('hunt_server_now_ms', Number.isSafeInteger(body.hunt_server_now_ms) && body.hunt_server_now_ms > 0, 'hunt_server_now_ms is ' + body.hunt_server_now_ms);
  // hunt_settings
  const s = R.HS.settingsOf(cs);
  need('hunt_settings', !!s, 'settingsOf reads nothing: ' + JSON.stringify(body.hunt_settings).slice(0, 240));
  if (s) {
    const m = missing(s, ['preset', 'targetMode', 'stance', 'distance', 'chase', 'foodPct', 'drinkPct', 'supplySource', 'onEmpty', 'density', 'gatherShare']);
    need('hunt_settings', !m.length && Array.isArray(s.slots) && s.slots.length > 0 && s.presets.length > 0, 'settingsOf misses ' + m.join(', ') + (s.slots.length ? '' : ' slots') + (s.presets.length ? '' : ' presets'));
    /* The action engine (2026-10-25): every slot in the wire shape, the stored density pick read back, the gathering share marked inert. */
    need('hunt_settings', s.slots.every((x) => x.empty || (x.action && Array.isArray(x.conditions) && (x.join === 'and' || x.join === 'or')))
      && s.slots.some((x) => !x.empty && x.action.type === 'consume') && s.density === 2 && s.gatherInert === true && s.stopRules.length === 1,
      'settingsOf slots / density / gather / stop rules: ' + JSON.stringify({ density: s.density, inert: s.gatherInert, stops: s.stopRules, slots: s.slots.slice(0, 3) }).slice(0, 300));
  }
  // hunt_analyzer
  const a = R.HS.analyzerOf(cs);
  need('hunt_analyzer', !!a, 'analyzerOf reads nothing for a premium hunter: ' + JSON.stringify(body.hunt_analyzer).slice(0, 240));
  if (a) {
    const m = missing(a, ['sessionMs']).concat(missing(a.hero, ['kills', 'xp', 'gold', 'balance']).map((k) => 'hero.' + k))
      .concat(missing(a.hero && a.hero.perHour, ['xp', 'gold', 'balance']).map((k) => 'hero.per_hour.' + k));
    need('hunt_analyzer', !m.length && a.hero.kills > 0 && !!a.party, 'analyzerOf misses ' + m.join(', ') + (a.party ? '' : ' party') + ' (kills ' + (a.hero && a.hero.kills) + ')');
    need('hunt_analyzer', Object.keys(a.hero.dealtByAbility).length > 0, 'analyzer dealt.by_ability is empty');
  }
  // party (the hunt panel's and the party window's readers, one shape)
  const p = R.HS.partyOf(cs);
  need('party', !!p && p.members.length === 2, 'partyOf yields ' + (p ? p.members.length : 'no') + ' members: ' + JSON.stringify(body.party).slice(0, 240));
  if (p) {
    const m = p.members.flatMap((x) => missing(x, ['unit', 'name', 'level', 'hp', 'hpMax', 'mana', 'manaMax', 'dealt', 'healed', 'dps', 'hps', 'role']).map((k) => x.unit + '.' + k));
    need('party', !m.length && p.self !== null && p.leader !== null, 'partyOf misses ' + m.join(', ') + ' self ' + p.self + ' leader ' + p.leader);
  }
  const pm = R.PS.partyMembershipOf(cs);
  need('party', !!pm && pm.seats.length === 2 && pm.me !== null && pm.leader !== null && pm.isLeader,
    'partyMembershipOf yields ' + JSON.stringify(pm && { seats: pm.seats.length, me: pm.me, leader: pm.leader }));
  // stamina + premium + account
  const st = R.HS.staminaOf(cs);
  need('stamina', !!st && isNum(st.msLeft) && isNum(st.capMs), 'staminaOf yields ' + JSON.stringify(st) + ' from ' + JSON.stringify(body.stamina));
  need('premium', R.HS.isPremium(cs) === true, 'isPremium is false for a premium character: ' + JSON.stringify(body.premium));
  need('account', R.ACC.accountLimitOf((k) => cs.read(k)) === R.CFG.SESSION_CONFIG.maxConcurrentCharacters,
    'account.max_concurrent reads ' + R.ACC.accountLimitOf((k) => cs.read(k)) + ' from ' + JSON.stringify(body.account));
  // the alpha windows' sections the server projects
  const bag = R.IS.bagOf(cs);
  need('inventory', Array.isArray(bag), 'bagOf reads no inventory');
  need('equipment', R.IS.equipmentOf(cs) !== null, 'equipmentOf reads no equipment');
  const sk = R.IS.skillsOf(cs);
  need('skills', !!sk && Object.keys(sk).length >= 4 && !!sk.hitpoints, 'skillsOf yields ' + JSON.stringify(sk).slice(0, 160) + ' from ' + JSON.stringify(body.skills).slice(0, 160));
  need('state', R.IS.goldOf(cs) !== null, 'goldOf reads no state.gold');
  const v = R.PS.vitalsOf(cs);
  need('state', !missing(v, ['hp', 'hpMax', 'mana', 'manaMax', 'staminaMs', 'staminaCapMs']).length, 'vitalsOf misses ' + missing(v, ['hp', 'hpMax', 'mana', 'manaMax', 'staminaMs', 'staminaCapMs']).join(', '));
  need('state', R.PS.assignmentOf(cs).kind === 'hunting', 'assignmentOf reads ' + JSON.stringify(R.PS.assignmentOf(cs)));
  need('bank', body.bank !== undefined && (body.bank === null || typeof body.bank === 'object'), 'bank is ' + typeof body.bank);
  need('hero_slots', Array.isArray(body.hero_slots), 'hero_slots is not an array');
  return out;
}
/* The envelope keys CONTRACT covers (with the settle-response keys). */
export const CONTRACT_KEYS = Object.freeze(['hunt', 'hunt_track', 'hunt_events', 'hunt_server_now_ms', 'hunt_settings', 'hunt_analyzer',
  'party', 'stamina', 'premium', 'account', 'inventory', 'equipment', 'skills', 'state', 'bank', 'hero_slots']);

/* Every section key a client reader reads, from the source. */
export function clientReadKeys(root) {
  const keys = new Set();
  const re = /\b(?:read|section)\(\s*(?:cs\s*,\s*)?'([a-z_]+)'\s*\)/g;
  const walk = (d) => {
    for (const n of readdirSync(join(root, d))) {
      const p = d + '/' + n;
      if (statSync(join(root, p)).isDirectory()) { if (!['core', 'data'].includes(n)) walk(p); continue; }
      if (!p.endsWith('.js')) continue;
      const s = readFileSync(join(root, p), 'utf8');
      let m;
      while ((m = re.exec(s)) !== null) keys.add(m[1]);
    }
  };
  walk('src');
  return keys;
}

async function readers(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return {
    HS: await import(u('src/session/hunt-sections.js')), IS: await import(u('src/session/item-sections.js')),
    PS: await import(u('src/session/party-sections.js')), ACC: await import(u('src/session/account-session.js')),
    CFG: await import(u('src/session/config.js')), CSN: await import(u('src/session/character-session.js')),
    M: await import(u('src/data/monsters.js')),
  };
}

/* The real body: a premium two-hero party, six minutes settled, then ONE player-door settle. */
async function realBody(db, M, H) {
  const P = { ...H.STRONG, premium: true, options: { food_below_pct: 40, density: 2, gather_share: 10,
    stop_rules: [{ conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 1 }], join: 'and', forMs: 60000 }] } };
  const h = await H.hunter(db, M, { party: [{ ...P }, { ...P }] });
  /* Monsters are units only mid-pull: sample the pose after every tick so the monster path is proven. */
  const poses = [];
  for (const t of H.ticksOf(30000, 6 * 60000)(h.from)) {
    await H.settleTo(db, M, t);
    poses.push(await H.one(db, 'select public.hr_hunt_section_view($1::uuid, 0)', [H.UIDS[0]]));
  }
  const exec = H.makeExec(db);
  const at = h.from + 6 * 60000 + 60000;
  const v = await M.HS.settleHunt({ exec, user: H.UIDS[0], slot: 0, mode: 'settle', bucket: null, project: true,
    grounds: H.groundsOf(M), atMs: at, minWindowMs: 0 });
  return { v, h, poses };
}

async function check(db, M, H, R) {
  const problems = [];
  await H.inTx(db, async () => {
    const { v, poses } = await realBody(db, M, H);
    if (!v || v.status !== 200 || !v.body || v.body.ok !== true || v.body.settled !== true) {
      problems.push({ sec: 'CONTROL', msg: 'the player-door settle answered ' + JSON.stringify(v && { status: v.status, reason: v.reason, body: v.body && { ok: v.body.ok, settled: v.body.settled, error: v.body.error } }) });
      return;
    }
    const body = v.body;
    const cs = new R.CSN.CharacterSession({ slot: 0, uid: H.UIDS[0], server: {}, now: () => 1e6 });
    if (!cs._take(body, 'settle')) { problems.push({ sec: 'CONTROL', msg: 'the client refused the envelope: ' + cs.lastVerdict }); return; }
    problems.push(...contract(R, cs, body, cs.timeline));
    /* Across the run, some pose holds a monster, named by kind, read by huntOf as a monster. */
    const mons = poses.flatMap((hs) => { const u = R.HS.huntOf({ read: (k) => (k === 'hunt' ? hs : undefined) }); return u ? Array.from(u.units.values()).filter((x) => x.side === 'monster') : []; });
    if (!mons.length || !mons.every((x) => x.kind && R.M.MONSTERS[x.kind])) problems.push({ sec: 'hunt', msg: 'no pose over six minutes shows a monster huntOf can name: ' + JSON.stringify(mons.slice(0, 3)) });
    for (const k of Object.keys(PENDING)) if (body[k] !== undefined) problems.push({ sec: 'PENDING', msg: k + ' is now projected by the server: move it to CONTRACT' });
  });
  const reads = clientReadKeys(H.ROOT);
  for (const k of reads) if (!CONTRACT_KEYS.includes(k) && !Object.prototype.hasOwnProperty.call(PENDING, k)) {
    problems.push({ sec: 'COVERAGE', msg: 'a client reader reads `' + k + '`, which has no contract here and no PENDING owner' });
  }
  if (reads.size < 10) problems.push({ sec: 'COVERAGE', msg: 'only ' + reads.size + ' reader keys were found in src/ — the scan is blind' });
  return problems;
}

/* Each mutant renames ONE server field; the named section must go red. */
const DB_MUTANTS = [
  ['hunt', 'public.hr_hunt_section_view(uuid,integer)', "'session_id', s.id,", "'sessionid', s.id,"],
  ['hunt', 'public.hr_hunt_section_view(uuid,integer)', "'mana_regen', case", "'manaregen', case"],
  ['hunt', 'public.hr_hunt_section_view(uuid,integer)', "'hp_max', v_u->((v_uf->>'maxHp')::int))));", "'max_hp', v_u->((v_uf->>'maxHp')::int))));"],
  ['party', 'public.hr_hunt_party_view(uuid,integer)', "'hp_max', case when", "'max_hp', case when"],
  ['party', 'public.hr_hunt_party_view(uuid,integer)', "'self_seat', v_sseat,", "'me', v_sseat,"],
  ['stamina', 'public.hr_stamina_view(uuid,integer)', "'max_ms'", "'maxms'"],
  ['hunt_settings', 'public.hr_hunt_settings_view(uuid,integer)', "'food_pct', v_eff", "'foodpct', v_eff"],
  ['hunt_settings', 'public.hr_hunt_settings_view(uuid,integer)', "'slots', v_slots,", "'slot_list', v_slots,"],
  ['hunt_settings', 'public.hr_hunt_settings_view(uuid,integer)', "'density', v_eff->'density',", "'monster_density', v_eff->'density',"],
  ['hunt_settings', 'public.hr_hunt_settings_view(uuid,integer)', "'gather_share', v_eff->'gather_share',", "'gather', v_eff->'gather_share',"],
  ['hunt_analyzer', 'public.hr_hunt_analyzer_of(uuid,integer,uuid)', "'hunt_ms', floor(", "'huntms', floor("],
  ['hunt_analyzer', 'public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)', "'kills', v_kills", "'kill_count', v_kills"],
  ['premium', 'public.hr_premium_view(uuid,integer)', "'active'", "'is_active'"],
  ['account', 'public.hr_account_view(uuid,integer)', "'max_concurrent'", "'max'"],
];
const EDGE_MUTANTS = [
  ['hunt_track', join(FN, 'hunt-track.js'), '    hunt_track: pb.steps.map(', '    track: pb.steps.map('],
  ['hunt_server_now_ms', join(FN, 'hunt-track.js'), '    hunt_server_now_ms: Math.floor(', '    server_now_ms: Math.floor('],
];

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(1); }
  await H.pinDice(db);
  const R = await readers(H.ROOT);
  const M = await H.loadEdge(H.ROOT);
  if (!MUTATE) {
    const p = await check(db, M, H, R);
    for (const x of p) console.error('✗ ' + x.sec + ': ' + x.msg);
    if (p.length) { console.log('envelope-contract: ' + p.length + ' problem(s)'); process.exit(1); }
    console.log('envelope-contract: green — ' + CONTRACT_KEYS.length + ' keys read by the client from the real settle body ('
      + CONTRACT_KEYS.join(', ') + '); ' + Object.keys(PENDING).length + ' pending (' + Object.keys(PENDING).join(', ') + ')');
    process.exit(0);
  }
  let bad = 0;
  const control = await check(db, M, H, R);
  if (control.length) { console.error('✗ CONTROL red, no mutant proves anything: ' + control.map((x) => x.sec + ' ' + x.msg).join(' | ')); process.exit(1); }
  for (const [sec, fn, find, repl] of DB_MUTANTS) {
    const def = String(await H.one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
    if (!def.includes(find)) { console.error('✗ ' + sec + ' mutant anchor not in ' + fn + ': ' + find); bad++; continue; }
    await db.query('begin');
    try {
      await db.exec(def.replace(find, repl));
      await db.query('savepoint m');
      const p = await check(db, M, H, R);
      if (p.some((x) => x.sec === sec)) console.log('✓ ' + sec + ' goes red on: ' + fn + ' ' + find.trim() + ' -> ' + repl.trim());
      else { console.error('✗ ' + sec + ' MISSED: ' + fn + ' ' + find.trim() + ' -> ' + repl.trim() + (p.length ? ' (other reds: ' + p.map((x) => x.sec).join(',') + ')' : '')); bad++; }
    } finally { await db.query('rollback'); }
  }
  for (const [sec, file, find, repl] of EDGE_MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'hr-env-'));
    try {
      for (const d of ['src/core', 'src/data', FN]) cpSync(join(H.ROOT, d), join(dir, d), { recursive: true });
      cpSync(join(H.ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
      const p0 = join(dir, file);
      const src = readFileSync(p0, 'utf8').replace(/\r\n/g, '\n');
      if (!src.includes(find)) { console.error('✗ ' + sec + ' edge mutant anchor not in ' + file); bad++; continue; }
      writeFileSync(p0, src.replace(find, repl));
      const Mm = await H.loadEdge(dir);
      const p = await check(db, Mm, H, R);
      if (p.some((x) => x.sec === sec)) console.log('✓ ' + sec + ' goes red on: ' + file + ' ' + find.trim() + ' -> ' + repl.trim());
      else { console.error('✗ ' + sec + ' MISSED: ' + file + ' ' + find.trim()); bad++; }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  /* COVERAGE: a reader key with no contract is caught. */
  {
    const dir = mkdtempSync(join(tmpdir(), 'hr-env-src-'));
    try {
      cpSync(join(H.ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
      writeFileSync(join(dir, 'src', 'session', 'zz-planted.js'), "export const f = (cs) => cs.read('brand_new_section');\n");
      if (clientReadKeys(dir).has('brand_new_section')) console.log('✓ COVERAGE sees a planted reader key');
      else { console.error('✗ COVERAGE MISSED a planted reader key'); bad++; }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const total = DB_MUTANTS.length + EDGE_MUTANTS.length + 1;
  console.log(bad ? 'envelope-contract --mutate: ' + bad + ' of ' + total + ' MISSED' : 'envelope-contract --mutate: all ' + total + ' mutants killed');
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();
