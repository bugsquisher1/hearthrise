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
  /* TOWNSFOLK (the crier, the smith, the gate sergeant: unit sprites placed as map objects) and FIRES (the forge, the cauldron, the oven, a candle: props with a
     looping idle clip) play it on the state's clock through the same place(), so the switch holds them too; a prop whose idle does not move (fps 0: a post) stays the still it always was. */
  const still = { fps: 0, loop: false, dirs: { s: [[0, 0]] } };
  const bk2 = BK.createBook({ t: { size: [32, 8], sprites: { breather: bk.sprites.breather, lamp: Object.assign({}, bk.sprites.breather, { class: 'clutter', layer: 'prop' }),
    post: Object.assign({}, bk.sprites.breather, { class: 'clutter', layer: 'prop', anims: { idle: still } }) }, terrain: {} } });
  const town = Object.assign({}, fm, { id: 'm2', objects: [{ id: 'breather', x: 2, y: 2, fw: 1, fh: 1 }, { id: 'lamp', x: 4, y: 4, fw: 1, fh: 1 }, { id: 'post', x: 6, y: 6, fw: 1, fh: 1 }] });
  const folk = (stillIdle, t) => CP.composeFrame(town, bk2, { hero: null, t, stillIdle }, { ox: 0, oy: 0, w: 256, h: 256 }, { materials: {}, sprites: bk2.sprites, openClasses: [], lights: {} }, 32)
    .sprites.map((d) => d.id + ':' + d.sx).join(' ');
  must(folk(false, 250) === 'breather:8 lamp:8 post:0' && folk(false, 500) === 'breather:16 lamp:16 post:0', 'idle switch: on, townsfolk and a prop with a looping idle must play it on the clock (and a still prop must not), got ' + folk(false, 250) + ' / ' + folk(false, 500));
  must(ages.every((a) => folk(off, a) === 'breather:0 lamp:0 post:0'), 'idle switch: off must hold townsfolk and fires on frame 0 at any time, got ' + ages.map((a) => folk(off, a)).join(' / '));
  /* SOUND (Tyler 2026-11-10; src/data/sound-buses.js): a volume and a mute per bus under Sound. The rows are HIDDEN while sound is off
     (no file exists yet, and a slider that changes nothing is a broken promise) and shown by the page's ?sound=tones; a press is the
     player's, so it goes to every open hero as ONE pick of all four buses, the newest any open hero holds wins, and a second press
     keeps what the first set. */
  const SB = await import(u('src/data/sound-buses.js'));
  const srows = D.SETTINGS.filter((r) => r.category === 'sound');
  must(srows.length === SB.SOUND_BUSES.length * 2 && SB.SOUND_BUSES.every((b) => srows.some((r) => r.id === 'sound.' + b.id + '.vol' && r.type === 'slider' && r.default === b.initial)
    && srows.some((r) => r.id === 'sound.' + b.id + '.mute' && r.type === 'toggle' && r.default === false)), 'sound rows: every bus needs a volume slider at its default and a mute that starts off');
  must(srows.length > 0 && srows.every((r) => r.bind.store === 'sound' && r.bind.field === SB.SOUND.field && RESIDUE_FIELDS.includes(r.bind.field)), 'sound rows: the pick must be kept in an allowlisted residue field');
  const pageOf = (search) => ({ defaultView: { location: { search } } });
  const quiet = Object.assign({}, ctx, { doc: pageOf('') }), toned = Object.assign({}, ctx, { doc: pageOf('?sound=tones') });
  const sectionShown = (c) => M.categoriesFor(c, D.SETTINGS, D.SETTING_CATEGORIES).some((x) => x.id === 'sound');
  must(SB.SOUND.shipped || (srows.every((r) => !M.visible(quiet, r)) && !sectionShown(quiet) && !sectionShown(ctx)), 'sound rows: they must stay hidden while sound is off');
  must(srows.length > 0 && srows.every((r) => M.visible(toned, r)) && sectionShown(toned), 'sound rows: ?sound=tones must show them');
  const s1 = heroOf({}), s2 = heroOf({});
  const sound = { character: s1, peers: () => [s1, s2], hud: ctx.hud };
  const vol = srows.find((r) => r.id === 'sound.music.vol'), mute = srows.find((r) => r.id === 'sound.effects.mute');
  must(vol && mute && M.read(sound, vol) === vol.default && M.read(sound, mute) === false, 'sound rows: with no pick anywhere a row reads its default');
  must(vol && M.write(sound, vol, 20) && M.read(sound, vol) === 20 && s2.puts.length === 1 && s2.puts[0][0] === 'sound' && s2.puts[0][1].vol.music === 20
    && JSON.stringify(s1.puts[0][1]) === JSON.stringify(s2.puts[0][1]), 'sound rows: a volume press must reach every open hero');
  must(mute && M.write(sound, mute, true) && M.read(sound, mute) === true && M.read(sound, vol) === 20 && !!s2.puts[1] && s2.puts[1][1].at > s2.puts[0][1].at, 'sound rows: a second press keeps the first and is newer');
  must(!!s2.puts[1] && JSON.stringify(sanitizeResidueField('sound', Object.assign({ x: 1 }, s2.puts[1][1]))) === JSON.stringify(s2.puts[1][1]) && sanitizeResidueField('sound', { vol: { music: 20 } }) === undefined
    && (sanitizeResidueField('sound', { at: 1, vol: { music: 33 } }) || { vol: {} }).vol.music === 35,
    'sound rows: a pick must round-trip through the residue sanitizer, and a thing with no stamp is no pick');
  const quietOld = heroOf({ sound: { at: 5, vol: { music: 10 }, mute: [] } }), loudNew = heroOf({ sound: { at: 9, vol: { music: 90 }, mute: [] } });
  must(vol && M.read({ character: quietOld, peers: () => [quietOld, loudNew], hud: ctx.hud }, vol) === 90 && M.read({ character: loudNew, peers: () => [loudNew, quietOld], hud: ctx.hud }, vol) === 90, 'sound rows: the newest pick any open hero holds must win, whichever hero is viewed');
  try { D.validateSettings([Object.assign({}, vol, { bind: Object.assign({}, vol.bind, { bus: 'kazoo' }) })]); errs.push('sound rows: a row naming an unknown bus must fail validation'); } catch { /* expected */ }
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
  must(D.SETTING_CATEGORIES.map((c) => c.id).join() === 'gameplay,interface,sound,combat_text,chat_social,controls,account,help', 'categories keep the ruled order (Sound after Interface, 2026-11-10; Help, last: the problem report)');
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
  { name: 'townsfolk stand as stills', file: 'src/world/core/compose.js', from: 'if (!swap && standing.folk[i]) place(', to: 'if (false) place(', want: 'a looping idle must play it on the clock' },
  { name: 'fires stand as stills (only a unit plays its idle)', file: 'src/world/core/compose.js', from: 'folk[i] = s.anims && s.anims.idle && s.anims.idle.fps', to: "folk[i] = s.layer === 'unit' && s.anims && s.anims.idle && s.anims.idle.fps", want: 'a looping idle must play it on the clock' },
  { name: 'the World never reads the idle switch', file: 'src/world/world-boot.js', from: ', stillIdle: idleMotion.still() }, cast));', to: ' }, cast));', want: 'every frame it draws' },
  { name: 'reduced motion is ignored', file: 'src/session/player-switch.js', from: "return reduced === true && typeof sw.reducedOn === 'boolean' ? sw.reducedOn : sw.defaultOn === true;", to: 'return sw.defaultOn === true;', want: 'reduced motion must make the default off' },
  { name: 'a sound press writes one hero only', file: 'src/shell/settings-model.js', from: 'setPlayerPick(peersOf(ctx), b.field,', to: 'setPlayerPick([ctx.character], b.field,', want: 'a volume press must reach every open hero' },
  { name: 'the sound pick is not allowlisted', file: 'src/session/residue.js', from: '  sound: sanitizeSoundPick,', to: '', want: 'allowlisted residue field' },
  { name: 'sound rows show while sound is off', file: 'src/data/settings.js', from: "key: 'vol' }), visibleWhen: soundShown,", to: "key: 'vol' }),", want: 'stay hidden while sound is off' },
  { name: 'a second sound press forgets the first', file: 'src/data/sound-buses.js', from: 'const next = { at, vol: Object.assign({}, p.vol), mute: p.mute.slice() };', to: 'const next = { at, vol: {}, mute: [] };', want: 'a second press keeps the first' },
  { name: 'an older sound pick beats a newer one', file: 'src/session/player-switch.js', from: 'Number.isSafeInteger(p.at) && (!best || p.at > best.at)) best = p;', to: 'Number.isSafeInteger(p.at) && (!best || p.at < best.at)) best = p;', want: 'sound rows: the newest pick' },
  { name: 'a volume off the setting\'s steps is kept', file: 'src/data/sound-buses.js', from: 'return Math.max(min, Math.min(max, Math.round(v / step) * step));', to: 'return v;', want: 'round-trip' },
  { name: 'the idle pick is not allowlisted', file: 'src/session/residue.js', from: '  idleMotion: sanitizeSwitch,', to: '', want: 'round-trip' },
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
