// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-detail.js — THE PICKED GROUND'S PAGE IN THE HUNTS WINDOW.
//
// Master-detail (designer plan 2026-10-22, B #1; Monster Hunter's quest board,
// mechanics only): the Hunts list is lines, and the picked ground gets ONE page,
// read top to bottom the way the decision is made:
//   the ground      name, its band against the hero's Level, who may come, the
//                   level warning (the floor is a warning: the server decides)
//   its theme
//   who lives here  each creature as the world draws it (style-1 idle frame at ×2,
//                   src/render/creature-sprite.js) on one ground line, with how
//                   common it is (src/shell/hunt-ground-facts.js)
//   the rare        what the ground's one rare carrier carries, named
//   your best       the server's hunt_bests, or ONE "Not hunted yet"
// then (src/shell/windows/hunts.js) the pull size, Go as, Before you go and Enter.
// This module draws the ground's facts; it holds no state and sends nothing.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, prop, attr, style, element } from '../../render/paint.js?v=0.2.31';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.31';
import { itemIconHtml } from '../widgets/bits.js?v=0.2.31';
import { HUNT_INDEX } from '../../data/hunts.js?v=0.2.31';
import { bandWords, fitWords, heroWords, partyNote, bestWords } from '../hunt-list.js?v=0.2.31';
import { residentsOf, rareOf } from '../hunt-ground-facts.js?v=0.2.31';
import { creatureArt, drawCreature } from '../../render/creature-sprite.js?v=0.2.31';

/* The world's one density (ART_DIRECTION §2): every art pixel is 2x2 screen px. */
const SPRITE_SCALE = 2;
const VERSION = new URL(import.meta.url).searchParams.get('v') || '';
/* The creature art, once loaded (null until then: the line shows names, the pictures follow). */
let ART = null;
let loading = null;

/** The page's skeleton: the ground's facts (this module) and the slots hunts.js fills. */
export function detailHtml() {
  return '<header class="hw-hd-head">'
    + '<button type="button" class="hh-tool hw-hd-back" data-hs-act="back">Back to the list</button>'
    + '<h3 class="hw-hd-name"></h3><p class="hw-hd-band"></p><p class="hw-hd-who"></p><p class="hw-hunt-warn"></p></header>'
    + '<p class="hw-hd-theme"></p>'
    + '<h4 class="hw-hd-h">Who lives here</h4><ul class="hw-hd-lineup" aria-label="Who lives here"></ul>'
    + '<p class="hw-hd-rare"><span class="hw-ico"></span><span class="hw-hd-rare-t"><b class="hw-hd-rare-name"></b><small class="hw-hd-rare-by"></small></span></p>'
    + '<p class="hw-hunt-party" hidden></p>'
    + '<h4 class="hw-hd-h">Your best here</h4>'
    + '<p class="hw-hd-best hw-hunt-best-solo"></p><p class="hw-hd-best hw-hunt-best-party"></p><p class="hw-hd-best hw-hunt-best-none"></p>';
}

const monHtml = (m) => '<li class="hw-hd-mon" data-monster="' + esc(m.id) + '"><span class="hw-hd-stand"><canvas class="hw-hd-sprite" aria-hidden="true"></canvas></span>'
  + '<b class="hw-hd-mon-name"></b><small class="hw-hd-mon-how"></small></li>';

/* "Level 2 · common"; a boss says so in place of its share. */
const howWords = (m) => (Number.isInteger(m.level) ? 'Level ' + m.level + ' · ' : '') + (m.boss ? 'boss' : m.band);

/* One creature's picture, drawn once per creature (a canvas keeps it); nothing until the art has loaded. */
function paintSprite(li, id) {
  const c = li.querySelector('canvas');
  if (!ART || c.getAttribute('data-drawn') === id) return;
  const ok = drawCreature(c, ART, id, { scale: SPRITE_SCALE });
  c.setAttribute('data-drawn', id);
  cls(li, 'is-drawn', ok);
}

/* Load the creature art once; when it lands, the open page is patched again (its pictures appear). */
function wantArt(doc, repaint) {
  if (ART || loading) return;
  loading = creatureArt(doc, VERSION).then((a) => { ART = a; repaint(); }, () => { loading = null; });
}

/** Write the ground's facts for row `r` into the page `det` (patched in place: only what changed is written). */
export function patchGround(det, ctx, r, o) {
  const { level, bests, repaint } = o;
  const fit = fitWords(r, level);
  text(det.querySelector('.hw-hd-name'), r.name);
  /* Under the floor the warning line under it speaks (hunts.js rangeWords); in or over the band, its words close the line. */
  const band = det.querySelector('.hw-hd-band');
  text(band, bandWords(r, level) + (fit && (fit.tone === 'in' || fit.tone === 'below') ? ' · ' + fit.words : ''));
  attr(band, 'data-tone', fit ? fit.tone : null);
  text(det.querySelector('.hw-hd-who'), heroWords(r) + '.');
  text(det.querySelector('.hw-hd-theme'), (HUNT_INDEX[r.hunt] && HUNT_INDEX[r.hunt].theme) || r.theme);
  wantArt(ctx.doc, repaint);
  const rare = rareOf(r.hunt);
  const lineup = det.querySelector('.hw-hd-lineup');
  rows(lineup, residentsOf(r.hunt), {
    key: (m) => r.hunt + ':' + m.id,
    build: (m) => element(ctx.doc, monHtml(m)),
    patch: (li, m) => {
      text(li.querySelector('.hw-hd-mon-name'), m.name);
      text(li.querySelector('.hw-hd-mon-how'), howWords(m));
      attr(li, 'data-band', m.boss ? 'boss' : m.band);
      cls(li, 'is-carrier', !!rare && rare.carrier.id === m.id);
      paintSprite(li, m.id);
    },
  });
  /* One ground line: every creature stands at the height of the tallest drawn here, feet on the same row. */
  const tallest = Math.max(0, ...Array.from(lineup.querySelectorAll('.hw-hd-mon.is-drawn canvas'), (c) => c.height));
  style(lineup, '--stand-h', tallest ? tallest + 'px' : null);
  /* The rare and its carrier, named: the chase this ground offers (odds stay the server's). */
  const rareEl = det.querySelector('.hw-hd-rare');
  prop(rareEl, 'hidden', !rare);
  if (rare) {
    const ico = rareEl.querySelector('.hw-ico');
    if (ico.getAttribute('data-item') !== rare.items[0].id) { ico.innerHTML = itemIconHtml(ctx.glyphs, rare.items[0].id); ico.setAttribute('data-item', rare.items[0].id); }
    text(rareEl.querySelector('.hw-hd-rare-name'), rare.items.map((i) => i.name).join(' and '));
    text(rareEl.querySelector('.hw-hd-rare-by'), 'Rare drop. Carrier: ' + rare.carrier.name);
  }
  /* The picked ground's party rule, from ITS row (Tyler 10-19: the Rat King's note). */
  const note = det.querySelector('.hw-hunt-party');
  const said = partyNote(r.hunt);
  text(note, said);
  prop(note, 'hidden', !said);
  /* This hero's bests here (the server's hunt_bests): a line per mode it has, else one "Not hunted yet". */
  const best = bestWords(bests, r.hunt);
  for (const [q, v] of [['.hw-hunt-best-solo', best && best.solo], ['.hw-hunt-best-party', best && best.party], ['.hw-hunt-best-none', best && best.none]]) {
    text(det.querySelector(q), v || '');
    prop(det.querySelector(q), 'hidden', !v);
  }
}
