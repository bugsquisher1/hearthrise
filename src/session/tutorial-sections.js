// ════════════════════════════════════════════════════════════════════════
// src/session/tutorial-sections.js — THE TUTORIAL CARD A CHARACTER IS ON.
//
// PURE. The card is read from what the server projects (Level XP, skills, the open hunt and its units, the hunts it
// has been in, the bar it shows, the bar it stored and what it struck, the bag and the hunt bag, the loot rules, the
// Blessings, the death log, the hunt analyzer's supplies, the saved setups, the worn set, the shared land, the house,
// Tamsin's tally, the party), never from a client counter, so it is the same after a reload, on another device, and
// while the browser was closed (CLAUDE.md §6). The rules live in src/data/hunt-tutorial.js currentCard; the words
// come from the same facts (cardFor), so "slot 4" is the slot that holds the food and "14 gp" the server's price.
//
// THE SHELL'S FACTS (the lane 1 / lane 2 interface, PRIORITY_BOARD "Tutorial polish walkthrough (2026-10-25)" §4):
// what only the shell knows or computes with its own rule, passed as pointerCardOf's second argument so a card and
// the button it points at use ONE function. Each is optional; absent = unknown, and the card that needs it is passed by.
//   read        string[] | Set   the card ids the player pressed Got it on or has read (residue `coach.read`,
//                                display state); absent = this client records no read yet
//   hid         string[] | Set   the cards a server fact finishes that the player pressed Got it on (residue `coach.hid`):
//                                passed by, so the next card shows (hunt-tutorial.js currentCard)
//   roster      [{ slot, level, name, open, hunting }]  the account's heroes (AccountSession.roster rows, `open`: a
//                                CharacterSession is playing it, `hunting`: its own huntOf is open)
//   slotsOwned  number           the hero slots the account owns (the roster's length)
//   playLimit   number           how many heroes may play at once (AccountSession.limit(), the server's)
//   sellable    number           the stacks Sell all loot would sell now (src/shell/bag-model.js lootToSell, priced
//                                and unlocked through sellPlan)
//   upgrades    string[]         what Equip upgrades would put on (src/shell/upgrade-plan.js)
//   back        string           the hunt the player came back to after an absence (residue `coach.back`, away-recap.js)
//   slotCost    number           the next hero slot's price (AccountSession.slotOffer, the server's), absent when none is for sale
// ════════════════════════════════════════════════════════════════════════
import { currentCard, cardFor, nextGoal, ROLE_SKILL } from '../data/hunt-tutorial.js?v=0.2.140';
import { levelOf, heroVitalsOf, deathLogOf } from './character-sections.js?v=0.2.140';
import { huntOf, settingsOf, huntBestsOf, analyzerOf, staminaOf, groundsSeenOf, huntTierOf, sessionModeOfHunt } from './hunt-sections.js?v=0.2.140';
import { skillsOf, carriedOf, bagOf, bagCapOf, bankOf, rulesOf, equipmentOf, blessingsOf, presetsOf, nameOf, goldOf, staminaRefillOf } from './item-sections.js?v=0.2.140';
import { farmFieldOf } from './farm-sections.js?v=0.2.140';
import { homeOf, chestsOf } from './home-sections.js?v=0.2.140';
import { tallyOf } from './tally-sections.js?v=0.2.140';
import { temperFirstRungOf } from './temper-sections.js?v=0.2.140';
import { partyMembershipOf } from './party-sections.js?v=0.2.140';
import { trainingOf, quoteFor } from './training-sections.js?v=0.2.140';
import { wearsArmour } from '../core/vitals.js?v=0.2.140';
import { ITEMS } from '../data/items.js?v=0.2.140';
import { ARMOUR_WEIGHT, ARMOUR_SLOTS } from '../data/core-model.js?v=0.2.140';
import { DEFAULT_TIER } from '../data/hunt-tiers.js?v=0.2.140';
import { towerOf } from './tower-sections.js?v=0.2.140';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.140';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const qtyMap = (rows) => (Array.isArray(rows) ? Object.fromEntries(rows.map((r) => [r.id, r.qty])) : null);
/* The bench skills are the catalogue's `artisan` rows, the list hr_market_eligible reads (hr_skills.cat): the best one's level as the
   server sent it, or null when it sent none. */
const BENCH = Object.keys(SKILLS_DEF).filter((id) => SKILLS_DEF[id].cat === 'artisan');
const benchLevelOf = (sk) => { const lv = sk ? BENCH.filter((id) => sk[id]).map((id) => sk[id].level) : []; return lv.length ? Math.max(...lv) : null; };

/* A slot as the coach reads it: the server's action, conditions and struck state ({ type, id, store, conditions,
   enabled, usable, count }), or null for an empty slot. */
const shownSlot = (s) => (s && !s.empty ? { type: s.action.type, id: s.action.id, store: s.action.store || null, conditions: s.conditions,
  enabled: s.enabled !== false, usable: s.usable !== false, count: Number.isInteger(s.count) ? s.count : null } : null);
/* A STORED slot (the wire shape the player saved) as the coach reads it, or null. */
const storedSlot = (s) => (isObj(s) && isObj(s.action) && typeof s.action.id === 'string'
  ? { type: s.action.type, id: s.action.id, conditions: Array.isArray(s.conditions) ? s.conditions.filter(isObj) : [] } : null);

/* The shell's facts, bounded: what the coach may read of them. */
function shellFacts(sh) {
  const o = isObj(sh) ? sh : {};
  const read = o.read instanceof Set ? o.read : Array.isArray(o.read) ? new Set(o.read) : null;
  const hid = o.hid instanceof Set ? o.hid : Array.isArray(o.hid) ? new Set(o.hid) : null;
  const roster = Array.isArray(o.roster) ? o.roster.slice(0, 8).filter((h) => isObj(h) && Number.isInteger(h.slot))
    .map((h) => ({ slot: h.slot, level: Number.isInteger(h.level) ? h.level : null, name: typeof h.name === 'string' ? h.name.slice(0, 40) : null,
      open: h.open === true, hunting: typeof h.hunting === 'boolean' ? h.hunting : null })) : null;
  return {
    read: read ? new Set(Array.from(read).filter((id) => typeof id === 'string' && ID.test(id))) : null,
    hid: hid ? new Set(Array.from(hid).filter((id) => typeof id === 'string' && ID.test(id))) : null,
    roster, slotsOwned: nat(o.slotsOwned), playLimit: nat(o.playLimit), sellable: nat(o.sellable),
    upgrades: Array.isArray(o.upgrades) ? o.upgrades.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 14) : null,
    back: typeof o.back === 'string' ? o.back : null, slotCost: nat(o.slotCost),
  };
}

/* The Blessings as the coach reads them: held, of (tiers), the free limit, the best protection (permille) and the
   price of each tier not held, all the server's (hr_blessing_view); null when it has not said. */
function blessFacts(cs) {
  const b = blessingsOf(cs);
  if (!b || !b.tiers.length) return null;
  return { held: b.tiers.filter((t) => t.held).length, of: b.tiers.length, freeUntil: b.freeUntil,
    best: Math.max(...b.tiers.map((t) => t.permille)), prices: b.tiers.filter((t) => !t.held).map((t) => t.price) };
}

/* The newest death, as the death popup reads it: Level XP lost and what a Blessing kept ({ level } or null). */
function deathFacts(cs) {
  const d = (deathLogOf(cs) || [])[0];
  if (!d) return null;
  return { xp: nat(d.xpLost.level) ?? 0, saved: d.saved ? { level: nat(d.saved.level) ?? 0 } : null };
}

/* The Tower's best floor while the server sends its section, else null (not offered). */
function towerFact(cs) {
  const tw = towerOf(cs);
  return tw ? tw.bestFloor : null;
}

/* The house's next tier to buy, the server's prices: { owned, next: { name, gold, items } | null }, or null. */
function homeFacts(cs) {
  const h = homeOf(cs);
  if (!h) return null;
  const next = h.tiers.find((t) => !t.owned && t.tier > h.tier) || null;
  return { owned: h.tier > 0 || h.tiers.some((t) => t.owned), next: next ? { name: next.name, gold: next.gold, items: next.items } : null };
}

/* The next storage chest the server says can be built now, or null: { name, gold, items }. */
function chestFact(cs) {
  const c = chestsOf(cs);
  const n = c && c.next && c.next.canBuild ? c.next : null;
  return n ? { name: n.name, gold: n.gold, items: n.items } : null;
}

/* Has this hero hunted on a harder tier (the coach's first Dangerous run)? A pick on any ground (hunt_tier.picks: the server keeps only the
   harder ones), the tier its running hunt froze, or the one its latest hunt ended on (hr_hunt_view `tier`). Null until the server sends hunt_tier. */
function tierTakenOf(cs, h) {
  const tiers = huntTierOf(cs);
  if (!tiers) return null;
  const hard = (x) => !!x && x !== DEFAULT_TIER;
  return Object.values(tiers.picks).some(hard) || hard(tiers.playing) || hard(h && h.tier);
}

/**
 * The facts currentCard judges, or null until the server has told the Level XP. `sh`: the shell's facts (above).
 * Exported for the walk-through tests, which build the facts from a real envelope.
 */
export function tutorialFactsOf(cs, sh) {
  const lv = levelOf(cs);
  if (!lv) return null;
  const h = huntOf(cs);
  const open = h && !h.ended ? h : null;
  const sk = skillsOf(cs);
  const st = settingsOf(cs);
  const field = farmFieldOf(cs);
  const tally = tallyOf(cs);
  const party = partyMembershipOf(cs);
  const bests = huntBestsOf(cs);
  const an = analyzerOf(cs);
  const stamina = staminaOf(cs);
  const bag = bagOf(cs);
  const bank = bankOf(cs);
  const rules = rulesOf(cs);
  const eq = equipmentOf(cs);
  const presets = presetsOf(cs);
  const ready = {};
  if (field) for (const p of field.plots.values()) if (p.ready) ready[p.crop] = (ready[p.crop] || 0) + 1;
  /* Where the server has seen this hero hunt (#58): hunt-sections.js groundsSeenOf, the Chronicle's answer too. */
  const visited = groundsSeenOf(cs);
  return {
    levelXp: lv.xp, charLevel: lv.level, self: Number.isInteger(cs && cs.slot) ? cs.slot : null, name: nameOf(cs),
    skillLevel: sk ? Math.max(1, ...Object.values(sk).map((r) => r.level)) : 1,
    benchLevel: benchLevelOf(sk),
    skillXp: sk ? Object.fromEntries(Object.entries(sk).map(([k, r]) => [k, r.xp])) : null,
    huntId: open ? open.huntId : null, sessionId: open ? open.sessionId : null,
    endReason: h && h.ended ? h.endReason : null,
    /* the ended hunt's mode takes nothing for a death (the Tower: session-modes.js deathLossPm 0), so no Blessing card speaks of it */
    freeDeath: h && h.ended ? sessionModeOfHunt(h.huntId).deathLossPm === 0 : null,
    /* the Burning Tower's best floor while the server offers the Tower (its section, the burning_tower switch), else null */
    towerBest: towerFact(cs),
    visited,
    unitKinds: new Set(open ? Array.from(open.units.values()).filter((u) => u.side === 'monster' && u.kind).map((u) => u.kind) : []),
    /* THE BAR: what the server SHOWS (the start kit's until one is stored; v0.2.42 put the role's spells first) and
       what the player STORED. Any Save restates the whole bar, so a stored fact is about what a slot now says. */
    slots: st ? st.slots.map(shownSlot) : null,
    stored: st ? st.storedBar.map(storedSlot) : null,
    discipline: st ? st.discipline : null, role: st ? st.role : null, stance: st ? st.stance : null,
    store: st ? st.store : null,
    carried: qtyMap(carriedOf(cs)), bag: qtyMap(bag), stacks: bag ? bag.length : null, bagCap: bagCapOf(cs),
    bankStacks: bank ? bank.length : null,
    lootRules: rules ? rules.loot : null,
    weapon: eq ? eq.weapon || null : undefined,
    ammo: eq ? eq.ammo || null : undefined,
    /* wears armor or a shield, so Defense trains (the engine's own test over the server's worn set) */
    armoured: eq ? wearsArmour(eq, ITEMS) : undefined,
    /* the armor slots that wear a piece with an armor weight (the first Dangerous run's DANGER_KIT) */
    armourWorn: eq ? ARMOUR_SLOTS.filter((s) => !!eq[s] && !!ITEMS[eq[s]] && !!ARMOUR_WEIGHT[ITEMS[eq[s]].armourClass]) : null,
    /* the latest hunt, open or ended (the hunt section keeps it until the next), and whether the hero has hunted a harder tier */
    lastHunt: h && h.huntId ? h.huntId : null, tierTaken: tierTakenOf(cs, h),
    blessings: blessFacts(cs), death: deathFacts(cs),
    /* this hunt's supplies, as the analyzer counts them (none once it ended: the hunt the card speaks of is over) */
    supplies: an && !an.ended && open ? an.hero.supplies : null, huntMs: an && open ? an.sessionMs : null,
    hpMax: heroVitalsOf(cs).hpMax,
    presets: presets ? presets.length : null,
    /* `empty`: the field's open plots holding no crop (an extra plot past the cap is not open land) */
    landPlanted: field ? field.plots.size > 0 : null,
    land: field ? { ready, empty: Math.max(0, field.cap - Array.from(field.plots.values()).filter((p) => !p.extra && p.i < field.cap).length) } : null,
    home: homeFacts(cs), gold: goldOf(cs), chest: chestFact(cs),
    staminaMs: stamina ? stamina.msLeft : null,
    /* `tasks`: the held rows by task, each the server's count and whether it is done. `paidTasks`: the tasks she paid in the last day. */
    tally: tally ? { held: tally.held.length, paid: tally.recent.length, weight: !!tally.weight,
      tasks: Object.fromEntries(tally.held.map((h) => [h.task, { kills: h.kills, target: h.target, done: h.done }])),
      paidTasks: Array.from(new Set(tally.recent.map((p) => p.task))) } : null,
    temper: temperFirstRungOf(cs),
    inParty: !!party && party.seats.length >= 2,
    partied: !!bests && Object.values(bests.grounds).some((g) => !!g.party),
    ...shellFacts(sh),
  };
}

/** The pointer line: the tutorial card this character is on while the guide runs (null until the server has
 *  said), its words stated from the same facts, then the "What next" goal (src/data/hunt-tutorial.js nextGoal: the
 *  next ground by Level and the weapon skill's next unlock), or null until the server has said. `sh`: the shell's
 *  facts (header); without them every card that needs one is passed by. */
export function pointerCardOf(cs, sh) {
  const f = tutorialFactsOf(cs, sh);
  if (!f) return null;
  const card = currentCard(f);
  if (card) return cardFor(card, f);
  const role = (settingsOf(cs) || {}).role || null;
  const sk = skillsOf(cs);
  const skill = ROLE_SKILL[role];
  return nextGoal({ charLevel: f.charLevel, role, skillLevel: sk && skill && sk[skill] ? sk[skill].level : null,
    defenseXp: sk && sk.defense ? sk.defense.xp : null, land: landOf(cs), inParty: f.inParty,
    gold: f.gold, slotCost: f.slotCost, slotsOwned: f.slotsOwned, home: f.home,
    roster: f.roster, visited: f.visited, staminaMs: f.staminaMs, refill: staminaRefillOf(cs), tally: f.tally, temper: f.temper,
    training: trainingRunOf(cs) });
}

/* The running training session as the server's `training` section states it: its run's skill, and that skill's level and hours to the next
   (its quote), or null when none runs. */
function trainingRunOf(cs) {
  const tr = trainingOf(cs);
  if (!tr || !tr.run) return null;
  const q = quoteFor(tr, tr.run.skill);
  return { skill: tr.run.skill, level: q ? q.level : null, hoursToNext: q ? q.hoursToNext : null };
}

/* The ACCOUNT's field as the server last said (2026-12-14-shared-farm: one field for every hero, and any hero may
   harvest): how many plots hold a crop, and the READY plots per crop. Never this hero's Farming XP: a hero who has
   never planted, on land the others planted, does not have an empty farm. Null until the server has sent the field. */
function landOf(cs) {
  const field = farmFieldOf(cs);
  if (!field) return null;
  const ready = {};
  for (const p of field.plots.values()) if (p.ready) ready[p.crop] = (ready[p.crop] || 0) + 1;
  return { planted: field.plots.size, ready };
}
