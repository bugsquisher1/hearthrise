#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-criers.mjs — THE TOWN CRIERS AND THE TIPS SWITCH (Tyler 2026-11-11), ONE TEST PER RULE.
//
//   node tests/town-criers.mjs            the rules (pure node)
//   node tests/town-criers.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/town-criers.js src/session/crier-facts.js src/social/chat-store.js src/shell/launcher.js
// mutant-writes-tree: no — mutants plant into a temp copy of src/
//
// Tyler: "the 'what's next' tutorial thing should not be a mandatory thing, give an option to dismiss these tips and
// a setting in options to turn it back on", and "a 'town crier' who yells out tips in local chat periodically".
//   TC-1  THE ROWS: every crier stands at a real station, every line keys on a known fact and has its two text rows,
//         and its link opens a window the shell has
//   TC-2  A FRESH HERO HEARS A CRIER: standing in town, after the first gap, one Local line from a named crier, its
//         words the text home's and its link the stand's window; it counts unread while Chat is closed; it is never
//         sent (no rpc but the chat's own read)
//   TC-3  THE CLOCK: no second line inside the gap; the next line comes from ANOTHER crier; a hero with nothing left
//         undone hears nothing (never noise)
//   TC-4  QUIET IN A VIEWED HUNT: a hunt open on the viewed hero holds every line; back in town they return
//   TC-5  THE SWITCH SILENCES THEM: "Show tips" off (the residue pick) holds every line; on again, they return; the
//         Settings row ui.tips reads and writes that pick into every open hero
//   TC-6  THE LINES SURVIVE A RE-READ: the chat's history read replaces the server's lines and keeps a crier's
//   TC-7  NO TIP IS MANDATORY: every card offers Got it and Don't show tips; Got it on a card a server fact finishes
//         hides it, now and after a reload (the residue the server holds), and the next card still shows; Don't show
//         tips turns the switch off for every open hero, now and after a reload; the setting on brings the card back,
//         now and after a reload
// Exit: 0 green · 1 a rule red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const UID = '11111111-2222-3333-4444-555555555555';
const SEC = 1000, MIN = 60 * SEC;

const MODULES = {
  shell: 'src/shell/town-criers.js', data: 'src/data/town-criers.js', facts: 'src/session/crier-facts.js', store: 'src/social/chat-store.js',
  stations: 'src/data/world/stations.js', windows: 'src/data/shell-windows.js', text: 'src/render/player-text.js', launcher: 'src/shell/launcher.js',
  settings: 'src/data/settings.js', model: 'src/shell/settings-model.js', tips: 'src/data/tips.js', residue: 'src/session/residue.js',
  temper: 'src/data/temper.js', items: 'src/data/items.js',
};
async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  const keys = Object.keys(MODULES);
  const mods = await Promise.all(keys.map((k) => import(u(MODULES[k]))));
  return Object.fromEntries(keys.map((k, i) => [k, mods[i]]));
}

/* ── A HERO AS THE SERVER PROJECTS IT ── a fresh one has done nothing: no XP, no task, an empty Storage, no Blessing,
   an Iron Sword with its ladder untouched. `done` flips every fact. */
function sections(M, o = {}) {
  const tier = Math.min(...Object.keys(M.temper.TEMPER_TIERS).map(Number));
  const weapon = Object.keys(M.items.ITEMS).find((id) => M.items.ITEMS[id].slot === 'weapon' && M.items.ITEMS[id].tier === tier);
  const done = o.done === true;
  return {
    name: 'Odalys',
    level: { xp: done ? 500 : 0, level: 1, into: 0, need: 100 },
    state: { level_xp: done ? 500 : 0 },
    hunt: o.hunt === undefined ? null : o.hunt,
    tally: { held: o.held || (done ? [{ place: 0, task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', kills: 25, target: 25, done: true }] : []),
      paid_today: 0, per_day: 3, held_max: 2, weight: null, order: [], recent: [] },
    bank: done ? { bread: 3 } : {},
    blessings: { permille: 0, tiers: [{ tier: 1, permille: 250, price: 100, held: done }] },
    equipment: { weapon },
    temper: [{ track: 'blows', tier, rung: done ? 1 : 0, max: 3, offer: 'temper_blows_' + tier + '_1', gold: 100, items: {} }],
  };
}

/** A CharacterSession as the shell sees it: the projection, the residue, setResidue. */
function hero(M, o = {}) {
  const sec = sections(M, o);
  const subs = new Set();
  const cs = {
    slot: o.slot || 0, status: 'open', record: { residue: Object.assign({}, o.residue || {}) }, writes: [],
    read: (k) => sec[k],
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    serverNow: () => 1_800_000_000_000,
    setResidue(f, v) {
      if (!M.residue.RESIDUE_FIELDS.includes(f)) return false;
      this.writes.push([f, v]);
      this.record = { residue: Object.assign({}, this.record.residue, { [f]: M.residue.sanitizeResidueField(f, v) }) };
      return true;
    },
    set(k, v) { sec[k] = v; for (const fn of subs) fn(cs, 'envelope'); },
  };
  return cs;
}

/** A reload: a new session built from the residue the server holds (what setResidue put), nothing else. */
const reloaded = (M, cs, o = {}) => hero(M, Object.assign({}, o, { residue: cs.record.residue }));

/** The account: its heroes, the viewed one, a server that answers the chat's reads, a real ChatStore. */
function account(M, heroes) {
  const calls = [];
  const acct = {
    userId: UID, viewed: 0, character: (s) => heroes.find((h) => h.slot === s) || null, characters: () => heroes.slice(),
    subscribe: () => () => {},
    server: { rpc: async (name, args) => { calls.push({ name, args }); return { ok: true, body: name === 'hr_chat_recent' ? { ok: true, zone: 'local:town', party: null, lines: [] } : { ok: true } }; } },
  };
  acct.social = { chat: new M.store.ChatStore({ account: acct, now: () => 1_800_000_000_000 }) };
  return { acct, calls };
}

/** The clock under test: its tick, and a now() the test moves. */
function mounted(M, acct, o = {}) {
  let now = 0;
  let hidden = false;
  const timers = { setTimer: (fn) => fn, clearTimer: () => {} };
  const m = M.shell.mountTownCriers({}, acct, { timers, now: () => now, hidden: () => hidden });
  const chat = acct.social.chat;
  return {
    at(ms) { now = ms; m.tick(); return chat.lines('local').filter((l) => l.npc); },
    hide(on) { hidden = on; },
    lines: () => chat.lines('local').filter((l) => l.npc),
  };
}

const tick = () => new Promise((ok) => setTimeout(ok, 0));

async function pureRules(M) {
  const fails = [];
  const fail = (m) => fails.push(m);
  const SH = M.shell;
  const { TOWN_CRIERS, CRIER_CLOCK, validateCriers } = M.data;
  const { t } = M.text;
  const stations = new Set(M.stations.STATIONS.map((s) => s.id));
  const windows = new Set(M.windows.SHELL_WINDOWS.map((w) => w.id));

  // TC-1
  {
    const bad = validateCriers(TOWN_CRIERS, stations);
    if (bad.length) fail('TC-1 ' + bad[0]);
    if (TOWN_CRIERS.length < 3) fail('TC-1 three criers to start (Tyler): ' + TOWN_CRIERS.length);
    /* every fact a line may key on is one the projection reader answers, and nothing else */
    const read = Object.keys(M.facts.crierFactsOf(hero(M)) || {}).sort().join(','), named = M.data.CRIER_FACTS.slice().sort().join(',');
    if (read !== named) fail('TC-1 CRIER_FACTS [' + named + '] and crierFactsOf [' + read + '] disagree');
    for (const c of TOWN_CRIERS) {
      for (const l of c.lines) {
        for (const k of ['say_', 'go_']) if (!M.text.hasText('criers.' + k + l.id)) fail('TC-1 crier ' + c.id + ' line ' + l.id + ' has no criers.' + k + l.id + ' row');
        const target = SH.crierTarget(c, l, { hunt: 'mill_cellar' });
        if (!target || !windows.has(target.win)) fail('TC-1 crier ' + c.id + ' line ' + l.id + ' links to no window the shell has: ' + JSON.stringify(target));
      }
    }
    /* the three Tyler named: the crier at the gate (Hunts), the smith (tempering), Tamsin at her board */
    const by = Object.fromEntries(TOWN_CRIERS.map((c) => [c.id, c]));
    if (!by.crier || SH.crierTarget(by.crier, by.crier.lines[0], null).win !== 'hunts') fail('TC-1 the Town Crier\'s first line does not open Hunts');
    if (!by.smith || !by.smith.lines.some((l) => l.when === 'untempered' && SH.crierTarget(by.smith, l, null).tab === 'services')) fail('TC-1 the smith has no tempering line that opens the Services tab');
    if (!by.tamsin || by.tamsin.stand !== 'tally' || SH.crierTarget(by.tamsin, by.tamsin.lines[0], null).win !== 'tally') fail('TC-1 Tamsin does not stand at her board');
  }

  // TC-2
  {
    const cs = hero(M);
    const { acct, calls } = account(M, [cs]);
    acct.social.chat.start();
    await tick();
    const m = mounted(M, acct);
    if (m.at(0).length || m.at(CRIER_CLOCK.firstMs - SEC).length) fail('TC-2 a line came before the first gap');
    const got = m.at(CRIER_CLOCK.firstMs);
    if (got.length !== 1) fail('TC-2 after the first gap a fresh hero in town hears ' + got.length + ' lines, not one');
    const l = got[0];
    const crier = l && TOWN_CRIERS.find((c) => c.name === l.name);
    if (!crier) fail('TC-2 the line is not from a named crier: ' + JSON.stringify(l && l.name));
    else {
      const line = crier.lines.find((x) => l.id.startsWith('crier:' + crier.id + ':' + x.id + ':'));
      const words = l.parts.map((p) => p.text).join('');
      if (!line || !words.startsWith(t('criers.say_' + line.id))) fail('TC-2 the words are not the text home\'s row: ' + JSON.stringify(words));
      const link = l.parts.find((p) => p.goto);
      const want = line && SH.crierTarget(crier, line, null);
      if (!link || !want || link.goto.win !== want.win || link.text !== t('criers.go_' + line.id)) fail('TC-2 the line carries no link to the stand\'s window: ' + JSON.stringify(link));
      if (l.npc !== true || l.system || l.fromId || l.level !== null) fail('TC-2 a crier line reads as a player\'s or the server\'s: ' + JSON.stringify({ npc: l.npc, system: l.system, fromId: l.fromId, level: l.level }));
    }
    if (acct.social.chat.unread('local') !== 1) fail('TC-2 a crier line while Chat is closed counts unread: ' + acct.social.chat.unread('local'));
    if (calls.some((c) => c.name !== 'hr_chat_recent')) fail('TC-2 a crier sent something to the server: ' + calls.map((c) => c.name).join(','));
  }

  // TC-3
  {
    const cs = hero(M);
    const { acct } = account(M, [cs]);
    acct.social.chat.start();
    await tick();
    const m = mounted(M, acct);
    m.at(0);   // the clock first sees the hero in town
    const first = m.at(CRIER_CLOCK.firstMs);
    if (first.length !== 1) fail('TC-3 no first line');
    if (m.at(CRIER_CLOCK.firstMs + 10 * SEC).length !== 1) fail('TC-3 a second line came inside the gap');
    let now = CRIER_CLOCK.firstMs;
    const names = [first[0] && first[0].name];
    for (let i = 0; i < 5; i++) {
      now += CRIER_CLOCK.everyMs;
      const lines = m.at(now);
      if (lines.length !== i + 2) { fail('TC-3 at ' + (now / SEC) + ' s expected ' + (i + 2) + ' lines, got ' + lines.length); break; }
      names.push(lines[lines.length - 1].name);
    }
    for (let i = 1; i < names.length; i++) if (names[i] === names[i - 1]) fail('TC-3 two lines in a row from ' + names[i] + ': ' + names.join(' > '));
    if (new Set(names).size < 3) fail('TC-3 six lines did not go round all three criers: ' + names.join(' > '));
    /* the pure pick, where only the turn rule tells: A spoke last and has a line never said, B's line was said once; B speaks */
    const A = { id: 'a', name: 'A', stand: 'tally', everyMs: CRIER_CLOCK.everyMs, lines: [{ id: 'x', when: 'no_task' }, { id: 'y', when: 'no_task' }] };
    const B = { id: 'b', name: 'B', stand: 'tally', everyMs: CRIER_CLOCK.everyMs, lines: [{ id: 'z', when: 'no_task' }] };
    const turn = SH.pickCry([A, B], { no_task: true }, { lastCrier: 'a', lastAt: 0, saidAt: {}, said: { 'a/x': 1, 'b/z': 1 }, started: 0 }, 10 * MIN);
    if (!turn || turn.crier.id !== 'b') fail('TC-3 the crier who spoke last speaks again while another has a line: ' + JSON.stringify(turn && [turn.crier.id, turn.line.id]));
    /* nothing left undone: nothing said, however long the hero stands there */
    const all = hero(M, { done: true });
    const { acct: a2 } = account(M, [all]);
    a2.social.chat.start();
    await tick();
    const m2 = mounted(M, a2);
    m2.at(0);
    if (m2.at(CRIER_CLOCK.firstMs).length || m2.at(30 * MIN).length) fail('TC-3 a hero with nothing left undone still hears a crier (noise)');
  }

  // TC-4
  {
    const cs = hero(M, { hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended: false, session: {}, hero: {}, pose: { units: [] } } });
    const { acct } = account(M, [cs]);
    acct.social.chat.start();
    await tick();
    const m = mounted(M, acct);
    m.at(0);
    if (m.at(CRIER_CLOCK.firstMs).length || m.at(20 * MIN).length) fail('TC-4 a crier spoke while a hunt was viewed');
    cs.set('hunt', { session_id: 's-1', hunt_id: 'mill_cellar', ended: true, session: {}, hero: {}, pose: { units: [] } });
    if (m.at(20 * MIN + SEC).length) fail('TC-4 a line came the instant the hunt ended, before the first gap');
    if (m.at(20 * MIN + SEC + CRIER_CLOCK.firstMs).length !== 1) fail('TC-4 back in town, no crier line after the first gap');
  }

  // TC-5
  {
    const cs = hero(M, { residue: { tips: { on: false, at: 5 } } });
    const { acct } = account(M, [cs]);
    acct.social.chat.start();
    await tick();
    const m = mounted(M, acct);
    m.at(0);
    if (m.at(CRIER_CLOCK.firstMs).length || m.at(20 * MIN).length) fail('TC-5 a crier spoke with Show tips off');
    /* the Settings row, written through the model as the window does */
    const row = M.settings.SETTINGS.find((r) => r.id === 'ui.tips');
    const other = hero(M, { slot: 1 });
    const ctx = { character: cs, peers: () => [cs, other], hud: {} };
    if (!row || row.category !== 'interface' || row.type !== 'toggle' || row.bind.store !== 'switch' || row.bind.field !== M.tips.TIPS.field) fail('TC-5 no Show tips toggle in Settings > Interface bound to the tips switch: ' + JSON.stringify(row && row.bind));
    if (row && M.model.read(ctx, row) !== false) fail('TC-5 the row reads on while the pick says off');
    if (row && !M.model.write(ctx, row, true)) fail('TC-5 the row could not be written');
    if (!(cs.record.residue.tips && cs.record.residue.tips.on === true) || !(other.record.residue.tips && other.record.residue.tips.on === true)) fail('TC-5 the pick did not reach every open hero: ' + JSON.stringify([cs.record.residue.tips, other.record.residue.tips]));
    m.at(20 * MIN + SEC);   // the clock sees the hero again
    if (m.at(20 * MIN + SEC + CRIER_CLOCK.firstMs).length !== 1) fail('TC-5 Show tips on again, and no crier line came back');
  }

  // TC-6
  {
    const cs = hero(M);
    const { acct } = account(M, [cs]);
    acct.social.chat.start();
    await tick();
    const m = mounted(M, acct);
    m.at(0);
    m.at(CRIER_CLOCK.firstMs);
    if (m.lines().length !== 1) fail('TC-6 no line to keep');
    await acct.social.chat.refresh();
    if (m.lines().length !== 1) fail('TC-6 the chat\'s re-read dropped the crier\'s line');
  }

  // TC-7
  {
    const L = M.launcher;
    const coach = { read: ['styles', 'tamsins_rats'] };
    const ctxOf = (cs, peers) => ({ character: cs, account: { characters: () => peers || [cs] }, wm: { openIds: () => [], rows: () => [], isOpen: () => false }, now: () => 1000 });
    const cs = hero(M, { residue: { coach } });
    const card = L.heldCard(ctxOf(cs));
    if (!card || card.gotIt) { fail('TC-7 the fresh hero past the two Got it cards holds no card a server fact finishes: ' + JSON.stringify(card && card.id)); }
    else {
      const html = L.coachHtml(cs, card, false, false);
      if (!html.includes('data-hs-act="coach-got"') || !html.includes('data-hs-act="coach-off"')) fail('TC-7 the card offers no Got it or no Don\'t show tips: ' + html.slice(0, 200));
      /* Got it on it: hidden now, and after a reload; the chain is untouched (a reload with the server's next fact shows the next card) */
      const on = { closest: () => ({ getAttribute: () => card.id }) };
      L.actCoach(ctxOf(cs), {}, 'coach-got', { type: 'click', target: on });
      const hid = cs.record.residue.coach && cs.record.residue.coach.hid;
      if (!Array.isArray(hid) || !hid.includes(card.id)) fail('TC-7 Got it did not record the card hidden: ' + JSON.stringify(cs.record.residue.coach));
      if (L.heldCard(ctxOf(cs)) !== null) fail('TC-7 the card is still held after Got it');
      const again = reloaded(M, cs);
      if (L.heldCard(ctxOf(again)) !== null) fail('TC-7 the card came back after a reload');
      /* the server's chain moved on: the next card shows */
      const next = reloaded(M, cs, { hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended: true, session: { end_reason: 'left' }, hero: {}, pose: { units: [] } } });
      const nc = L.heldCard(ctxOf(next));
      if (!nc || nc.id === card.id) fail('TC-7 after the server\'s fact the next card does not show: ' + JSON.stringify(nc && nc.id));
      /* Don't show tips: the switch off for every open hero, now and after a reload; the setting brings the card back, now and after a reload */
      const fresh = hero(M, { residue: { coach } }), peer = hero(M, { slot: 1 });
      if (!L.heldCard(ctxOf(fresh, [fresh, peer]))) fail('TC-7 a second fresh hero holds no card');
      L.actCoach(ctxOf(fresh, [fresh, peer]), {}, 'coach-off', { type: 'click', target: on });
      if (!(fresh.record.residue.tips && fresh.record.residue.tips.on === false) || !(peer.record.residue.tips && peer.record.residue.tips.on === false)) fail('TC-7 Don\'t show tips did not turn the switch off for every open hero: ' + JSON.stringify([fresh.record.residue.tips, peer.record.residue.tips]));
      if (L.heldCard(ctxOf(fresh, [fresh, peer])) !== null) fail('TC-7 a card is held with tips off');
      const r1 = reloaded(M, fresh), r2 = reloaded(M, peer, { slot: 1 });
      if (L.heldCard(ctxOf(r1, [r1, r2])) !== null) fail('TC-7 tips came back after a reload');
      const row = M.settings.SETTINGS.find((r) => r.id === 'ui.tips');
      M.model.write({ character: r1, peers: () => [r1, r2], hud: {} }, row, true);
      if (!L.heldCard(ctxOf(r1, [r1, r2]))) fail('TC-7 the setting on did not bring the card back');
      const r3 = reloaded(M, r1), r4 = reloaded(M, r2, { slot: 1 });
      if (!L.heldCard(ctxOf(r3, [r3, r4]))) fail('TC-7 the setting on did not survive a reload');
    }
  }
  return fails;
}

/* ── THE MUTANTS: each must turn a rule red. ── */
const MUTANTS = [
  ['a re-read drops the crier\'s lines', 'src/social/chat-store.js', "(tab === 'system' && l.system) || l.npc === true", "tab === 'system' && l.system"],
  ['the same crier twice in a row', 'src/shell/town-criers.js', 'const pool = others.length ? others : fits;', 'const pool = fits;'],
  ['no gap between lines', 'src/shell/town-criers.js', "const gap = clock.lastAt === null ? CRIER_CLOCK.firstMs : CRIER_CLOCK.everyMs;", 'const gap = clock.lastAt === null ? CRIER_CLOCK.firstMs : 0;'],
  ['the criers talk over a viewed hunt', 'src/shell/town-criers.js', '|| (h && !h.ended) ||', '|| false ||'],
  ['the criers ignore Show tips', 'src/shell/town-criers.js', '|| !switchOn(account.characters(), TIPS)', '|| false'],
  ['the line loses its link', 'src/shell/town-criers.js', 'if (target) parts.push(', 'if (false) parts.push('],
  ['a hero who has hunted is told the gate', 'src/session/crier-facts.js', 'unhunted: lv.xp === 0,', 'unhunted: true,'],
  ['the coach ignores a hidden card', 'src/shell/launcher.js', 'if (hid && hid.has(card.id)) card = null;', ''],
  ['the coach ignores Show tips', 'src/shell/launcher.js', 'if (cs && !tipsOn(ctx)) { HELD.delete(cs); return null; }', ''],
  ['Got it records nothing on a server-fact card', 'src/shell/launcher.js', 'if (card.gotIt || readable(card)) markCoachRead(cs, card); else markCoachHid(cs, card);', 'if (card.gotIt || readable(card)) markCoachRead(cs, card);'],
  ['Don\'t show tips presses nothing', 'src/shell/launcher.js', "if (action === 'coach-off') { setSwitch(heroesOf(ctx), TIPS, false, serverNowOf(cs)); return true; }", "if (action === 'coach-off') return true;"],
];

function copySrc() {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-criers-'));
  cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
  return tmp;
}

const loadAt = load;

async function main() {
  if (process.argv.includes('--mutate')) {
    let bad = 0;
    for (const [name, file, from, to] of MUTANTS) {
      const tmp = copySrc();
      try {
        const text = readFileSync(join(tmp, file), 'utf8');
        if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
        writeFileSync(join(tmp, file), text.replace(from, to));
        let fails;
        try { fails = await pureRules(await loadAt(tmp)); } catch (e) { fails = ['HARNESS threw: ' + e.message]; }
        const named = fails.filter((f) => /^TC-\d/.test(f));
        if (named.length) console.log('  ✓ ' + name + ' — caught (' + named[0].split(' ')[0] + ')');
        else { console.log('  ✗ ' + name + ' — NOT caught' + (fails.length ? ' (' + fails[0].slice(0, 120) + ')' : '')); bad++; }
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    }
    console.log(bad ? 'town-criers --mutate: ' + bad + ' escaped' : 'town-criers --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
    process.exit(bad ? 1 : 0);
  }
  let fails;
  try { fails = await pureRules(await loadAt(ROOT)); } catch (e) { console.error('town-criers: harness error', e); process.exit(2); }
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'town-criers: ' + fails.length + ' RED' : 'town-criers: the rows, a fresh hero\'s first line, the clock, a viewed hunt, the switch, the re-read, and no tip is mandatory');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
