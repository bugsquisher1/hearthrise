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
//      the 120 ms close and reduced motion, float/dock, the inset rect
//   H  HUD: defaults per size class, show/hide (never the launchers), opacity
//      clamp, persisted per size class, Reset touches only this class, a saved
//      layout survives a reload, `when: hunt`, placement by anchor
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
  const { WM, HUD, CS } = mods;
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
    ok(wm.inset().right <= 1440 * 0.6, 'the inset must stay inside 60%');
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
    eq(wm.inset().right, Math.min(400, Math.round(922 * 0.48)), 'the sheet width is min(400, 48vw)');
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
    eq(wm.inset().right, 12 + 400 + 8 + 340, 'a floating window leaves its slot empty: the inset is the docked one, which did not move');
    wm.dock('bag');
    ok(wm.layout().find((p) => p.id === 'bag').docked, 'dock() returns it');
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
    eq(wm.inset().right, before.equip + 340, 'the inset still covers the left-most window');
    wm.open('skills');
    eq(rights(), before, 'a reopened window did not go back to its own slot');
    wm.close('skills'); wm.close('bag'); flush(); wm.open('skills');
    eq(rights().skills, before.skills, 'a reopen must restore its last rect, not take the first gap');
    wm.open('bag');
    wm.close('equip'); flush(); wm.open('home');
    eq(rights().home, before.equip, 'a new window takes the first free gap');
  });
  t('W11 the inset is published with its rect, only when it changes', () => {
    const { wm, events } = harness(WM, { width: 1440 });
    wm.open('bag');
    const e = events[events.length - 1];
    ok(e.insetChanged, 'opening a docked window changes the inset');
    eq(e.inset.rect, { x: 1440 - 412, y: 0, width: 412, height: 860 }, 'the covered rect');
    wm.focus('bag');
    wm.handleKey(key('Escape'));
    ok(events[events.length - 1].insetChanged && wm.inset().right === 0, 'closing uncovers the World');
  });
  t('W12 the catalogue is validated', () => {
    const bad = [
      [{ id: 'a', label: 'A', key: 'b', width: 1 }, { id: 'b', label: 'B', key: 'b', width: 1 }],
      [{ id: 'a', label: 'A', key: '1', width: 1 }],
      [{ id: 'a', label: 'A', key: 'a', width: 1, escape: true }, { id: 'b', label: 'B', key: 'b', width: 1, escape: true }],
    ];
    for (const rows of bad) { let threw = false; try { WM.validateWindowRows(rows); } catch (e) { threw = true; } ok(threw, 'must refuse ' + JSON.stringify(rows)); }
  });

  /* ── H: the HUD contract ── */
  const hudOf = (store, cls, hunt) => HUD.createHud({ widgets: SPEC_WIDGETS, sizeClass: () => cls.v, store, inHunt: () => !!(hunt && hunt.v) });
  t('H1 defaults per size class come from the row and its phone block', () => {
    const cls = { v: 'desktop' };
    const hud = hudOf(memStore(), cls);
    eq(hud.layoutOf('vitals'), { anchor: 'bc', dx: 0, dy: 100, opacity: 1, visible: true }, 'desktop defaults');
    cls.v = 'phone'; hud.reload();
    eq(hud.layoutOf('vitals'), { anchor: 'tl', dx: 6, dy: 62, opacity: 1, visible: true }, 'phone overrides');
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
    const store = memStore({ desktop: { vitals: { anchor: 'zz', dx: 'x', opacity: 'a', visible: 1 } } });
    eq(hudOf(store, { v: 'desktop' }).layoutOf('vitals'), { anchor: 'bc', dx: 0, dy: 100, opacity: 1, visible: true }, 'nothing malformed lands');
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
  t('H9 a docked bottom bar of height h moves the World inset by h (and the dock adds its strip)', () => {
    const box = { width: 1000, height: 600 };
    const bar = (h) => ({ anchor: 'bc', rect: { left: 300, top: 600 - 8 - h, width: 400, height: h } });
    const a = HUD.hudInsetOf([bar(82)], box, 0), b = HUD.hudInsetOf([bar(122)], box, 0);
    eq(a.bottom, 90, 'the bar and its 8 px offset are covered');
    eq(b.bottom - a.bottom, 40, 'a 40 px taller bar moves the inset by 40');
    eq(HUD.hudInsetOf([], box, 0), { left: 0, right: 0, top: 0, bottom: 0 }, 'no widget, no inset');
    const all = HUD.hudInsetOf([bar(82), { anchor: 'tc', rect: { left: 400, top: 8, width: 200, height: 40 } },
      { anchor: 'tl', rect: { left: 12, top: 12, width: 250, height: 200 } }, { anchor: 'tr', rect: { left: 700, top: 12, width: 260, height: 300 } }], box, 420);
    eq(all, { left: 262, right: 420, top: 48, bottom: 90 }, 'top bar, party, analyzer beside a wider dock');
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
  });

  return fails;
}

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  return {
    WM: await import(u(WM_FILE)),
    HUD: await import(u(HUD_FILE)),
    CS: await import(u('src/session/residue.js')),
  };
}

const MUTANTS = [
  { test: 'W1', file: WM_FILE, from: 'export const MAX_OPEN = 3;', to: 'export const MAX_OPEN = 4;' },
  { test: 'W2', file: WM_FILE, from: 'export const DOCK_MAX = 0.6;', to: 'export const DOCK_MAX = 0.9;' },
  { test: 'W3', file: WM_FILE, from: 'for (const r of rows.values()) if (r.escape) return openWindow(r.id);', to: '' },
  { test: 'W4', file: WM_FILE, from: "if (open[open.length - 1] !== id) { open.splice(open.indexOf(id), 1); open.push(id); emit(); }", to: '' },
  { test: 'W13', file: WM_FILE, from: "else Object.assign(e, { docked: true, right: slot.has(id) ? slot.get(id) : DOCK_EDGE, width: r.width });", to: "else Object.assign(e, { docked: true, right: DOCK_EDGE + open.slice(i + 1).filter((d) => !floating.has(d)).reduce((s, d) => s + width(d) + DOCK_GAP, 0), width: r.width });" },
  { test: 'W13', file: WM_FILE, from: 'else if (slot.has(id)) lastAt.set(id, { right: slot.get(id) });', to: ';' },
  { test: 'W5', file: WM_FILE, from: 'if (isPhone()) for (const other of open.slice()) drop(other);', to: '' },
  { test: 'W8', file: WM_FILE, from: 'return keyBelongsToField(ev.target, ev.key);', to: 'return false;' },
  { test: 'W8', file: 'src/utils/dom.js', from: "  if (tag === 'select') return /^Arrow/.test(String(key || ''));", to: "  if (tag === 'select') return true;" },
  { test: 'W8', file: 'src/utils/dom.js', from: '  return TEXT_TYPES.has(type);', to: '  return true;' },
  { test: 'W9', file: WM_FILE, from: 'if (reducedMotion()) { drop(id); emit(); return true; }', to: '' },
  { test: 'H2', file: HUD_FILE, from: 'const clampOpacity = (v) => Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Number(v)));', to: 'const clampOpacity = (v) => Number(v);' },
  { test: 'H3', file: HUD_FILE, from: 'if (!row.removable) L.visible = true;', to: '' },
  { test: 'H4', file: HUD_FILE, from: "for (const k of SIZE_CLASSES) if (k !== cls && isObj(all[k])) next[k] = all[k];\n    store.write(next);\n    load();", to: 'store.write({});\n    load();' },
  { test: 'H9', file: HUD_FILE, from: "if (v === 'b') out.bottom = Math.max(out.bottom, box.height - r.top);", to: "if (v === 'b') out.bottom = Math.max(out.bottom, 0);" },
  { test: 'R1', file: 'src/session/residue.js', from: "  hudLayout: sanitizeHudLayout,", to: '  hudLayout: (v) => v,' },
  { test: 'R2', file: HUD_FILE, from: "write(next) { if (character) character.setResidue('hudLayout', next); },", to: 'write(next) {},' },
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
