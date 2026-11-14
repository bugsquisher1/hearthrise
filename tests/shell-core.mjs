#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/shell-core.mjs — THE WORLD SHELL'S WINDOW MANAGER AND HUD CONTRACT, IN NODE
//
//   node tests/shell-core.mjs             the tests, on the real modules
//   node tests/shell-core.mjs --selftest  every planted defect must turn a test red
//
// docs/design/WORLD_SHELL.md §2 and §4, on src/shell/window-manager.js and
// src/shell/hud.js (both pure: the host supplies size class, World size and a
// scheduler) plus the `hudLayout` residue bound in src/session/residue.js.
//   W  windows: the cap of three (oldest closes), the 60% dock, Esc (top window,
//      then the escape row), focus order, the phone's single sheet, keys
//      (B/C/K/H/L/M/Enter on the spec catalogue; ignored while typing or chorded),
//      the 120 ms close and reduced motion, float/dock, no window in the camera inset,
//      a home-bl window (Chat) floating at the bottom-left and a resizable one's size;
//      W16 GO TO (Tyler 2026-11-08, "a direct line to click from here and get to the shop"): a link's
//      goTo opens the window on its tab and holds the row it asked for until the shell finds it,
//      a closed window forgets it, a phone's sheet is replaced, an unknown window is refused
//   H  HUD: defaults per size class, show/hide (never the launchers), opacity
//      clamp, persisted per size class, Reset touches only this class, a saved
//      layout survives a reload, `when: hunt`, placement by anchor; MOVE (a drop
//      kept as corner offsets, back after a reload, on screen at every size, Put
//      back) and FOLD (kept, back after a reload) (Tyler 2026-10-25: H14, H15)
//   R  the residue: hudLayout is allowlisted, rides the put, and a forged bag
//      is bounded on the way in
//
// The selftest copies the modules to a temp tree, plants one defect per arm and
// requires the named test to fail. No ?v= on imports here (tests/**, b332).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WM_FILE = 'src/shell/window-manager.js';
const HUD_FILE = 'src/shell/hud.js';

/* The spec's full window catalogue (§4) as a fixture: the shipped rows hold
   only what has a renderer today, and the keys are the manager's job either way. */
const SPEC_WINDOWS = [
  { id: 'bag', label: 'Bag', key: 'b', width: 400 },
  { id: 'equip', label: 'Gear', key: 'c', width: 340 },
  { id: 'skills', label: 'Skills', key: 'k', width: 400 },
  { id: 'home', label: 'Homestead', key: 'h', width: 400 },
  { id: 'bestiary', label: 'Bestiary', key: 'l', width: 440 },
  { id: 'market', label: 'Market', key: 'm', width: 440 },
  { id: 'chat', label: 'Chat', key: 'enter', width: 380 },
  { id: 'settings', label: 'Settings', key: 'escape', width: 380, escape: true },
];
const W = (o) => Object.assign({ id: 'x', label: 'X', layer: 'world', anchor: 'tl', dx: 0, dy: 0, min: [10, 10], opacity: 1, visible: true, removable: true, when: 'always', phone: {} }, o);
const SPEC_WIDGETS = [
  W({ id: 'launchers', layer: 'screen', anchor: 'tr', removable: false }),
  W({ id: 'vitals', anchor: 'bc', dy: 100, phone: { anchor: 'tl', dx: 6, dy: 62 } }),
  W({ id: 'analyzer', anchor: 'tl', dx: 12, dy: 84, when: 'hunt', phone: { visible: false } }),
  W({ id: 'chat', anchor: 'bl', dx: 12, dy: 160, visible: false }),
];

function harness(WMmod, opts) {
  const o = opts || {};
  const env = { phone: !!o.phone, width: o.width || 1440, height: 860, reduced: o.reduced !== false, timers: [] };
  const wm = WMmod.createWindowManager({
    windows: o.windows || SPEC_WINDOWS,
    isPhone: () => env.phone,
    world: () => ({ width: env.width, height: env.height }),
    reducedMotion: () => env.reduced,
    schedule: (fn, ms) => env.timers.push({ fn, ms }),
    sizeOf: o.sizeOf,
  });
  const events = [];
  wm.subscribe((e) => events.push(e));
  const flush = () => { const t = env.timers.splice(0); t.forEach((x) => x.fn()); return t; };
  return { wm, env, events, flush };
}
const key = (k, extra) => Object.assign({ key: k, target: { tagName: 'DIV' } }, extra || {});

function memStore(initial) {
  let v = initial === undefined ? null : JSON.parse(JSON.stringify(initial));
  return { read: () => v, write: (n) => { v = JSON.parse(JSON.stringify(n)); }, peek: () => v };
}

async function runTests(mods) {
  const { WM, HUD, CS, AR, AL, AH, XP, WH, SW, SHELL_CSS } = mods;
  const fails = [];
  const t = (id, fn) => { try { fn(); } catch (e) { fails.push(id + ': ' + e.message); } };
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); };
  const ok = (c, msg) => { if (!c) throw new Error(msg); };

  /* ── W: windows ── */
  t('W1 cap of three, the oldest closes', () => {
    const { wm } = harness(WM, { width: 4000 });
    ['bag', 'equip', 'skills', 'home'].forEach((id) => wm.open(id));
    eq(wm.openIds(), ['equip', 'skills', 'home'], 'a fourth window must close the oldest');
  });
  t('W2 the dock never covers more than 60% of the World', () => {
    const { wm } = harness(WM, { width: 1440 });
    wm.open('bag'); wm.open('equip');               // 400 + 8 + 340 + 12 = 760 <= 864
    eq(wm.openIds(), ['bag', 'equip'], 'two windows fit 60% of 1440');
    wm.open('market');                              // + 448 = 1208 > 864: the oldest docked goes
    eq(wm.openIds(), ['equip', 'market'], 'crossing 60% closes the oldest docked window');
  });
  t('W3 Esc closes the top window, then opens Settings', () => {
    const { wm } = harness(WM);
    wm.open('bag'); wm.open('skills');
    ok(wm.handleKey(key('Escape')), 'Esc must be consumed');
    eq(wm.openIds(), ['bag'], 'Esc closes the TOP window');
    wm.handleKey(key('Escape'));
    eq(wm.openIds(), [], 'second Esc closes the last');
    wm.handleKey(key('Escape'));
    eq(wm.openIds(), ['settings'], 'Esc with nothing open opens the escape row');
  });
  t('W4 focus raises a window to the top (Esc order follows)', () => {
    const { wm } = harness(WM, { width: 4000 });
    wm.open('bag'); wm.open('equip'); wm.open('skills');
    wm.focus('bag');
    eq(wm.openIds(), ['equip', 'skills', 'bag'], 'focus moves to the top');
    const z = Object.fromEntries(wm.layout().map((p) => [p.id, p.z]));
    ok(z.bag > z.skills && z.skills > z.equip, 'z order follows focus order');
    wm.handleKey(key('Escape'));
    eq(wm.openIds(), ['equip', 'skills'], 'Esc closes the focused one');
    wm.open('equip');
    eq(wm.openIds(), ['skills', 'equip'], 'opening an open window focuses it, never closes it');
  });
  t('W5 phone: one full-height side sheet; another replaces it', () => {
    const { wm } = harness(WM, { phone: true, width: 922 });
    wm.open('bag'); wm.open('equip');
    eq(wm.openIds(), ['equip'], 'the phone shows one sheet');
    ok(wm.float('equip', { x: 10, y: 10 }) === false, 'nothing floats on the phone');
    const p = wm.layout()[0];
    ok(p.phone && p.width === null, 'the phone sheet takes its width from CSS');
  });
  t('W6 a desktop->phone switch keeps only the top window', () => {
    const { wm, env } = harness(WM, { width: 4000 });
    wm.open('bag'); wm.open('equip');
    env.phone = true; env.width = 922; wm.resize();
    eq(wm.openIds(), ['equip'], 'the phone keeps the top window only');
  });
  t('W7 shortcut keys B/C/K/H/L/M/Enter toggle their windows', () => {
    const { wm } = harness(WM, { width: 9000 });
    const want = { b: 'bag', c: 'equip', k: 'skills', h: 'home', l: 'bestiary', m: 'market', Enter: 'chat' };
    for (const [k, id] of Object.entries(want)) {
      ok(wm.handleKey(key(k)), k + ' must be consumed');
      ok(wm.openIds().includes(id), k + ' must open ' + id);
      wm.handleKey(key(k));
      ok(!wm.openIds().includes(id), k + ' again must close ' + id);
    }
    ok(wm.handleKey(key('B')), 'Shift+B (a capital) is the same key');
  });
  t('W8 keys are ignored while typing or with a modifier', () => {
    const { wm } = harness(WM);
    for (const tag of ['INPUT', 'TEXTAREA']) ok(!wm.handleKey(key('b', { target: { tagName: tag } })), tag + ' must swallow the key');
    ok(!wm.handleKey(key('b', { target: { tagName: 'INPUT', type: 'search' } })), 'a search box must swallow the key');
    ok(!wm.handleKey(key('b', { target: { tagName: 'DIV', isContentEditable: true } })), 'contenteditable');
    ok(!wm.handleKey(key('b', { ctrlKey: true })), 'Ctrl+B');
    ok(!wm.handleKey(key('Escape', { isComposing: true })), 'IME composition');
    eq(wm.openIds(), [], 'nothing opened');
    /* The one key rule (src/utils/dom.js, Tyler 10-18): only typing takes a key. A focused checkbox or
       button never does, and a select takes only its arrows. */
    ok(wm.handleKey(key('b', { target: { tagName: 'INPUT', type: 'checkbox' } })), 'a focused checkbox must not swallow B');
    ok(wm.handleKey(key('b', { target: { tagName: 'SELECT' } })), 'a focused select must not swallow B');
    wm.close('bag');
    /* Enter on a focused button presses it (audit 2026-11-13: the item menu, the drop menu and the coach card opened Chat
       instead). A button still lets the letters through, and Enter with nothing focused still opens Chat. */
    for (const target of [{ tagName: 'BUTTON' }, { tagName: 'A', href: '#' }, { tagName: 'DIV', role: 'menuitem' }, { tagName: 'INPUT', type: 'checkbox' }]) {
      ok(!wm.handleKey(key('Enter', { target })), 'Enter on a focused ' + JSON.stringify(target) + ' must press it, not open Chat');
    }
    eq(wm.openIds(), [], 'Enter on a button opened ' + wm.openIds().join());
    ok(wm.handleKey(key('b', { target: { tagName: 'BUTTON' } })), 'a focused button must not swallow B');
    wm.close('bag');
    ok(wm.handleKey(key('Enter', { target: { tagName: 'DIV' } })), 'Enter on the page must still open Chat');
    wm.close('chat');
    /* A click on Close leaves focus on it through the 120 ms slide-out: Enter then opens Chat (town-works-world WW-5, 11-14).
       The same button in a window that is still open keeps its Enter. */
    const m = harness(WM, { reduced: false });
    const inWin = (id) => ({ tagName: 'BUTTON', closest: (s) => (s === '[data-hs-win]' ? { getAttribute: () => id } : null) });
    m.wm.open('bag');
    ok(!m.wm.handleKey(key('Enter', { target: inWin('bag') })), 'Enter on a button in an open window must press it');
    m.wm.close('bag');
    ok(m.wm.layout().some((p) => p.id === 'bag' && p.leaving), 'the bag is sliding out');
    ok(m.wm.handleKey(key('Enter', { target: inWin('bag') })), 'Enter on the Close of a window sliding out must open Chat');
    ok(m.wm.openIds().includes('chat'), 'Chat opened');
    ok(!wm.handleKey(key('1')), 'digits belong to the action bar');
  });
  t('W9 close waits 120 ms for the slide-out; reduced motion does not', () => {
    const h = harness(WM, { reduced: false });
    h.wm.open('bag');
    ok(h.wm.layout()[0].entering, 'a fresh window slides in');
    h.wm.close('bag');
    eq(h.wm.openIds(), [], 'a closing window is no longer live');
    const lay = h.wm.layout();
    ok(lay.length === 1 && lay[0].leaving, 'it is still painted, leaving');
    const fired = h.flush();
    ok(fired.length === 1 && fired[0].ms === 120, 'the close timer is 120 ms');
    eq(h.wm.layout(), [], 'gone after the motion');
    const r = harness(WM, { reduced: true });
    r.wm.open('bag');
    ok(!r.wm.layout()[0].entering, 'reduced motion: no slide in');
    r.wm.close('bag');
    eq(r.wm.layout(), [], 'reduced motion: gone at once');
    eq(r.env.timers.length, 0, 'reduced motion schedules nothing');
  });
  t('W10 docked right, newer to the left; float leaves the dock; dock returns', () => {
    const { wm } = harness(WM, { width: 4000 });
    wm.open('bag'); wm.open('equip');
    const at = Object.fromEntries(wm.layout().map((p) => [p.id, p]));
    eq(at.bag.right, 12, 'the first window docks at the right edge');
    eq(at.equip.right, 12 + 400 + 8, 'a newer one docks to its left');
    wm.float('bag', { x: 100, y: 50 });
    const f = wm.layout().find((p) => p.id === 'bag');
    ok(!f.docked && f.x === 100 && f.y === 50, 'a floated window sits where it was put');
    eq(wm.layout().find((p) => p.id === 'equip').right, 12 + 400 + 8, 'a floating window leaves its slot empty: the docked one did not move');
    wm.dock('bag');
    ok(wm.layout().find((p) => p.id === 'bag').docked, 'dock() returns it');
  });
  t('W10b a modal row opens centred: never docked, never a phone sheet', () => {
    const windows = SPEC_WINDOWS.concat([{ id: 'cfg', label: 'Configure action', key: 'q', glyph: 'uiTarget', width: 560, object: 'plain', modal: true }]);
    for (const phone of [false, true]) {
      const { wm } = harness(WM, { width: 1440, windows, phone });
      wm.open('bag');
      wm.open('cfg');
      const at = Object.fromEntries(wm.layout().map((p) => [p.id, p]));
      ok(at.cfg && at.cfg.modal && !at.cfg.docked, (phone ? 'phone' : 'desktop') + ': the modal row is centred, not docked');
      ok(!!at.bag, (phone ? 'phone' : 'desktop') + ': the window under the modal stays open');
      if (phone) { ok(wm.float('cfg', { x: 5, y: 5 }) === false, 'a phone modal never moves'); continue; }
      /* Tyler 2026-10-27: the desktop modal's head drags it, held wholly inside the World (860 tall here). */
      ok(wm.float('cfg', { x: 40, y: 30, h: 400 }) === true, 'desktop: a modal is dragged by its head');
      let c = wm.layout().find((p) => p.id === 'cfg');
      ok(c.modal && !c.docked && c.x === 40 && c.y === 30, 'desktop: the dragged modal sits where it was put, still a modal');
      wm.float('cfg', { x: 5000, y: 5000, h: 400 });
      c = wm.layout().find((p) => p.id === 'cfg');
      ok(c.x === 1440 - 560 && c.y === 860 - 400, 'desktop: a modal dragged past the edge stays wholly inside the World');
      ok(!!wm.layout().find((p) => p.id === 'bag').docked, 'desktop: dragging the modal never moves the dock');
      wm.close('cfg'); wm.open('cfg');
      ok(!Number.isFinite(wm.layout().find((p) => p.id === 'cfg').x), 'desktop: a reopened modal is centred again');
    }
  });
  t('W13 slots are stable: focus, open and close never move another window; a reopen goes back', () => {
    const { wm, flush } = harness(WM, { width: 4000 });
    wm.open('bag'); wm.open('skills'); wm.open('equip');
    const rights = () => Object.fromEntries(wm.layout().filter((p) => !p.leaving).map((p) => [p.id, p.right]).sort());
    const before = rights();
    wm.focus('skills'); wm.focus('bag');
    eq(rights(), before, 'focusing a window moved the dock');
    wm.close('skills'); flush();
    eq(rights(), { bag: before.bag, equip: before.equip }, 'closing the middle window moved the others');
    wm.open('skills');
    eq(rights(), before, 'a reopened window did not go back to its own slot');
    wm.close('skills'); wm.close('bag'); flush(); wm.open('skills');
    eq(rights().skills, before.skills, 'a reopen must restore its last rect, not take the first gap');
    wm.open('bag');
    wm.close('equip'); flush(); wm.open('home');
    eq(rights().home, before.equip, 'a new window takes the first free gap');
  });
  t('W11 windows are never in the camera inset: the manager publishes none and the HUD inset ignores them', () => {
    const { wm, events } = harness(WM, { width: 1440 });
    wm.open('bag');
    ok(!('inset' in events[events.length - 1]) && typeof wm.inset === 'undefined', 'a window must not publish a camera inset (Tyler 2026-10-19: windows float over the World)');
    eq(HUD.hudInsetOf([], { width: 1000, height: 600 }, 420), { left: 0, right: 0, top: 0, bottom: 0 }, 'the HUD inset takes no window strip');
  });
  t('W12 the catalogue is validated', () => {
    const bad = [
      [{ id: 'a', label: 'A', key: 'b', width: 1 }, { id: 'b', label: 'B', key: 'b', width: 1 }],
      [{ id: 'a', label: 'A', key: '1', width: 1 }],
      [{ id: 'a', label: 'A', key: 'a', width: 1, escape: true }, { id: 'b', label: 'B', key: 'b', width: 1, escape: true }],
    ];
    for (const rows of bad) { let threw = false; try { WM.validateWindowRows(rows); } catch (e) { threw = true; } ok(threw, 'must refuse ' + JSON.stringify(rows)); }
  });

  t('W16 a link opens its window on its tab and asks for its row', () => {
    const { wm, flush } = harness(WM, { reduced: true });
    wm.open('equip');
    ok(wm.goTo('market', { tab: 'buy', find: 'carrot_seed' }) === true, 'goTo refused a known window');
    ok(wm.isOpen('market') && wm.openIds().slice(-1)[0] === 'market', 'the window is not open on top: ' + wm.openIds());
    eq(wm.takeTab('market'), 'buy', 'its tab');
    eq(wm.wantsFind('market'), 'carrot_seed', 'the row it asked for');
    eq(wm.wantsFind('market'), 'carrot_seed', 'the wish is spent by a look');
    eq(wm.takeFind('market'), 'carrot_seed', 'the shell takes it');
    eq(wm.wantsFind('market'), null, 'a found row is asked for again');
    wm.goTo('market', { find: 'turnip_seed' });
    ok(wm.isOpen('market') && wm.wantsFind('market') === 'turnip_seed', 'an open window is not asked for a second row');
    wm.goTo('market', {});
    eq(wm.wantsFind('market'), null, 'a link with no row keeps the last link\'s wish');
    wm.goTo('market', { find: 'x' });
    wm.close('market'); flush();
    eq(wm.wantsFind('market'), null, 'a closed window still wants its row');
    ok(wm.goTo('nope', { find: 'x' }) === false && wm.wantsFind('nope') === null, 'goTo opened an unknown window');
    const phone = harness(WM, { phone: true, reduced: true });
    phone.wm.open('bag');
    phone.wm.goTo('market', { tab: 'buy' });
    eq(phone.wm.openIds(), ['market'], 'the phone keeps the sheet the link was pressed in');
  });

  /* ── W17-W21: ONE WINDOW HEADER (UX flow audit 2026-11-11, lane/b-window-header), on the shipped catalogue ── */
  t('W17 every window wears the same header: Back, title, ? when it has help, key, Close', () => {
    WM.validateWindowRows(SW);
    for (const row of SW) {
      const h = WH.headHtml(row, {}, false), at = (s) => h.indexOf(s);
      const back = at('data-hs-back="' + row.id + '" hidden'), title = at('class="hs-win-name">' + (row.title || row.label).replace(/'/g, '&#39;'));
      const help = at('data-hs-help="' + row.id + '"'), key = at('<kbd class="hs-key">'), close = at('data-hs-close="' + row.id + '"');
      ok(back > 0, row.id + ': no Back in its header');
      ok(title > back, row.id + ': its title is missing or stands before Back');
      ok(close > title, row.id + ': no Close after its title');
      ok((key > title && key < close) === !!row.key, row.id + ': its key hint ' + (row.key ? 'is missing' : 'shows with no key'));
      ok((help > title && help < close) === !!row.help, row.id + ': its ? ' + (row.help ? 'is missing' : 'shows with no help'));
      if (row.help) {
        ok(WH.helpLine(row, false).length > 20 && h.includes('class="hs-win-help" hidden'), row.id + ': its help line is empty or not folded under the band');
        ok(!/opens this window/.test(WH.helpLine(row, true)) && (!row.key || /opens this window/.test(WH.helpLine(row, false))), row.id + ': the key sentence follows the keyboard');
      }
    }
    eq(SW.filter((r) => r.help).map((r) => r.id).sort(), ['hunt-prep', 'hunts', 'inventory', 'shop', 'skills-trade', 'storage', 'wiki'], 'the windows with a help line');
    for (const bad of [[{ id: 'a', label: 'A', key: 'a', width: 1, beside: ['nope'] }], [{ id: 'a', label: 'A', key: 'a', width: 1, beside: ['a'] }],
      [{ id: 'a', label: 'A', key: 'a', width: 1, pageOf: ['a'], launcher: false }], [{ id: 'a', label: 'A', key: 'a', width: 1, over: true, modal: true, launcher: false }]]) {
      let threw = false; try { WM.validateWindowRows(bad); } catch (e) { threw = true; } ok(threw, 'must refuse ' + JSON.stringify(bad));
    }
  });
  /* With Back, ?, key and Close the band's controls leave a 380 window's title 133 px. Cinzel at .12em set "Gathering and crafting" on THREE
     lines there (v0.2.124); at .04em it takes two (measured 1280, 1440). Widening instead breaks the Party pairing (W18). Two lines, never three. */
  t('W22 a long window name keeps to two lines with Back showing: under 420 px the name sets at .04em or tighter', () => {
    const m = /\.hs-win-head:has\(> \.hs-back:not\(\[hidden\]\)\) > \.hs-win-title \{[^}]*letter-spacing:\s*([\d.]+)em/.exec(SHELL_CSS);
    const ls = m ? Number(m[1]) : 0.12;
    for (const row of SW) {
      const name = row.title || row.label;
      if (name.length > 14 && row.width < 420) ok(ls <= 0.04, row.id + ': "' + name + '" at ' + row.width + ' px sets at ' + ls + 'em beside Back and wraps to three lines');
    }
  });
  t('W18 the coexistence table: the bag beside Storage, the Shop and Character at 1440; Hunts lies over the dock', () => {
    for (const other of ['storage', 'shop', 'character']) {
      const { wm } = harness(WM, { windows: SW, width: 1440 });
      wm.open('inventory'); wm.open(other);
      eq(wm.openIds(), ['inventory', other], 'the bag and ' + other + ' stay open together at 1440');
      const L = wm.layout(), a = L.find((p) => p.id === 'inventory'), b = L.find((p) => p.id === other);
      ok(a.right + a.width + WM.DOCK_GAP <= b.right || b.right + b.width + WM.DOCK_GAP <= a.right, other + ' and the bag overlap');
    }
    const lone = harness(WM, { windows: SW, width: 1440 });
    lone.wm.open('character'); lone.wm.open('storage');
    eq(lone.wm.openIds(), ['storage'], 'two windows the table does not pair still share only 60% of the dock');
    const over = harness(WM, { windows: SW, width: 1440 });
    over.wm.open('hunt-party'); over.wm.open('skills-trade');
    const before = Object.fromEntries(over.wm.layout().map((p) => [p.id, p.right]));
    over.wm.open('hunts');
    eq(over.wm.openIds(), ['hunt-party', 'skills-trade', 'hunts'], 'Hunts closed the windows under it');
    const L = over.wm.layout();
    ok(L.find((p) => p.id === 'hunts').top, 'Hunts is not on top');
    for (const id of ['hunt-party', 'skills-trade']) eq(L.find((p) => p.id === id).right, before[id], id + ' moved under Hunts');
    over.wm.open('friends');
    ok(over.wm.isOpen('hunts') && over.wm.isOpen('friends'), 'a window opened over Hunts made room by closing Hunts: ' + over.wm.openIds());
  });
  t('W19 Back returns to the window a press came from, along the chain', () => {
    const { wm } = harness(WM, { windows: SW, width: 1440 });
    wm.open('shop');
    eq(wm.backTo('shop'), null, 'a window opened by its key has nowhere to go back to');
    ok(wm.back('shop') === false && wm.isOpen('shop'), 'Back on a window opened by its key did something');
    wm.close('shop');
    wm.open('hunts');
    wm.from('hunts', () => wm.goTo('shop', { tab: 'services' }));
    eq(wm.backTo('shop'), 'hunts', 'the Shop does not know it came from Hunts');
    wm.from('shop', () => wm.open('inventory'));
    eq(wm.backTo('inventory'), 'shop', 'the bag does not know it came from the Shop');
    ok(wm.back('inventory'), 'Back from the bag refused');
    ok(!wm.isOpen('inventory') && wm.openIds().slice(-1)[0] === 'shop', 'Back from the bag did not return to the Shop: ' + wm.openIds());
    ok(wm.back('shop') && !wm.isOpen('shop') && wm.openIds().slice(-1)[0] === 'hunts', 'Back from the Shop did not return to Hunts: ' + wm.openIds());
    const phone = harness(WM, { windows: SW, phone: true, width: 922 });
    phone.wm.open('hunts');
    phone.wm.from('hunts', () => phone.wm.open('storage'));
    eq(phone.wm.openIds(), ['storage'], 'the phone keeps one sheet');
    phone.wm.back('storage');
    eq(phone.wm.openIds(), ['hunts'], 'the phone\'s Back did not bring the sheet it came from');
    phone.wm.from('hunts', () => phone.wm.open('shop'));
    phone.wm.from('shop', () => phone.wm.open('inventory'));
    phone.wm.back('inventory');
    eq([phone.wm.openIds(), phone.wm.backTo('shop')], [['shop'], 'hunts'], 'a sheet brought back forgot where it came from');
    phone.wm.back('shop');
    eq(phone.wm.openIds(), ['hunts'], 'the phone\'s chain of Backs broke');
  });
  t('W20 a window opened from its host is a page of it, with Back, never a second window', () => {
    const { wm, flush } = harness(WM, { windows: SW, width: 1440 });
    wm.open('hunts');
    wm.from('hunts', () => wm.goTo('monster', { tab: 'gray_wolf' }));
    eq(wm.pageIn('hunts'), 'monster', 'Monster facts is not a page of Hunts');
    eq(wm.layout().map((p) => p.id), ['hunts'], 'Monster facts opened a second window');
    ok(wm.isOpen('monster') && wm.openIds().includes('monster'), 'a page is not open to the shell');
    eq(wm.backTo('hunts'), 'hunts', 'the page has no way back');
    wm.back('hunts');
    ok(wm.pageIn('hunts') === null && wm.isOpen('hunts'), 'Back did not return to Hunts\' own page');
    wm.from('hunts', () => wm.goTo('monster', { tab: 'gray_wolf' }));
    wm.handleKey(key('Escape'));
    ok(wm.pageIn('hunts') === null && wm.isOpen('hunts'), 'Esc on a page closed its host');
    wm.from('hunts', () => wm.goTo('monster', { tab: 'gray_wolf' }));
    wm.from('hunts', () => wm.goTo('hunts', { tab: 'thicket' }));
    eq(wm.pageIn('hunts'), null, 'a link to the host\'s own page left the page over it');
    wm.from('hunts', () => wm.goTo('monster', { tab: 'gray_wolf' }));
    wm.close('hunts'); flush();
    ok(!wm.isOpen('monster'), 'closing the host left its page open');
    wm.open('hunts');
    eq(wm.pageIn('hunts'), null, 'Hunts reopened on the page it was closed with');
    wm.close('hunts'); flush();
    wm.open('monster');
    eq(wm.layout().map((p) => p.id), ['monster'], 'opened from anywhere else it is a window of its own');
    wm.close('monster'); flush();
    wm.open('hunt-prep');
    wm.from('hunt-prep', () => wm.open('configure-action'));
    eq([wm.pageIn('hunt-prep'), wm.layout().map((p) => p.id)], ['configure-action', ['hunt-prep']], 'Configure action is not a page of Hunt prep');
    wm.close('configure-action');
    ok(wm.pageIn('hunt-prep') === null && wm.isOpen('hunt-prep'), 'closing the page closed Hunt prep');
  });
  t('W21 one gold plate per window: a confirmation, then the window\'s own, then the coach\'s', () => {
    const g = (zone, shown = true) => ({ zone, shown });
    eq(WH.pickGold([g('body'), g('body')]), 0, 'two of the window\'s own: the first');
    eq(WH.pickGold([g('coach'), g('body')]), 1, 'the coach took the window\'s gold');
    eq(WH.pickGold([g('body'), g('coach'), g('confirm')]), 2, 'a pending confirmation is not the gold');
    eq(WH.pickGold([g('confirm', false), g('body', false), g('coach')]), 2, 'a hidden plate kept the gold');
    eq(WH.pickGold([g('body', false)]), -1, 'nothing shows, nothing is gold');
  });

  /* ── H: the HUD contract ── */
  const hudOf = (store, cls, hunt) => HUD.createHud({ widgets: SPEC_WIDGETS, sizeClass: () => cls.v, store, inHunt: () => !!(hunt && hunt.v) });
  t('H1 defaults per size class come from the row and its phone block', () => {
    const cls = { v: 'desktop' };
    const hud = hudOf(memStore(), cls);
    eq(hud.layoutOf('vitals'), { anchor: 'bc', dx: 0, dy: 100, opacity: 1, visible: true, folded: false }, 'desktop defaults');
    cls.v = 'phone'; hud.reload();
    eq(hud.layoutOf('vitals'), { anchor: 'tl', dx: 6, dy: 62, opacity: 1, visible: true, folded: false }, 'phone overrides');
    eq(hud.layoutOf('analyzer').visible, false, 'phone visible:false');
    ok(!hud.isShown('chat'), 'a default-hidden widget starts hidden');
  });
  t('H2 show/hide and opacity persist per size class', () => {
    const store = memStore();
    const cls = { v: 'desktop' };
    const hud = hudOf(store, cls);
    ok(hud.setVisible('vitals', false), 'vitals can hide');
    ok(hud.setOpacity('analyzer', 0.1), 'opacity accepts a number');
    eq(hud.layoutOf('analyzer').opacity, 0.4, 'opacity is clamped to 40%');
    hud.setOpacity('analyzer', 3);
    eq(hud.layoutOf('analyzer').opacity, 1, 'and to 100%');
    hud.setOpacity('analyzer', 0.7);
    eq(store.peek(), { desktop: { vitals: { visible: false }, analyzer: { opacity: 0.7 } } }, 'only the changes are saved, under desktop');
    cls.v = 'phone'; hud.reload();
    ok(hud.layoutOf('vitals').visible, 'the phone layout is untouched by the desktop one');
    hud.setVisible('chat', true);
    eq(Object.keys(store.peek()).sort(), ['desktop', 'phone'], 'each class saved under its own key');
    const again = hudOf(store, { v: 'desktop' });
    ok(!again.layoutOf('vitals').visible && again.layoutOf('analyzer').opacity === 0.7, 'a reload reads the saved desktop layout');
  });
  t('H3 the launchers can never be hidden', () => {
    const store = memStore({ desktop: { launchers: { visible: false } } });
    const hud = hudOf(store, { v: 'desktop' });
    ok(hud.layoutOf('launchers').visible, 'a saved hide is ignored');
    ok(hud.setVisible('launchers', false) === false && hud.isShown('launchers'), 'setVisible refuses');
  });
  t('H4 Reset layout restores defaults for this class only', () => {
    const store = memStore({ desktop: { vitals: { visible: false } }, phone: { vitals: { opacity: 0.5 } } });
    const hud = hudOf(store, { v: 'desktop' });
    ok(!hud.layoutOf('vitals').visible, 'starts from the saved layout');
    hud.reset();
    ok(hud.layoutOf('vitals').visible, 'reset restores the default');
    eq(store.peek(), { phone: { vitals: { opacity: 0.5 } } }, 'the phone layout survives a desktop reset');
  });
  t('H5 a garbage saved layout falls back to defaults', () => {
    const store = memStore({ desktop: { vitals: { anchor: 'zz', dx: 'x', opacity: 'a', visible: 1, folded: 'yes' } } });
    eq(hudOf(store, { v: 'desktop' }).layoutOf('vitals'), { anchor: 'bc', dx: 0, dy: 100, opacity: 1, visible: true, folded: false }, 'nothing malformed lands');
  });
  t('H6 hunt widgets show only in a hunt', () => {
    const hunt = { v: false };
    const hud = hudOf(memStore(), { v: 'desktop' }, hunt);
    ok(!hud.isShown('analyzer'), 'no analyzer in town');
    hunt.v = true;
    ok(hud.isShown('analyzer'), 'the analyzer in a hunt');
  });
  t('H7 placement honours anchor and offsets, and never leaves the box', () => {
    const box = { width: 1000, height: 600 }, size = { width: 200, height: 50 };
    eq(HUD.placeWidget({ anchor: 'tl', dx: 12, dy: 12 }, box, size), { left: 12, top: 12 }, 'tl');
    eq(HUD.placeWidget({ anchor: 'br', dx: 12, dy: 12 }, box, size), { left: 788, top: 538 }, 'br');
    eq(HUD.placeWidget({ anchor: 'bc', dx: 0, dy: 100 }, box, size), { left: 400, top: 450 }, 'bc');
    eq(HUD.placeWidget({ anchor: 'mc', dx: 0, dy: 0 }, box, size), { left: 400, top: 275 }, 'mc');
    eq(HUD.placeWidget({ anchor: 'tc', dx: 0, dy: 0 }, { width: 150, height: 600 }, size), { left: 0, top: 0 }, 'too wide pins left');
  });
  t('H9 a docked bottom bar of height h moves the World inset by h ', () => {
    const box = { width: 1000, height: 600 };
    const bar = (h) => ({ anchor: 'bc', rect: { left: 300, top: 600 - 8 - h, width: 400, height: h } });
    const a = HUD.hudInsetOf([bar(82)], box, 0), b = HUD.hudInsetOf([bar(122)], box, 0);
    eq(a.bottom, 90, 'the bar and its 8 px offset are covered');
    eq(b.bottom - a.bottom, 40, 'a 40 px taller bar moves the inset by 40');
    eq(HUD.hudInsetOf([], box, 0), { left: 0, right: 0, top: 0, bottom: 0 }, 'no widget, no inset');
    const all = HUD.hudInsetOf([bar(82), { anchor: 'tc', rect: { left: 400, top: 8, width: 200, height: 40 } },
      { anchor: 'tl', rect: { left: 12, top: 12, width: 250, height: 200 } }, { anchor: 'tr', rect: { left: 700, top: 12, width: 260, height: 300 } }], box);
    eq(all, { left: 262, right: 300, top: 48, bottom: 90 }, 'top bar, party, analyzer');
    /* The phone (922x381 World): the hunt bar is anchored top-right but is a bar, and the party panel the
       action bar pushed below it is off the World; the camera framed the hero in a 144 px strip. */
    const phone = HUD.hudInsetOf([{ anchor: 'bc', rect: { left: 45, top: 279, width: 832, height: 91 } },
      { anchor: 'tr', rect: { left: 388, top: 4, width: 530, height: 42 } }, { anchor: 'tl', rect: { left: 4, top: 382, width: 240, height: 388 } }], { width: 922, height: 381 });
    eq(phone, { left: 0, right: 0, top: 46, bottom: 102 }, 'a top-corner bar covers the top; a panel off the World covers nothing');
  });
  t('H10 a centred widget never overlaps an edge widget: it moves along its row, else they step below it', () => {
    const party = { left: 12, top: 12, width: 258, height: 250 }, an = { left: 720, top: 12, width: 285, height: 550 };
    const over = (a, q) => a.left < q.left + q.width && a.left + a.width > q.left && a.top < q.top + q.height && a.top + a.height > q.top;
    /* room in the row: it slides clear, nothing is pushed */
    let r = { left: 400, top: 8, width: 300, height: 40 };
    let at = HUD.clearOfEdges(r, [party, an], 1200, 12);
    ok(!at.push.length && !over(Object.assign({}, r, { left: at.left }), party) && !over(Object.assign({}, r, { left: at.left }), an), 'a bar with room must slide clear: ' + JSON.stringify(at));
    /* 1440x900 with a window docked (Tyler 10-19): no left clears both; the one it still hits steps below it */
    r = { left: 280, top: 8, width: 450, height: 40 };
    at = HUD.clearOfEdges(r, [party, an], 1010, 12);
    const placed = Object.assign({}, r, { left: at.left });
    const moved = [party, an].map((q, i) => { const p = at.push.find((x) => x.i === i); return p ? Object.assign({}, q, { top: p.top }) : q; });
    ok(moved.every((q) => !over(placed, q)), 'the bar still overlaps an edge widget: ' + JSON.stringify(at));
    eq(at.push.map((p) => p.i), [1], 'only the analyzer (the one nearest the centre spot) steps down');
    /* a widget the player moved (pinned) is in no bar's row: the bar never slides for it and never pushes it */
    const pinned = HUD.clearOfEdges(r, [party, Object.assign({ pinned: true }, an)], 1010, 12);
    ok(!pinned.push.some((p) => p.i === 1), 'a moved widget must never be pushed: ' + JSON.stringify(pinned));
    const bar = { left: 700, top: 8, width: 300, height: 40 };
    eq(HUD.clearOfEdges(bar, [party, Object.assign({ pinned: true }, an)], 1440, 12), { left: 700, push: [] }, 'the bar must not slide away from a moved widget');
  });
  t('H11 a docked window never covers a right-anchored widget: it slides left of the dock, else waits hidden (r11)', () => {
    const over = (a, q) => a.left < q.left + q.width && a.left + a.width > q.left && a.top < q.top + q.height && a.top + a.height > q.top;
    const an = { left: 1143, top: 12, width: 285, height: 300 }, party = { left: 12, top: 12, width: 258, height: 250 };
    const chat = { left: 1028, top: 12, width: 400, height: 600 };
    eq(HUD.clearOfDock(an, [], [party], 12), an.left, 'no dock, no move');
    eq(HUD.clearOfDock(an, [{ left: 1028, top: 700, width: 400, height: 100 }], [party], 12), an.left, 'a window below its row moves nothing');
    const x = HUD.clearOfDock(an, [chat], [party], 12);
    ok(x !== null && !over(Object.assign({}, an, { left: x }), chat) && !over(Object.assign({}, an, { left: x }), party), 'the analyzer must clear the chat and the party: ' + x);
    eq(x, 1028 - 12 - 285, 'it sits right beside the dock');
    /* a dock and a party that leave no room: it waits hidden rather than sit under a window */
    eq(HUD.clearOfDock(an, [{ left: 400, top: 0, width: 1040, height: 900 }], [party], 12), null, 'no room left: null');
    /* never onto the hero: the stage (the centre of the inset's frame) is an obstacle like a window */
    const stage = HUD.stageOf({ left: 270, right: 297, top: 48, bottom: 195 }, { width: 1440, height: 900 });
    eq([stage.left + stage.width / 2, stage.top + stage.height / 2], [706.5, 376.5].map(Math.round), 'the stage sits at the centre of the uncovered frame');
    const wide = { left: 868, top: 12, width: 560, height: 700 };
    eq(HUD.clearOfDock(an, [wide], [party], 12, [stage]), null, 'no room right of the middle at 1440: it waits hidden, never crosses the fight');
    const wideBox = HUD.stageOf({ left: 270, right: 297, top: 48, bottom: 195 }, { width: 1920, height: 1080 });
    const an2 = { left: 1623, top: 12, width: 285, height: 300 };
    const z = HUD.clearOfDock(an2, [{ left: 1508, top: 12, width: 400, height: 600 }], [party], 12, [wideBox]);
    ok(z !== null && !over(Object.assign({}, an2, { left: z }), wideBox), 'at 1920 the analyzer sits beside the chat, clear of the middle: ' + z);
    /* the centred pass clears the dock too, and never pushes a window */
    const at = HUD.clearOfEdges({ left: 900, top: 8, width: 300, height: 40 }, [party], 1440, 12, [chat]);
    ok(!over({ left: at.left, top: 8, width: 300, height: 40 }, chat) && at.push.every((p) => p.i < 1), 'the top bar must clear the dock: ' + JSON.stringify(at));
  });
  t('H12 a stacking widget sits under the ones it names on its edge, and only when it would overlap them', () => {
    const over = (a, q) => a.left < q.left + q.width && a.left + a.width > q.left && a.top < q.top + q.height && a.top + a.height > q.top;
    /* v0.2.37 run 40020854780 (HS-13): the tally at the right edge ran under a tall analyzer */
    const an = { left: 1143, top: 12, width: 285, height: 420 }, bar = { left: 1000, top: 4, width: 430, height: 42 };
    const tally = { left: 1248, top: 12, width: 180, height: 90 };
    const top = HUD.stackBelow(tally, [an], 12);
    eq(top, 12 + 420 + 12, 'it sits one gap under the analyzer');
    ok(!over(Object.assign({}, tally, { top }), an), 'it still overlaps the analyzer at ' + top);
    eq(HUD.stackBelow(tally, [{ left: 1143, top: 12, width: 0, height: 0 }], 12), 12, 'a hidden widget is in nobody\'s way');
    eq(HUD.stackBelow(tally, [{ left: 12, top: 12, width: 258, height: 250 }], 12), 12, 'a widget across the screen moves nothing');
    eq(HUD.stackBelow(tally, [{ left: 1143, top: 60, width: 285, height: 100 }], 12), 172, 'one lower down on its edge, overlapping it, still sends it under');
    eq(HUD.stackBelow({ left: 1248, top: 12, width: 180, height: 90 }, [{ left: 1143, top: 400, width: 285, height: 100 }], 12), 12, 'one below it moves nothing');
    eq(HUD.stackBelow(tally, [bar, Object.assign({}, an, { top: 50 })], 12), 50 + 420 + 12, 'under every one it names, in any order');
    let threw = false;
    try { HUD.validateWidgetRows([W({ below: ['nobody'] })]); } catch { threw = true; }
    ok(threw, 'a `below` naming no widget must be refused');
  });
  /* H13 THE STACK ALWAYS ENDS (Andy, live v0.2.38: Chrome's "Page Unresponsive" at a party start and on a hero
     switch). The browser's rects are fractional (the analyzer is min(560px, 100vh - 200px) or its rows, on a
     scaled display a 1/64 px LayoutUnit): a bottom of 581.40625 was rounded back to 581, still above it, and
     the loop moved there for ever. Run out of this thread with a deadline, so a spin is a red, not a hung run. */
  await (async () => {
    const id = 'H13 a widget stacks under a fractional bottom in bounded time, and never under it';
    try {
      const an = { left: 1143, top: 12, width: 285 }, tally = { left: 1248, top: 12, width: 180, height: 90 };
      const cases = [];
      for (let k = 1; k < 64; k++) cases.push({ r: tally, above: [Object.assign({ height: 557 + k / 64 }, an)], gap: 12 });
      /* under the hunt bar and the analyzer at once, both fractional, in either order */
      const bar = { left: 1000, top: 4.4, width: 430, height: 41.2 }, tall = Object.assign({ height: 420.3 }, an, { top: 40.1 });
      cases.push({ r: tally, above: [bar, tall], gap: 12 }, { r: tally, above: [tall, bar], gap: 12 });
      /* MOVED AND FOLDED (Tyler 2026-10-25): a folded analyzer is its title row (a fractional ~43 px), and a moved one
         lands anywhere at a fractional px, on the tally's column or across it; both end, under every bottom they cross */
      for (let k = 1; k < 64; k += 7) {
        cases.push({ r: tally, above: [Object.assign({ height: 43 + k / 64 }, an)], gap: 12 });
        cases.push({ r: tally, above: [{ left: 1200.5 + k / 64, top: 20 + k / 3, width: 285.25, height: 43 + k / 64 }, bar], gap: 12 });
      }
      const got = await stackBelowOffThread(mods.HUD_URL, cases, 3000);
      if (got === null) throw new Error('stackBelow never returned within 3 s for a fractional bottom (the loop spins: the page hangs)');
      cases.forEach((c, i) => {
        const bottom = Math.max(...c.above.map((q) => q.top + q.height + c.gap));
        ok(Number.isInteger(got[i]) && got[i] >= bottom && got[i] < bottom + 1,
          'case ' + i + ': under a bottom of ' + bottom + ' it sits at ' + got[i] + ' (want the whole px at or just below it, never over the rect)');
      });
    } catch (e) { fails.push(id + ': ' + e.message); }
  })();
  /* H14 MOVE (Tyler 2026-10-25): a drop is kept as offsets from the nearest corner, comes back after a reload, sits on
     screen at every size (1440x900, the phones' 844x390 and 667x375), and Put back returns it; another size class is
     untouched. The World boxes are the play page's at those sizes (the strip takes the top). */
  t('H14 a moved widget is kept from its corner, comes back after a reload, and stays on screen at every size', () => {
    const store = memStore();
    const hud = hudOf(store, { v: 'desktop' });
    const big = { width: 1440, height: 860 }, size = { width: 290, height: 420 };
    ok(!hud.isMoved('analyzer'), 'a fresh widget is not moved');
    const at = HUD.placeFrom({ left: 12, top: 860 - 420 - 30, width: 290, height: 420 }, big);
    eq(at, { anchor: 'bl', dx: 12, dy: 30 }, 'a drop at the bottom-left keeps the bottom-left corner');
    eq(HUD.placeFrom({ left: -500, top: -500, width: 290, height: 120 }, big), { anchor: 'tl', dx: 0, dy: 0 }, 'a drop past the top-left corner is kept at that corner');
    eq(HUD.placeFrom({ left: 9999, top: 9999, width: 290, height: 120 }, big), { anchor: 'br', dx: 0, dy: 0 }, 'a drop past the bottom-right corner is kept at that corner');
    ok(hud.setPlace('analyzer', at), 'the drop is kept');
    ok(hud.isMoved('analyzer'), 'and it is moved');
    eq(store.peek(), { desktop: { analyzer: { anchor: 'bl', dx: 12, dy: 30 } } }, 'only the place is saved, under desktop');
    eq(HUD.placeWidget(hud.layoutOf('analyzer'), big, size, true), { left: 12, top: 410 }, 'placed back on the px it was dropped on');
    const again = hudOf(store, { v: 'desktop' });
    eq([again.layoutOf('analyzer').anchor, again.layoutOf('analyzer').dx, again.layoutOf('analyzer').dy, again.isMoved('analyzer')], ['bl', 12, 30, true], 'a reload reads it back');
    for (const [w, h] of [[1440, 860], [844, 350], [667, 335]]) {
      /* the analyzer is at most the World less 200 px tall (hunt.css), so it fits every box it is dropped in */
      const box = { width: w, height: h }, sz = { width: 290, height: Math.min(420, h - 200) };
      const p = HUD.placeWidget(again.layoutOf('analyzer'), box, sz, true);
      ok(p.left === 12 && p.top >= 0 && p.top + sz.height === h - 30, w + 'x' + h + ': the bottom-left drop must stay 12 px in and 30 px up: ' + JSON.stringify(p));
      for (const drop of [{ left: -500, top: -500 }, { left: 9999, top: 9999 }, { left: w / 2, top: h / 2 }]) {
        const q = HUD.placeWidget(HUD.placeFrom(Object.assign({}, drop, sz), box), box, sz, true);
        ok(q.left >= 0 && q.top >= 0 && q.left + sz.width <= w && q.top + sz.height <= h, w + 'x' + h + ': a drop at ' + JSON.stringify(drop) + ' left the screen: ' + JSON.stringify(q));
      }
      eq(HUD.placeWidget({ anchor: 'bl', dx: 12, dy: 30 }, box, { width: 290, height: h + 50 }, true).top, 0, w + 'x' + h + ': a widget taller than the World pins to its top');
      const forged = HUD.placeWidget({ anchor: 'br', dx: -4096, dy: 4096 }, box, { width: 180, height: 90 }, true);
      ok(forged.left >= 0 && forged.top >= 0 && forged.left + 180 <= w && forged.top + 90 <= h, w + 'x' + h + ': a forged offset left the screen: ' + JSON.stringify(forged));
    }
    eq(HUD.placeWidget({ anchor: 'tr', dx: 12, dy: 12 }, { width: 600, height: 200 }, { width: 290, height: 420 }), { left: 298, top: 12 }, 'an unmoved widget is placed exactly as before');
    again.setPlace('chat', HUD.placeFrom({ left: 700, top: 300, width: 180, height: 90 }, big));
    eq(store.peek().desktop.chat, { anchor: 'tr', dx: 560, dy: 300 }, 'past the middle a drop keeps the right edge');
    ok(again.putBack('analyzer') && !again.isMoved('analyzer'), 'Put back returns it to its own place');
    ok(!('analyzer' in store.peek().desktop), 'and saves nothing for it');
    const phone = hudOf(store, { v: 'phone' });
    ok(!phone.isMoved('chat'), 'the phone layout is untouched by a desktop drop');
    again.reset();
    ok(!again.isMoved('chat'), 'Reset layout puts every widget back');
  });
  t('H15 a folded widget stays folded after a reload; the fold rides the residue bound', () => {
    const store = memStore();
    const hud = hudOf(store, { v: 'desktop' });
    ok(hud.setFolded('analyzer', true) && hud.layoutOf('analyzer').folded, 'the fold is set');
    eq(store.peek(), { desktop: { analyzer: { folded: true } } }, 'only the fold is saved');
    ok(!hud.isMoved('analyzer'), 'a fold is not a move');
    ok(hudOf(store, { v: 'desktop' }).layoutOf('analyzer').folded === true, 'a reload keeps it folded');
    eq(CS.sanitizeResidueField('hudLayout', store.peek()), store.peek(), 'the fold survives the residue bound');
    eq(CS.sanitizeResidueField('hudLayout', { desktop: { analyzer: { folded: 'yes', anchor: 'bl', dx: 12, dy: 30 } } }), { desktop: { analyzer: { anchor: 'bl', dx: 12, dy: 30 } } }, 'a forged fold is dropped, a place is kept');
    hud.setFolded('analyzer', false);
    eq(store.peek(), {}, 'opened again, nothing is saved');
  });
  /* H16 ROOM FOR THE STACK (v0.2.46: the 170 px desktop bar pushed the Tally, stacked under a full analyzer, off the
     World at 1440x900): the analyzer may take the height that leaves the tally one gap above the bar, read from its
     top and never its height (one pass settles it), and never under 160 px. */
  t('H16 a widget others stack under leaves them room above the bottom bar', () => {
    const an = { left: 1119, top: 12, width: 290, height: 560 }, tally = { left: 1218, top: 584, width: 191, height: 143 };
    const bar = { left: 93, top: 646, width: 1235, height: 170 };
    const room = HUD.stackRoom(an, tally, [bar], 833, 12);
    eq(room, 646 - 12 - 143 - 12 - 12, 'the analyzer ends where the tally under it ends one gap above the bar');
    ok(an.top + room + 12 + tally.height <= bar.top - 12, 'the tally under it would still cross the bar: ' + room);
    eq(HUD.stackRoom(Object.assign({}, an, { height: 300 }), tally, [bar], 833, 12), room, 'the room reads no height of its own (one pass settles it)');
    eq(HUD.stackRoom(an, tally, [], 833, 12), 833 - 12 - 143 - 12 - 12, 'no bar under the column: the World\'s foot is the floor');
    eq(HUD.stackRoom(an, Object.assign({}, tally, { left: 12 }), [bar], 833, 12), null, 'a widget across the screen asks for no room');
    eq(HUD.stackRoom(an, Object.assign({}, tally, { width: 0, height: 0 }), [bar], 833, 12), null, 'a quiet tally asks for no room');
    eq(HUD.stackRoom(an, Object.assign({}, tally, { height: 480 }), [bar], 833, 12), null, 'under 160 px the analyzer stays readable and the tally steps below');
  });
  t('H8 the contract is validated', () => {
    const bad = [W({ anchor: 'xx' }), W({ layer: 'sky' }), W({ opacity: 0.2 }), W({ when: 'night' }), W({ removable: false, visible: false }), W({ phone: { min: [1, 1] } })];
    for (const r of bad) { let threw = false; try { HUD.validateWidgetRows([r]); } catch (e) { threw = true; } ok(threw, 'must refuse ' + JSON.stringify(r)); }
  });

  /* ── R: the residue field ── */
  t('R1 hudLayout is an allowlisted residue field, bounded both ways', () => {
    ok(CS.RESIDUE_FIELDS.includes('hudLayout'), 'hudLayout must be in RESIDUE_FIELDS');
    const forged = {
      desktop: { vitals: { opacity: 0.01, dx: 1e9, anchor: 'q', visible: 'yes', gold: 5 }, 'BAD ID': { visible: false } },
      gold: 9, phone: [1],
    };
    eq(CS.sanitizeResidueField('hudLayout', forged), { desktop: { vitals: { dx: 4096, opacity: 0.4 } } }, 'a forged bag is shaped and clamped');
    eq(CS.residueOf({ hudLayout: { phone: { log: { visible: false } } }, gold: 1 }), { hudLayout: { phone: { log: { visible: false } } } }, 'a clean bag arrives verbatim, and only the allowlist');
    const many = { desktop: {} };
    for (let i = 0; i < 500; i++) many.desktop['w' + i] = { visible: false };
    ok(Object.keys(CS.sanitizeResidueField('hudLayout', many).desktop).length <= 48, 'the widget count is bounded');
  });
  t("R2 the residue round-trip: the HUD writes its character's hudLayout through setResidue", () => {
    const character = { record: { residue: {} }, writes: [], setResidue(f, v) { this.writes.push([f, v]); this.record = { residue: { [f]: v } }; return true; } };
    const hud = HUD.createHud({ widgets: SPEC_WIDGETS, sizeClass: () => 'desktop', store: HUD.residueStore(character) });
    hud.setVisible('vitals', false);
    eq(character.writes, [['hudLayout', { desktop: { vitals: { visible: false } } }]], 'the HUD writes hudLayout on its own character, once');
    eq(HUD.residueStore(character).read(), { desktop: { vitals: { visible: false } } }, 'and reads it back from that character');
    eq(CS.sanitizeResidueField('hudLayout', character.writes[0][1]), character.writes[0][1], 'what the HUD writes survives the bound unchanged');
    /* a one-press change (a fold, a drop) is put at once, so a reload right after it keeps it; a slider keeps the debounce */
    character.flushes = 0; character.flushResidue = function () { this.flushes++; return Promise.resolve(true); };
    hud.setOpacity('vitals', 0.5);
    eq(character.flushes, 0, 'an opacity slider step waits for the debounce');
    hud.setFolded('vitals', true);
    hud.setPlace('vitals', { anchor: 'tl', dx: 40, dy: 40 });
    eq(character.flushes, 2, 'a fold and a drop are each put at once');
  });

  /* ── W15, H12, R4: the chat's corner and size (Tyler 2026-10-22), the docked window above the bar ── */
  t('W15 a home-bl window opens floating at the bottom-left, keeps its size, and the phone keeps its sheet', () => {
    const rows = [{ id: 'chat', label: 'Chat', key: 'enter', width: 400, height: 280, home: 'bl', resizable: true }, { id: 'bag', label: 'Bag', key: 'b', width: 400 }];
    const at = (wm, id) => wm.layout().find((e) => e.id === id);
    let saved = null;
    const { wm, env } = harness(WM, { windows: rows, sizeOf: (id) => (id === 'chat' ? saved : null) });
    wm.open('chat'); wm.open('bag');
    const c = at(wm, 'chat');
    eq([c.docked, c.x, c.bottom, c.width, c.height], [false, WM.DOCK_EDGE, WM.HOME_BOTTOM, 400, 280], 'the chat floats at the bottom-left at its row size');
    eq(at(wm, 'bag').right, WM.DOCK_EDGE, 'the chat takes no dock slot: the bag docks at the edge');
    eq(wm.setSize('chat', { w: 480, h: 340 }), { w: 480, h: 340 }, 'the grip sets the size');
    eq([at(wm, 'chat').width, at(wm, 'chat').height, at(wm, 'chat').bottom], [480, 340, WM.HOME_BOTTOM], 'it grows from its corner');
    eq(wm.setSize('chat', { w: 9999, h: 9999 }), { w: env.width - 2 * WM.DOCK_EDGE, h: env.height - WM.HOME_BOTTOM - WM.DOCK_EDGE }, 'never past the World');
    eq(wm.setSize('chat', { w: 1, h: 1 }), { w: WM.RESIZE_MIN.w, h: WM.RESIZE_MIN.h }, 'never under its minimum');
    eq(wm.setSize('bag', { w: 500, h: 500 }), null, 'a row that is not resizable has no size to set');
    wm.close('chat'); saved = { w: 520, h: 300 };
    wm.open('chat');
    eq([at(wm, 'chat').bottom, at(wm, 'chat').width, at(wm, 'chat').height], [WM.HOME_BOTTOM, 520, 300], 'a reopen (a reload) is home again at the saved size');
    wm.float('chat', { x: 300, y: 200 });
    wm.setSize('chat', { w: 520, h: 360 }, true);
    eq([at(wm, 'chat').x, at(wm, 'chat').y, at(wm, 'chat').bottom], [300, 140, undefined], 'dragged off home, a taller window grows up from its bottom edge');
    env.phone = true; wm.resize(); wm.open('chat');
    const p = at(wm, 'chat');
    eq([p.docked, p.width, p.height, p.bottom], [true, null, null, undefined], 'the phone: the sheet, its own size');
    eq(wm.setSize('chat', { w: 500, h: 500 }), null, 'the phone has no grip');
    for (const bad of [{ home: 'tr', height: 200 }, { home: 'bl' }, { resizable: true }, { resizable: true, height: 200, modal: true }]) {
      let threw = false;
      try { WM.validateWindowRows([Object.assign({ id: 'x', label: 'X', key: 'x', width: 300 }, bad)]); } catch (e) { threw = true; }
      ok(threw, 'must refuse ' + JSON.stringify(bad));
    }
  });
  t('H12 a docked window whose column crosses the bottom bar ends above it; elsewhere it is not capped', () => {
    const bar = { left: 470, top: 820, width: 500, height: 64 };
    eq(HUD.dockCap({ left: 888, top: 12, width: 540, height: 600 }, [bar], 12), 820 - 12 - 12, 'over the bar: it ends 12 px above it');
    eq(HUD.dockCap({ left: 1000, top: 12, width: 428, height: 600 }, [bar], 12), null, 'clear of the bar: no cap');
    eq(HUD.dockCap({ left: 888, top: 12, width: 540, height: 600 }, [{ left: 470, top: 150, width: 500, height: 64 }], 12), null, 'a cap shorter than a usable window: none (the bar clears it)');
    eq(HUD.dockCap({ left: 888, top: 12, width: 540, height: 600 }, [], 12), null, 'no bar, no cap');
    /* the home window (Chat, bottom-left): over the bar's column it stands above the bar; clear of it, at home */
    eq(HUD.homeAboveBar({ left: 12, width: 400 }, [Object.assign({}, bar, { left: 235, width: 970 })], 12, 44, 900), { bottom: 900 - 820 + 12, max: 820 - 24 }, 'at 1440 the chat stands 12 px above the bar');
    eq(HUD.homeAboveBar({ left: 12, width: 400 }, [Object.assign({}, bar, { left: 475 })], 12, 44, 1080), { bottom: 44, max: null }, 'at 1920 the bar starts past it: the chat sits at home');
    /* ...and below the widgets over its column (v0.2.32 gate: a four-seat party panel, 448 px, top-left) */
    const party4 = { left: 12, top: 12, width: 250, height: 448 }, hbar = { left: 432, top: 8, width: 558, height: 46 };
    eq(HUD.homeAt({ left: 12, width: 400 }, [{ left: 229, top: 695, width: 964, height: 126 }], [party4, hbar], 12, 44, { width: 1422, height: 829 }, 160),
      { left: 12, bottom: 146, max: 211 }, 'at 1440x900 the chat shrinks to end 12 px under the panel');
    eq(HUD.homeAt({ left: 12, width: 400 }, [{ left: 70, top: 563, width: 964, height: 126 }], [party4, hbar], 12, 44, { width: 1348, height: 697 }, 160),
      { left: 274, bottom: 146, max: 485 }, 'at 1366x768 the room under the panel is too short: it slides right past the panel, not the far bar');
    eq(HUD.homeAt({ left: 12, width: 400 }, [{ left: 70, top: 563, width: 964, height: 126 }], [party4], 12, 44, { width: 600, height: 697 }, 160),
      { left: 12, bottom: 146, max: 79 }, 'no room to slide: it stays home, under the panel, however short');
    eq(HUD.homeAt({ left: 12, width: 400 }, [], [], 12, 44, { width: 1422, height: 829 }, 160), { left: 12, bottom: 44, max: null }, 'nothing near: home, uncapped');
  });
  t('R4 winSize is an allowlisted residue field, bounded both ways', () => {
    ok(CS.RESIDUE_FIELDS.includes('winSize'), 'winSize must be in RESIDUE_FIELDS');
    eq(CS.sanitizeResidueField('winSize', { chat: [480.4, 340], 'BAD ID': [1, 1], bag: [1, 2, 3], inv: ['a', 2], big: [1e9, -5] }), { chat: [480, 340], big: [4096, 120] }, 'shaped and clamped');
    eq(CS.sanitizeResidueField('winSize', [1, 2]), {}, 'not a map: nothing');
    const many = {};
    for (let i = 0; i < 100; i++) many['w' + i] = [300, 300];
    ok(Object.keys(CS.sanitizeResidueField('winSize', many)).length <= 16, 'the count is bounded');
  });
  t('R5 townZoom is an allowlisted residue field: one of the offered steps, else no pick', () => {
    ok(CS.RESIDUE_FIELDS.includes('townZoom'), 'townZoom must be in RESIDUE_FIELDS');
    eq(JSON.stringify(CS.sanitizeResidueField('townZoom', { z: 1, at: 5, x: 9 })), '{"z":1,"at":5}', 'a step and its stamp are kept, nothing else');
    eq(JSON.stringify(CS.sanitizeResidueField('townZoom', { z: 2, at: 0 })), '{"z":2,"at":0}', 'a step is kept');
    /* a bare step is no pick: it says nothing of when, and one hero's old copy would stand against the rest (report #75) */
    for (const bad of [1, 2, 0, null, {}, { z: 9, at: 1 }, { z: 1.7, at: 1 }, { z: '2', at: 1 }, { z: 2 }, { z: 2, at: -1 }, { z: 2, at: 1.5 }]) eq(CS.sanitizeResidueField('townZoom', bad), undefined, 'not a pick: ' + JSON.stringify(bad));
  });

  /* ── R3: "while you were away" (src/shell/away-recap.js, designer 2026-10-22) ── */
  t('R3 the away recap: one line of server differences on return, never on a quick reload', () => {
    const T0 = 1_800_000_000_000, H2 = 2 * 3600 * 1000;
    /* THE LEVELS ARE THE SERVER'S, BOTH OF THEM (lane/c-level-from-server): the stamp keeps the Level the server said with its
       XP (`lv`) and the return reads the envelope's `level` block. The XP here is what THIS build's curve calls Level 6 and
       Level 12, so a line worked out in the browser says "Level 6 to 12". */
    const stamp = { s: 's-1', at: T0, xp: XP.charXpForLevel(6), lv: 5, gold: 814, kills: 100 };
    const hero = (o) => Object.assign({ record: { residue: { awaySeen: stamp } }, writes: [],
      setResidue(f, v) { this.writes.push([f, v]); this.record = { residue: { [f]: v } }; return true; } }, o);
    const XP_NOW = XP.charXpForLevel(12) + 7;
    const env = (now, ended, session = 's-1') => hero({
      serverNow: () => now,
      /* state.gold is the ACCOUNT purse (2026-12-15-account-gold.sql): it moves with every hero, so the line
         reads this hero's own hunt coins (the analyzer's), never the purse. */
      read: (k) => ({ name: 'Brannoc', state: { level_xp: XP_NOW, gold: 99999 }, level: { xp: XP_NOW, level: 10, into: 7, need: 5000 },
        hunt: { session_id: session, hunt_id: 'meadowbrook_thicket', ended: !!ended, session: ended ? { end_reason: 'stamina' } : {}, hero: {}, pose: { units: [] } },
        hunt_analyzer: { hero: { kills: 644, coins: 1956 } } })[k] });
    const back = AR.awayRecapOf(env(T0 + H2));
    ok(back && back.kind === 'away' && /While you were away \(2 h 0 min\), Brannoc hunted Meadowbrook Thicket/.test(back.text)
      && /Level 5 to 10/.test(back.text) && /\+1,142 gold/.test(back.text) && !/99,185|98,185/.test(back.text) && /544 kills/.test(back.text) && /Still hunting\./.test(back.text),
      'the return line: ' + JSON.stringify(back));
    ok(back && back.id === 'away:s-1:' + T0, 'the line is shown once: its id carries the stamp ' + (back && back.id));
    ok(back && !/best find/.test(back.text), 'no loot tally, no best find: ' + JSON.stringify(back && back.text));
    /* THE AWAY CARD NAMES THE BEST FIND (designer re-read 2026-11-11): gear or a Rare from the server's loot tally, never the Bones it has most of */
    const found = env(T0 + H2); const fr = found.read;
    found.read = (k) => (k === 'hunt_analyzer' ? { hero: { kills: 644, coins: 1956, loot: { bones: 900, iron_platebody: 1 } } } : fr(k));
    const finds = AR.awayRecapOf(found);
    ok(finds && /544 kills\. Your best find this hunt was the Iron Platebody\. Still hunting\./.test(finds.text), 'the best find on the return line: ' + JSON.stringify(finds && finds.text));
    /* a stamp from a build that kept no Level says the XP and names no Levels: never a Level worked out from the stamped XP */
    const old = env(T0 + H2); old.record = { residue: { awaySeen: { s: 's-1', at: T0, xp: stamp.xp, gold: 814, kills: 100 } } };
    const oldLine = AR.awayRecapOf(old);
    ok(oldLine && !/Level \d+ to \d+/.test(oldLine.text) && /Level XP/.test(oldLine.text), 'a stamp with no Level names none: ' + JSON.stringify(oldLine && oldLine.text));
    /* an envelope with no `level` block raises no line (and no stamp): the browser never fills the Level in */
    const bare = env(T0 + H2); const br = bare.read; bare.read = (k) => (k === 'level' ? undefined : br(k));
    ok(AR.awayRecapOf(bare) === null && AR.stampAway(bare) === false, 'no Level from the server, no line and no stamp');
    const ended = AR.awayRecapOf(env(T0 + H2, true));
    ok(ended && /The hunt has ended\. Out of stamina/.test(ended.text), 'a hunt that stopped says why: ' + JSON.stringify(ended));
    /* A FRIEND'S END SAYS WHAT ENDED IT (friends' panel 2026-11-01: a leader's stamina read "left the hunt"), the server's end_by_why */
    const sentHome = (why) => { const e = env(T0 + H2, true), r = e.read; return Object.assign(e, { read: (k) => (k === 'hunt' ? { ...r(k), session: { end_reason: 'party_member_left', end_by: 'Bramwell', end_by_why: why } } : r(k)) }); };
    const tired = AR.awayRecapOf(sentHome('stamina'));
    ok(tired && /Bramwell ran out of stamina, so Brannoc came home too\./.test(tired.text), 'a friend\'s stamina on the return line: ' + JSON.stringify(tired && tired.text));
    const walked = AR.awayRecapOf(sentHome(null));
    ok(walked && /Bramwell left the hunt, so Brannoc came home too\./.test(walked.text), 'a friend who left on the return line: ' + JSON.stringify(walked && walked.text));
    /* THE RETURN SAYS WHAT NEXT (panel 2026-11-01): the stamina left, how long ago a hunt ended, the stamina rested since; never "1:1" */
    const withStamina = (cs, ms, at) => { const r = cs.read; return Object.assign(cs, { read: (k) => (k === 'stamina' ? { ms, max_ms: 43200000 } : k === 'hunt' && at ? { ...r(k), session: { ...r(k).session, ended_at: at } } : r(k)) }); };
    const going = AR.awayRecapOf(withStamina(env(T0 + H2), 3 * 3600000 + 25 * 60000));
    ok(going && /Still hunting, with 3 h 25 min of stamina left\./.test(going.text), 'a hunt still running says the stamina left: ' + JSON.stringify(going && going.text));
    const idle = AR.awayRecapOf(withStamina(env(T0 + 8 * 3600000, true), 5 * 3600000 + 46 * 60000, new Date(T0 + 8 * 3600000 - (5 * 3600000 + 46 * 60000)).toISOString()));
    ok(idle && /The hunt has ended 5 h 46 min ago\. Out of stamina, so Brannoc came home\. Stamina now: 5 h 46 min\./.test(idle.text) && !/1:1/.test(idle.text), 'a hunt that ran out while the player was away says when, and what now: ' + JSON.stringify(idle && idle.text));
    /* the hunt the player came back to is recorded once, for the coach (hunt-tutorial.js fresh_hunt, launcher.js restsNow) */
    const home = hero({ record: { residue: { coach: { read: ['x'] } } } });
    ok(AR.markBack(home, 's-1') === true && home.writes[0][0] === 'coach' && home.writes[0][1].back === 's-1' && home.writes[0][1].read[0] === 'x', 'the return is marked, the reads kept: ' + JSON.stringify(home.writes));
    home.record = { residue: { coach: { read: ['x'], back: 's-1' } } };
    ok(AR.markBack(home, 's-1') === false, 'the same return is marked once');
    eq(CS.sanitizeResidueField('coach', { back: 's-1', read: [] }), { back: 's-1' }, 'the mark survives the residue');
    eq(CS.sanitizeResidueField('coach', { back: 'x; drop' }), {}, 'a forged mark is dropped');
    ok(AR.awayRecapOf(env(T0 + 5 * 60 * 1000)) === null, 'a reload five minutes later is not an absence');
    ok(AR.awayRecapOf(env(T0 + H2, false, 's-2')) === null, 'another hunt is never compared with the old one');
    /* the stamp: written when the page is left; on screen only a new hunt's, and one per absence's length for a tab killed with no goodbye; bounded on the way in */
    const MIN = 60 * 1000;
    const cs = env(T0 + 9 * MIN);
    ok(AR.stampAway(cs) === false && cs.writes.length === 0, 'a hunt on screen does not renew a stamp 9 minutes old');
    const due = env(T0 + 10 * MIN);
    ok(AR.stampAway(due) === true && due.writes[0][0] === 'awaySeen' && due.writes[0][1].at === T0 + 10 * MIN && due.writes[0][1].gold === 1956
      && due.writes[0][1].xp === XP_NOW && due.writes[0][1].lv === 10,
      'a hunt on screen renews it at the shortest absence the line speaks of, with the server numbers (its Level too): ' + JSON.stringify(due.writes));
    const fresh = env(T0 + 1000, false, 's-2');
    ok(AR.stampAway(fresh) === true && fresh.writes[0][1].s === 's-2', 'a hunt not stamped yet is stamped at once, so a killed tab still has an answer');
    const flicker = env(T0 + 30 * 1000);
    ok(AR.stampAway(flicker, true) === false && flicker.writes.length === 0, 'leaving 30 s after the last stamp writes nothing (a page flickering in and out of view)');
    const left = env(T0 + 90 * 1000);
    ok(AR.stampAway(left, true) === true && left.writes[0][1].at === T0 + 90 * 1000, 'leaving 90 s after it writes now: ' + JSON.stringify(left.writes));
    /* A HUNT THAT ENDED IN VIEW: one last stamp with its final numbers, or the return credits what the player watched; never over a line still due */
    const endedAt = (now, end, o) => { const c = env(now, true); const r = c.read; c.read = (k) => (k === 'hunt' ? { ...r(k), session: { end_reason: 'stamina', ended_at: new Date(end).toISOString() } } : r(k)); return Object.assign(c, o); };
    const seenEnd = endedAt(T0 + 5 * MIN, T0 + 4 * MIN);
    ok(AR.stampAway(seenEnd) === true && seenEnd.writes[0][1].at === T0 + 5 * MIN, 'a hunt seen ended takes one last stamp: ' + JSON.stringify(seenEnd.writes));
    const stamped = endedAt(T0 + 6 * MIN, T0 + 4 * MIN);
    stamped.record = { residue: { awaySeen: { ...stamp, at: T0 + 5 * MIN } } };
    ok(AR.stampAway(stamped, true) === false, 'and only one: an ended hunt never writes again, however often the page is left');
    const early = endedAt(T0 + 3 * MIN, T0 + 4 * MIN);
    ok(AR.stampAway(early) === false, 'a browser clock short of the end stamps nothing: a stamp that did not pass the end would write itself again from its own listeners, for ever');
    const lineDue = endedAt(T0 + H2, T0 + H2 - 5 * MIN);
    ok(AR.stampAway(lineDue) === false, 'a stamp the return line still reads is kept: a new one would say the same hunt again');
    ok(CS.RESIDUE_FIELDS.includes('awaySeen'), 'awaySeen must be in RESIDUE_FIELDS');
    eq(CS.sanitizeResidueField('awaySeen', { s: 'x; drop', at: 1, xp: 2 }), {}, 'a forged session id is dropped');
    eq(CS.sanitizeResidueField('awaySeen', { s: 's-1', at: 5, xp: -3, gold: 9, kills: 1.5, extra: 1 }), { s: 's-1', at: 5, gold: 9 }, 'a stamp is shaped and bounded');
    eq(CS.sanitizeResidueField('awaySeen', { s: 's-1', at: 5, xp: 3, lv: 7 }), { s: 's-1', at: 5, xp: 3, lv: 7 }, 'the stamp keeps the Level the server said');
    eq(CS.sanitizeResidueField('awaySeen', { s: 's-1', at: 5, lv: 2.5 }), { s: 's-1', at: 5 }, 'and only a whole one');
    /* A HUNT OVER BEFORE THE PLAYER LEFT IS NO PART OF THE ABSENCE (crafter's panel 2026-11-01). */
    const overBefore = endedAt(T0 + H2, T0 - 5 * MIN);
    ok(AR.awayRecapOf(overBefore) === null, 'a hunt that ended before the stamp raises no line: ' + JSON.stringify(AR.awayRecapOf(overBefore)));
    /* THE CARD NEVER OUTLIVES ITS WORDS (friends' panel): what the hunt does now is the record's; a hunt that ends with the card up takes the card. */
    const up = AR.awayRecapOf(withStamina(env(T0 + H2), 3 * 3600000));
    ok(AR.awayLineNow(withStamina(env(T0 + H2), 2 * 3600000), up) === up.said + ' Still hunting, with 2 h 0 min of stamina left.', 'the stamina is the record\'s now');
    ok(AR.awayLineNow(env(T0 + H2, true), up) === null && AR.awayLineNow(env(T0 + H2, false, 's-2'), up) === null, 'the hunt over, or another one open: the card goes');
    const upEnded = AR.awayRecapOf(env(T0 + H2, true));
    ok(typeof AR.awayLineNow(env(T0 + H2, true), upEnded) === 'string', 'a card about a hunt that ended while away stays');
  });
  /* A NEW HERO'S FIRST RETURN (designer 2026-11-10, the first ten minutes): its first away line speaks after 3 minutes, every later one after 10. */
  t('R3e a new hero\'s first away line speaks after 3 minutes away, and only on its first return', () => {
    const T0 = 1_800_000_000_000, MIN = 60 * 1000;
    const stamp = { s: 's-1', at: T0, xp: XP.charXpForLevel(3), lv: 3, gold: 10, kills: 30 };
    const hero = (now, coach, xpNow = XP.charXpForLevel(4) + 5, was = stamp) => ({ record: { residue: Object.assign({ awaySeen: was }, coach ? { coach } : {}) }, writes: [],
      setResidue(f, v) { this.writes.push([f, v]); return true; }, serverNow: () => now,
      read: (k) => ({ name: 'Odalys', state: { level_xp: xpNow }, level: { xp: xpNow, level: XP.charLevelFromXp(xpNow), into: 0, need: 1 }, hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended: false, session: {}, hero: {}, pose: { units: [] } },
        hunt_analyzer: { hero: { kills: 70, coins: 40 } } })[k] });
    eq(AR.FIRST_AWAY_MIN_MS, 3 * MIN, 'the first return speaks from three minutes');
    ok(AR.awayRecapOf(hero(T0 + 3 * MIN - 1000)) === null, 'under three minutes away is a look, not an absence');
    const first = AR.awayRecapOf(hero(T0 + 3 * MIN));
    ok(first && /^While you were away \(3 min\), Odalys hunted Mill Cellar: Level 3 to 4, /.test(first.text) && /40 kills/.test(first.text) && /\+30 gold/.test(first.text),
      'a new hero back after three minutes is told, from the server\'s numbers: ' + JSON.stringify(first && first.text));
    ok(first && first.minutes === 3 && first.levels === 1 && first.at === T0, 'the line carries its minutes, its Levels and its stamp: ' + JSON.stringify(first));
    /* the hero left at Level 4 and is back at 5: new by the STAMP's Level, not the Level it returns at */
    ok(AR.awayRecapOf(hero(T0 + 4 * MIN, null, XP.charXpForLevel(5) + 1, { ...stamp, xp: XP.charXpForLevel(4), lv: 4 })), 'left at Level 4, back at Level 5 after four minutes: told');
    ok(AR.awayRecapOf(hero(T0 + 5 * MIN, null, XP.charXpForLevel(6), { ...stamp, xp: XP.charXpForLevel(5), lv: 5 })) === null, 'a hero past the first hour keeps ten minutes');
    /* told once: the return is recorded with its stamp, the same stamp still reads its line, and every later stamp waits ten minutes */
    const home = hero(T0 + 3 * MIN);
    ok(AR.markBack(home, 's-1', T0) === true && home.writes[0][1].back === 's-1' && home.writes[0][1].backAt === T0, 'the return is recorded with the stamp it was told from: ' + JSON.stringify(home.writes));
    const told = { back: 's-1', backAt: T0 };
    ok((AR.awayRecapOf(hero(T0 + 3 * MIN, told)) || {}).id === first.id, 'judged again inside its own write, the first return says the same line');
    const later = { ...stamp, at: T0 + 20 * MIN };
    ok(AR.awayRecapOf(hero(T0 + 25 * MIN, told, undefined, later)) === null, 'a second return five minutes long says nothing');
    ok(AR.awayRecapOf(hero(T0 + 30 * MIN, told, undefined, later)), 'and speaks at ten, as ever');
    ok(AR.awayRecapOf(hero(T0 + 25 * MIN, { back: 's-0' }, undefined, later)) === null, 'a return told in an older hunt counts too');
    /* in view the stamp is renewed as often as the shortest absence the line speaks of, so a tab killed with no goodbye overstates by less than that */
    ok(AR.stampAway(hero(T0 + 2 * MIN)) === false, 'a new hero\'s stamp two minutes old is not renewed');
    ok(AR.stampAway(hero(T0 + 3 * MIN)) === true, 'at three minutes it is');
    ok(AR.stampAway(hero(T0 + 9 * MIN, told)) === false, 'after the first return, every ten minutes again');
    eq(CS.sanitizeResidueField('coach', { back: 's-1', backAt: 5 }), { back: 's-1', backAt: 5 }, 'the stamp of the return survives the residue');
    eq(CS.sanitizeResidueField('coach', { backAt: 5 }), {}, 'never without its return');
    eq(CS.sanitizeResidueField('coach', { back: 's-1', backAt: -1 }), { back: 's-1' }, 'and bounded');
  });
  t('R3b the away line for a hero working in town: what the job did, from two server answers', () => {
    const T0 = 1_800_000_000_000, H8 = 8 * 3600 * 1000, MIN = 60 * 1000;
    const iso = (ms) => new Date(ms).toISOString();
    const hero = (now, state, skills, inventory, stamp, hunt = null) => ({
      slot: 0, writes: [], record: { residue: { awaySeen: stamp } },
      setResidue(f, v) { this.writes.push([f, v]); return true; },
      serverNow: () => now,
      read: (k) => ({ name: 'Tess', state, skills, inventory, hunt })[k],
    });
    /* `sl` is the skill level the server said with `sx`; the XP is what this build's curve calls Mining 30, so a level worked
       out in the browser says "Mining 30 to 47" (lane/c-level-from-server) */
    const rock = { s: 'town:gather:copper_rock', at: T0, sx: XP.skillXpForLevel('mining', 30), sl: 26, n: 10 };
    const mining = (accrued) => ({ active_kind: 'gather', active_id: 'copper_rock', active_since: iso(T0 - H8), accrued_to: iso(accrued) });
    const paid = { mining: { xp: XP.skillXpForLevel('mining', 47), level: 47 } };
    /* a hero who has never hunted: no hunt section at all */
    const back = AR.awayRecapOf(hero(T0 + H8, mining(T0 + H8), paid, { copper_ore: 4313 }, rock));
    ok(back && back.text === 'While you were away (8 h 0 min), Tess mined the Copper Rock: +4,303 Copper Ore, Mining 26 to 47. Still mining.', 'the gathering line: ' + JSON.stringify(back && back.text));
    ok(back && back.action === 'bag' && back.session === null && back.id === 'away:town:gather:copper_rock:' + T0, 'it opens the bag and is shown once: ' + JSON.stringify(back));
    /* the first read back is from before the sign-in's settle: the line waits for the numbers */
    const unpaid = hero(T0 + H8, mining(T0), { mining: { xp: rock.sx, level: 26 } }, { copper_ore: 10 }, rock);
    ok(AR.awayRecapOf(unpaid) === null && AR.awaySettled(unpaid) === false, 'nothing is judged before the settle that pays it');
    ok(AR.stampAway(unpaid) === false, 'and the stamp is not renewed over the numbers it must compare with');
    ok(AR.awaySettled(hero(T0 + 5 * MIN, mining(T0), {}, {}, rock)) === true, 'a look under ten minutes is no absence: nothing is waited for');
    const ended = hero(T0 + H8, mining(T0 + H8), paid, { copper_ore: 4313 }, rock, { session_id: 's-old', hunt_id: 'mill_cellar', ended: true, session: { end_reason: 'left', ended_at: iso(T0 - MIN) }, hero: {}, pose: { units: [] } });
    ok(/mined the Copper Rock/.test((AR.awayRecapOf(ended) || {}).text || '') && !/hunt/i.test(AR.awayRecapOf(ended).text), 'the job, never the hunt that ended before it: ' + JSON.stringify(AR.awayRecapOf(ended)));
    /* a bench that ran out: what it made, the level, when and why it stopped */
    const saw = { s: 'town:artisan:saw_normal', at: T0, sx: XP.skillXpForLevel('crafting', 10), sl: 10, n: 0 };
    const idle = { active_kind: 'idle', active_id: null, accrued_to: iso(T0 + 50 * MIN) };
    const benched = AR.awayRecapOf(hero(T0 + 50 * MIN, idle, { crafting: { xp: XP.skillXpForLevel('crafting', 29), level: 29 } }, { normal_plank: 392 }, saw));
    ok(benched && /^While you were away \(50 min\), Tess made Normal Plank: \+392 Normal Plank, Crafting 10 to 29\. It stopped about \d+ min in: out of Normal Log\.$/.test(benched.text), 'the bench line: ' + JSON.stringify(benched && benched.text));
    /* nothing came of it: no line */
    ok(AR.awayRecapOf(hero(T0 + H8, idle, { crafting: { xp: saw.sx, level: 10 } }, {}, saw)) === null, 'a job that made nothing raises no line');
    /* the stamp: at the server's watermark, with the server's skill and bag */
    const going = hero(T0 + 11 * MIN, mining(T0 + 11 * MIN), paid, { copper_ore: 50 }, rock);
    ok(AR.stampAway(going) === true && going.writes[0][1].s === rock.s && going.writes[0][1].at === T0 + 11 * MIN && going.writes[0][1].sx === paid.mining.xp && going.writes[0][1].sl === 47 && going.writes[0][1].n === 50, 'a job is stamped as of its watermark, with the server\'s skill level: ' + JSON.stringify(going.writes));
    /* a stamp from a build that kept no level says the XP gained, never a level worked out from the stamped XP */
    const oldRock = AR.awayRecapOf(hero(T0 + H8, mining(T0 + H8), paid, { copper_ore: 4313 }, { s: rock.s, at: T0, sx: rock.sx, n: 10 }));
    ok(oldRock && !/Mining \d+ to \d+/.test(oldRock.text) && /Mining XP/.test(oldRock.text), 'a job stamp with no level names none: ' + JSON.stringify(oldRock && oldRock.text));
    const young = hero(T0 + 9 * MIN, mining(T0 + 9 * MIN), paid, { copper_ore: 50 }, rock);
    ok(AR.stampAway(young) === false, 'and renewed no oftener than a hunt');
    const stopped = hero(T0 + 3 * MIN, idle, paid, { copper_ore: 50 }, rock);
    ok(AR.stampAway(stopped) === true && stopped.writes[0][1].s === 'idle', 'a job stopped in view leaves nothing for the next return: ' + JSON.stringify(stopped.writes));
    /* the card: "Still mining" goes when the record says otherwise; a stopped job's line is history */
    ok(AR.awayLineNow(hero(T0 + H8, mining(T0 + H8), paid, {}, rock), back) === back.text, 'a job still running keeps its card');
    ok(AR.awayLineNow(hero(T0 + H8, idle, paid, {}, rock), back) === null, 'stopped since: the card goes');
    ok(typeof AR.awayLineNow(hero(T0 + 50 * MIN, idle, {}, {}, saw), benched) === 'string', 'a card about a job that stopped while away stays');
    eq(CS.sanitizeResidueField('awaySeen', { s: 'town:gather:copper_rock', at: 5, sx: 9, sl: 3, n: 1, extra: 1 }), { s: 'town:gather:copper_rock', at: 5, sx: 9, sl: 3, n: 1 }, 'a job\'s stamp survives the residue');
    eq(CS.sanitizeResidueField('awaySeen', { s: 'town:gather:x', at: 5, sx: -1, n: 1.5 }), { s: 'town:gather:x', at: 5 }, 'and is bounded');
  });

  /* THE HOOK, COUNTED (designer 2026-11-10: the funnel's three missing steps), sent from the alert centre, which sees the page go and the line come up */
  t('R6 the funnel hears a page left over an open hunt, the away line coming up and a gear find, with no name in any of them', () => {
    const T0 = 1_800_000_000_000, MIN = 60 * 1000;
    const world = (loot, ended) => {
      const env = { name: 'Odalys', state: { level_xp: XP.charXpForLevel(4) + 5 }, level: { xp: XP.charXpForLevel(4) + 5, level: 4, into: 5, need: 1 }, hunt_analyzer: { hero: { kills: 70, coins: 40 } },
        hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended: !!ended, session: ended ? { end_reason: 'left' } : {}, hero: {}, pose: { units: [] }, loot } };
      const subs = new Set(), sent = [];
      const hero = { slot: 0, env, record: { residue: { awaySeen: { s: 's-1', at: T0, xp: XP.charXpForLevel(3), lv: 3, gold: 10, kills: 30 } } },
        read: (k) => env[k], serverNow: () => T0 + 4 * MIN, flushResidue: () => Promise.resolve(),
        setResidue(f, v) { this.record = { residue: Object.assign({}, this.record.residue, { [f]: v }) }; return true; },
        subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } };
      const account = { viewed: 0, character: () => hero, characters: () => [hero], subscribe: () => () => {} };
      const centre = AL.createAlertCenter(account, { track: (name, props, scope) => sent.push([name, props, scope]), clock: () => 9.6 * MIN });
      return { hero, centre, sent, of: (n) => sent.filter((e) => e[0] === n).map((e) => e[1]), tell: () => { for (const fn of subs) fn(hero, 'changed'); } };
    };
    const w = world([]);
    /* the away line came up on the return (a new hero, four minutes away): its minutes, whether the hunt still runs, the Levels gained */
    ok(w.centre.list().some((a) => a.kind === 'away'), 'the return raised no away line: ' + JSON.stringify(w.centre.list().map((a) => a.kind)));
    eq(w.of('away_recap_shown'), [{ slot: 0, minutes: 4, still_hunting: true, levels: 1 }], 'the away line coming up is counted');
    eq(w.sent.find((e) => e[0] === 'away_recap_shown')[2], 'away:s-1:' + T0, 'once per line');
    /* a find: gear new in the open hunt's loot since this page first read it; junk is no find, and it is counted once */
    w.hero.env.hunt = Object.assign({}, w.hero.env.hunt, { loot: [{ item: 'rat_tail', count: 9 }] }); w.tell();
    eq(w.of('first_gear_found'), [], 'a rat tail is not gear');
    w.hero.env.hunt = Object.assign({}, w.hero.env.hunt, { loot: [{ item: 'rat_tail', count: 9 }, { item: 'apprentice_helmet', count: 1 }] }); w.tell(); w.tell();
    eq(w.of('first_gear_found'), [{ slot: 0, hunt: 'mill_cellar', item: 'apprentice_helmet', level: 4 }], 'a piece of gear in the hunt\'s loot is a find, told once');
    eq(w.sent.find((e) => e[0] === 'first_gear_found')[2], 'gear:0', 'once per hero');
    const had = world([{ item: 'bronze_helm', count: 1 }]);
    had.tell();
    eq(had.of('first_gear_found'), [], 'gear already in the loot when the page first read the hunt is the return\'s news, not a find');
    /* the page goes over an open hunt: hidden, then closed, each with the ground, the Level and the minutes this page was up */
    w.centre.leaving({ hidden: true }); w.centre.leaving();
    eq(w.of('left_with_hunt_running'), [{ slot: 0, hunt: 'mill_cellar', level: 4, minutes: 10, how: 'hidden' }, { slot: 0, hunt: 'mill_cellar', level: 4, minutes: 10, how: 'closed' }], 'leaving over an open hunt is counted');
    eq(w.sent.filter((e) => e[0] === 'left_with_hunt_running').map((e) => e[2]), ['left:hidden:0', 'left:closed:0'], 'once hidden and once closed, per hero');
    const over = world([], true);
    over.centre.leaving();
    eq(over.of('left_with_hunt_running'), [], 'a page left with the hunt over is not the hook');
    ok(!/Odalys/.test(JSON.stringify(w.sent)), 'an event carries the hero\'s name: ' + JSON.stringify(w.sent));
    w.centre.destroy(); had.centre.destroy(); over.centre.destroy();
  });

  /* ── R3c/R3d: what the hero did AFTER the hunt (src/shell/after-hunt.js, designer re-read 2026-11-11 #2: the second night's
     "The hunt has ended 5 h 45 min ago" said nothing of the hero idle in town, nor what would have filled the time) ── */
  const T0 = 1_800_000_000_000, MIN = 60 * 1000, H = 60 * MIN;
  const iso = (ms) => new Date(ms).toISOString();
  const END = T0 + 3 * H + 14 * MIN;                                   // the hunt ran 3 h 14 min on the server
  const idleSince = (ms) => ({ active_kind: 'idle', active_id: null, active_since: iso(ms) });
  const mining = (ms) => ({ active_kind: 'gather', active_id: 'copper_rock', active_since: iso(ms) });
  const wrenna = (now, state, reason = 'stamina', o = {}) => Object.assign({
    slot: 0, writes: [], record: { residue: { awaySeen: { s: 's-1', at: T0, xp: XP.charXpForLevel(10), lv: 10, gold: 0, kills: 0 } } },
    setResidue(f, v) { this.writes.push([f, v]); return true; },
    serverNow: () => now,
    read: (k) => ({ name: 'Wrenna', state, level: { xp: XP.charXpForLevel(11), level: 11, into: 0, need: 1 }, stamina: { ms: now - END, max_ms: 8 * H },
      hunt: { session_id: o.session || 's-1', hunt_id: 'meadowbrook_thicket', ended: o.open !== true,
        session: o.open ? {} : { end_reason: reason, ended_at: iso(END) }, hero: {}, pose: { units: [] } },
      hunt_analyzer: { hero: { kills: 900, coins: 0 } } })[k],
  }, o);
  const NOW = T0 + 9 * H;                                              // the player reopens 9 h after leaving: 5 h 46 min idle
  t('R3c the browser closed: the away card says the hero waited in town, and the one thing that would have filled it', () => {
    const night = AR.awayRecapOf(wrenna(NOW, idleSince(END + 8000)));
    ok(night && night.text.includes('The hunt has ended. Out of stamina, so Wrenna came home. Then Wrenna waited in town for 5 h 46 min. '
      + 'Start mining, chopping or fishing before you hunt, and Wrenna will go back to it when the hunt ends. Stamina now: 5 h 46 min.')
      && !/ ago\./.test(night.text), 'the second night: ' + JSON.stringify(night && night.text));
    /* the line follows the record while the card is up: the wait grows, and it is the server's clock that says so */
    ok(AR.awayLineNow(wrenna(NOW + 10 * MIN, idleSince(END + 8000)), night).includes('waited in town for 5 h 56 min'), 'the wait is the record\'s now');
    /* the server put the hero back on its gathering job at the walk home's end (active_since = ended_at + travel): it says so, no wait, no advice */
    const went = AR.awayRecapOf(wrenna(NOW, mining(END)));
    ok(went && went.text.includes('Out of stamina, so Wrenna came home. Then Wrenna went back to mining the Copper Rock.') && !/waited|Start mining/.test(went.text),
      'a resumed job: ' + JSON.stringify(went && went.text));
    /* one next thing per end reason, by the rules (hunt-sessions.js RESUME_AFTER_END) */
    const nextOf = (reason) => (AR.awayRecapOf(wrenna(NOW, idleSince(END), reason)) || {}).text || '';
    ok(nextOf('hours').includes('Set a longer hunt next time, up to the stamina you have.'), 'a set limit: ' + nextOf('hours'));
    ok(nextOf('heals_out').includes('Pack more food next time, and the hunt can run longer.'), 'out of food: ' + nextOf('heals_out'));
    ok(nextOf('ammo_out').includes('Pack more ammo next time'), 'out of ammo: ' + nextOf('ammo_out'));
    ok(nextOf('runes_out').includes('Pack more runes next time'), 'out of runes: ' + nextOf('runes_out'));
    ok(nextOf('gold_out').includes('Keep more gold on hand for the store\'s supplies, or pack your own'), 'out of gold: ' + nextOf('gold_out'));
    ok(nextOf('died').includes('Start mining, chopping or fishing before you hunt'), 'a death resumes a job too: ' + nextOf('died'));
    /* never a guess: the player's own end, a pointer moved since the end, a job started later, a state that has not said */
    ok(!/Then Wrenna/.test(nextOf('left')), 'leaving is the player\'s own choice and resumes nothing: ' + nextOf('left'));
    ok(!/Then Wrenna/.test((AR.awayRecapOf(wrenna(NOW, idleSince(END + 2 * H))) || {}).text || ''), 'idle since long after the end: something happened between');
    ok(!/Then Wrenna/.test((AR.awayRecapOf(wrenna(NOW, mining(END + 2 * H))) || {}).text || ''), 'a job started later was not a resume');
    const unsaid = (AR.awayRecapOf(wrenna(NOW, { gold: 5 })) || {}).text || '';
    ok(/The hunt has ended 5 h 46 min ago\./.test(unsaid) && !/Then Wrenna/.test(unsaid), 'no pointer from the server: the old line, nothing guessed: ' + unsaid);
  });
  t('R3d the hunt viewed: the summary card says what came after, from the server\'s pointer', () => {
    const atEnd = AH.endCardAfter(wrenna(END + MIN, idleSince(END + 8000)), 's-1');
    eq(atEnd, 'Start mining, chopping or fishing before you hunt, and Wrenna will go back to it when the hunt ends.', 'watched as it ends: the one next thing, no wait yet');
    const leftOpen = AH.endCardAfter(wrenna(END + 2 * H, idleSince(END + 8000)), 's-1');
    eq(leftOpen, 'Then Wrenna waited in town for 2 h 0 min. Start mining, chopping or fishing before you hunt, and Wrenna will go back to it when the hunt ends.', 'a page left open on the card');
    eq(AH.endCardAfter(wrenna(END + MIN, mining(END)), 's-1'), 'Then Wrenna went back to mining the Copper Rock.', 'a resumed job');
    eq(AH.endCardAfter(wrenna(END + MIN, idleSince(END), 'stamina', { session: 's-2' }), 's-1'), '', 'an older summary says nothing of today');
    eq(AH.endCardAfter(wrenna(END + MIN, idleSince(END), 'stamina', { open: true }), 's-1'), '', 'a hunt still open: nothing came after');
  });

  return fails;
}

/* H13: hud.js stackBelow over `cases` in a worker of its own; its answers, or null when it has not answered by
   `ms` (a loop that never ends must turn the test red, never hang the run). */
function stackBelowOffThread(url, cases, ms) {
  return new Promise((resolve) => {
    const w = new Worker("const { parentPort, workerData } = require('node:worker_threads');\n"
      + 'import(workerData.url).then((m) => parentPort.postMessage(workerData.cases.map((c) => m.stackBelow(c.r, c.above, c.gap))));',
    { eval: true, workerData: { url, cases } });
    const done = (v) => { clearTimeout(timer); w.terminate(); resolve(v); };
    const timer = setTimeout(() => done(null), ms);
    w.once('message', done);
    w.once('error', () => done(null));
  });
}

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  return {
    HUD_URL: u(HUD_FILE),
    SHELL_CSS: readFileSync(join(base, 'src/styles/shell.css'), 'utf8'),
    WM: await import(u(WM_FILE)),
    HUD: await import(u(HUD_FILE)),
    CS: await import(u('src/session/residue.js')),
    AR: await import(u('src/shell/away-recap.js')),
    AL: await import(u('src/shell/alerts.js')),
    AH: await import(u('src/shell/after-hunt.js')),
    XP: await import(u('src/core/xp.js')),
    WH: await import(u('src/shell/window-head.js')),
    SW: (await import(u('src/data/shell-windows.js'))).SHELL_WINDOWS,
  };
}

const WH_FILE = 'src/shell/window-head.js';
const MUTANTS = [
  /* W17-W21: one window header (lane/b-window-header) */
  { test: 'W22', file: 'src/styles/shell.css', from: '> .hs-win-title { letter-spacing: .04em; }', to: '> .hs-win-title { }' },
  { test: 'W17', file: WH_FILE, from: "    + '<button type=\"button\" class=\"hs-back\" data-hs-back=\"' + id + '\" hidden>&lsaquo; ' + esc(t('controls.back')) + '</button>'\n", to: '' },
  { test: 'W17', file: WH_FILE, from: "    + (help ? '<button type=\"button\" class=\"hs-help\"", to: "    + (false ? '<button type=\"button\" class=\"hs-help\"" },
  { test: 'W17', file: WH_FILE, from: "  const key = row.key && !row.noShortcut && !touch ?", to: '  const key = row.key ?' },
  { test: 'W17', file: 'src/data/shell-windows.js', from: "help: 'windows.help_shop', ", to: '' },
  { test: 'W17', file: WM_FILE, from: "    if (r.beside !== undefined && !(Array.isArray(r.beside) && r.beside.length && r.beside.every((x) => typeof x === 'string' && x !== r.id)))", to: '    if (false)' },
  { test: 'W18', file: WM_FILE, from: '    return occ.length && occ.every((q) => besides(id, q.id)) ? world().width - DOCK_EDGE : world().width * DOCK_MAX;', to: '    return world().width * DOCK_MAX;' },
  { test: 'W18', file: WM_FILE, from: '    return occ.length && occ.every((q) => besides(id, q.id)) ? world().width - DOCK_EDGE : world().width * DOCK_MAX;', to: '    return occ.length ? world().width - DOCK_EDGE : world().width * DOCK_MAX;' },
  { test: 'W18', file: WM_FILE, from: '    if (isOver(id)) { slot.set(id, DOCK_EDGE); return; }\n', to: '' },
  { test: 'W18', file: WM_FILE, from: ' && !leaving.has(d) && !isOver(d))', to: ' && !leaving.has(d))' },
  { test: 'W18', file: 'src/data/shell-windows.js', from: "    beside: Object.freeze(['storage', 'shop', 'character']) }", to: "    beside: Object.freeze(['storage']) }" },
  { test: 'W19', file: WM_FILE, from: '    if (by) cameFrom.set(id, by); else if (!returning) cameFrom.delete(id);', to: '    cameFrom.delete(id);' },
  { test: 'W19', file: WM_FILE, from: '    try { close(id); openWindow(to); }', to: '    try { close(id); }' },
  { test: 'W19', file: WM_FILE, from: '    returning = true;\n', to: '' },
  { test: 'W19', file: WM_FILE, from: '    return live().includes(id) && cameFrom.has(id) ? cameFrom.get(id) : null;', to: '    return null;' },
  { test: 'W20', file: WM_FILE, from: '    if (by && (rows.get(id).pageOf || []).includes(by)) {', to: '    if (false) {' },
  { test: 'W20', file: WM_FILE, from: '    pages.delete(id);   // a host takes its page with it\n', to: '' },
  { test: 'W20', file: WM_FILE, from: 'pages.has(l[l.length - 1]) ? back(l[l.length - 1]) : ', to: '' },
  { test: 'W20', file: WM_FILE, from: '    pages.delete(id);   // a host asked for one of its own tabs shows itself, not its page\n', to: '' },
  { test: 'W20', file: WM_FILE, from: '    if (host) { pages.delete(host); emit(); return true; }', to: '' },
  { test: 'W20', file: 'src/data/shell-windows.js', from: "    pageOf: Object.freeze(['hunts']) }", to: '    }' },
  { test: 'W21', file: WH_FILE, from: '    if (best < 0 || ZONE_RANK[g.zone] < ZONE_RANK[list[best].zone]) best = i;', to: '    if (best < 0) best = i;' },
  { test: 'W21', file: WH_FILE, from: '    if (!g || !g.shown || !(g.zone in ZONE_RANK)) return;', to: '    if (!g || !(g.zone in ZONE_RANK)) return;' },
  { test: 'W21', file: WH_FILE, from: "const ZONE_RANK = Object.freeze({ confirm: 0, body: 1, coach: 2 });", to: "const ZONE_RANK = Object.freeze({ confirm: 1, body: 0, coach: 2 });" },
  { test: 'W1', file: WM_FILE, from: 'export const MAX_OPEN = 3;', to: 'export const MAX_OPEN = 4;' },
  { test: 'W2', file: WM_FILE, from: 'export const DOCK_MAX = 0.6;', to: 'export const DOCK_MAX = 0.9;' },
  { test: 'W3', file: WM_FILE, from: 'for (const r of rows.values()) if (r.escape) return openWindow(r.id);', to: '' },
  { test: 'W4', file: WM_FILE, from: "if (open[open.length - 1] !== id) { open.splice(open.indexOf(id), 1); open.push(id); emit(); }", to: '' },
  { test: 'W5', file: WM_FILE, from: 'if (isPhone() && !isModal(id)) for (const other of open.slice()) drop(other);', to: '' },
  { test: 'W10b', file: WM_FILE, from: 'const isModal = (id) => rows.get(id).modal === true;', to: 'const isModal = () => false;' },
  { test: 'W10b', file: WM_FILE, from: 'y: Math.round(Math.max(0, Math.min(w.height - tall, f.y)))', to: 'y: Math.round(f.y)' },
  { test: 'W13', file: WM_FILE, from: "else Object.assign(e, { docked: true, right: slot.has(id) ? slot.get(id) : DOCK_EDGE,", to: "else Object.assign(e, { docked: true, right: DOCK_EDGE + open.slice(i + 1).filter((d) => !floating.has(d)).reduce((s, d) => s + width(d) + DOCK_GAP, 0)," },
  { test: 'W15', file: WM_FILE, from: "      } else if (!was && isHome(id)) floating.set(id, { home: true });\n", to: '      }\n' },
  { test: 'W15', file: WM_FILE, from: "    if (keepBottom && f && !f.home) f.y = Math.max(0, f.y - (now.h - before.h));", to: '' },
  { test: 'W16', file: WM_FILE, from: '    if (find) findWanted.set(id, find); else findWanted.delete(id);', to: '' },
  { test: 'W16', file: WM_FILE, from: '    findWanted.delete(id);\n', to: '' },
  { test: 'W16', file: WM_FILE, from: '    const done = tab ? openTab(id, tab) : openWindow(id);', to: '    const done = openWindow(id);' },
  { test: 'W15', file: WM_FILE, from: "      w: Math.round(Math.max(RESIZE_MIN.w, Math.min(Math.max(RESIZE_MIN.w, wd.width - 2 * DOCK_EDGE), w))),", to: '      w: Math.round(w),' },
  { test: 'H12', file: HUD_FILE, from: '  return cap >= DOCK_CAP_MIN_PX ? cap : null;', to: '  return null;' },
  { test: 'H12', file: HUD_FILE, from: "  return { bottom: Math.max(bottom, Math.round(boxHeight - top + gap)), max: Math.max(0, Math.round(top - 2 * gap)) };", to: '  return { bottom, max: null };' },
  { test: 'H12', file: HUD_FILE, from: '    if (left + pane.width > box.width - gap) break;\n    at = fit(left);', to: '    break;' },
  { test: 'H12', file: HUD_FILE, from: '    return { left, low: over.filter((q) => room(q) < minH), bottom: at.bottom, max };', to: '    return { left, low: over, bottom: at.bottom, max };' },
  { test: 'R4', file: 'src/session/residue.js', from: '  winSize: sanitizeWinSize,', to: '  winSize: (v) => v,' },
  /* H13: the v0.2.38 loop itself (rounded, moved without rising, no cap): it spins on a fractional bottom */
  { test: 'H13', file: HUD_FILE,
    from: '  for (let pass = 0, moved = true; moved && pass <= above.length; pass++) {\n    moved = false;\n    for (const q of above) {\n      if (!(q.width > 0 && q.height > 0)) continue;\n      const across = r.left < q.left + q.width && r.left + r.width > q.left;\n      const under = Math.ceil(q.top + q.height + gap);\n      if (across && top < q.top + q.height + gap && top + r.height > q.top && under > top) { top = under; moved = true; }',
    to: '  for (let moved = true; moved;) {\n    moved = false;\n    for (const q of above) {\n      if (!(q.width > 0 && q.height > 0)) continue;\n      const across = r.left < q.left + q.width && r.left + r.width > q.left;\n      if (across && top < q.top + q.height + gap && top + r.height > q.top) { top = Math.round(q.top + q.height + gap); moved = true; }' },
  /* H13: rounded but capped: it ends, a fraction of a px over the rect it stacks under */
  { test: 'H13', file: HUD_FILE, from: '      const under = Math.ceil(q.top + q.height + gap);', to: '      const under = Math.round(q.top + q.height + gap);' },
  { test: 'W13', file: WM_FILE, from: 'else if (slot.has(id)) lastAt.set(id, { right: slot.get(id) });', to: ';' },
  { test: 'W8', file: WM_FILE, from: 'return keyBelongsToField(ev.target, ev.key);', to: 'return false;' },
  { test: 'W8', file: WM_FILE, from: '  if (pressesControl(ev) && !gone(ev.target)) return true;\n', to: '' },
  { test: 'W8', file: WM_FILE, from: '  if (pressesControl(ev) && !gone(ev.target)) return true;\n', to: '  if (pressesControl(ev)) return true;\n' },
  { test: 'W8', file: 'src/utils/dom.js', from: "  if (tag === 'select') return /^Arrow/.test(String(key || ''));", to: "  if (tag === 'select') return true;" },
  { test: 'W8', file: 'src/utils/dom.js', from: '  return TEXT_TYPES.has(type);', to: '  return true;' },
  { test: 'W9', file: WM_FILE, from: 'if (reducedMotion()) { drop(id); emit(); return true; }', to: '' },
  { test: 'H2', file: HUD_FILE, from: 'const clampOpacity = (v) => Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Number(v)));', to: 'const clampOpacity = (v) => Number(v);' },
  { test: 'H3', file: HUD_FILE, from: 'if (!row.removable) L.visible = true;', to: '' },
  { test: 'H4', file: HUD_FILE, from: "for (const k of SIZE_CLASSES) if (k !== cls && isObj(all[k])) next[k] = all[k];\n    store.write(next);\n    load();", to: 'store.write({});\n    load();' },
  { test: 'H10', file: HUD_FILE, from: "return { left: Math.round(left), push: hits(left).filter(({ i }) => i < edges.length).map(({ i }) => ({ i, top: Math.round(r.top + r.height + gap) })) };", to: 'return { left: Math.round(r.left), push: [] };' },
  { test: 'H10', file: HUD_FILE, from: '.filter(({ q }) => !q.pinned && q.top < r.top + r.height', to: '.filter(({ q }) => q.top < r.top + r.height' },
  /* H16: room for the stack above the bar */
  { test: 'H16', file: HUD_FILE, from: '  const room = Math.floor((bar === null ? boxHeight : bar) - gap - s.height - gap - a.top);', to: '  const room = Math.floor((bar === null ? boxHeight : bar) - gap - a.top);' },
  { test: 'H16', file: HUD_FILE, from: '  return room >= DOCK_CAP_MIN_PX ? room : null;\n}\n\n/** The highest top', to: '  return room;\n}\n\n/** The highest top' },
  { test: 'H16', file: HUD_FILE, from: "  if (!(s.width > 0 && s.height > 0) || !(s.left < a.left + a.width && s.left + s.width > a.left)) return null;", to: '  if (!(s.width > 0 && s.height > 0)) return null;' },
  /* H14, H15: move and fold (Tyler 2026-10-25) */
  { test: 'H14', file: HUD_FILE, from: '  const top = onScreen ? Math.max(0, Math.min(y, box.height - size.height)) : y;', to: '  const top = y;' },
  { test: 'H14', file: HUD_FILE, from: "  const h = left + rect.width / 2 < box.width / 2 ? 'l' : 'r';", to: "  const h = 'r';" },
  { test: 'H14', file: HUD_FILE, from: '    if (keep) { save(true); changed(id); }', to: '    if (keep) changed(id);' },
  { test: 'H14', file: HUD_FILE, from: '    return L.anchor !== d.anchor || L.dx !== d.dx || L.dy !== d.dy;', to: '    return false;' },
  { test: 'H14', file: HUD_FILE, from: '  const left = Math.max(0, Math.min(rect.left, box.width - rect.width));', to: '  const left = rect.left;' },
  { test: 'H14', file: HUD_FILE, from: '  const top = Math.max(0, Math.min(rect.top, box.height - rect.height));', to: '  const top = rect.top;' },
  { test: 'H15', file: HUD_FILE, from: "    if (typeof saved.folded === 'boolean') L.folded = saved.folded;\n", to: '' },
  { test: 'H15', file: 'src/session/residue.js', from: "      if (typeof r.folded === 'boolean') e.folded = r.folded;\n", to: '' },
  { test: 'H11', file: HUD_FILE, from: '  if (!dock.some((q) => hit(r.left, q))) return r.left;', to: '  return r.left;' },
  { test: 'H11', file: HUD_FILE, from: '    if (stops.some((q) => hit(x, q))) return null;\n', to: '' },
  { test: 'H11', file: HUD_FILE, from: '  const row = edges.concat(fixed).map(', to: '  const row = edges.map(' },
  { test: 'H9', file: HUD_FILE, from: "if (v === 'b') out.bottom = Math.max(out.bottom, box.height - t);", to: "if (v === 'b') out.bottom = Math.max(out.bottom, 0);" },
  { test: 'H9', file: HUD_FILE, from: '    if (!(r > l && b > t)) continue;', to: '    if (!(q.width > 0 && q.height > 0)) continue;' },
  { test: 'H9', file: HUD_FILE, from: "else if (v === 't' && (h === 'c' || box.width * b < side * box.height))", to: "else if (v === 't' && h === 'c')" },
  { test: 'R1', file: 'src/session/residue.js', from: "  hudLayout: sanitizeHudLayout,", to: '  hudLayout: (v) => v,' },
  { test: 'R2', file: HUD_FILE, from: "      character.setResidue('hudLayout', next);\n", to: '' },
  { test: 'R2', file: HUD_FILE, from: "      if (now && typeof character.flushResidue === 'function') Promise.resolve(character.flushResidue()).catch(() => {});\n", to: '' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: '  if (gone < awayMinMsOf(cs, was)) return null;\n', to: '' },
  { test: 'R3e', file: 'src/shell/away-recap.js', from: '? FIRST_AWAY_MIN_MS : AWAY_MIN_MS;', to: '? AWAY_MIN_MS : AWAY_MIN_MS;' },
  { test: 'R3e', file: 'src/shell/away-recap.js', from: '  if (told && !(was && coach.back === was.s && coach.backAt === was.at)) return AWAY_MIN_MS;\n', to: '' },
  { test: 'R3e', file: 'src/shell/away-recap.js', from: 'coach.back === was.s && coach.backAt === was.at', to: 'coach.back === was.s' },
  { test: 'R3e', file: 'src/shell/away-recap.js', from: 'level >= 1 && level < NEW_HERO_BELOW ?', to: 'true ?' },
  { test: 'R3e', file: 'src/shell/away-recap.js', from: 'const level = was && Number.isSafeInteger(was.lv) && was.lv >= 1 ? was.lv : lv ? lv.level : 0;', to: 'const level = lv ? lv.level : 0;' },
  { test: 'R3e', file: 'src/shell/away-recap.js', from: 'Math.min(awayMinMsOf(cs, null), (leaving', to: 'Math.min(AWAY_MIN_MS, (leaving' },
  { test: 'R3e', file: 'src/shell/away-recap.js', from: 'backAt: Number.isSafeInteger(at) ? at : undefined', to: 'backAt: undefined' },
  { test: 'R3e', file: 'src/session/residue.js', from: '  if (out.back && Number.isSafeInteger(v.backAt) && v.backAt >= 0) out.backAt = v.backAt;\n', to: '' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: '(leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS)', to: '(leaving ? -1 : STAMP_EVERY_MS)' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: '  if (h.ended && Number.isFinite(h.endedAtMs) && h.endedAtMs <= was.at) return null;\n', to: '' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: 'if (!h || h.sessionId !== a.session || (h.ended && !a.ended)) return null;', to: 'if (!h || h.sessionId !== a.session) return null;' },
  { test: 'R3b', file: 'src/shell/away-work.js', from: 'return paid > was.at && now - paid < SETTLED_WITHIN_MS;', to: 'return true;' },
  { test: 'R3b', file: 'src/shell/away-work.js', from: "const still = !!goes && keyOf(goes) === was.s;", to: 'const still = true;' },
  { test: 'R3b', file: 'src/shell/away-work.js', from: "if (!parts.length) return null;", to: '' },
  { test: 'R3b', file: 'src/shell/away-work.js', from: "if (gained > 0) parts.push('+' + whole(gained) + ' ' + itemName(made));", to: '' },
  { test: 'R3b', file: 'src/shell/away-work.js', from: "return { s: keyOf(w), at: Math.floor(at),", to: "return { s: keyOf(w), at: Math.floor(serverNowOf(cs)) + 1,"},
  { test: 'R3b', file: 'src/shell/away-recap.js', from: 'if (isWorkStamp(was) && (!h || h.ended)) {', to: 'if (false) {' },
  { test: 'R3b', file: 'src/shell/away-recap.js', from: 'return (a.still && !(w && w.s === a.work)) || (h && !h.ended) ? null : a.text;', to: 'return a.text;' },
  { test: 'R3b', file: 'src/session/residue.js', from: "for (const k of ['xp', 'lv', 'gold', 'kills', 'sx', 'sl', 'n'])", to: "for (const k of ['xp', 'lv', 'gold', 'kills'])" },
  /* lane/c-level-from-server: the away lines' Levels are two server answers, never this build's curve over a stamped XP */
  { test: 'R3', file: 'src/session/residue.js', from: "for (const k of ['xp', 'lv', 'gold', 'kills', 'sx', 'sl', 'n'])", to: "for (const k of ['xp', 'gold', 'kills', 'sx', 'sl', 'n'])" },
  { test: 'R3', file: 'src/shell/away-recap.js', from: 'const from = Number.isSafeInteger(was.lv) && was.lv >= 1 ? was.lv : null;', to: 'const from = lv.level - 1;' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: 'xp: lv.xp, lv: lv.level,', to: 'xp: lv.xp,' },
  { test: 'R3b', file: 'src/shell/away-work.js', from: 'const from = Number.isSafeInteger(was.sl) && was.sl >= 1 ? was.sl : null;', to: 'const from = sk.level - 1;' },
  { test: 'R3b', file: 'src/shell/away-work.js', from: '{ sx: sk.xp, sl: sk.level }', to: '{ sx: sk.xp }' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: "stamina ? ' Still hunting, with ' + stamina + ' of stamina left.' : ' Still hunting.'", to: "' Still hunting.'" },
  { test: 'R3', file: 'src/shell/away-recap.js', from: "(cameHomeWords(h.endReason, h.endBy, h.endWhy, name) || STAMINA_WORDS", to: "(STAMINA_WORDS" },
  { test: 'R3', file: 'src/shell/away-recap.js', from: "|| STAMINA_WORDS[h.endReason] || (END_REASON_COPY[h.endReason] && END_REASON_COPY[h.endReason].one) || '')", to: "|| (END_REASON_COPY[h.endReason] && END_REASON_COPY[h.endReason].one) || '')" },
  { test: 'R3', file: 'src/shell/away-recap.js', from: "return r.back === session ? false :", to: "return" },
  { test: 'R3', file: 'src/shell/away-recap.js', from: "!was || !h || h.sessionId !== was.s ||", to: '!was || !h ||' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: "'away:' + h.sessionId.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 64) + ':' + was.at", to: "'away:' + h.sessionId.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 64) + ':' + now" },
  { test: 'R3', file: 'src/shell/away-recap.js', from: 'if (was && was.s === next.s && next.at - was.at < Math.min(awayMinMsOf(cs, null), (leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS))) return false;', to: '' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: '(leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS)', to: 'STAMP_EVERY_MS' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: '(leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS)', to: 'LEAVE_EVERY_MS' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: '!(was.at < h.endedAtMs && next.at >= h.endedAtMs)', to: '!(next.at >= h.endedAtMs)' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: '!(was.at < h.endedAtMs && next.at >= h.endedAtMs)', to: '!(was.at < h.endedAtMs)' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: ' || awayRecapOf(cs)) return false;', to: ') return false;' },
  { test: 'R3', file: 'src/shell/away-recap.js', from: 'if (!was || was.s !== next.s || !(was.at', to: 'if (true || !was || was.s !== next.s || !(was.at' },
  { test: 'R3', file: 'src/session/residue.js', from: '  awaySeen: sanitizeAwaySeen,', to: '  awaySeen: (v) => v,' },
  { test: 'R6', file: 'src/shell/alerts.js', from: "if (c.kind === 'away' && c.session) track('away_recap_shown',", to: "if (false) track('away_recap_shown'," },
  { test: 'R6', file: 'src/shell/alerts.js', from: "      noteLeft(hidden ? 'hidden' : 'closed');\n", to: '' },
  { test: 'R6', file: 'src/shell/alerts.js', from: "      noteLeft(hidden ? 'hidden' : 'closed');", to: "      noteLeft('closed');" },
  { test: 'R6', file: 'src/shell/alerts.js', from: "      if (!h || h.ended) continue;\n      const lv = levelOf(cs);\n      track('left_with_hunt_running'", to: "      if (!h) continue;\n      const lv = levelOf(cs);\n      track('left_with_hunt_running'" },
  { test: 'R6', file: 'src/shell/alerts.js', from: '    noteGear(cs);\n', to: '' },
  { test: 'R6', file: 'src/shell/alerts.js', from: 'gearSeen.set(cs.slot, { session: h.sessionId, ids: new Set(ids) }); return; }', to: 'gearSeen.set(cs.slot, { session: h.sessionId, ids: new Set() }); }' },
  { test: 'R6', file: 'src/shell/alerts.js', from: '&& GEAR_TYPES.has(ITEMS[l.item].type))', to: ')' },
  { test: 'R6', file: 'src/shell/alerts.js', from: '    for (const id of ids) was.ids.add(id);\n', to: '' },
  { test: 'R3c', file: 'src/shell/away-recap.js', from: "      + then + (stamina ? ' Stamina now: '", to: "      + (stamina ? ' Stamina now: '" },
  { test: 'R3c', file: 'src/shell/away-recap.js', from: "const ago = h.ended && !waited && ", to: 'const ago = h.ended && ' },
  { test: 'R3c', file: 'src/shell/after-hunt.js', from: 'Math.abs(since - home) <= SAME_MS', to: 'true' },
  { test: 'R3c', file: 'src/shell/after-hunt.js', from: "if (Number.isFinite(since) && since > home + MOVED_AFTER_MS) return null;", to: '' },
  { test: 'R3c', file: 'src/shell/after-hunt.js', from: " || !RESUME_AFTER_END.includes(h.endReason)) return null;", to: ') return null;' },
  { test: 'R3c', file: 'src/shell/after-hunt.js', from: "if (st.active_kind !== 'idle') return null;", to: '' },
  { test: 'R3c', file: 'src/shell/after-hunt.js', from: "hours: 'away.next_longer', ", to: '' },
  { test: 'R3d', file: 'src/shell/after-hunt.js', from: 'a.idleMs >= WAITED_FROM_MS ?', to: 'true ?' },
  { test: 'R3d', file: 'src/shell/after-hunt.js', from: '|| h.sessionId !== id ||', to: '||' },
];

async function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'shell-core-'));
  let caught = 0;
  try {
    for (const m of MUTANTS) {
      const base = join(tmp, String(caught) + '-' + m.test);
      /* The import closure of the three modules; the stylesheets and the vendored bundles are not in it. */
      const skip = new Set(['styles', 'vendor'].map((n) => join(ROOT, 'src', n)));
      mkdirSync(join(base, 'src'), { recursive: true });
      cpSync(join(ROOT, 'src'), join(base, 'src'), { recursive: true, filter: (s) => !skip.has(s) });
      mkdirSync(join(base, 'src/styles'), { recursive: true });
      cpSync(join(ROOT, 'src/styles/shell.css'), join(base, 'src/styles/shell.css'));
      const p = join(base, m.file);
      const src = readFileSync(p, 'utf8');
      if (!src.includes(m.from)) throw new Error('selftest: anchor for ' + m.test + ' not found in ' + m.file);
      writeFileSync(p, src.replace(m.from, m.to));
      const fails = await runTests(await load(base));
      if (!fails.some((f) => f.startsWith(m.test + ' '))) { console.error('  MISSED: ' + m.test + ' stayed green with its defect planted (' + m.file + ')'); process.exit(1); }
      caught++;
      console.log('  caught  ' + m.test + '  (' + m.file + ')');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log('shell-core selftest: ' + caught + '/' + MUTANTS.length + ' planted defects caught');
}

if (process.argv.includes('--selftest')) {
  const clean = await runTests(await load(ROOT));
  if (clean.length) { console.error('shell-core selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  await selftest();
} else {
  const fails = await runTests(await load(ROOT));
  if (fails.length) { console.error('shell-core: ' + fails.length + ' failing\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('shell-core: windows, HUD contract and residue bound green');
}
