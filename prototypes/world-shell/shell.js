// ════════════════════════════════════════════════════════════════════════
// prototypes/world-shell/shell.js — THE SHELL AROUND THE REAL WORLD.
//
// Prototype only (docs/design/WORLD_SHELL.md). The World is the shipped runtime
// (bootWorld) over a fixture G; the item names, kinds and pixel icons are the
// shipped catalogue (src/data/items.js, src/data/item-art.js). The counts, the
// equipped set, the hero's name, level, gold and vitals are FIXTURES: there is
// no sign-in here and nothing is sent anywhere.
//
// THE WINDOW MANAGER (the part B1 and the cutover inherit):
//   desktop  up to 3 windows; each opens DOCKED at the right edge, right to left
//            in opening order; dragging a title bar floats it; opening a 4th
//            closes the oldest. The World keeps running underneath.
//   phone    ONE full-height side sheet; opening another replaces it.
//   Esc      closes the top window; with none open it opens Settings.
// ════════════════════════════════════════════════════════════════════════
import { bootWorld } from '../../src/world/world-boot.js';
import { MOBILE_QUERY } from '../../src/world/core/camera.js';
import { ITEMS } from '../../src/data/items.js';
import { PIXEL_DIR, fileFor } from '../../src/data/item-art.js';

const ROOT = '';   // the document base is the repo root (index.html <base>)
const Q = new URLSearchParams(location.search);
const GLYPH = window.HR_GLYPHS || {};
const mq = window.matchMedia(MOBILE_QUERY);
const isPhone = () => mq.matches;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const glyph = (k, cls) => (GLYPH[k] ? '<svg class="' + (cls || 'ws-glyph') + '" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path d="' + GLYPH[k] + '"/></svg>' : '');
const num = (n) => Number(n).toLocaleString('en-US');

/* ── Fixtures (labelled as such in the spec) ───────────────────────────── */
const HERO = { name: 'Aldric', level: 34, gold: 12480, hp: 84, hpMax: 120, mp: 31, mpMax: 60 };
const BAG = [
  ['cooked_trout', 12], ['wheat_bread', 4], ['iron_ore', 22], ['copper_ore', 14], ['oak_log', 31], ['normal_log', 8],
  ['iron_bar', 3], ['bronze_bar', 5], ['oak_plank', 12], ['trout', 6], ['shrimp', 9], ['rat_tail', 17],
  ['slime_gel', 11], ['bones', 40], ['big_bones', 3], ['wolf_pelt', 2], ['silk_thread', 7], ['potato_seed', 10],
  ['carrot_seed', 6], ['steel_sword', 1], ['steel_helm', 1], ['ruby', 1], ['bone_key', 1], ['small_fang', 4],
];
const BAG_SLOTS = 40;
const WORN = { helmet: 'iron_helm', necklace: 'wolfbone_torc', body: 'iron_platebody', pants: 'iron_platelegs',
  earrings: null, cape: 'woolen_cloak', gloves: 'iron_gauntlets', boots: 'leather_boots',
  weapon: 'iron_sword', ammo: 'bronze_arrows', belt: 'leather_belt', ring: 'copper_ring' };
/* Body order: the left column reads head to legs, the right column head to feet, the hands below. */
const DOLL = [
  ['helmet', 'Helmet', 'uiHelm', 'l1'], ['necklace', 'Amulet', 'uiAmulet', 'l2'], ['body', 'Body', 'uiBody', 'l3'], ['pants', 'Legs', 'uiLegs', 'l4'],
  ['earrings', 'Earrings', 'uiGem', 'r1'], ['cape', 'Cape', 'uiCape', 'r2'], ['gloves', 'Gloves', 'uiGloves', 'r3'], ['boots', 'Boots', 'uiBoots', 'r4'],
  ['weapon', 'Weapon', 'uiSword', 'b1'], ['ammo', 'Ammo', 'uiArrow', 'b2'], ['belt', 'Belt', 'uiShield', 'b3'], ['ring', 'Ring', 'uiRing', 'b4'],
];
const BAR = ['cooked_trout', 'wheat_bread', null, null, null, null, null, null, null, null];
const LOG = [['hit', 'You hit the Rat for 12.'], ['hurt', 'The Rat bites you for 3.'], ['kill', 'The Rat dies.'], ['loot', 'Loot: Rat Tail, Bones.'], ['hit', 'You hit the Slime for 9.']];

const item = (id) => ITEMS[id] || null;
const nameOf = (id) => (item(id) && item(id).n) || id;
const iconOf = (id) => ROOT + PIXEL_DIR + fileFor(id);
const kindOf = (id) => { const it = item(id) || {}; if (it.slot) return 'gear'; if (/cooked|bread|pie|stew/.test(id)) return 'food'; return 'materials'; };

/* ── The window catalogue: one row per window; the rail is drawn from it. ── */
const WINDOWS = [
  { id: 'bag', label: 'Bag', rail: 'Bag', key: 'b', glyph: 'navInventory', w: 476, render: renderBag, object: 'satchel' },
  { id: 'equip', label: 'Gear', rail: 'Gear', key: 'c', glyph: 'navCharacter', w: 452, render: renderEquip, object: 'doll' },
  { id: 'skills', label: 'Skills', rail: 'Skills', key: 'k', glyph: 'navSkills', w: 420, render: stub('A skill ledger: one ruled line per skill, its level, its next unlock, and the bench or spot that trains it.'), object: 'ledger' },
  { id: 'home', label: 'Homestead', rail: 'Home', key: 'h', glyph: 'navHouse', w: 420, render: stub('The deed and plan of your homestead: rooms, plots and workers, drawn from the cottage map.'), object: 'deed' },
  { id: 'bestiary', label: 'Bestiary', rail: 'Bestiary', key: 'l', glyph: 'uiBook', w: 460, render: stub('An encyclopedia: region chapters, one plate per creature. Returns after the cutover (spec, step 2).'), object: 'book' },
  { id: 'market', label: 'Market', rail: 'Market', key: 'm', glyph: 'navMarket', w: 460, render: stub('A stall ledger of listings. Returns after the cutover (spec, step 4).'), object: 'ledger' },
  { id: 'chat', label: 'Chat', rail: 'Chat', key: 'enter', glyph: 'uiChat', w: 380, render: stub('Realm and clan chat. Returns after the cutover (spec, step 3).'), object: 'plain' },
  { id: 'settings', label: 'Settings', rail: 'Settings', key: 'escape', glyph: 'uiSettings', w: 380, render: stub('Sound, scale, account, sign out.'), object: 'plain', foot: true },
];
const BY_ID = Object.fromEntries(WINDOWS.map((w) => [w.id, w]));
const keyLabel = (k) => (k === 'escape' ? 'Esc' : k === 'enter' ? 'Enter' : k.toUpperCase());

const panel = document.getElementById('panel-world');
const layer = panel.querySelector('[data-layer]');
const hud = panel.querySelector('[data-hud]');
const open = [];            // ids, oldest first
const floating = {};        // id -> {x, y} once dragged
const state = { bagSel: null, bagTab: 'all', skillFocus: null, room: null };

/* ── Strip and rail ─────────────────────────────────────────────────────── */
document.querySelector('[data-strip="name"]').textContent = HERO.name;
document.querySelector('[data-strip="level"]').textContent = 'Level ' + HERO.level;
document.querySelector('[data-strip="gold"]').innerHTML = glyph('gold', 'ws-glyph is-gold') + '<span>' + num(HERO.gold) + '</span><span class="ws-sr"> gold</span>';

function drawRail() {
  const btn = (w) => '<button type="button" class="ws-rail-btn" data-open="' + w.id + '" aria-pressed="false" title="' + esc(w.label) + ' (' + keyLabel(w.key) + ')">'
    + glyph(w.glyph) + '<span class="ws-rail-label">' + esc(w.rail) + '</span></button>';
  document.querySelector('[data-rail="main"]').innerHTML = WINDOWS.filter((w) => !w.foot).map(btn).join('');
  document.querySelector('[data-rail="foot"]').innerHTML = WINDOWS.filter((w) => w.foot).map(btn).join('');
}

/* ── Windows ────────────────────────────────────────────────────────────── */
function toggle(id, opts) {
  if (open.includes(id) && !(opts && opts.keep)) return close(id);
  if (!open.includes(id)) {
    if (isPhone()) open.splice(0).forEach((o) => delete floating[o]);
    open.push(id);
    while (open.length > 3) delete floating[open.shift()];
  } else {
    open.splice(open.indexOf(id), 1); open.push(id);   // to the top
  }
  paintWindows();
}
function close(id) {
  const i = open.indexOf(id);
  if (i >= 0) open.splice(i, 1);
  delete floating[id];
  paintWindows();
}

function frame(w, body) {
  return '<section class="ws-win is-' + w.object + '" data-win="' + w.id + '" role="dialog" aria-label="' + esc(w.label) + '">'
    + '<header class="ws-win-head" data-drag="' + w.id + '">' + glyph(w.glyph) + '<h2 class="ws-win-title">' + esc(w.label) + '</h2>'
    + '<kbd class="ws-key">' + keyLabel(w.key) + '</kbd>'
    + '<button type="button" class="ws-close" data-close="' + w.id + '" aria-label="Close ' + esc(w.label) + '">' + glyph('uiClose') + '</button></header>'
    + '<div class="ws-win-body">' + body + '</div></section>';
}

function paintWindows() {
  const phone = isPhone();
  layer.innerHTML = open.map((id) => frame(BY_ID[id], BY_ID[id].render(BY_ID[id]))).join('');
  /* Dock: newest at the right edge, older ones to its left. */
  let right = phone ? 0 : 12;
  for (let i = open.length - 1; i >= 0; i--) {
    const id = open[i], el = layer.querySelector('[data-win="' + id + '"]');
    el.style.zIndex = String(10 + i);
    if (phone) continue;
    el.style.width = BY_ID[id].w + 'px';
    if (floating[id]) { el.classList.add('is-floating'); el.style.left = floating[id].x + 'px'; el.style.top = floating[id].y + 'px'; continue; }
    el.style.right = right + 'px';
    right += BY_ID[id].w + 8;
  }
  panel.classList.toggle('has-sheet', phone && open.length > 0);
  document.querySelectorAll('[data-open]').forEach((b) => {
    const on = open.includes(b.getAttribute('data-open'));
    b.classList.toggle('is-open', on);
    b.setAttribute('aria-pressed', String(on));
  });
  paintHud();
  if (world) world.sync();
}

function stub(text) {
  return (w) => {
    const focus = state.skillFocus && w.id === 'skills' ? '<p class="ws-focus">' + esc(state.skillFocus) + '</p>' : '';
    const room = state.room && w.id === 'home' ? '<p class="ws-focus">' + esc(state.room) + '</p>' : '';
    return focus + room + '<p class="ws-stub">' + esc(text) + '</p>';
  };
}

/* THE SATCHEL: one category row, a grid of pockets, the picked item's line with ONE action. */
function renderBag() {
  const tabs = [['all', 'All'], ['gear', 'Gear'], ['materials', 'Materials'], ['food', 'Food']];
  const shown = BAG.filter(([id]) => state.bagTab === 'all' || kindOf(id) === state.bagTab);
  const cells = [];
  for (let i = 0; i < BAG_SLOTS; i++) {
    const row = shown[i];
    if (!row) { cells.push('<span class="ws-pocket is-empty"></span>'); continue; }
    const [id, n] = row;
    cells.push('<button type="button" class="ws-pocket' + (state.bagSel === id ? ' is-sel' : '') + '" data-pick="' + id + '" title="' + esc(nameOf(id)) + '">'
      + '<img class="ws-px" src="' + iconOf(id) + '" alt="' + esc(nameOf(id)) + '">' + (n > 1 ? '<span class="ws-count">' + num(n) + '</span>' : '') + '</button>');
  }
  const sel = state.bagSel && BAG.find(([id]) => id === state.bagSel);
  const act = sel && (kindOf(sel[0]) === 'gear' ? 'Equip' : kindOf(sel[0]) === 'food' ? 'Eat' : null);
  const foot = sel
    ? '<div class="ws-pick"><img class="ws-px" src="' + iconOf(sel[0]) + '" alt=""><span class="ws-pick-name">' + esc(nameOf(sel[0])) + '<small>' + num(sel[1]) + ' in your bag</small></span>'
      + (act ? '<button type="button" class="ws-primary">' + act + '</button>' : '') + '</div>'
    : '<div class="ws-pick is-hint">Pick an item to see what it does.</div>';
  return '<div class="ws-tabs" role="tablist">' + tabs.map(([k, l]) => '<button type="button" role="tab" class="ws-tab' + (state.bagTab === k ? ' is-on' : '') + '" data-tab="' + k + '" aria-selected="' + (state.bagTab === k) + '">' + l + '</button>').join('')
    + '<span class="ws-cap">' + BAG.length + ' / ' + BAG_SLOTS + '</span></div>'
    + '<div class="ws-pockets">' + cells.join('') + '</div>' + foot;
}

/* THE EQUIPMENT: the hero's own world sprite on a plinth, the slots in body order around it. */
function renderEquip() {
  const slot = ([s, label, g, at]) => {
    const id = WORN[s];
    return '<button type="button" class="ws-slot at-' + at + (id ? '' : ' is-empty') + '" title="' + esc(id ? nameOf(id) : label + ': empty') + '">'
      + (id ? '<img class="ws-px" src="' + iconOf(id) + '" alt="' + esc(nameOf(id)) + '">' : glyph(g, 'ws-glyph is-ghost'))
      + '<span class="ws-slot-label">' + esc(label) + '</span></button>';
  };
  return '<div class="ws-doll">' + DOLL.map(slot).join('') + '<div class="ws-plinth"><span class="ws-hero" data-hero></span></div></div>'
    + '<dl class="ws-stats"><div><dt>Attack</dt><dd>42</dd></div><div><dt>Defence</dt><dd>61</dd></div><div><dt>Armour</dt><dd>Plate</dd></div></dl>';
}

/* ── The hunt HUD (placeholder for B1): vitals + 2×10 bar always; target, log, floor in a hunt. ── */
function paintHud() {
  const hunting = scene === 'hunt';
  const bar = (k, v, max, label) => '<div class="ws-vital is-' + k + '" role="meter" aria-label="' + label + '" aria-valuenow="' + v + '" aria-valuemax="' + max + '">'
    + '<span class="ws-vital-fill" style="width:' + Math.round((v / max) * 100) + '%"></span><span class="ws-vital-text">' + label + ' ' + v + ' / ' + max + '</span></div>';
  const slots = (row) => BAR.map((id, i) => '<button type="button" class="ws-aslot' + (id ? '' : ' is-empty') + '" title="' + (id ? esc(nameOf(id)) : 'Empty slot') + '">'
    + (id && row === 0 ? '<img class="ws-px" src="' + iconOf(id) + '" alt="">' : '')
    + (row === 0 ? '<span class="ws-akey">' + ((i + 1) % 10) + '</span>' : '') + '</button>').join('');
  hud.innerHTML = (hunting
    ? '<div class="ws-target"><span class="ws-target-name">Rat</span><span class="ws-target-lv">Level 3</span><span class="ws-target-bar"><span style="width:62%"></span></span></div>'
      + '<div class="ws-ground"><b>Mill Cellar</b><span>Floor 1 of 1</span></div>'
      + '<section class="ws-log" aria-label="Hunt log"><h3>Hunt log</h3><ol>' + LOG.map(([k, t]) => '<li class="is-' + k + '">' + esc(t) + '</li>').join('') + '</ol></section>'
    : '')
    + '<div class="ws-dock"><div class="ws-vitals">' + bar('hp', HERO.hp, HERO.hpMax, 'HP') + bar('mp', HERO.mp, HERO.mpMax, 'MP') + '</div>'
    + '<div class="ws-abar" aria-label="Action bar"><div class="ws-arow">' + slots(0) + '</div><div class="ws-arow is-second">' + slots(1) + '</div></div></div>';
}

/* ── Hero sprite on the doll, from the shipped hero atlas (idle, facing south). ── */
let heroAnim = null;
async function animateHero() {
  const man = await fetch(ROOT + 'assets/world/atlas-hero.json').then((r) => r.json());
  const idle = man.sprites.hero.anims.idle;
  const frames = idle.dirs.s;
  let i = 0;
  clearInterval(heroAnim);
  heroAnim = setInterval(() => {
    const el = layer.querySelector('[data-hero]');
    if (!el) return;
    const z = isPhone() ? 3 : 4;
    const [x, y] = frames[i++ % frames.length];
    el.style.backgroundImage = 'url(' + ROOT + 'assets/world/' + man.image + ')';
    el.style.backgroundSize = (man.size[0] * z) + 'px ' + (man.size[1] * z) + 'px';
    el.style.backgroundPosition = (-x * z) + 'px ' + (-y * z) + 'px';
    el.style.width = el.style.height = (64 * z) + 'px';
  }, 1000 / idle.fps);
}

/* ── Interaction ────────────────────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('[data-open],[data-close],[data-pick],[data-tab],[data-scene]');
  if (!t) return;
  if (t.hasAttribute('data-open')) toggle(t.getAttribute('data-open'));
  else if (t.hasAttribute('data-close')) close(t.getAttribute('data-close'));
  else if (t.hasAttribute('data-pick')) { state.bagSel = state.bagSel === t.getAttribute('data-pick') ? null : t.getAttribute('data-pick'); paintWindows(); }
  else if (t.hasAttribute('data-tab')) { state.bagTab = t.getAttribute('data-tab'); paintWindows(); }
  else if (t.hasAttribute('data-scene')) setScene(t.getAttribute('data-scene'));
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { e.preventDefault(); if (open.length) close(open[open.length - 1]); else toggle('settings'); return; }
  const w = WINDOWS.find((x) => x.key === k && k !== 'escape');
  if (w) { e.preventDefault(); toggle(w.id); }
});
/* Drag a title bar: the window leaves the dock and floats where it is put (desktop only). */
layer.addEventListener('pointerdown', (e) => {
  const head = e.target.closest('[data-drag]');
  if (!head || e.target.closest('[data-close]') || isPhone()) return;
  const id = head.getAttribute('data-drag'), el = head.parentElement, box = panel.getBoundingClientRect(), r = el.getBoundingClientRect();
  const dx = e.clientX - r.left, dy = e.clientY - r.top;
  open.splice(open.indexOf(id), 1); open.push(id);
  const move = (m) => {
    floating[id] = { x: Math.max(0, Math.min(box.width - r.width, m.clientX - box.left - dx)), y: Math.max(0, Math.min(box.height - 48, m.clientY - box.top - dy)) };
    el.classList.add('is-floating'); el.style.right = ''; el.style.left = floating[id].x + 'px'; el.style.top = floating[id].y + 'px';
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); paintWindows(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
});
mq.addEventListener('change', () => { if (isPhone() && open.length > 1) open.splice(0, open.length - 1); paintWindows(); });

/* ── In-world triggers: the World's own taps call these (src/world/world-boot.js nav). ── */
const TAB_TO_WINDOW = { skills: 'skills', house: 'home', inventory: 'bag', character: 'equip' };
window.showTab = (tab) => { if (TAB_TO_WINDOW[tab]) toggle(TAB_TO_WINDOW[tab], { keep: true }); return true; };
window.openSkillDetail = (id) => { state.skillFocus = 'Opened from the world: ' + id.charAt(0).toUpperCase() + id.slice(1); toggle('skills', { keep: true }); };
window.HearthriseHomestead = { openRoom(id) { state.room = 'Opened from the world: the ' + String(id).replace(/_/g, ' '); toggle('home', { keep: true }); return true; } };
window.HearthriseCombatScreens = { showHunt() { setScene('hunt'); return true; } };

/* ── The World, booted for real over a fixture G ───────────────────────── */
let world = null, scene = 'town';
function setScene(s) {
  scene = ['town', 'home', 'hunt'].includes(s) ? s : 'town';
  const G = window.G || (window.G = {});
  G.playerName = HERO.name;
  if (scene === 'hunt') Object.assign(G, { activeMonster: 'rat', _huntId: 'mill_cellar', monsterHp: 12, monsterMaxHp: 20, playerHp: HERO.hp, playerMaxHp: HERO.hpMax });
  else { delete G.activeMonster; delete G._huntId; const b = panel.querySelector('[data-world-choice="' + scene + '"]'); if (b) b.click(); }
  document.querySelectorAll('[data-scene]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-scene') === scene)));
  paintHud();
  if (world) world.sync();
}

drawRail();
if (!Q.get('clean')) {
  panel.querySelector('[data-proto]').innerHTML = '<span>Prototype scene</span>' + ['town', 'home', 'hunt'].map((s) => '<button type="button" data-scene="' + s + '" aria-pressed="false">' + s.charAt(0).toUpperCase() + s.slice(1) + '</button>').join('');
}
window.G = { playerName: HERO.name };
world = await bootWorld(panel);
window.__shell = { world, open, toggle };
setScene(Q.get('scene') || 'town');
(Q.get('open') || '').split(',').filter((id) => BY_ID[id]).forEach((id) => toggle(id, { keep: true }));
paintWindows();
animateHero();
