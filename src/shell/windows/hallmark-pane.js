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
import { ITEMS } from '../../data/items.js?v=0.2.142';
import { SKILLS_DEF } from '../../data/skills.js?v=0.2.142';
import { JEWEL_PERKS, perkWords } from '../../data/jewelry.js?v=0.2.142';
import { hallmarkOf, jewelLevelOf, heldForHallmark } from '../../session/jewelry-sections.js?v=0.2.142';
import { hallmarkPiece, reforgePiece, luckyRing } from '../../session/hallmark-intents.js?v=0.2.142';
import { luckOf } from '../../session/luck-sections.js?v=0.2.142';
import { goldOf } from '../../session/item-sections.js?v=0.2.142';
import { text, cls, prop, rows, element } from '../../render/paint.js?v=0.2.142';
import { gold, whole } from '../../render/format.js?v=0.2.142';
import { itemName } from '../widgets/bits.js?v=0.2.142';
import { runIntent } from '../intent-words.js?v=0.2.142';
import { whereToGet } from '../item-lore.js?v=0.2.142';
import { t } from '../../render/player-text.js?v=0.2.142';

/* A row's key: its kind (h a Hallmark, r a reforge) and its pair, so the one confirmation knows which verb it asks for. */
const keyOf = (kind) => (o) => kind + ':' + o.from + '>' + o.to;
const benchName = (skill) => (SKILLS_DEF[skill] ? SKILLS_DEF[skill].name : skill);
const perkName = (p) => (JEWEL_PERKS[p] ? JEWEL_PERKS[p].name : p);
const pctOf = (pm) => (Math.round(pm) / 10) + '%';

/* The gem's line when the hero holds none: where it comes from, from the catalogue (item-lore.js whereToGet), so a new tier's gem says its own home. */
const gemShort = (id) => t('jewel.gem_short', { gem: itemName(id), where: whereToGet(id) ? whereToGet(id) + '. ' : '' });

/* What one row needs and why its button is off: the first thing missing, in the order the server checks it. */
const levelShort = (o, lv) => t('jewel.requires', { skill: benchName(o.skill), need: o.level, have: lv });
const goldShort = (o, purse) => t('jewel.gold_short', { gold: gold(o.gold - purse) });
function blockOf(cs, o, h, purse, lv) {
  if (lv !== null && lv < o.level) return levelShort(o, lv);
  if (h.today >= h.perDay) return t('jewel.limit_hallmark', { limit: whole(h.perDay) });
  if (heldForHallmark(cs, o.gem).all < 1) return gemShort(o.gem);
  if (purse !== null && purse < o.gold) return goldShort(o, purse);
  return '';
}
function reforgeBlockOf(cs, o, h, purse, lv) {
  if (lv !== null && lv < o.level) return levelShort(o, lv);
  if (h.reforged >= h.perDay) return t('jewel.limit_reforge', { limit: whole(h.perDay) });
  const bars = heldForHallmark(cs, o.metal).all;
  if (bars < o.bars) return t('jewel.bars_short', { bar: itemName(o.metal), need: whole(o.bars), have: whole(bars) });
  if (heldForHallmark(cs, o.gem).all < 1) return gemShort(o.gem);
  if (purse !== null && purse < o.gold) return goldShort(o, purse);
  return '';
}

/* THE LUCKY JOB (src/data/luck.js; 1013-luck.sql): its row's block, from the luck section's own numbers (the rivets held in the bag and Storage). */
function luckyBlockOf(o, lk, purse, lv) {
  if (lv !== null && lv < o.level) return levelShort(o, lv);
  if (lk.lucky.today >= lk.lucky.perDay) return t('jewel.limit_lucky', { limit: whole(lk.lucky.perDay) });
  const have = lk.rivets.bag + lk.rivets.storage;
  if (have < o.rivets) return t('jewel.rivets_short', { need: whole(o.rivets), have: whole(have) });
  if (purse !== null && purse < o.gold) return goldShort(o, purse);
  return '';
}
const luckyPct = (o) => { const p = ITEMS[o.to] && ITEMS[o.to].jewelPerks; return p && p.lucky ? Math.round(p.lucky / 10) : 0; };

/* "held 2, 1 in Storage" */
function holdWords(cs, id) {
  const n = heldForHallmark(cs, id);
  return n.storage ? t('jewel.held_storage', { n: whole(n.all), storage: whole(n.storage) }) : t('jewel.held', { n: whole(n.all) });
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
    + '<h3 class="hs-sub hw-reforge-head">' + t('jewel.reforge_head') + '</h3>'
    + '<p class="hs-note hw-reforge-how">' + t('jewel.reforge_how') + '</p>'
    + '<ul class="hw-ledger hw-reforge-rows"></ul>'
    + '<h3 class="hs-sub hw-lucky-head">' + t('jewel.lucky_head') + '</h3>'
    + '<p class="hs-note hw-lucky-how">' + t('jewel.lucky_how') + '</p>'
    + '<ul class="hw-ledger hw-lucky-rows"></ul>'
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
  /* the Lucky job's offers: only while the luck section is there (the switch on for the account) */
  const lk = luckOf(cs);
  const luckies = lk ? lk.lucky.offers.filter((o) => o.skill === skill) : [];
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
      text(li.querySelector('b'), t('jewel.reforge_name', { from: itemName(o.from), to: itemName(o.to) }));
      text(li.querySelector('.hw-reforge-what'), it && Number.isInteger(it.reqLv) ? t('jewel.reforge_kept_worn', { perks: keptWords(o), level: it.reqLv }) : t('jewel.reforge_kept', { perks: keptWords(o) }));
      text(li.querySelector('.hw-reforge-need'), why || t('jewel.reforge_uses', { bar: itemName(o.metal), bars: whole(o.bars), barHeld: holdWords(cs, o.metal), gem: itemName(o.gem), gemHeld: holdWords(cs, o.gem) }));
      const btn = li.querySelector('button');
      text(btn, t('jewel.reforge_go', { gold: gold(o.gold) }));
      prop(btn, 'disabled', !!why || sc.pending || !!sc.hallmark);
    },
  });
  rows(root.querySelector('.hw-lucky-rows'), luckies, {
    key: keyOf('l'),
    build: (o) => element(ctx.doc, '<li class="hw-line" data-key="' + keyOf('l')(o) + '"><span class="hw-line-name"><b></b><small class="hw-lucky-what"></small>'
      + '<small class="hw-lucky-need"></small></span><button type="button" class="hh-tool" data-hs-act="hallmark-ask" data-key="' + keyOf('l')(o) + '"></button></li>'),
    patch: (li, o) => {
      const why = luckyBlockOf(o, lk, purse, lv);
      text(li.querySelector('b'), t('jewel.lucky_name', { tier: o.tier }));
      text(li.querySelector('.hw-lucky-what'), t('jewel.lucky_what', { rivets: whole(o.rivets), gold: gold(o.gold), pct: luckyPct(o) }));
      text(li.querySelector('.hw-lucky-need'), why || t('jewel.lucky_uses', { ring: itemName(o.from), ringHeld: holdWords(cs, o.from),
        rivetHeld: t('jewel.held_storage', { n: whole(lk.rivets.bag + lk.rivets.storage), storage: whole(lk.rivets.storage) }) }));
      const btn = li.querySelector('button');
      text(btn, t('jewel.lucky_go', { gold: gold(o.gold) }));
      prop(btn, 'disabled', !!why || sc.pending || !!sc.hallmark);
    },
  });
  prop(root.querySelector('.hw-lucky-head'), 'hidden', !luckies.length);
  prop(root.querySelector('.hw-lucky-how'), 'hidden', !luckies.length);
  /* With nothing to Hallmark the section is one line (the rows below are the way to a Fine piece); the rest shows once there is a choice. */
  prop(root.querySelector('.hw-hallmark-how'), 'hidden', !offers.length);
  prop(root.querySelector('.hw-hallmark-day'), 'hidden', !offers.length && !reforges.length);
  text(root.querySelector('.hw-hallmark-day'), h ? t('jewel.day', { hallmarks: whole(h.today), reforges: whole(h.reforged), limit: whole(h.perDay) }) : '');
  prop(root.querySelector('.hw-reforge-head'), 'hidden', !reforges.length);
  prop(root.querySelector('.hw-reforge-how'), 'hidden', !reforges.length);
  const none = root.querySelector('.hw-hallmark-none');
  cls(none, 'is-on', !offers.length);
  text(none, !h ? 'Loading…' : offers.length ? '' : 'Requires a Fine piece in the bag');
  /* The one confirmation: the row asked about, while it can still be taken. */
  const askedH = sc.hallmark ? offers.find((o) => keyOf('h')(o) === sc.hallmark) : null;
  const askedR = sc.hallmark ? reforges.find((o) => keyOf('r')(o) === sc.hallmark) : null;
  const askedL = sc.hallmark ? luckies.find((o) => keyOf('l')(o) === sc.hallmark) : null;
  const stale = askedH ? !!blockOf(cs, askedH, h, purse, lv) : askedR ? !!reforgeBlockOf(cs, askedR, h, purse, lv) : askedL ? !!luckyBlockOf(askedL, lk, purse, lv) : true;
  if (sc.hallmark && (stale || sc.pending)) sc.hallmark = null;
  const cf = root.querySelector('.hw-hallmark-ask');
  const yes = cf.querySelector('[data-hs-act="hallmark-yes"]');
  cls(cf, 'is-on', !!sc.hallmark);
  if (sc.hallmark && askedH) {
    text(cf.querySelector('.hw-confirm-q'), 'Hallmark ' + itemName(askedH.from) + ' with ' + perkName(askedH.perk)
      + '?\nCost: ' + gold(askedH.gold) + ', 1 ' + itemName(askedH.gem) + '\nResult: ' + itemName(askedH.to) + ', permanent');
    text(cf.querySelector('.hw-confirm-note'), t('jewel.hallmark_note'));
    text(yes, 'Hallmark for ' + gold(askedH.gold));
  } else if (sc.hallmark && askedR) {
    text(cf.querySelector('.hw-confirm-q'), t('jewel.reforge_ask', { from: itemName(askedR.from), gold: gold(askedR.gold), bar: itemName(askedR.metal), bars: whole(askedR.bars),
      gem: itemName(askedR.gem), to: itemName(askedR.to) }));
    text(cf.querySelector('.hw-confirm-note'), t('jewel.reforge_note', { perks: keptWords(askedR) }));
    text(yes, t('jewel.reforge_go', { gold: gold(askedR.gold) }));
  } else if (sc.hallmark && askedL) {
    text(cf.querySelector('.hw-confirm-q'), t('jewel.lucky_ask', { ring: itemName(askedL.from), gold: gold(askedL.gold), rivets: whole(askedL.rivets), to: itemName(askedL.to) }));
    text(cf.querySelector('.hw-confirm-note'), t('jewel.lucky_note', { pct: luckyPct(askedL) }));
    text(yes, t('jewel.lucky_go', { gold: gold(askedL.gold) }));
  }
  prop(yes, 'disabled', sc.pending);
}

/** The section's presses; true when handled. */
export function actHallmarkPane(ctx, action, el, sc, repaint) {
  const cs = ctx.character;
  if (action === 'hallmark-ask') {
    sc.hallmark = el.getAttribute('data-key');
    sc.msg = '';
    repaint();
    const cf = el.closest('.hw-hallmark').querySelector('.hw-hallmark-ask');
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
    const lk = !o && !r ? luckOf(cs) : null;
    const l = lk ? lk.lucky.offers.find((x) => keyOf('l')(x) === asked) : null;
    if (o) runIntent(sc, repaint, () => hallmarkPiece(ctx.account, cs, o.from, o.to, o.gold), 'At the jeweler\'s bench…', () => 'Made ' + itemName(o.to), cs);
    else if (r) runIntent(sc, repaint, () => reforgePiece(ctx.account, cs, r.from, r.to, r.gold), 'At the jeweler\'s bench…', () => 'Made ' + itemName(r.to), cs);
    else if (l) runIntent(sc, repaint, () => luckyRing(ctx.account, cs, l.from, l.gold), 'At the jeweler\'s bench…', () => 'Made ' + itemName(l.to), cs);
    else repaint();
    return true;
  }
  return false;
}
