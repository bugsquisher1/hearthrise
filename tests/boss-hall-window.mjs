#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-hall-window.mjs — THE HALL'S PRESS AND THE BOSS BAR'S NEW LINES, IN A REAL CHROMIUM (src/shell/windows/boss-hall-pane.js,
//   src/shell/widgets/boss-bar.js, src/session/boss-intents.js openHall; the engine is tests/boss-hall.mjs, the server tests/boss-hall-db.mjs).
//
//   node tests/boss-hall-window.mjs            the rules
//   node tests/boss-hall-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/boss-hall-pane.js src/shell/widgets/boss-bar.js
//
// play.html as the harness serves it; the modules are driven as the page serves them, on detached elements and a fake hero (the data holds
// no hall yet, so the pane is handed the fixture hall, tests/boss-hall-fixture.mjs, and the bar is read on the Rat King's called room with
// the page's own rows given a hasted spell and a named add).
//   BH-1  THE PRESS: off with no key, on with one, off for a party's member and while hunting, each with its line; a ground with no hall shows nothing
//   BH-2  THE WARNING, THEN ONE PRESS: the press only opens the warning (nothing sent), alone it carries the lone line; confirming sends ONE
//         hr_boss_hall_enter with the slot, the hall and a key, and nothing that names a price, a count or an item
//   BH-3  THE COUNTDOWN (piece 7): the hasted spell's wait from the live prediction, moved back to the instant shown; under his line it counts
//         against the hastened wait; a windup reads "is coming"; with no prediction, or a boss with no hasten, there is no line
//   BH-4  THE NAMED ADD (piece 6): while his wave stands, the named add's name and HP, "Enraged" under his own line; a fallen one, or one
//         before the wave, shows nothing
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { ROWS, NAMED, HALL_ROW } from './boss-hall-fixture.mjs';

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
    await pinFonts(page);
    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load', timeout: 60000 });
    const r = await page.evaluate(async ({ named, namedRow, hall }) => {
      const hrefOf = (name) => new URL(Array.from(document.querySelectorAll('link[rel="modulepreload"]'), (l) => l.href).find((h) => h.includes(name)));
      const B = await import(hrefOf('/boss-bar.js').href);
      const P = await import(hrefOf('/boss-hall-pane.js').href);
      const { MONSTERS } = await import(hrefOf('/data/monsters.js').href);
      MONSTERS[named] = namedRow;
      const king = MONSTERS.rat_king_called;
      const keep = king.phases;
      king.phases = Object.assign({}, keep, { hasten: { spell: 'squeal', cdPm: 500 } });
      try {
        /* ── BH-3, BH-4: the bar on the King's room ── */
        const bar = ({ hp = 1000, units = [], live = null, shown = 100000 } = {}) => {
          const el = document.createElement('div');
          el.innerHTML = B.renderBossBar();
          const pose = [{ u: 5, kind: 'rat_king_called', side: 'monster', boss: true, name: 'Rat King', hp, hp_max: 1000 }, ...units];
          const cs = { read: (k) => (k === 'hunt' ? { session_id: 's', hunt_id: 'millrace_sewer_called', ended: false, pose: { units: pose } } : null),
            timeline: { hpAt: () => null, serverNowAt: () => shown }, now: () => 0, live: live ? { spellWait: () => live } : null };
          B.renderBossBar.patch(el, { character: cs });
          const q = (s) => el.querySelector(s);
          return { quiet: el.classList.contains('is-quiet'), flare: q('.hs-boss-flare').hidden ? null : q('.hs-boss-flare-words').textContent,
            fill: q('.hs-boss-flare-fill').style.width, casting: q('.hs-boss-flare').classList.contains('is-casting'),
            add: q('.hs-boss-add').hidden ? null : q('.hs-boss-add-name').textContent + ' ' + q('.hs-boss-add-state').textContent, addRaging: q('.hs-boss-add').classList.contains('is-raging') };
        };
        const cap = (hp) => ({ u: 9, kind: named, side: 'monster', boss: true, name: namedRow.name, hp, hp_max: namedRow.hp });
        const bars = {
          soon: bar({ live: { leftMs: 6000, casting: null, atMs: 101000 } }),
          raging: bar({ hp: 200, live: { leftMs: 2000, casting: null, atMs: 100000 } }),
          casting: bar({ live: { leftMs: 0, casting: 900, atMs: 100000 } }),
          noLive: bar({}),
          capFull: bar({ hp: 400, units: [cap(600)] }),
          capRage: bar({ hp: 400, units: [cap(200)] }),
          capDead: bar({ hp: 400, units: [cap(0)] }),
          capEarly: bar({ hp: 900, units: [cap(600)] }),
        };
        king.phases = keep;
        bars.noHasten = bar({ live: { leftMs: 6000, casting: null, atMs: 101000 } });
        /* ── BH-1, BH-2: the pane with the fixture hall ── */
        const calls = [];
        const csOf = (keys, party) => ({ slot: 0, status: 'open', read: (k) => (k === 'inventory' ? (keys ? { [hall.key]: keys } : {}) : k === 'state' ? { active_kind: 'idle' } : null), load: async () => {} });
        const pane = (keys, v = {}, h = hall) => {
          const det = document.createElement('div');
          det.innerHTML = P.hallHtml();
          const cs = csOf(keys);
          const account = { server: { rpc: async (name, args) => { calls.push({ name, args }); return { ok: true, body: { ok: true, alone: true } }; } }, characters: () => [cs] };
          const ctx = { character: cs, account };
          const vv = Object.assign({ hunt: 'millrace_sewer', party: null, now: null, pending: false }, v);
          P.patchHall(det, ctx, vv, h);
          const q = (s) => det.querySelector(s);
          const read = () => ({ hidden: q('.hw-hd-hall').hidden, line: q('.hw-call-line').textContent, press: q('.hw-call-press').textContent,
            off: q('.hw-call-press').disabled, warn: q('.hw-call-warn').classList.contains('is-on'), title: q('.hw-confirm-q').textContent,
            alone: q('.hw-hall-note-alone').hidden ? null : q('.hw-hall-note-alone').textContent, a: q('.hw-hall-note-a').textContent, b: q('.hw-hall-note-b').textContent,
            go: q('[data-hs-act="hall-go"]').textContent });
          return { det, ctx, vv, read, h };
        };
        const leader = { id: 'p', isLeader: true, seats: [{ seat: 0 }, { seat: 1 }] }, member = { id: 'p', isLeader: false, seats: [{ seat: 0 }, { seat: 1 }] };
        const panes = { none: pane(0).read(), one: pane(1).read(), two: pane(2).read(), member: pane(1, { party: member }).read(), hunting: pane(1, { now: { huntId: 'x' } }).read(),
          noHall: pane(1, {}, null).read(), leader: pane(1, { party: leader }).read() };
        /* the press: the first opens the warning and sends nothing; the confirm sends one */
        const p = pane(1);
        const runs = [];
        const run = (send, busy, done) => { runs.push({ busy }); return Promise.resolve(send()).then((x) => { runs[runs.length - 1].done = done(x); return x; }); };
        const repaint = () => P.patchHall(p.det, p.ctx, p.vv, p.h);
        P.actHall(p.ctx, 'hall-warn', repaint, run);
        const sentAfterWarn = calls.length;
        const warned = p.read();
        P.actHall(p.ctx, 'hall-go', repaint, run);
        await new Promise((res) => setTimeout(res, 50));
        /* a party's leader reads the warning with no lone line (the scratch is per hero: a fresh one) */
        const lp = pane(1, { party: leader });
        P.actHall(lp.ctx, 'hall-warn', () => P.patchHall(lp.det, lp.ctx, lp.vv, lp.h), () => Promise.resolve({ ok: true }));
        const partyWarn = lp.read();
        return { bars, panes, sentAfterWarn, warned, calls, runs, partyWarn };
      } finally { king.phases = keep; delete MONSTERS[named]; }
    }, { named: NAMED, namedRow: ROWS[NAMED], hall: { ...HALL_ROW } });
    const b = r.bars;
    /* BH-3 */
    if (b.soon.flare !== 'Squeal in 7 s' || b.soon.fill !== '65%' || b.soon.casting) fails.push('BH-3 the countdown reads ' + JSON.stringify(b.soon));
    if (b.raging.flare !== 'Squeal in 2 s' || b.raging.fill !== '80%') fails.push('BH-3 under his line the countdown reads ' + JSON.stringify(b.raging));
    if (b.casting.flare !== 'Squeal is coming' || !b.casting.casting) fails.push('BH-3 a windup reads ' + JSON.stringify(b.casting));
    if (b.noLive.flare !== null) fails.push('BH-3 with no prediction the bar counts ' + JSON.stringify(b.noLive.flare));
    if (b.noHasten.flare !== null) fails.push('BH-3 a boss with no hasten counts ' + JSON.stringify(b.noHasten.flare));
    /* BH-4 */
    if (b.capFull.add !== ROWS[NAMED].name + ' 100%' || b.capFull.addRaging) fails.push('BH-4 the named add reads ' + JSON.stringify(b.capFull));
    if (b.capRage.add !== ROWS[NAMED].name + ' Enraged' || !b.capRage.addRaging) fails.push('BH-4 under his own line the named add reads ' + JSON.stringify(b.capRage));
    if (b.capDead.add !== null) fails.push('BH-4 a fallen named add still shows: ' + b.capDead.add);
    if (b.capEarly.add !== null) fails.push('BH-4 a named add shows before the wave: ' + b.capEarly.add);
    /* BH-1 */
    const pn = r.panes;
    if (pn.none.hidden || !pn.none.off || pn.none.line !== 'You don\'t have a Goblin Totem.') fails.push('BH-1 with no key the pane reads ' + JSON.stringify(pn.none));
    if (pn.one.off || pn.one.line !== 'You have 1 Goblin Totem.' || !/^Open /.test(pn.one.press)) fails.push('BH-1 with a key the pane reads ' + JSON.stringify(pn.one));
    if (pn.two.off || pn.two.line !== 'You have 2 of them.') fails.push('BH-1 with two keys the pane reads ' + JSON.stringify(pn.two));
    if (!pn.member.off || pn.member.line !== 'Only your party\'s leader can open it.') fails.push('BH-1 a member reads ' + JSON.stringify(pn.member));
    if (!pn.hunting.off || !/^Not while you're hunting/.test(pn.hunting.line)) fails.push('BH-1 while hunting the pane reads ' + JSON.stringify(pn.hunting));
    if (pn.leader.off) fails.push('BH-1 a party\'s leader with a key is off');
    if (!pn.noHall.hidden) fails.push('BH-1 a ground with no hall shows the section');
    for (const [k, x] of Object.entries(pn)) if (/[{}]/.test(Object.values(x).join(' '))) fails.push('BH-1 ' + k + ' left a slot unfilled: ' + JSON.stringify(x));
    /* BH-2 */
    if (r.sentAfterWarn !== 0 || !r.warned.warn || r.warned.title !== 'Fight the Hall Boss?' || !r.warned.alone || !/Goblin Totem, win or lose/.test(r.warned.b) || r.warned.go !== 'Use the Goblin Totem') fails.push('BH-2 the first press: ' + r.sentAfterWarn + ' sent, the warning reads ' + JSON.stringify(r.warned));
    if (/[{}]/.test(Object.values(r.warned).join(' '))) fails.push('BH-2 the warning left a slot unfilled: ' + JSON.stringify(r.warned));
    if (!r.partyWarn.warn || r.partyWarn.alone !== null) fails.push('BH-2 a party\'s leader reads the warning ' + JSON.stringify(r.partyWarn));
    if (r.calls.length !== 1 || r.calls[0].name !== 'hr_boss_hall_enter' || Object.keys(r.calls[0].args).sort().join() !== 'p_hall,p_idem,p_slot'
        || r.calls[0].args.p_hall !== HALL_ROW.id || r.calls[0].args.p_slot !== 0) fails.push('BH-2 the confirm sent ' + JSON.stringify(r.calls));
    if (r.runs.length !== 1 || !/^Opening /.test(r.runs[0].busy) || r.runs[0].done !== 'The door opens. You\'re on your way.') fails.push('BH-2 the status lines read ' + JSON.stringify(r.runs));
    for (const e of errors) fails.push('BH page error: ' + e.slice(0, 160));
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  { name: 'the countdown reads the world, not the instant shown', file: 'src/shell/widgets/boss-bar.js', from: 'const left = live.leftMs + Math.max(0, live.atMs - shown);', to: 'const left = live.leftMs;', want: /BH-3/ },
  { name: 'the countdown ignores his line', file: 'src/shell/widgets/boss-bar.js', from: 'const cd = raging ? Math.floor((sp.cdMs * h.cdPm) / 1000) : sp.cdMs;', to: 'const cd = sp.cdMs;', want: /BH-3/ },
  { name: 'a windup reads as a countdown', file: 'src/shell/widgets/boss-bar.js', from: "  if (live.casting !== null) return { name: sp.n, s: 0, casting: true, fill: 1000 };\n", to: '', want: /BH-3/ },
  { name: 'the named add never shows', file: 'src/shell/widgets/boss-bar.js', from: 'const add = wave ? namedAddOf(cs, h) : null;', to: 'const add = null;', want: /BH-4/ },
  { name: 'a fallen named add still shows', file: 'src/shell/widgets/boss-bar.js', from: 'if (pm !== null && pm > 0) return { name: row.name, pm, row };', to: 'if (pm !== null) return { name: row.name, pm, row };', want: /BH-4/ },
  { name: 'the press is on with no key', file: 'src/shell/windows/boss-hall-pane.js', from: 'const open = keys > 0 && !v.now && !v.pending && !member;', to: 'const open = !v.now && !v.pending && !member;', want: /BH-1/ },
  { name: 'a member may press', file: 'src/shell/windows/boss-hall-pane.js', from: 'const member = !!v.party && !v.party.isLeader;', to: 'const member = false;', want: /BH-1/ },
  { name: 'the first press opens the hall', file: 'src/shell/windows/boss-hall-pane.js', from: "if (action === 'hall-warn') { sc.warned = true; repaint(); return true; }", to: "if (action === 'hall-warn') { run(() => openHall(ctx.account, cs, sc.hall.id), '', () => ''); return true; }", want: /BH-2/ },
  { name: 'a party is told it walks in alone', file: 'src/shell/windows/boss-hall-pane.js', from: "prop(a, 'hidden', !alone);", to: "prop(a, 'hidden', false);", want: /BH-2|BH-1/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) { const f = await checks(); console.log('boss-hall-window --mutate: control ran the clean tree: ' + (f.join('; ') || 'green')); process.exit(0); }
    let escaped = 0;
    for (const m of MUTANTS) {
      const src = (await readFile(join(ROOT, m.file), 'utf8'));
      if (src.split(m.from).length !== 2) throw new Error('anchor: ' + m.name);
      let got;
      try { got = await checks({ [m.file]: src.replace(m.from, () => m.to) }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every rule held').slice(0, 130));
    }
    console.log(escaped ? `boss-hall-window --mutate: ${escaped} ESCAPED` : `boss-hall-window --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const fails = await checks();
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'boss-hall-window: ' + fails.length + ' FAILED' : 'boss-hall-window: green (the press, one confirm, the countdown, the named add)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
