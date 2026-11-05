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
  must(sw && sw.default === true && REPLAY.defaultOn === true && sw.bind.store === 'replay' && RESIDUE_FIELDS.includes(sw.bind.field), 'replay switch: it must default on and keep its pick in an allowlisted residue field');
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
  must(D.SETTING_CATEGORIES.map((c) => c.id).join() === 'gameplay,interface,combat_text,chat_social,controls,account,help', 'categories keep the ruled order (Help, last: the problem report)');
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
  { name: 'a row with no help', file: 'src/data/settings.js', from: "help: 'Hunts play themselves; keys only open windows.'", to: "help: ''", want: 'help' },
  { name: 'a display toggle that does not persist', file: 'src/shell/settings-model.js', from: "ctx.character.setResidue('combatText'", to: "ctx.character.setResidue('zzText'", want: 'persist' },
  { name: 'a server row that is not sent', file: 'src/shell/settings-model.js', from: "if (row.scope === 'server') {", to: "if (row.scope === 'never') {", want: 'server row must call' },
  { name: 'search that ignores help text', file: 'src/shell/settings-model.js', from: "(r.label + ' ' + r.help)", to: 'r.label', want: 'search' },
  { name: 'Help forgets how the game works', file: 'src/data/settings.js', from: '[...HELP_NOTES.map(', to: '[...[].map(', want: 'help notes' },
  { name: 'empty categories shown', file: 'src/shell/settings-model.js', from: 'return cats.filter((c) => have.has(c.id));', to: 'return cats.slice();', want: 'would render empty' },
  { name: 'the recording switch writes one hero only', file: 'src/shell/settings-model.js', from: 'setReplayWanted(peersOf(ctx), value,', to: 'setReplayWanted([ctx.character], value,', want: 'every open hero' },
  { name: 'an older recording pick beats a newer one', file: 'src/session/replay-pref.js', from: 'if (p && (!best || p.at > best.at)) best = p;', to: 'if (p && (!best || p.at < best.at)) best = p;', want: 'newest pick' },
  { name: 'a second press is not stamped after the first', file: 'src/session/replay-pref.js', from: 'was ? was.at + 1 : 0) };', to: 'was ? was.at : 0) };', want: 'second press' },
  { name: 'recording defaults off', file: 'src/data/privacy.js', from: 'defaultOn: true,', to: 'defaultOn: false,', want: 'default on' },
  { name: 'the recording row loses its words', file: 'src/data/privacy.js', from: "label: 'Share session recordings to help fix bugs'", to: "label: 'Share data'", want: 'its words changed' },
];

if (process.argv.includes('--selftest')) {
  const clean = await check(ROOT);
  if (clean.length) { console.error('settings-registry selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'settings-registry-'));
  try {
    let i = 0;
    for (const m of MUTANTS) {
      const base = join(tmp, String(i++));
      for (const d of ['src/data', 'src/shell', 'src/utils', 'src/session', 'src/render', 'src/hunt-view', 'src/core']) { mkdirSync(join(base, d), { recursive: true }); cpSync(join(ROOT, d), join(base, d), { recursive: true }); }
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
