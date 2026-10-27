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
//   what drops      the gear, a line a tier in each armour weight (the hero's own first), then
//                   every Rare and Trophy with its carrier; each with its chance per kill
//   your best       the server's hunt_bests, or ONE "Not hunted yet"
// then the pull size (src/shell/windows/hunts.js) and the going-hunting part
// (goHtml / patchGo, from src/shell/hunt-go.js): Go as (the setups as lines, the
// one in use first choice), Before you go (what the bar spends and what it costs)
// and, on a party ground or while leading, Find a party and Bring your heroes.
// Enter sits at the page's foot. This module draws; it holds no state and sends
// nothing (hunts.js owns every press).
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, prop, attr, style, element } from '../../render/paint.js?v=0.2.57';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.57';
import { itemIconHtml, actionIconHtml } from '../widgets/bits.js?v=0.2.57';
import { HUNT_INDEX } from '../../data/hunts.js?v=0.2.57';
import { bandWords, fitWords, heroWords, partyNote, bestWords } from '../hunt-list.js?v=0.2.57';
import { residentsOf, scarceSetOf, raresOf } from '../hunt-ground-facts.js?v=0.2.57';
import { creatureArt, drawCreature, PORTRAIT_DIR } from '../../render/creature-sprite.js?v=0.2.57';
import { chance } from '../../render/format.js?v=0.2.57';

/* The world's one density (ART_DIRECTION §2): every art pixel is 2x2 screen px; each creature faces the player
   (Tyler 2026-10-24), the portrait's front pose, so the line reads as one. */
const SPRITE_SCALE = 2;
export const LINEUP_SPRITE = Object.freeze({ scale: SPRITE_SCALE, dir: PORTRAIT_DIR });
const VERSION = new URL(import.meta.url).searchParams.get('v') || '';
/* The creature art loaded so far (null until the first: the line shows names, the pictures follow), and the
   creatures already asked for. */
let ART = null;
const asked = new Set();

/** The page's skeleton: the ground's facts (this module) and the slots hunts.js fills. */
export function detailHtml() {
  return '<header class="hw-hd-head">'
    + '<button type="button" class="hh-tool hw-hd-back" data-hs-act="back">Back to the list</button>'
    + '<h3 class="hw-hd-name"></h3><p class="hw-hd-band"><span class="hw-hd-levels"></span><span class="hw-hunt-fit"></span></p>'
    + '<p class="hw-hd-who"></p><p class="hw-hunt-warn"></p></header>'
    + '<p class="hw-hd-theme"></p>'
    + '<h4 class="hw-hd-h">Who lives here</h4><ul class="hw-hd-lineup" aria-label="Who lives here"></ul>'
    + '<h4 class="hw-hd-h">Drops <small class="hw-hd-per hw-hd-per-size"></small></h4><ul class="hw-hd-sets" aria-label="Drops"></ul>'
    + '<h4 class="hw-hd-h">Rare drops <small class="hw-hd-per">chance per kill of its creature</small></h4><ul class="hw-hd-rares" aria-label="Rare drops"></ul>'
    + '<p class="hw-hunt-party" hidden></p>'
    + '<section class="hw-hd-bests" aria-label="Your best here"><h4 class="hw-hd-h">Your best here</h4>'
    + '<p class="hw-hd-best hw-hunt-best-solo"></p><p class="hw-hd-best hw-hunt-best-party"></p><p class="hw-hd-best hw-hunt-best-none"></p></section>';
}

const monHtml = (m) => '<li class="hw-hd-mon" data-monster="' + esc(m.id) + '"><span class="hw-hd-stand"><canvas class="hw-hd-sprite" aria-hidden="true"></canvas></span>'
  + '<b class="hw-hd-mon-name"></b><small class="hw-hd-mon-how"></small></li>';

/**
 * The page's going-hunting part, after the pull size: Go as (A #1), Before you go (A #5) and, on a party
 * ground or while leading, the way to a party (B #3).
 */
export function goHtml() {
  return '<h4 class="hw-hd-h">Go as</h4><div class="hw-go-list" role="radiogroup" aria-label="Go as"></div>'
    + '<p class="hw-go-note"></p>'
    + '<h4 class="hw-hd-h">Before you go</h4><ul class="hw-before"></ul>'
    + '<section class="hw-hd-party" aria-label="With a party"><h4 class="hw-hd-h">With a party</h4><p class="hw-hd-party-why"></p>'
    + '<div class="hw-hd-party-do"><button type="button" class="hh-tool hw-find-here" data-hs-act="find-party"></button><span class="hw-bring"></span></div>'
    + '<p class="hw-bring-none"></p></section>';
}

const goLineHtml = (p) => '<button type="button" class="hw-go" role="radio" aria-checked="false" data-hs-act="go-as" data-preset="' + p.preset + '">'
  + '<span class="hw-ico hw-go-weapon"></span><span class="hw-go-main"><b class="hw-go-name"></b><small class="hw-go-what"></small></span>'
  + '<span class="hw-go-bar"></span></button>';

/**
 * Go as: one line per setup (`v.setups`, hunt-go.js setupsOf), the chosen one (`v.chosen`) marked; Before you
 * go (`v.before`); and the party block (`v.partyBlock`: { why, find, bring: [{ slot, name }], none } or null).
 * `v.off` turns every control here off (a press in flight, a hunt running, a member who cannot start).
 */
export function patchGo(det, ctx, v) {
  rows(det.querySelector('.hw-go-list'), v.setups || [], {
    key: (p) => String(p.preset),
    build: (p) => element(ctx.doc, goLineHtml(p)),
    patch: (b, p) => {
      const on = p.preset === v.chosen;
      attr(b, 'aria-checked', String(on));
      cls(b, 'is-picked', on);
      text(b.querySelector('.hw-go-name'), p.name);
      text(b.querySelector('.hw-go-what'), [p.roleWords, p.inUse ? 'on now' : null].filter(Boolean).join(' · '));
      const w = b.querySelector('.hw-go-weapon');
      if (w.getAttribute('data-item') !== String(p.weapon)) { w.innerHTML = p.weapon ? itemIconHtml(ctx.glyphs, p.weapon) : ''; w.setAttribute('data-item', String(p.weapon)); }
      const bar = b.querySelector('.hw-go-bar');
      const key = p.bar ? p.bar.map((a) => a.type + ':' + a.id).join(',') : '';
      if (bar.getAttribute('data-bar') !== key) { bar.innerHTML = p.bar ? p.bar.map((a) => actionIconHtml(ctx.glyphs, a)).join('') : ''; bar.setAttribute('data-bar', key); }
      prop(b, 'disabled', v.off);
    },
  });
  const chosen = (v.setups || []).find((p) => p.preset === v.chosen);
  text(det.querySelector('.hw-go-note'), chosen && !chosen.inUse ? 'Enter puts ' + chosen.name + ' on first: its gear and its bar.' : '');
  rows(det.querySelector('.hw-before'), v.before || [], {
    key: (l) => l.id,
    build: () => element(ctx.doc, '<li class="hw-before-line"></li>'),
    patch: (li, l) => { text(li, l.text); cls(li, 'is-short', l.short); },
  });
  const pb = det.querySelector('.hw-hd-party');
  prop(pb, 'hidden', !v.partyBlock);
  if (!v.partyBlock) return;
  text(pb.querySelector('.hw-hd-party-why'), v.partyBlock.why);
  const find = pb.querySelector('.hw-find-here');
  text(find, v.partyBlock.find);
  prop(find, 'disabled', v.off);
  rows(pb.querySelector('.hw-bring'), v.partyBlock.bring, {
    key: (h) => String(h.slot),
    build: (h) => element(ctx.doc, '<button type="button" class="hh-tool" data-hs-act="bring" data-slot="' + h.slot + '"></button>'),
    patch: (b, h) => { text(b, 'Bring ' + h.name); prop(b, 'disabled', v.off || v.partyBlock.full); },
  });
  const none = pb.querySelector('.hw-bring-none');
  text(none, v.partyBlock.bring.length ? '' : 'Your other heroes can come too: play one from Characters and it shows here. Up to four play at once.');
}

/* "Level 2 · common"; a boss says so in place of its share. */
const howWords = (m) => (Number.isInteger(m.level) ? 'Level ' + m.level + ' · ' : '') + (m.boss ? 'boss' : m.band);

/* One creature's picture, drawn once per creature (a canvas keeps it); nothing until its art has loaded. */
function paintSprite(li, id) {
  const c = li.querySelector('canvas');
  if (!ART || !ART.has(id) || c.getAttribute('data-drawn') === id) return;
  const ok = drawCreature(c, ART, id, LINEUP_SPRITE);
  c.setAttribute('data-drawn', id);
  cls(li, 'is-drawn', ok);
}

/* Load this ground's creature art (only the sheets that carry them, each once); when it lands, the open page is
   patched again (its pictures appear). */
function wantArt(doc, ids, repaint) {
  const need = ids.filter((id) => !asked.has(id));
  if (!need.length) return;
  for (const id of need) asked.add(id);
  creatureArt(doc, VERSION, need).then((a) => { ART = a; repaint(); }, () => { for (const id of need) asked.delete(id); });
}

/** Write the ground's facts for row `r` into the page `det` (patched in place: only what changed is written). */
export function patchGround(det, ctx, r, o) {
  const { level, bests, repaint } = o;
  const fit = fitWords(r, level);
  text(det.querySelector('.hw-hd-name'), r.name);
  /* Under the floor the warning line under it speaks (hunts.js rangeWords); in or over the band, its words close the line. */
  const band = det.querySelector('.hw-hd-band');
  text(band.querySelector('.hw-hd-levels'), bandWords(r, level));
  const fitEl = band.querySelector('.hw-hunt-fit');
  text(fitEl, fit && (fit.tone === 'in' || fit.tone === 'below') ? fit.words : '');
  attr(fitEl, 'data-tone', fit ? fit.tone : null);
  text(det.querySelector('.hw-hd-who'), heroWords(r) + '.');
  text(det.querySelector('.hw-hd-theme'), (HUNT_INDEX[r.hunt] && HUNT_INDEX[r.hunt].theme) || r.theme);
  const residents = residentsOf(r.hunt);
  wantArt(ctx.doc, residents.map((m) => m.id), repaint);
  const size = Math.max(1, Number(o.size) || 1);
  const rares = raresOf(r.hunt, size), carriers = new Set(rares.map((x) => x.carrier.id));
  const lineup = det.querySelector('.hw-hd-lineup');
  rows(lineup, residents, {
    key: (m) => r.hunt + ':' + m.id,
    build: (m) => element(ctx.doc, monHtml(m)),
    patch: (li, m) => {
      text(li.querySelector('.hw-hd-mon-name'), m.name);
      text(li.querySelector('.hw-hd-mon-how'), howWords(m));
      attr(li, 'data-band', m.boss ? 'boss' : m.band);
      cls(li, 'is-carrier', carriers.has(m.id));
      paintSprite(li, m.id);
    },
  });
  /* One ground line: every creature stands at the height of the tallest drawn here, feet on the same row. */
  const tallest = Math.max(0, ...Array.from(lineup.querySelectorAll('.hw-hd-mon.is-drawn canvas'), (c) => c.height));
  style(lineup, '--stand-h', tallest ? tallest + 'px' : null);
  /* What drops here and how often (Tyler 2026-10-24: "a % drop chance or nothing at all"): the gear a line a tier, the
     hero's own armour weight first ("Iron, Studded, Adept: helmets, boots; Iron Sword") with the chance a kill here drops
     any piece of it, then each Rare and Trophy, item and carrier, with its chance per kill of that creature. The odds
     are the engine's own rows at this hero's party size (hunt-ground-facts.js), never a number typed here. */
  text(det.querySelector('.hw-hd-per-size'), 'chance per kill, ' + (size > 1 ? 'in a party of ' + size : 'hunting alone'));
  rows(det.querySelector('.hw-hd-sets'), scarceSetOf(r.hunt, o.worn || null, size), {
    key: (e) => String(e.tier),
    build: () => element(ctx.doc, '<li class="hw-hd-set"><span><b class="hw-hd-set-lines"></b><span class="hw-hd-set-what"></span></span>'
      + '<span class="hw-hd-odds"></span></li>'),
    patch: (li, e) => {
      text(li.querySelector('.hw-hd-set-lines'), e.lines.join(', '));
      text(li.querySelector('.hw-hd-set-what'), (e.lines.length ? ': ' : '') + [e.slots.join(', '), e.weapons.join(', ')].filter(Boolean).join('; '));
      text(li.querySelector('.hw-hd-odds'), chance(e.chance));
    },
  });
  rows(det.querySelector('.hw-hd-rares'), rares, {
    key: (x) => x.id + ':' + x.carrier.id,
    build: (x) => element(ctx.doc, '<li class="hw-hd-rare" data-item="' + esc(x.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, x.id) + '</span>'
      + '<b class="hw-hd-rare-name"></b><small class="hw-hd-rare-by"></small><span class="hw-hd-odds"></span></li>'),
    patch: (li, x) => {
      text(li.querySelector('.hw-hd-rare-name'), x.name);
      text(li.querySelector('.hw-hd-rare-by'), x.carrier.name);
      text(li.querySelector('.hw-hd-odds'), chance(x.chance));
      cls(li, 'is-trophy', x.trophy);
    },
  });
  /* The picked ground's party rule, from ITS row (Tyler 10-19: the Rat King's note). */
  const note = det.querySelector('.hw-hunt-party');
  const said = partyNote(r.hunt);
  text(note, said);
  prop(note, 'hidden', !said);
  /* This hero's bests here (the server's hunt_bests): a line per mode it has, else one "Not hunted yet". */
  const best = bestWords(bests, r.hunt);
  /* No hunt_bests section from the server: no heading over nothing. */
  prop(det.querySelector('.hw-hd-bests'), 'hidden', !best);
  for (const [q, v] of [['.hw-hunt-best-solo', best && best.solo], ['.hw-hunt-best-party', best && best.party], ['.hw-hunt-best-none', best && best.none]]) {
    text(det.querySelector(q), v || '');
    prop(det.querySelector(q), 'hidden', !v);
  }
}
