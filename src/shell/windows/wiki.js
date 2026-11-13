// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/wiki.js — THE WIKI: SKILLS, HUNTING GROUNDS AND FORMULAS, WRITTEN BY THE GAME ITSELF.
//
// Work ledger item 9 (Tyler: an in-game wiki with public formulas, from data, no hand-written pages that drift).
// Laid out like an encyclopedia, not a wall of cards: three sections behind tabs, each page a heading, a short
// table of facts and lines of text. The search reads across all three sections at once.
//
// Every page is src/shell/wiki-model.js's, generated from the data rows and the engine's functions; every word
// is a row of src/data/text/wiki.js. The pages never change while the game runs, so the body is built once per
// opening and the patch only shows and hides pages for the tab and the search (src/render/paint.js).
// Each formula's worked example carries its stated terms and the engine's answer (data-wk-check), which
// tests/wiki-window.mjs recomputes: the page can never say one thing while a hunt does another.
//
// DISPLAY ONLY (CLAUDE.md §6): catalogue facts, nothing a player can spend, no intent and no residue.
// ════════════════════════════════════════════════════════════════════════
import { prop, attr, text } from '../../render/paint.js?v=0.2.128';
import { whole, chance, listWords } from '../../render/format.js?v=0.2.128';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.128';
import { t } from '../../render/player-text.js?v=0.2.128';
import { glyphSvg } from '../widgets/bits.js?v=0.2.128';
import { skillPages, groundPages, formulaPages } from '../wiki-model.js?v=0.2.128';

const WIKI_SECTIONS = Object.freeze(['skills', 'grounds', 'formulas']);
const SECTION_WORD = Object.freeze({ skills: 'wiki.tab_skills', grounds: 'wiki.tab_grounds', formulas: 'wiki.tab_formulas' });

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs || SCRATCH); if (!s) { s = { tab: 'skills', query: '' }; SCRATCH.set(cs || SCRATCH, s); } return s; };

/* A share as the page says it: 0.65 -> 65, 0.015 -> 1.5. A multiplier's extra: 1.15 -> 15. */
const pc = (f) => Math.round(f * 1000) / 10;
const extra = (m) => Math.round((m - 1) * 1000) / 10;
const fact = (label, value) => '<div class="mf-fact"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
const page = (sec, id, name, inner, glyph) => '<article class="wk-page" data-wk-sec="' + sec + '" data-wk-id="' + esc(id) + '">'
  + '<h4 class="wk-name">' + (glyph || '') + '<span>' + esc(name) + '</span></h4>' + inner + '</article>';
/* A curve as Level and XP pairs that wrap on a narrow sheet. */
const curveTable = (curve) => '<div class="wk-curve"><p class="wk-curve-h">' + esc(t('wiki.xp_head')) + '</p><dl>'
  + curve.map((c) => '<div><dt>' + esc(t('wiki.xp_level', { level: c.level })) + '</dt><dd>' + esc(whole(c.xp)) + '</dd></div>').join('') + '</dl></div>';

function skillHtml(ctx, s) {
  const name = s.kind === 'level' ? t('wiki.level_name') : s.name;
  const trains = s.kind === 'level' ? t('wiki.level_trains') : s.trains;
  const feeds = s.kind === 'level' ? t('wiki.level_feeds') : s.feeds;
  const cap = s.kind === 'level' || s.cap === null ? t('wiki.no_cap') : whole(s.cap);
  return page('skills', s.id, name, '<dl class="mf-facts">' + fact(t('wiki.trained_by'), trains) + fact(t('wiki.good_for'), feeds)
    + fact(t('wiki.top_level'), cap) + '</dl>' + curveTable(s.curve), s.glyph ? glyphSvg(ctx.glyphs, s.glyph) : '');
}

function groundHtml(g) {
  const mons = g.monsters.map((m) => '<li><b>' + esc(m.name) + '</b> <small>' + esc(t(m.boss ? 'wiki.monster_boss' : 'wiki.monster_line', { level: m.level })) + '</small></li>').join('');
  const drops = g.drops.map((d) => '<li class="wk-drop"><span><b>' + esc(d.name) + '</b> <small>'
    + esc(d.from ? t('wiki.drop_from', { monster: d.from }) : t('wiki.drop_here')) + '</small></span><span class="hw-hd-odds">' + esc(chance(d.chance)) + '</span></li>').join('');
  return page('grounds', g.id, g.name, (g.band ? '<p class="wk-sub">' + esc(t('wiki.band', { lo: g.band[0], hi: g.band[1] })) + '</p>' : '')
    + (g.theme ? '<p class="wk-text">' + esc(g.theme) + '</p>' : '')
    + '<h5 class="wk-h">' + esc(t('wiki.monsters')) + '</h5><ul class="wk-list">' + mons + '</ul>'
    + '<h5 class="wk-h">' + esc(t('wiki.drops')) + ' <small>' + esc(t('monster.per_kill')) + '</small></h5>'
    + (drops ? '<ul class="wk-list">' + drops + '</ul>' : '<p class="wk-text">' + esc(t('wiki.no_drops')) + '</p>'));
}

/* Each formula: its name, its rule in words with the engine's constants, and the example worked by the engine's own function. */
function formulaWords(f) {
  const T = f.terms, I = f.example.inputs, r = f.example.result;
  switch (f.id) {
    case 'hit': return { name: t('wiki.hit_name'),
      words: t('wiki.hit_words', { base: pc(T.base), per: pc(T.per), weak: extra(T.weak), min: pc(T.min), max: pc(T.max) }) + ' '
        + t('wiki.hit_tiers', { list: listWords(Object.keys(T.defMul).map((tier) => t('wiki.hit_tier', { tier, pct: extra(T.defMul[tier]) })), Infinity) }),
      example: t('wiki.hit_example', { level: I.level, monster: I.monster, def: I.def, result: pc(r) }) };
    case 'max': return { name: t('wiki.max_name'),
      words: t('wiki.max_words', { lvl: T.lvl, str: T.str, flat: T.flat, cut: T.cut, weak: extra(T.weak) }),
      example: t('wiki.max_example', { level: I.level, monster: I.monster, result: r }) };
    case 'mon_hit': return { name: t('wiki.mon_hit_name'),
      words: t('wiki.mon_hit_words', { base: pc(T.base), per: pc(T.per), min: pc(T.min), max: pc(T.max) }),
      example: t('wiki.mon_hit_example', { monster: I.monster, start: pc(I.baseAcc === null ? T.base : I.baseAcc), atk: I.atk, def: I.defense, result: pc(r) }) };
    case 'mon_max': return { name: t('wiki.mon_max_name'),
      words: t('wiki.mon_max_words', { scale: T.scale, list: listWords(Object.keys(T.byTier).map((tier) => t('wiki.mon_max_tier', { scale: T.byTier[tier], tier })), Infinity) }),
      example: t('wiki.mon_max_example', { monster: I.monster, atk: I.atk, result: whole(r) }) };
    case 'level_curve': return { name: t('wiki.level_curve_name'), words: t('wiki.level_curve_words'),
      example: t('wiki.level_curve_example', { level: I.level, result: whole(r) }) };
    case 'skill_xp': return { name: t('wiki.skill_xp_name'),
      words: t('wiki.skill_xp_words', { base: T.base, growth: 1 + T.growthPermille / 1000, skills: listWords(T.uncapped, Infinity), cap: T.cap }),
      example: t('wiki.skill_xp_example', { level: I.level, result: whole(r) }) };
    case 'death': return { name: t('wiki.death_name'),
      words: t('wiki.death_words', { share: pc(T.share), cuts: listWords(T.cuts.map((pm, i) => t('wiki.death_cut', { pct: pm / 10, count: i + 1 })), Infinity) }),
      example: t('wiki.death_example', { xp: whole(I.xp), result: whole(r), blessed: whole(f.example.blessed) }) };
    default: return null;
  }
}

/* The Level curve's brackets as a table: where each starts, its base, its step and its curve. */
const levelTable = (rows) => '<table class="wk-table wk-rows"><tr><th scope="col">' + esc(t('wiki.level_from')) + '</th><th scope="col">' + esc(t('wiki.level_base'))
  + '</th><th scope="col">' + esc(t('wiki.level_step')) + '</th><th scope="col">' + esc(t('wiki.level_curve')) + '</th></tr>'
  + rows.map((r) => '<tr><td>' + esc(whole(r.from)) + '</td><td>' + esc(whole(r.first)) + '</td><td>' + esc(whole(r.rise)) + '</td><td>' + esc(whole(r.bend)) + '</td></tr>').join('') + '</table>';

function formulaHtml(f) {
  const w = formulaWords(f);
  if (!w) return '';
  const check = JSON.stringify({ terms: f.terms, inputs: f.example.inputs, result: f.example.result, blessed: f.example.blessed });
  return page('formulas', f.id, w.name, '<p class="wk-text">' + esc(w.words) + '</p>' + (f.id === 'level_curve' ? levelTable(f.terms.rows) : '')
    + '<p class="wk-example" data-wk-formula="' + esc(f.id) + '" data-wk-check="' + esc(check) + '"><b>' + esc(t('wiki.example')) + '</b> ' + esc(w.example) + '</p>');
}

/** The whole wiki, built once per opening: the search, the tabs, then every page of every section. */
export function renderWiki(ctx) {
  const g = ctx.glyphs;
  const secs = { skills: skillPages().map((s) => skillHtml(ctx, s)), grounds: groundPages().map(groundHtml), formulas: formulaPages().map(formulaHtml) };
  return '<div class="wk">'
    + '<div class="hw-find"><span class="hw-search">' + glyphSvg(g, 'uiSearch') + '<input type="search" class="hh-num hw-q" data-hs-act="wk-search" placeholder="'
    + esc(t('wiki.search')) + '" aria-label="' + esc(t('wiki.search')) + '" autocomplete="off"></span></div>'
    + '<div class="hw-tabs" role="tablist">' + WIKI_SECTIONS.map((s) => '<button type="button" role="tab" class="hw-tab" data-hs-act="wk-tab" data-tab="' + s + '" aria-selected="false">'
      + esc(t(SECTION_WORD[s])) + '</button>').join('') + '</div>'
    + '<p class="hs-note wk-none" hidden></p>'
    + WIKI_SECTIONS.map((s) => '<section class="wk-sec" data-wk-sec="' + s + '"><h3 class="hw-hd-h wk-sec-h">' + esc(t(SECTION_WORD[s])) + '</h3>' + secs[s].join('') + '</section>').join('')
    + '</div>';
}

/* A page's words, lower-cased once, for the search. */
const findText = (el) => { let s = el.getAttribute('data-wk-find'); if (s === null) { s = el.textContent.toLowerCase(); el.setAttribute('data-wk-find', s); } return s; };

renderWiki.patch = function patchWiki(body, ctx) {
  const sc = scratchOf(ctx.character);
  const root = body.querySelector('.wk');
  if (!root) return;
  const q = sc.query.trim().toLowerCase();
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(!q && b.getAttribute('data-tab') === sc.tab));
  let shown = 0;
  for (const sec of root.querySelectorAll('section.wk-sec')) {
    let here = 0;
    for (const p of sec.querySelectorAll('.wk-page')) {
      const on = q ? findText(p).includes(q) : sec.getAttribute('data-wk-sec') === sc.tab;
      prop(p, 'hidden', !on);
      if (on) here++;
    }
    prop(sec, 'hidden', !here);
    /* the section's heading names where a match was found; a tab already names it */
    prop(sec.querySelector('.wk-sec-h'), 'hidden', !q);
    shown += here;
  }
  const none = root.querySelector('.wk-none');
  prop(none, 'hidden', shown > 0);
  text(none, shown > 0 ? '' : t('wiki.none', { query: sc.query.trim() }));
};

renderWiki.events = Object.freeze(['input']);
renderWiki.act = function actWiki(ctx, body, action, ev, el) {
  const sc = scratchOf(ctx.character);
  if (action === 'wk-search' && ev.type === 'input') { sc.query = String(el.value || '').slice(0, 40); }
  else if (action === 'wk-tab' && ev.type === 'click') {
    sc.tab = el.getAttribute('data-tab'); sc.query = '';
    const box = body.querySelector('.hw-q');
    if (box) box.value = '';
    body.scrollTop = 0;
  } else return false;
  renderWiki.patch(body, ctx);
  return true;
};
