// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/monster.js — ONE MONSTER'S PAGE: WHAT IT IS, HOW IT FIGHTS, WHAT A KILL PAYS.
//
// Tyler 2026-11-09: every monster's stats are visible in the game, so players choose their own hunts and
// the Hunts window only suggests by Level. The first page of the in-game wiki, laid out like an
// encyclopedia's: the creature as the world draws it, facing front, beside its name; where it lives (each
// ground a link back to its Hunts page); a table of how it fights; what a kill pays; and every drop with
// its chance per kill and what the item is for (a link where a window spends it).
//
// A creature on a hunt's page opens it (hunt-detail.js marks it with factsTarget: the shell's one link
// door, src/shell/goto.js, opens this window on that monster). On a phone it is the one sheet, and a
// ground's link is the way back.
//
// DISPLAY ONLY (CLAUDE.md §6): catalogue facts, nothing a player can spend, no intent and no residue.
// Every number is src/shell/monster-facts.js's, read from the rows the server's catalogue is generated
// from; this module types none. The party's size (the server's seat count) only picks which size the
// facts are shown for. Every word is a row of src/data/text/monster.js.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, prop, attr, cls, element } from '../../render/paint.js?v=0.2.112';
import { chance, whole, listWords } from '../../render/format.js?v=0.2.112';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.112';
import { t, hasText } from '../../render/player-text.js?v=0.2.112';
import { creatureArt, drawCreature, PORTRAIT_DIR } from '../../render/creature-sprite.js?v=0.2.112';
import { itemIconHtml } from '../widgets/bits.js?v=0.2.112';
import { partyMembershipOf } from '../../session/party-sections.js?v=0.2.112';
import { TIER_NAME, DEFAULT_TIER } from '../../data/hunt-tiers.js?v=0.2.112';
import { monsterFactsOf, isMet } from '../monster-facts.js?v=0.2.112';
import { targetOf, placesParts, patchParts } from '../goto.js?v=0.2.112';

const WIN = 'monster';
/* The world's one density (ART_DIRECTION §2): every art pixel is 2x2 screen px, facing the player. */
const PORTRAIT = Object.freeze({ scale: 2, dir: PORTRAIT_DIR });
const VERSION = new URL(import.meta.url).searchParams.get('v') || '';
let ART = null;
const asked = new Set();

const SCRATCH = new WeakMap();
/* `id`: the monster on this character's page. `facts`: its facts as last worked out, for `size`. */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { id: null, size: 0, facts: null }; SCRATCH.set(cs, s); } return s; };

/** The link that opens monster `id`'s page (src/shell/goto.js linkHtml, gotoAttr). */
export const factsTarget = (id) => ({ win: WIN, tab: id, find: null });

const fact = (key, label) => '<div class="mf-fact"><dt>' + esc(t(label)) + '</dt><dd data-fact="' + key + '"></dd></div>';
const head = (label, per) => '<h4 class="hw-hd-h">' + esc(t(label)) + (per ? ' <small class="hw-hd-per ' + per + '"></small>' : '') + '</h4>';

/** The page's skeleton (built once per opening); the labels are the text home's, the values are patched in. */
export function renderMonster() {
  return '<article class="mf">'
    + '<p class="hs-note mf-none"><span class="mf-none-words"></span> <span class="mf-none-go"></span></p>'
    + '<div class="mf-page">'
    + '<header class="mf-head"><span class="mf-stand"><canvas class="mf-sprite" aria-hidden="true"></canvas></span>'
    + '<div class="mf-id"><h3 class="mf-name"></h3><p class="mf-kind"></p></div></header>'
    + head('monster.h_homes') + '<ul class="mf-homes"></ul>'
    + head('monster.h_fight', 'mf-for') + '<dl class="mf-facts">'
    + fact('hp', 'monster.hp') + fact('blow', 'monster.blow') + fact('swing', 'monster.swing') + fact('deals', 'monster.deals')
    + fact('weak', 'monster.weak') + fact('takes', 'monster.takes') + '</dl>'
    + '<p class="mf-note mf-harder"></p><p class="mf-note mf-scale"></p>'
    + head('monster.h_kill', 'mf-pay') + '<dl class="mf-facts">' + fact('xp', 'monster.xp') + fact('gold', 'monster.gold') + '</dl>'
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
  if (want && isMet(want) && want !== sc.id) { sc.id = want; sc.facts = null; body.scrollTop = 0; }
  const party = partyMembershipOf(cs);
  const size = party ? party.seats.length : 1;
  if (sc.id && (!sc.facts || sc.size !== size)) { sc.facts = monsterFactsOf(sc.id, size); sc.size = size; }
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
  text(root.querySelector('.mf-name'), f.name);
  text(root.querySelector('.mf-kind'), t(f.boss ? 'monster.kind_boss' : 'monster.kind', { family: f.family, level: f.level }));
  rows(root.querySelector('.mf-homes'), f.homes, {
    key: (h) => h.hunt,
    build: () => element(ctx.doc, homeHtml()),
    patch: (li, h) => {
      patchParts(li.querySelector('.mf-home-go'), [{ words: h.name, target: targetOf({ kind: 'hunt', hunt: h.hunt }) }]);
      text(li.querySelector('.mf-home-how'), h.band ? t('monster.home', { lo: h.band[0], hi: h.band[1], how: howWord(h.how) }) : howWord(h.how));
      text(li.querySelector('.mf-home-party'), h.minParty > 1 ? t('monster.home_party', { n: h.minParty }) : '');
    },
  });
  const alone = f.size <= 1, tier = TIER_NAME[DEFAULT_TIER];
  const set = (key, words) => text(root.querySelector('[data-fact="' + key + '"]'), words);
  text(root.querySelector('.mf-for'), alone ? t('monster.for_alone', { tier }) : t('monster.for_party', { n: f.size, tier }));
  set('hp', whole(f.hp));
  set('blow', t('monster.blow_value', { min: whole(f.blow.min), max: whole(f.blow.max) }));
  set('swing', t('monster.swing_value', { secs: f.swingMs / 1000 }));
  set('deals', elWord(f.deals));
  const weak = f.weak && hasText('monster.weak_' + f.weak.weapon) ? t('monster.weak_' + f.weak.weapon, { pct: f.weak.damagePct, acc: f.weak.accuracyPct }) : '';
  set('weak', weak);
  prop(root.querySelector('[data-fact="weak"]').parentElement, 'hidden', !weak);
  set('takes', takesWords(f.elements));
  text(root.querySelector('.mf-harder'), t('monster.harder'));
  text(root.querySelector('.mf-scale'), f.scaled ? t('monster.scale', { max: f.maxParty }) : '');
  text(root.querySelector('.mf-pay'), alone ? t('monster.pay_alone') : t('monster.pay_party', { n: f.size }));
  set('xp', whole(f.xp));
  set('gold', f.gold[0] === f.gold[1] ? t('monster.gold_one', { lo: whole(f.gold[0]) }) : t('monster.gold_value', { lo: whole(f.gold[0]), hi: whole(f.gold[1]) }));
  text(root.querySelector('.mf-per'), !f.drops.length ? '' : alone ? t('monster.per_alone') : t('monster.per_party', { n: f.size }));
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
