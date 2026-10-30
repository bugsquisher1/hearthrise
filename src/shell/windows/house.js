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
import { homeOf, chestsOf } from '../../session/home-sections.js?v=0.2.73';
import { buyHome, buildChest } from '../../session/home-intents.js?v=0.2.73';
import { bagOf, bankOf, goldOf, nameOf } from '../../session/item-sections.js?v=0.2.73';
import { PROPERTY_TIERS } from '../../data/homestead-tiers.js?v=0.2.73';
import { ROOM_PERKS } from '../../data/perks.js?v=0.2.73';
import { text, cls, prop, attr, rows, element } from '../../render/paint.js?v=0.2.73';
import { whole, gold } from '../../render/format.js?v=0.2.73';
import { itemName } from '../widgets/bits.js?v=0.2.73';
import { runIntent } from '../intent-words.js?v=0.2.73';

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { ask: null, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/* What a room rung does, in words (src/data/perks.js is the engine's own table): a rate as a percent, a count as a count. */
const pc = (v) => Math.round(v * 100);
const PERK_WORDS = Object.freeze({
  cookSpeed: (v) => 'cooking ' + pc(v) + '% faster',
  noBurn: (v) => pc(v) + '% less burnt food',
  smithSpeed: (v) => 'smithing ' + pc(v) + '% faster',
  craftSpeed: (v) => 'crafting ' + pc(v) + '% faster',
  craftSave: (v) => pc(v) + '% chance to save the materials',
  flameSpeed: (v) => 'fueling the Great Hearth ' + pc(v) + '% faster',
  runeSpeed: (v) => 'rune binding ' + pc(v) + '% faster',
  buffDuration: (v) => 'food and drink effects last ' + pc(v) + '% longer',
  farmPlots: (v) => v + ' more farm ' + (v === 1 ? 'bed' : 'beds') + ' on the land your heroes share',
  trophyMounts: (v) => 'a trophy wall with room for ' + v + ' bestiary trophies',
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
  if (!inBag && !s) return storage === null ? 'none in your bag' : 'none in your bag or Storage';
  if (!s) return whole(inBag) + ' in your bag';
  if (!inBag) return whole(s) + ' in Storage';
  return whole(inBag) + ' in your bag + ' + whole(s) + ' in Storage';
}

/* A step's cost against the building hero's bag and the account's Storage, which the server takes in that order
   ('Oak Log 40 (12 in your bag + 30 in Storage)'): [{ key, label, short }] and whether all of it is there. A count
   the server did not send is not invented: no bag means every line is short; no Storage means the bag alone. */
function costLines(step, purse, bag, bank) {
  const held = new Map((bag || []).map((r) => [r.id, r.qty]));
  const stored = bank ? new Map(bank.map((r) => [r.id, r.qty])) : null;
  const lines = [{ key: 'gold', label: gold(step.gold) + (purse !== null && purse < step.gold ? ' (you have ' + whole(purse) + ')' : ''), short: purse === null || purse < step.gold }];
  for (const it of step.items) {
    const inBag = bag ? held.get(it.id) || 0 : null;
    const inStorage = stored ? stored.get(it.id) || 0 : null;
    lines.push({ key: it.id, label: itemName(it.id) + ' ' + whole(it.qty) + (inBag === null ? '' : ' (' + heldWords(inBag, inStorage) + ')'),
      short: inBag === null || inBag + (inStorage || 0) < it.qty });
  }
  return { lines, afford: !lines.some((l) => l.short) };
}

const COST_HTML = '<ul class="hw-mats" aria-label="Cost"></ul>';
function patchCost(ctx, ul, step, purse, bag, bank) {
  const c = step ? costLines(step, purse, bag, bank) : { lines: [], afford: false };
  rows(ul, c.lines, {
    key: (l) => l.key,
    build: () => element(ctx.doc, '<li class="hw-mat"></li>'),
    patch: (li, l) => { text(li, l.label); cls(li, 'is-short', l.short); },
  });
  return c.afford;
}

/** The skeleton (built once per opening). */
export function renderHouse() {
  return '<div class="hw-house">'
    + '<header class="hw-house-head"><b class="hw-house-name"></b><small class="hw-house-note"></small></header>'
    + '<h3 class="hs-sub">The deed</h3><ol class="hw-ledger hw-deed" aria-label="The property"></ol>'
    + '<h3 class="hs-sub">Rooms</h3><ul class="hw-ledger hw-rooms" aria-label="Rooms"></ul>'
    + '<h3 class="hs-sub">Storage chests <small class="hw-chest-n"></small></h3><ul class="hw-ledger hw-chests" aria-label="Storage chests"></ul>'
    + '<div class="hw-house-foot"><div class="hw-confirm" role="alertdialog" aria-label="Confirm the purchase"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="house-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="house-no">Cancel</button></div></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>';
}

const LINE = (extra) => '<li class="hw-line hw-estate"><span class="hw-estate-n"></span><span class="hw-line-name"><b></b><small></small>'
  + COST_HTML + '</span>' + extra + '</li>';
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
  const tierName = (n) => (n === 0 ? PROPERTY_TIERS[0].name : ((home && home.tiers.find((t) => t.tier === n)) || {}).name || 'tier ' + n);
  /* THE HEAD */
  text(root.querySelector('.hw-house-name'), home ? tierName(home.tier) : 'Your house');
  const who = nameOf(cs);
  text(root.querySelector('.hw-house-note'), !home ? 'Reading your house from the server…'
    : 'One house for all your characters. Gold comes from your shared purse; materials from ' + (who ? who + '\'s' : 'this hero\'s') + ' bag first, then Storage.');
  /* THE DEED */
  const next = home ? home.tiers.find((t) => !t.owned) : null;
  rows(root.querySelector('.hw-deed'), home ? home.tiers : [], {
    key: (t) => t.offer,
    build: () => element(ctx.doc, LINE(ASK_BTN)),
    patch: (li, t) => {
      const isNext = next === t;
      text(li.querySelector('.hw-estate-n'), ROMAN[t.tier] || String(t.tier));
      text(li.querySelector('b'), t.name);
      const opens = home.rooms.filter((r) => r.opens === t.tier).map((r) => r.name);
      text(li.querySelector('small'), t.owned ? 'Yours' + (t.tier === home.tier ? ', your home now' : '')
        : isNext ? (opens.length ? 'Opens the ' + opens.join(', the ') + '.' : 'The next home.') : 'After the ' + tierName(t.tier - 1) + '.');
      const afford = patchCost(ctx, li.querySelector('.hw-mats'), isNext ? t : null, purse, bag, bank);
      patchAsk(li.querySelector('button'), 'home', isNext ? t.offer : null, 'Buy', isNext && afford && !sc.pending);
      cls(li, 'is-held', t.owned);
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
      const now = r.level ? (r.rungName || 'Rung ' + r.level) + ', ' + r.level + ' of ' + r.rungs : 'Not built yet';
      const does = r.level ? perkText(r.room, r.level) : '';
      const n = r.next;
      const gated = n && n.need > home.tier;
      const line = !open ? 'Opens with the ' + tierName(r.opens) + '.'
        : !useful ? (r.level ? now + '. ' : '') + 'Nothing to build here yet.'
          : !n ? now + (does ? ': ' + does : '') + '. Finished.'
            : now + (does ? ': ' + does : '') + '. Next: ' + (n.name || 'rung ' + n.rung) + (gated ? ', after the ' + tierName(n.need) + '.' : ', ' + perkText(r.room, n.rung) + '.');
      text(li.querySelector('.hw-estate-n'), '');
      text(li.querySelector('b'), r.name);
      text(li.querySelector('small'), capital(line));
      const buyable = open && useful && n && !gated;
      const afford = patchCost(ctx, li.querySelector('.hw-mats'), buyable ? n : null, purse, bag, bank);
      patchAsk(li.querySelector('button'), 'home', buyable ? n.offer : null, r.level ? 'Upgrade' : 'Build', buyable && afford && !sc.pending);
      cls(li, 'is-locked', !open);
    },
  });
  /* STORAGE CHESTS */
  text(root.querySelector('.hw-chest-n'), chests ? whole(chests.used) + ' of ' + whole(chests.cap) + ' stacks used' : '');
  rows(root.querySelector('.hw-chests'), chests ? chests.chests : [], {
    key: (c) => c.chest,
    build: () => element(ctx.doc, LINE(ASK_BTN)),
    patch: (li, c) => {
      const isNext = !!(chests.next && chests.next.chest === c.chest);
      const can = isNext && chests.next.canBuild;
      text(li.querySelector('.hw-estate-n'), '');
      text(li.querySelector('b'), c.name);
      const prev = chests.chests[chests.chests.indexOf(c) - 1];
      text(li.querySelector('small'), '+' + whole(c.stacks) + ' stacks. ' + (c.built ? 'Built.'
        : isNext ? (can ? 'Next to build.' : 'Needs the ' + tierName(c.tier) + '.') : 'After the ' + (prev ? prev.name : 'one before') + '.'));
      const afford = patchCost(ctx, li.querySelector('.hw-mats'), can ? c : null, purse, bag, bank);
      patchAsk(li.querySelector('button'), 'chest', can ? c.chest : null, 'Build', can && afford && !sc.pending);
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
    text(cf.querySelector('.hw-confirm-q'), (sc.ask.kind === 'chest' ? 'Build the ' : 'Buy the ') + step.label + '?');
    /* The gold is the ACCOUNT's (one purse, 2026-12-15-account-gold.sql); each material leaves this hero's bag first,
       then the account's Storage (2027-01-10-house-from-storage.sql). */
    const mats = step.items.map((it) => whole(it.qty) + ' ' + itemName(it.id)).join(', ');
    text(cf.querySelector('.hw-confirm-note'), 'Costs ' + gold(step.gold) + ' from your shared purse'
      + (mats ? ', and ' + mats + ' from ' + (who ? who + '\'s' : 'this hero\'s') + ' bag first, then Storage' : '') + '.');
    text(yes, 'Pay ' + gold(step.gold));
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
  const t = home.tiers.find((x) => x.offer === ask.id && !x.owned);
  if (t) return { label: t.name, gold: t.gold, items: t.items };
  const r = home.rooms.find((x) => x.next && x.next.offer === ask.id);
  return r ? { label: r.name + ': ' + (r.next.name || 'rung ' + r.next.rung), gold: r.next.gold, items: r.next.items } : null;
}

renderHouse.act = function actHouse(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHouse.patch(body, ctx);
  if (action === 'house-ask') {
    const kind = t.getAttribute('data-kind'), id = t.getAttribute('data-id');
    if (id && (kind === 'home' || kind === 'chest')) { sc.ask = { kind, id }; sc.msg = ''; repaint(); }
    return true;
  }
  if (action === 'house-no') { sc.ask = null; repaint(); return true; }
  if (action === 'house-yes' && sc.ask) {
    const ask = sc.ask;
    const step = stepOf(homeOf(cs), chestsOf(cs), ask);
    sc.ask = null;
    if (!step) { repaint(); return true; }
    if (ask.kind === 'chest') runIntent(sc, repaint, () => buildChest(ctx.account, cs, ask.id, step.gold), 'Building…', () => 'The ' + step.label + ' is built.');
    else runIntent(sc, repaint, () => buyHome(ctx.account, cs, ask.id), 'Buying…', () => 'The ' + step.label + ' is yours.');
    return true;
  }
  return false;
};
