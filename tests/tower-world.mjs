#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tower-world.mjs — THE BURNING TOWER, PLAYED: A CLIMB AND A KEY ON THE REAL GAME, NO PRODUCTION.
//
//   node tests/tower-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and the real hr-accrue engine on the replayed chain (2027-04-24-tower-climb.sql,
// 2027-04-27-tower-chest.sql and 2027-04-28-tower-section.sql included), a brand-new account made from the sign-in screen. A MANUAL WALK
// (Node 23.6+, the chain's first replay), like honor-roll-world; CI guards the halves: tests/tower-window.mjs (the window, mutation-proven),
// tests/tower-climb.mjs and tests/tower-chest.mjs (the server, mutation-proven), tests/envelope-contract.mjs (the section's shape).
//   TOW-1  the chain ends with the switch ON for everyone (2027-05-03-tower-arm.sql); put back OFF (as seeded) and the page reloaded: the
//          envelope carries no `tower`, the Havora window has no Tower door, and hr_tower_start refuses feature_off: nothing shows and nothing opens
//   TOW-2  the switch ON for everyone again (as the chain leaves it): the Tower window shows floor 1 as the only start, Enter opens a climb
//          (the server's tower_runs row), and the hunt bar says the floor
//   TOW-3  VIEWED: the page open while the real tick settles the climb; the server writes the floors, clears landing 40 (the Bronze Key's generated first landing) and mints its Bronze
//          Key (the mint's own ledger row); the hero leaves and the end card says the floors and the key, never "died"
//   TOW-4  THE CHEST: the window shows the key the server minted with the server's chance; Use opens it on the server (a chest_opens row,
//          the key gone from the bag, the Cinders paid) and the answer is drawn
//   TOW-5  BROWSER CLOSED: a second climb from floor 11 (checkpoint 10, the server's list: Tyler 2026-11-16 CHECKPOINTS), the page closed, the climb
//          keeps settling on the server until it ends; back on the page the window and the card read the server's run; a climb that ends
//          `died` cost no Level XP (the run's ledger) and opened no death popup
//   TOW-6  nothing left the machine, no console error
// Screenshots (--shots): the climb at 1440x900, the chest, the end card, and the window at 922x423.
// mutant-anchors: none — a manual walk of the real game; the rules are mutation-proven in tower-window.mjs, tower-climb.mjs, tower-chest.mjs
// ════════════════════════════════════════════════════════════════════════
import { resolve as resolvePath } from 'node:path';
import { openWorld } from '../tools/qa/local-world.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 500)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};
const until = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
/* A climb's end card as text (in the page): its label rows, its keys, and how tall the run is drawn up the stack. */
const climbCard = () => {
  const c = document.querySelector('.hsum-climb:not([hidden])');
  if (!c) return '';
  const run = c.querySelector('.tt-run');
  return Array.from(c.querySelectorAll('.te-rows .tt-row')).map((r) => r.children[0].textContent + ': ' + r.children[1].textContent)
    .concat(Array.from(c.querySelectorAll('.te-key .tt-next-name')).map((k) => k.textContent), [run && !run.hidden ? 'run: ' + parseFloat(run.style.height) : 'no run']).join('\n');
};

let world;
try { world = await openWorld({ tickMs: false }); } catch (e) { console.error('tower-world: the world would not open: ' + e.message); process.exit(2); }
step('world up: chain replayed and opened, engine loaded', true);
let code = 0;
try {
  const sql = async (q, a) => (await world.db.query(q, a)).rows;
  const p = await world.play({ account: 'climber', viewport: { width: 1440, height: 900 }, shots });
  await p.createHero('Ashby');
  const [{ user_id: uid }] = await sql('select user_id from public.player_state where slot = 0');
  const play = async () => {
    await p.reload();
    if (await p.page.$('[data-app="play"][data-slot="0"]')) await p.page.click('[data-app="play"][data-slot="0"]');
    await p.page.waitForSelector('.hs-launchers');
  };
  const door = async () => {
    if (!(await p.page.$('[data-hs-win="havora"]'))) await p.page.keyboard.press('x');
    await p.page.waitForSelector('[data-hs-win="havora"] .hv-pane.is-on');
    await p.page.waitForTimeout(300);
    return p.page.evaluate(() => { const e = document.querySelector('[data-hs-win="havora"] .hv-tower'); return !!e && !e.hidden; });
  };
  const openTower = async (tab) => {
    if (!(await door())) return false;
    await p.page.click('[data-hs-win="havora"] [data-hs-act="tower"]');
    const up = await until(p.page, () => document.querySelector('[data-hs-win="tower"] .tt-pane.is-on'));
    if (up && tab) await p.page.click('[data-hs-win="tower"] .hw-tab[data-tab="' + tab + '"]');
    await p.page.waitForTimeout(500);
    return up;
  };
  const closeWins = async () => { for (let i = 0; i < 3; i++) { await p.page.keyboard.press('Escape'); await p.page.waitForTimeout(150); } };

  // ── TOW-1 ── the chain ends with the switch on for everyone (2027-05-03-tower-arm.sql); put back off here (its seeded state), the page reloaded
  const armed = await sql(`select scope, accounts::text as accounts from public.hr_feature_switches where switch_id = 'burning_tower'`);
  await sql(`update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'burning_tower'`);
  await play();
  const env0 = await sql('select public.hr_state_of($1, 0) ? \'tower\' as has, public.hr_state_of($1, 0)->\'tower\' as tower', [uid]);
  const shown0 = await door();
  await sql("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  const off = (await sql(`select public.hr_tower_start(0, 1, gen_random_uuid()) as r`))[0].r;
  await sql("select set_config('request.jwt.claim.sub', '', false)");
  step('TOW-1 the chain arms the switch for everyone', armed[0].scope === 'everyone' && armed[0].accounts === '{}', JSON.stringify(armed));
  step('TOW-1 switch off: no section, no door, the door refuses feature_off', (!env0[0].has || env0[0].tower === null) && !shown0
    && off.error === 'feature_off', JSON.stringify({ env0, shown0, off }));
  await closeWins();

  /* THE HERO: a Level 90 with Level 90 combat skills in an iron kit (the throwaway local database only), so forty floors are a climb it can make (the Bronze Key's
     first landing is generated: the floor whose Level reaches its weapons' item Level, 40; src/data/chests.js landingForLevel) */
  await sql(`update public.player_state set level_xp = public.hr_char_xp_for_level(90), stamina_ms = 28800000, stamina_at = now() where user_id = $1 and slot = 0`, [uid]);
  for (const sk of ['melee', 'ranged', 'magic', 'defense']) {
    await sql(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, $2, public.hr_skill_xp_for_level($2, 90))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, sk]);
  }
  /* the iron kit (tools/balance-sim/gear.mjs kitOf('tank', 20)): a bare hero tops out near floor 15 on the formulas' floors */
  for (const [slot, item] of [['weapon', 'iron_sword'], ['shield', 'ironbound_shield'], ['helmet', 'iron_helm'], ['body', 'iron_platebody'],
    ['pants', 'iron_platelegs'], ['boots', 'iron_boots'], ['gloves', 'iron_gauntlets'], ['belt', 'iron_belt']]) {
    await sql(`insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id`, [uid, slot, item]);
  }
  // ── TOW-2 ── the switch back as the chain leaves it: on for everyone
  await sql(`update public.hr_feature_switches set scope = 'everyone', accounts = '{}' where switch_id = 'burning_tower'`);
  await play();
  const opened = await openTower();
  const starts = await p.page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="tower"] .tt-start-pick option')).map((o) => o.value));
  step('TOW-2 switch on for everyone: the window opens on floor 1 (checkpoint 0), the one start', opened && starts.join() === '0', JSON.stringify({ opened, starts }));
  await p.shot('tower-climb-1440x900');
  await p.page.click('[data-hs-win="tower"] .tt-go');
  const went = await until(p.page, () => !!document.querySelector('[data-hs-act="leave"]'), null, 60000);
  const run1 = await sql('select session_id, start_floor from public.tower_runs where user_id = $1 order by started_at', [uid]);
  step('TOW-2 Enter opened a climb on floor 1 (the server\'s run)', went && run1.length === 1 && run1[0].start_floor === 1, JSON.stringify(run1));
  await closeWins();
  /* the live view runs the climb: the bar says the floor and the room's time (the prediction from the server's tower_floor) */
  const barUp = await until(p.page, () => /^Floor \d+/.test(document.querySelector('.ht-tower:not([hidden]) .ht-floor')?.textContent || '')
    && /left$/.test(document.querySelector('.ht-tower .ht-floor-left')?.textContent || ''), null, 30000);
  const barNow = await p.page.evaluate(() => document.querySelector('.ht-tower')?.textContent || '');
  step('TOW-2 the hunt bar says the floor and its time left while the climb plays live', barUp, JSON.stringify(barNow));
  await p.shot('tower-climbing-1440x900');

  // ── TOW-3 viewed ──
  let landed = [];
  for (let i = 0; i < 8 && !landed.length; i++) {
    await world.skip(4);
    landed = await sql(`select (meta->>'landing')::int as landing from public.player_ledger where user_id = $1 and intent = 'tower_key'`, [uid]);
    const open = await sql('select count(*)::int as n from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]);
    if (!open[0].n) break;
  }
  const bar = await p.page.evaluate(() => { const e = document.querySelector('.ht-tower'); return e ? { hidden: e.hidden, text: e.textContent } : null; });
  const keyRow = await sql(`select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'tower_key_bronze'`, [uid]);
  const best = await sql('select best_floor, best_landing from public.tower_progress where user_id = $1', [uid]);
  step('TOW-3 viewed: the server wrote landing 40 and minted its Bronze Key', landed.some((l) => l.landing === 40) && keyRow.length && Number(keyRow[0].qty) === landed.length,
    JSON.stringify({ landed, keyRow, best }));
  step('TOW-3 the hunt bar said the floor while the climb ran', !bar || bar.hidden ? (await sql('select count(*)::int as n from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]))[0].n === 0 : /^Floor \d+/.test(bar.text),
    JSON.stringify(bar));
  const stillOpen = (await sql('select count(*)::int as n from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]))[0].n;
  if (stillOpen) {
    await p.page.click('[data-hs-act="leave"]');
    await world.skip(1);
  }
  const card = await until(p.page, () => /Floors cleared/.test(document.querySelector('.hsum-climb:not([hidden]) .te-rows')?.textContent || ''), null, 60000);
  const reason = await p.page.evaluate(climbCard);
  step('TOW-3 the end card draws the run and says the floors and the key, never "died"', card && /Floors cleared: 1 to \d+/.test(reason) && /Bronze Key x\d+/.test(reason) && /run: \d+/.test(reason)
    && !/died/i.test(reason) && !(await p.page.$('[data-hs-win="death"]')), reason);
  await p.shot('tower-end-card-1440x900');

  // ── TOW-4 the chest ──
  await closeWins();
  await openTower('chest');
  const chest = await p.page.evaluate(() => ({ have: document.querySelector('[data-hs-win="tower"] .tc-pick[data-key="bronze"] .tc-pick-n')?.textContent,
    chance: 'Chance: ' + document.querySelector('[data-hs-win="tower"] .tc-chance-v')?.textContent,
    use: document.querySelector('[data-hs-win="tower"] .tc-use')?.disabled }));
  const sec = (await sql('select public.hr_tower_section($1, 0)->\'chest\'->\'keys\'->0 as k', [uid]))[0].k;
  const want = 'Chance: ' + Number((sec.chance_ppm / 10000).toPrecision(2)) + '%';
  step('TOW-4 the chest shows the minted key and the server\'s chance', chest.have === 'x' + Number(keyRow[0].qty) && chest.chance === want && chest.use === false, JSON.stringify({ chest, want }));
  await p.shot('tower-chest-1440x900');
  const cinders0 = await sql(`select coalesce(sum(qty), 0)::int as n from public.player_inventory where user_id = $1 and item_id = 'tower_cinders'`, [uid]);
  await p.page.click('[data-hs-win="tower"] .tc-use');
  const drawn = await until(p.page, () => /^Loot/.test(document.querySelector('[data-hs-win="tower"] .tt-result')?.textContent || ''), null, 30000);
  const opens = await sql('select key_id, stokes, weapon from public.chest_opens where user_id = $1', [uid]);
  const left = await sql(`select coalesce(sum(qty), 0)::int as n from public.player_inventory where user_id = $1 and item_id = 'tower_key_bronze'`, [uid]);
  const cinders1 = await sql(`select coalesce(sum(qty), 0)::int as n from public.player_inventory where user_id = $1 and item_id = 'tower_cinders'`, [uid]);
  step('TOW-4 Use opened the key on the server and drew its answer', drawn && opens.length === 1 && opens[0].key_id === 'bronze' && left[0].n === Number(keyRow[0].qty) - 1 && cinders1[0].n > cinders0[0].n,
    JSON.stringify({ drawn, opens, left, cinders0, cinders1 }));
  await p.shot('tower-chest-opened-1440x900');

  // ── TOW-5 browser closed ──
  await closeWins();
  await openTower('climb');
  const starts2 = await p.page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="tower"] .tt-start-pick option')).map((o) => o.value));
  await p.page.selectOption('[data-hs-win="tower"] .tt-start-pick', '10').catch(() => {});
  await p.page.click('[data-hs-win="tower"] .tt-go');
  await until(p.page, () => !!document.querySelector('[data-hs-act="leave"]'), null, 60000);
  const run2 = await sql('select session_id, start_floor from public.tower_runs where user_id = $1 order by started_at desc limit 1', [uid]);
  step('TOW-5 the second climb starts on floor 11 (checkpoint 10), the server\'s list', starts2.includes('10') && run2[0].start_floor === 11, JSON.stringify({ starts2, run2 }));
  const xp0 = (await sql('select level_xp::bigint as x from public.player_state where user_id = $1 and slot = 0', [uid]))[0].x;
  const url = p.page.url();
  await p.page.goto('about:blank');
  for (let i = 0; i < 20; i++) {
    await world.skip(5, { away: true });
    if (!(await sql('select count(*)::int as n from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]))[0].n) break;
  }
  const r2 = (await sql('select start_floor, top_floor, floors, end_reason from public.tower_runs where session_id = $1', [run2[0].session_id]))[0];
  const xp1 = (await sql('select level_xp::bigint as x from public.player_state where user_id = $1 and slot = 0', [uid]))[0].x;
  const debit = await sql(`select count(*)::int as n from public.player_ledger where user_id = $1 and session_id = $2 and xp_in < 0`, [uid, run2[0].session_id]).catch(() => [{ n: 0 }]);
  step('TOW-5 closed: the climb settled on the server to its end, and lost no Level XP', !!r2.end_reason && r2.floors > 0 && Number(xp1) >= Number(xp0) && debit[0].n === 0,
    JSON.stringify({ r2, xp0, xp1, debit }));
  await p.page.goto(url, { waitUntil: 'load' });
  await p.page.waitForSelector('.char-row, .hs-launchers');
  if (await p.page.$('[data-app="play"][data-slot="0"]')) await p.page.click('[data-app="play"][data-slot="0"]');
  await p.page.waitForSelector('.hs-launchers');
  await p.page.waitForTimeout(1500);
  const back = { reason: await p.page.evaluate(climbCard), death: !!(await p.page.$('[data-hs-win="death"]')) };
  const wantTop = r2.top_floor;
  step('TOW-5 back on the page: the card reads the server\'s run, no death popup', !back.death && (back.reason === '' || (new RegExp('Floors cleared: 11 to ' + wantTop).test(back.reason) && !/died/i.test(back.reason))),
    JSON.stringify({ back, r2 }));
  await closeWins();
  await openTower('climb');
  const best2 = await p.page.evaluate(() => document.querySelector('[data-hs-win="tower"] .tt-big')?.textContent);
  const bestRow = (await sql('select best_floor from public.tower_progress where user_id = $1', [uid]))[0];
  step('TOW-5 the window\'s best is the server\'s', best2 === String(bestRow.best_floor), JSON.stringify({ best2, bestRow }));
  await p.page.setViewportSize({ width: 922, height: 423 });
  await p.page.waitForTimeout(800);
  await p.shot('tower-climb-922x423');

  // ── TOW-6 ──
  step('TOW-6 nothing left the machine, no console error', !world.offsite.length && !p.offsite.length && !p.errors.length,
    JSON.stringify({ offsite: world.offsite.concat(p.offsite), errors: p.errors.slice(0, 5) }));
} catch (e) {
  console.error('tower-world: harness: ' + (e && e.stack || e));
  code = 2;
} finally {
  await world.close();
}
console.log(code ? 'tower-world: HARNESS' : fails.length ? 'tower-world: ' + fails.length + ' step(s) RED' : 'tower-world: hidden while off; on for one account, a climb viewed and one with the browser closed, the landing\'s key minted by the server and opened at the chest; no death, no XP lost');
process.exit(code || (fails.length ? 1 : 0));
