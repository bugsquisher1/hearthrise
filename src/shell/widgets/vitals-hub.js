// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/vitals-hub.js — THE VITALS HUB AT THE CENTRE OF THE ACTION BAR.
//
// Ported from the hunt sim's emblem (prototypes/hunt-sim/ui.js `emblem`, our own
// design; function and layout, never its code), in style-1 tokens:
//   medallion  a pixel-art iron medallion (assets/ui/bar-medal.png, drawn by
//              tools/make-hud-bar-art.mjs): "Lv", the level, "XP n%"; the XP arc
//              gilds its iron rim as the level fills
//   arcs       HP as a red arc on its left, mana as a blue arc on its right,
//              both filling from the bottom, inside the art's gauge channel
//   readouts   "HP 180/220" and its regen a second on the left, "MP 40/60" and
//              its regen on the right
//   stamina    the time left under the medallion, with an hourglass
//   sockets    Food (how many the bag holds, the best one's icon) and Charm
// EVERY hero has mana (ruling: 100 + 10 a level for everyone): the mana arc
// and readout always show, carrying whatever the server sends. Every number
// is the server's (CLAUDE.md §6): Level, XP, HP and mana from character-sections.js
// heroVitalsOf, the ONE reader the Character tab shares (r09: the two said Level 4
// and 11), stamina from staminaOf, regen from the hunt section. Built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { CONSUMABLES } from '../../data/consumables.js?v=0.2.30';
import { heroVitalsOf } from '../../session/character-sections.js?v=0.2.30';
import { huntOf, huntBagOf, staminaOf } from '../../session/hunt-sections.js?v=0.2.30';
import { carriedOf } from '../../session/item-sections.js?v=0.2.30';
import { text, attr } from '../../render/paint.js?v=0.2.30';
import { whole, hoursMinutes } from '../../render/format.js?v=0.2.30';
import { glyphSvg } from '../launcher.js?v=0.2.30';
import { itemIconHtml, itemName } from './bits.js?v=0.2.30';

/* The arcs on the medallion art's own 52 x 52 grid (bar-medal.png), centre (26, 26): HP and mana at radius 21 in
   the gauge channel (r 19.4-22.6), the left one from the bottom (111.6 deg) round to the top (248.4 deg), the
   right one the mirror; the XP ring at radius 15.4 on the rim (r 14.4-16.4). */
const ARC_LEFT = 'M18.28 45.53 A21 21 0 0 1 18.28 6.47';
const ARC_RIGHT = 'M33.72 45.53 A21 21 0 0 0 33.72 6.47';
const XP_RING = 'M26 10.6 A15.4 15.4 0 1 1 25.99 10.6';

const ok = (v) => Number.isFinite(v);
const share = (cur, max) => (ok(cur) && ok(max) && max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0);

/** The hub's skeleton (built once, inside the bar). */
export function hubHtml(glyphs) {
  const arc = (d, k) => '<path class="hb-arc is-' + k + '" d="' + d + '" pathLength="100" stroke-dasharray="0 100"/>';
  return '<div class="hb-hub">'
    + '<div class="hb-read is-hp" title="Health"><span class="hb-read-k">HP</span><b class="hb-read-v" data-v="hp"></b><small class="hb-read-r" data-r="hp" title="Health regained each second"></small></div>'
    + '<div class="hb-medal" role="group" aria-label="Level and experience">'
    + '<svg class="hb-arcs" viewBox="0 0 52 52" shape-rendering="crispEdges" aria-hidden="true">' + arc(ARC_LEFT, 'hp') + arc(ARC_RIGHT, 'mana') + arc(XP_RING, 'xp') + '</svg>'
    + '<span class="hb-medal-in"><small>Lv</small><b class="hb-lv"></b><small class="hb-xp"></small></span></div>'
    + '<div class="hb-read is-mana" title="Mana"><span class="hb-read-k">MP</span><b class="hb-read-v" data-v="mana"></b><small class="hb-read-r" data-r="mana" title="Mana regained each second"></small></div>'
    + '<div class="hb-stam" title="Stamina: hunting time left">' + glyphSvg(glyphs, 'uiHourglass') + '<b class="hb-stam-v"></b></div>'
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
  text(el.querySelector('.hb-xp'), xp === null ? '' : 'XP ' + Math.floor(Math.max(0, Math.min(1, xp)) * 100) + '%');
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
