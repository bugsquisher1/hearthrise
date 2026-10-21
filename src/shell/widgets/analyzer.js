// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/analyzer.js — THE HUNT ANALYZER (parity AW-01..AW-15).
//
// Fed ONLY by the character's `hunt_analyzer` section (src/session/
// hunt-sections.js analyzerOf): the client computes no tally, no rate and no
// balance (HUNT_SCREEN_SPEC §3.6 #6). A number the server did not send reads
// as a dash.
//
// BASIC FOR EVERYONE, MORE WITH PREMIUM (Tyler 2026-10-19, replacing the 10-17
// "only premium sees it"): every character sees the BASIC block — session time,
// kills, XP and XP/h, loot value and gold/h, supplies spent (own vs store),
// balance. The server's `premium` section adds the rest — next-level ETA, raw
// XP, waste, damage taken and dealt (the two tabs) and the party breakdown. A
// free character's premium nodes are hidden AND never written, and one quiet
// line says "More detail with premium." No upsell beyond that line. The server
// sends a free character only the basic block (2026-10-26-hunt-analyzer-basic.sql).
//
//   This hero / Party   which of the server's two views is shown (AW-04)
//   Session / Taken / Dealt   the three tabs (AW-05)
//   sections fold (AW-11); lists are keyed rows (AW-12)
//
// The session clock runs between envelopes from the server's session_ms and
// the moment that envelope arrived (display only; the next envelope replaces
// it). The view, tab and folds are display scratch on the panel.
// ════════════════════════════════════════════════════════════════════════
import { analyzerOf, isPremium } from '../../session/hunt-sections.js?v=0.2.21';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.21';
import { whole, gold, clock } from '../../render/format.js?v=0.2.21';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.21';
import { panelHtml, itemIconHtml, itemName, monsterName, abilityName, elementName } from './bits.js?v=0.2.21';

const TABS = Object.freeze([['session', 'Session'], ['taken', 'Taken'], ['dealt', 'Dealt']]);
/* What only a premium character sees: these stats (section.stat), and every section off the Session tab. */
const PREMIUM_STATS = new Set(['totals.waste', 'rates.rawXp', 'rates.waste', 'rates.balance']);
const premiumTab = (tab) => tab !== 'session';

/* Each section: its tab, its title and its body (a fixed list of stat rows, or a keyed list). */
const SECTIONS = Object.freeze([
  { id: 'totals', tab: 'session', title: 'Session', stats: [['kills', 'Monsters killed', whole], ['xp', 'XP gained', whole], ['gold', 'Gold', gold], ['waste', 'Supplies cost', gold], ['balance', 'Balance', gold]] },
  { id: 'rates', tab: 'session', title: 'Per hour', stats: [['xp', 'XP per hour', whole, 'perHour'], ['rawXp', 'Raw XP per hour', whole, 'perHour'], ['gold', 'Gold per hour', gold, 'perHour'], ['waste', 'Supplies per hour', gold, 'perHour'], ['balance', 'Balance per hour', gold, 'perHour']] },
  { id: 'supplies', tab: 'session', title: 'Supplies used', list: 'supplies' },
  { id: 'loot', tab: 'session', title: 'Loot collected', list: 'loot' },
  { id: 'byMonster', tab: 'taken', title: 'Taken from each monster', map: 'takenByMonster', name: monsterName },
  { id: 'takenEl', tab: 'taken', title: 'Taken by damage type', map: 'takenByElement', name: elementName },
  { id: 'byAbility', tab: 'dealt', title: 'Dealt by each attack', map: 'dealtByAbility', name: abilityName },
  { id: 'dealtEl', tab: 'dealt', title: 'Dealt by damage type', map: 'dealtByElement', name: elementName },
]);

function sectionHtml(s) {
  const prem = (k) => (PREMIUM_STATS.has(s.id + '.' + k) ? ' data-premium' : '');
  const stats = s.stats ? '<dl class="ha-stats">' + s.stats.map(([k, label]) => '<dt' + prem(k) + '>' + esc(label) + '</dt><dd data-stat="' + k + '"' + prem(k) + '></dd>').join('') + '</dl>' : '';
  return '<section class="ha-sec" data-sec="' + s.id + '" data-tab="' + s.tab + '"' + (premiumTab(s.tab) ? ' data-premium' : '') + '>'
    + '<h3 class="ha-sec-head"><button type="button" class="ha-fold" data-hs-act="fold" aria-expanded="true">' + esc(s.title) + '</button></h3>'
    + '<div class="ha-sec-body">' + stats + (s.stats ? '' : '<ul class="ha-list"></ul><p class="ha-none">Nothing yet.</p>') + '</div></section>';
}

/** The skeleton (built once). */
export function renderAnalyzer() {
  const tools = '<span class="ha-scope" role="group" aria-label="Whose numbers">'
    + '<button type="button" class="hh-tool" data-hs-act="scope" data-scope="hero" aria-pressed="true">This hero</button>'
    + '<button type="button" class="hh-tool" data-hs-act="scope" data-scope="party" aria-pressed="false">Party</button></span>';
  const body = '<p class="ha-wait">The analyzer fills in once the hunt has run for a moment.</p>'
    + '<div class="ha-main">'
    + '<p class="ha-ended" role="status">Hunt ended. This is the session summary.</p>'
    + '<div class="ha-clocks"><span><small>Session</small><b data-clock="session"></b></span><span data-premium><small>Next level in</small><b data-clock="next"></b></span></div>'
    + '<div class="ha-tabs" role="tablist">' + TABS.map(([id, label], i) => '<button type="button" role="tab" class="ha-tab" data-hs-act="tab" data-tab="' + id + '" aria-selected="' + (i === 0) + '"' + (premiumTab(id) ? ' data-premium' : '') + '>' + label + '</button>').join('') + '</div>'
    + '<div class="ha-scroll">' + SECTIONS.map(sectionHtml).join('') + '</div>'
    + '<p class="hs-note ha-more" hidden>More detail with premium.</p></div>';
  return panelHtml('ha-analyzer', 'Hunt analyzer', tools, body);
}

function lineHtml() {
  return '<li class="ha-line"><span class="ha-ico"></span><span class="ha-name"></span><span class="ha-count"></span><span class="ha-val"></span></li>';
}

function patchList(ul, items, key, fill, ctx) {
  /* keep: a line that leaves (a loot line between envelopes, the hero/party toggle) comes back as
     the same node, its icon never fetched again; its keys are items, monsters and abilities. */
  rows(ul, items, {
    key,
    keep: true,
    build: (it) => {
      const li = element(ctx.doc, lineHtml());
      if (it.item) li.querySelector('.ha-ico').innerHTML = itemIconHtml(ctx.glyphs, it.item);
      return li;
    },
    patch: (li, it) => fill(li, it),
  });
  cls(ul.nextElementSibling, 'is-on', !items.length);
}

function patchView(root, v, ctx, premium) {
  for (const s of SECTIONS) {
    const sec = root.querySelector('[data-sec="' + s.id + '"]');
    if (!premium && premiumTab(s.tab)) continue;
    if (s.stats) {
      for (const [k, , fmt, from] of s.stats) {
        const dd = sec.querySelector('[data-stat="' + k + '"]');
        text(dd, !premium && PREMIUM_STATS.has(s.id + '.' + k) ? '' : fmt(from ? v[from][k] : v[k]));
      }
      cls(sec.querySelector('[data-stat="balance"]'), 'is-loss', (s.id === 'totals' ? v.balance : v.perHour.balance) < 0);
    } else if (s.list === 'supplies') {
      patchList(sec.querySelector('.ha-list'), v.supplies, (it) => it.item + ':' + it.source, (li, it) => {
        text(li.querySelector('.ha-name'), itemName(it.item) + (it.source === 'own' ? ' (own)' : ' (store)'));
        text(li.querySelector('.ha-count'), '×' + whole(it.count));
        text(li.querySelector('.ha-val'), it.source === 'own' ? 'free' : gold(it.gold));
      }, ctx);
    } else if (s.list === 'loot') {
      patchList(sec.querySelector('.ha-list'), v.loot, (it) => it.item, (li, it) => {
        text(li.querySelector('.ha-name'), itemName(it.item));
        text(li.querySelector('.ha-count'), '×' + whole(it.count));
        text(li.querySelector('.ha-val'), gold(it.value));
      }, ctx);
    } else {
      const items = Object.entries(v[s.map]).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n }));
      patchList(sec.querySelector('.ha-list'), items, (it) => it.id, (li, it) => {
        text(li.querySelector('.ha-name'), s.name(it.id));
        text(li.querySelector('.ha-val'), whole(it.n));
      }, ctx);
    }
  }
}

renderAnalyzer.patch = function patchAnalyzer(el, ctx) {
  const panel = el.querySelector('.ha-analyzer');
  const premium = isPremium(ctx.character);
  const a = analyzerOf(ctx.character);
  cls(panel, 'is-waiting', !a);
  /* The premium rows: shown only to a premium character; a free one gets the one quiet line. */
  for (const n of panel.querySelectorAll('[data-premium]')) prop(n, 'hidden', !premium);
  prop(panel.querySelector('.ha-more'), 'hidden', premium);
  if (!premium && panel.getAttribute('data-tab') && panel.getAttribute('data-tab') !== 'session') {
    attr(panel, 'data-tab', 'session');
    for (const b of panel.querySelectorAll('.ha-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === 'session'));
  }
  if (!premium) for (const n of panel.querySelectorAll('dd[data-premium], [data-clock="next"]')) if (n.textContent) n.textContent = '';
  if (!a) return;
  const scope = premium && panel.getAttribute('data-scope') === 'party' && a.party ? 'party' : 'hero';
  cls(panel, 'has-party', premium && !!a.party);
  cls(panel, 'is-ended', a.ended);
  const since = ctx.character.receivedAt;
  const live = !a.ended && Number.isFinite(since) ? Math.max(0, ctx.now() - since) : 0;
  text(panel.querySelector('[data-clock="session"]'), clock(a.sessionMs === null ? null : a.sessionMs + live));
  if (premium) text(panel.querySelector('[data-clock="next"]'), clock(a.nextLevelMs === null ? null : Math.max(0, a.nextLevelMs - live)));
  patchView(panel, scope === 'party' ? a.party : a.hero, ctx, premium);
};

renderAnalyzer.act = function actAnalyzer(ctx, el, action, ev, btn) {
  if (ev.type !== 'click') return;
  const panel = el.querySelector('.ha-analyzer');
  if (action === 'scope') {
    const scope = btn.getAttribute('data-scope');
    attr(panel, 'data-scope', scope);
    for (const b of panel.querySelectorAll('[data-scope][data-hs-act]')) attr(b, 'aria-pressed', String(b === btn));
  } else if (action === 'tab') {
    const tab = btn.getAttribute('data-tab');
    attr(panel, 'data-tab', tab);
    for (const b of panel.querySelectorAll('.ha-tab')) attr(b, 'aria-selected', String(b === btn));
  } else if (action === 'fold') {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    attr(btn, 'aria-expanded', String(open));
    cls(btn.closest('.ha-sec'), 'is-folded', !open);
    return;
  } else return;
  renderAnalyzer.patch(el, ctx);
};
