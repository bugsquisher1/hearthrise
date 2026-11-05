// ════════════════════════════════════════════════════
// src/shell/windows/temper-pane.js — THE SMITH, ON THE SHOP'S SERVICES TAB (Tyler 2026-11-04: "some sort of upgrade system
// that slightly increases gear power"; src/data/temper.js is the design).
//
// Two rows, for what this hero wears NOW: Blows (its weapon's ladder) and Armor (the ladder of the armor it wears most). Every
// number is the server's (src/session/temper-sections.js). A press opens a confirmation at the shown price; confirming sends
// ONE unlock_buy naming the offer and no number, and hr_unlock_buy prices it under its own lock. A rung is permanent and
// not refundable, so it asks once; nothing changes on screen until the re-read envelope says so.
// ════════════════════════════════════════════════════
import { temperRowsOf } from '../../session/temper-sections.js?v=0.2.91';
import { goldOf } from '../../session/item-sections.js?v=0.2.91';
import { text, cls, prop, rows, element } from '../../render/paint.js?v=0.2.91';
import { gold } from '../../render/format.js?v=0.2.91';
import { runIntent } from '../intent-words.js?v=0.2.91';

const TRACKS = Object.freeze([
  { id: 'blows', label: 'Blows', effect: 'your blows and heals land', worse: 'harder', none: 'Wield a weapon to temper it.' },
  { id: 'armor', label: 'Armor', effect: 'blows reach you', worse: 'softer', none: 'Wear armor to temper it.' },
]);
const pct = (pm) => String(pm / 10) + '%';

/** What a row says: the rung, what it does now, what the next rung does. */
function rowWords(t, r) {
  if (!r.piece) return t.none;
  if (!r.ladder) return 'Your ' + r.piece + ' can\'t be tempered' + (r.below ? '. Gear worn from Level 15 can.' : ' yet.');
  const now = 'Rung ' + r.ladder.rung + ' of ' + r.ladder.max + ': ';
  if (!r.ladder.offer) return now + t.effect + ' ' + pct(r.nowPm) + ' ' + t.worse + '. The most this gear takes.';
  return (r.ladder.rung ? now + t.effect + ' ' + pct(r.nowPm) + ' ' + t.worse + '. Next rung ' + pct(r.nextPm) + '.'
    : 'Not tempered yet. First rung: ' + t.effect + ' ' + pct(r.nextPm) + ' ' + t.worse + '.');
}

/** The section's skeleton, inside the Services tab. */
export function temperPaneHtml() {
  return '<h3 class="hs-sub">Tempering</h3>'
    + '<p class="hs-note">The smith works what this hero wears. A rung lasts and can\'t fail. Each tier of gear has its own five rungs, so new gear starts fresh and your old gear keeps its own.</p>'
    + '<ul class="hw-ledger hw-temper"></ul>'
    + '<div class="hw-confirm hw-temper-ask" role="alertdialog" aria-label="Confirm the tempering"><p class="hw-confirm-q"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="temper-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="temper-no">Cancel</button></div></div>';
}

/** Patch the section in place. `sc` is the Services tab's own scratch: one pending flag and one answer line for the tab. */
export function patchTemperPane(root, ctx, sc) {
  const cs = ctx.character;
  const purse = goldOf(cs);
  const all = temperRowsOf(cs);
  const row = (id) => (all ? all[id] : null);
  rows(root.querySelector('.hw-temper'), all ? [...TRACKS] : [], {
    key: (t) => t.id,
    build: (t) => element(ctx.doc, '<li class="hw-line" data-track="' + t.id + '"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="temper-ask" data-track="' + t.id + '"></button></li>'),
    patch: (li, t) => {
      const r = row(t.id);
      const offer = r.ladder ? r.ladder.offer : null;
      const short = offer && purse !== null && purse < r.ladder.gold ? r.ladder.gold - purse : 0;
      text(li.querySelector('b'), t.label + (r.piece ? ' · ' + r.piece : ''));
      text(li.querySelector('small'), rowWords(t, r) + (short ? ' You need ' + gold(short) + ' more.' : ''));
      const btn = li.querySelector('button');
      text(btn, offer ? 'Temper · ' + gold(r.ladder.gold) : r.ladder ? 'Full' : 'No rungs');
      prop(btn, 'disabled', !offer || !!short || sc.pending || !!sc.ask);
    },
  });
  const asked = sc.ask ? row(sc.ask) : null;
  const can = !!asked && !!asked.ladder && !!asked.ladder.offer && !sc.pending && (purse === null || purse >= asked.ladder.gold);
  if (sc.ask && !can) sc.ask = null;
  const cf = root.querySelector('.hw-temper-ask');
  const yes = cf.querySelector('[data-hs-act="temper-yes"]');
  cls(cf, 'is-on', !!sc.ask);
  cls(yes, 'is-on', !!sc.ask);
  if (sc.ask) {
    text(cf.querySelector('.hw-confirm-q'), 'Temper your ' + asked.piece + ' to rung ' + (asked.ladder.rung + 1) + ' for ' + gold(asked.ladder.gold) + '? It stays on this hero, and can\'t be sold back.');
    text(yes, 'Temper for ' + gold(asked.ladder.gold));
  }
  prop(yes, 'disabled', sc.pending);
}

/** The section's presses; true when handled. */
export function actTemperPane(ctx, action, t, sc, repaint) {
  const cs = ctx.character;
  if (action === 'temper-ask') {
    sc.ask = t.getAttribute('data-track');
    sc.msg = '';
    repaint();
    /* the question sits under the rows: on a short window it opens below the fold, and the press looks dead (played 11-04) */
    const cf = t.closest('.hw-services').querySelector('.hw-temper-ask');
    if (cf && cf.scrollIntoView) cf.scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (action === 'temper-no') { sc.ask = null; repaint(); return true; }
  if (action === 'temper-yes' && sc.ask) {
    const all = temperRowsOf(cs);
    const r = all ? all[sc.ask] : null;
    sc.ask = null;
    if (!r || !r.ladder || !r.ladder.offer) { repaint(); return true; }
    const offer = r.ladder.offer, piece = r.piece, rung = r.ladder.rung + 1;
    runIntent(sc, repaint, () => cs.edgeIntent('unlock_buy', { offer }), 'At the smith…', () => 'Your ' + piece + ' is at rung ' + rung + '.', cs);
    return true;
  }
  return false;
}
