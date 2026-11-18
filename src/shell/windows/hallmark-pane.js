// ════════════════════════════════════════════════════
// src/shell/windows/hallmark-pane.js — THE HALLMARK STEP AND THE JEWEL REFORGE, ABOVE A JEWEL BENCH'S ROWS IN THE WORK WINDOW
// (src/data/jewelry.js; Tyler 2026-11-05: the Hallmark fee is the gold sink, nothing is rolled there and there is no re-roll; Tyler 2026-11-18:
// all jewelry is Smithing, cloaks Crafting, and a piece reforges up a tier, which must make sense to the player on screen).
//
// One row per choice this hero can make NOW at THIS bench: each Fine piece it holds (bag or Storage) and each second perk the catalogue pairs
// it with; and each Hallmarked piece it holds with the next tier's piece it becomes, both perks kept at the new tier's size. Every number is
// the server's (src/session/jewelry-sections.js `hallmark`): the gold, the bench level, the bars, the account's counts today. A row says
// what it takes and what the hero holds; its button stays off until the envelope shows all of it. A press opens a confirmation at the shown
// price; confirming sends ONE hr_hallmark or hr_jewel_reforge naming the two pieces and that price, and the server re-quotes it under its own
// lock. The new piece shows only from the re-read envelope.
// ════════════════════════════════════════════════════
import { ITEMS } from '../../data/items.js?v=0.2.138';
import { SKILLS_DEF } from '../../data/skills.js?v=0.2.138';
import { JEWEL_PERKS, perkWords } from '../../data/jewelry.js?v=0.2.138';
import { hallmarkOf, jewelLevelOf, heldForHallmark } from '../../session/jewelry-sections.js?v=0.2.138';
import { hallmarkPiece, reforgePiece } from '../../session/hallmark-intents.js?v=0.2.138';
import { goldOf } from '../../session/item-sections.js?v=0.2.138';
import { text, cls, prop, rows, element } from '../../render/paint.js?v=0.2.138';
import { gold, whole } from '../../render/format.js?v=0.2.138';
import { itemName } from '../widgets/bits.js?v=0.2.138';
import { runIntent } from '../intent-words.js?v=0.2.138';
import { whereToGet } from '../item-lore.js?v=0.2.138';

/* A row's key: its kind (h a Hallmark, r a reforge) and its pair, so the one confirmation knows which verb it asks for. */
const keyOf = (kind) => (o) => kind + ':' + o.from + '>' + o.to;
const benchName = (skill) => (SKILLS_DEF[skill] ? SKILLS_DEF[skill].name : skill);
const perkName = (p) => (JEWEL_PERKS[p] ? JEWEL_PERKS[p].name : p);
const pctOf = (pm) => (Math.round(pm) / 10) + '%';

/* The gem's line when the hero holds none: where it comes from, from the catalogue (item-lore.js whereToGet), so a new tier's gem says its own home. */
const gemShort = (id) => 'Needs a ' + itemName(id) + '. ' + (whereToGet(id) ? whereToGet(id) + '. ' : '') + 'Or buy one at the Weighhouse.';

/* What one row needs and why its button is off: the first thing missing, in the order the server checks it. */
function blockOf(cs, o, h, purse, lv) {
  if (lv !== null && lv < o.level) return 'Requires ' + benchName(o.skill) + ' ' + o.level + ', have ' + lv;
  if (h.today >= h.perDay) return 'Daily limit: ' + whole(h.perDay) + ' Hallmarks, resets at midnight UTC';
  if (heldForHallmark(cs, o.gem).all < 1) return gemShort(o.gem);
  if (purse !== null && purse < o.gold) return 'Need ' + gold(o.gold - purse) + ' more';
  return '';
}
function reforgeBlockOf(cs, o, h, purse, lv) {
  if (lv !== null && lv < o.level) return 'Requires ' + benchName(o.skill) + ' ' + o.level + ', have ' + lv;
  if (h.reforged >= h.perDay) return 'Daily limit: ' + whole(h.perDay) + ' reforges, resets at midnight UTC';
  const bars = heldForHallmark(cs, o.metal).all;
  if (bars < o.bars) return 'Needs ' + itemName(o.metal) + ' x' + whole(o.bars) + ', have ' + whole(bars);
  if (heldForHallmark(cs, o.gem).all < 1) return gemShort(o.gem);
  if (purse !== null && purse < o.gold) return 'Need ' + gold(o.gold - purse) + ' more';
  return '';
}

/* "held 2, 1 in Storage" */
function holdWords(cs, id) {
  const n = heldForHallmark(cs, id);
  return 'held ' + whole(n.all) + (n.storage ? ', ' + whole(n.storage) + ' in Storage' : '');
}

/* "Keen 4% → 6%, Follow-through 4% → 6%": each perk kept, at its old size and the new tier's. */
function keptWords(o) {
  const a = (ITEMS[o.from] && ITEMS[o.from].jewelPerks) || {}, b = (ITEMS[o.to] && ITEMS[o.to].jewelPerks) || {};
  return Object.keys(b).map((p) => perkName(p) + ' ' + pctOf(a[p] || 0) + ' → ' + pctOf(b[p])).join(', ');
}

/** The section's skeleton, above the skill's rows. */
export function hallmarkPaneHtml() {
  return '<section class="hw-hallmark"><h3 class="hs-sub">Hallmark</h3>'
    + '<p class="hs-note hw-hallmark-how">Fine piece + gem: pick its second perk, no roll, no fail</p>'
    + '<p class="hs-note hw-hallmark-day"></p>'
    + '<ul class="hw-ledger hw-hallmark-rows"></ul><p class="hh-empty hw-hallmark-none"></p>'
    + '<h3 class="hs-sub hw-reforge-head">Reforge</h3>'
    + '<p class="hs-note hw-reforge-how">Hallmarked piece + next tier\'s bars and gem: both perks kept, no roll, no fail. Worn pieces: unequip first</p>'
    + '<ul class="hw-ledger hw-reforge-rows"></ul>'
    + '<div class="hw-confirm hw-hallmark-ask" role="alertdialog" aria-label="Confirm"><p class="hw-confirm-q"></p>'
    + '<p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="hallmark-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="hallmark-no">Cancel</button></div></div></section>';
}

/**
 * Patch the section in place for the bench `skill` (only its own pieces' steps). `sc` is the Work window's scratch (one pending flag, one
 * answer line); `sc.hallmark` the row asked about.
 */
export function patchHallmarkPane(root, ctx, sc, skill) {
  const cs = ctx.character;
  const h = hallmarkOf(cs);
  const purse = goldOf(cs);
  const lv = jewelLevelOf(cs, skill);
  const offers = h ? h.offers.filter((o) => o.skill === skill) : [];
  const reforges = h ? h.reforges.filter((o) => o.skill === skill) : [];
  rows(root.querySelector('.hw-hallmark-rows'), offers, {
    key: keyOf('h'),
    build: (o) => element(ctx.doc, '<li class="hw-line" data-key="' + keyOf('h')(o) + '"><span class="hw-line-name"><b></b><small class="hw-hallmark-what"></small>'
      + '<small class="hw-hallmark-need"></small></span><button type="button" class="hh-tool" data-hs-act="hallmark-ask" data-key="' + keyOf('h')(o) + '"></button></li>'),
    patch: (li, o) => {
      const why = blockOf(cs, o, h, purse, lv);
      const it = ITEMS[o.to];
      /* The choice is the perk: lead with it; the piece it goes on and what it does sit under it. */
      text(li.querySelector('b'), 'Add ' + perkName(o.perk));
      text(li.querySelector('.hw-hallmark-what'), 'Your ' + itemName(o.from) + (it && it.jewelPerks ? ' gains: ' + perkWords(o.perk, it.jewelPerks[o.perk] || 0) + '.' : '.'));
      text(li.querySelector('.hw-hallmark-need'), why || ('Uses it and 1 ' + itemName(o.gem) + ' (' + holdWords(cs, o.gem) + ').'));
      const btn = li.querySelector('button');
      text(btn, 'Hallmark for ' + gold(o.gold));
      prop(btn, 'disabled', !!why || sc.pending || !!sc.hallmark);
    },
  });
  rows(root.querySelector('.hw-reforge-rows'), reforges, {
    key: keyOf('r'),
    build: (o) => element(ctx.doc, '<li class="hw-line" data-key="' + keyOf('r')(o) + '"><span class="hw-line-name"><b></b><small class="hw-reforge-what"></small>'
      + '<small class="hw-reforge-need"></small></span><button type="button" class="hh-tool" data-hs-act="hallmark-ask" data-key="' + keyOf('r')(o) + '"></button></li>'),
    patch: (li, o) => {
      const why = reforgeBlockOf(cs, o, h, purse, lv);
      const it = ITEMS[o.to];
      /* What it becomes leads; the perks it keeps, at their new size, and what it takes sit under it. */
      text(li.querySelector('b'), itemName(o.from) + ' → ' + itemName(o.to));
      text(li.querySelector('.hw-reforge-what'), 'Perks kept: ' + keptWords(o) + (it && Number.isInteger(it.reqLv) ? '. Worn from Level ' + it.reqLv : ''));
      text(li.querySelector('.hw-reforge-need'), why || ('Uses it, ' + itemName(o.metal) + ' x' + whole(o.bars) + ' (' + holdWords(cs, o.metal) + '), 1 '
        + itemName(o.gem) + ' (' + holdWords(cs, o.gem) + ').'));
      const btn = li.querySelector('button');
      text(btn, 'Reforge for ' + gold(o.gold));
      prop(btn, 'disabled', !!why || sc.pending || !!sc.hallmark);
    },
  });
  /* With nothing to Hallmark the section is one line (the rows below are the way to a Fine piece); the rest shows once there is a choice. */
  prop(root.querySelector('.hw-hallmark-how'), 'hidden', !offers.length);
  prop(root.querySelector('.hw-hallmark-day'), 'hidden', !offers.length && !reforges.length);
  text(root.querySelector('.hw-hallmark-day'), h ? 'Today: Hallmarks ' + whole(h.today) + '/' + whole(h.perDay) + ', reforges ' + whole(h.reforged) + '/' + whole(h.perDay) : '');
  prop(root.querySelector('.hw-reforge-head'), 'hidden', !reforges.length);
  prop(root.querySelector('.hw-reforge-how'), 'hidden', !reforges.length);
  const none = root.querySelector('.hw-hallmark-none');
  cls(none, 'is-on', !offers.length);
  text(none, !h ? 'Loading…' : offers.length ? '' : 'Requires a Fine piece in the bag');
  /* The one confirmation: the row asked about, while it can still be taken. */
  const askedH = sc.hallmark ? offers.find((o) => keyOf('h')(o) === sc.hallmark) : null;
  const askedR = sc.hallmark ? reforges.find((o) => keyOf('r')(o) === sc.hallmark) : null;
  const stale = askedH ? !!blockOf(cs, askedH, h, purse, lv) : askedR ? !!reforgeBlockOf(cs, askedR, h, purse, lv) : true;
  if (sc.hallmark && (stale || sc.pending)) sc.hallmark = null;
  const cf = root.querySelector('.hw-hallmark-ask');
  const yes = cf.querySelector('[data-hs-act="hallmark-yes"]');
  cls(cf, 'is-on', !!sc.hallmark);
  if (sc.hallmark && askedH) {
    text(cf.querySelector('.hw-confirm-q'), 'Hallmark ' + itemName(askedH.from) + ' with ' + perkName(askedH.perk)
      + '?\nCost: ' + gold(askedH.gold) + ', 1 ' + itemName(askedH.gem) + '\nResult: ' + itemName(askedH.to) + ', permanent');
    text(cf.querySelector('.hw-confirm-note'), 'Uses the Fine piece and the gem\nResult: tradeable');
    text(yes, 'Hallmark for ' + gold(askedH.gold));
  } else if (sc.hallmark && askedR) {
    text(cf.querySelector('.hw-confirm-q'), 'Reforge ' + itemName(askedR.from) + '?\nCost: ' + gold(askedR.gold) + ', ' + itemName(askedR.metal) + ' x' + whole(askedR.bars)
      + ', 1 ' + itemName(askedR.gem) + '\nResult: ' + itemName(askedR.to) + ', permanent');
    text(cf.querySelector('.hw-confirm-note'), 'Perks kept: ' + keptWords(askedR) + '\nUses the piece, the bars and the gem\nResult: tradeable');
    text(yes, 'Reforge for ' + gold(askedR.gold));
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
    const asked = sc.hallmark;
    sc.hallmark = null;
    const o = h ? h.offers.find((x) => keyOf('h')(x) === asked) : null;
    const r = !o && h ? h.reforges.find((x) => keyOf('r')(x) === asked) : null;
    if (o) runIntent(sc, repaint, () => hallmarkPiece(ctx.account, cs, o.from, o.to, o.gold), 'At the jeweler\'s bench…', () => 'Made ' + itemName(o.to), cs);
    else if (r) runIntent(sc, repaint, () => reforgePiece(ctx.account, cs, r.from, r.to, r.gold), 'At the jeweler\'s bench…', () => 'Made ' + itemName(r.to), cs);
    else repaint();
    return true;
  }
  return false;
}
