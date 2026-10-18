// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/skills.js — THE SKILLS: A LEDGER (WORLD_SHELL §4).
//
// One ruled line per skill, grouped (combat, gathering, making): its glyph and
// name, the server's level, the progress to the next level on the shared XP
// curve (src/core/xp.js, the curve hr_level_from_xp uses), what the skill is
// for and where it is trained (src/data/skill-guide.js), and its NEXT UNLOCK
// (the lowest recipe, node or gear requirement above the current level, read
// from the catalogue rows). Every level and XP number is the envelope's
// `skills`, replaced on each envelope; the window sends nothing.
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

const GROUPS = Object.freeze([['combat', 'Combat'], ['gather', 'Gathering'], ['artisan', 'Making']]);

let UNLOCKS = null;
/* skill -> [[level, what]] ascending, from every catalogue row that names a skill requirement. */
function unlocks() {
  if (UNLOCKS) return UNLOCKS;
  UNLOCKS = new Map();
  const add = (skill, lv, what) => { if (!(lv > 1) || !what) return; if (!UNLOCKS.has(skill)) UNLOCKS.set(skill, []); UNLOCKS.get(skill).push([lv, what]); };
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const r of list || []) add(skill, r.req, r.output ? itemName(r.output) : r.name);
  for (const [nodes, skill] of [[TREES, 'woodcutting'], [ROCKS, 'mining'], [FISH_SPOTS, 'fishing']]) for (const n of nodes) add(skill, n.req, n.name);
  for (const c of Object.values(CROPS)) if (c) add('farming', c.req || c.lv, c.prod ? itemName(c.prod) : c.name);
  for (const [id, it] of Object.entries(ITEMS)) if (it.reqSkill && SKILLS_DEF[it.reqSkill]) add(it.reqSkill, it.reqLv, it.n || id);
  for (const l of UNLOCKS.values()) l.sort((a, b) => a[0] - b[0]);
  return UNLOCKS;
}

/** The next thing this skill opens above `level`: "Oak Tree at 15", or ''. */
function nextUnlock(skill, level) {
  const next = (unlocks().get(skill) || []).find(([lv]) => lv > level);
  if (!next) return '';
  const same = (unlocks().get(skill) || []).filter(([lv]) => lv === next[0]).length;
  return next[1] + (same > 1 ? ' and ' + (same - 1) + ' more' : '') + ' at level ' + next[0];
}

/** Progress inside the current level, 0..1, from the server's XP and level. */
function levelProgress(xp, level) {
  if (level >= MAX_LEVEL) return 1;
  const lo = xpForLevel(level), hi = xpForLevel(level + 1);
  return hi > lo ? Math.max(0, Math.min(1, (xp - lo) / (hi - lo))) : 0;
}

/* One ledger line (built once per skill by rows(), keyed by skill id). */
function lineHtml(g, id) {
  const guide = SKILL_GUIDE[id];
  return '<li class="hw-skill"><span class="hw-skill-glyph">' + glyphSvg(g, guide ? guide.glyph : 'uiStar') + '</span>'
    + '<span class="hw-skill-main"><span class="hw-skill-top"><b class="hw-skill-name">' + esc(SKILLS_DEF[id].name) + '</b><b class="hw-skill-lv"></b></span>'
    + '<span class="hw-skill-bar" role="meter" aria-label="' + esc(SKILLS_DEF[id].name) + ' progress" aria-valuemin="0" aria-valuemax="100"><i class="hw-skill-fill"></i></span>'
    + '<small class="hw-skill-xp"></small>'
    + (guide ? '<small class="hw-skill-use">' + esc(guide.use) + ' ' + esc(guide.where) + '</small>' : '')
    + '<small class="hw-skill-next"></small></span></li>';
}

/** The skeleton (built once per opening). */
export function renderSkills() {
  return '<div class="hw-skills">'
    + '<p class="hw-cap"><span class="hw-skill-total"></span></p>'
    + GROUPS.map(([cat, label]) => '<section class="hw-skill-group"><h3 class="hw-skill-head">' + esc(label) + '</h3><ul class="hw-skill-list" data-cat="' + cat + '"></ul></section>').join('')
    + '<p class="hh-empty hw-skill-none">Reading your skills…</p></div>';
}

renderSkills.patch = function patchSkills(body, ctx) {
  const sk = skillsOf(ctx.character);
  const root = body.querySelector('.hw-skills');
  cls(root.querySelector('.hw-skill-none'), 'is-on', !sk);
  let total = 0;
  for (const [cat] of GROUPS) {
    const ids = Object.keys(SKILLS_DEF).filter((id) => SKILLS_DEF[id].cat === cat);
    rows(root.querySelector('.hw-skill-list[data-cat="' + cat + '"]'), sk ? ids : [], {
      key: (id) => id,
      build: (id) => element(ctx.doc, lineHtml(ctx.glyphs, id)),
      patch: (li, id) => {
        const r = sk[id] || { xp: 0, level: 1 };
        total += r.level;
        text(li.querySelector('.hw-skill-lv'), 'Level ' + r.level);
        const f = levelProgress(r.xp, r.level);
        style(li.querySelector('.hw-skill-fill'), 'width', (Math.round(f * 1000) / 10) + '%');
        attr(li.querySelector('.hw-skill-bar'), 'aria-valuenow', Math.round(f * 100));
        text(li.querySelector('.hw-skill-xp'), r.level >= MAX_LEVEL ? 'Mastered' : whole(Math.max(0, xpForLevel(r.level + 1) - r.xp)) + ' XP to level ' + (r.level + 1));
        const next = nextUnlock(id, r.level);
        text(li.querySelector('.hw-skill-next'), next ? 'Next: ' + next : '');
      },
    });
  }
  text(root.querySelector('.hw-skill-total'), sk ? 'Total level ' + whole(total) : '');
};
