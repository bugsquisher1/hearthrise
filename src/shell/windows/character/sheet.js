// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/sheet.js — THE CHARACTER TAB: WHO YOU ARE, IN NUMBERS.
//
// The portrait (the hero's own outfit sprite), the name, the role the worn
// weapon gives and the Level with its progress bar (Level comes from kills
// only and is NOT a skill, CORE_MODEL.md §1); the vitals; the combat skills (the
// shared ledger, src/shell/windows/skills.js); the combat numbers the hunt
// engine prices a swing with; the bestiary; the experience bonuses by source.
//
// EVERY NUMBER IS THE SERVER'S (src/session/character-sections.js): the
// combat block is the engine's sheet (the `character_sheet` section, shown
// only while `fresh`); the rest are its other sections. A number the server
// did not send is not drawn: its line is hidden, never a zero or a dash.
// Stats the engine does not have (leech, element protections, a character
// XP bar) have no line at all.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_ROLES } from '../../../data/hunt-roles.js?v=0.2.24';
import { characterSheetOf, levelOf } from '../../../session/character-sections.js?v=0.2.24';
import { nameOf, bagCapOf } from '../../../session/item-sections.js?v=0.2.24';
import { staminaOf } from '../../../session/hunt-sections.js?v=0.2.24';
import { vitalsOf, roleIdOf } from '../../../session/party-sections.js?v=0.2.24';
import { text, cls, style, attr } from '../../../render/paint.js?v=0.2.24';
import { whole, hoursMinutes } from '../../../render/format.js?v=0.2.24';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.24';
import { combatLedger } from '../skills.js?v=0.2.24';

/* [key, label] of each number line; a line shows only when its value exists. */
const VITALS = Object.freeze([['hp', 'Max health'], ['mana', 'Max mana'], ['regen', 'Regeneration'], ['speed', 'Speed'], ['cap', 'Capacity'], ['stamina', 'Stamina']]);
const COMBAT = Object.freeze([['damage', 'Damage'], ['accuracy', 'Hit chance'], ['crit', 'Critical chance'], ['defence', 'Defence']]);
const XP_SOURCES = Object.freeze([['perks', 'Home and renown'], ['buffs', 'Food and drink'], ['combat', 'Combat skills only']]);
/* What Level is, for its tooltip (CORE_MODEL.md §1-2). */
const LEVEL_TIP = 'Level rises only from monsters you defeat. Each Level adds max health and max mana; '
  + 'heavy armour adds more health, light armour more mana. Dying costs a little Level XP, never a Level.';

const lineHtml = ([k, l], kind) => '<div class="hw-cs-line" data-' + kind + '="' + k + '"><dt>' + esc(l) + '</dt><dd></dd></div>';
const signedPct = (f) => (f > 0 ? '+' : '') + (Math.round(f * 1000) / 10) + '%';

/** The Character tab's skeleton. */
export function sheetHtml() {
  return '<section class="hw-cs-sheet">'
    + '<header class="hw-cs-who"><canvas class="hw-cs-portrait" width="64" height="64" aria-hidden="true"></canvas>'
    + '<div class="hw-cs-id"><b class="hw-cs-name"></b><span class="hw-cs-role"></span>'
    + '<span class="hw-cs-level" title="' + esc(LEVEL_TIP) + '"><b class="hw-cs-lv"></b>'
    + '<span class="hw-skill-bar" role="meter" aria-label="Level progress" aria-valuemin="0" aria-valuemax="100"><i class="hw-skill-fill"></i></span>'
    + '<small class="hw-cs-lvxp"></small></span></div>'
    + '<dl class="hw-cs-vitals">' + VITALS.map((r) => lineHtml(r, 'vital')).join('') + '</dl></header>'
    + '<div class="hw-cs-cols"><div class="hw-cs-col">' + combatLedger() + '</div>'
    + '<div class="hw-cs-col">'
    + '<h3 class="hw-cs-head">Combat</h3><dl class="hw-cs-list hw-cs-combat">' + COMBAT.map((r) => lineHtml(r, 'combat')).join('') + '</dl>'
    + '<p class="hw-cs-note hw-cs-wait"></p>'
    + '<h3 class="hw-cs-head hw-cs-bhead">Bestiary</h3><div class="hw-cs-best"><span class="hw-skill-bar" role="meter" aria-label="Bestiary completion" aria-valuemin="0" aria-valuemax="100"><i class="hw-skill-fill"></i></span><small class="hw-cs-btext"></small></div>'
    + '<h3 class="hw-cs-head hw-cs-xhead">Experience bonuses</h3><dl class="hw-cs-list hw-cs-xp">' + XP_SOURCES.map((r) => lineHtml(r, 'xp')).join('')
    + '<div class="hw-cs-line hw-cs-total"><dt>Total</dt><dd></dd></div></dl><p class="hw-cs-note hw-cs-xnone">No experience bonuses right now.</p>'
    + '</div></div></section>';
}

/* One number line: shown with its words when `v` is a string, hidden when null. */
function line(root, sel, v) {
  const el = root.querySelector(sel);
  cls(el, 'is-on', v !== null);
  text(el.querySelector('dd'), v === null ? '' : v);
}

/**
 * Patch the Character tab from the server's sections. `drawPortrait(canvas)` draws the hero;
 * `asked` is true once this opening's ask of the engine has answered (until then no combat number shows).
 */
export function patchSheet(body, ctx, drawPortrait, asked) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-cs-sheet');
  const sh = characterSheetOf(cs);
  const c = asked && sh ? sh.combat : null;
  const v = vitalsOf(cs);
  const st = staminaOf(cs);
  const cap = bagCapOf(cs);
  drawPortrait(root.querySelector('.hw-cs-portrait'));
  text(root.querySelector('.hw-cs-name'), nameOf(cs) || '');
  const role = (c && c.role) || roleIdOf(cs);
  text(root.querySelector('.hw-cs-role'), role && HUNT_ROLES[role] ? HUNT_ROLES[role].label : '');
  /* Level: the server's Level XP on the shared curve, with the XP across this Level. */
  const lv = levelOf(cs);
  const lvEl = root.querySelector('.hw-cs-level');
  cls(lvEl, 'is-on', !!lv);
  text(lvEl.querySelector('.hw-cs-lv'), lv ? 'Level ' + lv.level : '');
  const lf = lv && lv.need > 0 ? Math.max(0, Math.min(1, lv.into / lv.need)) : 0;
  style(lvEl.querySelector('.hw-skill-fill'), 'width', (Math.round(lf * 1000) / 10) + '%');
  attr(lvEl.querySelector('.hw-skill-bar'), 'aria-valuenow', Math.round(lf * 100));
  text(lvEl.querySelector('.hw-cs-lvxp'), lv ? whole(lv.into) + ' / ' + whole(lv.need) + ' XP to Level ' + (lv.level + 1) : '');
  /* Vitals: the server's max HP, the engine's max mana, regeneration and walk speed, the bag's spaces, the stamina pool. */
  const hpMax = sh && sh.maxHp !== null ? sh.maxHp : v.hpMax;
  line(root, '[data-vital="hp"]', hpMax !== null ? whole(hpMax) : null);
  /* Max mana like max HP: the engine's sheet, else the server's top-level number, else the hunt's vitals. */
  const manaMax = c && c.maxMana !== null ? c.maxMana : sh && sh.maxMana !== null ? sh.maxMana : v.manaMax;
  line(root, '[data-vital="mana"]', manaMax !== null ? whole(manaMax) : null);
  line(root, '[data-vital="regen"]', c && c.regenPct !== null ? signedPct((c.regenPct - 100) / 100) + ' (Prayer)' : null);
  line(root, '[data-vital="speed"]', c && c.moveSpeed !== null ? (Math.round(c.moveSpeed / 100) / 10) + ' tiles a second' : null);
  line(root, '[data-vital="cap"]', cap !== null ? whole(cap) + ' bag spaces' : null);
  line(root, '[data-vital="stamina"]', st ? hoursMinutes(st.msLeft) : null);
  combatLedger.patch(root, ctx);
  /* The engine's numbers, only while its sheet is fresh. */
  line(root, '[data-combat="damage"]', c && c.damage ? c.damage.min + '–' + c.damage.max : null);
  line(root, '[data-combat="accuracy"]', c && c.accuracyPct !== null ? c.accuracyPct + '% against no armour' : null);
  line(root, '[data-combat="crit"]', c && c.critPct !== null ? c.critPct + '%' : null);
  line(root, '[data-combat="defence"]', c && c.defence !== null ? whole(c.defence) : null);
  const wait = root.querySelector('.hw-cs-wait');
  text(wait, !sh ? '' : c ? '' : 'Working out your combat numbers…');
  cls(wait, 'is-on', !!sh && !c);
  /* The bestiary: distinct monsters slain over the server's roster. */
  const b = sh && sh.bestiary;
  cls(root.querySelector('.hw-cs-bhead'), 'is-on', !!b);
  const best = root.querySelector('.hw-cs-best');
  cls(best, 'is-on', !!b);
  if (b) {
    const f = Math.max(0, Math.min(1, b.slain / b.total));
    style(best.querySelector('.hw-skill-fill'), 'width', (Math.round(f * 1000) / 10) + '%');
    attr(best.querySelector('.hw-skill-bar'), 'aria-valuenow', Math.round(f * 100));
    text(best.querySelector('.hw-cs-btext'), whole(b.slain) + ' of ' + whole(b.total) + ' creatures slain');
  }
  /* Experience bonuses by source: a source shows only when it adds something. */
  const x = c ? c.xp : null;
  let total = 0, any = false;
  for (const [k] of XP_SOURCES) {
    const f = x && x[k] !== null && x[k] !== 0 ? x[k] : null;
    if (f !== null && k !== 'combat') total += f;
    any = any || f !== null;
    line(root, '[data-xp="' + k + '"]', f !== null ? signedPct(f) : null);
  }
  cls(root.querySelector('.hw-cs-xhead'), 'is-on', !!c);
  line(root, '.hw-cs-total', c && any ? signedPct(total) + (x.combat ? ', ' + signedPct(total + x.combat) + ' on combat skills' : '') : null);
  cls(root.querySelector('.hw-cs-xnone'), 'is-on', !!c && !any);
}
