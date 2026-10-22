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

/* Client reads the server does not project yet. Each must be ABSENT from the real envelope; when
   the server adds one, it moves to CONTRACT in the same commit. Lane S2 (2026-10-18) moved name,
   bag_rules, shop, hunt_presets, role and party_invites to CONTRACT. */
export const PENDING = Object.freeze({
  imbuements: 'per worn piece, its imbuement slots and what fills them (ruling D v2; the Inventory Advanced view, CONFLICTS.md 2026-10-18 playtest)',
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
    const m = missing(h, ['sessionId', 'huntId']).concat(missing(h.hero, ['unit', 'name', 'level', 'hp', 'hpMax', 'mana', 'manaMax', 'hpPerS', 'manaPerS', 'xpPct', 'regenPm']).map((k) => 'hero.' + k));
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
    const m = missing(s, ['preset', 'targetMode', 'stance', 'distance', 'chase', 'foodPct', 'drinkPct', 'supplySource', 'onEmpty', 'gatherShare']);
    need('hunt_settings', !m.length && Array.isArray(s.slots) && s.slots.length > 0 && s.presets.length > 0, 'settingsOf misses ' + m.join(', ') + (s.slots.length ? '' : ' slots') + (s.presets.length ? '' : ' presets'));
    /* The action engine (2026-10-25): every slot in the wire shape, the gathering share marked inert; density is no setting (hunt_density). */
    need('hunt_settings', s.slots.every((x) => x.empty || (x.action && Array.isArray(x.conditions) && (x.join === 'and' || x.join === 'or')))
      && s.slots.some((x) => !x.empty && x.action.type === 'consume') && !('density' in s) && !('density' in body.hunt_settings) && s.gatherInert === true && s.stopRules.length === 1,
      'settingsOf slots / density / gather / stop rules: ' + JSON.stringify({ density: s.density, inert: s.gatherInert, stops: s.stopRules, slots: s.slots.slice(0, 3) }).slice(0, 300));
  }
  // hunt_analyzer
  const a = R.HS.analyzerOf(cs);
  need('hunt_analyzer', !!a, 'analyzerOf reads nothing for a premium hunter: ' + JSON.stringify(body.hunt_analyzer).slice(0, 240));
  if (a) {
    const m = missing(a, ['sessionMs']).concat(missing(a.hero, ['kills', 'levelXp', 'gold', 'lootValue', 'balance']).map((k) => 'hero.' + k))
      .concat(missing(a.hero && a.hero.perHour, ['levelXp', 'trainingXp', 'goldAndLoot', 'balance']).map((k) => 'hero.per_hour.' + k));
    need('hunt_analyzer', !m.length && a.hero.kills > 0 && !!a.party, 'analyzerOf misses ' + m.join(', ') + (a.party ? '' : ' party') + ' (kills ' + (a.hero && a.hero.kills) + ')');
    need('hunt_analyzer', Object.keys(a.hero.dealtByAbility).length > 0, 'analyzer dealt.by_ability is empty');
  }
  // now (the bug report's envelope age, src/shell/report-model.js): the server's own instant
  need('now', Number.isFinite(Date.parse(String(cs.read('now')))), 'cs.read("now") is ' + JSON.stringify(cs.read('now')));
  // hunt_bests (the hunt picker's personal bests): the earlier finished solo hunt, solo only
  const hb = R.HS.huntBestsOf(cs);
  const mc = hb && hb.grounds.mill_cellar;
  need('hunt_bests', !!hb && hb.minMs === 600000 && !!mc && !!mc.solo && mc.solo.xpH === 2000 && mc.solo.balanceH === 200 && mc.party === null,
    'huntBestsOf yields ' + JSON.stringify(hb) + ' from ' + JSON.stringify(body.hunt_bests));
  // hunt_density (the hunt picker's pick per ground, 2026-11-17-hunt-density-home.sql): the hero's own 2 on its ground
  const dm = R.HS.huntDensityOf(cs);
  need('hunt_density', !!dm && dm.mill_cellar === 2, 'huntDensityOf yields ' + JSON.stringify(dm) + ' from ' + JSON.stringify(body.hunt_density));
  // party (the hunt panel's and the party window's readers, one shape)
  const p = R.HS.partyOf(cs);
  need('party', !!p && p.members.length === 2, 'partyOf yields ' + (p ? p.members.length : 'no') + ' members: ' + JSON.stringify(body.party).slice(0, 240));
  if (p) {
    const m = p.members.flatMap((x) => missing(x, ['unit', 'name', 'level', 'hp', 'hpMax', 'mana', 'manaMax', 'dealt', 'healed', 'dps', 'hps', 'role']).map((k) => x.unit + '.' + k));
    need('party', !m.length && p.self !== null && p.leader !== null, 'partyOf misses ' + m.join(', ') + ' self ' + p.self + ' leader ' + p.leader);
  }
  const pm = R.PS.partyMembershipOf(cs);
  need('party', !!pm && pm.seats.length === 2 && pm.me !== null && pm.leader !== null && pm.isLeader && !!pm.densities && pm.densities.mill_cellar === 2,
    'partyMembershipOf yields ' + JSON.stringify(pm && { seats: pm.seats.length, me: pm.me, leader: pm.leader, densities: pm.densities }));
  // party_people: the player menu's targets, one per seat of the real party, with the server's account ids (2026-10-25-social.sql)
  const pp = R.PS.partyPeopleOf(cs);
  need('party_people', Array.isArray(body.party_people) && pp.size === body.party_people.length && !!pm && pp.size === pm.seats.length
    && pm.seats.every((x) => pp.has(x.seat)) && p && p.members.every((x) => pp.has(x.seat)),
    'partyPeopleOf yields ' + JSON.stringify(Array.from(pp.entries())) + ' from ' + JSON.stringify(body.party_people).slice(0, 200)
    + ' for seats ' + JSON.stringify(pm && pm.seats.map((x) => x.seat)) + ' / members ' + JSON.stringify(p && p.members.map((x) => x.seat)));
  // stamina + premium + account
  const st = R.HS.staminaOf(cs);
  need('stamina', !!st && isNum(st.msLeft) && isNum(st.capMs), 'staminaOf yields ' + JSON.stringify(st) + ' from ' + JSON.stringify(body.stamina));
  need('premium', R.HS.isPremium(cs) === true, 'isPremium is false for a premium character: ' + JSON.stringify(body.premium));
  need('account', R.ACC.accountLimitOf((k) => cs.read(k)) === R.CFG.SESSION_CONFIG.maxConcurrentCharacters,
    'account.max_concurrent reads ' + R.ACC.accountLimitOf((k) => cs.read(k)) + ' from ' + JSON.stringify(body.account));
  /* the roster's hero-slot offer (2026-11-03-hero-slots-gold.sql): a fresh account owns two, so slot 2 is for sale */
  const so = R.ACC.slotOfferOf(cs.read('account'));
  need('account', !!so && so.slotId === 2 && so.cost > 0 && so.max === 5, 'slotOfferOf yields ' + JSON.stringify(so) + ' from ' + JSON.stringify(body.account));
  // the alpha windows' sections the server projects
  const bag = R.IS.bagOf(cs);
  need('inventory', Array.isArray(bag), 'bagOf reads no inventory');
  need('equipment', R.IS.equipmentOf(cs) !== null, 'equipmentOf reads no equipment');
  const sk = R.IS.skillsOf(cs);
  need('skills', !!sk && Object.keys(sk).length >= 4 && !!sk.melee, 'skillsOf yields ' + JSON.stringify(sk).slice(0, 160) + ' from ' + JSON.stringify(body.skills).slice(0, 160));
  need('state', R.IS.goldOf(cs) !== null, 'goldOf reads no state.gold');
  const v = R.PS.vitalsOf(cs);
  need('state', !missing(v, ['hp', 'hpMax', 'mana', 'manaMax', 'staminaMs', 'staminaCapMs']).length, 'vitalsOf misses ' + missing(v, ['hp', 'hpMax', 'mana', 'manaMax', 'staminaMs', 'staminaCapMs']).join(', '));
  need('state', R.PS.assignmentOf(cs).kind === 'hunting', 'assignmentOf reads ' + JSON.stringify(R.PS.assignmentOf(cs)));
  need('bank', body.bank !== undefined && (body.bank === null || typeof body.bank === 'object'), 'bank is ' + typeof body.bank);
  need('hero_slots', Array.isArray(body.hero_slots), 'hero_slots is not an array');
  // the Inventory's capacity bar, its Advanced view's effects and the Storage window (playtest 10-18)
  need('state', R.IS.bagCapOf(cs) !== null, 'bagCapOf reads no state.bank_cap');
  need('buffs', Array.isArray(body.buffs) && Array.isArray(R.IS.buffsOf(cs)), 'buffsOf reads ' + JSON.stringify(body.buffs).slice(0, 160));
  need('bank', body.bank === null || Array.isArray(R.IS.bankOf(cs)), 'bankOf reads ' + JSON.stringify(body.bank).slice(0, 160));
  // ── lane S2: the alpha windows' and the party UI's sections (seeded by S2_SEED before the settle) ──
  need('name', typeof body.name === 'string' && R.IS.nameOf(cs) === SEED.name && (!h || h.hero.name === SEED.name),
    'name reads ' + JSON.stringify(R.IS.nameOf(cs)) + ' from ' + JSON.stringify(body.name) + ' (hero ' + JSON.stringify(h && h.hero.name) + ')');
  const ru = R.IS.rulesOf(cs);
  need('bag_rules', !!ru && ru.locked.has(SEED.lock) && ru.loot[SEED.loot] === 'sell',
    'rulesOf yields ' + JSON.stringify(ru && { locked: [...ru.locked], loot: ru.loot }) + ' from ' + JSON.stringify(body.bag_rules));
  const sh = R.IS.shopOf(cs);
  /* The Shop sells tools, the outfitter's gear and the seed counter, never supplies (2026-11-02-shop-no-supplies.sql,
     2026-11-20-shop-outfitter.sql, 2026-11-21-shop-seeds.sql), and quotes no refill. */
  need('shop', !!sh && sh.offers.length > 0 && sh.offers.every((o) => o.kind === 'tool' || o.kind === 'gear' || o.kind === 'seed') && sh.offers.some((o) => o.item === SEED.tool)
    && sh.offers.some((o) => o.kind === 'gear') && sh.offers.some((o) => o.kind === 'seed')
    && sh.bids.size > 0 && !('refill' in body.shop),
    'shopOf yields ' + JSON.stringify(sh && { offers: sh.offers.length, bids: sh.bids.size }).slice(0, 300) + ' from ' + JSON.stringify(body.shop).slice(0, 200));
  const pr = R.IS.presetsOf(cs);
  const p0 = pr && pr.find((x) => x.preset === SEED.preset);
  need('hunt_presets', !!p0 && p0.name === SEED.presetName && p0.actionSet !== null && Object.keys(p0.gear).length > 0,
    'presetsOf yields ' + JSON.stringify(pr) + ' from ' + JSON.stringify(body.hunt_presets));
  const ro = R.IS.roleOf(cs);
  need('role', !!ro && ro.weapon !== null && R.PS.roleIdOf(cs) === ro.id, 'roleOf yields ' + JSON.stringify(ro) + ' from ' + JSON.stringify(body.role));
  const inv = R.PS.invitesOf(cs);
  need('party_invites', Array.isArray(inv) && inv.length === 1 && inv[0].from === SEED.inviter && inv[0].hunt === (body.party_invites[0].hunt ?? null),
    'invitesOf yields ' + JSON.stringify(inv) + ' from ' + JSON.stringify(body.party_invites));
  /* The Services window's readers (src/session/item-sections.js). */
  const sr = R.IS.staminaRefillOf(cs);
  need('stamina_refill', !!sr && isNum(sr.n) && isNum(sr.perDay) && (sr.available ? isNum(sr.price) && isNum(sr.restoreMs) : typeof sr.why === 'string'),
    'staminaRefillOf yields ' + JSON.stringify(sr) + ' from ' + JSON.stringify(body.stamina_refill));
  const bl = R.IS.blessingsOf(cs);
  need('blessings', !!bl && isNum(bl.permille) && bl.tiers.length === 3 && bl.freeUntil !== null && bl.tiers.every((t) => isNum(t.price) && isNum(t.permille)),
    'blessingsOf yields ' + JSON.stringify(bl) + ' from ' + JSON.stringify(body.blessings));
  // the Character window (2026-10-25-character-sheet.sql): before any `sheet` call the sheet is not fresh
  const csh = R.CS.characterSheetOf(cs);
  need('character_sheet', !!csh && isNum(body.character_sheet.level) && isNum(body.character_sheet.max_hp) && !!csh.bestiary && csh.bestiary.total > 0,
    'characterSheetOf yields ' + JSON.stringify(csh) + ' from ' + JSON.stringify(body.character_sheet));
  const of = R.CS.outfitOf(cs);
  need('outfit', !!of && of.owned.has('knight') && of.owned.has('witch'), 'outfitOf (a premium character) yields ' + JSON.stringify(of && [...of.owned]) + ' from ' + JSON.stringify(body.outfit));
  need('death_log', Array.isArray(R.CS.deathLogOf(cs)), 'deathLogOf reads no death_log: ' + JSON.stringify(body.death_log));
  /* `now`, the envelope's own server stamp (hr_state_of): the problem report states the envelope's
     age from it (src/shell/report-model.js). A date, from this run's database clock. */
  const stamp = Date.parse(String(cs.read('now') || ''));
  need('now', Number.isFinite(stamp) && Math.abs(stamp - Date.now()) < 24 * 3600000, 'the envelope stamp `now` reads ' + JSON.stringify(body.now) + ' (not a date of this run)');
  // the vitals strip out of a hunt (core rebuild `vitals`): max HP and mana, mana full in town
  const tv = R.CS.heroVitalsOf(cs);
  need('vitals', !!tv && isNum(tv.hpMax) && isNum(tv.manaMax) && isNum(tv.level) && (tv.hunting || tv.mana === tv.manaMax),
    'heroVitalsOf yields ' + JSON.stringify(tv) + ' from ' + JSON.stringify(body.vitals));
  return out;
}

/* The `sheet` verb's answer: the engine's numbers, fresh, and a fall the server kept. */
function sheetContract(R, cs, body) {
  const out = [];
  const need = (sec, cond, msg) => { if (!cond) out.push({ sec, msg }); };
  const sh = R.CS.characterSheetOf(cs);
  const c = sh && sh.combat;
  need('character_sheet', !!sh && sh.fresh && !!c && !!c.damage && c.damage.max >= 1 && c.defence !== null && c.accuracyPct !== null
    && c.critPct !== null && !!c.role,
    'after the sheet verb characterSheetOf yields ' + JSON.stringify(sh) + ' from ' + JSON.stringify(body.character_sheet));
  const dl = R.CS.deathLogOf(cs);
  need('death_log', !!dl && dl.length === 1 && dl[0].monster === 'rat' && dl[0].xp === 5 && !!dl[0].hunt,
    'deathLogOf yields ' + JSON.stringify(dl) + ' from ' + JSON.stringify(body.death_log));
  return out;
}
/* The envelope keys CONTRACT covers (with the settle-response keys). */
export const CONTRACT_KEYS = Object.freeze(['hunt', 'hunt_track', 'hunt_events', 'hunt_server_now_ms', 'hunt_settings', 'hunt_analyzer',
  'party', 'party_people', 'stamina', 'premium', 'account', 'inventory', 'equipment', 'skills', 'state', 'bank', 'buffs', 'hero_slots',
  'name', 'bag_rules', 'shop', 'hunt_presets', 'role', 'party_invites', 'stamina_refill', 'blessings',
  'character_sheet', 'outfit', 'death_log', 'vitals', 'hunt_bests', 'hunt_density', 'now']);

/* What lane S2's sections are seeded with before the settle (each verb through the real RPC). */
const SEED = Object.freeze({ name: 'Contract Hero', inviter: 'Contract Inviter', lock: 'cooked_shrimp', loot: 'normal_log',
  tool: 'bronze_axe', preset: 2, presetName: 'Contract set' });
async function seedS2(db, M, H) {
  const ok = async (uid, sql, params) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await H.one(db, sql, params);
    if (!r || r.ok !== true) throw new Error('S2 seed refused: ' + sql.slice(0, 60) + ' -> ' + JSON.stringify(r));
    return r;
  };
  const me = H.UIDS[0], other = H.UIDS[2];
  await db.query('delete from public.hr_rate_counters');
  await ok(me, 'select public.hr_character_name_set(0, $1, gen_random_uuid())', [SEED.name]);
  await ok(me, 'select public.hr_item_lock(0, $1, true, gen_random_uuid())', [SEED.lock]);
  await ok(me, "select public.hr_loot_rule_set(0, $1, 'sell', gen_random_uuid())", [SEED.loot]);
  /* An invite to this character, found by its name (the first invite makes the inviter's party). */
  await H.character(db, M, other, { inv: {} });
  await ok(other, 'select public.hr_character_name_set(0, $1, gen_random_uuid())', [SEED.inviter]);
  await ok(other, 'select public.hr_hunt_party_invite(0, $1, gen_random_uuid())', [SEED.name]);
  await db.query("select set_config('request.jwt.claim.sub', '', true)");
  /* hunt_bests: an earlier 30-minute solo hunt on the Mill Cellar, finished and folded by the server's own fold
     (2026-11-04-hunt-bests.sql): 1,000 XP and 100 gp of coins in half an hour = 2,000 XP and 200 gp an hour. */
  const sid = await H.one(db, "insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, ended_at, end_reason) "
    + "values ($1, 0, 'mill_cellar', now() - interval '2 hours', now() - interval '2 hours', now() - interval '90 minutes', "
    + "now() - interval '90 minutes', now() - interval '90 minutes', 'left') returning id", [me]);
  await db.query(`insert into public.hunt_session_tally (session_id, user_id, slot, xp, coins) values ($1, $2, 0, '{"level": 1000}'::jsonb, 100)`, [sid, me]);
  await db.query('select public.hr_hunt_best_fold($1)', [sid]);
}

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
    CS: await import(u('src/session/character-sections.js')),
    CFG: await import(u('src/session/config.js')), CSN: await import(u('src/session/character-session.js')),
    M: await import(u('src/data/monsters.js')),
  };
}

/* The real body: a premium two-hero party, six minutes settled, then ONE player-door settle. */
async function realBody(db, M, H) {
  const P = { ...H.STRONG, premium: true, density: 2, options: { food_below_pct: 40, gather_share: 10,
    stop_rules: [{ conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 1 }], join: 'and', forMs: 60000 }] } };
  /* The named setup is saved in TOWN, before the hunt opens: hr_hunt_preset_save refuses an open hunt (hunt_open). */
  const h = await H.hunter(db, M, { party: [{ ...P }, { ...P }], beforeEnter: async () => {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [H.UIDS[0]]);
    const r = await H.one(db, 'select public.hr_hunt_preset_save(0, $1, $2, gen_random_uuid())', [SEED.preset, SEED.presetName]);
    if (!r || r.ok !== true) throw new Error('S2 seed refused: the setup save in town -> ' + JSON.stringify(r));
  } });
  /* Monsters are units only mid-pull: sample the pose after every tick so the monster path is proven. */
  const poses = [];
  for (const t of H.ticksOf(30000, 6 * 60000)(h.from)) {
    await H.settleTo(db, M, t);
    poses.push(await H.one(db, 'select public.hr_hunt_section_view($1::uuid, 0)', [H.UIDS[0]]));
  }
  await seedS2(db, M, H);
  const exec = H.makeExec(db);
  const at = h.from + 6 * 60000 + 60000;
  const v = await M.HS.settleHunt({ exec, user: H.UIDS[0], slot: 0, mode: 'settle', bucket: null, project: true,
    grounds: H.groundsOf(M), atMs: at, minWindowMs: 0 });
  return { v, h, poses };
}

/* The engine's `sheet` verb module from `root` (the edge mutants load a mutated copy). */
const loadSheet = (root) => import(pathToFileURL(join(root, FN, 'character-sheet.js')).href);

async function check(db, M, H, R, SH) {
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
    /* A death the server keeps (the hunt's one, the core rebuild), then the Character window's ONE ask through the player door. */
    await db.query(`insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
                    select h.id, h.user_id, h.slot, 'death', h.settled_to, '{"monster": "rat", "xp": 5, "xp_lost": {"level": 5, "melee": 3}}'::jsonb
                      from public.hunt_sessions h where h.user_id = $1 and h.slot = 0 order by h.entered_at desc limit 1`, [H.UIDS[0]]);
    const sv = await SH.runSheet({ exec: H.makeExec(db), user: H.UIDS[0], slot: 0, bucket: 'accrue' });
    if (!sv || sv.status !== 200 || !sv.body || sv.body.ok !== true || !cs._take(sv.body, 'sheet')) {
      problems.push({ sec: 'character_sheet', msg: 'the sheet verb answered ' + JSON.stringify(sv && { status: sv.status, error: sv.body && sv.body.error }) + ' / ' + cs.lastVerdict });
    } else problems.push(...sheetContract(R, cs, sv.body));
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
  ['hunt_density', 'public.hr_hunt_density_view(uuid,integer)', 'jsonb_object_agg(d.hunt_id, d.density order by d.hunt_id)', 'jsonb_object_agg(d.hunt_id, d.density::text order by d.hunt_id)'],
  ['party', 'public.hr_hunt_party_view(uuid,integer)', "'leader_densities', coalesce", "'leader_density', coalesce"],
  ['hunt_settings', 'public.hr_hunt_settings_view(uuid,integer)', "'gather_share', v_eff->'gather_share',", "'gather', v_eff->'gather_share',"],
  ['hunt_analyzer', 'public.hr_hunt_analyzer_of(uuid,integer,uuid)', "'hunt_ms', floor(", "'huntms', floor("],
  ['hunt_analyzer', 'public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)', "'kills', v_kills", "'kill_count', v_kills"],
  ['premium', 'public.hr_premium_view(uuid,integer)', "'active'", "'is_active'"],
  ['account', 'public.hr_account_view(uuid,integer)', "'max_concurrent'", "'max'"],
  ['account', 'public.hr_account_view(uuid,integer)', "'cost_gold', c.cost_gold", "'cost', c.cost_gold"],
  ['account', 'public.hr_account_view(uuid,integer)', "'hero_slot_offer', (", "'slot_offer', ("],
  // lane S2
  ['name', 'public.hr_character_name_view(uuid,integer)', 'select to_jsonb(public.hr_character_name(p_user, p_slot))', 'select to_jsonb(null::text)'],
  ['bag_rules', 'public.hr_bag_rules_view(uuid,integer)', "'loot', coalesce(", "'loot_rules', coalesce("],
  ['shop', 'public.hr_shop_view(uuid,integer)', "'offers', coalesce(", "'offer_list', coalesce("],
  ['hunt_presets', 'public.hr_hunt_presets_view(uuid,integer)', "'action_set', p.action_set,", "'set', p.action_set,"],
  ['role', 'public.hr_role_view(uuid,integer)', "'weapon', w.weapon_type)", "'weapon_type', w.weapon_type)"],
  ['party_invites', 'public.hr_party_invites_view(uuid,integer)', "'from', public.hr_character_name(", "'sender', public.hr_character_name("],
  ['stamina_refill', 'public.hr_stamina_refill_quote(uuid,integer)', "'restore_ms', v_min * 60000,", "'restore', v_min * 60000,"],
  ['blessings', 'public.hr_blessings_view(uuid,integer)', "'tiers', coalesce(", "'tier_list', coalesce("],
  ['character_sheet', 'public.hr_character_sheet_view(uuid,integer)', "'slain', (select", "'killed', (select"],
  ['character_sheet', 'public.hr_character_sheet_view(uuid,integer)', "'combat', case when v_fresh", "'sheet', case when v_fresh"],
  ['character_sheet', 'public.hr_character_sheet_inputs(uuid,integer)', "'buffs', coalesce((select", "'buffs', clock_timestamp()::text, 'b', coalesce((select"],
  ['outfit', 'public.hr_outfit_view(uuid,integer)', "'owned', to_jsonb(v_owned)", "'have', to_jsonb(v_owned)"],
  ['death_log', 'public.hr_death_log_view(uuid,integer)', "'monster', nullif(", "'killer', nullif("],
  ['hunt_bests', 'public.hr_hunt_bests_view(uuid,integer)', "jsonb_build_object('xp_h', b.xp_h,", "jsonb_build_object('xph', b.xp_h,"],
  ['hunt_bests', 'public.hr_hunt_bests_view(uuid,integer)', "'min_ms', (extract(", "'minms', (extract("],
  ['now', 'public.hr_state_of(uuid,integer)', "'now', now(),", "'stamp', now(),"],
];
const EDGE_MUTANTS = [
  ['hunt_track', 'src/core/hunt-track.js', '    hunt_track: pb.steps.map(', '    track: pb.steps.map('],
  ['hunt_server_now_ms', 'src/core/hunt-track.js', '    hunt_server_now_ms: Math.floor(', '    server_now_ms: Math.floor('],
  ['character_sheet', join(FN, 'character-sheet.js'), '    damage: { min: 1, max: snap.maxHit },', '    dmg: { min: 1, max: snap.maxHit },'],
];

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(1); }
  await H.pinDice(db);
  const R = await readers(H.ROOT);
  const M = await H.loadEdge(H.ROOT);
  const SH = await loadSheet(H.ROOT);
  if (!MUTATE) {
    const p = await check(db, M, H, R, SH);
    for (const x of p) console.error('✗ ' + x.sec + ': ' + x.msg);
    if (p.length) { console.log('envelope-contract: ' + p.length + ' problem(s)'); process.exit(1); }
    console.log('envelope-contract: green — ' + CONTRACT_KEYS.length + ' keys read by the client from the real settle body ('
      + CONTRACT_KEYS.join(', ') + '); ' + Object.keys(PENDING).length + ' pending (' + Object.keys(PENDING).join(', ') + ')');
    process.exit(0);
  }
  let bad = 0;
  const control = await check(db, M, H, R, SH);
  if (control.length) { console.error('✗ CONTROL red, no mutant proves anything: ' + control.map((x) => x.sec + ' ' + x.msg).join(' | ')); process.exit(1); }
  for (const [sec, fn, find, repl] of DB_MUTANTS) {
    const def = String(await H.one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
    if (!def.includes(find)) { console.error('✗ ' + sec + ' mutant anchor not in ' + fn + ': ' + find); bad++; continue; }
    await db.query('begin');
    try {
      await db.exec(def.replace(find, repl));
      await db.query('savepoint m');
      const p = await check(db, M, H, R, SH);
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
      const p = await check(db, Mm, H, R, await loadSheet(dir));
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
