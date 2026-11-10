// ════════════════════════════════════════════════════
// src/shell/windows/temper-pane.js — THE SMITH, ON THE SHOP'S SERVICES TAB (Tyler 2026-11-04: "some sort of upgrade system
// that slightly increases gear power"; src/data/temper.js is the design).
//
// Two rows, for what this hero wears NOW: Blows (its weapon's ladder) and Armor (the ladder of the armor it wears most). Every
// number is the server's (src/session/temper-sections.js). A rung takes gold and crafted material (Tyler 2026-11-05): the row says
// what it needs, what the hero holds and where to get it, and its button stays off until the envelope shows both. A press opens a
// confirmation at the shown price; confirming sends ONE unlock_buy naming the offer and no number, and hr_unlock_buy prices it under
// its own lock. A rung is permanent and not refundable, so it asks once; nothing changes on screen until the re-read envelope says so.
// The answer takes the question's place, in the flow (.hw-temper-msg), never the tab's line stuck to the sheet's foot: on a phone that line lay over the
// note saying where the next rung's material comes from, for the 30 s an answer stands (lane/c-temper-craft's play, 2026-11-05).
// ════════════════════════════════════════════════════
import { temperRowsOf } from '../../session/temper-sections.js?v=0.2.112';
import { goldOf } from '../../session/item-sections.js?v=0.2.112';
import { text, cls, prop, rows, element } from '../../render/paint.js?v=0.2.112';
import { gold, whole, listWords } from '../../render/format.js?v=0.2.112';
import { runIntent } from '../intent-words.js?v=0.2.112';
import { huntedOnly, saleWords } from '../item-lore.js?v=0.2.112';
import { dropWhereWords, dropHuntOf } from '../hunt-ground-facts.js?v=0.2.112';
import { patchParts, targetOf } from '../goto.js?v=0.2.112';
import { t } from '../../render/player-text.js?v=0.2.112';

const TRACKS = Object.freeze([
  { id: 'blows', label: 'Blows', effect: 'your blows and heals land', worse: 'harder', none: 'Wield a weapon to temper it.' },
  { id: 'armor', label: 'Armor', effect: 'blows reach you', worse: 'softer', none: 'Wear armor to temper it.' },
]);
const pct = (pm) => String(pm / 10) + '%';

/** What a row says: the rung, what it does now, what the next rung does. */
function rowWords(track, r) {
  if (!r.piece) return track.none;
  if (!r.ladder) return 'Your ' + r.piece + ' can\'t be tempered' + (r.below ? '. Gear worn from Level 15 can.' : ' yet.');
  const now = 'Rung ' + r.ladder.rung + ' of ' + r.ladder.max + ': ';
  if (!r.ladder.offer) return now + track.effect + ' ' + pct(r.nowPm) + ' ' + track.worse + '. The most this gear takes.';
  return (r.ladder.rung ? now + track.effect + ' ' + pct(r.nowPm) + ' ' + track.worse + '. Next rung ' + pct(r.nextPm) + '.'
    : 'Not tempered yet. First rung: ' + track.effect + ' ' + pct(r.nextPm) + ' ' + track.worse + '.');
}

/* What the next rung takes besides gold, and what this hero holds. */
const needWords = (needs) => needs.map((n) => 'Needs ' + whole(n.need) + ' ' + n.name + '. You hold ' + whole(n.held) + (n.storage ? ' (' + whole(n.storage) + ' in Storage)' : '') + '.').join(' ');

/* Where an input only a hunt gets drops, from the monsters' rows and the open grounds, never typed (Tyler 2026-11-07: "what drops the
   Fine Tempering Salts?"): "Big Bones drop from Hobgoblin Foreman at Coppercap Warrens." */
const DROPPED_BY = 'Dropped by ';
function dropWords(f) {
  const w = huntedOnly(f.id) ? dropWhereWords(f.id) : '';
  if (!w) return '';
  return w.startsWith(DROPPED_BY) ? t('temper.drop_from', { stack: f.stack, where: w.slice(DROPPED_BY.length) }) : t('temper.drop_pulled', { where: w, stack: f.stack });
}

/* Where to get what either row is short of, said once under both: the two rows usually ask for the same thing. The Weighhouse is named
   only for what it lists (item-lore saleWords, the market's rule). Each sentence is a link to its place (Tyler 2026-11-08): the smith's
   sentence to the Smithing row that makes it, a drop's to its ground in Hunts, the Weighhouse's to the market. */
function wayParts(rows) {
  const said = new Map();
  for (const r of rows) for (const n of r.needs) {
    if (!n.short || !n.smith || said.has(n.id)) continue;
    const inputs = listWords(n.smith.from.map((f) => f.words), Infinity);
    said.set(n.id, [{ words: n.smith.level < n.smith.req
      ? t('temper.way_smith_short', { name: n.name, req: n.smith.req, level: n.smith.level, inputs })
      : t('temper.way_smith', { name: n.name, req: n.smith.req, inputs }), target: targetOf({ kind: 'work', skill: 'smithing', row: n.smith.id }) },
    ...n.smith.from.map((f) => ({ words: dropWords(f), target: targetOf({ kind: 'hunt', hunt: dropHuntOf(f.id) }) })),
    { words: saleWords(n.id) ? '' : t('temper.way_weighhouse'), target: targetOf({ kind: 'market' }) }].filter((p) => p.words));
  }
  return [...said.values()].flat().flatMap((p, i) => (i ? [' ', p] : [p]));
}

/** The section's skeleton, inside the Services tab. */
export function temperPaneHtml() {
  return '<h3 class="hs-sub">Tempering</h3>'
    + '<p class="hs-note">The smith works what this hero wears. A rung lasts and can\'t fail. Each tier of gear has its own five rungs, so new gear starts fresh and your old gear keeps its own.</p>'
    + '<ul class="hw-ledger hw-temper"></ul>'
    + '<p class="hs-note hw-temper-way"></p>'
    + '<div class="hw-confirm hw-temper-ask" role="alertdialog" aria-label="Confirm the tempering"><p class="hw-confirm-q"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="temper-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="temper-no">Cancel</button></div></div>'
    + '<p class="hw-temper-msg" role="status" aria-live="polite"></p>';
}

/** Patch the section in place. `sc` is the Services tab's own scratch: one pending flag, one answer, and `msgAt` 'temper' when it is this section's. */
export function patchTemperPane(root, ctx, sc) {
  const cs = ctx.character;
  const purse = goldOf(cs);
  const all = temperRowsOf(cs);
  const row = (id) => (all ? all[id] : null);
  rows(root.querySelector('.hw-temper'), all ? [...TRACKS] : [], {
    key: (track) => track.id,
    build: (track) => element(ctx.doc, '<li class="hw-line" data-track="' + track.id + '"><span class="hw-line-name"><b></b><small class="hw-temper-now"></small><small class="hw-temper-need"></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="temper-ask" data-track="' + track.id + '"></button></li>'),
    patch: (li, track) => {
      const r = row(track.id);
      const offer = r.ladder ? r.ladder.offer : null;
      const short = offer && purse !== null && purse < r.ladder.gold ? r.ladder.gold - purse : 0;
      const itemsShort = r.needs.some((n) => n.short > 0);
      text(li.querySelector('b'), track.label + (r.piece ? ' · ' + r.piece : ''));
      text(li.querySelector('.hw-temper-now'), rowWords(track, r) + (short ? ' You need ' + gold(short) + ' more.' : ''));
      text(li.querySelector('.hw-temper-need'), needWords(r.needs));
      const btn = li.querySelector('button');
      text(btn, offer ? 'Temper · ' + gold(r.ladder.gold) : r.ladder ? 'Full' : 'No rungs');
      prop(btn, 'disabled', !offer || !!short || itemsShort || sc.pending || !!sc.ask);
    },
  });
  patchParts(root.querySelector('.hw-temper-way'), all ? wayParts([all.blows, all.armor]) : []);
  const asked = sc.ask ? row(sc.ask) : null;
  const can = !!asked && !!asked.ladder && !!asked.ladder.offer && !sc.pending && (purse === null || purse >= asked.ladder.gold) && !asked.needs.some((n) => n.short > 0);
  if (sc.ask && !can) sc.ask = null;
  const cf = root.querySelector('.hw-temper-ask');
  const yes = cf.querySelector('[data-hs-act="temper-yes"]');
  cls(cf, 'is-on', !!sc.ask);
  cls(yes, 'is-on', !!sc.ask);
  if (sc.ask) {
    const also = asked.needs.map((n) => ' and ' + whole(n.need) + ' ' + n.name).join('');
    text(cf.querySelector('.hw-confirm-q'), 'Temper your ' + asked.piece + ' to rung ' + (asked.ladder.rung + 1) + ' for ' + gold(asked.ladder.gold) + also + '? It stays on this hero, and can\'t be sold back.');
    text(yes, 'Temper for ' + gold(asked.ladder.gold));
  }
  prop(yes, 'disabled', sc.pending);
  text(root.querySelector('.hw-temper-msg'), sc.msgAt === 'temper' ? sc.msg : '');
}

/** The section's presses; true when handled. */
export function actTemperPane(ctx, action, el, sc, repaint) {
  const cs = ctx.character;
  if (action === 'temper-ask') {
    sc.ask = el.getAttribute('data-track');
    sc.msg = '';
    sc.msgAt = 'temper';
    repaint();
    /* the question sits under the rows: on a short window it opens below the fold, and the press looks dead (played 11-04) */
    const cf = el.closest('.hw-services').querySelector('.hw-temper-ask');
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
    /* A refusal means this window held numbers the server no longer has (Storage is the account's, and another hero spends it): one bounded re-read, so the row and the answer agree. */
    const send = async () => { const r = await cs.edgeIntent('unlock_buy', { offer }); if (!r.ok && r.error !== 'closed') await cs.resync(); return r; };
    /* the answer takes the question's place; the re-read rows above it can grow (a short purse, where the next salts come from), so once it lands a short
       sheet scrolls it back into view (played 2026-11-05 at 844x390: half of it stood under the sheet's foot) */
    const line = el.closest('.hw-services') ? el.closest('.hw-services').querySelector('.hw-temper-msg') : null;
    sc.msgAt = 'temper';
    runIntent(sc, repaint, send, 'At the smith…', () => 'Your ' + piece + ' is at rung ' + rung + '.', cs).then(() => {
      if (line && line.isConnected && line.textContent && line.scrollIntoView) line.scrollIntoView({ block: 'nearest' });
    });
    return true;
  }
  return false;
}
