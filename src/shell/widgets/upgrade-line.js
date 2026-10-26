// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/upgrade-line.js — THE "EQUIP UPGRADES" LINE (Inventory and Shop).
//
// One line: what the press would put on, in words (upgrade-plan.js, from the
// server's bag, worn set, skills and Level), and the button. The press is ONE
// `equip` intent naming every slot and piece; from the press until the
// server's envelope lands, those slots and stacks carry the pending mark
// (`sc.wearing`, display only, the same mark a single Wear shows). The worn
// set and the bag change only from that envelope; a refusal changes nothing
// and says why ON THIS LINE, where the press was (intent-words.js; it sat at
// the window's foot, out of view, Tyler 2026-10-24). While the server holds
// the hero's hunt open the button is off and the line says so (gear-gate.js):
// the engine refuses every equip mid-hunt.
// ════════════════════════════════════════════════════════════════════════
import { bagOf, equipmentOf, skillsOf } from '../../session/item-sections.js?v=0.2.48';
import { levelOf } from '../../session/character-sections.js?v=0.2.48';
import { text, cls, prop, attr } from '../../render/paint.js?v=0.2.48';
import { runIntent } from '../intent-words.js?v=0.2.48';
import { upgradePlan, upgradeWords } from '../upgrade-plan.js?v=0.2.48';
import { gearLocked, GEAR_HUNT_WORDS } from '../gear-gate.js?v=0.2.48';
import { whyLine } from './why-line.js?v=0.2.48';

/** This character's plan, from what the server sent (empty `ops` when nothing is better). */
export function upgradeOf(cs) {
  const lv = levelOf(cs);
  return upgradePlan({ bag: bagOf(cs) || [], equipment: equipmentOf(cs) || {}, skills: skillsOf(cs), level: lv ? lv.level : null });
}

/** The line's skeleton. */
export function upgradeLineHtml() {
  return '<div class="hw-upgrade" role="group" aria-label="Equip upgrades"><p class="hw-upgrade-q"></p>'
    + '<button type="button" class="hw-primary" data-hs-act="equip-upgrades">Equip upgrades</button>'
    + '<p class="hw-why hw-upgrade-why" role="status" aria-live="polite"></p></div>';
}

/**
 * Show the line (only when `on` and the plan puts something on), its words and the button's state. `o.locked`: the
 * server holds the hero's hunt open (the button is off, the line says why); `o.msg`: the last press's own words.
 */
export function patchUpgradeLine(root, plan, on, pending, o) {
  const opt = o || {};
  const line = root.querySelector('.hw-upgrade');
  const show = !!on && plan.picks.length > 0;
  cls(line, 'is-on', show);
  text(line.querySelector('.hw-upgrade-q'), show ? upgradeWords(plan) : '');
  const b = line.querySelector('button');
  prop(b, 'disabled', !!pending || !show || !!opt.locked);
  attr(b, 'title', show ? upgradeWords(plan, Infinity, Infinity) : null);
  whyLine(line.querySelector('.hw-upgrade-why'), show ? opt.msg || (opt.locked ? GEAR_HUNT_WORDS.upgrades : '') : '', !!opt.msg);
}

/**
 * Put the plan on: ONE `equip` intent, its slots and stacks marked until the server answers. Its words show on the
 * line (`sc.msgAt = 'upgrade'`) until it lands: a success's count moves to the window's own line (the plan is gone).
 */
export function equipUpgrades(cs, sc, repaint, plan) {
  const slots = Object.keys(plan.ops);
  if (!slots.length || sc.pending) return Promise.resolve({ ok: false, error: 'busy' });
  sc.msgAt = 'upgrade';
  if (gearLocked(cs)) { sc.msg = GEAR_HUNT_WORDS.upgrades; repaint(); return Promise.resolve({ ok: false, error: 'hunt_open' }); }
  sc.wearing = { slots, items: slots.map((s) => plan.ops[s]) };
  const n = slots.length;
  return runIntent(sc, repaint, async () => {
    try { return await cs.edgeIntent('equip', { equip: Object.assign({}, plan.ops) }); } finally { sc.wearing = null; }
  }, 'Putting it on…', () => { sc.msgAt = null; return n === 1 ? 'Put on 1 piece.' : 'Put on ' + n + ' pieces.'; }, cs);
}
