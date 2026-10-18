// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/gear.js — THE GEAR: A PAPER DOLL (WORLD_SHELL §4, ART_DIRECTION §8, §12).
//
// The hero's own world sprite at the one pixel density (×2) on a plinth, the
// worn slots around it in body order (the left column head to legs, the right
// ears to feet, the hands and rings below), each framed in its piece's rarity.
// Under the doll: the hunt ROLE the worn weapon gives (the server's, Tyler
// 10-16: the role comes from the equipped weapon, never the outfit) and the
// set's stat totals from the catalogue rows of what the server says is worn.
//
// A slot press opens its line: what is worn there (Take off) and every bag
// stack that fits it with the change against the worn piece, best first
// (Wear). A bag stack dragged onto a slot wears it. Each is ONE `equip` intent;
// the doll changes only when the re-read envelope replaces `equipment`.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../data/items.js?v=0.1.0';
import { EQUIP_SLOT_META, expandItemSlot } from '../../data/gathering.js?v=0.1.0';
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.1.0';
import { atlasPaths } from '../../data/world/art-budget.js?v=0.1.0';
import { equipmentOf, bagOf, skillsOf, roleOf, shopOf } from '../../session/item-sections.js?v=0.1.0';
import { partyOf } from '../../session/hunt-sections.js?v=0.1.0';
import { rows, text, cls, attr, prop, style, element } from '../../render/paint.js?v=0.1.0';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.1.0';
import { glyphSvg } from '../launcher.js?v=0.1.0';
import { itemIconHtml, itemName } from '../widgets/bits.js?v=0.1.0';
import { compare, rarityOf } from '../bag-model.js?v=0.1.0';
import { runIntent } from '../intent-words.js?v=0.1.0';
import { showTip, hideTip } from './item-tip.js?v=0.1.0';
import { needOf } from '../item-lore.js?v=0.1.0';
import { DRAG_TYPE } from './bag-act.js?v=0.1.0';

/* Body order: [slot, label, empty glyph, grid cell]. */
const DOLL = Object.freeze([
  ['helmet', 'Helmet', 'uiHelm', 'l1'], ['necklace', 'Amulet', 'uiAmulet', 'l2'], ['body', 'Body', 'uiBody', 'l3'], ['pants', 'Legs', 'uiLegs', 'l4'],
  ['earrings', 'Earrings', 'uiGem', 'r1'], ['cape', 'Cape', 'uiCape', 'r2'], ['gloves', 'Gloves', 'uiGloves', 'r3'], ['boots', 'Boots', 'uiBoots', 'r4'],
  ['weapon', 'Weapon', 'uiSword', 'b1'], ['shield', 'Offhand', 'uiShield', 'b2'], ['ammo', 'Ammo', 'uiArrow', 'b3'], ['belt', 'Belt', 'uiBar', 'b4'],
  ['ring1', 'Ring', 'uiRing', 'b5'], ['ring2', 'Ring', 'uiRing', 'b6'], ['companion', 'Companion', 'uiPaw', 'b7'],
]);
const SLOT_LABEL = new Map(DOLL.map(([s, l]) => [s, l]));
const TOTALS = Object.freeze([['atkB', 'Attack'], ['strB', 'Strength'], ['defB', 'Defense'], ['rangeAtkB', 'Ranged'], ['magicAtkB', 'Magic']]);
const SCRATCH = new WeakMap();
const DENSITY = 2;

let HERO = null;   // { image, size, frames, fps } once the manifest has loaded
let heroLoading = null;
function loadHero(doc) {
  if (HERO || heroLoading || !doc || !doc.baseURI) return;
  const p = atlasPaths('hero');
  /* The build's cache-buster is this module's own ?v= (bump-version.sh keeps every one equal). */
  const v = new URL(import.meta.url).searchParams.get('v') || '';
  const url = (path) => new URL(path + '?v=' + v, doc.baseURI).href;
  heroLoading = import(url(p.manifest), { with: { type: 'json' } }).then((mod) => {
    const m = mod.default, idle = m.sprites.hero.anims.idle;
    HERO = { image: url('assets/world/' + m.image), size: m.size, frames: idle.dirs.s, fps: idle.fps, frame: m.sprites.hero.frame };
  }).catch(() => { /* the doll keeps its empty plinth */ });
}

const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { open: null, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/** The skeleton (built once per opening). */
export function renderGear(ctx) {
  loadHero(ctx.doc);
  const g = ctx.glyphs;
  const slot = ([id, label, glyph, at]) => '<button type="button" class="hw-slot at-' + at + '" data-hs-act="slot" data-slot="' + id + '" aria-label="' + esc(label) + '">'
    + '<span class="hw-ico"></span><span class="hw-ghost">' + glyphSvg(g, glyph) + '</span><small class="hw-slot-label">' + esc(label) + '</small></button>';
  return '<div class="hw-gear">'
    + '<div class="hw-doll">' + DOLL.map(slot).join('') + '<div class="hw-plinth"><span class="hw-hero"></span></div></div>'
    + '<p class="hw-role"></p>'
    + '<dl class="hw-totals">' + TOTALS.map(([k, l]) => '<div><dt>' + esc(l) + '</dt><dd data-total="' + k + '"></dd></div>').join('') + '</dl>'
    + '<div class="hw-slotline"><h3 class="hw-slothead"></h3>'
    + '<div class="hw-worn"><span class="hw-ico"></span><span class="hw-worn-name"></span><button type="button" class="hh-tool" data-hs-act="unequip">Take off</button></div>'
    + '<ul class="hw-fits"></ul><p class="hh-empty hw-nofit">Nothing in your bag fits here.</p></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '</div>';
}

/** The role words: the server's role for the worn weapon, or the party's reading of it. */
function roleWords(cs, eq) {
  const r = roleOf(cs);
  let id = r ? r.id : null;
  if (!id) {
    const p = partyOf(cs);
    const me = p && p.members.find((m) => m.unit === p.self);
    id = me ? me.role : null;
  }
  const w = eq.weapon ? itemName(eq.weapon) : null;
  if (id && HUNT_ROLES[id]) return 'Role: ' + HUNT_ROLES[id].label + (w ? ' · from your ' + w : '');
  return w ? 'Role: the server has not named a role for your ' + w + ' yet' : 'No weapon worn: wear one to take a hunt role';
}

/* Bag stacks that fit an equip slot, best first by the change against what is worn. */
function fitsFor(slot, bag, eq) {
  return bag.filter((r) => ITEMS[r.id] && ITEMS[r.id].slot && expandItemSlot(ITEMS[r.id].slot).includes(slot))
    .map((r) => ({ id: r.id, qty: r.qty, delta: compare(r.id, eq[slot] || null) }))
    .sort((a, b) => b.delta.reduce((s, d) => s + d.delta, 0) - a.delta.reduce((s, d) => s + d.delta, 0));
}

renderGear.patch = function patchGear(body, ctx) {
  const cs = ctx.character;
  const eq = equipmentOf(cs) || {};
  const bag = bagOf(cs) || [];
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-gear');
  for (const b of root.querySelectorAll('.hw-slot')) {
    const s = b.getAttribute('data-slot');
    const id = eq[s] || '';
    if (b.getAttribute('data-item') !== id) {
      attr(b, 'data-item', id);
      b.querySelector('.hw-ico').innerHTML = id ? itemIconHtml(ctx.glyphs, id) : '';
      for (const c of Array.from(b.classList)) if (c.startsWith('rar-')) b.classList.remove(c);
      if (id && rarityOf(id)) b.classList.add('rar-' + rarityOf(id));
    }
    cls(b, 'is-empty', !id);
    cls(b, 'is-open', sc.open === s);
    attr(b, 'aria-label', SLOT_LABEL.get(s) + ': ' + (id ? itemName(id) : 'empty'));
  }
  /* The hero on the plinth: the idle south clip at the one density. */
  const hero = root.querySelector('.hw-hero');
  if (HERO) {
    const f = HERO.frames[Math.floor(ctx.now() / (1000 / HERO.fps)) % HERO.frames.length];
    style(hero, 'background-image', 'url("' + HERO.image + '")');
    style(hero, 'background-size', (HERO.size[0] * DENSITY) + 'px ' + (HERO.size[1] * DENSITY) + 'px');
    style(hero, 'width', (HERO.frame[0] * DENSITY) + 'px');
    style(hero, 'height', (HERO.frame[1] * DENSITY) + 'px');
    style(hero, 'background-position', (-f[0] * DENSITY) + 'px ' + (-f[1] * DENSITY) + 'px');
  }
  text(root.querySelector('.hw-role'), roleWords(cs, eq));
  for (const [k] of TOTALS) {
    const v = Object.values(eq).reduce((s, id) => s + (ITEMS[id] && Number.isFinite(ITEMS[id][k]) ? ITEMS[id][k] : 0), 0);
    text(root.querySelector('[data-total="' + k + '"]'), v > 0 ? '+' + v : '0');
  }
  /* The open slot's line: what is worn, and what in the bag fits. */
  const line = root.querySelector('.hw-slotline');
  cls(line, 'is-on', !!sc.open);
  if (sc.open) {
    const worn = eq[sc.open] || null;
    text(line.querySelector('.hw-slothead'), (SLOT_LABEL.get(sc.open) || EQUIP_SLOT_META[sc.open] && EQUIP_SLOT_META[sc.open].label || sc.open));
    const wr = line.querySelector('.hw-worn');
    cls(wr, 'is-on', !!worn);
    if (wr.getAttribute('data-item') !== (worn || '')) { attr(wr, 'data-item', worn || ''); wr.querySelector('.hw-ico').innerHTML = worn ? itemIconHtml(ctx.glyphs, worn) : ''; }
    text(wr.querySelector('.hw-worn-name'), worn ? itemName(worn) : '');
    prop(wr.querySelector('button'), 'disabled', sc.pending || !worn);
    const fits = fitsFor(sc.open, bag, eq);
    const skills = skillsOf(cs);
    rows(line.querySelector('.hw-fits'), fits, {
      key: (f) => f.id,
      build: (f) => element(ctx.doc, '<li class="hw-fit" data-hs-act="fit-row" data-item="' + esc(f.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, f.id) + '</span>'
        + '<span class="hw-fit-name"><b>' + esc(itemName(f.id)) + '</b><small class="hw-fit-delta"></small><small class="hw-fit-need"></small></span>'
        + '<button type="button" class="hh-tool" data-hs-act="wear" data-item="' + esc(f.id) + '">Wear</button></li>'),
      patch: (li, f) => {
        const dl = li.querySelector('.hw-fit-delta');
        const sig = f.delta.map((d) => d.text + d.label).join('|');
        if (dl.getAttribute('data-sig') !== sig) {
          attr(dl, 'data-sig', sig);
          dl.innerHTML = f.delta.length ? f.delta.map((d) => '<span class="' + (d.delta > 0 ? 'is-gain' : 'is-loss') + '">' + esc(d.text + ' ' + d.label) + '</span>').join(', ') : 'No change';
        }
        const need = needOf(f.id, skills);
        text(li.querySelector('.hw-fit-need'), need && need.short ? need.text : '');
        prop(li.querySelector('button'), 'disabled', sc.pending);
      },
    });
    cls(line.querySelector('.hw-nofit'), 'is-on', !fits.length);
  }
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderGear.events = Object.freeze(['dragover', 'dragleave', 'drop', 'mouseover', 'mouseout']);

function wear(ctx, body, slot, id) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  return runIntent(sc, () => renderGear.patch(body, ctx), () => cs.edgeIntent('equip', { equip: { [slot]: id } }), id ? 'Equipping…' : 'Taking it off…');
}

renderGear.act = function actGear(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const eq = equipmentOf(cs) || {};
  if (ev.type === 'mouseover' && (action === 'slot' || action === 'fit-row')) {
    const id = t.getAttribute('data-item');
    if (!id) return false;
    const slot = action === 'slot' ? t.getAttribute('data-slot') : sc.open;
    const shop = shopOf(cs);
    showTip(ctx.doc, t, id, { worn: action === 'slot' ? id : (eq[slot] || null), skills: skillsOf(cs), bid: shop ? (shop.bids.has(id) ? shop.bids.get(id) : null) : undefined });
    return false;
  }
  if (ev.type === 'mouseout') { if (!t.contains(ev.relatedTarget)) hideTip(ctx.doc); return false; }
  /* A bag stack dragged onto a slot it fits is worn there. */
  if (action === 'slot' && (ev.type === 'dragover' || ev.type === 'drop' || ev.type === 'dragleave')) {
    const types = Array.from((ev.dataTransfer && ev.dataTransfer.types) || []);
    if (!types.includes(DRAG_TYPE)) return false;
    if (ev.type === 'dragleave') { cls(t, 'is-drop', false); return false; }
    ev.preventDefault();
    cls(t, 'is-drop', ev.type === 'dragover');
    if (ev.type === 'drop') {
      const id = ev.dataTransfer.getData(DRAG_TYPE);
      const slot = t.getAttribute('data-slot');
      if (ITEMS[id] && ITEMS[id].slot && expandItemSlot(ITEMS[id].slot).includes(slot)) wear(ctx, body, slot, id);
      else { sc.msg = itemName(id) + ' does not go in that slot.'; renderGear.patch(body, ctx); }
    }
    return true;
  }
  if (ev.type !== 'click') return false;
  if (action === 'slot') { const s = t.getAttribute('data-slot'); sc.open = sc.open === s ? null : s; sc.msg = ''; renderGear.patch(body, ctx); return true; }
  if (action === 'wear' && sc.open) { wear(ctx, body, sc.open, t.getAttribute('data-item')); return true; }
  if (action === 'unequip' && sc.open && eq[sc.open]) { wear(ctx, body, sc.open, null); return true; }
  return false;
};
