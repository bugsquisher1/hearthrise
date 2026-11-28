// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/skills.js — THE SKILLS: TWO LEDGERS (WORLD_SHELL §4).
//
// One ledger, two homes (Tyler 10-18: split so neither needs a scroll bar):
// the Gathering and crafting window, and the combat skills inside the
// Character window (src/shell/windows/character/sheet.js), beside the combat
// numbers they make. skillsWindow(groups) makes each from its SKILLS_DEF
// categories, so a new skill joins the ledger of its category with nothing
// else to edit. One compact entry per skill the SERVER states, two to a
// row: its glyph and name, the server's level, the progress to the next level,
// the XP still to go (or "Mastered" at the last level), and its NEXT UNLOCK
// (src/data/skill-unlocks.js: the lowest recipe, node or gear requirement above
// the current level, from the catalogues). What the skill is for and where it
// is trained (src/data/skill-guide.js) is the entry's tooltip. Every level and
// XP number is the envelope's `skill_levels` section (skillLevelsOf: the
// server's level and its two XP marks on the server's own curve, hr_skill_block),
// replaced on each envelope; nothing here works a level or a mark out of XP
// (lane/c-skills-from-server: this build's copy of the curves can be a release
// away from the server's). The windows send nothing.
// THE TRADES (09-crafting 4.17: a hero's trade Levels are its company's) are the Work window's ledger (tradeLedger): one entry per
// trade that ships (src/data/trades.js TRADES), its Level and XP the server's `trade_jobs.trades` (trade-sections.js), its bar the XP
// into that Level on the trades' one table (src/core/trades.js tradeXpTable, the twin hr_trade_level is generated from and pinned to),
// drawn only while the server's XP sits inside the server's Level, and its next unlock the next job that Level opens.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../data/skills.js';
import { SKILL_GUIDE } from '../../data/skill-guide.js';
import { nextUnlock, nextUnlocks } from '../../data/skill-unlocks.js';
import { skillLevelsOf } from '../../session/item-sections.js';
import { rows, text, cls, style, attr, element } from '../../render/paint.js';
import { whole } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { glyphSvg } from '../launcher.js';
import { TRADES } from '../../data/trades.js';
import { jobRecipes, tradeXpTable } from '../../core/trades.js';
import { tradeJobsOf } from '../../session/trade-sections.js';
import { characterSheetOf } from '../../session/character-sections.js';
import { t } from '../../render/player-text.js';

/* Is this the skill's last level? The server says so: no XP across it (need 0, a capped skill at 99). */
const mastered = (r) => r.need === 0;

/** Progress inside the server's level, 0..1: its XP into the level plus `extra`, over the XP across it. */
const levelProgress = (r, extra) => (mastered(r) ? 1 : Math.max(0, Math.min(1, (r.into + extra) / r.need)));

const pct = (f) => (Math.round(f * 1000) / 10) + '%';

/** The bar's markup: the server's fill and, after it, a pending segment (the hunt analyzer's, widgets/analyzer.js). */
export function skillBarHtml(label) {
  return '<span class="hw-skill-bar" role="meter" aria-label="' + esc(label) + ' progress" aria-valuemin="0" aria-valuemax="100">'
    + '<i class="hw-skill-fill"></i><i class="hw-skill-ahead"></i></span>';
}

/**
 * One skill's progress inside `el` (its .hw-skill-bar and .hw-skill-xp) from the server's { level, into, need }
 * (skillLevelsOf), plus a pending `ahead` (0 for every ledger): a segment after the fill and the "XP to" words counting
 * down, marked `is-ahead`. The level is the server's: the segment stops at it.
 */
export function patchSkillProgress(el, r, ahead) {
  const a = mastered(r) ? 0 : Math.max(0, Number(ahead) || 0);
  const f = levelProgress(r, 0);
  const g = a ? levelProgress(r, a) : f;
  style(el.querySelector('.hw-skill-fill'), 'width', pct(f));
  const seg = el.querySelector('.hw-skill-ahead');
  style(seg, 'left', pct(f));
  style(seg, 'width', pct(g - f));
  attr(el.querySelector('.hw-skill-bar'), 'aria-valuenow', Math.round(f * 100));
  const xp = el.querySelector('.hw-skill-xp');
  text(xp, mastered(r) ? 'Mastered' : whole(Math.max(0, r.need - r.into - a)) + ' XP to ' + (r.level + 1));
  cls(xp, 'is-ahead', a > 0);
}

/* One entry (built once per skill by rows(), keyed by skill id); the guide is its tooltip. ONE UNLOCK A LINE (UI audit 2026-11-18:
   "Next at level 15: Scored Earth Rune (rune for staves), Scored Water Rune…" ran four lines a skill on the sheet): the first thing
   the next level opens and a count of the rest; every one, with its kind, is the line's tooltip and shows in full while the entry
   has the keyboard's focus. */
function entryHtml(g, id) {
  const guide = SKILL_GUIDE[id];
  const name = SKILLS_DEF[id].name;
  return '<li class="hw-skill" tabindex="0"' + (guide ? ' title="' + esc(name + ': ' + guide.use + ' ' + guide.where) + '"' : '') + '>'
    + '<span class="hw-skill-top"><span class="hw-skill-glyph">' + glyphSvg(g, guide ? guide.glyph : 'uiStar') + '</span>'
    + '<b class="hw-skill-name">' + esc(name) + '</b><b class="hw-skill-lv"></b></span>'
    + '<span class="hw-skill-mid">' + skillBarHtml(name)
    + '<small class="hw-skill-xp"></small></span><small class="hw-skill-next"><span class="hw-skill-one"></span><span class="hw-skill-more"></span></small>'
    + '<small class="hw-skill-all"></small></li>';
}

/** A skill's unlock line: { one, more, all } (one: the first thing its next level opens; more: "+N more"; all: every one, with its
    kind, nextUnlock's words). `before` leads both (Inner Flame's recovery). Pure. */
export function unlockLine(id, level, before) {
  const n = nextUnlocks(id, level);
  const one = [before, n ? t('work.skill_next', { level: n.level, name: n.all[0].name }) : ''].filter(Boolean).join('. ');
  return { one, more: n && n.all.length > 1 ? t('work.skill_more', { count: n.all.length - 1 }) : '', all: [before, nextUnlock(id, level)].filter(Boolean).join('. ') };
}

/**
 * A skills window over some SKILLS_DEF categories: [[cat, heading]], drawn in that order.
 * @returns {Function} a component renderer (skeleton + .patch)
 */
function skillsWindow(groups) {
  const render = function renderSkills() {
    return '<div class="hw-skills">'
      + groups.map(([cat, label]) => '<section class="hw-skill-group"><h3 class="hw-skill-head">' + esc(label) + '</h3><ul class="hw-skill-list" data-cat="' + cat + '"></ul></section>').join('')
      + '<p class="hh-empty hw-skill-none">Loading skills…</p></div>';
  };
  render.patch = function patchSkills(body, ctx) {
    const sk = skillLevelsOf(ctx.character);
    /* Inner Flame's payoff, the SERVER's engine sheet (regen_pct, the Character sheet's Regeneration line), or nothing */
    const sheet = characterSheetOf(ctx.character);
    const regen = sheet && sheet.combat ? sheet.combat.regenPct : null;
    const root = body.querySelector('.hw-skills');
    cls(root.querySelector('.hw-skill-none'), 'is-on', !sk);
    for (const [cat] of groups) {
      const ids = Object.keys(SKILLS_DEF).filter((id) => SKILLS_DEF[id].cat === cat);
      /* the skills the server states, in this build's order; one it does not state draws no entry (never a level 1 of ours) */
      rows(root.querySelector('.hw-skill-list[data-cat="' + cat + '"]'), sk ? ids.filter((id) => sk[id]) : [], {
        key: (id) => id,
        build: (id) => element(ctx.doc, entryHtml(ctx.glyphs, id)),
        patch: (li, id) => {
          const r = sk[id];
          text(li.querySelector('.hw-skill-lv'), String(r.level));
          patchSkillProgress(li, r, 0);
          /* Inner Flame's payoff on its own line (lane/b-first-hour): the recovery the server's sheet says it gives now,
             before its next fuel; nothing until the server has said. */
          const flame = id === 'inner_flame' && regen !== null && regen > 100 ? 'Recovery +' + Math.round((regen - 100) * 10) / 10 + '%' : '';
          const u = unlockLine(id, r.level, flame);
          const nx = li.querySelector('.hw-skill-next');
          text(nx.querySelector('.hw-skill-one'), u.one);
          text(nx.querySelector('.hw-skill-more'), u.more);
          attr(nx, 'title', u.all || null);
          text(li.querySelector('.hw-skill-all'), u.all);
        },
      });
    }
  };
  return render;
}

/* The combat ledger is the Character window's (src/shell/windows/character/sheet.js): the
   combat skills sit beside the numbers they make. */
export const combatLedger = skillsWindow([['combat', 'Combat skills']]);

/* ── THE TRADES' LEDGER (the Work window's; 09-crafting 4.17) ───────────────────────────────────────────────────────────────────── */

/* The trades that ship, by stage, in TRADES' order; a new trade row joins its group with no code. */
const TRADE_GROUPS = Object.freeze([['gather', 'Gathering'], ['make', 'Crafting']]);
const shipped = (stage) => Object.keys(TRADES).filter((id) => TRADES[id].ships === 'v030' && TRADES[id].stage === stage);

let NEXT_JOBS = null;
/* trade -> its jobs, lowest Level first (src/core/trades.js jobRecipes, the rows hr_trade_job_start sells), built once */
function jobsOf(trade) {
  if (!NEXT_JOBS) {
    NEXT_JOBS = new Map();
    for (const j of jobRecipes()) { if (!NEXT_JOBS.has(j.trade)) NEXT_JOBS.set(j.trade, []); NEXT_JOBS.get(j.trade).push(j); }
    for (const list of NEXT_JOBS.values()) list.sort((a, b) => a.R - b.R);
  }
  return NEXT_JOBS.get(trade) || [];
}

/** A trade's unlock line at the server's Level: { one, more, all } (the first job the next Level that opens one opens, how many more open
    there, every one of them by name). Pure. */
export function tradeUnlockLine(trade, level) {
  const next = jobsOf(trade).filter((j) => j.R > level);
  if (!next.length) return { one: '', more: '', all: '' };
  const at = next.filter((j) => j.R === next[0].R);
  return { one: t('work.skill_next', { level: next[0].R, name: at[0].name }), more: at.length > 1 ? t('work.skill_more', { count: at.length - 1 }) : '',
    all: t('work.skill_next', { level: next[0].R, name: at.map((j) => j.name).join(', ') }) };
}

/** A trade's { level, into, need } for the bar: the server's Level and XP, the marks from the trades' one table; null when the server's XP
    is not inside the server's Level there (then the bar is not drawn, never a level of ours). Pure. */
export function tradeProgress(r) {
  const tbl = tradeXpTable();
  const lo = tbl[r.level - 1], hi = r.level < tbl.length ? tbl[r.level] : null;
  if (!Number.isSafeInteger(lo) || r.xp < lo || (hi !== null && r.xp >= hi)) return null;
  return { level: r.level, into: r.xp - lo, need: hi === null ? 0 : hi - lo };
}

const guideOf = (id) => SKILL_GUIDE[id] || (TRADES[id] && TRADES[id].was ? SKILL_GUIDE[TRADES[id].was] : null) || null;

function tradeEntryHtml(g, id) {
  const guide = guideOf(id);
  const name = TRADES[id].name;
  return '<li class="hw-skill" tabindex="0" data-key="' + esc(id) + '">'
    + '<span class="hw-skill-top"><span class="hw-skill-glyph">' + glyphSvg(g, guide ? guide.glyph : 'uiStar') + '</span>'
    + '<b class="hw-skill-name">' + esc(name) + '</b><b class="hw-skill-lv"></b></span>'
    + '<span class="hw-skill-mid">' + skillBarHtml(name)
    + '<small class="hw-skill-xp"></small></span><small class="hw-skill-next"><span class="hw-skill-one"></span><span class="hw-skill-more"></span></small>'
    + '<small class="hw-skill-all"></small></li>';
}

/**
 * THE TRADES' LEDGER: the company's trade Levels as the server's `trade_jobs.trades` states them, one entry a trade it states, two groups
 * (Gathering, Crafting). Nothing while the server sends no section (the switch is dark). A component renderer (skeleton + .patch).
 */
export function tradeLedger() {
  return '<div class="hw-skills hw-trades">'
    + TRADE_GROUPS.map(([stage, label]) => '<section class="hw-skill-group"><h3 class="hw-skill-head">' + esc(label) + '</h3><ul class="hw-skill-list" data-cat="' + stage + '"></ul></section>').join('')
    + '</div>';
}

tradeLedger.patch = function patchTradeLedger(body, ctx) {
  const root = body.querySelector('.hw-trades');
  if (!root) return;
  const s = tradeJobsOf(ctx.character);
  const levels = s ? s.trades : null;
  attr(root, 'hidden', levels ? null : '');
  for (const [stage] of TRADE_GROUPS) {
    const ids = levels ? shipped(stage).filter((id) => levels[id]) : [];
    const list = root.querySelector('.hw-skill-list[data-cat="' + stage + '"]');
    attr(list.parentNode, 'hidden', ids.length ? null : '');
    rows(list, ids, {
      key: (id) => id,
      build: (id) => element(ctx.doc, tradeEntryHtml(ctx.glyphs, id)),
      patch: (li, id) => {
        const r = levels[id];
        text(li.querySelector('.hw-skill-lv'), String(r.level));
        const p = tradeProgress(r);
        cls(li, 'is-nobar', !p);
        if (p) patchSkillProgress(li, p, 0);
        else text(li.querySelector('.hw-skill-xp'), whole(r.xp) + ' XP');
        const u = tradeUnlockLine(id, r.level);
        const next = li.querySelector('.hw-skill-next');
        text(next.querySelector('.hw-skill-one'), u.one);
        text(next.querySelector('.hw-skill-more'), u.more);
        attr(next, 'title', u.all || null);
        text(li.querySelector('.hw-skill-all'), u.all);
      },
    });
  }
};

