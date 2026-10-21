// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/skills.js — THE SKILLS: TWO LEDGERS (WORLD_SHELL §4).
//
// One ledger, two homes (Tyler 10-18: split so neither needs a scroll bar):
// the Gathering and crafting window, and the combat skills inside the
// Character window (src/shell/windows/character/sheet.js), beside the combat
// numbers they make. skillsWindow(groups) makes each from its SKILLS_DEF
// categories, so a new skill joins the ledger of its category with nothing
// else to edit. One compact entry per skill, two to a
// row: its glyph and name, the server's level, the progress to the next level
// on the skill's own curve (src/core/xp.js skillXpForLevel: the combat skills climb
// the uncapped curve, the rest stop at 99; the curves hr_skill_level uses), the
// XP still to go, and its NEXT UNLOCK (src/data/skill-unlocks.js: the lowest
// recipe, node or gear requirement above the current level, from the catalogues). What the
// skill is for and where it is trained (src/data/skill-guide.js) is the
// entry's tooltip. Every level and XP number is the envelope's `skills`,
// replaced on each envelope; the windows send nothing.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../data/skills.js?v=0.2.21';
import { SKILL_GUIDE } from '../../data/skill-guide.js?v=0.2.21';
import { skillXpForLevel, skillCapOf } from '../../core/xp.js?v=0.2.21';
import { nextUnlock } from '../../data/skill-unlocks.js?v=0.2.21';
import { skillsOf } from '../../session/item-sections.js?v=0.2.21';
import { rows, text, cls, style, attr, element } from '../../render/paint.js?v=0.2.21';
import { whole } from '../../render/format.js?v=0.2.21';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.21';
import { glyphSvg } from '../launcher.js?v=0.2.21';

/* Is `level` the skill's last (a capped skill at its cap)? Combat skills have none. */
const mastered = (id, level) => { const cap = skillCapOf(id); return cap !== null && level >= cap; };

/** Progress inside the current level, 0..1, from the server's XP and level, on the skill's own curve. */
function levelProgress(id, xp, level) {
  if (mastered(id, level)) return 1;
  const lo = skillXpForLevel(id, level), hi = skillXpForLevel(id, level + 1);
  return hi > lo ? Math.max(0, Math.min(1, (xp - lo) / (hi - lo))) : 0;
}

/* One entry (built once per skill by rows(), keyed by skill id); the guide is its tooltip. */
function entryHtml(g, id) {
  const guide = SKILL_GUIDE[id];
  const name = SKILLS_DEF[id].name;
  return '<li class="hw-skill"' + (guide ? ' title="' + esc(name + ': ' + guide.use + ' ' + guide.where) + '"' : '') + '>'
    + '<span class="hw-skill-top"><span class="hw-skill-glyph">' + glyphSvg(g, guide ? guide.glyph : 'uiStar') + '</span>'
    + '<b class="hw-skill-name">' + esc(name) + '</b><b class="hw-skill-lv"></b></span>'
    + '<span class="hw-skill-mid"><span class="hw-skill-bar" role="meter" aria-label="' + esc(name) + ' progress" aria-valuemin="0" aria-valuemax="100"><i class="hw-skill-fill"></i></span>'
    + '<small class="hw-skill-xp"></small></span><small class="hw-skill-next"></small></li>';
}

/**
 * A skills window over some SKILLS_DEF categories: [[cat, heading]], drawn in that order.
 * @returns {Function} a component renderer (skeleton + .patch)
 */
function skillsWindow(groups) {
  const render = function renderSkills() {
    return '<div class="hw-skills">'
      + groups.map(([cat, label]) => '<section class="hw-skill-group"><h3 class="hw-skill-head">' + esc(label) + '</h3><ul class="hw-skill-list" data-cat="' + cat + '"></ul></section>').join('')
      + '<p class="hh-empty hw-skill-none">Reading your skills…</p></div>';
  };
  render.patch = function patchSkills(body, ctx) {
    const sk = skillsOf(ctx.character);
    const root = body.querySelector('.hw-skills');
    cls(root.querySelector('.hw-skill-none'), 'is-on', !sk);
    for (const [cat] of groups) {
      const ids = Object.keys(SKILLS_DEF).filter((id) => SKILLS_DEF[id].cat === cat);
      rows(root.querySelector('.hw-skill-list[data-cat="' + cat + '"]'), sk ? ids : [], {
        key: (id) => id,
        build: (id) => element(ctx.doc, entryHtml(ctx.glyphs, id)),
        patch: (li, id) => {
          const r = sk[id] || { xp: 0, level: 1 };
          text(li.querySelector('.hw-skill-lv'), String(r.level));
          const f = levelProgress(id, r.xp, r.level);
          style(li.querySelector('.hw-skill-fill'), 'width', (Math.round(f * 1000) / 10) + '%');
          attr(li.querySelector('.hw-skill-bar'), 'aria-valuenow', Math.round(f * 100));
          text(li.querySelector('.hw-skill-xp'), mastered(id, r.level) ? 'Mastered' : whole(Math.max(0, skillXpForLevel(id, r.level + 1) - r.xp)) + ' XP to ' + (r.level + 1));
          const next = nextUnlock(id, r.level);
          const nx = li.querySelector('.hw-skill-next');
          text(nx, next);
          attr(nx, 'title', next || null);
        },
      });
    }
  };
  return render;
}

/* The combat ledger is the Character window's (src/shell/windows/character/sheet.js): the
   combat skills sit beside the numbers they make. */
export const combatLedger = skillsWindow([['combat', 'Combat skills']]);
export const renderTradeSkills = skillsWindow([['gather', 'Gathering'], ['artisan', 'Crafting']]);

