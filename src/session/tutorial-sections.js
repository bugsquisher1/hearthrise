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
//   roster      [{ slot, level, name, open, hunting }]  the account's heroes (AccountSession.roster rows, `open`: a
//                                CharacterSession is playing it, `hunting`: its own huntOf is open)
//   slotsOwned  number           the hero slots the account owns (the roster's length)
//   playLimit   number           how many heroes may play at once (AccountSession.limit(), the server's)
//   sellable    number           the stacks Sell all loot would sell now (src/shell/bag-model.js lootToSell, priced
//                                and unlocked through sellPlan)
//   upgrades    string[]         what Equip upgrades would put on (src/shell/upgrade-plan.js)
// ════════════════════════════════════════════════════════════════════════
import { currentCard, cardFor, nextGoal, ROLE_SKILL } from '../data/hunt-tutorial.js?v=0.2.54';
import { levelOf, heroVitalsOf, deathLogOf } from './character-sections.js?v=0.2.54';
import { huntOf, settingsOf, huntBestsOf, analyzerOf, staminaOf } from './hunt-sections.js?v=0.2.54';
import { skillsOf, carriedOf, bagOf, bagCapOf, bankOf, rulesOf, equipmentOf, blessingsOf, presetsOf, nameOf, goldOf } from './item-sections.js?v=0.2.54';
import { farmFieldOf } from './farm-sections.js?v=0.2.54';
import { homeOf } from './home-sections.js?v=0.2.54';
import { tallyOf } from './tally-sections.js?v=0.2.54';
import { partyMembershipOf } from './party-sections.js?v=0.2.54';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const qtyMap = (rows) => (Array.isArray(rows) ? Object.fromEntries(rows.map((r) => [r.id, r.qty])) : null);

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
  const roster = Array.isArray(o.roster) ? o.roster.slice(0, 8).filter((h) => isObj(h) && Number.isInteger(h.slot))
    .map((h) => ({ slot: h.slot, level: Number.isInteger(h.level) ? h.level : null, name: typeof h.name === 'string' ? h.name.slice(0, 40) : null,
      open: h.open === true, hunting: typeof h.hunting === 'boolean' ? h.hunting : null })) : null;
  return {
    read: read ? new Set(Array.from(read).filter((id) => typeof id === 'string' && ID.test(id))) : null,
    roster, slotsOwned: nat(o.slotsOwned), playLimit: nat(o.playLimit), sellable: nat(o.sellable),
    upgrades: Array.isArray(o.upgrades) ? o.upgrades.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 14) : null,
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

/* The house's next tier to buy, the server's prices: { owned, next: { name, gold, items } | null }, or null. */
function homeFacts(cs) {
  const h = homeOf(cs);
  if (!h) return null;
  const next = h.tiers.find((t) => !t.owned && t.tier > h.tier) || null;
  return { owned: h.tier > 0 || h.tiers.some((t) => t.owned), next: next ? { name: next.name, gold: next.gold, items: next.items } : null };
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
  /* Where the server has seen this hero hunt (#58): its latest session, ended too (the hunt section keeps
     it until the next hunt), and every ground it holds a personal best on. Never "where it is now" alone. */
  const visited = new Set(Object.keys((bests || {}).grounds || {}));
  if (h && h.huntId) visited.add(h.huntId);
  return {
    levelXp: lv.xp, charLevel: lv.level, self: Number.isInteger(cs && cs.slot) ? cs.slot : null, name: nameOf(cs),
    skillLevel: sk ? Math.max(1, ...Object.values(sk).map((r) => r.level)) : 1,
    skillXp: sk ? Object.fromEntries(Object.entries(sk).map(([k, r]) => [k, r.xp])) : null,
    huntId: open ? open.huntId : null,
    endReason: h && h.ended ? h.endReason : null,
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
    blessings: blessFacts(cs), death: deathFacts(cs),
    /* this hunt's supplies, as the analyzer counts them (none once it ended: the hunt the card speaks of is over) */
    supplies: an && !an.ended && open ? an.hero.supplies : null, huntMs: an && open ? an.sessionMs : null,
    hpMax: heroVitalsOf(cs).hpMax,
    presets: presets ? presets.length : null,
    landPlanted: field ? field.plots.size > 0 : null, land: field ? { ready } : null,
    home: homeFacts(cs), gold: goldOf(cs),
    staminaMs: stamina ? stamina.msLeft : null,
    tally: tally ? { held: tally.held.length, paid: tally.recent.length, weight: !!tally.weight } : null,
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
    defenseXp: sk && sk.defense ? sk.defense.xp : null, land: landOf(cs), inParty: f.inParty });
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
