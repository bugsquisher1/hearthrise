// ════════════════════════════════════════════════════════════════════════
// src/session/tutorial-sections.js — THE TUTORIAL CARD A CHARACTER IS ON.
//
// PURE. The card is read from what the server projects (Level XP, skills, the
// open hunt and its units, the hunts it has been in, the bar it shows and the bar
// it stored, the shared land, Tamsin's tally, the party), never from a client
// counter, so it is the same after a reload, on another device, and while the
// browser was closed (CLAUDE.md §6). The rules live in src/data/hunt-tutorial.js
// currentCard; the words of a card that names a bar slot come from the bar the
// server shows (cardFor), so "slot 4" is the slot that holds the food.
// ════════════════════════════════════════════════════════════════════════
import { currentCard, cardFor, nextGoal, ROLE_SKILL } from '../data/hunt-tutorial.js?v=0.2.45';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.45';
import { levelOf } from './character-sections.js?v=0.2.45';
import { huntOf, settingsOf, huntBestsOf } from './hunt-sections.js?v=0.2.45';
import { skillsOf } from './item-sections.js?v=0.2.45';
import { farmFieldOf } from './farm-sections.js?v=0.2.45';
import { tallyOf } from './tally-sections.js?v=0.2.45';
import { partyMembershipOf } from './party-sections.js?v=0.2.45';

/* A stored slot that EATS (a food consumable) on a condition the player saved: what "Tell your hero when" asks for. */
const eatsWhen = (s) => !!s && !!s.action && s.action.type === 'consume' && !!CONSUMABLES[s.action.id]
  && CONSUMABLES[s.action.id].kind === 'food' && Array.isArray(s.conditions) && s.conditions.length > 0;

/** The facts currentCard judges, or null until the server has told the Level XP. */
function tutorialFactsOf(cs) {
  const lv = levelOf(cs);
  if (!lv) return null;
  const h = huntOf(cs);
  const open = h && !h.ended ? h : null;
  const sk = skillsOf(cs);
  const st = settingsOf(cs);
  const field = farmFieldOf(cs);
  const tally = tallyOf(cs);
  const party = partyMembershipOf(cs);
  /* Where the server has seen this hero hunt (#58): its latest session, ended too (the hunt section keeps
     it until the next hunt), and every ground it holds a personal best on. Never "where it is now" alone. */
  const visited = new Set(Object.keys((huntBestsOf(cs) || {}).grounds || {}));
  if (h && h.huntId) visited.add(h.huntId);
  return {
    levelXp: lv.xp, charLevel: lv.level,
    skillLevel: sk ? Math.max(1, ...Object.values(sk).map((r) => r.level)) : 1,
    skillXp: sk ? Object.fromEntries(Object.entries(sk).map(([k, r]) => [k, r.xp])) : null,
    huntId: open ? open.huntId : null,
    visited,
    unitKinds: new Set(open ? Array.from(open.units.values()).filter((u) => u.side === 'monster' && u.kind).map((u) => u.kind) : []),
    /* The player SAVED a food slot with a condition: the stored bar (the start kit's bar is only shown until then). */
    foodSet: !!st && st.storedBar.some(eatsWhen),
    /* The bar the server shows, slot by slot: where the card's food sits (v0.2.42 put the role's spells first). */
    bar: st ? st.slots.map((s) => (s && !s.empty ? s.action : null)) : null,
    landPlanted: field ? field.plots.size > 0 : null,
    tally: tally ? { held: tally.held.length, paid: tally.recent.length, weight: !!tally.weight } : null,
    inParty: !!party && party.seats.length >= 2,
  };
}

/** The pointer line: the tutorial card this character is on while the guide runs (null until the server has
 *  said), its slot words read from the server's bar, then the "What next" goal (src/data/hunt-tutorial.js
 *  nextGoal: the next ground by Level and the weapon skill's next unlock), or null until the server has said. */
export function pointerCardOf(cs) {
  const f = tutorialFactsOf(cs);
  if (!f) return null;
  const card = currentCard(f);
  if (card) return cardFor(card, f.bar);
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
