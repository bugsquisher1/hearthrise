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
    /* role + discipline: the Configure window locks a spell by the server's discipline (2027-01-13-spell-roles.sql) */
    const m = missing(s, ['preset', 'role', 'discipline', 'targetMode', 'stance', 'distance', 'chase', 'supplySource', 'onEmpty', 'gatherShare']);
    need('hunt_settings', !m.length && Array.isArray(s.slots) && s.slots.length > 0 && s.presets.length > 0, 'settingsOf misses ' + m.join(', ') + (s.slots.length ? '' : ' slots') + (s.presets.length ? '' : ' presets'));
    /* The action engine (2026-10-25): every slot in the wire shape, the gathering share marked inert; density is no setting (hunt_tier). */
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
  // hunt_tier (the hunt picker's pick per ground and the tier the running hunt froze, 2027-02-27-hunt-tiers.sql): the hero's own Dangerous on its ground
  const dm = R.HS.huntTierOf(cs);
  need('hunt_tier', !!dm && dm.picks.mill_cellar === 'dangerous' && dm.playing === 'dangerous', 'huntTierOf yields ' + JSON.stringify(dm) + ' from ' + JSON.stringify(body.hunt_tier));
  // hunt_target_kind (the bar's First target per ground, 2027-04-22-target-kind.sql): the hero's own Giant Rat on its ground
  const fk = R.HS.huntTargetKindOf(cs);
  need('hunt_target_kind', !!fk && fk.picks.mill_cellar === 'rat', 'huntTargetKindOf yields ' + JSON.stringify(fk) + ' from ' + JSON.stringify(body.hunt_target_kind));
  // boss_halls (a keyed hall's door, 2027-04-25-boss-daily.sql): every OPEN hall in the data is said, with this hero's day (nothing taken),
  // whose key an open would take (nobody here holds one) and the party walking in, both with today's prize to take
  for (const hallId of Object.keys(R.BHL.OPEN_BOSS_HALLS)) {
    const bh = R.BQ.hallStateOf(cs, hallId);
    need('boss_halls', !!bh && bh.taken === false && bh.nextAtMs === null && bh.key === null && bh.seats === 2 && bh.left === 2,
      'hallStateOf(' + hallId + ') yields ' + JSON.stringify(bh) + ' from ' + JSON.stringify(body.boss_halls));
  }
  need('boss_halls', Object.keys(R.BHL.OPEN_BOSS_HALLS).length > 0, 'CONTROL: the data holds no open hall, so the boss_halls reader was never read');
  // entry_gates (2027-05-05-entry-gates.sql, Tyler 2026-11-18): the Tower's door (its switch on) and every call's natural wins, each `ok` the server's own
  // reading of this hero and every other seat (true only at the number with no seat short), each short seat named
  const tg = R.GT.towerGateOf(cs);
  need('entry_gates', !!tg && tg.need >= 2 && tg.level >= 1 && tg.ok === (tg.level >= tg.need && tg.short.length === 0) && tg.short.every((x) => !!x.name && x.level < tg.need),
    'towerGateOf yields ' + JSON.stringify(tg) + ' from ' + JSON.stringify(body.entry_gates));
  for (const id of Object.keys(R.BC.BOSS_CALLS)) {
    const cg = R.GT.callGateOf(cs, id);
    need('entry_gates', !!cg && cg.boss === R.BC.BOSS_CALLS[id].of && cg.need === R.BC.BOSS_CALL_RULES.winsToCall && cg.ok === (cg.have >= cg.need && cg.short.length === 0)
      && cg.short.every((x) => !!x.name && x.have < cg.need), 'callGateOf(' + id + ') yields ' + JSON.stringify(cg) + ' from ' + JSON.stringify(body.entry_gates));
  }
  // party (the hunt panel's and the party window's readers, one shape)
  const p = R.HS.partyOf(cs);
  need('party', !!p && p.members.length === 2, 'partyOf yields ' + (p ? p.members.length : 'no') + ' members: ' + JSON.stringify(body.party).slice(0, 240));
  if (p) {
    const m = p.members.flatMap((x) => missing(x, ['unit', 'name', 'level', 'hp', 'hpMax', 'mana', 'manaMax', 'dealt', 'healed', 'dps', 'hps', 'role']).map((k) => x.unit + '.' + k));
    need('party', !m.length && p.self !== null && p.leader !== null, 'partyOf misses ' + m.join(', ') + ' self ' + p.self + ' leader ' + p.leader);
  }
  const pm = R.PS.partyMembershipOf(cs);
  /* LEAVE TOGETHER (2026-12-18-party-leave-together.sql): the viewer's own box, on by default beside another account's hero (1025-own-heroes-apart.sql hr_party_leave_together_of) */
  need('party', !!pm && pm.seats.length === 2 && pm.me !== null && pm.leader !== null && pm.isLeader && !!pm.tiers && pm.tiers.mill_cellar === 'dangerous' && pm.leaveTogether === true,
    'partyMembershipOf yields ' + JSON.stringify(pm && { seats: pm.seats.length, me: pm.me, leader: pm.leader, tiers: pm.tiers, leaveTogether: pm.leaveTogether }));
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
  /* FOUR HERO SLOTS FROM THE START (Tyler 2026-11-21; src/data/shops.js HERO_SLOTS, 1036-four-starter-slots.sql): the data sells none, and
     the account section offers none, its top the data's count */
  const acct = cs.read('account') || {};
  need('account', !R.SHOP.SHOP_OFFERS.some((o) => o.table === 'character_slot') && acct.hero_slot_offer == null && acct.hero_slots_max === R.SHOP.HERO_SLOTS.count,
    'the account section reads ' + JSON.stringify(body.account) + ' (want no slot offer and a top of ' + R.SHOP.HERO_SLOTS.count + ')');
  // the alpha windows' sections the server projects
  const bag = R.IS.bagOf(cs);
  need('inventory', Array.isArray(bag), 'bagOf reads no inventory');
  need('equipment', R.IS.equipmentOf(cs) !== null, 'equipmentOf reads no equipment');
  const sk = R.IS.skillsOf(cs);
  need('skills', !!sk && Object.keys(sk).length >= 4 && !!sk.melee, 'skillsOf yields ' + JSON.stringify(sk).slice(0, 160) + ' from ' + JSON.stringify(body.skills).slice(0, 160));
  /* A SKILL'S BAR IS THE SERVER'S SECTION (lane/c-skills-from-server): every skill the ledgers draw, whole, its level the one
     `skills` states, its two marks holding its XP (the settled hunt has moved Melee off zero) */
  const sl = R.IS.skillLevelsOf(cs);
  const slBad = sl ? Object.keys(sk || {}).filter((id) => !sl[id] || sl[id].level !== sk[id].level || sl[id].xp !== sk[id].xp
    || !(sl[id].need === 0 || sl[id].into < sl[id].need)) : ['(no section)'];
  need('skill_levels', !!sl && Object.keys(sl).length >= 13 && !slBad.length && !!sl.melee && sl.melee.xp > 0 && sl.melee.need > 0,
    'skillLevelsOf yields ' + JSON.stringify(sl && sl.melee) + ' (cells off `skills`: ' + slBad.join(',') + ') from ' + JSON.stringify(body.skill_levels).slice(0, 200));
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
  // where a town skill's inputs come from (2027-01-24-skills-from-storage.sql): the bag, then the account's Storage
  need('skill_inputs', R.IS.drawsOnStorage(cs) === true && typeof R.IS.heldOf(cs) === 'object',
    'drawsOnStorage reads ' + JSON.stringify(body.skill_inputs) + ' (want {from: ["bag", "storage"]})');
  // the work bench tax (2027-02-19-bench-tax.sql): what a public bench takes, the words before Start
  // This hero is hunting: the section sends no rooms and no fees to a hunter (settle cost), only the carry; a town hero's rooms: tests/bench-tax.mjs T-HOUSE.
  need('bench_tax', R.BT.benchTaxOf(cs) !== null && Number.isInteger(body.bench_tax && body.bench_tax.carry_mg) && R.BT.benchTaxOf(cs).carry === body.bench_tax.carry_mg,
    'benchTaxOf reads ' + JSON.stringify(body.bench_tax).slice(0, 160));
  // the recipes this hero has learned from a pattern (2026-09-14-recipe-learn.sql hr_recipes_of; src/data/patterns.js): the gated bench reads
  // it, so a hero that read none is an EMPTY object (closed), never a missing key (null, read as closed too, but no longer the server's word)
  const learned = R.BT.learnedRecipesOf(cs);
  need('unlocked_recipes', !!learned && !!body.unlocked_recipes && typeof body.unlocked_recipes === 'object' && !Array.isArray(body.unlocked_recipes)
    && JSON.stringify(learned) === JSON.stringify(body.unlocked_recipes),
    'learnedRecipesOf reads ' + JSON.stringify(learned) + ' from ' + JSON.stringify(body.unlocked_recipes));
  // combat training (2027-04-16-combat-training.sql): the yard's four quotes at the server's fee and the house dummy's ladder; a hunter has no run
  const tr = R.TR.trainingOf(cs);
  need('training', !!tr && tr.skills.length === 4 && tr.maxHours > 0 && tr.run === null && tr.quotes.length === 4
    && tr.quotes.every((q) => Number.isInteger(q.feeH) && q.feeH > 0 && Number.isInteger(q.level))
    && !!tr.dummy && tr.dummy.ladder.length === 4 && Number.isInteger(tr.dummy.nextPrice) && tr.dummy.nextPrice > 0,
    'trainingOf yields ' + JSON.stringify(tr) + ' from ' + JSON.stringify(body.training).slice(0, 200));
  /* scaled hunts (2027-03-21-scaled-hunts.sql hr_scaled_hunts_view; src/shell/windows/scale-pane.js, audit F26), switched on for everyone inside this
     test's transaction: the slider's clamps and a row per scalable ground; this Level 25 hero has outgrown some (a Level and a price) and not others */
  const shv = R.SH.scaledHuntsOf(cs), shg = shv ? Object.values(shv.grounds) : [];
  need('scaled_hunts', !!shv && shv.minHours === 1 && shv.maxHours === 24 && shv.bankMaxMs === 24 * 3600000 && shv.dayMaxHours > 0 && shg.length >= 5
    && shg.every((g) => g.fromLevel > 1 && g.bankedMs === 0 && g.on === true) && shg.some((g) => g.level === null) && shg.some((g) => g.level > 1 && g.price > 0) && !!shv.grounds.mill_cellar,
    'scaledHuntsOf yields ' + JSON.stringify(shv) + ' from ' + JSON.stringify(body.scaled_hunts).slice(0, 240));
  // the factions (2027-04-23-faction-section.sql, the switch on inside this test): a hero with no side and no Krell kill, both sides' standing
  // at the server's 0, every piece's need, and the swap's need and cooldown the Faction tab says
  const fx = R.FX.factionOf(cs);
  need('factions', !!fx && fx.side === null && fx.canJoin === false && fx.sides.length === 2 && fx.sides.every((x) => fx.standing[x] === 0)
    && fx.pieces.length > 0 && fx.pieces.every((x) => x.needMs > 0 && fx.sides.includes(x.side) && x.held === false) && fx.swapNeedMs > 0 && fx.cooldownMs > 0,
    'factionOf yields ' + JSON.stringify(fx) + ' from ' + JSON.stringify(body.factions).slice(0, 240));
  // the Burning Tower (2027-04-28-tower-section.sql, the switch on inside this test): a hero who never climbed, checkpoint 0 (floor 1) its
  // one start, the Tower mode's own pay (no coin, no death loss), the rules the window says, and the chest's menu with every key row and
  // key family the server lists and the instant its week resets; every OTHER seat of the hero's party with the name the party section
  // shows and its best (0: nobody climbed); no field (no Tower board yet: no rank, no rivals)
  const tw = R.TWR.towerOf(cs);
  const others = body.party && Array.isArray(body.party.members) ? body.party.members.filter((m) => m.seat !== body.party.self_seat) : [];
  need('tower', !!tw && tw.checkpoints.join() === '0' && tw.record === 0 && tw.bestFloor === 0 && tw.run === null && tw.last === null && tw.rules.landingEvery > 0
    && tw.rules.floorLimitMs > 0 && tw.rules.landingLimitMs >= tw.rules.floorLimitMs && !!tw.pays && tw.pays.deathLossPm === 0 && tw.pays.coin === false
    && tw.pays.xpPm > 0 && tw.pays.xpPm < 1000 && Array.isArray(body.tower.party) && tw.field === null
    && tw.party.length === others.length && tw.party.every((p) => p.floor === 0 && others.some((m) => m.seat === p.seat && m.name === p.name))
    && !!tw.chest && tw.chest.keys.length >= 4 && tw.chest.keys.every((k) => k.basePm > 0 && k.chancePpm > 0 && k.stokes.length > 0 && k.heldAll === 0)
    && tw.chest.perCall > 0 && tw.chest.weekEnds !== null && tw.chest.families.length >= 1
    && tw.chest.families.every((x) => x.openedWeek === 0 && x.maxWeek > 0 && x.held === 0 && x.maxHeld >= x.maxWeek && !!x.name),
    'towerOf yields ' + JSON.stringify(tw && { party: tw.party, field: tw.field }) + ' ' + JSON.stringify(tw).slice(0, 300) + ' from ' + JSON.stringify(body.tower).slice(0, 300));
  // the Unmarked Catacombs (2027-05-08-catacombs.sql hr_catacomb_section, the switch on inside this test): a hero who never descended, both
  // wings the server lists with room 1 their one start and no last start, the door's Level met (this Level 25 hero), the mode's own pay, no
  // run, no last, no board place; its chest lists the Catacomb keys with their armor (a ready key every slot and weight, a key not ready none)
  const cat = R.CAT.catacombOf(cs);
  need('catacomb', !!cat && cat.wings.map((w) => w.wing).sort().join() === 'bone,flooded'
    && cat.wings.every((w) => w.best === 0 && w.record === 0 && w.checkpoints.join() === '0' && w.lastStart === null && /^unmarked_/.test(w.hunt))
    && cat.lastWing === null && cat.rules.doorEvery > 0 && cat.rules.doorLimitMs >= cat.rules.roomLimitMs && !!cat.gate && cat.gate.ok === true && cat.gate.need > 0
    && !!cat.pays && cat.pays.deathLossPm === 0 && cat.pays.coin === false && cat.run === null && cat.last === null
    && cat.party.length === others.length && cat.field.solo === null && cat.field.party === null && !!cat.chest
    && cat.chest.families.some((f) => f.family === 'catacomb') && cat.chest.families.some((f) => f.family === 'tower')
    && cat.chest.keys.filter((k) => k.gear === 'armor').length === 8
    && cat.chest.keys.filter((k) => k.gear === 'armor').every((k) => cat.wings.some((w) => w.hunt === k.ground) && k.helmetPm !== null
      && (k.ready ? k.armor.length === 6 : k.armor.length === 0)),
    'catacombOf yields ' + JSON.stringify(cat && { wings: cat.wings, gate: cat.gate, field: cat.field }) + ' from ' + JSON.stringify(body.catacomb).slice(0, 400));
  // when the hunt ends (2027-04-25-hunt-itinerary.sql): a hunter that never picked reads the default, the grace, and its running hunt's own frozen choice
  const ha = R.HA.huntAfterOf(cs);
  need('hunt_after', !!ha && ha.choice === 'job' && ha.skill === null && Number.isInteger(ha.graceS) && ha.graceS > 0
    && !!ha.now && typeof ha.now.session === 'string' && ha.now.choice === 'job' && ha.now.done === null,
    'huntAfterOf yields ' + JSON.stringify(ha) + ' from ' + JSON.stringify(body.hunt_after).slice(0, 240));
  // the bag's next rung (2027-04-15-bag-expand-view.sql): the cap and bank.0 at the server's price, the Storage window's Expand
  const be = R.IS.bagExpandOf(cs);
  need('bag_expand', !!be && be.cap === 100 && be.rung === 0 && !!be.next && be.next.offer === 'bank.0' && be.next.gold === 3000 && be.next.adds === 20,
    'bagExpandOf yields ' + JSON.stringify(be) + ' from ' + JSON.stringify(body.bag_expand));
  // the Key Ring (2027-04-27-tower-chest.sql, lane/c-key-ring): not bought, its offer at the server's price (gold-ladders.js), no keys on it
  const kr = R.IS.keyRingOf(cs);
  need('key_ring', !!kr && kr.unlocked === false && !!kr.offer && kr.offer.offer === 'key_ring.0' && Number.isInteger(kr.offer.gold) && kr.offer.gold > 0
    && Array.isArray(kr.keys) && kr.keys.length === 0, 'keyRingOf yields ' + JSON.stringify(kr) + ' from ' + JSON.stringify(body.key_ring));
  /* Tempering (2027-02-27-tempering.sql): each ladder's rung and the next rung's price, the smith's window. The ladders are the data's
     (src/data/temper.js TEMPER_UNLOCKS, one per track and tier), never a written count: tiers 4 to 6 (v0.2.135) made a literal 4 stale. */
  const tp = R.TP.temperOf(cs);
  const ladders = R.TD.TEMPER_UNLOCKS.map((x) => x.unlock_id).sort().join();
  need('temper', Array.isArray(tp) && tp.map((l) => R.TD.temperUnlockId(l.track, l.tier)).sort().join() === ladders
    && tp.every((l) => l.rung === 0 && l.max === R.TD.TEMPER_RUNGS && l.offer === R.TD.temperOfferId(l.track, l.tier, 1) && Number.isInteger(l.gold) && l.gold > 0),
    'temperOf yields ' + JSON.stringify(tp) + ' from ' + JSON.stringify(body.temper).slice(0, 160));
  // the Hallmark step (2027-03-14-jewelry-hallmark.sql): the offers for the Fine pieces held (none here), the account's count and the day's limit
  const hm = R.JW.hallmarkOf(cs);
  need('hallmark', !!hm && Array.isArray(hm.offers) && hm.offers.length === 0 && hm.today === 0 && hm.perDay >= 1,
    'hallmarkOf yields ' + JSON.stringify(hm) + ' from ' + JSON.stringify(body.hallmark));
  // the ACCOUNT storage's space (2026-11-28-storage-chests.sql): used / cap and the next chest, the Storage window's line
  const dp = R.IS.depotOf(cs);
  need('depot', !!dp && dp.cap >= 1 && dp.used >= 0 && (dp.next === null || (dp.next.stacks >= 1 && dp.next.name.length > 0)),
    'depotOf yields ' + JSON.stringify(dp) + ' from ' + JSON.stringify(body.depot));
  // the account's one house (2026-11-29-house-home.sql): the property ladder and the rooms, the House window's ledger;
  // the storage chests ride the same depot section (src/session/home-sections.js)
  const ho = R.HO.homeOf(cs), ch = R.HO.chestsOf(cs);
  need('home', !!ho && ho.tier >= 0 && ho.tiers.length >= 1 && ho.tiers.every((t) => t.gold >= 1 && /^property\./.test(t.offer)) && ho.rooms.length >= 1
    && ho.rooms.every((r) => r.rungs >= 1 && (r.next === null || /^room\./.test(r.next.offer))) && !!ch && ch.chests.length >= 1,
    'homeOf yields ' + JSON.stringify(ho).slice(0, 200) + ' from ' + JSON.stringify(body.home).slice(0, 200));
  // ── lane S2: the alpha windows' and the party UI's sections (seeded by S2_SEED before the settle) ──
  need('name', typeof body.name === 'string' && R.IS.nameOf(cs) === SEED.name && (!h || h.hero.name === SEED.name),
    'name reads ' + JSON.stringify(R.IS.nameOf(cs)) + ' from ' + JSON.stringify(body.name) + ' (hero ' + JSON.stringify(h && h.hero.name) + ')');
  const ru = R.IS.rulesOf(cs);
  need('bag_rules', !!ru && ru.locked.has(SEED.lock) && ru.loot[SEED.loot] === 'sell',
    'rulesOf yields ' + JSON.stringify(ru && { locked: [...ru.locked], loot: ru.loot }) + ' from ' + JSON.stringify(body.bag_rules));
  const sh = R.IS.shopOf(cs);
  /* The Shop sells tools, the outfitter's gear and the seed counter, never supplies (2026-11-02-shop-no-supplies.sql,
     2026-11-24-shop-outfitter.sql, 2026-11-25-shop-seeds.sql), and quotes no refill. */
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
  const pn = R.PS.noticesOf(cs);
  need('party_notices', Array.isArray(pn) && pn.length === 1 && pn[0].kind === 'left' && pn[0].who === SEED.inviter,
    'noticesOf yields ' + JSON.stringify(pn) + ' from ' + JSON.stringify(body.party_notices));
  /* The Services window's readers (src/session/item-sections.js). */
  const sr = R.IS.staminaRefillOf(cs);
  need('stamina_refill', !!sr && isNum(sr.n) && isNum(sr.perDay) && (sr.available ? isNum(sr.price) && isNum(sr.restoreMs) : typeof sr.why === 'string'),
    'staminaRefillOf yields ' + JSON.stringify(sr) + ' from ' + JSON.stringify(body.stamina_refill));
  /* The Game Master's section (2027-03-13-gm-tools.sql): the key stands on every envelope, and a real hero reads false. */
  need('gm', 'gm' in body && body.gm === null && R.CS.gmOf(cs) === false, 'gmOf yields ' + JSON.stringify(R.CS.gmOf(cs)) + ' from ' + JSON.stringify(body.gm));
  /* The server switches on for this account (2027-03-21-feature-switches.sql): a list of ids, read by featureOn (the bench's dark jobs,
     src/session/jewelry-sections.js jobShown). The chain as applied holds jewel_guarantees off, so no hero reads it on. */
  const sw = body.features;
  need('features', Array.isArray(sw) && sw.length > 0 && sw.every((x) => typeof x === 'string' && R.CS.featureOn(cs, x)) && !R.CS.featureOn(cs, 'jewel_guarantees'),
    'featureOn reads ' + JSON.stringify((Array.isArray(sw) ? sw : []).map((x) => [x, R.CS.featureOn(cs, x)])) + ' from ' + JSON.stringify(sw));
  /* the Characters window's Rename (2026-12-04-hero-rename.sql): what a new name costs this hero now */
  const rn = R.IS.renameOf(cs);
  need('rename', !!rn && isNum(rn.price) && rn.price > 0 && isNum(rn.level) && typeof rn.available === 'boolean',
    'renameOf yields ' + JSON.stringify(rn) + ' from ' + JSON.stringify(body.rename));
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
  /* THE LEVEL IS THE SERVER'S OWN BLOCK (lane/c-level-from-server): the real envelope states { xp, level, into, need }, the
     client's one reader takes all four as they stand, and it is the Level the server's vitals are worked from. */
  const lb = body.level, lr = R.CS.levelOf(cs);
  need('level', !!lb && !!lr && isNum(lb.level) && lr.level === lb.level && lr.xp === lb.xp && lr.into === lb.into && lr.need === lb.need
    && tv.level === lb.level && tv.into === lb.into && tv.need === lb.need && body.vitals.level === lb.level && lb.xp === body.state.level_xp,
    'levelOf yields ' + JSON.stringify(lr) + ' from the envelope\'s level block ' + JSON.stringify(lb) + ' (vitals ' + JSON.stringify(body.vitals) + ', state.level_xp ' + JSON.stringify(body.state && body.state.level_xp) + ')');
  /* the live events (2027-03-22-live-events.sql, 1043-hearthrise.sql hr_live_events_view; src/shell/live-events-view.js reads it for the
     plate, the Hunts lines and the ground's page): the Hearthrise, switched on and holding now, not yet lit, so at the size the fire would
     light at (an empty fire: the floor), as the reader takes it (null when every switch is off) */
  const le = R.LE.liveEventsOf(cs);
  const hr = le && le.find((e) => e.id === 'hearthrise');
  need('live_events', !!hr && hr.type === 'xp_bonus' && hr.dial === 'xpPm' && hr.pm === 1100 && hr.live === true && hr.scope.includes('world')
    && hr.sized === 'fire' && hr.lit === false && hr.startsMs < Date.now() && hr.endsMs > Date.now(), 'liveEventsOf yields ' + JSON.stringify(le) + ' from ' + JSON.stringify(body.live_events));
  /* the Great Hearth's fire (1043-hearthrise.sql hr_hearth_fire_view; live-events-view.js fireLines on the Hearth tab): an empty fire's marks,
     goal, the fuel to its first mark and the size it would light at */
  const fire = R.LE.fireOf(cs);
  need('hearth_fire', !!fire && fire.marks === 0 && fire.of === 5 && fire.fuel === 0 && fire.goal > 0 && fire.need > 0 && fire.pm === 1100 && fire.full === false,
    'fireOf yields ' + JSON.stringify(fire) + ' from ' + JSON.stringify(body.hearth_fire));
  /* quiet presence for the account (1045-ground-presence.sql hr_presence_view; the Friends window's switch reads it) */
  need('presence', !!body.presence && body.presence.quiet === false, 'the presence section reads ' + JSON.stringify(body.presence));
  /* the Farm window (2026-11-26-farm-window.sql): a fresh hero's field — room for 2 plots at the Camp, tier 1, the tier-2 price */
  const fl = R.FS.farmLandOf(cs, 0);
  need('farm_land', !!fl && fl.cap >= 2 && fl.plotLevel >= 1 && fl.plots instanceof Map && (fl.plotLevel >= 5 || (!!fl.upgrade && fl.upgrade.gold > 0 && fl.upgrade.farming > 0)),
    'farmLandOf yields ' + JSON.stringify(fl && { cap: fl.cap, plotLevel: fl.plotLevel, upgrade: fl.upgrade, plots: fl.plots.size }) + ' from ' + JSON.stringify(body.farm_land));
  /* Tend the field (1017-tend-the-field.sql): the server's bill for that field (a fresh field: nothing ready, two empty plots, no gold) */
  const ft = R.FT.farmTendOf(cs);
  need('farm_tend', !!ft && Array.isArray(ft.harvest) && Array.isArray(ft.water) && ft.gold === 0 && ft.choices instanceof Map
    && ft.empty.length === (fl ? fl.cap - fl.plots.size : -1) && ft.empty.every((e) => e.why === 'unplanted'),
    'farmTendOf yields ' + JSON.stringify(ft && { ...ft, choices: [...ft.choices.values()] }) + ' from ' + JSON.stringify(body.farm_tend));
  /* Tamsin's tally (2026-12-23-tally-tasks.sql): the cellar task taken in town, counted by six minutes of real settles */
  const ta = R.TS.tallyOf(cs);
  const tc = ta && ta.held.find((x) => x.task === 'cellar_giant_rats');
  need('tally', !!ta && ta.perDay === 3 && ta.heldMax === 3 && ta.weight === 'light' && ta.order.length === 6 && !!tc && tc.kills > 0 && tc.kills <= tc.target,
    'tallyOf yields ' + JSON.stringify(ta) + ' from ' + JSON.stringify(body.tally));
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
  const ss = R.IS.setupSlotsOf(cs);
  need('setup_slots', !!ss && isNum(ss.count) && isNum(ss.max) && ss.count <= ss.max && (ss.price === null || isNum(ss.price)),
    'setupSlotsOf yields ' + JSON.stringify(ss) + ' from ' + JSON.stringify(body.setup_slots));
  const tt = R.CS.titlesOf(cs);
  need('titles', !!tt && tt.rows.length > 0 && tt.rows.every((r) => isNum(r.price) && isNum(r.kills) && isNum(r.have)),
    'titlesOf yields ' + JSON.stringify(tt) + ' from ' + JSON.stringify(body.titles));
  const dl = R.CS.deathLogOf(cs);
  need('death_log', !!dl && dl.length === 1 && dl[0].monster === 'rat' && dl[0].xp === 5 && !!dl[0].hunt,
    'deathLogOf yields ' + JSON.stringify(dl) + ' from ' + JSON.stringify(body.death_log));
  return out;
}
/* The envelope keys CONTRACT covers (with the settle-response keys). */
export const CONTRACT_KEYS = Object.freeze(['hunt', 'hunt_track', 'hunt_events', 'hunt_server_now_ms', 'hunt_settings', 'hunt_analyzer',
  'party', 'party_people', 'stamina', 'premium', 'account', 'inventory', 'equipment', 'skills', 'state', 'bank', 'buffs', 'hero_slots',
  'name', 'bag_rules', 'shop', 'hunt_presets', 'role', 'party_invites', 'party_notices', 'stamina_refill', 'blessings',
  'character_sheet', 'outfit', 'death_log', 'vitals', 'hunt_bests', 'hunt_tier', 'hunt_target_kind', 'depot', 'home', 'now', 'farm_land', 'farm_tend', 'bench_run', 'rename', 'tally',
  'skill_inputs', 'bench_tax', 'setup_slots', 'titles', 'temper', 'bag_expand', 'gm', 'hallmark', 'level', 'skill_levels', 'live_events', 'training', 'factions', 'hunt_after', 'scaled_hunts', 'boss_halls',
  'tower', 'key_ring', 'entry_gates', 'catacomb', 'features', 'unlocked_recipes', 'hearth_fire', 'presence']);

/* What lane S2's sections are seeded with before the settle (each verb through the real RPC). */
const SEED = Object.freeze({ name: 'Contract Hero', inviter: 'Contract Inviter', lock: 'cooked_shrimp', loot: 'normal_log',
  tool: 'bronze_axe', preset: 0, presetName: 'Contract set' });   // number 0 is open at any free count (hr_setup_locked)
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
  /* A notice to this character: what the other player's move did (the verbs write it; PF-NOTICE plays them). */
  await db.query("select public.hr_party_notice($1, 0, 'left', $2, 0)", [me, other]);
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
    CS: await import(u('src/session/character-sections.js')), FS: await import(u('src/session/farm-sections.js')), FT: await import(u('src/session/farm-tend.js')), HO: await import(u('src/session/home-sections.js')),
    TS: await import(u('src/session/tally-sections.js')), BT: await import(u('src/session/bench-sections.js')), TP: await import(u('src/session/temper-sections.js')), TD: await import(u('src/data/temper.js')),
    JW: await import(u('src/session/jewelry-sections.js')), LE: await import(u('src/session/live-event-sections.js')),
    TR: await import(u('src/session/training-sections.js')), FX: await import(u('src/session/faction-sections.js')),
    TWR: await import(u('src/session/tower-sections.js')), CAT: await import(u('src/session/catacomb-sections.js')),
    HA: await import(u('src/session/hunt-after-sections.js')),
    SH: await import(u('src/session/scaled-hunts.js')),
    BQ: await import(u('src/session/boss-quote.js')), BHL: await import(u('src/data/boss-halls.js')),
    GT: await import(u('src/session/gate-sections.js')), BC: await import(u('src/data/boss-calls.js')),
    CFG: await import(u('src/session/config.js')), CSN: await import(u('src/session/character-session.js')),
    M: await import(u('src/data/monsters.js')), SHOP: await import(u('src/data/shops.js')),
  };
}

/* The real body: a premium two-hero party, six minutes settled, then ONE player-door settle. */
async function realBody(db, M, H) {
  const P = { ...H.STRONG, premium: true, tier: { id: 'dangerous', pull: 2 }, options: { gather_share: 10,
    stop_rules: [{ conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 1 }], join: 'and', forMs: 60000 }] } };
  /* The named setup is saved in TOWN, before the hunt opens: hr_hunt_preset_save refuses an open hunt (hunt_open). */
  const h = await H.hunter(db, M, { party: [{ ...P }, { ...P }], beforeEnter: async () => {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [H.UIDS[0]]);
    const r = await H.one(db, 'select public.hr_hunt_preset_save(0, $1, $2, gen_random_uuid())', [SEED.preset, SEED.presetName]);
    if (!r || r.ok !== true) throw new Error('S2 seed refused: the setup save in town -> ' + JSON.stringify(r));
    /* Tamsin's cellar task, taken at her board in town (2026-12-23-tally-tasks.sql): the settles count its rats. */
    const tt = await H.one(db, "select public.hr_tally_accept(0, 'cellar_giant_rats', 'light', gen_random_uuid())");
    if (!tt || tt.ok !== true) throw new Error('S2 seed refused: the tally take in town -> ' + JSON.stringify(tt));
    /* The First target on the Cellar (2027-04-22-target-kind.sql), named in town: the Giant Rat (the fixture ground's rows: rats and a wolf). */
    const fk = await H.one(db, "select public.hr_hunt_target_kind_set(0, 'mill_cellar', 'rat', gen_random_uuid())");
    if (!fk || fk.ok !== true) throw new Error('S2 seed refused: the First target in town -> ' + JSON.stringify(fk));
  } });
  /* Monsters are units only mid-pull: sample the pose after every tick so the monster path is proven. */
  const poses = [];
  for (const t of H.ticksOf(30000, 6 * 60000)(h.from)) {
    await H.settleTo(db, M, t);
    poses.push(await H.one(db, 'select public.hr_hunt_section_view($1::uuid, 0)', [H.UIDS[0]]));
  }
  await seedS2(db, M, H);
  /* LIVE EVENTS (1043-hearthrise.sql): the XP switch on for everyone and the Hearthrise's window holding now (inside this test's
     transaction only), so the section lists it and the fire is projected; set AFTER the settle above, so no settle number moves. */
  await db.query("update public.hr_feature_switches set scope = 'everyone', updated_at = now() where switch_id = 'event_xp_bonus'");
  /* SCALED HUNTS (2027-03-21-scaled-hunts.sql): the switch on for everyone, so the section is projected (off, it is null) */
  await db.query("update public.hr_feature_switches set scope = 'everyone', updated_at = now() where switch_id = 'scaled_hunts'");
  await db.query("update public.hr_live_events set first_at = now() - interval '1 hour', every_days = null where event_id = 'hearthrise'");
  /* THE FACTIONS (2027-04-23-faction-section.sql): their switch on for everyone, inside this test's transaction only. */
  await db.query("update public.hr_feature_switches set scope = 'everyone', updated_at = now() where switch_id = 'factions'");
  /* THE BURNING TOWER (2027-04-28-tower-section.sql) and THE KEY RING (2027-04-27-tower-chest.sql), whose section rides the Tower's switch:
     on for everyone, inside this test's transaction only. */
  await db.query("update public.hr_feature_switches set scope = 'everyone', updated_at = now() where switch_id = 'burning_tower'");
  /* THE UNMARKED CATACOMBS (2027-05-08-catacombs.sql): the descent's switch, on for everyone inside this test's transaction only */
  await db.query("update public.hr_feature_switches set scope = 'everyone', updated_at = now() where switch_id = 'unmarked_catacombs'");
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
  /* (food_pct / drink_pct are no reader's since the eat-at / drink-at options retired: the discipline is) */
  ['hunt_settings', 'public.hr_hunt_settings_view(uuid,integer)', "'discipline', v_disc,", "'disc', v_disc,"],
  ['hunt_settings', 'public.hr_hunt_settings_view(uuid,integer)', "'slots', v_slots,", "'slot_list', v_slots,"],
  ['hunt_tier', 'public.hr_hunt_tier_view(uuid,integer)', "'playing', (select i.tier", "'playing_now', (select i.tier"],
  ['hunt_target_kind', 'public.hr_hunt_target_kind_view(uuid,integer)', "'picks', coalesce(", "'pick', coalesce("],
  ['boss_halls', 'public.hr_boss_halls_view(uuid,integer)', "'taken', v_taken,", "'took', v_taken,"],
  ['boss_halls', 'public.hr_boss_halls_view(uuid,integer)', "'left', v_left));", "'remaining', v_left));"],
  ['entry_gates', 'public.hr_entry_gates_view(uuid,integer)', "v_tower := jsonb_build_object('need', v_need,", "v_tower := jsonb_build_object('needs', v_need,"],
  ['entry_gates', 'public.hr_entry_gates_view(uuid,integer)', "'need', c.wins, 'have', v_have,", "'need', c.wins, 'count', v_have,"],
  ['party', 'public.hr_hunt_party_view(uuid,integer)', "'leader_tiers', coalesce", "'leader_tier', coalesce"],
  ['party', 'public.hr_hunt_party_view(uuid,integer)', "'leave_together', public.hr_party_leave_together_of(", "'leave_togther', public.hr_party_leave_together_of("],
  ['hunt_settings', 'public.hr_hunt_settings_view(uuid,integer)', "'gather_share', v_eff->'gather_share',", "'gather', v_eff->'gather_share',"],
  ['hunt_analyzer', 'public.hr_hunt_analyzer_of(uuid,integer,uuid)', "'hunt_ms', floor(", "'huntms', floor("],
  ['hunt_analyzer', 'public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)', "'kills', v_kills", "'kill_count', v_kills"],
  ['premium', 'public.hr_premium_view(uuid,integer)', "'active'", "'is_active'"],
  ['account', 'public.hr_account_view(uuid,integer)', "'max_concurrent'", "'max'"],
  /* (RETIRED 2026-11-21, FB-5, run 44959863591: the 'cost_gold' and 'hero_slot_offer' renames. No client reader is left: account-session.js
     slotOffer went with the slot buy, and no src/ file names either key. 1036-four-starter-slots.sql makes every slot a starter, so the view never
     builds a priced offer for cost_gold to sit in. That the server offers nothing stays guarded where it is the subject: hero-slot-buy.mjs HS-OWN
     reads hero_slot_offer === null strictly, so a renamed key, undefined there, is red: its mutant "the account view renames its slot offer"
     plants exactly this rename.) */
  // lane S2
  ['name', 'public.hr_character_name_view(uuid,integer)', 'select to_jsonb(public.hr_character_name(p_user, p_slot))', 'select to_jsonb(null::text)'],
  ['bag_rules', 'public.hr_bag_rules_view(uuid,integer)', "'loot', coalesce(", "'loot_rules', coalesce("],
  ['shop', 'public.hr_shop_view(uuid,integer)', "'offers', coalesce(", "'offer_list', coalesce("],
  ['hunt_presets', 'public.hr_hunt_presets_view(uuid,integer)', "'action_set', p.action_set,", "'set', p.action_set,"],
  ['role', 'public.hr_role_view(uuid,integer)', "'weapon', w.weapon_type)", "'weapon_type', w.weapon_type)"],
  ['setup_slots', 'public.hr_setup_slots_view(uuid,integer)', "jsonb_build_object('count', least(r.free + b.n,", "jsonb_build_object('slots', least(r.free + b.n,"],
  ['titles', 'public.hr_titles_view(uuid,integer)', "'rows', coalesce(jsonb_agg(", "'list', coalesce(jsonb_agg("],
  ['titles', 'public.hr_titles_view(uuid,integer)', "'have', public.hr_title_kills(", "'count', public.hr_title_kills("],
  ['party_invites', 'public.hr_party_invites_view(uuid,integer)', "'from', public.hr_character_name(", "'sender', public.hr_character_name("],
  ['party_notices', 'public.hr_party_notices_view(uuid,integer)', "'who', left(public.hr_character_name(", "'actor', left(public.hr_character_name("],
  ['stamina_refill', 'public.hr_stamina_refill_quote(uuid,integer)', "'restore_ms', v_min * 60000,", "'restore', v_min * 60000,"],
  ['blessings', 'public.hr_blessings_view(uuid,integer)', "'tiers', coalesce(", "'tier_list', coalesce("],
  ['character_sheet', 'public.hr_character_sheet_view(uuid,integer)', "'slain', (select", "'killed', (select"],
  ['character_sheet', 'public.hr_character_sheet_view(uuid,integer)', "'combat', case when v_fresh", "'sheet', case when v_fresh"],
  ['character_sheet', 'public.hr_character_sheet_inputs(uuid,integer)', "'buffs', coalesce((select", "'buffs', clock_timestamp()::text, 'b', coalesce((select"],
  ['outfit', 'public.hr_outfit_view(uuid,integer)', "'owned', to_jsonb(v_owned)", "'have', to_jsonb(v_owned)"],
  ['death_log', 'public.hr_death_log_view(uuid,integer)', "'monster', nullif(", "'killer', nullif("],
  ['hunt_bests', 'public.hr_hunt_bests_view(uuid,integer)', "jsonb_build_object('xp_h', b.xp_h,", "jsonb_build_object('xph', b.xp_h,"],
  ['hunt_bests', 'public.hr_hunt_bests_view(uuid,integer)', "'min_ms', (extract(", "'minms', (extract("],  ['depot', 'public.hr_depot_view(uuid,integer)', "'cap', public.hr_depot_cap(p_user),", "'capacity', public.hr_depot_cap(p_user),"],
  ['home', 'public.hr_home_view(uuid,integer)', "'rooms', coalesce((select jsonb_agg(", "'room_list', coalesce((select jsonb_agg("],
  ['now', 'public.hr_state_of(uuid,integer)', "'now', now(),", "'stamp', now(),"],
  ['rename', 'public.hr_hero_rename_quote(uuid,integer)', "'price', r.base + r.per_level * v_lv,", "'cost', r.base + r.per_level * v_lv,"],
  ['tally', 'public.hr_tally_section(uuid,integer)', "'per_day', cfg.paid_per_day,", "'perday', cfg.paid_per_day,"],
  ['tally', 'public.hr_tally_count(uuid,integer,uuid,jsonb)', "coalesce((p_meta->'km'->>v_r.monster_id)::bigint, 0)", '0::bigint'],
  ['skill_inputs', 'public.hr_skill_inputs_view(uuid,integer)', "jsonb_build_object('from', jsonb_build_array('bag', 'storage'))", "jsonb_build_object('sources', jsonb_build_array('bag', 'storage'))"],
  ['bench_tax', 'public.hr_bench_tax_view(uuid,integer)', "'carry_mg', v_st.carry,", "'carry', v_st.carry,"],
  /* lane/d-rivets-learn: a gated bench opens off this key (src/session/bench-sections.js learnedRecipesOf) */
  ['unlocked_recipes', 'public.hr_state_of(uuid,integer)', "'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot),", "'unlockedRecipes', public.hr_recipes_of(p_user, v_st.slot),"],
  ['temper', 'public.hr_temper_view(uuid,integer)', "'rung', coalesce(pp.value, 0),", "'level', coalesce(pp.value, 0),"],
  ['hallmark', 'public.hr_hallmark_view(uuid,integer)', "'per_day', v_limit);", "'perday', v_limit);"],
  ['features', 'public.hr_features_view(uuid,integer)', 'jsonb_agg(f.switch_id order by f.switch_id)', "jsonb_agg(jsonb_build_object('id', f.switch_id) order by f.switch_id)"],
  /* lane/c-level-from-server: the client reads the Level from the server's block and nowhere else, so each of its fields is contract */
  ['level', 'public.hr_level_block(bigint)', "jsonb_build_object('xp', x, 'level', lv,", "jsonb_build_object('xp', x, 'lv', lv,"],
  ['level', 'public.hr_level_block(bigint)', "'into', x - public.hr_char_xp_for_level(lv),", "'in_to', x - public.hr_char_xp_for_level(lv),"],
  ['level', 'public.hr_state_of(uuid,integer)', "'level', public.hr_level_block(v_st.level_xp),", "'level_block', public.hr_level_block(v_st.level_xp),"],
  /* lane/c-skills-from-server: the skill ledgers draw each field of hr_skill_block and nothing of their own */
  ['skill_levels', 'public.hr_skill_block(text,bigint)', "jsonb_build_object('xp', x, 'level', lv, 'into', x - lo,", "jsonb_build_object('xp', x, 'lv', lv, 'into', x - lo,"],
  ['skill_levels', 'public.hr_skill_block(text,bigint)', "'into', x - lo, 'need',", "'in_to', x - lo, 'need',"],
  ['skill_levels', 'public.hr_skill_block(text,bigint)', "'need', public.hr_skill_xp_for_level(p_skill, lv + 1) - lo);", "'needs', public.hr_skill_xp_for_level(p_skill, lv + 1) - lo);"],
  /* lane/b-live-events-client: the plate and the Hunts lines read each event's window and dial from the section */
  ['live_events', 'public.hr_live_events_view(uuid,integer)', "'starts', x.starts,", "'start', x.starts,"],
  ['live_events', 'public.hr_live_events_view(uuid,integer)', "'pm', case when x.sized_by = 'fire' then coalesce(x.lit_pm, v_proj) else x.pm end,", "'permille', case when x.sized_by = 'fire' then coalesce(x.lit_pm, v_proj) else x.pm end,"],
  /* lane/c-social: the Hearth tab reads the fire's marks and the fuel to the next one; the Friends window reads quiet presence */
  ['hearth_fire', 'public.hr_hearth_fire_view(uuid,integer)', "'fuel', f.fuel, 'goal', f.goal, 'need', v_need,", "'fuel', f.fuel, 'goal', f.goal, 'needed', v_need,"],
  ['presence', 'public.hr_presence_view(uuid,integer)', "select jsonb_build_object('quiet',", "select jsonb_build_object('is_quiet',"],
  /* lane/c-combat-training: the Training window prices each hour from the quote and the House the next unlock from the dummy */
  ['training', 'public.hr_training_section(uuid,integer)', "'fee_h', public.hr_training_fee(q.lv),", "'fee', public.hr_training_fee(q.lv),"],
  ['training', 'public.hr_training_section(uuid,integer)', "'ladder', coalesce(to_jsonb(", "'prices', coalesce(to_jsonb("],
  /* audit F26: the Hunts page reads each scalable ground's row and the slider's clamps from the section */
  ['scaled_hunts', 'public.hr_scaled_hunts_view(uuid,integer)', "'level', x.lv, 'from_level', g.top + 1,", "'level', x.lv, 'from', g.top + 1,"],
  ['scaled_hunts', 'public.hr_scaled_hunts_view(uuid,integer)', "'min_hours', r.min_hours, 'max_hours', r.max_hours,", "'min_hours', r.min_hours, 'hours_max', r.max_hours,"],
  /* lane/b-faction-ui: the Faction tab reads each piece's need and the swap's need */
  ['factions', 'public.hr_faction_view(uuid,integer)', "'need_ms', o.need_ms,", "'need', o.need_ms,"],
  ['factions', 'public.hr_faction_section(uuid,integer)', "jsonb_build_object('swap_need_ms', r.swap_ms,", "jsonb_build_object('swap_ms', r.swap_ms,"],
  /* lane/b-tower-window: the Tower window lists the server's start floors and says each key's chance from the chest's menu */
  ['tower', 'public.hr_tower_section(uuid,integer)', "'checkpoints', to_jsonb(public.hr_mode_checkpoints(m.mode_id, v_rec)),", "'start_floors', to_jsonb(public.hr_mode_checkpoints(m.mode_id, v_rec)),"],
  ['tower', 'public.hr_tower_section(uuid,integer)', "'floor_limit_ms', r.floor_limit_ms,", "'floor_ms', r.floor_limit_ms,"],
  ['tower', 'public.hr_chest_section(uuid,integer)', "'chance_ppm', public.hr_chest_chance_ppm(", "'chance', public.hr_chest_chance_ppm("],
  /* lane/b-catacombs-client: the Catacombs tab lists each wing's own vault doors and steps the doors by the server's rule */
  ['catacomb', 'public.hr_catacomb_section(uuid,integer)', "'checkpoints', to_jsonb(public.hr_mode_checkpoints(m.mode_id, public.hr_run_record(p_user, p_slot, r.hunt_id))),", "'doors', to_jsonb(public.hr_mode_checkpoints(m.mode_id, public.hr_run_record(p_user, p_slot, r.hunt_id))),"],
  ['catacomb', 'public.hr_catacomb_section(uuid,integer)', "'door_every', w0.landing_every,", "'landing_every', w0.landing_every,"],
  /* lane/c-hunt-itinerary: the hunt page's control and the analyzer's line read the grace and the running hunt's own choice */
  ['hunt_after', 'public.hr_hunt_after_section(uuid,integer)', "'grace_s', v_grace,", "'grace', v_grace,"],
  ['hunt_after', 'public.hr_hunt_after_section(uuid,integer)', "'job', public.hr_hunt_after_job(p_user, p_slot), 'now', v_now,", "'job', public.hr_hunt_after_job(p_user, p_slot), 'running', v_now,"],
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
