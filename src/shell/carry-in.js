// ════════════════════════════════════════════════════════════════════════
// src/shell/carry-in.js — CARRY IN: WHAT THE BAG HOLDS THAT THIS HUNT CAN USE, AND THE PRESS THAT BRINGS IT.
//
// Tyler 2026-11-02 ("Yes, add a press"; Andy's report): a hunt spends only what
// it carries, then the store, so a supply that reached the bag after the hero set
// out waits there until it is carried in. PURE readers of the server's projection
// (the bag: item-sections.js bagOf; the hunt bag: hunt-sections.js huntBagOf),
// read again for every patch; nothing here gates a press (the server decides it).
//   carryRows(cs)          while this hero's hunt runs and is not on its way home:
//                          every hunt supply in the bag, [{ id, have, inHunt, max,
//                          named, wait }], what the bar names first, then the largest;
//                          null in town, on the way home, or with no bag read yet.
//                          `wait`: a shot above the hero's skill. The press still
//                          carries it (the units only move; the slot wakes at the level,
//                          designer 2026-11-03), and every line says it can't be shot yet
//   carryFor(cs, action)   the rows one bar action can use: its own item, or every
//                          tier of a rune spell's family
//   carryWords(row)        "Carry 40 into this hunt"
//   askCarry(ctx, body, sc, repaint, row, at)  "Carry how many?" (widgets/amount.js)
//                          beside the press, then ONE carry (src/session/carry-intents.js);
//                          its line is the server's answer, and every count on
//                          screen changes only from the re-read envelope
// ════════════════════════════════════════════════════════════════════════
import { bagOf, equipmentOf, skillsOf } from '../session/item-sections.js?v=0.2.98';
import { huntBagOf, settingsOf } from '../session/hunt-sections.js?v=0.2.98';
import { carryIntoHunt, CARRY_MAX } from '../session/carry-intents.js?v=0.2.98';
import { SUPPLIES } from '../data/supplies.js?v=0.2.98';
import { ABILITIES } from '../data/abilities.js?v=0.2.98';
import { ITEMS } from '../data/items.js?v=0.2.98';
import { shootsItem } from '../data/hunt-roles.js?v=0.2.98';
import { shortOf } from './item-lore.js?v=0.2.98';
import { openFloatMenu, closeFloatMenu } from './windows/float-menu.js?v=0.2.98';
import { amountHtml, amountOf, stepAmount } from './widgets/amount.js?v=0.2.98';
import { runIntent } from './intent-words.js?v=0.2.98';
import { itemName, familyCount } from './widgets/bits.js?v=0.2.98';
import { whole } from '../render/format.js?v=0.2.98';

/* The server's hunt is open and not on its way home: a session, not ended, no Leave or change pending. */
function running(cs) {
  const h = cs && typeof cs.read === 'function' ? cs.read('hunt') : null;
  const s = h && typeof h === 'object' && typeof h.session_id === 'string' && h.ended !== true ? h.session : null;
  return !!s && typeof s === 'object' && !s.ended_at && !s.leave_at && !s.change_at;
}

/* Does a bar action spend the item `id`: its own item (the "loaded" shot is the worn ammo, `worn`), or a rune of its
   spell's family? */
function spends(a, id, worn) {
  if (!a || !a.id) return false;
  if (a.type === 'consume') return a.id === id;
  if (a.type === 'attack_with_item') return (a.id === 'loaded' ? worn : a.id) === id;
  const r = a.type === 'ability' && ABILITIES[a.id] ? ABILITIES[a.id].rune : null;
  return !!r && familyCount(r, [{ id, qty: 1 }]) > 0;
}

/* The worn ammo (the server's equipment), which the bar's "loaded" shot spends. */
const wornOf = (cs) => (equipmentOf(cs) || {}).ammo || null;

/* The engine's rule for a shot under its skill (abilities.js shotLine: neither shot nor bought), in words, or null. Only a
   shot the worn weapon looses: a rune's version is its spell's (the server's `rune_level`), and food has no such gate. */
function waitOf(id, role, skills) {
  const need = shootsItem(role, ITEMS[id]) ? shortOf(id, skills, null) : null;
  return need ? need.text + ': it can’t be shot until then.' : null;
}

/** The bag's hunt supplies this running hunt could carry in, or null (see the header). */
export function carryRows(cs) {
  if (!running(cs)) return null;
  const bag = bagOf(cs);
  if (!bag) return null;
  const hunt = huntBagOf(cs) || [];
  const s = settingsOf(cs);
  const bar = s ? s.slots.filter((sl) => !sl.empty && sl.enabled !== false).map((sl) => sl.action) : [];
  const worn = wornOf(cs);
  const skills = skillsOf(cs);
  return bag.filter((r) => SUPPLIES[r.id] && r.qty > 0)
    .map((r) => ({ id: r.id, have: r.qty, inHunt: (hunt.find((x) => x.id === r.id) || {}).qty || 0,
      max: Math.min(r.qty, CARRY_MAX), named: bar.some((a) => spends(a, r.id, worn)), wait: s ? waitOf(r.id, s.role, skills) : null }))
    .sort((a, b) => Number(b.named) - Number(a.named) || b.have - a.have || (a.id < b.id ? -1 : 1));
}

/** The rows one bar action can use (its own item, the worn ammo for "loaded", every tier of a rune spell's family), [] when
    none, null as carryRows. */
export function carryFor(cs, action) {
  const rows = carryRows(cs);
  const worn = wornOf(cs);
  return rows ? rows.filter((r) => spends(action, r.id, worn)) : null;
}

/** The press's words for a row: "Carry 40 into this hunt". */
export function carryWords(row) {
  return 'Carry ' + whole(row.max) + ' into this hunt';
}

/** "Carry how many?" at `at` ({ x, y }), up to the stack the server last sent; its Carry sends ONE carry for the window
    `body` (its scratch `sc`: pending and the answer's line). */
export function askCarry(ctx, body, sc, repaint, row, at) {
  const cs = ctx.character;
  const name = itemName(row.id);
  openFloatMenu(ctx.doc, amountHtml({ title: 'Carry how many ' + name + ' into this hunt?', verb: 'Carry', max: row.max, value: row.max, act: 'amt-go' }), at, {
    label: 'Carry how many',
    onAct: (action) => {
      const menu = ctx.doc.querySelector('.hw-menu');
      if (stepAmount(menu, action) || action !== 'amt-go') return;
      const n = amountOf(menu);
      closeFloatMenu(ctx.doc);
      if (!sc.pending) {
        runIntent(sc, repaint, () => carryIntoHunt(ctx.account, cs, row.id, n), 'Carrying it in…',
          (r) => 'Carried ' + whole(r.qty) + ' ' + name + ' into this hunt.' + (row.wait ? ' ' + row.wait : ''), cs);
      }
    },
    onClose: () => {},
    alive: () => body.isConnected,
  });
}
