// ════════════════════════════════════════════════════
// src/shell/windows/hallmark-pane.js — THE HALLMARK STEP, ABOVE CRAFTING'S ROWS IN THE WORK WINDOW (src/data/jewelry.js; Tyler 2026-11-05:
// the Hallmark fee is the gold sink, nothing is rolled there and there is no re-roll).
//
// One row per choice this hero can make NOW: each Fine piece it holds (bag or Storage) and each second perk the catalogue pairs it with.
// Every number is the server's (src/session/jewelry-sections.js `hallmark`): the gold, the Crafting level, the account's count today. The
// row says what it takes and what the hero holds; its button stays off until the envelope shows all of it. A press opens a confirmation at
// the shown price; confirming sends ONE hr_hallmark naming the two pieces and that price, and the server re-quotes it under its own lock.
// The new piece shows only from the re-read envelope.
// ════════════════════════════════════════════════════
import { ITEMS } from '../../data/items.js?v=0.2.101';
import { JEWEL_PERKS, perkWords } from '../../data/jewelry.js?v=0.2.101';
import { hallmarkOf, jewelLevelOf, heldForHallmark } from '../../session/jewelry-sections.js?v=0.2.101';
import { hallmarkPiece } from '../../session/hallmark-intents.js?v=0.2.101';
import { goldOf } from '../../session/item-sections.js?v=0.2.101';
import { text, cls, prop, rows, element } from '../../render/paint.js?v=0.2.101';
import { gold, whole } from '../../render/format.js?v=0.2.101';
import { itemName } from '../widgets/bits.js?v=0.2.101';
import { runIntent } from '../intent-words.js?v=0.2.101';
import { whereToGet } from '../item-lore.js?v=0.2.101';

const keyOf = (o) => o.from + '>' + o.to;

/* What one row needs and why its button is off: the first thing missing, in the order the server checks it. */
function blockOf(cs, o, h, purse, lv) {
  if (lv !== null && lv < o.level) return 'Needs Crafting ' + o.level + '. Yours is ' + lv + '.';
  if (h.today >= h.perDay) return 'Your heroes made ' + whole(h.perDay) + ' Hallmarks today. More after midnight UTC.';
  /* where the gem comes from, from the catalogue (item-lore.js whereToGet), so a new tier's gem says its own home */
  if (heldForHallmark(cs, o.gem).all < 1) return 'Needs a ' + itemName(o.gem) + '. ' + (whereToGet(o.gem) ? whereToGet(o.gem) + '. ' : '') + 'Or buy one at the Weighhouse.';
  if (purse !== null && purse < o.gold) return 'You need ' + gold(o.gold - purse) + ' more.';
  return '';
}

/* "you hold 2, 1 in Storage" */
function holdWords(cs, id) {
  const n = heldForHallmark(cs, id);
  return 'you hold ' + whole(n.all) + (n.storage ? ', ' + whole(n.storage) + ' in Storage' : '');
}

/** The section's skeleton, above the skill's rows. */
export function hallmarkPaneHtml() {
  return '<section class="hw-hallmark"><h3 class="hs-sub">Hallmark</h3>'
    + '<p class="hs-note hw-hallmark-how">Set a gem in a Fine piece and choose its second perk. Nothing is rolled here and it can\'t fail. It costs gold and the gem.</p>'
    + '<p class="hs-note hw-hallmark-day"></p>'
    + '<ul class="hw-ledger hw-hallmark-rows"></ul><p class="hh-empty hw-hallmark-none"></p>'
    + '<div class="hw-confirm hw-hallmark-ask" role="alertdialog" aria-label="Confirm the Hallmark"><p class="hw-confirm-q"></p>'
    + '<p class="hw-confirm-note">The Fine piece and the gem are used. The new piece trades like any other.</p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="hallmark-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="hallmark-no">Cancel</button></div></div></section>';
}

/** Patch the section in place. `sc` is the Work window's scratch (one pending flag, one answer line); `sc.hallmark` the row asked about. */
export function patchHallmarkPane(root, ctx, sc) {
  const cs = ctx.character;
  const h = hallmarkOf(cs);
  const purse = goldOf(cs);
  const lv = jewelLevelOf(cs);
  const offers = h ? h.offers : [];
  rows(root.querySelector('.hw-hallmark-rows'), offers, {
    key: keyOf,
    build: (o) => element(ctx.doc, '<li class="hw-line" data-key="' + keyOf(o) + '"><span class="hw-line-name"><b></b><small class="hw-hallmark-what"></small>'
      + '<small class="hw-hallmark-need"></small></span><button type="button" class="hh-tool" data-hs-act="hallmark-ask" data-key="' + keyOf(o) + '"></button></li>'),
    patch: (li, o) => {
      const why = blockOf(cs, o, h, purse, lv);
      const it = ITEMS[o.to];
      /* The choice is the perk: lead with it; the piece it goes on and what it does sit under it. */
      text(li.querySelector('b'), 'Add ' + (JEWEL_PERKS[o.perk] ? JEWEL_PERKS[o.perk].name : o.perk));
      text(li.querySelector('.hw-hallmark-what'), 'Your ' + itemName(o.from) + (it && it.jewelPerks ? ' gains: ' + perkWords(o.perk, it.jewelPerks[o.perk] || 0) + '.' : '.'));
      text(li.querySelector('.hw-hallmark-need'), why || ('Uses it and 1 ' + itemName(o.gem) + ' (' + holdWords(cs, o.gem) + ').'));
      const btn = li.querySelector('button');
      text(btn, 'Hallmark · ' + gold(o.gold));
      prop(btn, 'disabled', !!why || sc.pending || !!sc.hallmark);
    },
  });
  /* With no Fine piece the section is one line (the rows below are the way to one); the rest shows once there is something to choose. */
  prop(root.querySelector('.hw-hallmark-how'), 'hidden', !offers.length);
  prop(root.querySelector('.hw-hallmark-day'), 'hidden', !offers.length);
  text(root.querySelector('.hw-hallmark-day'), h ?'Hallmarks today across your heroes: ' + whole(h.today) + ' of ' + whole(h.perDay) + '.' : '');
  const none = root.querySelector('.hw-hallmark-none');
  cls(none, 'is-on', !offers.length);
  text(none, !h ? 'The Hallmark step loads from the server.' : offers.length ? ''
    : 'Hold a Fine piece to choose its second perk here. Make Banded Signet can roll one, and setting a Road Carnelian in a plain one always does.');
  const asked = sc.hallmark ? offers.find((o) => keyOf(o) === sc.hallmark) : null;
  if (sc.hallmark && (!asked || !!blockOf(cs, asked, h, purse, lv) || sc.pending)) sc.hallmark = null;
  const cf = root.querySelector('.hw-hallmark-ask');
  const yes = cf.querySelector('[data-hs-act="hallmark-yes"]');
  cls(cf, 'is-on', !!sc.hallmark);
  if (sc.hallmark && asked) {
    text(cf.querySelector('.hw-confirm-q'), 'Hallmark your ' + itemName(asked.from) + ' with ' + (JEWEL_PERKS[asked.perk] ? JEWEL_PERKS[asked.perk].name : asked.perk)
      + ' for ' + gold(asked.gold) + ' and a ' + itemName(asked.gem) + '? It makes ' + itemName(asked.to) + ', and can\'t be undone.');
    text(yes, 'Hallmark for ' + gold(asked.gold));
  }
  prop(yes, 'disabled', sc.pending);
}

/** The section's presses; true when handled. */
export function actHallmarkPane(ctx, action, t, sc, repaint) {
  const cs = ctx.character;
  if (action === 'hallmark-ask') {
    sc.hallmark = t.getAttribute('data-key');
    sc.msg = '';
    repaint();
    const cf = t.closest('.hw-hallmark').querySelector('.hw-hallmark-ask');
    if (cf && cf.scrollIntoView) cf.scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (action === 'hallmark-no') { sc.hallmark = null; repaint(); return true; }
  if (action === 'hallmark-yes' && sc.hallmark) {
    const h = hallmarkOf(cs);
    const o = h ? h.offers.find((x) => keyOf(x) === sc.hallmark) : null;
    sc.hallmark = null;
    if (!o) { repaint(); return true; }
    runIntent(sc, repaint, () => hallmarkPiece(ctx.account, cs, o.from, o.to, o.gold), 'At the jeweler\'s bench…', () => 'You made ' + itemName(o.to) + '.', cs);
    return true;
  }
  return false;
}
