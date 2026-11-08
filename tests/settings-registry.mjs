#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/settings-registry.mjs — THE SETTINGS REGISTRY CONTRACT
//
//   node tests/settings-registry.mjs             the guard
//   node tests/settings-registry.mjs --selftest  plants each defect into a temp copy
//
// Every row has a category and a help line; search finds a row by its help
// text; a display row persists through the residue allowlist; a server row
// sends its existing intent and never touches residue; no category is drawn
// empty. Rows are data (src/data/settings.js); the window holds none.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function check(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  const D = await import(u('src/data/settings.js'));
  const M = await import(u('src/shell/settings-model.js'));
  const { RESIDUE_FIELDS } = await import(u('src/session/residue.js'));
  const errs = [];
  const must = (ok, msg) => { if (!ok) errs.push(msg); };
  try { D.validateSettings(); } catch (e) { errs.push(e.message); }
  must(D.SETTINGS.length > 0 && D.SETTINGS.every((r) => r.category && r.help && r.label), 'every row needs a category, a label and a help line');
  /* Search finds a row by its help text (not its label). */
  const probe = D.SETTINGS.find((r) => r.id === 'panel.analyzer');
  must(probe && M.search(D.SETTINGS, 'while you are in a hunt').some((r) => r.id === probe.id) && !M.search(D.SETTINGS, 'zzqx').length, 'search must find a row by its help text and nothing for nonsense');
  /* A display row persists: written to residue, read back, and the field is allowlisted. */
  const rec = { residue: {} };
  const character = {
    record: rec,
    setResidue(f, v) { if (!RESIDUE_FIELDS.includes(f)) return false; rec.residue = Object.assign({}, rec.residue, { [f]: v }); return true; },
  };
  const hudSet = [];
  const ctx = { character, hud: { layoutOf: () => ({ visible: true }), setVisible: (id, on) => { hudSet.push([id, on]); return true; } } };
  const bleed = D.SETTINGS.find((r) => r.id === 'float.bleed_badge.regular');
  must(bleed && M.read(ctx, bleed) === false && M.read(ctx, D.SETTINGS.find((r) => r.id === 'float.bleed_badge.boss')) === true, 'bleed count defaults off on monsters, on for bosses');
  must(bleed && M.write(ctx, bleed, true) && M.read(ctx, bleed) === true && rec.residue.combatText.bleed_badge.regular === true, 'a display toggle must persist in residue.combatText');
  const panel = D.SETTINGS.find((r) => r.bind.store === 'hud');
  must(panel && M.write(ctx, panel, false) && hudSet.length === 1, 'a panel toggle goes through the HUD layout');
  for (const r of D.SETTINGS) {
    if (r.scope !== 'residue') continue;
    const field = r.bind.store === 'float' ? 'combatText' : r.bind.store === 'hud' ? 'hudLayout' : r.bind.field;
    must(r.bind.store === 'none' || RESIDUE_FIELDS.includes(field), 'row ' + r.id + ' keeps a field that is not in RESIDUE_FIELDS: ' + field);
  }
  /* THE SESSION-RECORDING SWITCH (2026-11-04): in Settings > Help by its exact words, ON until the player presses it (Tyler: recording stays on
     for invitees), and one press goes to EVERY open hero, because the residue is per character and the choice is the player's: the newest
     pick any open hero holds is what counts, so a hero that was closed for a press cannot put its older pick back. */
  const { REPLAY } = await import(u('src/data/privacy.js'));
  const sw = D.SETTINGS.find((r) => r.id === 'help.replay');
  must(sw && sw.category === 'help' && sw.type === 'toggle' && sw.label === REPLAY.label && sw.label === 'Share session recordings to help fix bugs', 'replay switch: the row is missing from Help or its words changed');
  must(sw && sw.default === true && REPLAY.defaultOn === true && sw.bind.store === 'switch' && RESIDUE_FIELDS.includes(sw.bind.field), 'replay switch: it must default on and keep its pick in an allowlisted residue field');
  const heroOf = (residue) => { const h = { record: { residue }, puts: [], setResidue(f, v) { this.puts.push([f, v]); this.record = { residue: Object.assign({}, this.record.residue, { [f]: v }) }; return true; } }; return h; };
  const a = heroOf({}), b = heroOf({});
  const rctx = { character: a, peers: () => [a, b], hud: ctx.hud };
  must(sw && M.read(rctx, sw) === true, 'replay switch: with no pick anywhere the switch must read on');
  must(sw && M.write(rctx, sw, false) && M.read(rctx, sw) === false && a.puts.length === 1 && b.puts.length === 1 && a.puts[0][0] === 'shareReplay'
    && a.puts[0][1].on === false && JSON.stringify(a.puts[0][1]) === JSON.stringify(b.puts[0][1]), 'replay switch: one press must put the same off pick into every open hero');
  const was = a.puts[0][1].at;
  must(sw && M.write(rctx, sw, true) && M.read(rctx, sw) === true && !!b.puts[1] && b.puts[1][1].on === true && b.puts[1][1].at > was, 'replay switch: a second press must be newer than the first, or the old one would win');
  const old = heroOf({ shareReplay: { on: false, at: 5 } }), fresh = heroOf({ shareReplay: { on: true, at: 9 } });
  must(sw && M.read({ character: old, peers: () => [old, fresh], hud: ctx.hud }, sw) === true && M.read({ character: fresh, peers: () => [fresh, old], hud: ctx.hud }, sw) === true, 'replay switch: the newest pick any open hero holds must win, whichever hero is viewed');
  const { sanitizeResidueField } = await import(u('src/session/residue.js'));
  must(JSON.stringify(sanitizeResidueField('shareReplay', { on: false, at: 7, x: 1 })) === '{"on":false,"at":7}', 'replay switch: a pick keeps only its answer and its stamp');
  for (const junk of [true, 'off', null, {}, { on: 'no', at: 1 }, { on: true }, { on: true, at: -1 }, { on: true, at: 1.5 }]) must(sanitizeResidueField('shareReplay', junk) === undefined, 'replay switch: not a pick: ' + JSON.stringify(junk));
  /* IDLE ANIMATIONS (Tyler 2026-11-07, "a toggle to turn that off for people who don't like it"): Settings > Interface, a player switch
     like the recording one, ON unless the device asks for reduced motion, and the player's press wins over both. Off, every idle clip the
     World composes (src/world/core/compose.js, through world-boot.js's frame state) holds its first frame, the shipped still, at any
     age, whether the scene passes an age (town) or a frame (hunt); a walk still turns. */
  const { IDLE_MOTION } = await import(u('src/data/world/motion.js'));
  const { residueOf } = await import(u('src/session/residue.js'));
  const idle = D.SETTINGS.find((r) => r.id === 'ui.idleMotion');
  must(idle && idle.category === 'interface' && idle.type === 'toggle' && idle.label === 'Idle animations' && idle.default === true && idle.bind.store === 'switch'
    && idle.bind.field === IDLE_MOTION.field && RESIDUE_FIELDS.includes(idle.bind.field), 'idle switch: the Interface row is missing, or is not a switch kept in an allowlisted residue field');
  must(JSON.stringify(sanitizeResidueField('idleMotion', { on: false, at: 7, x: 1 })) === '{"on":false,"at":7}'
    && JSON.stringify(residueOf({ idleMotion: { on: true, at: 3 } }).idleMotion) === '{"on":true,"at":3}', 'idle switch: a pick must round-trip through the residue sanitizer');
  for (const junk of [false, 'off', {}, { on: 1, at: 1 }, { on: false, at: -1 }]) must(sanitizeResidueField('idleMotion', junk) === undefined, 'idle switch: not a pick: ' + JSON.stringify(junk));
  const { createIdleMotion } = await import(u('src/world/idle-motion.js'));
  const winOf = (reduce) => ({ matchMedia: (q) => ({ matches: reduce && q === '(prefers-reduced-motion: reduce)' }) });
  const i1 = heroOf({}), i2 = heroOf({});
  const calm = { character: i1, peers: () => [i1, i2], hud: ctx.hud, reducedMotion: () => true }, busy = Object.assign({}, calm, { reducedMotion: () => false });
  const worldStill = (reduce, viewed) => createIdleMotion({ win: winOf(reduce), character: viewed, peers: () => [i1, i2] }).still();
  must(idle && M.read(busy, idle) === true && worldStill(false, i1) === false && M.read(calm, idle) === false && worldStill(true, i1) === true, 'idle switch: reduced motion must make the default off, in Settings and in the World');
  must(idle && M.write(calm, idle, true) && M.read(calm, idle) === true && i2.puts.length === 1 && i2.puts[0][0] === 'idleMotion' && worldStill(true, i2) === false, 'idle switch: a press must win over reduced motion, in every open hero');
  must(idle && M.write(busy, idle, false) && M.read(busy, idle) === false && worldStill(false, i2) === true, 'idle switch: off must reach the World from any open hero');
  must(/backend\.sync\(Object\.assign\(\{[^\n]*stillIdle: idleMotion\.still\(\) \}, cast\)\)/.test(readFileSync(join(base, 'src/world/world-boot.js'), 'utf8')), 'idle switch: the World must put the switch on every frame it draws');
  const BK = await import(u('src/world/core/book.js')), CP = await import(u('src/world/core/compose.js'));
  const strip = [[0, 0], [8, 0], [16, 0], [24, 0]];
  const clip = { fps: 4, loop: true, dirs: { s: strip } };
  const bk = BK.createBook({ t: { size: [32, 8], sprites: { breather: { class: 'unit', layer: 'unit', frame: [8, 8], anchor: [4, 7], footprint: [1, 1], hover: 0, height: 8, shadow: null, anims: { idle: clip, walk: clip } } }, terrain: {} } });
  const fm = { id: 'm', kind: 'town', T: 32, w: 8, h: 8, ground: new Array(64).fill('flagstone'), groundTerrain: null, objects: [], buildings: [], lights: [], rockBlocks: null, faces: {}, light: 'day', outdoor: true, focus: null };
  const drawn = (stillIdle, st) => CP.composeFrame(fm, bk, Object.assign({ hero: null, t: 0, stillIdle }, st), { ox: 0, oy: 0, w: 256, h: 256 }, { materials: {}, sprites: bk.sprites, openClasses: [], lights: {} }, 32)
    .sprites.filter((d) => d.id === 'breather').map((d) => d.sx);
  const off = worldStill(false, i1), ages = [0, 250, 500, 750, 1250, 86400000 + 250];
  const stood = (age) => ({ units: [{ id: 'breather', x: 2, y: 2, anim: 'idle', age }, { id: 'breather', x: 4, y: 4, anim: 'idle', frame: 1 + Math.floor(age / 250) }], hero: { id: 'breather', x: 6, y: 6, anim: 'idle', age } });
  must(off === true && ages.every((a) => drawn(off, stood(a)).every((sx) => sx === 0)), 'idle switch: off must draw every idle unit (town, hunt and hero) on frame 0 at any age, got ' + JSON.stringify(ages.map((a) => drawn(off, stood(a)))));
  must(JSON.stringify(drawn(false, stood(250))) === '[8,16,8]' && JSON.stringify(drawn(false, stood(500))) === '[16,24,16]', 'idle switch: on, an idle unit must advance through its clip, got ' + JSON.stringify(drawn(false, stood(250))));
  must(JSON.stringify(drawn(true, { units: [{ id: 'breather', x: 2, y: 2, anim: 'walk', age: 500 }] })) === '[16]', 'idle switch: off must leave a walk turning');
  /* TOWNSFOLK (the crier, the smith: unit sprites placed as map objects) breathe on the state's clock through the same place(), so
     the switch holds them too; a prop with a clip of its own (not a unit) stays the still it always was. */
  const bk2 = BK.createBook({ t: { size: [32, 8], sprites: { breather: bk.sprites.breather, lamp: Object.assign({}, bk.sprites.breather, { class: 'clutter', layer: 'prop' }) }, terrain: {} } });
  const town = Object.assign({}, fm, { id: 'm2', objects: [{ id: 'breather', x: 2, y: 2, fw: 1, fh: 1 }, { id: 'lamp', x: 4, y: 4, fw: 1, fh: 1 }] });
  const folk = (stillIdle, t) => CP.composeFrame(town, bk2, { hero: null, t, stillIdle }, { ox: 0, oy: 0, w: 256, h: 256 }, { materials: {}, sprites: bk2.sprites, openClasses: [], lights: {} }, 32)
    .sprites.map((d) => d.id + ':' + d.sx).join(' ');
  must(folk(false, 250) === 'breather:8 lamp:0' && folk(false, 500) === 'breather:16 lamp:0', 'idle switch: on, townsfolk must breathe on the clock (and a prop must not), got ' + folk(false, 250) + ' / ' + folk(false, 500));
  must(ages.every((a) => folk(off, a) === 'breather:0 lamp:0'), 'idle switch: off must hold townsfolk on frame 0 at any time, got ' + ages.map((a) => folk(off, a)).join(' / '));
  /* THE EFFECTS SLIDERS (Tyler 2026-11-08: "settings/opacity sliders for on screen effects"; src/data/fx-alpha.js): Settings > Effects,
     one slider per owner of an effect, each a player switch holding a whole percent, one pick for every open hero (the newest wins),
     snapped to its step; Danger marks never go under half (the warning rule), the others reach 0. A pick round-trips the residue
     sanitizer, so a reload (the envelope's client_state through residueOf) reads it back, and the hunt reads it as an opacity. */
  const fxRows = D.SETTINGS.filter((r) => r.category === 'effects');
  must(D.SETTING_CATEGORIES.some((c) => c.id === 'effects') && fxRows.map((r) => r.id).join() === 'fx.self,fx.peer,fx.monster,fx.marks'
    && fxRows.every((r) => r.type === 'slider' && r.bind.store === 'switch' && RESIDUE_FIELDS.includes(r.bind.field) && r.default === 100 && r.options.max === 100 && r.options.unit === '%'),
  'effects sliders: Settings > Effects must hold the four sliders, each a switch kept in an allowlisted residue field, 100% until moved');
  const fxRow = (id) => fxRows.find((r) => r.id === id);
  must(fxRow('fx.marks') && fxRow('fx.marks').options.min === 50 && ['fx.self', 'fx.peer', 'fx.monster'].every((id) => fxRow(id) && fxRow(id).options.min === 0),
    'effects sliders: Danger marks must never go under half, and every other slider must reach 0');
  const f1 = heroOf({}), f2 = heroOf({});
  const fctx = { character: f1, peers: () => [f1, f2], hud: ctx.hud };
  const mon = fxRow('fx.monster'), mk = fxRow('fx.marks');
  must(mon && M.read(fctx, mon) === 100, 'effects sliders: with no pick a slider must read 100');
  must(mon && M.write(fctx, mon, 43) && M.read(fctx, mon) === 40 && f2.puts.length === 1 && f2.puts[0][0] === 'fxMonster' && f2.puts[0][1].v === 40,
    'effects sliders: a drag must put one pick, snapped to its step, into every open hero, got ' + JSON.stringify(f2.puts));
  must(mk && M.write(fctx, mk, 10) && M.read(fctx, mk) === 50, 'effects sliders: Danger marks must be held at half, never under');
  const back = heroOf(residueOf(JSON.parse(JSON.stringify(f2.record.residue))));
  const { fxAlphaOf } = await import(u('src/hunt-view/fx-prefs.js'));
  const asAlpha = fxAlphaOf(back, () => [back]);
  must(mon && M.read({ character: back, peers: () => [back], hud: ctx.hud }, mon) === 40 && asAlpha.monster === 0.4 && asAlpha.marks === 0.5 && asAlpha.self === 1,
    'effects sliders: a reload must read the picks back from the residue, and the hunt as opacities, got ' + JSON.stringify(asAlpha));
  for (const junk of [{ v: 40, at: 1 }, { v: 55, at: 1 }, { v: 110, at: 1 }, { v: 60 }, { v: '60', at: 1 }, 60]) must(sanitizeResidueField('fxMarks', junk) === undefined, 'effects sliders: not a Danger marks pick: ' + JSON.stringify(junk));
  must(JSON.stringify(sanitizeResidueField('fxSelf', { v: 0, at: 3, x: 1 })) === '{"v":0,"at":3}', 'effects sliders: a pick keeps only its value and its stamp');
  /* The Privacy Policy names the switch by its words and says it is on by default (the page players read must match the row). */
  const policy = readFileSync(join(ROOT, 'legal/PRIVACY_POLICY.md'), 'utf8');
  must(policy.includes('**' + REPLAY.label + '**') && /on by default/i.test(policy) && /Settings/.test(policy), 'replay switch: legal/PRIVACY_POLICY.md must name the switch by its exact words and say it is on by default');
  /* A server row sends its intent and keeps nothing in residue. */
  const sent = [];
  const srv = { id: 'x.server', category: 'gameplay', label: 'X', help: 'y', type: 'toggle', default: false, scope: 'server', intent: 'setThing', bind: { store: 'none' } };
  const before = JSON.stringify(rec.residue);
  const sctx = { character: Object.assign({}, character, { setThing(v, id) { sent.push([v, id]); } }), hud: ctx.hud };
  must(M.write(sctx, srv, true) && sent.length === 1 && sent[0][0] === true && JSON.stringify(rec.residue) === before, 'a server row must call its intent and leave residue alone');
  try { D.validateSettings([Object.assign({}, srv, { intent: undefined })]); errs.push('a server row with no intent must fail validation'); } catch { /* expected */ }
  try { D.validateSettings([Object.assign({}, srv, { bind: { store: 'residue', field: 'a' } })]); errs.push('a server row bound to residue must fail validation'); } catch { /* expected */ }
  /* No category renders empty: shown categories each hold a visible row; a hidden-only category is dropped. */
  const shown = M.categoriesFor(ctx, D.SETTINGS, D.SETTING_CATEGORIES);
  for (const c of shown) must(D.SETTINGS.some((r) => r.category === c.id && M.visible(ctx, r)), 'category ' + c.id + ' would render empty');
  must(shown.length > 0 && shown.length < D.SETTING_CATEGORIES.length, 'categories with no rows must stay hidden');
  const hidden = Object.assign({}, srv, { category: 'account', visibleWhen: () => false });
  must(!M.categoriesFor(ctx, [hidden], D.SETTING_CATEGORIES).length, 'a category whose rows are all hidden must not show');
  must(D.SETTING_CATEGORIES.map((c) => c.id).join() === 'gameplay,interface,combat_text,effects,chat_social,controls,account,help', 'categories keep the ruled order (Help, last: the problem report)');
  /* HELP SAYS HOW THE GAME WORKS (designer 2026-10-22: Help held only "Report a problem", and nothing told a newcomer
     the hero keeps hunting with the game closed). Read-only notes, found by search, the idle promise among them. */
  const notes = D.SETTINGS.filter((r) => r.category === 'help' && r.type === 'note');
  must(notes.length >= 5 && notes.every((r) => M.visible(ctx, r)), 'help notes: Help must explain the game in read-only notes, got ' + notes.length);
  must(M.search(D.SETTINGS, 'close the game').some((r) => r.category === 'help' && r.type === 'note'), 'help notes: no note says the hero keeps hunting when you close the game');
  must(M.search(D.SETTINGS, 'weapon').some((r) => r.category === 'help' && r.type === 'note' && /no class/i.test(r.help)), 'help notes: no note says the weapon, not a class, sets how you fight');
  must(M.search(D.SETTINGS, 'four heroes').some((r) => r.category === 'help' && r.type === 'note'), 'help notes: no note says several heroes can play at once');
  return errs;
}

const MUTANTS = [
  { name: 'a row with no help', file: 'src/data/settings.js', from: "help: 'Hunts play themselves. Keys only open windows.'", to: "help: ''", want: 'help' },
  { name: 'a display toggle that does not persist', file: 'src/shell/settings-model.js', from: "ctx.character.setResidue('combatText'", to: "ctx.character.setResidue('zzText'", want: 'persist' },
  { name: 'a server row that is not sent', file: 'src/shell/settings-model.js', from: "if (row.scope === 'server') {", to: "if (row.scope === 'never') {", want: 'server row must call' },
  { name: 'search that ignores help text', file: 'src/shell/settings-model.js', from: "(r.label + ' ' + r.help)", to: 'r.label', want: 'search' },
  { name: 'Help forgets how the game works', file: 'src/data/settings.js', from: '[...HELP_NOTES.map(', to: '[...[].map(', want: 'help notes' },
  { name: 'empty categories shown', file: 'src/shell/settings-model.js', from: 'return cats.filter((c) => have.has(c.id));', to: 'return cats.slice();', want: 'would render empty' },
  { name: 'the recording switch writes one hero only', file: 'src/shell/settings-model.js', from: 'setSwitch(peersOf(ctx), b.sw, value,', to: 'setSwitch([ctx.character], b.sw, value,', want: 'every open hero' },
  { name: 'an older recording pick beats a newer one', file: 'src/session/player-switch.js', from: 'if (p && (!best || p.at > best.at)) best = p;', to: 'if (p && (!best || p.at < best.at)) best = p;', want: 'newest pick' },
  { name: 'a second press is not stamped after the first', file: 'src/session/player-switch.js', from: 'was ? was.at + 1 : 0) };', to: 'was ? was.at : 0) };', want: 'second press' },
  { name: 'recording defaults off', file: 'src/data/privacy.js', from: 'defaultOn: true,', to: 'defaultOn: false,', want: 'default on' },
  { name: 'the recording row loses its words', file: 'src/data/privacy.js', from: "label: 'Share session recordings to help fix bugs'", to: "label: 'Share data'", want: 'its words changed' },
  { name: 'idle switch off still breathes', file: 'src/world/core/compose.js', from: "if (state.stillIdle === true && o.anim === 'idle' && o.i)", to: 'if (false)', want: 'on frame 0 at any age' },
  { name: 'idle switch off stops walks too', file: 'src/world/core/compose.js', from: "if (state.stillIdle === true && o.anim === 'idle' && o.i)", to: 'if (state.stillIdle === true && o.i)', want: 'leave a walk turning' },
  { name: 'townsfolk stand as stills', file: 'src/world/core/compose.js', from: 'if (!swap && standing.folk[i]) place(', to: 'if (false) place(', want: 'townsfolk must breathe' },
  { name: 'every placed clip breathes, props too', file: 'src/world/core/compose.js', from: "folk[i] = s.layer === 'unit' && s.anims", to: 'folk[i] = s.anims', want: 'townsfolk must breathe' },
  { name: 'the World never reads the idle switch', file: 'src/world/world-boot.js', from: ', stillIdle: idleMotion.still() }, cast));', to: ' }, cast));', want: 'every frame it draws' },
  { name: 'reduced motion is ignored', file: 'src/session/player-switch.js', from: "return reduced === true && typeof sw.reducedOn === 'boolean' ? sw.reducedOn : sw.defaultOn === true;", to: 'return sw.defaultOn === true;', want: 'reduced motion must make the default off' },
  { name: 'the idle pick is not allowlisted', file: 'src/session/residue.js', from: '  idleMotion: sanitizeSwitch,', to: '', want: 'round-trip' },
  { name: 'a slider pick is not snapped to its step', file: 'src/session/player-switch.js', from: 'sw.min + Math.round((n - sw.min) / sw.step) * sw.step', to: 'n', want: 'snapped to its step' },
  { name: 'Danger marks go under half', file: 'src/data/fx-alpha.js', from: "label: 'Danger marks', min: 50,", to: "label: 'Danger marks', min: 0,", want: 'never go under half' },
  { name: 'a slider drag writes one hero only', file: 'src/shell/settings-model.js', from: 'setSwitchValue(peersOf(ctx), b.sw, value,', to: 'setSwitchValue([ctx.character], b.sw, value,', want: 'every open hero' },
  { name: 'a slider pick is not allowlisted', file: 'src/session/residue.js', from: '  fxMonster: valuePick(FX_ALPHA_ROW.monster),', to: '', want: 'allowlisted residue field' },
  { name: 'the residue keeps a pick off its range', file: 'src/session/residue.js', from: '&& v.v >= sw.min && v.v <= sw.max && (v.v - sw.min) % sw.step === 0', to: '', want: 'not a Danger marks pick' },
];

if (process.argv.includes('--selftest')) {
  const clean = await check(ROOT);
  if (clean.length) { console.error('settings-registry selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'settings-registry-'));
  try {
    let i = 0;
    for (const m of MUTANTS) {
      const base = join(tmp, String(i++));
      for (const d of ['src/data', 'src/shell', 'src/utils', 'src/session', 'src/render', 'src/hunt-view', 'src/core', 'src/world']) { mkdirSync(join(base, d), { recursive: true }); cpSync(join(ROOT, d), join(base, d), { recursive: true }); }
      const p = join(base, m.file), src = readFileSync(p, 'utf8');
      if (!src.includes(m.from)) { console.error('selftest anchor missing for: ' + m.name); process.exit(2); }
      writeFileSync(p, src.replace(m.from, m.to));
      let errs;
      try { errs = await check(base); } catch (e) { errs = [String(e.message)]; }
      if (!errs.some((e) => e.includes(m.want))) { console.error('  MISSED: ' + m.name + ' (got ' + JSON.stringify(errs) + ')'); process.exit(1); }
      console.log('  caught  ' + m.name);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log('settings-registry selftest: ' + MUTANTS.length + '/' + MUTANTS.length + ' planted defects caught');
} else {
  const errs = await check(ROOT);
  if (errs.length) { console.error('settings-registry: RED\n  ' + errs.join('\n  ')); process.exit(1); }
  console.log('settings-registry: every row has a category and help; search, residue, server intent and empty categories hold');
}
