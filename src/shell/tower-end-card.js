// ════════════════════════════════════════════════════════════════════════
// src/shell/tower-end-card.js — A CLIMB'S END CARD: THE RUN DRAWN ON THE TOWER (direction A, Tyler 2026-11-16).
//
// The hunt summary's card for a Burning Tower climb (src/shell/windows/hunt-summary.js): the stretch of the chimney the run climbed, its
// start to the floor it reached in gold up the stack, the hero at the top, New Best over the old best when the climb set the record, each
// key landing it cleared; beside it the label rows (../tower-words.js climbEnd: New Best +N, Rank (+N) and Passed from the board, Floors
// cleared, Spat out, XP lost) and the
// keys it earned in their metal. Every floor is the `tower` section's `last` run (the server's: start, top, keys, best_before); an older
// card than the section's last run shows the rows it can and no tower. Display only: the card's presses are hunt-summary.js's.
// ════════════════════════════════════════════════════════════════════════
import { PIXEL_DIR } from '../data/item-art.js?v=0.2.136';
import { heroSprite } from '../session/hero-look.js?v=0.2.136';
import { nameOf } from '../session/item-sections.js?v=0.2.136';
import { rows, text, prop, cls, attr, element } from '../render/paint.js?v=0.2.136';
import { whole } from '../render/format.js?v=0.2.136';
import { t } from '../render/player-text.js?v=0.2.136';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.136';
import { stageHtml, stageModel, patchStage, metalWord, scrollToFloor } from './tower-stage.js?v=0.2.136';

/* floors shown under the start and over the top */
const BELOW = 4, ABOVE = 7;

/** The card's block (built once, inside the summary card; hidden for a hunt that is no climb). */
export function climbCardHtml() {
  return '<section class="hsum-climb" hidden><div class="te-wrap">' + stageHtml('te-stage', false)
    + '<div class="te-side"><h4 class="hw-hd-h tt-hd">' + esc(t('tower.climb_head')) + '</h4><div class="tt-rows te-rows"></div>'
    + '<div class="te-keys-box" hidden><h4 class="hw-hd-h tt-hd">' + esc(t('tower.keys_head')) + '</h4><div class="te-keys"></div></div></div></div></section>';
}

/** The tower's words for the run: New Best at the top, the old best, each key landing cleared, the start. Pure. */
function endLabels(end, tw) {
  const r = end.run, out = [];
  if (!r) return out;
  const top = r.top !== null ? r.top : r.start;
  if (r.best) out.push({ key: 'top', floor: top, n: '', word: '', tag: t('tower.end_new_best'), tone: 'gold' });
  if (r.best && r.before > 0 && r.before >= r.start) out.push({ key: 'old', floor: r.before, n: whole(r.before), word: t('tower.end_old_best'), reached: false });
  for (const k of end.keys) {
    const row = tw.chest ? tw.chest.keys.find((x) => x.key === k.key) : null;
    out.push({ key: 'k' + k.landing, floor: k.landing, n: whole(k.landing), word: row ? metalWord(row) : k.name, pick: true });
  }
  out.push({ key: 'start', floor: r.start, n: whole(r.start), word: t('tower.end_start') });
  return out;
}

/** Patch the block to a climb's end (climbEnd's model), or hide it (null). */
export function patchClimbCard(host, cs, tw, end) {
  prop(host, 'hidden', !end);
  if (!end) return;
  const stage = host.querySelector('.te-stage');
  const r = end.run;
  prop(stage, 'hidden', !r || !tw);
  if (r && tw) {
    const top = r.top !== null ? r.top : r.start;
    const m = stageModel(tw, { heroes: [{ who: 'you', name: nameOf(cs) || t('away.your_hero'), floor: top, sprite: heroSprite(cs) }],
      labels: endLabels(end, tw), ticks: false, run: [r.start, top], lo: Math.max(0, r.start - BELOW), hi: top + ABOVE });
    patchStage(stage, m);
    if (stage.getAttribute('data-run') !== r.start + ':' + top && scrollToFloor(stage, m, top)) attr(stage, 'data-run', r.start + ':' + top);
  }
  rows(host.querySelector('.te-rows'), end.rows, {
    key: (x) => x.id,
    build: () => element(host.ownerDocument, '<div class="tt-row"><span class="tt-k"></span><span class="tt-v"></span></div>'),
    patch: (el, x) => { attr(el, 'data-row', x.id); text(el.querySelector('.tt-k'), x.k); text(el.querySelector('.tt-v'), x.v); cls(el, 'is-gold', !!x.gold); },
  });
  prop(host.querySelector('.te-keys-box'), 'hidden', !end.keys.length);
  rows(host.querySelector('.te-keys'), end.keys, {
    key: (k) => k.key,
    build: (k) => element(host.ownerDocument, '<div class="te-key"><span class="tt-key-well"><img class="tt-key-ico" src="' + esc(PIXEL_DIR + k.item + '.png') + '" alt="" width="32" height="32" decoding="async"></span>'
      + '<span class="tt-next-words"><b class="tt-next-name"></b><span class="tt-next-floor"></span></span></div>'),
    patch: (el, k) => {
      text(el.querySelector('.tt-next-name'), t('tower.end_key_count', { key: k.name, count: whole(k.count) }));
      text(el.querySelector('.tt-next-floor'), t('tower.start_floor', { floor: k.landing }));
    },
  });
}
