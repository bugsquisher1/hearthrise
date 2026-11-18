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
//   BH-5  ANY SEAT'S KEY (lane/c-krell-daily): a leader whose party holds the key in another seat can press, and the line and the warning say
//         whose; a member holding one is told it counts; a lone hero never reads another seat's; all of it from the server's boss_halls section
//   BH-6  THE DAILY PRIZE: one label line (claimed today and the wait on the server's clock, or available, and the party's count); nothing with
//         no word from the server; the confirm says the key is still used when nobody walking in can take today's
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
        /* the hero's bar (hunt_settings), for the hall's food line: none by default */
        let barNow = null;
        /* `sec` the server's `boss_halls` section, `partySec` its `party` section, `now` its clock (CharacterSession.serverNow): none unless the pane says */
        const csOf = (keys, sec, partySec, now, hh = hall) => ({ slot: 0, status: 'open', serverNow: () => (now === undefined ? null : now),
          read: (k) => (k === 'inventory' ? (keys ? { [(hh || hall).key]: keys } : {}) : k === 'state' ? { active_kind: 'idle' } : k === 'hunt_settings' ? barNow
            : k === 'boss_halls' ? (sec ? { [(hh || hall).id]: sec } : null) : k === 'party' ? (partySec || null) : null), load: async () => {} });
        const pane = (keys, v = {}, h = hall) => {
          const det = document.createElement('div');
          det.innerHTML = P.hallHtml();
          const cs = csOf(keys, v.sec, v.partySec, v.serverNow, h);
          const account = { server: { rpc: async (name, args) => { calls.push({ name, args }); return { ok: true, body: { ok: true, alone: true } }; } }, characters: () => [cs] };
          const ctx = { character: cs, account, peers: () => [cs].concat(v.peers || []) };
          const vv = Object.assign({ hunt: 'millrace_sewer', party: null, now: null, pending: false }, v);
          P.patchHall(det, ctx, vv, h);
          const q = (s) => det.querySelector(s);
          const read = () => ({ hidden: q('.hw-hd-hall').hidden, line: q('.hw-call-line').textContent, press: q('.hw-call-press').textContent,
            off: q('.hw-call-press').disabled, warn: q('.hw-call-warn').classList.contains('is-on'), title: q('.hw-confirm-q').textContent,
            alone: q('.hw-hall-note-alone').hidden ? null : q('.hw-hall-note-alone').textContent, a: q('.hw-hall-note-a').textContent, b: q('.hw-hall-note-b').textContent,
            go: q('[data-hs-act="hall-go"]').textContent, loot: Array.from(det.querySelectorAll('.hw-hall-loot li'), (li) => li.textContent).join('|'),
            lootNote: q('.hw-hall-note-loot').hidden ? null : q('.hw-hall-note-loot').textContent,
            tableHead: q('.hw-hall-table').hidden ? null : q('.hw-hall-table summary').textContent, table: Array.from(det.querySelectorAll('.hw-hall-drops li'), (li) => li.textContent) });
          return { det, ctx, vv, read, h };
        };
        const leader = { id: 'p', isLeader: true, seats: [{ seat: 0 }, { seat: 1 }] }, member = { id: 'p', isLeader: false, seats: [{ seat: 0 }, { seat: 1 }] };
        const panes = { none: pane(0).read(), one: pane(1).read(), two: pane(2).read(), member: pane(1, { party: member }).read(), memberNone: pane(0, { party: member }).read(), hunting: pane(1, { now: { huntId: 'x' } }).read(),
          noHall: pane(1, {}, null).read(), leader: pane(1, { party: leader }).read() };
        /* WHAT WINS (lane/d-march-balance): a hall that names its store food and bar line says both; a bar buying Salted Shrimp reads red */
        const fed = { ...hall, storeFloor: 'salted_lobster', bars: ['Healer: Greater Mend under 85%', 'Everyone: Eat under 75%'] };
        const adv = (slots, v = {}) => { barNow = { preset: 0, presets: [], slots: slots.map((id) => ({ action: { type: 'consume', id }, conditions: [], join: 'and', usable: true })), store: [{ id: 'salted_shrimp', kind: 'heal', heals: 72, price: 14 }, { id: 'salted_lobster', kind: 'heal', heals: 216, price: 180 }] };
          const p = pane(1, v, fed); const q = (x) => p.det.querySelector(x); barNow = null;
          return { bars: q('.hw-hall-bars').hidden ? null : q('.hw-hall-bars').textContent, tips: Array.from(p.det.querySelectorAll('.hw-hall-tips li'), (li) => li.textContent).join('|'), food: q('.hw-hall-food').hidden ? null : q('.hw-hall-food').textContent }; };
        panes.shrimp = adv(['salted_shrimp']); panes.lobster = adv(['salted_lobster']);
        /* ...and another setup picked under Go as walks in with its own bar: the bar on now is not judged (the audit's A26, one bar truth) */
        panes.otherSetup = adv(['salted_shrimp'], { other: true });
        /* ...and another hero of this account in the party on Salted Shrimp (the v0.2.133 check: the line read only the viewed hero's bar) */
        {
          const PID = '00000000-0000-4000-8000-0000000000a1';
          const shrimpBar = { preset: 0, presets: [], slots: [{ action: { type: 'consume', id: 'salted_shrimp' }, conditions: [], join: 'and', usable: true }], store: [{ id: 'salted_shrimp', kind: 'heal', heals: 72, price: 14 }, { id: 'salted_lobster', kind: 'heal', heals: 216, price: 180 }] };
          const peer = { slot: 1, status: 'open', read: (k) => (k === 'name' ? 'Mender' : k === 'hunt_settings' ? shrimpBar
            : k === 'party' ? { id: PID, members: [{ seat: 0, weapon: 'sword' }, { seat: 1, weapon: 'staff', role_pick: 'healer' }], self_seat: 1, leader_seat: 0 } : null) };
          barNow = { preset: 0, presets: [], slots: [{ action: { type: 'consume', id: 'salted_lobster' }, conditions: [], join: 'and', usable: true }], store: [{ id: 'salted_shrimp', kind: 'heal', heals: 72, price: 14 }, { id: 'salted_lobster', kind: 'heal', heals: 216, price: 180 }] };
          const p = pane(1, { party: { id: PID, isLeader: true, seats: [{ seat: 0 }, { seat: 1 }] }, peers: [peer] }, fed); barNow = null;
          const q = p.det.querySelector('.hw-hall-food');
          panes.peer = { food: q.hidden ? null : q.textContent };
        }
        const plain = pane(1); panes.plainBars = plain.det.querySelector('.hw-hall-bars').hidden;
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
        /* ── BH-5, BH-6 (lane/c-krell-daily): the server's `boss_halls` section says whose key the open takes and the day's prize ── */
        const PID2 = '00000000-0000-4000-8000-0000000000b2';
        const partySec = { id: PID2, members: [{ seat: 0, weapon: 'sword' }, { seat: 1, weapon: 'staff', role_pick: 'healer' }], self_seat: 0, leader_seat: 0 };
        const seatSec = { boss: 'x', taken: false, next_at: null, key: { seat: 1, own: false, name: 'Mender' }, seats: 2, left: 2 };
        const NOW = Date.UTC(2031, 4, 9, 17, 48, 0);   // the server's clock, years from this browser's
        const takenSec = { boss: 'x', taken: true, next_at: new Date(NOW + (6 * 60 + 12) * 60000).toISOString(), key: { seat: null, own: true, name: null }, seats: 1, left: 0 };
        const daily = {
          /* the leader holds none, the server names another seat's: the press is on and the line says whose */
          seatKey: pane(0, { party: leader, sec: seatSec, partySec }).read(),
          /* the same section with no party on this page: nobody else's key opens a lone hero's door */
          seatKeyNoParty: pane(0, { sec: seatSec }).read(),
          memberHolds: pane(2, { party: member, sec: seatSec }).read(),
          memberSeat: pane(0, { party: member, sec: seatSec }).read(),
          taken: pane(1, { sec: takenSec, serverNow: NOW }).read(),
          left: pane(1, { sec: { ...takenSec, taken: false, next_at: null, left: 1 }, serverNow: NOW }).read(),
          noSection: pane(1).read(),
          /* BH-7: the server says this hero's first win is still ahead */
          firstAhead: pane(1, { sec: { ...takenSec, taken: false, next_at: null, left: 1, first: true }, serverNow: NOW }).read(),
        };
        /* BH-7: Krell's own prize table as the page words it (the real rows), on a plain day and with the first win ahead */
        const krellTable = { plain: P.prizeLines({ hunt: 'krells_hold_hall' }, false), first: P.prizeLines({ hunt: 'krells_hold_hall' }, true) };
        /* ...and on the page itself: Krell's real hall (the data's own row), the first win ahead and behind */
        const realHall = (await import(hrefOf('/data/boss-halls.js').href)).hallFromGround('krells_hold');
        const firstSec = { ...takenSec, taken: false, next_at: null, left: 1, first: true };
        krellTable.page = { ahead: pane(1, { hunt: 'krells_hold', sec: firstSec, serverNow: NOW }, realHall).read(), behind: pane(1, { hunt: 'krells_hold', sec: { ...firstSec, first: false }, serverNow: NOW }, realHall).read(),
          fixture: pane(1).read() };
        /* the warning names the seat whose key it uses up, and the confirm sends the one verb though this hero holds no key */
        const sp = pane(0, { party: leader, sec: seatSec, partySec });
        const before = calls.length;
        P.actHall(sp.ctx, 'hall-warn', () => P.patchHall(sp.det, sp.ctx, sp.vv, sp.h), run);
        daily.seatWarn = sp.read();
        P.actHall(sp.ctx, 'hall-go', () => P.patchHall(sp.det, sp.ctx, sp.vv, sp.h), run);
        await new Promise((res) => setTimeout(res, 50));
        daily.seatSent = calls.slice(before).map((c) => c.name);
        /* nobody walking in can take today's prize: the confirm says the key is used all the same */
        const np = pane(1, { sec: takenSec, serverNow: NOW });
        P.actHall(np.ctx, 'hall-warn', () => P.patchHall(np.det, np.ctx, np.vv, np.h), run);
        daily.noneWarn = np.read();
        return { bars, panes, sentAfterWarn, warned, calls: calls.slice(0, before), runs: runs.slice(0, 1), partyWarn, daily, krellTable };
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
    /* where a key comes from: the monster whose drops name it (designer 2026-11-14, lane/d-march-balance); labels (Tyler 2026-11-14) */
    if (pn.none.hidden || !pn.none.off || pn.none.line !== 'Requires Goblin Totem, dropped by Goblin') fails.push('BH-1 with no key the pane reads ' + JSON.stringify(pn.none));
    if (pn.one.off || pn.one.line !== 'Goblin Totem: 1' || !/^Open /.test(pn.one.press)) fails.push('BH-1 with a key the pane reads ' + JSON.stringify(pn.one));
    if (pn.two.off || pn.two.line !== 'Goblin Totem: 2') fails.push('BH-1 with two keys the pane reads ' + JSON.stringify(pn.two));
    /* a member holding a key is told it counts: any seat's key opens the hall, the leader makes the press (lane/c-krell-daily; the hand play
       2026-11-14: a key dropped to seat 2 had to be walked to the leader) */
    if (!pn.member.off || pn.member.line !== 'Goblin Totem: 1, your leader opens the hall') fails.push('BH-1 a member with a key reads ' + JSON.stringify(pn.member));
    if (!pn.memberNone.off || pn.memberNone.line !== 'Party leader only') fails.push('BH-1 a member with no key reads ' + JSON.stringify(pn.memberNone));
    if (!pn.hunting.off || pn.hunting.line !== 'Not while hunting') fails.push('BH-1 while hunting the pane reads ' + JSON.stringify(pn.hunting));
    if (pn.leader.off) fails.push('BH-1 a party\'s leader with a key is off');
    if (!pn.noHall.hidden) fails.push('BH-1 a ground with no hall shows the section');
    /* Labels (lane/d-labels-sweep, Tyler 2026-11-14 "Those are much better"): the food floor, then the "What wins" label over the tips. */
    if (pn.shrimp.bars !== 'Requires Salted Lobster or better on every bar What wins'
      || pn.shrimp.tips !== 'Healer: Greater Mend under 85%|Everyone: Eat under 75%' || pn.shrimp.food !== 'Slot 1: Salted Shrimp heals too little here. Pick Salted Lobster') fails.push('BH-1 the hall\'s food and bar lines read ' + JSON.stringify(pn.shrimp));
    /* the hall's door says it in the one weak-food rule's words, naming the slot (the full-game audit's A25: "Change that slot" named none) */
    if (pn.peer.food !== 'Mender\'s slot 1: Salted Shrimp heals too little here. Pick Salted Lobster') fails.push('BH-1 a party hero\'s weak food reads ' + JSON.stringify(pn.peer));
    if (pn.lobster.food !== null || !pn.plainBars) fails.push('BH-1 the food line shows on Salted Lobster, or a hall with no advice shows a bar line: ' + JSON.stringify([pn.lobster, pn.plainBars]));
    if (pn.otherSetup.food !== null) fails.push('BH-1 the hall judges the bar on now while another setup is picked to go: ' + JSON.stringify(pn.otherSetup));
    for (const [k, x] of Object.entries(pn)) if (/[{}]/.test(Object.values(x).join(' '))) fails.push('BH-1 ' + k + ' left a slot unfilled: ' + JSON.stringify(x));
    /* BH-2 */
    if (r.sentAfterWarn !== 0 || !r.warned.warn || r.warned.title !== 'Fight the Hall Boss?' || !r.warned.alone || !/^Uses your Goblin Totem, win or lose\nTime limit: 10 min$/.test(r.warned.b) || r.warned.go !== 'Use the Goblin Totem') fails.push('BH-2 the first press: ' + r.sentAfterWarn + ' sent, the warning reads ' + JSON.stringify(r.warned));
    if (/[{}]/.test(Object.values(r.warned).join(' '))) fails.push('BH-2 the warning left a slot unfilled: ' + JSON.stringify(r.warned));
    if (!r.partyWarn.warn || r.partyWarn.alone !== null) fails.push('BH-2 a party\'s leader reads the warning ' + JSON.stringify(r.partyWarn));
    if (r.calls.length !== 1 || r.calls[0].name !== 'hr_boss_hall_enter' || Object.keys(r.calls[0].args).sort().join() !== 'p_hall,p_idem,p_slot'
        || r.calls[0].args.p_hall !== HALL_ROW.id || r.calls[0].args.p_slot !== 0) fails.push('BH-2 the confirm sent ' + JSON.stringify(r.calls));
    if (r.runs.length !== 1 || !/^Opening /.test(r.runs[0].busy) || r.runs[0].done !== 'Door open, heading in') fails.push('BH-2 the status lines read ' + JSON.stringify(r.runs));
    if (!/^Uses your Goblin Totem, win or lose\n/.test(r.warned.b)) fails.push('BH-2 with its own key the warning reads ' + JSON.stringify(r.warned.b));
    /* BH-5: ANY SEAT'S KEY (2027-04-24-hall-key-any-seat.sql), read from the server's section and nothing else */
    const d = r.daily;
    if (d.seatKey.off || d.seatKey.line !== 'Goblin Totem: held by Mender') fails.push('BH-5 a leader whose party holds the key in another seat reads ' + JSON.stringify(d.seatKey));
    if (!d.seatKeyNoParty.off || d.seatKeyNoParty.line !== pn.none.line) fails.push('BH-5 a lone hero reads another seat\'s key: ' + JSON.stringify(d.seatKeyNoParty));
    if (!d.memberHolds.off || d.memberHolds.line !== 'Goblin Totem: 2, your leader opens the hall') fails.push('BH-5 a member holding two reads ' + JSON.stringify(d.memberHolds));
    if (!d.memberSeat.off || d.memberSeat.line !== 'Goblin Totem: held by Mender') fails.push('BH-5 a member with none, the key in another seat, reads ' + JSON.stringify(d.memberSeat));
    if (!d.seatWarn.warn || !/^Uses Mender's Goblin Totem, win or lose\n/.test(d.seatWarn.b)) fails.push('BH-5 the warning for another seat\'s key reads ' + JSON.stringify(d.seatWarn.b));
    if (d.seatSent.join() !== 'hr_boss_hall_enter') fails.push('BH-5 the confirm for another seat\'s key sent ' + JSON.stringify(d.seatSent));
    /* BH-6: THE DAILY PRIZE (2027-04-25-boss-daily.sql), label lines, the wait on the server's clock */
    if (d.seatKey.loot !== 'Loot: available|Party loot: 2 of 2') fails.push('BH-6 a party with the day\'s prize to take reads ' + JSON.stringify(d.seatKey.loot));
    if (d.taken.loot !== 'Loot: claimed today|Next: 6 h 12 m') fails.push('BH-6 a hero who took it today reads ' + JSON.stringify(d.taken.loot));
    if (d.left.loot !== 'Loot: available') fails.push('BH-6 a hero with the day\'s to take reads ' + JSON.stringify(d.left.loot));
    if (d.noSection.loot !== '' || pn.one.loot !== '') fails.push('BH-6 with no word from the server the loot line reads ' + JSON.stringify([d.noSection.loot, pn.one.loot]));
    if (d.noneWarn.lootNote !== 'Loot: none today, the key is still used') fails.push('BH-6 with nobody able to take today\'s prize the confirm reads ' + JSON.stringify(d.noneWarn.lootNote));
    if (d.seatWarn.lootNote !== null || r.warned.lootNote !== null) fails.push('BH-6 the confirm says no loot when there is some, or the server has not said: ' + JSON.stringify([d.seatWarn.lootNote, r.warned.lootNote]));
    /* BH-7 (lane/c-krell-uniques, the QA audit's F21): A FIRST WIN ALWAYS PAYS, SAID WHILE IT IS AHEAD, AND THE PRIZE TABLE IS ON THE PAGE with the
       numbers the server rolls (drops.js prizeSlices over the boss's own rows): each piece and its share of a roll, and its first-win share */
    if (d.firstAhead.loot !== 'Loot: available|First win: one piece, guaranteed') fails.push('BH-7 a hero whose first win is ahead reads ' + JSON.stringify(d.firstAhead.loot));
    if (/First win/.test(d.left.loot + d.taken.loot + d.seatKey.loot)) fails.push('BH-7 a hero the server never called first is promised a piece: ' + JSON.stringify([d.left.loot, d.taken.loot, d.seatKey.loot]));
    const kp = r.krellTable.page;
    if (kp.ahead.tableHead !== 'Loot table: 16 pieces, one roll a day' || kp.ahead.table.join('|') !== r.krellTable.first.join('|')) fails.push('BH-7 Krell\'s page, the first win ahead, lists ' + JSON.stringify([kp.ahead.tableHead, kp.ahead.table]));
    if (kp.behind.tableHead !== 'Loot table: 16 pieces, one roll a day' || kp.behind.table.join('|') !== r.krellTable.plain.join('|')) fails.push('BH-7 Krell\'s page, the first win behind, lists ' + JSON.stringify([kp.behind.tableHead, kp.behind.table]));
    if (kp.fixture.tableHead !== null || kp.fixture.table.length) fails.push('BH-7 a hall whose boss has no prize row shows a table: ' + JSON.stringify([kp.fixture.tableHead, kp.fixture.table]));
    const kt = r.krellTable;
    if (kt.plain.length !== 16 || kt.plain[0] !== 'Dawnsteel Sword: 2.9%' || kt.plain[14] !== 'Krell\'s Tollgate: 3%' || kt.plain[15] !== 'Banded Legguards: 3%') fails.push('BH-7 Krell\'s prize table reads ' + JSON.stringify(kt.plain));
    if (kt.first.length !== 16 || kt.first[0] !== 'Dawnsteel Sword: 2.9%, first win 6.7%' || kt.first[14] !== 'Krell\'s Tollgate: 3%' || kt.first[15] !== 'Banded Legguards: 3%') fails.push('BH-7 with the first win ahead Krell\'s prize table reads ' + JSON.stringify(kt.first));
    for (const [k, x] of Object.entries(d)) if (!Array.isArray(x) && /[{}]/.test(Object.values(x).join(' '))) fails.push('BH-5 ' + k + ' left a slot unfilled: ' + JSON.stringify(x));
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
  { name: 'the press is on with no key', file: 'src/shell/windows/boss-hall-pane.js', from: 'const open = (keys > 0 || !!seatKey) && !v.now && !v.pending && !member;', to: 'const open = !v.now && !v.pending && !member;', want: /BH-1/ },
  { name: 'a member may press', file: 'src/shell/windows/boss-hall-pane.js', from: 'const member = !!v.party && !v.party.isLeader;', to: 'const member = false;', want: /BH-1/ },
  { name: 'the first press opens the hall', file: 'src/shell/windows/boss-hall-pane.js', from: "if (action === 'hall-warn') { sc.warned = true; repaint(); return true; }", to: "if (action === 'hall-warn') { run(() => openHall(ctx.account, cs, sc.hall.id), '', () => ''); return true; }", want: /BH-2/ },
  { name: 'a bar buying Salted Shrimp is never told at the hall door', file: 'src/shell/windows/boss-hall-pane.js', from: '  const mine = said(cs, null);', to: '  const mine = null;', want: /BH-1/ },
  { name: 'the hall judges the bar on now while another setup goes in', file: 'src/shell/windows/boss-hall-pane.js', from: 'hall.storeFloor && !v.other ? foodShortWords(', to: 'hall.storeFloor ? foodShortWords(', want: /BH-1/ },
  { name: 'the food line reads only the viewed hero\'s bar', file: 'src/shell/windows/boss-hall-pane.js', from: '    if (theirs) out.push(theirs);', to: '    if (false) out.push(theirs);', want: /BH-1/ },
  { name: 'the hall lists none of the changes that win', file: 'src/shell/windows/boss-hall-pane.js', from: "rows(box.querySelector('.hw-hall-tips'), hall.bars || [],", to: "rows(box.querySelector('.hw-hall-tips'), [],", want: /BH-1/ },
  { name: 'the hall never says what wins', file: 'src/shell/windows/boss-hall-pane.js', from: "  prop(bars, 'hidden', !advice);", to: "  prop(bars, 'hidden', true);", want: /BH-1/ },
  { name: 'the page never says where a key comes from', file: 'src/data/boss-halls.js', from: "none: 'Requires {key}{source}'", to: "none: 'Requires {key}'", want: /BH-1/ },
  { name: 'a member holding a key is not told it counts', file: 'src/shell/windows/boss-hall-pane.js', from: '(keys > 0 ? W.memberKey : held || W.refused.hall_leader)', to: '(held || W.refused.hall_leader)', want: /BH-1/ },
  /* ANY SEAT'S KEY AND THE DAILY PRIZE (lane/c-krell-daily): every line from the server's `boss_halls` section */
  { name: 'a leader whose party holds the key in another seat cannot press', file: 'src/shell/windows/boss-hall-pane.js', from: 'const open = (keys > 0 || !!seatKey) &&', to: 'const open = keys > 0 &&', want: /BH-5/ },
  { name: 'the press reads another seat\'s key with no party', file: 'src/shell/windows/boss-hall-pane.js', from: 'const seatKeyOf = (st, party) => (party && st && st.key && st.key.own !== true ? st.key : null);', to: 'const seatKeyOf = (st) => (st && st.key ? st.key : null);', want: /BH-5/ },
  { name: 'the confirm never sends for another seat\'s key', file: 'src/shell/windows/boss-hall-pane.js', from: 'if (!hall || (keysOf(cs, hall) < 1 && !seatKeyOf(hallStateOf(cs, hall.id), partyMembershipOf(cs)))) return true;', to: 'if (!hall || keysOf(cs, hall) < 1) return true;', want: /BH-5/ },
  { name: 'the warning says the key is yours when it is a seat\'s', file: 'src/shell/windows/boss-hall-pane.js', from: "const whose = keys > 0 || !seatKey ? W.whose.own : W.whose.seat.replace('{name}', seatKey.name || W.someHero);", to: 'const whose = W.whose.own;', want: /BH-5/ },
  { name: 'the loot line is never shown', file: 'src/shell/windows/boss-hall-pane.js', from: "rows(box.querySelector('.hw-hall-loot'), lootLines(cs, st),", to: "rows(box.querySelector('.hw-hall-loot'), [],", want: /BH-6/ },
  { name: 'a claimed day reads as available', file: 'src/shell/windows/boss-hall-pane.js', from: 'const out = [st.taken ? W.taken : W.left];', to: 'const out = [W.left];', want: /BH-6/ },
  { name: 'the wait reads the browser\'s clock', file: 'src/shell/windows/boss-hall-pane.js', from: '  const now = serverNowOf(cs);\n  if (st.taken', to: '  const now = Date.now();\n  if (st.taken', want: /BH-6/ },
  { name: 'the loot line is made up with no word from the server', file: 'src/session/boss-quote.js', from: "  if (!s || typeof s !== 'object' || typeof s.taken !== 'boolean') return null;", to: "  if (!s || typeof s !== 'object' || typeof s.taken !== 'boolean') return { taken: false, nextAtMs: null, key: null, seats: 1, left: 1 };", want: /BH-6/ },
  { name: 'the first win is never said', file: 'src/shell/windows/boss-hall-pane.js', from: '  if (st.first) out.push(W.first);\n', to: '', want: /BH-7/ },
  { name: 'every hero is promised a first win', file: 'src/session/boss-quote.js', from: 'first: s.first === true,', to: 'first: true,', want: /BH-7|BH-6/ },
  { name: 'the prize table is never shown', file: 'src/shell/windows/boss-hall-pane.js', from: "rows(box.querySelector('.hw-hall-drops'), table,", to: "rows(box.querySelector('.hw-hall-drops'), [],", want: /BH-7/ },
  { name: 'the table never shows the first win\'s numbers', file: 'src/shell/windows/boss-hall-pane.js', from: 'first && sure[i].ch !== d.ch ? W.rowFirst', to: 'false ? W.rowFirst', want: /BH-7/ },
  { name: 'the table shows the first win\'s numbers as every day\'s', file: 'src/shell/windows/boss-hall-pane.js', from: 'const every = prizeSlices(rowsOf, false), sure', to: 'const every = prizeSlices(rowsOf, true), sure', want: /BH-7/ },
  { name: 'nobody is told the key is still used with no loot to take', file: 'src/shell/windows/boss-hall-pane.js', from: 'const none = !!st && st.left === 0;', to: 'const none = false;', want: /BH-6/ },
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
