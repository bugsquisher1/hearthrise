// ════════════════════════════════════════════════════════════════════════
// src/shell/tower-stage.js — THE BURNING TOWER DRAWN: THE GREAT HEARTH'S CHIMNEY, CLIMBING (direction A "The Chimney", Tyler 2026-11-16).
//
// The Climb tab's tower and the end card's (art: tools/world-art/tower-window-art.mjs, where it sits: src/data/tower-art.js). One course
// of the hearth's own stack repeats up a scrolling stage; a landing every `landing_every` floors is an iron band with its key's lock plate
// (the key is the server's row, keyForLanding: the art only colours it); the floors above the hero's best fall into the dark in four steps
// (no blur, only over the stones); gold ticks count the floors to the next key; heroes stand beside it at their best floors (you, your
// party, and the field's rivals when the server sends a field). Every floor here is the `tower` section's (src/session/tower-sections.js):
// the stage works none out. A landing the server lists as a checkpoint is a press (data-hs-act="floor-pick"): the window still sends
// only a checkpoint the server listed (tower.js landingPicked), and the server still judges it (hr_tower_start).
//
// PURE model (stageModel) + DOM built once and patched in place (render/paint.js). Vertical places are set here (each floor is PX CSS px);
// the horizontal layout is src/styles/tower.css's, so the phone moves it without a second model.
// ════════════════════════════════════════════════════════════════════════
import { TOWER_ART, SCALE } from '../data/tower-art.js?v=0.2.142';
import { CHEST_KEYS } from '../data/chests.js?v=0.2.142';
import { OUTFITS } from '../data/hunt-outfits.js?v=0.2.142';
import { keyForLanding } from '../session/tower-sections.js?v=0.2.142';
import { rows, text, cls, attr, prop, style, element } from '../render/paint.js?v=0.2.142';
import { t, hasText } from '../render/player-text.js?v=0.2.142';
import { whole } from '../render/format.js?v=0.2.142';

/** CSS px a floor climbs (the art's PPF at the window's one density). */
export const PX = TOWER_ART.PPF * SCALE;
const PAD = 26;                         /* CSS px above the highest floor drawn and below the lowest */
const HEADROOM = 24;                    /* floors drawn above the highest hero, into the dark */
const MK_H = 44;                        /* a marker's height: two never overlap */
const LBL_H = 22;                       /* a label's first line: two never overlap (a tag hangs under its own) */
/* the dark above the best: [floors above it, step] (four stepped bands, the last to the top) */
const DARK = Object.freeze([[3, 1], [8, 2], [14, 3], [Infinity, 4]]);
const PLAIN = CHEST_KEYS.length;        /* landings.png's plain band (the foot, a key with no metal) */
const HEADS = Object.freeze(Object.values(OUTFITS));

/** The landing row a key's art is drawn on, by its id (CHEST_KEYS order), else the plain band. Pure. */
export const landingRow = (key) => { const i = key ? CHEST_KEYS.findIndex((k) => k.id === key.key) : -1; return i < 0 ? PLAIN : i; };
/** A hero's head in heads.png, by sprite id (OUTFITS order; the knight's for an unknown one). Pure. */
const headIndex = (sprite) => Math.max(0, HEADS.indexOf(sprite));
/** A landing's metal as a label: "Silver", from the key row the server sends (its name when no word is written for its id). Pure. */
export const metalWord = (key) => (!key ? '' : hasText('tower.metal_' + key.key) ? t('tower.metal_' + key.key) : key.name || '');

/**
 * THE STAGE'S MODEL. `tw` the section; `o`:
 *   heroes  [{ who: 'you'|'party'|'rival', name, floor, sprite }] the markers (the server's floors)
 *   labels  [{ key, floor, n, word, tag, tone, pick, pickable }] what each labelled floor says (climbLabels / the end card's)
 *   ticks   true: the floors to the next key past the best
 *   run     [start, top] | null: a climb drawn up the stack (the end card)
 *   lo, hi  the floors shown (default 0 .. the highest hero + HEADROOM, on a landing, never past the server's floor_top)
 * Pure.
 */
export function stageModel(tw, o) {
  const every = tw.rules.landingEvery, best = tw.bestFloor;
  const top = Math.max(best, ...o.heroes.map((h) => h.floor), o.run ? o.run[1] : 0);
  const lo = Math.max(0, o.lo ?? 0);
  const hi = Math.min(tw.rules.floorTop, o.hi ?? Math.max(every * 4, Math.ceil((top + HEADROOM) / every) * every));
  const H = (hi - lo) * PX + 2 * PAD;
  const y = (f) => PAD + (hi - f) * PX;
  const lands = [];
  for (let L = Math.ceil(lo / every) * every; L <= hi; L += every) {
    lands.push({ floor: L, row: L === 0 ? PLAIN : landingRow(keyForLanding(tw, L)), dark: darkStep(L - best) });
  }
  const darks = [];
  let from = best;
  for (const [n, step] of DARK) {
    const to = Math.min(hi, best + n);
    if (to > from && from < hi) darks.push({ step, top: y(to), h: y(from) - y(to) });
    from = to;
  }
  const decade = Math.floor(best / every) * every;
  const ticks = o.ticks ? Array.from({ length: every - 1 }, (_, i) => decade + 1 + i).filter((f) => f >= lo && f <= hi).map((f) => ({ floor: f, lit: f <= best })) : [];
  /* markers top-down, each pushed under the one above when they would overlap; its floor still in its words */
  const marks = o.heroes.slice().sort((a, b) => b.floor - a.floor || (a.who === 'you' ? -1 : 1)).map((h) => Object.assign({}, h, { y: y(h.floor) }));
  for (let i = 1; i < marks.length; i++) marks[i].y = Math.max(marks[i].y, marks[i - 1].y + MK_H);
  /* labels top-down the same way (on the Climb tab landings stand 10 floors apart and never move; a run's words can stand a floor apart) */
  const labels = o.labels.filter((l) => l.floor >= lo && l.floor <= hi).sort((a, b) => b.floor - a.floor).map((l) => Object.assign({}, l, { y: y(l.floor) }));
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + (labels[i - 1].tag ? 2 * LBL_H : LBL_H));
  return { lo, hi, H, y, lands, darks, ticks, marks, labels,
    run: o.run ? { top: y(o.run[1]), h: y(o.run[0]) - y(o.run[1]) + PX } : null, colBottom: y(lo) + PAD };
}
const darkStep = (above) => (above <= 0 ? 0 : DARK.find(([n]) => above <= n)[1]);

/**
 * THE CLIMB TAB'S LABELS: every landing shown, its floor and metal; the picked checkpoint says "Start N" (the floor the climb starts on),
 * the first landing past the best "Next key"; a landing the server lists as a checkpoint is a press. Pure.
 */
export function climbLabels(tw, picked) {
  const every = tw.rules.landingEvery, next = (Math.floor(tw.bestFloor / every) + 1) * every;
  const out = [];
  for (let L = 0; L <= tw.rules.floorTop; L += every) {
    const key = L ? keyForLanding(tw, L) : null;
    const pick = L === picked;
    out.push({ key: 'l' + L, floor: L, n: whole(L || 1), word: L ? metalWord(key) : '',
      tag: pick ? t('tower.stage_start', { floor: L + 1 }) : L === next ? t('tower.stage_next') : '', tone: pick ? 'gold' : L === next ? 'steel' : '',
      pick, pickable: tw.checkpoints.includes(L), reached: L <= tw.bestFloor });
  }
  return out;
}

/* the art's sizes the stylesheet lays the stage out with (src/data/tower-art.js, at x2) */
const px = (v) => v * SCALE + 'px';
const A = TOWER_ART;
const STAGE_VARS = [`--tr-heads:${HEADS.length}`, `--tr-lrows:${PLAIN + 1}`, `--tr-lw:${px(A.LANDING_W)}`, `--tr-lh:${px(A.LANDING_H)}`,
  `--tr-colw:${px(A.COURSE.w)}`, `--tr-colw-n:${px(A.COURSE_NARROW.w)}`, `--tr-lw-n:${px(A.LANDING_W_NARROW)}`, `--tr-courseh:${px(A.COURSE.h)}`, `--tr-tw:${px(A.TICK_W)}`, `--tr-th:${px(A.TICK_H)}`, `--tr-hw:${px(A.HEAD_W)}`,
  `--tr-hh:${px(A.HEAD_H)}`].join(';');

/** The stage's skeleton (built once). `pressable`: its labelled floors are presses (the Climb tab), not words (the end card). */
export function stageHtml(cls0, pressable) {
  return '<div class="tt-stage ' + cls0 + '"' + (pressable ? '' : ' aria-hidden="true"') + ' data-press="' + (pressable ? 1 : 0) + '"'
    + ' style="' + STAGE_VARS + '">'
    + '<div class="tt-shaft"><div class="tt-col"></div><div class="tt-run" hidden></div><div class="tt-lands"></div><div class="tt-darks"></div>'
    + '<div class="tt-ticks"></div><div class="tt-labels"></div><div class="tt-mks"></div></div></div>';
}

/** Patch a stage to its model (paint.js: only what moved is written). */
export function patchStage(stage, m) {
  const doc = stage.ownerDocument, shaft = stage.querySelector('.tt-shaft');
  const pressable = stage.getAttribute('data-press') === '1';
  style(shaft, 'height', m.H + 'px');
  style(shaft.querySelector('.tt-col'), 'height', m.colBottom + 'px');
  const run = shaft.querySelector('.tt-run');
  prop(run, 'hidden', !m.run);
  if (m.run) { style(run, 'top', m.run.top + 'px'); style(run, 'height', m.run.h + 'px'); }
  rows(shaft.querySelector('.tt-lands'), m.lands, {
    key: (l) => String(l.floor),
    build: () => element(doc, '<span class="tt-land"></span>'),
    patch: (el, l) => { style(el, 'top', (m.y(l.floor) - 4 * SCALE) + 'px'); style(el, '--tr-row', String(l.row)); attr(el, 'data-dark', l.dark ? String(l.dark) : null); },
  });
  rows(shaft.querySelector('.tt-darks'), m.darks, {
    key: (d) => String(d.step),
    build: (d) => element(doc, '<span class="tt-dark" data-dark="' + d.step + '"></span>'),
    patch: (el, d) => { style(el, 'top', d.top + 'px'); style(el, 'height', d.h + 'px'); },
  });
  rows(shaft.querySelector('.tt-ticks'), m.ticks, {
    key: (k) => String(k.floor),
    build: () => element(doc, '<span class="tt-tick"></span>'),
    patch: (el, k) => { style(el, 'top', (m.y(k.floor) - TOWER_ART.TICK_H) + 'px'); cls(el, 'is-lit', k.lit); },
  });
  /* a landing the server lists as a checkpoint is a press; every other labelled floor is words, never a control that is off */
  const press = (l) => pressable && !!l.pickable;
  rows(shaft.querySelector('.tt-labels'), m.labels, {
    key: (l) => l.key + (press(l) ? ':press' : ''),
    build: (l) => element(doc, (press(l) ? '<button type="button" class="tt-lbl" data-hs-act="floor-pick"' : '<span class="tt-lbl"') + ' data-landing="' + l.floor + '">'
      + '<span class="tt-l1"><b class="tt-n"></b><span class="tt-w"></span></span><span class="tt-tag"></span>' + (press(l) ? '</button>' : '</span>')),
    patch: (el, l) => {
      style(el, 'top', l.y + 'px');
      text(el.querySelector('.tt-n'), l.n);
      text(el.querySelector('.tt-w'), l.word);
      const tag = el.querySelector('.tt-tag');
      text(tag, l.tag || '');
      prop(tag, 'hidden', !l.tag);
      attr(tag, 'data-tone', l.tone || null);
      cls(el, 'is-dark', l.reached === false);
      cls(el, 'is-pick', !!l.pick);
      if (press(l)) attr(el, 'aria-pressed', String(!!l.pick));
    },
  });
  rows(shaft.querySelector('.tt-mks'), m.marks, {
    key: (h) => h.who + ':' + h.name,
    build: () => element(doc, '<span class="tt-mk"><span class="tt-mk-who"><b></b><span></span></span><span class="tt-mk-well"><span class="tt-head"></span></span><i class="tt-mk-line"></i></span>'),
    patch: (el, h) => {
      attr(el, 'data-who', h.who);
      style(el, 'top', h.y + 'px');
      text(el.querySelector('b'), h.name);
      text(el.querySelector('.tt-mk-who span'), whole(h.floor));
      style(el.querySelector('.tt-head'), '--tr-hi', String(headIndex(h.sprite)));
    },
  });
}

/** Bring a floor into the stage's view (once a showing: the player's own scroll is never taken back). */
export function scrollToFloor(stage, m, floor) {
  if (!stage.clientHeight) return false;
  stage.scrollTop = Math.max(0, Math.round(m.y(floor) - stage.clientHeight * 0.45));
  return true;
}
