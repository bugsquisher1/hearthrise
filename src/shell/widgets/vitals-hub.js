// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/vitals-hub.js — THE VITALS HUB AT THE CENTRE OF THE ACTION BAR.
//
// Ported from the hunt sim's emblem (prototypes/hunt-sim/ui.js `emblem`, our own
// design; function and layout, never its code), in style-1 tokens:
//   ring       ONE smooth vector ring (Tyler 10-25: "the circle just needs to be
//              smoothed out", overriding the pixel-only rule for this ring): a
//              steel bezel, the gauge channel, the XP ring, the inner disc with
//              "Lv", the level and "XP n%" inside it; flat token colours, no ticks
//   arcs       HP as a red arc on its left, mana as a blue arc on its right,
//              both filling from the bottom along the channel; the XP ring fills
//              gold clockwise from the top as the level fills
//   readouts   "HP 180/220" and its regen a second on the left, "MP 40/60" and
//              its regen on the right
//   stamina    the time left under the ring, with an hourglass, and the gold "+"
//              that buys a refill (stamina-buy.js)
//   sockets    Food (how many the bag holds, the best one's icon) and Charm
// EVERY hero has mana (ruling: 100 + 10 a level for everyone): the mana arc
// and readout always show, carrying whatever the server sends. Every number
// is the server's (CLAUDE.md §6): Level, XP, HP and mana from character-sections.js
// heroVitalsOf, the ONE reader the Character tab shares (r09: the two said Level 4
// and 11), stamina from staminaOf, regen from the hunt section. Built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { CONSUMABLES } from '../../data/consumables.js?v=0.2.52';
import { heroVitalsOf } from '../../session/character-sections.js?v=0.2.52';
import { huntOf, huntBagOf, staminaOf } from '../../session/hunt-sections.js?v=0.2.52';
import { carriedOf } from '../../session/item-sections.js?v=0.2.52';
import { text, attr } from '../../render/paint.js?v=0.2.52';
import { whole, hoursMinutes } from '../../render/format.js?v=0.2.52';
import { glyphSvg } from '../launcher.js?v=0.2.52';
import { itemIconHtml, itemName } from './bits.js?v=0.2.52';
import { staminaPlusHtml } from './stamina-buy.js?v=0.2.52';

/* THE RING on a 120-unit grid, centre (60, 60), drawn smooth (no crispEdges) at any size the stylesheet gives it.
   From the outside in: the steel bezel (r 59), the gauge channel (r 52, 10 wide) with HP on its left from the bottom
   (104 deg) round to the top (256 deg) and mana the mirror on its right (28 deg gaps top and bottom, no ticks), the
   XP ring (r 43, 5 wide) clockwise from the top, and the inner disc (r 40) the words sit in. hunt.css colours it. */
const ARC_LEFT = 'M47.42 110.46 A52 52 0 0 1 47.42 9.54';
const ARC_RIGHT = 'M72.58 110.46 A52 52 0 0 0 72.58 9.54';
const XP_RING = 'M60 17 A43 43 0 1 1 60 103 A43 43 0 1 1 60 17';

const ok = (v) => Number.isFinite(v);
const share = (cur, max) => (ok(cur) && ok(max) && max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0);

/** The hub's skeleton (built once, inside the bar). */
export function hubHtml(glyphs) {
  const arc = (d, k) => '<path class="hb-arc is-' + k + '" d="' + d + '" pathLength="100" stroke-dasharray="0 100"/>';
  const ring = (k, r) => '<circle class="hb-ring-' + k + '" cx="60" cy="60" r="' + r + '"/>';
  return '<div class="hb-hub">'
    + '<div class="hb-read is-hp" title="Health"><span class="hb-read-k">HP</span><b class="hb-read-v" data-v="hp"></b><small class="hb-read-r" data-r="hp" title="Health regained each second"></small></div>'
    + '<div class="hb-medal" role="group" aria-label="Level and experience" data-coach-hook="level">'
    + '<svg class="hb-arcs" viewBox="0 0 120 120" aria-hidden="true">' + ring('bezel', 59) + ring('channel', 52)
    + '<path class="hb-arc-track" d="' + ARC_LEFT + '"/><path class="hb-arc-track" d="' + ARC_RIGHT + '"/>' + arc(ARC_LEFT, 'hp') + arc(ARC_RIGHT, 'mana')
    + ring('xp', 43) + arc(XP_RING, 'xp') + ring('disc', 40) + '</svg>'
    + '<span class="hb-medal-in"><small class="hb-lv-k">Lv</small><b class="hb-lv"></b><small class="hb-xp"><i class="hb-xp-k">XP </i><span class="hb-xp-v"></span></small></span></div>'
    + '<div class="hb-read is-mana" title="Mana"><span class="hb-read-k">MP</span><b class="hb-read-v" data-v="mana"></b><small class="hb-read-r" data-r="mana" title="Mana regained each second"></small></div>'
    + '<div class="hb-stam" title="Stamina: hunting time left" data-coach-hook="stamina">' + glyphSvg(glyphs, 'uiHourglass') + '<b class="hb-stam-v"></b>' + staminaPlusHtml() + '</div>'
    + '<div class="hb-socket is-food"><span class="hb-socket-ico"></span><small class="hb-socket-k"></small></div>'
    + '<div class="hb-socket is-charm" title="Charm socket: empty"><span class="hb-socket-ico">' + glyphSvg(glyphs, 'uiRing') + '</span><small class="hb-socket-k">Charm</small></div>'
    + '</div>';
}

/* The food the hero carries (an open hunt's hunt bag, else the bag): how many in all, and the stack with the most
   (its icon stands for them). Brannoc 10-22: the bag alone read "Food ×0" mid-hunt, Enter moves the food out of it. */
function foodOf(bag) {
  let n = 0, top = null;
  for (const l of bag || []) {
    const c = CONSUMABLES[l.id];
    if (!c || c.source !== 'own' || c.kind !== 'food') continue;
    n += l.qty;
    if (!top || l.qty > top.qty) top = l;
  }
  return { n, top: top ? top.id : null };
}

function fill(el, f) { attr(el, 'stroke-dasharray', (Math.round(f * 1000) / 10) + ' 100'); }

/** Patch the hub under `el` (the bar widget) from the character's envelope. */
export function patchHub(el, ctx) {
  const cs = ctx.character;
  const h = huntOf(cs);
  const hero = h && !h.ended ? h.hero : null;
  /* heroVitalsOf: hunting, HP is the bar's over the hero's head (the live timeline), never the last
     commit's; out of a hunt, the character's own vitals with mana full (Tyler 10-19). */
  const v = heroVitalsOf(cs);
  const stam = staminaOf(cs);
  const level = v.level;
  const xp = v.xpPct;
  const pair = (cur, max) => (ok(cur) && ok(max) ? whole(cur) + '/' + whole(max) : '–');
  /* Per second, one decimal (huntOf: manaPerS is the server's per-minute mana_regen over 60, hpPerS the engine's in-fight rate). */
  const regen = (r) => (ok(r) && r > 0 ? (r < 0.05 ? '+<0.1' : '+' + r.toFixed(1)) + '/s' : '');
  text(el.querySelector('[data-v="hp"]'), pair(v.hp, v.hpMax));
  text(el.querySelector('[data-v="mana"]'), pair(v.mana, v.manaMax));
  text(el.querySelector('[data-r="hp"]'), hero ? regen(hero.hpPerS) : '');
  text(el.querySelector('[data-r="mana"]'), hero ? regen(hero.manaPerS) : '');
  fill(el.querySelector('.hb-arc.is-hp'), share(v.hp, v.hpMax));
  fill(el.querySelector('.hb-arc.is-mana'), share(v.mana, v.manaMax));
  fill(el.querySelector('.hb-arc.is-xp'), xp === null ? 0 : Math.max(0, Math.min(1, xp)));
  text(el.querySelector('.hb-lv'), level === null ? '–' : String(level));
  text(el.querySelector('.hb-xp-v'), xp === null ? '' : Math.floor(Math.max(0, Math.min(1, xp)) * 100) + '%');
  attr(el.querySelector('.hb-xp'), 'hidden', xp === null ? '' : null);
  attr(el.querySelector('.hb-medal'), 'title', level === null ? 'Level' : 'Level ' + level + (xp === null ? '' : ': ' + Math.floor(Math.max(0, Math.min(1, xp)) * 100) + '% of the way to ' + (level + 1)));
  text(el.querySelector('.hb-stam-v'), hoursMinutes(stam ? stam.msLeft : null));
  const food = foodOf(carriedOf(cs));
  const sock = el.querySelector('.hb-socket.is-food');
  const ico = sock.querySelector('.hb-socket-ico');
  if (ico.getAttribute('data-for') !== String(food.top)) { ico.innerHTML = food.top ? itemIconHtml(ctx.glyphs, food.top) : glyphSvg(ctx.glyphs, 'uiFood'); attr(ico, 'data-for', String(food.top)); }
  text(sock.querySelector('.hb-socket-k'), 'Food ×' + whole(food.n));
  const where = huntBagOf(cs) ? 'the hunt bag' : 'the bag';
  attr(sock, 'title', food.top ? whole(food.n) + ' food in ' + where + ' (most: ' + itemName(food.top) + ')' : 'No food in ' + where + ': a store food on the bar buys as used');
}
