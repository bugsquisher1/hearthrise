// ════════════════════════════════════════════════════════════════════════
// tests/_alpha-windows.mjs — THE ALPHA WINDOWS' HARNESS: what their guards share. It holds no rule.
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the character's envelope is
// tests/fixtures/alpha-envelope.json; a read-only hook puts the World pane's runtime on window.__world.
//
// THE SPLIT (2026-11-19, arch audit item 7). The windows' rules were ONE guard, tests/alpha-windows.mjs: 6,343 lines,
// 413 mutants on 23 CI shards (run 44508243045: 23 jobs, 20-31.5 min each). Every shard paid a clean control of every
// rule (341-396 s), and a page mutant walked every rule before the one that caught it, so a mutant of the last window
// cost ~385 s. Any edit of a rule re-proved the whole guard. Now one guard a window family; a lane that touches a window
// edits and runs that guard, the gate (tools/mutant-gate.mjs, tools/lib/guard-deps.mjs) scopes a release to the guards
// its diff touches, and each guard's shards are planned from its own measured seconds:
//
//   tests/alpha-windows-inventory.mjs  the Inventory: bag, doll, equip, wells, locks, loot plans, search, selection
//   tests/alpha-windows-storage.mjs    Storage: a press answered in view, amounts, sort, queued presses, bury and cook
//   tests/alpha-windows-hunts.mjs      going out: the Hunts window and Hunt prep (carry in, the builder)
//   tests/alpha-windows-return.mjs     the way home: the hunt summary, Back in town, the coach's steps, the Shop's sale
//   tests/alpha-windows-work.mjs       Gathering and crafting, town work's ticker, the skills
//   tests/alpha-windows-frame.mjs      every window over the World: keys and presses, header, fit, clipping, opacity
//   tests/alpha-windows-pure.mjs       the cross-window pure rules (no browser): intents, the bag model, plans, item truth
//
// HOW THE SPLIT KEEPS EVERY CATCH. Each rule block and rule function moved verbatim, and a guard's page blocks run in the
// monolith's order. Every page mutant moved to the guard holding the block that caught it on the last full sweep (run
// 44508243045, every mutant proved): the blocks before it there passed it, the ones kept before it here are a subset, and
// each block opens its own context, so the same block catches it, by the same rule. A pure mutant moved with its judging
// function. The rule ids each guard holds (a rule id shared by two blocks is in both guards):
//   alpha-windows-inventory  AW-1 AW-2 AW-3 AW-4 AW-5 AW-6 AW-9 AW-10 AW-11 AW-15 AW-21 AW-32 AW-32b AW-33 AW-34 AW-75 AW-77 AW-100
//                            AW-103
//   alpha-windows-storage    AW-18 AW-18b AW-18m AW-18q AW-19 AW-20 AW-23 AW-65
//   alpha-windows-hunts      AW-7 AW-8 AW-25 AW-25b AW-25c AW-25L AW-26 AW-27 AW-28 AW-28b AW-29 AW-35 AW-65 AW-85 AW-86 AW-87
//                            AW-88 AW-89 AW-90 AW-91 AW-92 AW-96 AW-101
//   alpha-windows-return     AW-31 AW-66 AW-67 AW-71 AW-72 AW-74 AW-78 AW-95 AW-98 AW-99 AW-105
//   alpha-windows-work       AW-17 AW-17b AW-22 AW-22F AW-22T AW-22X AW-24 AW-60 AW-60n AW-73 AW-76 AW-102 TK-1 TK-2 TK-3 TK-4 TK-5
//                            TK-6 TK-7 TK-8 TK-8b TK-8c TK-8d TK-9 TK-10
//   alpha-windows-frame      AW-12 AW-13 AW-14 AW-16 AW-17 AW-30 AW-61 AW-62 AW-63 AW-93 AW-94 AW-95
//   alpha-windows-pure       AW-0 AW-0c AW-8 AW-19 AW-20 AW-21 AW-22 AW-25 AW-27 AW-32 AW-60 AW-61 AW-62 AW-63 AW-64 AW-65 AW-70
//                            AW-70b AW-97 AW-104
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { mkdtempSync, cpSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { harnessFail, ruleOf, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';
import { scopedMutants, planShards, checkShards } from '../tools/lib/mutant-scope.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { withServerLevel } from './_server-level.mjs';

export const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* A read-only test hook: the World pane's runtime (its stats() and screenOf()) on window.__world. */
const PANE = 'src/app/world-pane.js';
const PANE_SRC = await readFile(join(ROOT, PANE), 'utf8');
if (!PANE_SRC.includes('    runtime.sync();\n')) throw new Error('alpha-windows: the world-pane hook anchor moved');
const HOOK = { [PANE]: PANE_SRC.replace('    runtime.sync();\n', '    runtime.sync();\n    window.__world = runtime;\n') };
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const LEVEL_5_XP = (await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href)).charXpForLevel(5);
export const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const ITEM_RPCS = ['hr_hunt_after_set', 'hr_item_lock', 'hr_loot_rule_set', 'hr_hunt_preset_save', 'hr_hunt_preset_apply', 'hr_action_set_options', 'hr_hunt_enter', 'hr_bank_move', 'hr_loot_dispatch', 'hr_hunt_restock'];

function scripted() {
  /* Like the real server, the residue a put stores comes back in every later envelope (client_state). */
  const s = { env: clone(FIXTURE), version: 1, calls: [], delayMs: 300, reply: { ok: true }, residue: {} };
  /* Like the real server, its clock moves between answers: the first read is a roster answer aged forward (account-session.js
     agedBy), and a later read stamped at the fixture's fixed `now` looks older, so _noteStorage drops every Storage change after it. */
  const said = s.env.now, born = Date.now();
  /* (A case that sets its own clock, AW-24's, keeps it.) */
  /* The server states the Level itself (hr_state_of's `level` block): the stub states it for the XP a case set (./_server-level.mjs). */
  s.next = () => {
    const e = withServerLevel(clone(s.env));
    return Object.assign(e, { version: ++s.version, client_state: clone(s.residue), now: e.now === said ? new Date(Date.parse(said) + Date.now() - born).toISOString() : e.now });
  };
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    if (s.onCall) s.onCall(name, body);
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') {
      if (body.verb) {
        await new Promise((ok) => setTimeout(ok, s.delayMs));
        /* A refusal the next intent gets (AW-21), the engine's shape (equip.js refusalBody): HTTP 409, nothing moved,
           the whole character at its version riding the answer, the verb echoed, the code saying why. */
        if (s.refuse) {
          const error = s.refuse; s.refuse = null;
          return r.fulfill({ status: 409, contentType: 'application/json',
            body: JSON.stringify(Object.assign(withServerLevel(clone(s.env)), { version: s.version, ok: false, verb: body.verb, error })) });
        }
        if (s.onEdge) s.onEdge(body);
        return json(Object.assign({ ok: true, accrued: true }, s.next()));
      }
      return json(Object.assign({ accrued: true }, s.next()));
    }
    if (ITEM_RPCS.includes(name)) { await new Promise((ok) => setTimeout(ok, s.delayMs)); return json(s.reply); }
    if (name === 'hr_put_client_state') { Object.assign(s.residue, body.p_patch || {}); return json({ ok: true }); }
    if (name === 'hr_account_items') {
      /* AW-75: the server stays silent until the rule lets it answer, or refuses */
      if (s.findGate) await s.findGate;
      if (s.findRefuse) return json({ ok: false, error: s.findRefuse });
      return json({ ok: true, rows: [{ slot: null, name: null, item: 'rat_tail', qty: 4, where: 'bank' }, { slot: 1, name: 'Druid', item: 'rat_tail', qty: 2, where: 'bag' }] });
    }
    return json({ ok: true });
  });
}

/* A (re)load waits for DOMContentLoaded (hunt-screen's LOAD-PROOF): every module script of the boot has run, so the
   app is up and what follows waits for its STATE. Never the `load` event, which also waits for every image and the
   font sheet, none of which a rule reads then (2026-10-22: the first goto timed out at 6 s on a loaded box, the
   server's first answer alone taking 2.7 s). The boot gets BOOT_MS: no rule is about how fast a page boots. */
const BOOTED = 'domcontentloaded';
const BOOT_MS = 60000;

/* A reload: the stub keeps the session, so the page comes back to the character (or its picker). */
export async function reloadAndPlay(page) {
  await page.reload({ waitUntil: BOOTED, timeout: BOOT_MS });
  await wait(page, () => document.querySelector('.hs-launchers') || document.querySelector('[data-app="play"][data-slot="0"]'));
  if (!(await page.$('.hs-launchers'))) await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: BOOTED, timeout: BOOT_MS });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

/* A new full envelope, the way the live game gets one: a settle the SERVER committed (the world tick, another
   member's hello) pushed as a frame carrying the whole character at the next version (2026-12-25-frame-push-
   revive.sql), applied like a load. The stub's settle hook runs as for a plain settle (`s.onCall`, no verb), but no
   call is logged: the client asked for nothing. */
export async function pushEnvelope(page, s) {
  if (s.onCall) s.onCall('hr-accrue', {});
  const e = s.next();
  await page.evaluate(([uid, env]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: env.version, env }), [UID, e]);
  await page.waitForTimeout(250);
}

/* Close every open window (Esc closes the top one; with none open it would open Settings), then open one by its key. */
export async function openWin(page, key, id) {
  for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
  }
  await page.keyboard.press(key);
  return wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"] [data-hs-built]'), id, 3000);
}
export const count = (page, id) => page.evaluate((i) => { const li = document.querySelector('.hw-pocket[data-item="' + i + '"]'); return li ? li.querySelector('.hw-count').textContent : null; }, id);
export const sent = (s, name, verb) => s.calls.filter((c) => c.name === name && (!verb || c.body.verb === verb));

// ── the page run ────────────────────────────────────────────────────────────
/* A mutant needs ONE named red rule, the same rule verdict() reads first: the run stops there instead of walking every
   rule to the end (each browser mutant cost a whole suite, ~154 s, on run 41339988105). A HARNESS line does not stop it,
   so a later named rule still judges exactly as before. The clean control and the plain run see every rule. */
const STOP = Symbol('first red');

/** One guard's page rules: its pure rules first when nothing is planted (a page mutant never runs them), then ONE stub
    server serving `overrides` in place of their files and ONE Chromium, and `body({ fails, open, shot })` runs the rules in
    their order. `open(o)` is a fresh context signed in to the fixture character (o.viewport, o.mutateEnv, o.residue);
    `shot(page, name)` writes a visual-gate screenshot under --shots. The fail lines. */
export async function pageRun(overrides, shots, { stopAtFirst = false } = {}, pure, body) {
  const fails = overrides || !pure ? [] : await pure();
  if (stopAtFirst) fails.push = function (...a) { Array.prototype.push.apply(this, a); if (a.some((x) => ruleOf(x))) throw STOP; return this.length; };
  const { server, port } = await serve(Object.assign({}, HOOK, overrides || {}));
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = scripted();
    if (o.mutateEnv) o.mutateEnv(s.env);
    if (o.residue) Object.assign(s.residue, o.residue);
    await stub(page, s);
    const up = await signInAndPlay(page, base);
    return { ctx, page, errors, s, up };
  };
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
  try {
    await body({ fails, open, shot });
  } catch (e) {
    /* A step that threw is HARNESS, never a rule (2026-10-22: AW-8's disabled click "caught" every later
       mutant). A rule whose control a mutant can hide checks for the control and fails BY NAME. */
    if (e !== STOP) fails.push(harnessFail('a page step', e));
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

// ── the command line every alpha-windows guard shares ───────────────────────
// g = { guard: 'tests/alpha-windows-x.mjs', green: what its plain run proves, pure: () => fails | null (its pure rules),
//       checks: (overrides, shots, opts) => fails | null (its page rules), mutants: its MUTANTS, companion: its COMPANION,
//       judges: { name prefix: (over, file) => fails } (a mutant so named is judged by a pure rule on a planted src, never the page) }
const nameOf = (g) => g.guard.replace(/^tests\//, '').replace(/\.mjs$/, '');

/** The plain run (and --pure, --shots <dir>). Exit code. */
export async function plain(g, argv = process.argv) {
  const name = nameOf(g);
  const at = argv.indexOf('--shots');
  const shots = at > 0 ? resolve(argv[at + 1] || 'alpha-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  const pureOnly = argv.includes('--pure');
  if (pureOnly && !g.pure) { console.log(name + ' --pure: no pure rules here (its rules are in the page)'); return 0; }
  const fails = pureOnly || !g.checks ? await g.pure() : await g.checks(null, shots);
  for (const f of fails) console.log('  ✗ ' + f);
  const tag = pureOnly ? ' --pure' : '';
  console.log(fails.length ? name + tag + ': ' + fails.length + ' rule(s) RED' : name + tag + ': ' + (pureOnly ? 'the pure rules hold' : g.green) + (shots ? ' (shots in ' + shots + ')' : ''));
  return fails.length ? 1 : 0;
}

/** --mutate [--only=<prefix>] [--shard=K/N]: every planted defect must turn a NAMED rule red. Exit code (tests/_mutant-verdict.mjs). */
/* ONE PROCESS A PURE MUTANT (main run 44835810099, the full proofs): a pure judge imports a whole copy of src per mutant, and ES
   modules never unload, so one process holding every copy reached V8's 2 GB heap on GitHub (alpha-windows-pure after the AW-65 plans),
   under a spray of "a listener failed RangeError: Maximum call stack size exceeded" from every copy's listeners on the shared
   globals. Each pure mutant is judged in a child process (`--one-mutant=<name>`), which prints its verdict and exits with its copy. */
const ONE = '--one-mutant=';
function plantOf(g, n, file, from, to, read) {
  const over = {};
  for (const [f, x, y] of [[file, from, to]].concat(g.companion[n] ? [g.companion[n]] : [])) {
    const text = over[f] !== undefined ? over[f] : read(f);
    if (!text.includes(x)) return { missing: f };
    over[f] = text.replace(x, y);
  }
  return { over };
}
function verdictIn(g, n) {
  const r = spawnSync(process.execPath, [join(ROOT, g.guard), '--mutate', ONE + n], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const line = String(r.stdout || '').split('\n').reverse().find((l) => l.startsWith('VERDICT '));
  if (line) { try { return JSON.parse(line.slice(8)); } catch { /* below */ } }
  return { kind: 'harness', why: 'the mutant\'s process exited ' + r.status + ' with no verdict: ' + String(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' | ').slice(0, 240) };
}

export async function mutate(g, argv = process.argv) {
  const name = nameOf(g);
  const one = (argv.find((x) => x.startsWith(ONE)) || '').slice(ONE.length);
  if (one) {   // the child: judge exactly this pure mutant, say its verdict, exit with its copy of src
    const m = g.mutants.find(([n]) => n === one);
    const by = m && Object.keys(g.judges).find((p) => one.startsWith(p));
    const p = m && plantOf(g, one, m[1], m[2], m[3], (f) => readFileSync(join(ROOT, f), 'utf8'));
    const v = !m || !by ? { kind: 'harness', why: 'no pure mutant named ' + one }
      : p.missing ? { kind: 'harness', why: 'anchor not found in ' + p.missing } : await judge(() => g.judges[by](p.over, m[1]));
    console.log('VERDICT ' + JSON.stringify(v));
    return 0;
  }
  /* --only=<prefix>: just the mutants whose name starts with it (`--only=ticker:` re-proves the town ticker in seconds:
     its clean control is the pure rules, which are all that judge those mutants). */
  const only = (argv.find((x) => x.startsWith('--only=')) || '').slice(7);
  const sharded = shardOf(g, argv);
  const picked = sharded && only ? sharded.filter(([n]) => n.startsWith(only)) : sharded;
  if (!picked || !picked.length) { console.log('  ✗ HARNESS: bad --shard (want --shard=K/N with 1 <= K <= N) or no mutant matches --only'); return 2; }
  /* A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs); the nightly proves them all. */
  const shard = (argv.find((x) => x.startsWith('--shard=')) || '').slice(8);
  const mine = scopedMutants(g.guard, picked, { companion: Object.fromEntries(Object.entries(g.companion).map(([k, v]) => [k, [v[0]]])), tag: shard ? ' (shard ' + shard + ')' : '' });
  if (!mine.length) return 0;
  const judgeOf = (n) => Object.keys(g.judges).find((p) => n.startsWith(p));
  const pureOnly = mine.every(([n]) => judgeOf(n));
  const clean = await cleanControl(() => (pureOnly ? g.pure() : g.checks(null, null)));
  console.log(clean.line);
  if (clean.code) return clean.code;
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [n, file, from, to] of mine) {
    const over = {};
    const plant = [[file, from, to]].concat(g.companion[n] ? [g.companion[n]] : []);
    let missing = null;
    for (const [f, x, y] of plant) {
      const text = over[f] !== undefined ? over[f] : await readFile(join(ROOT, f), 'utf8');
      if (!text.includes(x)) { missing = f; break; }
      over[f] = text.replace(x, y);
    }
    if (missing) { console.log('  ✗ ' + n + ' — HARNESS: anchor not found in ' + missing); counts.harness++; continue; }
    const by = judgeOf(n);
    const v = by ? verdictIn(g, n) : await judge(() => g.checks(over, null, { stopAtFirst: true }));
    console.log(report(n, v, counts));
  }
  console.log(exitOf(counts) ? name + ' --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : name + ' --mutate: ' + mine.length + '/' + mine.length + ' mutants caught, each by a named rule' + (mine === g.mutants ? '' : ' (' + (only ? '--only=' + only + ', ' : '') + 'of ' + g.mutants.length + ')'));
  return exitOf(counts);
}

/* --shard=K/N: the Kth of N shards, BALANCED BY MEASURED TIME (2026-11-15, lane a-133-ci-time). Round-robin by index
   (every Nth mutant) booked equal COUNTS, never equal minutes: a page mutant costs seconds to minutes (stopAtFirst: caught by
   its first red rule), a pure one under a second. On release/v0.2.132 (run 43714997994, every mutant run) the six shards took
   39 to 66 min and two were CANCELLED at 60 with nothing escaped. planShards (tools/lib/mutant-scope.mjs, hunt-screen's
   planner) books each mutant at its seconds in tests/<guard>.mutant-times.json; checkShards proves the plan a
   partition. --shard-plan checks the plan against smoke.yml without a browser. Null for a malformed shard. */
function shardOf(g, argv) {
  const a = argv.find((x) => x.startsWith('--shard='));
  if (!a) return g.mutants;
  const m = /^--shard=(\d+)\/(\d+)$/.exec(a);
  const k = m ? +m[1] : 0, n = m ? +m[2] : 0;
  if (!(k >= 1 && k <= n)) return null;
  const names = g.mutants.map(([name]) => name);
  const plan = planShards(names, n, mutantSeconds(g.guard));
  const broken = checkShards(names, plan);
  if (broken.length) { console.log('  ✗ HARNESS: the shard plan is not a partition: ' + broken.join('; ')); return null; }
  const mine = new Set(plan[k - 1].names);
  console.log('  shard ' + k + '/' + n + ': ' + mine.size + ' mutant(s), ~' + Math.round(plan[k - 1].seconds / 60) + ' min booked');
  return g.mutants.filter(([name]) => mine.has(name));
}

/* Seconds per mutant (tests/<guard>.mutant-times.json, tools/mutant-times.mjs); none read = every mutant booked alike. */
function mutantSeconds(guard) {
  try { return JSON.parse(readFileSync(join(ROOT, guard.replace(/\.mjs$/, '.mutant-times.json')), 'utf8')).seconds || {}; } catch { return {}; }
}

/* A shard's booked mutant time. A shard job is ~0.6 min of setup (checkout to Chromium) and its guard's clean control (the
   nightly runs one per shard; a gated push leans on the plain run) before its booked mutants. Under the one 6,343-line
   guard that control was every rule, ~6 min a shard (run 44508243045: 341-396 s); a family's is its own rules (0.5-1.5 min).
   22 min booked keeps a shard job near 25 of its 50 (x2). Over it, add a shard (smoke.yml + ci-shape --write); re-measure
   the times file from a run that proves every mutant (a nightly) when a shard nears it. */
const SHARD_BUDGET_S = 22 * 60;

/** --shard-plan (no browser): smoke.yml registers this guard's shards 1..N of one N, the plan for that N is a partition of
    its MUTANTS, and no shard is booked over SHARD_BUDGET_S. Then four planted defects must each be caught, so the check has
    been red. Exit code. */
export async function shardPlan(g) {
  const yml = await readFile(join(ROOT, '.github', 'workflows', 'smoke.yml'), 'utf8');
  const name = nameOf(g);
  const names = g.mutants.map(([n]) => n);
  const seconds = mutantSeconds(g.guard);
  const cmd = 'node ' + g.guard + ' --mutate --shard=';
  const registered = (text) => [...text.matchAll(new RegExp(cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)\\/(\\d+)', 'g'))].map((x) => [+x[1], +x[2]]);
  const judgePlan = (text, plan = planShards, budget = SHARD_BUDGET_S) => {
    const out = [];
    const reg = registered(text);
    const ns = [...new Set(reg.map(([, n]) => n))];
    if (ns.length !== 1) return [`smoke.yml registers ${name} shards of ${ns.length} different N (${ns.join(', ') || 'none'})`];
    const n = ns[0];
    for (let k = 1; k <= n; k++) {
      const c = reg.filter(([x]) => x === k).length;
      if (c !== 1) out.push(`shard ${k}/${n} is registered ${c} time(s) in smoke.yml`);
    }
    const p = plan(names, n, seconds);
    out.push(...checkShards(names, p));
    p.forEach((s, i) => { if (s.seconds > budget) out.push(`shard ${i + 1}/${n} is booked ${Math.round(s.seconds / 60)} min > ${Math.round(budget / 60)} — add a shard`); });
    return out;
  };
  const real = judgePlan(yml);
  const reg = registered(yml);
  const n = reg.length ? reg[0][1] : 0;
  const unmeasured = names.filter((k) => !(Number.isFinite(seconds[k]) && seconds[k] > 0));
  if (unmeasured.length) console.log(`  ${unmeasured.length} mutant(s) not in ${name}.mutant-times.json, booked at the slowest measured: ${unmeasured.join(' | ')}`);
  if (n) planShards(names, n, seconds).forEach((s, i) => console.log(`  shard ${i + 1}/${n}: ${s.names.length} mutants, ~${Math.round(s.seconds / 6) / 10} min booked`));
  for (const f of real) console.log('  ✗ ' + f);
  const planted = [
    ['a shard dropped from smoke.yml', judgePlan(yml.replace(`${cmd}${n}/${n}`, `node ${g.guard} --mutate --shard-dropped`))],
    ['the old round-robin off by one (the last mutant runs nowhere)', judgePlan(yml, (ns, k) => Array.from({ length: k }, (_, i) => ({ names: ns.slice(0, -1).filter((_, j) => j % k === i), seconds: 0 })))],
    /* the last shard's first mutant again in the first (with one shard, twice in it) */
    ['a mutant planned twice', judgePlan(yml, (ns, k, s) => { const p = planShards(ns, k, s); p[0].names.push(p[p.length - 1].names[0]); return p; })],
    ['a shard booked over its budget', judgePlan(yml, planShards, 60)],
  ];
  let vacuous = 0;
  for (const [label, found] of planted) {
    if (!found.length) vacuous++;
    console.log(`  ${found.length ? 'caught' : 'MISSED'}  planted: ${label}${found.length ? ' — ' + found[0] : ''}`);
  }
  const bad = real.length + vacuous;
  console.log(bad ? `${name} --shard-plan: ${real.length} problem(s), ${vacuous} planted defect(s) missed`
    : `${name} --shard-plan: ${names.length} mutants over ${n} shard(s), each exactly once, every shard within ${SHARD_BUDGET_S / 60} min; 4/4 planted defects caught`);
  return bad ? 1 : 0;
}

/* A pure mutant is judged by its pure rule function, run from a temp copy of src (minus the vendored SDK) with the
   planted files written in: the working tree is never touched, and each copy is a fresh module graph. */
export async function tickerMutant(over, rules) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-ticker-'));
  try {
    cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
    for (const [f, text] of Object.entries(over)) writeFileSync(join(tmp, f), text);
    return await rules(tmp);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
