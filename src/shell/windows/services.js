// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/services.js — THE SHOP'S SERVICES TAB: STAMINA AND BLESSINGS (lane S2).
//
// Tyler 2026-10-25 ("Lets move services to the 'shop' menu"): no window of its own any more; the Shop
// (shop.js) shows this pane as its third tab, and R opens the Shop on it (src/data/shell-windows.js tabKeys).
// Three services the town sells, every number the SERVER's (Tempering, the smith's rungs, is temper-pane.js):
//   Stamina    the next hunting block as the server prices it (`time_blocks`,
//              1058-hunting-blocks.sql): the 2 h it adds, its gold, and how many
//              of today's are bought. Buy opens a confirmation with that price; one
//              press sends ONE hr_time_buy carrying the quoted price, which the server
//              refuses if its own price has changed. Never automatic.
//   Blessings  the three tiers (`blessings`): owned or not, each tier's price
//              at this character's level ("free until 30"), and that a death
//              uses them up. Only the next missing tier can be bought: ONE
//              hr_blessing_buy (tier, quoted price).
// A hero's name is changed on the Characters window (characters.js, a paid
// hr_hero_rename since 2026-12-04-hero-rename.sql), not here.
// Every control is off while an intent is in flight; nothing changes on
// screen until the re-read envelope says so.
// ════════════════════════════════════════════════════════════════════════
import { huntBlockOf, blessingsOf, goldOf } from '../../session/item-sections.js';
import { staminaOf } from '../../session/hunt-sections.js';
import { staminaAskWords } from '../widgets/stamina-buy.js';
import { text, cls, prop, rows, element } from '../../render/paint.js';
import { whole, gold, hoursWords as hoursText } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { runIntent } from '../intent-words.js';
import { t } from '../../render/player-text.js';
import { temperPaneHtml, patchTemperPane, actTemperPane } from './temper-pane.js';
import { blessAll } from '../bless-all.js';
import { timeRuleHtml, patchTimeRule, actTimeRule } from './time-rule-pane.js';

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']);
/* A Blessing's name: "Blessing" when the server sells one, "Blessing II" among several (lane/level-costs, 2026-11-22). */
const blessName = (b, tier) => t('shop.bless_name', { count: b && b.tiers ? b.tiers.length : 0, n: ROMAN[tier] || String(tier) });
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { confirm: false, pending: false, msg: '', msgAt: null }; SCRATCH.set(cs, s); } return s; };

/** The tab's skeleton (built once per opening of the Shop, inside its pane). */
export function servicesPaneHtml() {
  return '<div class="hw-services">'
    + '<h3 class="hs-sub">Stamina</h3>'
    + '<p class="hs-note hw-stam-now"></p><p class="hw-stam-quote"></p>'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="stam-ask"></button></div>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the stamina purchase"><p class="hw-confirm-q"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="stam-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="stam-no">Cancel</button></div></div>'
    /* THE "BUY DAILY" RULE for hunting blocks (1071-work-blocks.sql; ./time-rule-pane.js): off by default, the server buys */
    + timeRuleHtml('hunt')
    + '<h3 class="hs-sub">Blessings</h3>'
    + '<p class="hs-note hw-bless-note"></p>'
    + '<ul class="hw-ledger hw-bless"></ul>'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="bless-all"></button></div>'
    + '<p class="hs-note hw-bless-all-why" hidden></p>'
    + temperPaneHtml()
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

/** Patch the tab in place (the Shop's patch, while its Services tab shows). */
export function patchServicesPane(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-services');
  const purse = goldOf(cs);
  /* STAMINA */
  const st = staminaOf(cs);
  const q = huntBlockOf(cs);
  text(root.querySelector('.hw-stam-now'), st ? 'Stamina ' + hoursText(st.msLeft) + ' of ' + hoursText(st.capMs) : 'Loading stamina…');
  const quote = root.querySelector('.hw-stam-quote');
  const ask = root.querySelector('[data-hs-act="stam-ask"]');
  if (!q) { text(quote, t('hud.stam_unpriced')); text(ask, t('hud.stam_buy')); }
  else if (!q.available) {
    text(quote, q.why === 'stamina_full' ? t('shop.block_full') : t('shop.block_used', { max: whole(q.perDay) }));
    text(ask, t('hud.stam_buy'));
  } else {
    text(quote, t(purse !== null && purse < q.price ? 'shop.block_quote_short' : 'shop.block_quote', { hours: hoursText(q.blockMs), price: gold(q.price),
      n: whole(q.boughtToday), max: whole(q.perDay), short: gold(Math.max(0, q.price - (purse || 0))) }));
    text(ask, t('hud.stam_go_plus', { hours: hoursText(q.blockMs), price: gold(q.price) }));
  }
  const canStam = !!q && q.available && !sc.pending && (purse === null || purse >= q.price);
  prop(ask, 'disabled', !canStam || sc.confirm);
  if (sc.confirm && !canStam) sc.confirm = false;
  const cf = root.querySelector('.hw-confirm');
  cls(cf, 'is-on', sc.confirm);
  const yes = root.querySelector('[data-hs-act="stam-yes"]');
  cls(yes, 'is-on', sc.confirm);
  if (sc.confirm && q) {
    text(cf.querySelector('.hw-confirm-q'), staminaAskWords(q));
    text(yes, 'Buy for ' + gold(q.price));
  }
  prop(yes, 'disabled', sc.pending);
  /* BLESSINGS */
  const b = blessingsOf(cs);
  text(root.querySelector('.hw-bless-note'), !b ? 'Loading Blessings…'
    : (b.tiers.some((r) => r.tier === 1 && r.permille > 0) ? 'Each Blessing: −' + Math.round(b.tiers.find((r) => r.tier === 1).permille / 10) + '% death XP loss · ' : '') + 'Used up on death' + (b.freeUntil ? ' · Free until Level ' + b.freeUntil : ''));
  const next = b ? b.tiers.find((r) => !r.held) : null;
  rows(root.querySelector('.hw-bless'), b ? b.tiers : [], {
    key: (r) => String(r.tier),
    build: (r) => element(ctx.doc, '<li class="hw-line" data-tier="' + r.tier + '"><span class="hw-line-name"><b>' + esc(blessName(b, r.tier)) + '</b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="bless" data-tier="' + r.tier + '"></button></li>'),
    patch: (li, r) => {
      const short = !r.held && next && next.tier === r.tier && purse !== null && purse < r.price ? r.price - purse : 0;
      text(li.querySelector('small'), Math.round(r.permille / 10) + '% less XP lost' + (r.tier > 1 ? ' with ' + (r.tier > 2 ? 'I and II' : 'I') : '') + ', ' + (r.held ? 'owned' : r.price ? gold(r.price) : 'free')
        + (short ? ', need ' + gold(short) + ' more' : ''));
      const btn = li.querySelector('button');
      text(btn, r.held ? 'Owned' : next && next.tier === r.tier ? (r.price ? 'Bless for ' + gold(r.price) : 'Bless for free') : 'Needs ' + ROMAN[r.tier - 1]);
      prop(btn, 'disabled', r.held || !next || next.tier !== r.tier || sc.pending || (purse !== null && purse < r.price));
    },
  });
  /* BLESS ALL (designer re-read 2026-11-11: three presses to bless again after every death): shown while two or more are missing, off as the next
     tier's own button would be. No total is said: each tier is priced by the server as it is bought (../bless-all.js, the summary's Bless too). */
  const all = root.querySelector('[data-hs-act="bless-all"]');
  const missing = b ? b.tiers.filter((x) => !x.held).length : 0;
  const allShort = purse !== null && !!next && purse < next.price;
  text(all, t('shop.bless_all'));
  prop(all.parentNode, 'hidden', missing < 2);
  prop(all, 'disabled', missing < 2 || sc.pending || allShort);
  /* why it is off, in words on screen (phones have no hover): all on, short of gold for the next one, or a purchase under way */
  const allWhy = !b || !b.tiers.length ? '' : !missing ? t('shop.bless_all_on', { count: b.tiers.length }) : missing < 2 ? '' : sc.pending ? t('shop.bless_all_busy') : allShort ? t('shop.bless_all_short') : '';
  text(root.querySelector('.hw-bless-all-why'), allWhy);
  prop(root.querySelector('.hw-bless-all-why'), 'hidden', !allWhy);
  /* THE HUNTING BLOCK'S "BUY DAILY" RULE (under the stamina block's controls) */
  patchTimeRule(root, cs, sc, 'hunt');
  patchTemperPane(root, ctx, sc);
  /* the tab's line answers Stamina and Blessings; Tempering's answer stands in its own section (temper-pane.js) */
  text(root.querySelector('.hh-intent-msg'), sc.msgAt === 'temper' ? '' : sc.msg);
  cls(root, 'is-pending', sc.pending);
}

/** The tab's presses (the Shop routes its clicks here first); true when handled. */
export function actServicesPane(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => patchServicesPane(body, ctx);
  if (actTemperPane(ctx, action, el, sc, repaint)) return true;
  if (action === 'time-rule') { sc.msgAt = null; return actTimeRule(ctx, action, el, sc, repaint); }
  if (action === 'stam-ask') { const q = huntBlockOf(cs); if (q && q.available) { sc.confirm = true; sc.msg = ''; repaint(); } return true; }
  if (action === 'stam-no') { sc.confirm = false; repaint(); return true; }
  if (action === 'stam-yes' && sc.confirm) {
    const q = huntBlockOf(cs);
    sc.confirm = false;
    if (!q || !q.available) { repaint(); return true; }
    sc.msgAt = null;
    runIntent(sc, repaint, () => cs.buyTime('hunt', q.price), t('hud.stam_buying'), () => t('hud.stam_done'));
    return true;
  }
  if (action === 'bless') {
    const b = blessingsOf(cs);
    const tier = Number(el.getAttribute('data-tier'));
    const row = b && b.tiers.find((x) => x.tier === tier);
    if (!row || row.held) return true;
    sc.msgAt = null;
    runIntent(sc, repaint, () => cs.buyBlessing(tier, row.price), 'Blessing…', () => t('shop.bless_gained', { count: b.tiers.length, name: blessName(b, tier) }));
    return true;
  }
  if (action === 'bless-all') {
    sc.msgAt = null;
    runIntent(sc, repaint, () => blessAll(cs), t('shop.bless_all_busy'), () => {
      const b = blessingsOf(cs);
      return b ? t('shop.bless_all_done', { count: b.tiers.length }) : '';
    });
    return true;
  }
  return false;
}
