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
// on the shared XP curve (src/core/xp.js, the curve hr_level_from_xp uses), the
// XP still to go, and its NEXT UNLOCK (the lowest recipe, node or gear
// requirement above the current level, read from the catalogue rows). What the
// skill is for and where it is trained (src/data/skill-guide.js) is the
// entry's tooltip. Every level and XP number is the envelope's `skills`,
// replaced on each envelope; the windows send nothing.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../data/skills.js?v=0.2.0';
import { SKILL_GUIDE } from '../../data/skill-guide.js?v=0.2.0';
import { ARTISAN_RECIPES } from '../../data/recipes.js?v=0.2.0';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from '../../data/gathering.js?v=0.2.0';
import { ITEMS } from '../../data/items.js?v=0.2.0';
import { xpForLevel, MAX_LEVEL } from '../../core/xp.js?v=0.2.0';
import { skillsOf } from '../../session/item-sections.js?v=0.2.0';
import { rows, text, cls, style, attr, element } from '../../render/paint.js?v=0.2.0';
import { whole } from '../../render/format.js?v=0.2.0';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.0';
import { glyphSvg } from '../launcher.js?v=0.2.0';
import { itemName } from '../widgets/bits.js?v=0.2.0';
import { itemUse, nodeUse } from '../../data/item-uses.js?v=0.2.0';


let UNLOCKS = null;
/* skill -> [[level, name, use]] ascending, from every catalogue row that names a skill requirement;
   the use is the row's own kind in words (src/data/item-uses.js). */
function unlocks() {
  if (UNLOCKS) return UNLOCKS;
  UNLOCKS = new Map();
  const add = (skill, lv, what, use) => { if (!(lv > 1) || !what) return; if (!UNLOCKS.has(skill)) UNLOCKS.set(skill, []); UNLOCKS.get(skill).push([lv, what, use || '']); };
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const r of list || []) add(skill, r.req, r.output ? itemName(r.output) : r.name, r.output ? itemUse(r.output) : '');
  for (const [nodes, skill] of [[TREES, 'woodcutting'], [ROCKS, 'mining'], [FISH_SPOTS, 'fishing']]) for (const n of nodes) add(skill, n.req, n.name, nodeUse(skill));
  for (const c of Object.values(CROPS)) if (c) add('farming', c.req || c.lv, c.prod ? itemName(c.prod) : c.name, nodeUse('farming'));
  for (const [id, it] of Object.entries(ITEMS)) if (it.reqSkill && SKILLS_DEF[it.reqSkill]) add(it.reqSkill, it.reqLv, it.n || id, itemUse(id));
  for (const l of UNLOCKS.values()) l.sort((a, b) => a[0] - b[0]);
  return UNLOCKS;
}

const UNLOCKS_NAMED = 3;
/** What this skill opens next above `level`: "Next at level 3: Bronze Axe (woodcutting tool), Bronze Pickaxe (mining tool)", or ''. */
function nextUnlock(skill, level) {
  const list = unlocks().get(skill) || [];
  const next = list.find(([lv]) => lv > level);
  if (!next) return '';
  const seen = new Set();
  const at = list.filter(([lv, name]) => lv === next[0] && !seen.has(name) && seen.add(name));
  const named = at.slice(0, UNLOCKS_NAMED).map(([, name, use]) => (use ? name + ' (' + use + ')' : name));
  return 'Next at level ' + next[0] + ': ' + named.join(', ') + (at.length > UNLOCKS_NAMED ? ' and ' + (at.length - UNLOCKS_NAMED) + ' more' : '');
}

/** Progress inside the current level, 0..1, from the server's XP and level. */
function levelProgress(xp, level) {
  if (level >= MAX_LEVEL) return 1;
  const lo = xpForLevel(level), hi = xpForLevel(level + 1);
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
          const f = levelProgress(r.xp, r.level);
          style(li.querySelector('.hw-skill-fill'), 'width', (Math.round(f * 1000) / 10) + '%');
          attr(li.querySelector('.hw-skill-bar'), 'aria-valuenow', Math.round(f * 100));
          text(li.querySelector('.hw-skill-xp'), r.level >= MAX_LEVEL ? 'Mastered' : whole(Math.max(0, xpForLevel(r.level + 1) - r.xp)) + ' XP to ' + (r.level + 1));
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

