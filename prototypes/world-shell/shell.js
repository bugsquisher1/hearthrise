// ════════════════════════════════════════════════════════════════════════
// prototypes/world-shell/shell.js — THE SHELL AROUND THE REAL WORLD.
//
// Prototype only (docs/design/WORLD_SHELL.md). The World is the shipped runtime
// (bootWorld) over a fixture G; item names, kinds and pixel icons and monster
// names are the shipped catalogues (src/data/items.js, item-art.js, monsters.js).
// The counts, the equipped set, the hero's name, level, gold and vitals are
// FIXTURES: there is no sign-in here and nothing is sent anywhere.
//
// THE WINDOW MANAGER (the part the cutover inherits):
//   launchers  one icon row at the top right of the strip; no side rail.
//   desktop    a window opens DOCKED at the right edge, newer ones to its left;
//              dragging a title bar floats it. The dock never covers more than
//              DOCK_MAX of the World: a window that would cross it closes the
//              oldest docked one. At most 3 windows open in all.
//   phone      ONE full-height side sheet; opening another replaces it.
//   Esc        closes the top window; with none open it opens Settings.
//   CAMERA     docked windows never cover the hero or the target: the stage is
//              widened leftward by the covered width, so the camera (which
//              centres on the stage) centres on the World that is still visible.
//              A FAKE of the engine's inset (HANDOFFS 2026-10-14), done from
//              outside so src/world is untouched.
// ════════════════════════════════════════════════════════════════════════
import { bootWorld } from '../../src/world/world-boot.js';
import { MOBILE_QUERY, ART_ROWS } from '../../src/world/core/camera.js';
import { ITEMS } from '../../src/data/items.js';
import { MONSTERS } from '../../src/data/monsters.js';
import { PIXEL_DIR, fileFor } from '../../src/data/item-art.js';

const Q = new URLSearchParams(location.search);
const GLYPH = window.HR_GLYPHS || {};
const mq = window.matchMedia(MOBILE_QUERY);
const isPhone = () => mq.matches;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const glyph = (k, cls) => (GLYPH[k] ? '<svg class="' + (cls || 'ws-glyph') + '" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path d="' + GLYPH[k] + '"/></svg>' : '');
const num = (n) => Number(n).toLocaleString('en-US');
const MOTION_MS = 120;
const DOCK_MAX = 0.6;
const DOCK_GAP = 8, DOCK_EDGE = 12;
/** Device px per art px for this screen class: x2 up to ~2400 px wide, x3 above. World, icons and the gear figure all use it. */
const DENSITY = window.innerWidth * (window.devicePixelRatio || 1) > 2400 ? 3 : 2;

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
  weapon: 'iron_sword', ammo: 'bronze_arrows', belt: 'iron_belt', ring: 'copper_ring' };
/* Body order: the left column reads head to legs, the right column ears to feet, the hands below. */
const DOLL = [
  ['helmet', 'Helmet', 'uiHelm', 'l1'], ['necklace', 'Amulet', 'uiAmulet', 'l2'], ['body', 'Body', 'uiBody', 'l3'], ['pants', 'Legs', 'uiLegs', 'l4'],
  ['earrings', 'Earrings', 'uiGem', 'r1'], ['cape', 'Cape', 'uiCape', 'r2'], ['gloves', 'Gloves', 'uiGloves', 'r3'], ['boots', 'Boots', 'uiBoots', 'r4'],
  ['weapon', 'Weapon', 'uiSword', 'b1'], ['ammo', 'Ammo', 'uiArrow', 'b2'], ['belt', 'Belt', 'uiShield', 'b3'], ['ring', 'Ring', 'uiRing', 'b4'],
];
/* Row 1 = keys 1-0, row 2 = Shift+1-0. Row 2 shows only once something is bound to it. */
const BAR = [['cooked_trout', 'wheat_bread', null, null, null, null, null, null, null, null], Array(10).fill(null)];
const LOG = [['hit', 'You hit the Giant Rat for 12.'], ['hurt', 'The Giant Rat bites you for 3.'], ['kill', 'The Giant Rat dies.'], ['loot', 'Loot: Rat Tail, Bones.'], ['hit', 'You hit the Slime for 9.']];

const item = (id) => ITEMS[id] || null;
const nameOf = (id) => (item(id) && item(id).n) || id;
const iconOf = (id) => PIXEL_DIR + fileFor(id);
const kindOf = (id) => { const it = item(id) || {}; if (it.slot) return 'gear'; if (/cooked|bread|pie|stew/.test(id)) return 'food'; return 'materials'; };

/* ── The window catalogue: one row per window; the launcher row is drawn from it. ── */
const WINDOWS = [
  { id: 'bag', label: 'Bag', key: 'b', glyph: 'navInventory', w: 400, render: renderBag, object: 'satchel' },
  { id: 'equip', label: 'Gear', key: 'c', glyph: 'navCharacter', w: 340, render: renderEquip, object: 'doll' },
  { id: 'skills', label: 'Skills', key: 'k', glyph: 'navSkills', w: 400, render: stub('A skill ledger: one ruled line per skill, its level, its next unlock, and the bench or spot that trains it.'), object: 'ledger' },
  { id: 'home', label: 'Homestead', key: 'h', glyph: 'navHouse', w: 400, render: stub('The deed and plan of your homestead: rooms, plots and workers, drawn from the cottage map.'), object: 'deed' },
  { id: 'bestiary', label: 'Bestiary', key: 'l', glyph: 'uiBook', w: 440, render: stub('An encyclopedia: region chapters, one plate per creature. Returns after the cutover (spec §5).'), object: 'book' },
  { id: 'market', label: 'Market', key: 'm', glyph: 'navMarket', w: 440, render: stub('A stall ledger of listings. Returns after the cutover (spec §5).'), object: 'ledger' },
  { id: 'chat', label: 'Chat', key: 'enter', glyph: 'uiChat', w: 380, render: stub('Realm and clan chat. Returns after the cutover (spec §5).'), object: 'plain' },
  { id: 'settings', label: 'Settings', key: 'escape', glyph: 'uiSettings', w: 380, render: renderSettings, object: 'plain' },
];
const BY_ID = Object.fromEntries(WINDOWS.map((w) => [w.id, w]));
const keyLabel = (k) => (k === 'escape' ? 'Esc' : k === 'enter' ? 'Enter' : k.toUpperCase());

const panel = document.getElementById('panel-world');
const stage = panel.querySelector('.world-stage');
const layer = panel.querySelector('[data-layer]');
const hud = panel.querySelector('[data-hud]');
const open = [];            // ids, oldest first
const floating = {};        // id -> {x, y} once dragged
const entering = new Set(); // ids that animate in on the next paint
const leaving = new Set();  // ids animating out
const state = { bagSel: null, bagTab: 'all', skillFocus: null, room: null };

/* ── The strip: name and level left; gold and the launcher row right ───── */
document.querySelector('[data-strip="name"]').textContent = HERO.name;
document.querySelector('[data-strip="level"]').textContent = 'Level ' + HERO.level;
document.querySelector('[data-strip="gold"]').innerHTML = glyph('gold', 'ws-glyph is-gold') + '<span>' + num(HERO.gold) + '</span><span class="ws-sr"> gold</span>';
const launchersHtml = () => '<nav class="ws-launchers" aria-label="Windows">' + WINDOWS.map((w) => '<button type="button" class="ws-launch' + (open.includes(w.id) ? ' is-open' : '') + '" data-open="' + w.id + '" aria-pressed="' + open.includes(w.id) + '" aria-label="' + esc(w.label) + ' (' + keyLabel(w.key) + ')" data-tip="' + esc(w.label) + '" data-key="' + keyLabel(w.key) + '">' + glyph(w.glyph) + '</button>').join('') + '</nav>';

/* ── HUD WIDGETS ────────────────────────────────────────────────────────────
   Everything that sits on screen is a widget (spec §2a). The contract row:
     id, label, layer ('world' = inside the World, shifted by the dock; 'screen' =
     anywhere, the strip included), anchor (t|m|b + l|c|r) with dx/dy from that
     edge, min [w, h], opacity 0.4–1, visible, removable, when ('always'|'hunt').
   The player's layout is a DISPLAY PREFERENCE (residue allowlist in the game,
   CLAUDE.md §6): nothing reads it to gate or spend. Stored per size class. */
const WIDGETS = [
  { id: 'launchers', label: 'Menu icons', layer: 'screen', anchor: 'tr', dx: 0, dy: 0, phone: { dy: 0 }, min: [320, 40], removable: false, when: 'always', render: launchersHtml },
  { id: 'vitals', label: 'Health and mana', layer: 'world', anchor: 'bc', dx: 0, dy: 100, phone: { dy: 74 }, min: [300, 16], when: 'always', render: vitalsHtml },
  { id: 'actionbar', label: 'Action bar', layer: 'world', anchor: 'bc', dx: 0, dy: 12, phone: { dy: 4 }, min: [420, 44], when: 'always', render: actionbarHtml },
  { id: 'target', label: 'Target', layer: 'world', anchor: 'tc', dx: 0, dy: 12, phone: { anchor: 'tr', dx: 6, dy: 6 }, min: [180, 48], when: 'hunt', render: targetHtml },
  { id: 'ground', label: 'Floor and route', layer: 'world', anchor: 'tl', dx: 12, dy: 12, phone: { dx: 6, dy: 6 }, min: [140, 48], when: 'hunt', render: groundHtml },
  { id: 'analyzer', label: 'Hunt analyzer', layer: 'world', anchor: 'tl', dx: 12, dy: 84, phone: { dx: 6, dy: 64, visible: false }, min: [220, 160], when: 'hunt', render: analyzerHtml },
  { id: 'log', label: 'Hunt log', layer: 'world', anchor: 'bl', dx: 12, dy: 12, phone: { visible: false }, min: [240, 120], when: 'hunt', render: logHtml },
  { id: 'chat', label: 'Chat', layer: 'world', anchor: 'bl', dx: 12, dy: 160, visible: false, phone: { visible: false }, min: [280, 120], when: 'always', render: chatHtml },
];
const WIDGET_BY_ID = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));
const PHONE_SNAPS = [['tl', 'Top left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['bc', 'Bottom centre'], ['br', 'Bottom right']];
const GRID = 8, SNAP_EDGE = 24, EDGE = 12;
const sizeClass = () => (isPhone() ? 'phone' : 'desktop');
const storeKey = () => 'hr.hudLayout.v1.' + sizeClass();
const defaultsOf = (w) => Object.assign({ anchor: w.anchor, dx: w.dx, dy: w.dy, opacity: 1, visible: w.visible !== false }, isPhone() ? w.phone : null);
let layout = {};
function loadLayout() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storeKey()) || '{}') || {}; } catch (e) { saved = {}; }
  layout = Object.fromEntries(WIDGETS.map((w) => [w.id, Object.assign(defaultsOf(w), saved[w.id] || {})]));
  layout.launchers.visible = true;          // never hidden: Settings must stay reachable by tap too
}
function saveLayout() { try { localStorage.setItem(storeKey(), JSON.stringify(layout)); } catch (e) { /* a full or blocked store keeps the session's layout */ } }
function resetLayout() { try { localStorage.removeItem(storeKey()); } catch (e) { /* nothing saved */ } loadLayout(); paintHud(); paintEdit(); }

/* ── Windows ────────────────────────────────────────────────────────────── */
const dockedOf = () => open.filter((id) => !floating[id]);
const dockWidth = (ids) => (ids.length ? ids.reduce((s, id) => s + BY_ID[id].w, 0) + DOCK_GAP * (ids.length - 1) + DOCK_EDGE : 0);

function toggle(id, opts) {
  if (open.includes(id) && !(opts && opts.keep)) return close(id);
  if (!open.includes(id)) {
    if (isPhone()) open.splice(0).forEach((o) => delete floating[o]);
    open.push(id);
    entering.add(id);
    /* The dock keeps the World visible; then the hard cap of three. */
    const max = panel.clientWidth * DOCK_MAX;
    while (!isPhone() && dockedOf().length > 1 && dockWidth(dockedOf()) > max) dropOldest(dockedOf()[0]);
    while (open.length > 3) dropOldest(open[0]);
  } else {
    open.splice(open.indexOf(id), 1); open.push(id);   // to the top
  }
  paintWindows();
}
function dropOldest(id) { open.splice(open.indexOf(id), 1); delete floating[id]; }
function close(id) {
  const el = layer.querySelector('[data-win="' + id + '"]');
  if (!el || leaving.has(id)) return;
  leaving.add(id);
  el.classList.add('is-leaving');
  setTimeout(() => {
    leaving.delete(id);
    const i = open.indexOf(id);
    if (i >= 0) open.splice(i, 1);
    delete floating[id];
    paintWindows();
  }, MOTION_MS);
}

function frame(w, body) {
  return '<section class="ws-win is-' + w.object + (entering.has(w.id) ? ' is-entering' : '') + '" data-win="' + w.id + '" role="dialog" aria-label="' + esc(w.label) + '">'
    + '<header class="ws-win-head" data-drag="' + w.id + '">' + glyph(w.glyph) + '<h2 class="ws-win-title">' + esc(w.label) + '</h2>'
    + '<kbd class="ws-key">' + keyLabel(w.key) + '</kbd>'
    + '<button type="button" class="ws-close" data-close="' + w.id + '" aria-label="Close ' + esc(w.label) + '">' + glyph('uiClose') + '</button></header>'
    + '<div class="ws-win-body">' + body + '</div></section>';
}

/** The width of the World the docked windows cover, right edge inward (CSS px). */
function coveredWidth() {
  /* The Edit HUD panel docks like a window, so it never hides the widgets it edits. */
  const panelEl = editing && editBox.querySelector('.ws-edit-panel');
  if (panelEl) return isPhone() ? panelEl.offsetWidth : 0;   // desktop: the panel sits clear of every default anchor
  if (!open.length) return 0;
  if (isPhone()) { const el = layer.querySelector('.ws-win'); return el ? el.offsetWidth : 0; }
  return dockWidth(dockedOf());
}

function paintWindows() {
  const phone = isPhone();
  layer.innerHTML = open.map((id) => frame(BY_ID[id], BY_ID[id].render(BY_ID[id]))).join('');
  entering.clear();
  /* Dock: newest at the right edge, older ones to its left. */
  let right = DOCK_EDGE;
  for (let i = open.length - 1; i >= 0; i--) {
    const id = open[i], el = layer.querySelector('[data-win="' + id + '"]');
    el.style.zIndex = String(10 + i);
    if (phone) continue;
    el.style.width = BY_ID[id].w + 'px';
    if (floating[id]) { el.classList.add('is-floating'); el.style.left = floating[id].x + 'px'; el.style.top = floating[id].y + 'px'; continue; }
    el.style.right = right + 'px';
    right += BY_ID[id].w + DOCK_GAP;
  }
  /* THE FAKE CAMERA INSET: widen the stage leftward by the covered width, so its
     centre (where the camera puts the hero, or a fitted room) is the centre of
     the World still in view. The HUD centres in the same rect. */
  const cover = coveredWidth();
  stage.style.left = -cover + 'px';
  hud.style.right = cover + 'px';
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

/* SETTINGS: plain (chrome has no object). Its one primary is the HUD editor. */
function renderSettings() {
  return '<p class="ws-stub">Sound, interface scale, account and sign out live here.</p>'
    + '<div class="ws-pick"><span class="ws-pick-name">Widgets<small>Show, hide or fade any widget. Shortcut: U</small></span><button type="button" class="ws-primary" data-edit-hud>HUD layout</button></div>';
}
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-edit-hud]')) setEditing(true); });

/* THE SATCHEL: one category row with its capacity, the pockets that hold
   something (the last row padded), and the picked item's line with ONE action. */
function renderBag() {
  const tabs = [['all', 'All'], ['gear', 'Gear'], ['materials', 'Materials'], ['food', 'Food']];
  const shown = BAG.filter(([id]) => state.bagTab === 'all' || kindOf(id) === state.bagTab);
  const cols = 5;   // one density: a pocket is one 32 px icon at DENSITY on every screen
  const cells = shown.map(([id, n]) => '<button type="button" class="ws-pocket' + (state.bagSel === id ? ' is-sel' : '') + '" data-pick="' + id + '" title="' + esc(nameOf(id)) + '">'
    + '<img class="ws-px" src="' + iconOf(id) + '" alt="' + esc(nameOf(id)) + '">' + (n > 1 ? '<span class="ws-count">' + num(n) + '</span>' : '') + '</button>');
  while (cells.length % cols) cells.push('<span class="ws-pocket is-empty"></span>');
  const sel = state.bagSel && BAG.find(([id]) => id === state.bagSel);
  const act = sel && (kindOf(sel[0]) === 'gear' ? 'Equip' : kindOf(sel[0]) === 'food' ? 'Eat' : null);
  const foot = sel
    ? '<div class="ws-pick"><img class="ws-px" src="' + iconOf(sel[0]) + '" alt=""><span class="ws-pick-name">' + esc(nameOf(sel[0])) + '<small>' + num(sel[1]) + ' in your bag</small></span>'
      + (act ? '<button type="button" class="ws-primary">' + act + '</button>' : '') + '</div>'
    : '<div class="ws-pick is-hint">Pick an item to see what it does.</div>';
  const fill = Math.round((BAG.length / BAG_SLOTS) * 100);
  return '<div class="ws-tabs" role="tablist">' + tabs.map(([k, l]) => '<button type="button" role="tab" class="ws-tab' + (state.bagTab === k ? ' is-on' : '') + '" data-tab="' + k + '" aria-selected="' + (state.bagTab === k) + '">' + l + '</button>').join('') + '</div>'
    + '<div class="ws-cap" role="meter" aria-label="Bag space" aria-valuenow="' + BAG.length + '" aria-valuemax="' + BAG_SLOTS + '"><span class="ws-cap-bar"><span style="width:' + fill + '%"></span></span>'
    + '<span class="ws-cap-text">' + BAG.length + ' of ' + BAG_SLOTS + ' spaces used</span></div>'
    + '<div class="ws-pockets" style="grid-template-columns:repeat(' + cols + ', max-content)">' + cells.join('') + '</div>' + foot;
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

/* ── Widget contents (B1 replaces these bodies; the frame and placement stay) ── */
function vitalsHtml() {
  const bar = (k, v, max, label) => '<div class="ws-vital is-' + k + '" role="meter" aria-label="' + label + '" aria-valuenow="' + v + '" aria-valuemax="' + max + '">'
    + '<span class="ws-vital-fill" style="width:' + Math.round((v / max) * 100) + '%"></span><span class="ws-vital-text">' + label + ' ' + v + ' / ' + max + '</span></div>';
  return '<div class="ws-vitals">' + bar('hp', HERO.hp, HERO.hpMax, 'HP') + bar('mp', HERO.mp, HERO.mpMax, 'MP') + '</div>';
}
/* One row of ten (keys 1-0); row 2 (Shift+1-0) only once something is bound to it. */
function actionbarHtml() {
  const rows = BAR.filter((row, r) => r === 0 || row.some(Boolean));
  const slots = (row, r) => row.map((id, i) => '<button type="button" class="ws-aslot' + (id ? '' : ' is-empty') + '" title="' + (id ? esc(nameOf(id)) : 'Empty slot') + '">'
    + (id ? '<img class="ws-px" src="' + iconOf(id) + '" alt="">' : '')
    + '<span class="ws-akey">' + (r ? 'S' : '') + ((i + 1) % 10) + '</span></button>').join('');
  return '<div class="ws-abar" aria-label="Action bar">' + rows.map((row, r) => '<div class="ws-arow">' + slots(row, r) + '</div>').join('') + '</div>';
}
function targetHtml() {
  const foe = MONSTERS.rat ? MONSTERS.rat.name : 'Rat';
  return '<div class="ws-target"><span class="ws-target-name">' + esc(foe) + '</span><span class="ws-target-lv">Level 3</span><span class="ws-target-bar"><span style="width:62%"></span></span></div>';
}
function groundHtml() { return '<div class="ws-ground"><b>Mill Cellar</b><span>Floor 1 of 1</span></div>'; }
/* The settled Analyzer, Huntera-style. Fixture numbers; in the game, G._huntAnalyzer. */
function analyzerHtml() {
  const rows = [['Kills', '118'], ['XP / hour', '14,200'], ['Loot', '3,940 gp'], ['Supplies', '−610 gp', 'is-cost'], ['Profit / hour', '+4,770 gp', 'is-gain']];
  return '<section class="ws-analyzer" aria-label="Hunt analyzer"><h3>Hunt analyzer<span>42 min</span></h3><dl>'
    + rows.map(([k, v, c]) => '<div><dt>' + k + '</dt><dd' + (c ? ' class="' + c + '"' : '') + '>' + v + '</dd></div>').join('')
    + '</dl><p>Settled 12 s ago</p></section>';
}
function logHtml() { return '<section class="ws-log" aria-label="Hunt log"><h3>Hunt log</h3><ol>' + LOG.map(([k, t]) => '<li class="is-' + k + '">' + esc(t) + '</li>').join('') + '</ol></section>'; }
function chatHtml() { return '<section class="ws-chat" aria-label="Chat"><h3>Chat</h3><p>Realm and clan chat returns after the cutover.</p></section>'; }

/* ── Placement: anchor + offset → left/top inside the widget's layer ── */
const screenHud = document.querySelector('[data-screen-hud]');
const layerOf = (w) => (w.layer === 'screen' ? screenHud : hud);
function place(el, L) {
  const box = el.parentElement.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const v = L.anchor[0], hz = L.anchor[1];
  const x = hz === 'l' ? L.dx : hz === 'r' ? box.width - w - L.dx : (box.width - w) / 2 + L.dx;
  const y = v === 't' ? L.dy : v === 'b' ? box.height - h - L.dy : (box.height - h) / 2 + L.dy;
  /* Never off the World: a widget wider than the space left beside the dock pins to the left edge. */
  el.style.left = Math.round(Math.max(0, Math.min(x, box.width - w))) + 'px';
  el.style.top = Math.round(y) + 'px';
}
/* Drop: the nearest anchor by thirds, offsets on the soft grid, and a snap to the edge margin. */
function anchorFor(el) {
  const box = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect();
  const x = r.left - box.left, y = r.top - box.top, cx = x + r.width / 2, cy = y + r.height / 2;
  const hz = cx < box.width / 3 ? 'l' : cx > (box.width * 2) / 3 ? 'r' : 'c';
  const v = cy < box.height / 3 ? 't' : cy > (box.height * 2) / 3 ? 'b' : 'm';
  let dx = hz === 'l' ? x : hz === 'r' ? box.width - r.width - x : x - (box.width - r.width) / 2;
  let dy = v === 't' ? y : v === 'b' ? box.height - r.height - y : y - (box.height - r.height) / 2;
  const snap = (d, centred) => (centred ? (Math.abs(d) < SNAP_EDGE ? 0 : Math.round(d / GRID) * GRID) : d < SNAP_EDGE ? (d < EDGE / 2 ? 0 : EDGE) : Math.round(d / GRID) * GRID);
  dx = snap(dx, hz === 'c'); dy = snap(dy, v === 'm');
  return { anchor: v + hz, dx, dy };
}

let editing = false;
function paintHud() {
  for (const w of WIDGETS) {
    const L = layout[w.id], host = layerOf(w);
    let el = host.querySelector('[data-widget="' + w.id + '"]');
    const show = L.visible && (w.when === 'always' || scene === 'hunt');
    if (!show) { if (el) el.remove(); continue; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'ws-widget is-' + w.id;
      el.setAttribute('data-widget', w.id);
      host.appendChild(el);
    }
    const html = w.render() + (editing ? '<span class="ws-widget-tag">' + esc(w.label) + '</span>' : '');
    if (el.innerHTML !== html) el.innerHTML = html;
    el.style.opacity = String(L.opacity);
    el.style.minWidth = w.min[0] + 'px';
    place(el, L);
  }
  /* Widgets never overlap: a centred widget that lands on an edge-anchored one
     (the bar on the hunt log when the dock narrows the World) steps clear of it. */
  for (const host of [hud, screenHud]) {
    const els = [...host.querySelectorAll('[data-widget]')];
    const edge = els.filter((e) => layout[e.getAttribute('data-widget')].anchor[1] !== 'c').map((e) => e.getBoundingClientRect());
    for (const e of els.filter((x) => layout[x.getAttribute('data-widget')].anchor[1] === 'c')) {
      const r = e.getBoundingClientRect(), box = host.getBoundingClientRect();
      const hit = edge.find((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
      if (hit && hit.right + DOCK_EDGE + r.width <= box.right) e.style.left = Math.round(hit.right - box.left + DOCK_EDGE) + 'px';
    }
  }
  /* Gold sits beside the launcher row while the row is home in the strip. */
  const L = layout.launchers, home = L.anchor === 'tr' && L.dx === 0 && L.dy === 0;
  const row = screenHud.querySelector('[data-widget="launchers"]');
  document.querySelector('[data-strip="right"]').style.paddingRight = (home && row ? row.offsetWidth + 12 : 6) + 'px';
}

/* ── Edit HUD mode (U, or Settings → Edit HUD layout). Desktop: drag with snap.
   Phone: no free drag; a snap position and show/hide per widget. ── */
const editBox = document.querySelector('[data-edit]');
function setEditing(on) {
  editing = on;
  document.body.classList.toggle('is-editing', on);
  editBox.hidden = !on;
  if (on && open.length) open.splice(0).forEach((id) => delete floating[id]);
  paintEdit();
  paintWindows();
}
function paintEdit() {
  if (!editing) { editBox.innerHTML = ''; return; }
  const phone = isPhone();
  const row = (w) => {
    const L = layout[w.id];
    return '<li class="ws-edit-row">'
      + '<label class="ws-edit-show"><input type="checkbox" data-wshow="' + w.id + '"' + (L.visible ? ' checked' : '') + (w.removable === false ? ' disabled' : '') + '> ' + esc(w.label) + (w.when === 'hunt' ? ' <small>in a hunt</small>' : '') + '</label>'
      + (phone ? '<select data-wsnap="' + w.id + '" aria-label="Where ' + esc(w.label) + ' sits">' + PHONE_SNAPS.map(([a, l]) => '<option value="' + a + '"' + (L.anchor === a ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' : '')
      + '<input type="range" min="40" max="100" step="5" value="' + Math.round(L.opacity * 100) + '" data-wop="' + w.id + '" aria-label="' + esc(w.label) + ' opacity"><span class="ws-edit-pct">' + Math.round(L.opacity * 100) + '%</span></li>';
  };
  editBox.innerHTML = '<div class="ws-edit-grid" aria-hidden="true"></div><section class="ws-edit-panel" role="dialog" aria-label="Edit HUD">'
    + '<header><h2>HUD layout</h2><p>Show, hide or fade any widget; hover shows it at full strength. <b>v1.1:</b> ' + (phone ? 'pick where each widget sits.' : 'drag a widget to move it; it snaps to the edges and the grid.') + '</p></header>'
    + '<ul>' + WIDGETS.map(row).join('') + '</ul>'
    + '<footer><button type="button" class="ws-quiet" data-wreset>Reset layout</button><button type="button" class="ws-primary" data-wdone>Done</button></footer></section>';
}
editBox.addEventListener('input', (e) => {
  const t = e.target;
  if (t.hasAttribute('data-wop')) { const id = t.getAttribute('data-wop'); layout[id].opacity = Number(t.value) / 100; t.nextElementSibling.textContent = t.value + '%'; }
  else if (t.hasAttribute('data-wshow')) layout[t.getAttribute('data-wshow')].visible = t.checked;
  else if (t.hasAttribute('data-wsnap')) { const id = t.getAttribute('data-wsnap'); Object.assign(layout[id], { anchor: t.value, dx: t.value[1] === 'c' ? 0 : 6, dy: 6 }); }
  saveLayout(); paintHud();
});
editBox.addEventListener('click', (e) => {
  if (e.target.closest('[data-wreset]')) resetLayout();
  else if (e.target.closest('[data-wdone]')) setEditing(false);
});
/* Drag a widget in edit mode (desktop). Clicks inside widgets are inert while editing. */
document.addEventListener('pointerdown', (e) => {
  if (!editing || isPhone()) return;
  const el = e.target.closest('[data-widget]');
  if (!el) return;
  e.preventDefault();
  const id = el.getAttribute('data-widget'), r = el.getBoundingClientRect(), box = el.parentElement.getBoundingClientRect();
  const ox = e.clientX - r.left, oy = e.clientY - r.top;
  el.classList.add('is-dragging');
  const move = (m) => {
    el.style.left = Math.round(Math.max(0, Math.min(box.width - r.width, m.clientX - box.left - ox))) + 'px';
    el.style.top = Math.round(Math.max(0, Math.min(box.height - r.height, m.clientY - box.top - oy))) + 'px';
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    el.classList.remove('is-dragging');
    Object.assign(layout[id], anchorFor(el));
    saveLayout(); paintHud();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}, true);

/* ── Hero sprite on the doll, from the shipped hero atlas (idle, facing south). ── */
let heroAnim = null;
async function animateHero() {
  const man = await fetch('assets/world/atlas-hero.json').then((r) => r.json());
  const idle = man.sprites.hero.anims.idle;
  const frames = idle.dirs.s;
  let i = 0;
  clearInterval(heroAnim);
  heroAnim = setInterval(() => {
    const el = layer.querySelector('[data-hero]');
    if (!el) return;
    const z = DENSITY;   // the gear figure is drawn at the screen's one pixel density
    const [x, y] = frames[i++ % frames.length];
    el.style.backgroundImage = 'url(assets/world/' + man.image + ')';
    el.style.backgroundSize = (man.size[0] * z) + 'px ' + (man.size[1] * z) + 'px';
    el.style.backgroundPosition = (-x * z) + 'px ' + (-y * z) + 'px';
    el.style.width = el.style.height = (64 * z) + 'px';
  }, 1000 / idle.fps);
}

/* ── Interaction ────────────────────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('[data-open],[data-close],[data-pick],[data-tab],[data-scene]');
  if (!t || (editing && e.target.closest('[data-widget]'))) return;
  if (t.hasAttribute('data-open')) toggle(t.getAttribute('data-open'));
  else if (t.hasAttribute('data-close')) close(t.getAttribute('data-close'));
  else if (t.hasAttribute('data-pick')) { state.bagSel = state.bagSel === t.getAttribute('data-pick') ? null : t.getAttribute('data-pick'); paintWindows(); }
  else if (t.hasAttribute('data-tab')) { state.bagTab = t.getAttribute('data-tab'); paintWindows(); }
  else if (t.hasAttribute('data-scene')) setScene(t.getAttribute('data-scene'));
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' && editing) { e.preventDefault(); setEditing(false); return; }
  if (k === 'u') { e.preventDefault(); setEditing(!editing); return; }
  if (k === 'escape') {
    e.preventDefault();
    const live = open.filter((id) => !leaving.has(id));
    if (live.length) close(live[live.length - 1]); else toggle('settings');
    return;
  }
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
mq.addEventListener('change', () => { if (isPhone() && open.length > 1) open.splice(0, open.length - 1); loadLayout(); paintWindows(); paintEdit(); });

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

if (!Q.get('clean')) {
  panel.querySelector('[data-proto]').innerHTML = '<span>Prototype scene</span>' + ['town', 'home', 'hunt'].map((s) => '<button type="button" data-scene="' + s + '" aria-pressed="false">' + s.charAt(0).toUpperCase() + s.slice(1) + '</button>').join('');
}
/* The game publishes the monster catalogue on window; the World names plates from it. */
window.MONSTERS = MONSTERS;
/* ONE PIXEL DENSITY (spec §1): the World's zoom is pinned to DENSITY in every scene.
   The engine derives it from innerHeight (camera.js zoomFor); the prototype pins it
   by answering that read, so src/world stays untouched. */
Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => (DENSITY * ART_ROWS) / (window.devicePixelRatio || 1) });
window.G = { playerName: HERO.name };
loadLayout();
world = await bootWorld(panel);
window.__shell = { world, open, toggle, coveredWidth };
setScene(Q.get('scene') || 'town');
(Q.get('open') || '').split(',').filter((id) => BY_ID[id]).forEach((id) => toggle(id, { keep: true }));
paintWindows();
animateHero();
if (Q.get('edit')) setEditing(true);
