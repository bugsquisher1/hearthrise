// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/monster.js — ONE MONSTER'S PAGE: WHAT IT IS, HOW IT FIGHTS, WHAT A KILL PAYS.
//
// Tyler 2026-11-09: every monster's stats are visible in the game, so players choose their own hunts and
// the Hunts window only suggests by Level. The first page of the in-game wiki, laid out like an
// encyclopedia's: the creature as the world draws it, facing front, beside its name; where it lives (each
// ground a link back to its Hunts page); a table of how it fights on Normal, then what each harder tier
// changes on the ground it was opened from (Tyler 2026-11-11); what a kill pays; and every drop with
// its chance per kill and what the item is for (a link where a window spends it). Facts about this
// monster only: a line that explains how the game works is cut (Tyler 2026-11-11).
//
// A creature on a hunt's page opens it (hunt-detail.js marks it with factsTarget, naming that ground: the shell's
// one link door, src/shell/goto.js, opens this window on that monster). On a phone it is the one sheet, and a
// ground's link is the way back.
//
// DISPLAY ONLY (CLAUDE.md §6): catalogue facts, nothing a player can spend, no intent and no residue.
// Every number is src/shell/monster-facts.js's, read from the rows the server's catalogue is generated
// from; this module types none. One set of numbers for every group size (Tyler 2026-11-08). Every word is a row of src/data/text/monster.js.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, prop, attr, cls, element } from '../../render/paint.js?v=0.2.129';
import { chance, whole, listWords } from '../../render/format.js?v=0.2.129';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.129';
import { t, hasText } from '../../render/player-text.js?v=0.2.129';
import { headPathFor } from '../../data/monster-art.js?v=0.2.129';
import { creatureArt, drawCreature, PORTRAIT_DIR } from '../../render/creature-sprite.js?v=0.2.129';
import { itemIconHtml } from '../widgets/bits.js?v=0.2.129';
import { TIER_NAME, DEFAULT_TIER } from '../../data/hunt-tiers.js?v=0.2.129';
import { monsterFactsOf, isMet } from '../monster-facts.js?v=0.2.129';
import { targetOf, placesParts, patchParts } from '../goto.js?v=0.2.129';

const WIN = targetOf({ kind: 'monster', id: 'x' }).win;
/* The world's one density (ART_DIRECTION §2): every art pixel is 2x2 screen px, facing the player. */
const PORTRAIT = Object.freeze({ scale: 2, dir: PORTRAIT_DIR });
const VERSION = new URL(import.meta.url).searchParams.get('v') || '';
let ART = null;
const asked = new Set();

const SCRATCH = new WeakMap();
/* `id`: the monster on this character's page. `from`: the ground (hunt id) its page was opened from, or null. `facts`: its facts as last worked out. */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { id: null, from: null, facts: null }; SCRATCH.set(cs, s); } return s; };

/** The link that opens monster `id`'s page (src/shell/goto.js linkHtml, gotoAttr); `hunt`, the ground it was opened from, picks
    whose harder tiers the page states (a link's `find`, taken by this page as it opens, never a row to ring). */
export const factsTarget = (id, hunt = null) => ({ win: WIN, tab: id, find: hunt || null });

const fact = (key, label) => '<div class="mf-fact"><dt>' + esc(t(label)) + '</dt><dd data-fact="' + key + '"></dd></div>';
const head = (label, per) => '<h4 class="hw-hd-h">' + esc(t(label)) + (per ? ' <small class="hw-hd-per ' + per + '"></small>' : '') + '</h4>';

/** The page's skeleton (built once per opening); the labels are the text home's, the values are patched in. */
export function renderMonster() {
  return '<article class="mf">'
    + '<p class="hs-note mf-none"><span class="mf-none-words"></span> <span class="mf-none-go"></span></p>'
    + '<div class="mf-page">'
    + '<header class="mf-head"><span class="mf-stand"><canvas class="mf-sprite" aria-hidden="true"></canvas></span>'
    + '<span class="mf-face" hidden></span>'
    + '<div class="mf-id"><h3 class="mf-name"></h3><p class="mf-kind"></p></div></header>'
    + head('monster.h_homes') + '<ul class="mf-homes"></ul>'
    + head('monster.h_fight') + '<dl class="mf-facts">'
    + fact('tier', 'monster.tier') + fact('hp', 'monster.hp') + fact('max_hit', 'monster.max_hit') + fact('swing', 'monster.swing') + fact('deals', 'monster.deals')
    + fact('weak', 'monster.weak') + fact('takes', 'monster.takes') + '</dl>'
    + '<p class="mf-note mf-tiers"></p>'
    + head('monster.h_kill') + '<dl class="mf-facts">' + fact('xp', 'monster.xp') + fact('gold', 'monster.gold') + '</dl>'
    + head('monster.h_drops', 'mf-per') + '<ul class="mf-drops"></ul><p class="mf-note mf-nodrops"></p>'
    + '</div></article>';
}

const homeHtml = () => '<li class="mf-home"><span class="mf-home-go"></span><small class="mf-home-how"></small><small class="mf-home-party"></small></li>';
const dropHtml = (ctx, d) => '<li class="mf-drop" data-item="' + esc(d.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, d.id) + '</span>'
  + '<span class="mf-drop-what"><b class="mf-drop-name"></b><small class="mf-drop-band"></small></span><span class="hw-hd-odds mf-odds"></span><p class="mf-drop-use"></p></li>';

/* A word keyed by a data value (an element, a share of the spawns, a loot band), or '' when the table has no row for it yet. */
const elWord = (e) => (hasText('monster.el_' + e) ? t('monster.el_' + e) : '');
const howWord = (h) => (hasText('monster.how_' + h) ? t('monster.how_' + h) : '');
const bandWord = (b) => (hasText('monster.band_' + b) ? t('monster.band_' + b) : '');

/* "25% less from Fire and 15% more from Ice", or that it takes every element in full. */
function takesWords(els) {
  if (!els.length) return t('monster.takes_all');
  return listWords(els.map((e) => t(e.pct > 0 ? 'monster.el_less' : 'monster.el_more', { pct: Math.abs(e.pct), element: elWord(e.element) })), Infinity);
}

/* How much harder a tier hits, from its damage dial (permille of Normal): "17% harder", or from twice as hard up "2.7 times as hard". */
const hitsWords = (pm) => (pm >= 2000 ? t('monster.hits_times', { times: Math.round(pm / 100) / 10 }) : t('monster.hits_pct', { pct: Math.round((pm - 1000) / 10) }));

/* "On Dangerous it has 10% more Health and hits 17% harder. On Deadly …": what each harder tier raises, its dials in words; '' on a
   ground with no harder tier. */
function tiersWords(tiers) {
  return tiers.map((x) => {
    const tier = TIER_NAME[x.tier] || x.tier;
    const hp = Math.round((x.hpPm - 1000) / 10);
    const hits = x.dmgPm > 1000 ? hitsWords(x.dmgPm) : '';
    if (hp > 0 && hits) return t('monster.tier_both', { tier, hp, hits });
    return hits ? t('monster.tier_hits', { tier, hits }) : hp > 0 ? t('monster.tier_hp', { tier, hp }) : '';
  }).filter(Boolean).join(' ');
}

/* The creature's head in its well beside the name (art brief 15, as the Tally draws it): a 32 px bust, kept per creature so a repaint with the
   same one writes nothing; a creature the head set has none for draws no well. It sits in the page's own title row, so it holds as a page of Hunts. */
function paintFace(root, ctx, id) {
  const well = root.querySelector('.mf-face'), src = headPathFor(id);
  prop(well, 'hidden', !src);
  if (well.getAttribute('data-head') === (src ? id : '')) return;
  well.replaceChildren();
  if (src) well.appendChild(element(ctx.doc, '<img class="hh-icon mf-head-img" src="' + esc(src) + '" alt="" width="32" height="32" decoding="async">'));
  attr(well, 'data-head', src ? id : '');
}

/* The creature's picture, once per monster; its art is asked for once and the page patched again when it lands. */
function paintPortrait(root, ctx, id) {
  const stand = root.querySelector('.mf-stand'), c = stand.querySelector('canvas');
  if (!asked.has(id)) {
    asked.add(id);
    creatureArt(ctx.doc, VERSION, [id]).then((a) => { ART = a; ctx.refresh(WIN); }, () => asked.delete(id));
  }
  if (c.getAttribute('data-drawn') === id) return;
  const ok = !!ART && ART.has(id) && drawCreature(c, ART, id, PORTRAIT);
  cls(stand, 'is-drawn', ok);
  if (ok) c.setAttribute('data-drawn', id); else c.removeAttribute('data-drawn');
}

renderMonster.patch = function patchMonster(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  /* a creature's link named a monster (goto.js): only one a player can meet gets a page */
  const want = ctx.wm && typeof ctx.wm.takeTab === 'function' ? ctx.wm.takeTab(WIN) : null;
  /* the same press named the ground it was opened from (factsTarget's find), spent here: no row of this page is rung for it */
  const from = want && typeof ctx.wm.takeFind === 'function' ? ctx.wm.takeFind(WIN) : null;
  if (want && isMet(want) && (want !== sc.id || from !== sc.from)) {
    if (want !== sc.id) body.scrollTop = 0;
    sc.id = want; sc.from = from; sc.facts = null;
  }
  if (sc.id && !sc.facts) sc.facts = monsterFactsOf(sc.id, sc.from);
  const f = sc.id ? sc.facts : null;
  const root = body.querySelector('.mf');
  prop(root.querySelector('.mf-none'), 'hidden', !!f);
  prop(root.querySelector('.mf-page'), 'hidden', !f);
  if (!f) {
    text(root.querySelector('.mf-none-words'), t('monster.none'));
    patchParts(root.querySelector('.mf-none-go'), [{ words: t('monster.open_hunts'), target: { win: 'hunts', tab: null, find: null } }]);
    return;
  }
  attr(root, 'data-monster', f.id);
  paintPortrait(root, ctx, f.id);
  paintFace(root, ctx, f.id);
  text(root.querySelector('.mf-name'), f.name);
  text(root.querySelector('.mf-kind'), t(f.boss ? 'monster.kind_boss' : 'monster.kind', { family: f.family, level: f.level }));
  rows(root.querySelector('.mf-homes'), f.homes, {
    key: (h) => h.hunt,
    build: () => element(ctx.doc, homeHtml()),
    patch: (li, h) => {
      patchParts(li.querySelector('.mf-home-go'), [{ words: h.name, target: targetOf({ kind: 'hunt', hunt: h.hunt }) }]);
      text(li.querySelector('.mf-home-how'), h.band ? t('monster.home', { lo: h.band[0], hi: h.band[1], how: howWord(h.how) }) : howWord(h.how));
      text(li.querySelector('.mf-home-party'), h.warn);
    },
  });
  const set = (key, words) => text(root.querySelector('[data-fact="' + key + '"]'), words);
  set('tier', TIER_NAME[DEFAULT_TIER]);
  set('hp', whole(f.hp));
  set('max_hit', whole(f.maxHit));
  set('swing', t('monster.swing_value', { secs: f.swingMs / 1000 }));
  set('deals', elWord(f.deals));
  const weak = f.weak && hasText('monster.weak_' + f.weak.weapon) ? t('monster.weak_' + f.weak.weapon, { pct: f.weak.damagePct, acc: f.weak.accuracyPct }) : '';
  set('weak', weak);
  prop(root.querySelector('[data-fact="weak"]').parentElement, 'hidden', !weak);
  set('takes', takesWords(f.elements));
  text(root.querySelector('.mf-tiers'), tiersWords(f.tiers));
  set('xp', whole(f.xp));
  set('gold', f.gold[0] === f.gold[1] ? t('monster.gold_one', { lo: whole(f.gold[0]) }) : t('monster.gold_value', { lo: whole(f.gold[0]), hi: whole(f.gold[1]) }));
  text(root.querySelector('.mf-per'), f.drops.length ? t('monster.per_kill') : '');
  rows(root.querySelector('.mf-drops'), f.drops, {
    key: (d) => f.id + ':' + d.id,
    build: (d) => element(ctx.doc, dropHtml(ctx, d)),
    patch: (li, d) => {
      text(li.querySelector('.mf-drop-name'), d.name);
      text(li.querySelector('.mf-drop-band'), bandWord(d.band));
      attr(li, 'data-band', d.band);
      text(li.querySelector('.mf-odds'), chance(d.chance));
      patchParts(li.querySelector('.mf-drop-use'), placesParts(d.uses));
    },
  });
  text(root.querySelector('.mf-nodrops'), f.drops.length ? '' : t('monster.no_drops'));
};
