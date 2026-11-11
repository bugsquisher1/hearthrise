// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/titles.js — THE TITLES TAB: WHAT THIS HERO HAS EARNED THE RIGHT TO BE CALLED.
//
// The designer's sample (priority board, "2026-11-04 Gold sinks"): kills first, then gold, then Wear. Every number is the server's
// (the `titles` section): the price, the kills it takes and this hero's own count. A locked row reads "Wolves: 3,214 of 5,000" and has
// nothing to press; an earned one says "Claim for 3,000 gp"; a held one says Wear or Take off, free, as often as the player likes.
// Each press is ONE intent (src/session/title-intents.js), and the row changes only from the re-read envelope.
// Per hero: the purse pays, but the kills and the title are this hero's.
// ════════════════════════════════════════════════════════════════════════
import { TITLES } from '../../../data/titles.js?v=0.2.119';
import { titlesOf } from '../../../session/character-sections.js?v=0.2.119';
import { goldOf } from '../../../session/item-sections.js?v=0.2.119';
import { buyTitle, wearTitle } from '../../../session/title-intents.js?v=0.2.119';
import { rows, text, cls, prop, attr, element } from '../../../render/paint.js?v=0.2.119';
import { whole, gold } from '../../../render/format.js?v=0.2.119';
import { runIntent } from '../../intent-words.js?v=0.2.119';

/** The Titles tab's skeleton. */
export function titlesHtml() {
  return '<section class="hw-cs-titles">'
    + '<p class="hs-note">A title stands beside this hero\'s name in town and in chat. Each hero earns its own, the kills first and then the gold.</p>'
    + '<ul class="hw-ledger hw-titles"></ul><p class="hh-empty hw-titles-none"></p>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></section>';
}

/* A row's own words, from the data; the server's row names a title this client may not know yet. */
const lineOf = (r) => {
  const d = TITLES[r.id];
  return {
    name: d ? d.name : r.words,
    label: d ? d.label : 'Kills',
  };
};

/* What the row says under its name, and what its button says (null: nothing to press). */
function rowWords(r, purse) {
  const { label } = lineOf(r);
  if (r.held) return { small: r.worn ? 'You wear this one.' : 'Yours to wear.', press: r.worn ? 'Take off' : 'Wear', off: false };
  const count = label + ': ' + whole(r.have) + ' of ' + whole(r.kills);
  if (r.have < r.kills) return { small: count, press: null, off: true };
  const short = purse !== null && purse < r.price ? r.price - purse : 0;
  return { small: count + (short ? ' · You need ' + gold(short) + ' more.' : ''), press: r.price ? 'Claim for ' + gold(r.price) : 'Claim', off: short > 0 };
}

/** Patch the Titles tab. */
export function patchTitles(body, ctx, sc) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-cs-titles');
  const t = titlesOf(cs);
  const purse = goldOf(cs);
  rows(root.querySelector('.hw-titles'), t ? t.rows : [], {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, '<li class="hw-line hw-title"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="title-go" data-title="' + r.id + '"></button></li>'),
    patch: (li, r) => {
      const w = rowWords(r, purse);
      cls(li, 'is-current', r.worn);
      text(li.querySelector('b'), lineOf(r).name);
      text(li.querySelector('small'), w.small);
      const b = li.querySelector('button');
      prop(b, 'hidden', w.press === null);
      text(b, w.press === null ? '' : w.press);
      attr(b, 'aria-label', w.press === null ? '' : w.press + ': ' + r.words);
      prop(b, 'disabled', sc.pending || w.off);
    },
  });
  const none = root.querySelector('.hw-titles-none');
  cls(none, 'is-on', !t || !t.rows.length);
  text(none, !t ? 'Titles load from the server.' : !t.rows.length ? 'There are no titles to earn right now.' : '');
  text(root.querySelector('.hh-intent-msg'), sc.msg);
}

/** One press on the Titles tab; true when it was the tab's. */
export function actTitles(ctx, sc, action, ev, t, repaint) {
  if (action !== 'title-go' || ev.type !== 'click') return false;
  const cs = ctx.character;
  const list = titlesOf(cs);
  const r = list && list.rows.find((x) => x.id === t.getAttribute('data-title'));
  if (!r || sc.pending) return true;
  const { name } = lineOf(r);
  if (r.held) {
    runIntent(sc, repaint, () => wearTitle(ctx.account, cs, r.worn ? null : r.id), r.worn ? 'Taking it off…' : 'Putting it on…',
      () => (r.worn ? name + ' is off.' : 'You wear ' + name + ' now.'), cs);
  } else {
    runIntent(sc, repaint, () => buyTitle(ctx.account, cs, r.id, r.price), 'Claiming…', () => name + ' is yours. Press Wear to show it.', cs);
  }
  return true;
}
