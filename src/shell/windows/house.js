// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/house.js — THE HOUSE: THE ACCOUNT'S ESTATE LEDGER.
//
// One home per account, shared by every character (Tyler 2026-10-15), so any
// character opens the same house. The gold comes from the account's shared
// purse; each material from the building hero's bag first, then the account's
// Storage (2027-01-10-house-from-storage.sql). The window reads like a deed,
// top to bottom (ART_DIRECTION §12):
//   The deed           the property ladder: the tiers held, the next one with
//                      what it opens and its full price against what this
//                      hero's bag and the Storage hold, the later ones by name only
//   Rooms              each room's rung and what it does now; its next rung's
//                      price, or the tier that opens it
//   Storage chests     the account storage's space: chests built, the next one
//                      priced, the rest waiting on the home
// Every price, level, gate and count is the server's (`home`, `depot`, the bag's
// `inventory`, the Storage's `bank`; CLAUDE.md §6).
// A purchase asks first (the full price and who pays), then sends ONE intent
// (src/session/home-intents.js); every control is off until the server
// answers, and the ledger changes only from the re-read envelope. A refusal is
// said in plain words. A room whose rungs do nothing yet offers no purchase.
// ════════════════════════════════════════════════════════════════════════
import { homeOf, chestsOf } from '../../session/home-sections.js?v=0.2.126';
import { buyHome, buildChest } from '../../session/home-intents.js?v=0.2.126';
import { bagOf, bankOf, goldOf, nameOf } from '../../session/item-sections.js?v=0.2.126';
import { PROPERTY_TIERS } from '../../data/homestead-tiers.js?v=0.2.126';
import { ROOM_PERKS } from '../../data/perks.js?v=0.2.126';
import { text, cls, prop, attr, rows, element } from '../../render/paint.js?v=0.2.126';
import { whole, gold } from '../../render/format.js?v=0.2.126';
import { itemName } from '../widgets/bits.js?v=0.2.126';
import { runIntent } from '../intent-words.js?v=0.2.126';
import { wherePlaces } from '../item-lore.js?v=0.2.126';
import { patchParts, placesParts } from '../goto.js?v=0.2.126';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.126';
import { t } from '../../render/player-text.js?v=0.2.126';

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { ask: null, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/* What a room rung does, in words (src/data/perks.js is the engine's own table): a rate as a percent, a count as a count. */
const pc = (v) => Math.round(v * 100);
const PERK_WORDS = Object.freeze({
  cookSpeed: (v) => t('house.perk_cook_speed', { pct: pc(v) }),
  noBurn: (v) => t('house.perk_no_burn', { pct: pc(v) }),
  smithSpeed: (v) => t('house.perk_smith_speed', { pct: pc(v) }),
  craftSpeed: (v) => t('house.perk_craft_speed', { pct: pc(v) }),
  craftSave: (v) => t('house.perk_craft_save', { pct: pc(v) }),
  flameSpeed: (v) => t('house.perk_flame_speed', { pct: pc(v) }),
  runeSpeed: (v) => t('house.perk_rune_speed', { pct: pc(v) }),
  buffDuration: (v) => t('house.perk_buff_duration', { pct: pc(v) }),
  farmPlots: (v) => t('house.perk_farm_plots', { count: v }),
  trophyMounts: (v) => t('house.perk_trophy_mounts', { count: v }),
});
function perkText(room, level) {
  const m = (ROOM_PERKS[room] || [])[level - 1];
  const parts = m ? Object.entries(m).filter(([k, v]) => PERK_WORDS[k] && v > 0).map(([k, v]) => PERK_WORDS[k](v)) : [];
  return parts.length ? parts.join(', ') : '';
}
const roomDoesSomething = (room) => (ROOM_PERKS[room] || []).some((m) => Object.values(m || {}).some((v) => v > 0));
const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* Where a material is, in words: '12 in your bag + 30 in Storage'. `storage` null = the server did not say. */
function heldWords(inBag, storage) {
  const s = storage || 0;
  if (!inBag && !s) return storage === null ? t('house.held_none') : t('house.held_none_anywhere');
  if (!s) return t('house.held_bag', { count: whole(inBag) });
  if (!inBag) return t('house.held_storage', { count: whole(s) });
  return t('house.held_both', { bag: whole(inBag), storage: whole(s) });
}

/* A step's cost against the building hero's bag and the account's Storage, which the server takes in that order
   ('Oak Log 40 (12 in your bag + 30 in Storage)'): [{ key, label, where, places, short }] (`where`: a short material's source, `places` the same piece by piece for its links) and whether all of it is there. A count
   the server did not send is not invented: no bag means every line is short; no Storage means the bag alone. */
export function costLines(step, purse, bag, bank) {
  const held = new Map((bag || []).map((r) => [r.id, r.qty]));
  const stored = bank ? new Map(bank.map((r) => [r.id, r.qty])) : null;
  const lines = [{ key: 'gold', label: purse !== null && purse < step.gold ? t('house.cost_gold_short', { price: gold(step.gold), purse: whole(purse) }) : gold(step.gold),
    short: purse === null || purse < step.gold }];
  for (const it of step.items) {
    const inBag = bag ? held.get(it.id) || 0 : null;
    const inStorage = stored ? stored.get(it.id) || 0 : null;
    const short = inBag === null || inBag + (inStorage || 0) < it.qty;
    /* A short material says where it comes from, here, where the player is looking for it (a creature that needs a bigger pull too),
       each place a link to its window (Tyler 2026-11-08). */
    const places = short ? wherePlaces(it.id) : [];
    lines.push({ key: it.id, label: inBag === null ? t('house.cost_item', { item: itemName(it.id), qty: whole(it.qty) })
      : t('house.cost_item_held', { item: itemName(it.id), qty: whole(it.qty), held: heldWords(inBag, inStorage) }), where: places.map((p) => p.words).join('. '), places, short });
  }
  return { lines, afford: !lines.some((l) => l.short) };
}

const COST_HTML = () => '<ul class="hw-mats" aria-label="' + esc(t('house.cost_aria')) + '"></ul>';
function patchCost(ctx, ul, step, purse, bag, bank) {
  const c = step ? costLines(step, purse, bag, bank) : { lines: [], afford: false };
  rows(ul, c.lines, {
    key: (l) => l.key,
    build: () => element(ctx.doc, '<li class="hw-mat"><span></span> <small class="hw-mat-where"></small></li>'),
    patch: (li, l) => { text(li.querySelector('span'), l.label); patchParts(li.querySelector('small'), placesParts(l.places || [])); cls(li, 'is-short', l.short); },
  });
  return c.afford;
}

/** The skeleton (built once per opening). */
export function renderHouse() {
  return '<div class="hw-house">'
    + '<header class="hw-house-head"><b class="hw-house-name"></b><small class="hw-house-note"></small></header>'
    + '<h3 class="hs-sub">' + esc(t('house.deed_head')) + '</h3><ol class="hw-ledger hw-deed" aria-label="' + esc(t('house.deed_aria')) + '"></ol>'
    + '<h3 class="hs-sub">' + esc(t('house.rooms_head')) + '</h3><ul class="hw-ledger hw-rooms" aria-label="' + esc(t('house.rooms_head')) + '"></ul>'
    + '<h3 class="hs-sub">' + esc(t('house.chests_head')) + ' <small class="hw-chest-n"></small></h3><ul class="hw-ledger hw-chests" aria-label="' + esc(t('house.chests_head')) + '"></ul>'
    + '<div class="hw-house-foot"><div class="hw-confirm" role="alertdialog" aria-label="' + esc(t('house.confirm_aria')) + '"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="house-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="house-no">' + esc(t('controls.cancel')) + '</button></div></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>';
}

const LINE = (extra) => '<li class="hw-line hw-estate"><span class="hw-estate-n"></span><span class="hw-line-name"><b></b><small></small>'
  + COST_HTML() + '</span>' + extra + '</li>';
const ASK_BTN = '<button type="button" class="hh-tool" data-hs-act="house-ask"></button>';

/* One ask button: on when the step is priced, its gate is met, the purse and bag hold it, and nothing is in flight. */
function patchAsk(btn, kind, id, label, on) {
  attr(btn, 'data-kind', kind);
  attr(btn, 'data-id', id || '');
  text(btn, label);
  cls(btn, 'is-on', !!id);
  prop(btn, 'disabled', !on);
}

renderHouse.patch = function patchHouse(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-house');
  const home = homeOf(cs), chests = chestsOf(cs);
  const purse = goldOf(cs), bag = bagOf(cs), bank = bankOf(cs);
  const tierName = (n) => (n === 0 ? PROPERTY_TIERS[0].name : ((home && home.tiers.find((x) => x.tier === n)) || {}).name || t('house.tier_n', { n }));
  /* THE HEAD */
  text(root.querySelector('.hw-house-name'), home ? tierName(home.tier) : t('house.your_house'));
  const who = nameOf(cs);
  text(root.querySelector('.hw-house-note'), !home ? t('house.loading') : who ? t('house.head_note_named', { name: who }) : t('house.head_note'));
  /* THE DEED */
  const next = home ? home.tiers.find((x) => !x.owned) : null;
  rows(root.querySelector('.hw-deed'), home ? home.tiers : [], {
    key: (tier) => tier.offer,
    build: () => element(ctx.doc, LINE(ASK_BTN)),
    patch: (li, tier) => {
      const isNext = next === tier;
      text(li.querySelector('.hw-estate-n'), ROMAN[tier.tier] || String(tier.tier));
      text(li.querySelector('b'), tier.name);
      const opens = home.rooms.filter((r) => r.opens === tier.tier).map((r) => t('house.deed_opens_room', { room: r.name }));
      text(li.querySelector('small'), tier.owned ? (tier.tier === home.tier ? t('house.deed_yours_home') : t('house.deed_yours'))
        : isNext ? (opens.length ? t('house.deed_opens', { rooms: opens.join(', ') }) : t('house.deed_next_home')) : t('house.deed_after', { tier: tierName(tier.tier - 1) }));
      const afford = patchCost(ctx, li.querySelector('.hw-mats'), isNext ? tier : null, purse, bag, bank);
      patchAsk(li.querySelector('[data-hs-act="house-ask"]'), 'home', isNext ? tier.offer : null, t('controls.buy'), isNext && afford && !sc.pending);
      cls(li, 'is-held', tier.owned);
      cls(li, 'is-next', isNext);
    },
  });
  /* ROOMS */
  rows(root.querySelector('.hw-rooms'), home ? home.rooms : [], {
    key: (r) => r.room,
    build: () => element(ctx.doc, LINE(ASK_BTN)),
    patch: (li, r) => {
      const open = r.opens <= home.tier;
      const useful = roomDoesSomething(r.room);
      const now = r.level ? t('house.rung_named', { rung: r.rungName || t('house.rung_first', { level: r.level }), level: r.level, rungs: r.rungs }) : t('house.room_not_built');
      const does = r.level ? perkText(r.room, r.level) : '';
      const n = r.next;
      const gated = n && n.need > home.tier;
      const nextName = n ? n.name || t('house.rung_next', { rung: n.rung }) : '';
      const line = !open ? t('house.room_opens_with', { tier: tierName(r.opens) })
        : !useful ? (r.level ? t('house.room_nothing_built', { now }) : t('house.room_nothing'))
          : !n ? (does ? t('house.room_finished_does', { now, does }) : t('house.room_finished', { now }))
            : gated ? (does ? t('house.room_next_after_does', { now, does, next: nextName, tier: tierName(n.need) }) : t('house.room_next_after', { now, next: nextName, tier: tierName(n.need) }))
              : does ? t('house.room_next_does', { now, does, next: nextName, nextDoes: perkText(r.room, n.rung) })
                : t('house.room_next', { now, next: nextName, nextDoes: perkText(r.room, n.rung) });
      text(li.querySelector('.hw-estate-n'), '');
      text(li.querySelector('b'), r.name);
      text(li.querySelector('small'), capital(line));
      const buyable = open && useful && n && !gated;
      const afford = patchCost(ctx, li.querySelector('.hw-mats'), buyable ? n : null, purse, bag, bank);
      patchAsk(li.querySelector('[data-hs-act="house-ask"]'), 'home', buyable ? n.offer : null, r.level ? t('house.upgrade') : t('house.build'), buyable && afford && !sc.pending);
      cls(li, 'is-locked', !open);
    },
  });
  /* STORAGE CHESTS */
  text(root.querySelector('.hw-chest-n'), chests ? t('house.chests_used', { used: whole(chests.used), cap: whole(chests.cap) }) : '');
  rows(root.querySelector('.hw-chests'), chests ? chests.chests : [], {
    key: (c) => c.chest,
    build: () => element(ctx.doc, LINE(ASK_BTN)),
    patch: (li, c) => {
      const isNext = !!(chests.next && chests.next.chest === c.chest);
      const can = isNext && chests.next.canBuild;
      text(li.querySelector('.hw-estate-n'), '');
      text(li.querySelector('b'), c.name);
      const prev = chests.chests[chests.chests.indexOf(c) - 1];
      text(li.querySelector('small'), t('house.chest_stacks', { stacks: whole(c.stacks) }) + ' ' + (c.built ? t('house.chest_built')
        : isNext ? (can ? t('house.chest_next') : t('house.chest_needs', { tier: tierName(c.tier) })) : prev ? t('house.chest_after', { name: prev.name }) : t('house.chest_after_first')));
      const afford = patchCost(ctx, li.querySelector('.hw-mats'), can ? c : null, purse, bag, bank);
      patchAsk(li.querySelector('[data-hs-act="house-ask"]'), 'chest', can ? c.chest : null, t('house.build'), can && afford && !sc.pending);
      cls(li, 'is-held', c.built);
    },
  });
  /* THE CONFIRMATION: the full price, and who pays it. */
  const step = sc.ask ? stepOf(home, chests, sc.ask) : null;
  if (sc.ask && !step) sc.ask = null;
  const cf = root.querySelector('.hw-confirm');
  cls(cf, 'is-on', !!step);
  const yes = cf.querySelector('[data-hs-act="house-yes"]');
  cls(yes, 'is-on', !!step);
  if (step) {
    text(cf.querySelector('.hw-confirm-q'), t(sc.ask.kind === 'chest' ? 'house.confirm_build' : 'house.confirm_buy', { name: step.label }));
    /* The gold is the ACCOUNT's (one purse, 2026-12-15-account-gold.sql); each material leaves this hero's bag first,
       then the account's Storage (2027-01-10-house-from-storage.sql). */
    const mats = step.items.map((it) => t('house.mat_qty', { qty: whole(it.qty), item: itemName(it.id) })).join(', ');
    text(cf.querySelector('.hw-confirm-note'), !mats ? t('house.confirm_cost', { price: gold(step.gold) })
      : who ? t('house.confirm_cost_mats_named', { price: gold(step.gold), mats, name: who }) : t('house.confirm_cost_mats', { price: gold(step.gold), mats }));
    text(yes, t('house.pay', { price: gold(step.gold) }));
  }
  prop(yes, 'disabled', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

/* The step an ask names, re-read from the CURRENT sections (a quote never outlives the envelope it came from). */
function stepOf(home, chests, ask) {
  if (ask.kind === 'chest') {
    const c = chests && chests.next && chests.next.chest === ask.id && chests.next.canBuild ? chests.next : null;
    return c ? { label: c.name, gold: c.gold, items: c.items } : null;
  }
  if (!home) return null;
  const tier = home.tiers.find((x) => x.offer === ask.id && !x.owned);
  if (tier) return { label: tier.name, gold: tier.gold, items: tier.items };
  const r = home.rooms.find((x) => x.next && x.next.offer === ask.id);
  return r ? { label: t('house.step_room', { room: r.name, rung: r.next.name || t('house.rung_next', { rung: r.next.rung }) }), gold: r.next.gold, items: r.next.items } : null;
}

renderHouse.act = function actHouse(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHouse.patch(body, ctx);
  if (action === 'house-ask') {
    const kind = el.getAttribute('data-kind'), id = el.getAttribute('data-id');
    if (id && (kind === 'home' || kind === 'chest')) { sc.ask = { kind, id }; sc.msg = ''; repaint(); }
    return true;
  }
  if (action === 'house-no') { sc.ask = null; repaint(); return true; }
  if (action === 'house-yes' && sc.ask) {
    const ask = sc.ask;
    const step = stepOf(homeOf(cs), chestsOf(cs), ask);
    sc.ask = null;
    if (!step) { repaint(); return true; }
    if (ask.kind === 'chest') runIntent(sc, repaint, () => buildChest(ctx.account, cs, ask.id, step.gold), t('house.building'), () => t('house.built', { name: step.label }));
    else runIntent(sc, repaint, () => buyHome(ctx.account, cs, ask.id), t('house.buying'), () => t('house.bought', { name: step.label }));
    return true;
  }
  return false;
};
