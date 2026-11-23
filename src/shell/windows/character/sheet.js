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
import { HUNT_ROLES } from '../../../data/hunt-roles.js';
import { characterSheetOf, heroVitalsOf, wornTitleOf } from '../../../session/character-sections.js';
import { nameOf, bagCapOf } from '../../../session/item-sections.js';
import { staminaOf } from '../../../session/hunt-sections.js';
import { roleIdOf } from '../../../session/party-sections.js';
import { text, cls, style, attr } from '../../../render/paint.js';
import { whole, hoursMinutes } from '../../../render/format.js';
import { escapeHtml as esc } from '../../../utils/dom.js';
import { combatLedger } from '../skills.js';
import { temperNowOf } from '../../../session/temper-sections.js';
import { sheetXpLine } from '../../live-events-view.js';

/* [key, label] of each number line; a line shows only when its value exists. A value is a number and its unit, a genre stat
   line ("Hit chance 69%"); what it is measured against is its tooltip, so no value wraps (UI audit 2026-11-18 #8). */
const VITALS = Object.freeze([['hp', 'Max health'], ['mana', 'Max mana'], ['regen', 'Regeneration'], ['speed', 'Speed'], ['cap', 'Bag space'], ['stamina', 'Stamina']]);
const VITAL_TIPS = Object.freeze({ regen: 'Health and mana recovery · Source: Inner Flame', speed: 'Walking speed in tiles a second', cap: 'Spaces in the bag' });
const COMBAT = Object.freeze([['damage', 'Damage'], ['accuracy', 'Hit chance'], ['crit', 'Critical chance'], ['defence', 'Defense'],
  ['dodge', 'Dodge'], ['absorb', 'Absorb'], ['ward', 'Ward'], ['steady', 'Damage cut'], ['temper', 'Tempered']]);
/* What each line means and what it is measured against, for its tooltip (ruling K7: Heavy = Absorb, Medium = Dodge, Light = Ward;
   a blow meets them in that order: dodge, absorb, resistances, ward, then health). The engine prices the armor lines against a
   monster of the hero's own Level: a stronger one gets through more. */
const COMBAT_TIPS = Object.freeze({
  accuracy: 'Chance to hit a target with no armor',
  defence: 'Monsters miss more · Source: Defense skill, shield',
  dodge: 'Chance a blow misses, vs a monster of your Level · Source: Medium armor',
  absorb: 'Share of each blow blocked, vs a monster of your Level · Source: Heavy armor',
  ward: 'Flat damage off each blow · Source: Light armor',
  steady: 'Share off each blow, applied last · Source: cape, some foods',
  temper: 'Smith upgrades on worn gear: damage dealt, damage taken · Get: Shop → Services',
});
const XP_SOURCES = Object.freeze([['perks', 'Home and renown'], ['buffs', 'Food and drink'], ['combat', 'Combat skills only']]);
/* What Level is, for its tooltip (CORE_MODEL.md §1-2). */
const LEVEL_TIP = 'Level XP: monster kills only · Each Level: more health and mana\n'
  + 'Heavy: more health · Light: more mana · Death: lose XP, even a Level';

const lineHtml = ([k, l], kind, tips) => '<div class="hw-cs-line" data-' + kind + '="' + k + '"'
  + (tips && tips[k] ? ' title="' + esc(tips[k]) + '"' : '') + '><dt>' + esc(l) + '</dt><dd></dd></div>';
const signedPct = (f) => (f > 0 ? '+' : '') + (Math.round(f * 1000) / 10) + '%';

/** The Character tab's skeleton. */
export function sheetHtml() {
  return '<section class="hw-cs-sheet">'
    + '<header class="hw-cs-who"><canvas class="hw-cs-portrait" width="42" height="45" aria-hidden="true"></canvas>'
    + '<div class="hw-cs-id"><b class="hw-cs-name"></b><span class="hw-cs-role"></span>'
    + '<span class="hw-cs-level" title="' + esc(LEVEL_TIP) + '"><b class="hw-cs-lv"></b>'
    + '<span class="hw-skill-bar" role="meter" aria-label="Level progress" aria-valuemin="0" aria-valuemax="100"><i class="hw-skill-fill"></i></span>'
    + '<small class="hw-cs-lvxp"></small></span></div>'
    + '<dl class="hw-cs-vitals">' + VITALS.map((r) => lineHtml(r, 'vital', VITAL_TIPS)).join('') + '</dl></header>'
    + '<div class="hw-cs-cols"><div class="hw-cs-col">' + combatLedger() + '</div>'
    + '<div class="hw-cs-col">'
    + '<h3 class="hw-cs-head">Combat</h3><dl class="hw-cs-list hw-cs-combat">' + COMBAT.map((r) => lineHtml(r, 'combat', COMBAT_TIPS)).join('') + '</dl>'
    + '<p class="hw-cs-note hw-cs-wait"></p>'
    + '<h3 class="hw-cs-head hw-cs-bhead">Bestiary</h3><div class="hw-cs-best"><span class="hw-skill-bar" role="meter" aria-label="Bestiary completion" aria-valuemin="0" aria-valuemax="100"><i class="hw-skill-fill"></i></span><small class="hw-cs-btext"></small></div>'
    + '<h3 class="hw-cs-head hw-cs-xhead">Experience bonuses</h3><dl class="hw-cs-list hw-cs-xp">' + XP_SOURCES.map((r) => lineHtml(r, 'xp')).join('')
    + '<div class="hw-cs-line hw-cs-total"><dt>Total</dt><dd></dd></div><div class="hw-cs-line" data-xp="event"><dt></dt><dd></dd></div></dl>'
    + '<p class="hw-cs-note hw-cs-xnone">None right now</p>'
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
  const hv = heroVitalsOf(cs);
  const st = staminaOf(cs);
  const cap = bagCapOf(cs);
  drawPortrait(root.querySelector('.hw-cs-portrait'));
  const worn = wornTitleOf(cs);
  text(root.querySelector('.hw-cs-name'), (nameOf(cs) || '') + (worn ? ' ' + worn : ''));
  const role = (c && c.role) || roleIdOf(cs);
  text(root.querySelector('.hw-cs-role'), role && HUNT_ROLES[role] ? HUNT_ROLES[role].label : '');
  /* Level, max HP and max mana: heroVitalsOf, the one reader the HUD draws them from (r09), so the
     tab and the HUD can never show two numbers. The Level and its two XP marks are the server's own (the envelope's `level` block). */
  const lv = hv.level !== null ? hv : null;
  const lvEl = root.querySelector('.hw-cs-level');
  cls(lvEl, 'is-on', !!lv);
  text(lvEl.querySelector('.hw-cs-lv'), lv ? 'Level ' + lv.level : '');
  const lf = lv && lv.xpPct !== null ? lv.xpPct : 0;
  style(lvEl.querySelector('.hw-skill-fill'), 'width', (Math.round(lf * 1000) / 10) + '%');
  attr(lvEl.querySelector('.hw-skill-bar'), 'aria-valuenow', Math.round(lf * 100));
  text(lvEl.querySelector('.hw-cs-lvxp'), lv ? whole(lv.into) + ' / ' + whole(lv.need) + ' XP to Level ' + (lv.level + 1) : '');
  /* Vitals: max HP and max mana, the engine's regeneration and walk speed, the bag's spaces, the stamina pool. */
  line(root, '[data-vital="hp"]', hv.hpMax !== null ? whole(hv.hpMax) : null);
  line(root, '[data-vital="mana"]', hv.manaMax !== null ? whole(hv.manaMax) : null);
  line(root, '[data-vital="regen"]', c && c.regenPct !== null ? signedPct((c.regenPct - 100) / 100) : null);
  line(root, '[data-vital="speed"]', c && c.moveSpeed !== null ? (Math.round(c.moveSpeed / 100) / 10) + ' tiles/s' : null);
  line(root, '[data-vital="cap"]', cap !== null ? whole(cap) : null);
  line(root, '[data-vital="stamina"]', st ? hoursMinutes(st.msLeft) : null);
  combatLedger.patch(root, ctx);
  /* The engine's numbers, only while its sheet is fresh. */
  line(root, '[data-combat="damage"]', c && c.damage ? c.damage.min + '–' + c.damage.max : null);
  line(root, '[data-combat="accuracy"]', c && c.accuracyPct !== null ? c.accuracyPct + '%' : null);
  line(root, '[data-combat="crit"]', c && c.critPct !== null ? c.critPct + '%' : null);
  line(root, '[data-combat="defence"]', c && c.defence !== null ? whole(c.defence) : null);
  /* The armour's mitigation (ruling K7), the engine's numbers against a monster of this Level (the line's tooltip says so). */
  line(root, '[data-combat="dodge"]', c && c.dodgePct !== null ? c.dodgePct + '%' : null);
  line(root, '[data-combat="absorb"]', c && c.absorbPct !== null ? c.absorbPct + '%' : null);
  line(root, '[data-combat="ward"]', c && c.ward !== null ? whole(c.ward) : null);
  line(root, '[data-combat="steady"]', c && c.steadyPct ? c.steadyPct + '%' : null);
  /* Tempering: the server's rungs through the fight's own rule, over the server's worn set (src/session/temper-sections.js):
     damage dealt up, damage taken down. */
  const tempered = temperNowOf(cs);
  line(root, '[data-combat="temper"]', tempered ? [tempered.blowsPm ? '+' + tempered.blowsPm / 10 + '% dealt' : '', tempered.armorPm ? '-' + tempered.armorPm / 10 + '% taken' : ''].filter(Boolean).join(', ') : null);
  const wait = root.querySelector('.hw-cs-wait');
  text(wait, !sh ? '' : c ? '' : 'Loading combat stats…');
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
  /* A LIVE EVENT THE SETTLE PAYS (retention dive 2026-11-20: "None right now" under a "+25% Level XP" plate): its own line, the server's
     dial and window (live-events-view.js, the plate's reader), apart from the Total, which sums the skill XP sources above it. */
  const ev = c ? sheetXpLine(cs) : null;
  text(root.querySelector('[data-xp="event"] dt'), ev ? ev.name : '');
  line(root, '[data-xp="event"]', ev ? ev.words : null);
  cls(root.querySelector('.hw-cs-xnone'), 'is-on', !!c && !any && !ev);
}
