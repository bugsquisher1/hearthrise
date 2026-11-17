// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/wiki.js — THE WIKI: SKILLS, HUNTING GROUNDS AND FORMULAS, WRITTEN BY THE GAME ITSELF.
//
// Work ledger item 9 (Tyler: an in-game wiki with public formulas, from data, no hand-written pages that drift).
// Laid out like an encyclopedia, not a wall of cards: three sections behind tabs, each page a heading, a short
// table of facts and lines of text. The search reads across all three sections at once.
//
// Every page is src/shell/wiki-model.js's, generated from the data rows and the engine's functions; every word
// is a row of src/data/text/wiki.js. The pages never change while the game runs, so the body is built once per
// opening and the patch shows and hides pages for the tab and the search (src/render/paint.js); it redraws only what
// follows the server: the Chronicle's pages and the Level XP table's row for the viewed hero's Level.
// Each formula's worked example carries its stated terms and the engine's answer (data-wk-check), which
// tests/wiki-window.mjs recomputes: the page can never say one thing while a hunt does another. The two XP pages are
// tables (data-wk-xp) whose every row the same test works from the curves' data rows.
//
// DISPLAY ONLY (CLAUDE.md §6): catalogue facts, nothing a player can spend, no intent and no residue.
// ════════════════════════════════════════════════════════════════════════
import { prop, attr, text } from '../../render/paint.js?v=0.2.136';
import { whole, chance, listWords } from '../../render/format.js?v=0.2.136';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.136';
import { t } from '../../render/player-text.js?v=0.2.136';
import { glyphSvg } from '../widgets/bits.js?v=0.2.136';
import { skillPages, groundPages, formulaPages, levelXpRows } from '../wiki-model.js?v=0.2.136';
import { chronicleOf } from '../chronicle-model.js?v=0.2.136';
import { levelOf } from '../../session/character-sections.js?v=0.2.136';
import { linkHtml, targetOf } from '../goto.js?v=0.2.136';

/* THE BOOK (the top bar's groups, 2026-11-16): the Chronicle first, the story so far (Tyler: "Yeah build the chronicle"), then the wiki. */
const WIKI_SECTIONS = Object.freeze(['chronicle', 'skills', 'grounds', 'formulas']);
const SECTION_WORD = Object.freeze({ chronicle: 'chronicle.tab', skills: 'wiki.tab_skills', grounds: 'wiki.tab_grounds', formulas: 'wiki.tab_formulas' });

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs || SCRATCH); if (!s) { s = { tab: 'chronicle', query: '' }; SCRATCH.set(cs || SCRATCH, s); } return s; };

/* ── THE CHRONICLE (src/shell/chronicle-model.js): every page in the story's order. An open page is its title and the story; a shut one
   is its title under a lock, a line about itself and what opens it (the ground a link to its page in Hunts). Read as a book, top to
   bottom: no cards, the pages ruled apart like the wiki's. Its pages follow the server, so the section is rebuilt when one opens. */
const SLOT = '\u0001';
function howHtml(h) {
  if (h.words) return esc(h.words);
  const [before, after] = t('chronicle.how_ground', { ground: SLOT }).split(SLOT);
  return esc(before) + linkHtml(h.ground, targetOf({ kind: 'hunt', hunt: h.hunt })) + esc(after || '')
    + (h.band ? '<span class="ck-band">' + esc(t('hunts.level_band', { lo: h.band[0], hi: h.band[1] })) + '</span>' : '');
}
function chronicleHtml(ctx, c) {
  return '<p class="ck-found">' + esc(t('chronicle.found', { n: c.found, total: c.total })) + '</p>'
    + c.pages.map((p) => '<article class="wk-page ck-page' + (p.open ? '' : ' is-shut') + '" data-wk-sec="chronicle" data-wk-id="' + esc(p.id) + '">'
      + '<h4 class="wk-name">' + (p.open ? '' : glyphSvg(ctx.glyphs, 'uiLock')) + '<span>' + esc(p.title) + '</span></h4>'
      + (p.open ? p.paras.map((x) => '<p class="wk-text ck-text">' + esc(x) + '</p>').join('')
        : '<p class="ck-teaser">' + esc(p.teaser) + '</p><p class="ck-how">' + howHtml(p.how) + '</p>')
      + '</article>').join('');
}
/* The section's pages, redrawn only when the open set changes (its key), so a display tick does no work. */
function patchChronicle(sec, ctx) {
  const c = chronicleOf(ctx.character);
  if (sec.getAttribute('data-ck') === c.key) return;
  sec.setAttribute('data-ck', c.key);
  for (const el of sec.querySelectorAll(':scope > :not(.wk-sec-h)')) el.remove();
  sec.insertAdjacentHTML('beforeend', chronicleHtml(ctx, c));
}

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

/* Each formula: its name, its rule in words with the engine's constants, and the example worked by the engine's own function.
   A tougher monster's own factor is listed by value, never by its tier's number: no page shows a monster's tier, and a
   monster's page names its hunt's Tier (Normal, Dangerous, Deadly), a different thing (Tyler 2026-11-17, kill the class). */
const factors = (vals, word) => listWords([...new Set(vals)].sort((a, b) => a - b).map(word), Infinity, t('wiki.or'));
function formulaWords(f) {
  const T = f.terms, I = f.example.inputs, r = f.example.result;
  switch (f.id) {
    case 'hit': return { name: t('wiki.hit_name'),
      words: t('wiki.hit_words', { base: pc(T.base), per: pc(T.per), weak: extra(T.weak), min: pc(T.min), max: pc(T.max),
        list: factors(Object.values(T.defMul).map(extra), (pct) => t('wiki.hit_more', { pct })) }),
      example: t('wiki.hit_example', { level: I.level, monster: I.monster, def: I.def, result: pc(r) }) };
    case 'max': return { name: t('wiki.max_name'),
      words: t('wiki.max_words', { lvl: T.lvl, str: T.str, flat: T.flat, cut: T.cut, weak: extra(T.weak) }),
      example: t('wiki.max_example', { level: I.level, monster: I.monster, result: r }) };
    case 'mon_hit': return { name: t('wiki.mon_hit_name'),
      words: t('wiki.mon_hit_words', { base: pc(T.base), per: pc(T.per), min: pc(T.min), max: pc(T.max) }),
      example: t('wiki.mon_hit_example', { monster: I.monster, start: pc(I.baseAcc === null ? T.base : I.baseAcc), atk: I.atk, def: I.defense, result: pc(r) }) };
    case 'mon_max': return { name: t('wiki.mon_max_name'),
      words: t('wiki.mon_max_words', { scale: T.scale, list: factors(Object.values(T.byTier), String) }),
      example: t('wiki.mon_max_example', { monster: I.monster, atk: I.atk, result: whole(r) }) };
    case 'death': return { name: t('wiki.death_name'),
      words: t('wiki.death_words', { share: pc(T.share), cuts: listWords(T.cuts.map((pm, i) => t('wiki.death_cut', { pct: pm / 10, count: i + 1 })), Infinity) }),
      example: t('wiki.death_example', { level: I.level, xp: whole(I.xp), result: whole(r), blessed: whole(f.example.blessed) }) };
    default: return null;
  }
}

/* ── THE XP TABLES (Tyler 2026-11-17, on the bracket formula they replace: "This is very confusing"): a Level, the XP across it
   and the total that reaches it, like any MMO wiki's experience table. The Level table's gold row is the viewed hero's own
   Level, the server's (levelOf), redrawn by the patch whenever an envelope moves it (CLAUDE.md §6). */
const xpRowsHtml = (rows) => rows.map((r) => '<tr' + (r.me ? ' class="is-viewed" aria-current="true"' : '') + '><td>' + esc(whole(r.level)) + '</td><td>'
  + esc(whole(r.next)) + '</td><td>' + esc(whole(r.total)) + '</td></tr>').join('');
const xpTable = (kind, head, rows, me) => '<table class="wk-table wk-rows wk-xp" data-wk-xp="' + kind + '"' + (me === undefined ? '' : ' data-wk-me="' + esc(me) + '"')
  + '><thead><tr><th scope="col">' + esc(head) + '</th><th scope="col">' + esc(t('wiki.xp_next')) + '</th><th scope="col">' + esc(t('wiki.xp_total'))
  + '</th></tr></thead><tbody>' + xpRowsHtml(rows) + '</tbody></table>';
const heroLevelOf = (ctx) => { const lv = levelOf(ctx.character); return lv ? lv.level : null; };
const meKey = (level) => (level === null ? '' : String(level));
const label = (words) => '<p class="wk-text">' + esc(words) + '</p>';

function formulaHtml(f, heroLevel) {
  if (f.id === 'level_curve') return page('formulas', f.id, t('wiki.level_curve_name'), xpTable('level', t('wiki.xp_level_col'), f.rows, meKey(heroLevel)));
  if (f.id === 'skill_xp') return page('formulas', f.id, t('wiki.skill_xp_name'), (f.rows.length ? label(t('wiki.skill_uncapped')) : '')
    + (f.cap === null ? '' : label(t('wiki.skill_capped', { cap: f.cap }))) + xpTable('skill', t('wiki.xp_skill_col'), f.rows));
  const w = formulaWords(f);
  if (!w) return '';
  const check = JSON.stringify({ terms: f.terms, inputs: f.example.inputs, result: f.example.result, blessed: f.example.blessed });
  /* the rule as labels, one a line (Tyler 2026-11-16: outside lore a page states labels, never a paragraph) */
  return page('formulas', f.id, w.name, w.words.split('\n').map(label).join('')
    + '<p class="wk-example" data-wk-formula="' + esc(f.id) + '" data-wk-check="' + esc(check) + '"><b>' + esc(t('wiki.example')) + '</b> ' + esc(w.example) + '</p>');
}
/* The Level table's rows follow the server: redrawn only when the viewed hero's Level moves (its key), so a display tick does no work. */
function patchLevelTable(root, ctx) {
  const table = root.querySelector('table[data-wk-xp="level"]');
  const level = heroLevelOf(ctx);
  if (!table || table.getAttribute('data-wk-me') === meKey(level)) return;
  table.setAttribute('data-wk-me', meKey(level));
  table.tBodies[0].innerHTML = xpRowsHtml(levelXpRows(level));
  /* the search's words for the page are read again */
  table.closest('.wk-page').removeAttribute('data-wk-find');
}

/** The whole wiki, built once per opening: the search, the tabs, then every page of every section. */
export function renderWiki(ctx) {
  const g = ctx.glyphs;
  const level = heroLevelOf(ctx);
  /* the Chronicle's pages are drawn by the patch (they follow the server) */
  const secs = { chronicle: [], skills: skillPages().map((s) => skillHtml(ctx, s)), grounds: groundPages().map(groundHtml),
    formulas: formulaPages(level).map((f) => formulaHtml(f, level)) };
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
  patchChronicle(root.querySelector('section.wk-sec[data-wk-sec="chronicle"]'), ctx);
  patchLevelTable(root, ctx);
  const q = sc.query.trim().toLowerCase();
  /* the count of pages found reads beside the pages, not over a search's matches */
  prop(root.querySelector('.ck-found'), 'hidden', !!q);
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
