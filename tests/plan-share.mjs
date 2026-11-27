#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/plan-share.mjs — SHARE PLAN: A CODE MADE ON ONE ACCOUNT REBUILDS THE PLAN ON A SECOND, A TAMPERED CODE IS REFUSED
//   (lane/wn-sh SH, 2026-11-26; docs/design/redesign/20-v030-the-roads.md band 5 "A code pasted on a second account rebuilds the plan").
//   src/core/plan-code.js (the code), src/session/plan-share.js (the hero's side: its plan, the editor, the press), src/session/
//   talent-intents.js saveBuild (hr_talent_build_save), src/shell/windows/plan-share.js (the window's words).
//
//   node tests/plan-share.mjs            the guard (the replayed chain for SH-PASTE, the real client modules)
//   node tests/plan-share.mjs --mutate   every planted defect (in a temp copy of src) must turn its arm red
//
// mutant-anchors: src/core/plan-code.js src/session/plan-share.js src/session/talent-intents.js src/shell/windows/plan-share.js src/styles/windows.css
// ci-step: db-replay | Share plan - a code made on one account rebuilt on a second, a tampered code refused
// ci-run: node tests/plan-share.mjs
// ci-run: node tools/mutant-gate.mjs node tests/plan-share.mjs --mutate
//
//   SH-ROUND   every country's suggested build at Levels 2, 10, 40 and 200, with every ground, stance and line, comes back from its code
//              exactly; a code holds no number but an open road's count, and nothing a decode would refuse
//   SH-TAMPER  a code changed by hand is refused, never half-read: one character changed (code_damaged), a re-sealed code naming an unknown
//              ground, stance, node or option, a road that does not connect, a bare key, a repeated key, another version, an overlong
//              paste; an open road's count past the bound is clamped; whitespace a chat line wrapped in is dropped; the window says each
//              refusal in a genre label, never the code word
//   SH-PASTE   THE TWO ACCOUNTS, the real chain (PGlite), the Talents switch on in the rolled-back fixture: account A's hero holds a plan
//              (Muster Barrows, Bold, If one falls: All come home, a Level 40 saved build there, its Level 5 points on the road by the standing rule) through the real RPCs;
//              its real CharacterSession makes the code. Account B's fresh Level 1 hero pastes it: the editor lists the changes, Use this
//              plan sends ONLY B's own intents (hr_hero_plan_set, hr_hunt_risk_set, hr_company_line_set, hr_talent_build_save, each naming
//              B's slot under B's token), and a reload of B reads A's plan back from the server. A's rows are untouched, B spent no point
//              (a plan is saved, never spent), and a second press sends nothing ("Already your plan")
//   SH-REFUSED a tampered paste sends nothing: no draft, no RPC
//   SH-LOOK    the code boxes are as tall as the code (field-sizing: content, rows 2 as the fallback), never resizable wells (visual read
//              2026-11-26: a one-line code sat in a 72 px box with a resize grip)
// Exit: 0 green · 1 a red arm or an escaped mutant · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { planted } from './_pure-guard.mjs';

const MUTATE = process.argv.includes('--mutate');
const imp = (base, f) => import(pathToFileURL(join(base, f)).href);
const idem = () => crypto.randomUUID();
const U = (n) => `000000c0-0000-4000-8000-0000000cb${String(n).padStart(3, '0')}`;
const GROUND = 'muster_barrows';

/* As PostgREST calls it: the JWT subject set, `set role authenticated`, the rate counters cleared (a fixture presses faster than a hand). */
async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.query('savepoint as_call');
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; await db.query('release savepoint as_call'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint as_call'); throw e; }
  finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)"); }
}
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
const call = (db, uid, name, args) => {
  const keys = Object.keys(args);
  return as(db, uid, `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
    keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
};
/* One account's server link as the client sees it: every RPC under that account's token, each one written down. */
function serverFor(db, uid, log) {
  return {
    rpc: async (name, args) => { log.push({ uid, name, args }); return { ok: true, status: 200, body: await call(db, uid, name, args), closed: false }; },
    accrue: async () => ({ ok: false, status: 0, error: 'network' }),
  };
}
async function hero(db, uid, name) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'plan-share') on conflict (user_id) do nothing", [uid]);
  const c = await as(db, uid, 'select public.hr_create_character(0)', []);
  if (!c || c.ok !== true) throw Object.assign(new Error('hr_create_character refused: ' + JSON.stringify(c)), { harness: true });
  const nm = await as(db, uid, 'select public.hr_character_name_set(0, $1, $2::uuid)', [name, idem()]);
  if (!nm || nm.ok !== true) throw Object.assign(new Error('naming refused: ' + JSON.stringify(nm)), { harness: true });
}
const ok = (r, what) => { if (!r || r.ok !== true) throw Object.assign(new Error(what + ' refused: ' + JSON.stringify(r).slice(0, 200)), { harness: true }); return r; };

/* Re-seal a hand-edited payload, as a forger would (the check is no seal): only the decode's own catalogue checks stand. */
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36).padStart(7, '0'); };
const seal = (payload, v = 1) => 'HR' + v + '-' + btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '-' + fnv(payload);
const payloadOf = (code) => atob(code.split('-')[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.split('-')[1].length % 4)) % 4));

const ARMS = {
  'SH-ROUND': async (base) => {
    const p = [];
    const C = await imp(base, 'src/core/plan-code.js'), T = await imp(base, 'src/core/talents.js'), D = await imp(base, 'src/data/talents.js');
    const { OPEN_HUNTS } = await imp(base, 'src/data/hunts.js'), { RISKS } = await imp(base, 'src/data/danger.js');
    const countries = Object.keys(D.COUNTRY_ROADS).filter((c) => c !== D.HEARTH), risks = Object.keys(RISKS);
    let n = 0;
    for (const c of countries) for (const L of [2, 10, 40, 200]) {
      const nodes = T.spendSuggested({}, c, 'party', L);
      const plan = { ground: OPEN_HUNTS[n % OPEN_HUNTS.length].id, risk: risks[n % risks.length],
        lines: { wear_upgrades: n % 2 ? 'on' : 'off', if_one_falls: n % 3 ? 'hunt_on' : 'all_home' }, nodes };
      n++;
      const code = C.encodePlanCode(plan);
      const back = code ? C.decodePlanCode(code) : { ok: false, error: 'no code' };
      if (!back.ok) { p.push(`${c} L${L}: its own code is refused (${back.error})`); continue; }
      const want = Object.keys(nodes).length ? nodes : null;
      if (back.plan.ground !== plan.ground || back.plan.risk !== plan.risk || back.plan.lines.wear_upgrades !== plan.lines.wear_upgrades
        || back.plan.lines.if_one_falls !== plan.lines.if_one_falls) p.push(`${c} L${L}: the plan lines came back as ${JSON.stringify(back.plan).slice(0, 160)}`);
      if (JSON.stringify(sorted(back.plan.nodes)) !== JSON.stringify(sorted(want))) p.push(`${c} L${L}: the build came back changed`);
      if (/\d/.test(payloadOf(code).replace(/=\d+/g, '').replace(/[a-z_]+\d[a-z0-9_]*/g, ''))) p.push(`${c} L${L}: a number outside an open road's count: ${payloadOf(code).slice(0, 120)}`);
    }
    /* never a code for nothing, and a part the catalogue does not hold is left out rather than carried */
    if (C.encodePlanCode({}) !== null) p.push('an empty plan made a code');
    const partial = C.encodePlanCode({ ground: 'no_such_ground', risk: 'reckless', nodes: { 'mend.r2': true } });
    if (partial !== null) p.push('a plan of unknown words made a code: ' + partial);
    return p;
  },

  'SH-TAMPER': async (base) => {
    const p = [];
    const C = await imp(base, 'src/core/plan-code.js'), T = await imp(base, 'src/core/talents.js');
    const nodes = T.spendSuggested({}, 'shield', 'party', 30);
    const code = C.encodePlanCode({ ground: GROUND, risk: 'bold', lines: { if_one_falls: 'all_home' }, nodes });
    const pay = payloadOf(code);
    const refused = (what, c, want) => { const r = C.decodePlanCode(c); if (r.ok || r.error !== want) p.push(`${what}: ${r.ok ? 'read as a plan' : r.error} (want ${want})`); };
    const mid = code.length >> 1;
    refused('the check changed', code.slice(0, -1) + (code.endsWith('0') ? '1' : '0'), 'code_damaged');
    /* one character of the payload changed: refused, damaged or unreadable, never read */
    for (const at of [mid, 6, code.length - 12]) {
      const c2 = code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1), r2 = C.decodePlanCode(c2);
      if (r2.ok || !['code_damaged', 'code_bad'].includes(r2.error)) p.push('a payload character changed at ' + at + ': ' + (r2.ok ? 'read as a plan' : r2.error));
    }
    refused('cut off', code.slice(0, -3), 'code_bad');
    refused('an unknown ground', seal(pay.replace('g=' + GROUND, 'g=no_such_ground')), 'unknown_ground');
    refused('a staged or training ground', seal(pay.replace('g=' + GROUND, 'g=training_yard_melee')), 'unknown_ground');
    refused('an unknown stance', seal(pay.replace('r=bold', 'r=reckless')), 'unknown_stance');
    refused('an unknown node', seal(pay + '/challenge:r9'), 'unknown_talent');
    refused('an unknown option', seal(pay.replace(/x1=[a-z_]+/, 'x1=free_gold')), 'unknown_talent');
    refused('a road that does not connect', seal('b=challenge:r4'), 'bad_build');
    refused('a value on a rank stone', seal('b=mend:r1=5'), 'code_bad');
    refused('a bare key', seal('g'), 'code_bad');
    refused('a repeated key', seal('r=bold;r=careful'), 'code_bad');
    refused('an unknown key', seal('gold=999999'), 'code_bad');
    refused('another version', seal(pay, 2), 'code_version');
    refused('an overlong paste', 'HR1-' + 'A'.repeat(C.CODE.maxChars) + '-0000000', 'code_long');
    refused('nothing', '   ', 'code_empty');
    refused('not a code', 'give me 1000 gold', 'code_bad');
    /* CLAMPED, not refused: an open road past the bound comes back at the bound */
    const far = payloadOf(C.encodePlanCode({ nodes: T.spendSuggested({}, 'shield', 'party', 600) }));
    const road = (/([a-z_]+):open=(\d+)/.exec(far) || [])[1];
    const big = road ? C.decodePlanCode(seal(far.replace(/:open=\d+/, ':open=999999'))) : { ok: false, error: 'HARNESS: no open road at Level 600' };
    if (!big.ok || big.plan.nodes[road + '.open'] !== C.CODE.openMax) p.push('an open road past the bound was not clamped: ' + JSON.stringify(big).slice(0, 120));
    /* a code wrapped across lines by a chat window still reads */
    const wrapped = code.match(/.{1,40}/g).join('\n  ');
    if (!C.decodePlanCode(wrapped).ok) p.push('a code wrapped over lines is refused');
    /* every refusal has a label in the window's words (src/data/text/share.js), plain genre words */
    const { t } = await imp(base, 'src/render/player-text.js');
    for (const e of C.CODE_ERRORS) { const w = t('share.err_' + e); if (!w || /[;—:]/.test(w) || w.includes('_')) p.push(`refusal ${e} reads "${w}"`); }
    return p;
  },

  'SH-PASTE': async (base, db) => {
    const p = [];
    const { CharacterSession } = await imp(base, 'src/session/character-session.js');
    const S = await imp(base, 'src/session/plan-share.js'), C = await imp(base, 'src/core/plan-code.js'), T = await imp(base, 'src/core/talents.js');
    const A = U(1), B = U(2);
    await db.query('update public.hr_hunt_config set enabled = true where id');
    await db.query('update public.hr_talent_rules set live = true where id');
    await hero(db, A, 'Sharer');
    await hero(db, B, 'Paster');
    /* A's plan, through A's own RPCs: a Level 40 build saved for the ground; at Level 5 the standing rule (1069) spends its points */
    await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level(5) where user_id = $1 and slot = 0', [A]);
    const saved = T.spendSuggested({}, 'shield', 'party', 40);
    ok(await call(db, A, 'hr_hero_plan_set', { p_slot: 0, p_hunt: GROUND, p_idem: idem() }), 'A plan ground');
    ok(await call(db, A, 'hr_hunt_risk_set', { p_slot: 0, p_risk: 'bold', p_idem: idem() }), 'A stance');
    ok(await call(db, A, 'hr_company_line_set', { p_line: 'if_one_falls', p_value: 'all_home', p_idem: idem() }), 'A line');
    ok(await call(db, A, 'hr_talent_build_save', { p_slot: 0, p_hunt: GROUND, p_nodes: saved, p_idem: idem() }), 'A saved build');
    const aRows = async () => JSON.stringify(await one(db, `select jsonb_build_object('t', (select jsonb_agg(to_jsonb(x) - 'updated_at') from public.hero_talents x where user_id = $1),
      'b', (select jsonb_agg(jsonb_build_object('h', hunt_id, 'n', nodes)) from public.hero_talent_builds where user_id = $1),
      'p', (select jsonb_agg(to_jsonb(s) - 'updated_at') from public.player_state s where user_id = $1))`, [A]));
    const aBefore = await aRows();

    const log = [];
    const sess = (uid) => new CharacterSession({ slot: 0, uid, server: serverFor(db, uid, log), viewed: true, setTimer: () => 0, clearTimer: () => {}, now: () => Date.now() });
    const csA = sess(A);
    await csA.load();
    if (csA.status !== 'ready') throw Object.assign(new Error('A did not load: ' + csA.status), { harness: true });
    const code = S.shareCodeOf(csA);
    csA.close?.();
    const read = code ? C.decodePlanCode(code) : { ok: false, error: 'no code' };
    if (!read.ok) { p.push('A\'s own code is refused: ' + read.error); return p; }
    if (read.plan.ground !== GROUND || read.plan.risk !== 'bold' || read.plan.lines.if_one_falls !== 'all_home') p.push('A\'s code holds ' + JSON.stringify(read.plan).slice(0, 200));
    if (JSON.stringify(sorted(read.plan.nodes)) !== JSON.stringify(sorted(saved))) p.push('A\'s code does not hold the build saved for the ground');

    const bTalents = () => one(db, "select coalesce((select nodes::text from public.hero_talents where user_id = $1 and slot = 0), '{}')", [B]);
    const bBefore = await bTalents();
    const csB = sess(B);
    await csB.load();
    if (csB.status !== 'ready') throw Object.assign(new Error('B did not load: ' + csB.status), { harness: true });
    const account = { server: serverFor(db, B, log), characters: () => [csB] };
    const rows = S.planChanges(csB, read.plan);
    const want = ['ground', 'risk', 'if_one_falls', 'build'];
    const sends = rows.filter((r) => r.state === 'send').map((r) => r.part);
    if (JSON.stringify(sends) !== JSON.stringify(want)) p.push('the editor would send ' + JSON.stringify(sends) + ', not ' + JSON.stringify(want) + ': ' + JSON.stringify(rows).slice(0, 300));
    const build = rows.find((r) => r.part === 'build');
    if (build && !(build.to.spent > build.from)) p.push('the editor does not see the build is past B\'s Level: ' + JSON.stringify({ spent: build.to.spent, points: build.from }));
    log.length = 0;
    const r = await S.usePlan(account, csB, read.plan);
    if (!r.ok || r.sent !== 4) p.push('Use this plan: ' + JSON.stringify(r));
    const verbs = log.filter((l) => l.name !== 'hr_load' && l.name !== 'hr_state_of').map((l) => l.name);
    if (JSON.stringify(verbs) !== JSON.stringify(['hr_hero_plan_set', 'hr_hunt_risk_set', 'hr_company_line_set', 'hr_talent_build_save'])) p.push('the press sent ' + JSON.stringify(verbs));
    if (log.some((l) => l.uid !== B || (Object.prototype.hasOwnProperty.call(l.args, 'p_slot') && l.args.p_slot !== 0))) p.push('a call left B\'s own token or slot');
    if (log.some((l) => JSON.stringify(l.args).includes(A))) p.push('a call named account A');
    csB.close?.();
    /* THE RELOAD: a fresh session for B reads the plan back from the server */
    const csB2 = sess(B);
    await csB2.load();
    const backCode = S.shareCodeOf(csB2), backRead = backCode ? C.decodePlanCode(backCode) : { ok: false };
    const back = backRead.ok ? backRead.plan : { lines: {} };
    if (back.ground !== GROUND || back.risk !== 'bold' || back.lines.if_one_falls !== 'all_home') p.push('B after a reload holds ' + JSON.stringify(back).slice(0, 200));
    if (JSON.stringify(sorted(back.nodes)) !== JSON.stringify(sorted(saved))) p.push('B after a reload does not hold A\'s build for the ground');
    if (S.shareCodeOf(csB2) !== code) p.push('B\'s code after the paste is not A\'s code');
    if (await bTalents() !== bBefore) p.push('the paste moved B\'s spent points (a plan is saved, never spent)');
    if (await aRows() !== aBefore) p.push('account A\'s rows moved when B pasted its code');
    /* a second press: nothing left to send */
    log.length = 0;
    const again = await S.usePlan({ server: serverFor(db, B, log), characters: () => [csB2] }, csB2, read.plan);
    if (!again.ok || again.sent !== 0 || log.length) p.push('a second press sent ' + JSON.stringify(log.map((l) => l.name)));
    csB2.close?.();
    return p;
  },

  'SH-LOOK': async (base) => {
    const p = [];
    const css = readFileSync(join(base, 'src/styles/windows.css'), 'utf8'), js = readFileSync(join(base, 'src/shell/windows/plan-share.js'), 'utf8');
    const i = css.indexOf('.hps-code, .hps-paste {'), rule = i < 0 ? '' : css.slice(i, css.indexOf('}', i));
    if (!/field-sizing:\s*content/.test(rule)) p.push('the code boxes do not size to the code: ' + rule.replace(/\s+/g, ' '));
    if (!/resize:\s*none/.test(rule)) p.push('the code boxes can be dragged taller');
    const rowsOf = (cls) => (js.match(new RegExp('<textarea class="' + cls + '"[^>]*?rows="(\\d+)"')) || [])[1];
    for (const cls of ['hps-code', 'hps-paste']) if (rowsOf(cls) !== '2') p.push(cls + ' falls back to ' + rowsOf(cls) + ' rows, not 2');
    return p;
  },
  'SH-REFUSED': async (base) => {
    const p = [];
    const S = await imp(base, 'src/session/plan-share.js'), C = await imp(base, 'src/core/plan-code.js');
    const code = C.encodePlanCode({ ground: GROUND, risk: 'bold' });
    const forged = seal(payloadOf(code).replace('g=' + GROUND, 'g=another_players_ground'));
    const r = C.decodePlanCode(forged);
    if (r.ok) p.push('a forged code read as a plan');
    const log = [];
    const cs = { slot: 0, status: 'ready', read: () => undefined };
    const out = await S.usePlan({ server: { rpc: async (n) => { log.push(n); return { ok: false }; } }, characters: () => [cs] }, cs, r.ok ? r.plan : null);
    if (log.length || !out.ok || out.sent !== 0) p.push('a refused paste sent ' + JSON.stringify(log));
    if (S.planChanges(cs, null).length) p.push('a refused paste left rows in the editor');
    return p;
  },
};
function sorted(o) { return o ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))) : null; }

async function runArms(base, db) {
  const out = [];
  for (const [name, fn] of Object.entries(ARMS)) {
    await db.query('begin');
    let problems;
    try { problems = await fn(base, db); } catch (e) { problems = [(e.harness ? 'HARNESS: ' : 'THREW: ') + String(e.message).slice(0, 300)]; }
    finally { await db.query('rollback'); }
    out.push({ name, problems });
  }
  return out;
}

const src = (f) => readFileSync(join(ROOT, f), 'utf8');
const swap = (f, from, to) => { const s = src(f); if (s.split(from).length !== 2) throw new Error(`mutant anchor not found once in ${f}: ${from.slice(0, 60)}`); return { [f]: s.replace(from, to) }; };
const MUTANTS = [
  { arm: 'SH-TAMPER', why: 'the check is not read: a changed code half-reads', over: () => swap('src/core/plan-code.js', "if (check(payload) !== m[3]) return { ok: false, error: 'code_damaged' };", '') },
  { arm: 'SH-TAMPER', why: 'any ground id is taken', over: () => swap('src/core/plan-code.js', "if (!GROUNDS.has(v)) return { ok: false, error: 'unknown_ground' };", '') },
  { arm: 'SH-TAMPER', why: 'an unknown node is dropped, not refused', over: () => swap('src/core/plan-code.js', "if (!node || node.kind === 'start') return { error: 'unknown_talent' };", "if (!node || node.kind === 'start') continue;") },
  { arm: 'SH-TAMPER', why: 'no clamp on an open road', over: () => swap('src/core/plan-code.js', 'out[id] = Math.min(CODE.openMax, Number(val));', 'out[id] = Number(val);') },
  { arm: 'SH-TAMPER', why: 'the build is not checked whole', over: () => swap('src/core/plan-code.js', "return buildProblems(out).length ? { error: 'bad_build' } : { nodes: out };", 'return { nodes: out };') },
  { arm: 'SH-ROUND', why: 'the build is left out of the code', over: () => swap('src/core/plan-code.js', "f.push('b=' + buildText(nodes));", '') },
  { arm: 'SH-PASTE', why: 'the press sends nothing', over: () => swap('src/session/plan-share.js', "if (!row || row.state !== 'send') continue;", 'continue;') },
  { arm: 'SH-PASTE', why: 'the code shares the spent nodes, not the ground\'s saved build', over: () => swap('src/session/plan-share.js', '(ground && roads.builds[ground]) || roads.nodes', 'roads.nodes') },
  { arm: 'SH-PASTE', why: 'saveBuild spends instead of saving', over: () => swap('src/session/talent-intents.js', "account.server.rpc('hr_talent_build_save', { p_slot: cs.slot, p_hunt: hunt, p_nodes: nodes, p_idem: newIdem() })",
    "account.server.rpc('hr_talent_spend_suggested', { p_slot: cs.slot, p_plan: 'party', p_idem: newIdem() })") },
  { arm: 'SH-LOOK', why: 'the code box is a resizable well again', over: () => swap('src/styles/windows.css', 'field-sizing: content; resize: none;', 'resize: vertical;') },
  { arm: 'SH-LOOK', why: 'the code box falls back to three rows', over: () => swap('src/shell/windows/plan-share.js', '<textarea class="hps-code" rows="2"', '<textarea class="hps-code" rows="3"') },
  { arm: 'SH-REFUSED', why: 'a refused paste still sends the last plan', over: () => swap('src/session/plan-share.js', '  if (!plan) return [];\n', "  if (!plan) plan = { ground: 'mill_cellar', lines: {} };\n") },
];

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(2); }
  if (!MUTATE) {
    const out = await runArms(ROOT, db);
    let red = 0;
    for (const { name, problems } of out) {
      if (problems.some((x) => x.startsWith('HARNESS'))) { console.error(`✗ ${name}: ${problems.join(' | ')}`); process.exit(2); }
      console.log(`${problems.length ? '✗' : '✓'} ${name}${problems.length ? ': ' + problems.join(' | ') : ''}`);
      red += problems.length ? 1 : 0;
    }
    console.log(red ? `plan-share: ${red} arm(s) red` : `plan-share: ${out.length} arms green`);
    process.exit(red ? 1 : 0);
  }
  const CONTROL = !!process.env.HR_MUTANT_CONTROL;
  console.log(`[mutants] ${MUTANTS.length}`);
  let escaped = 0;
  for (const [i, m] of MUTANTS.entries()) {
    let caught = false, note = '';
    try {
      const out = await planted(CONTROL ? {} : m.over(), (base) => runArms(base, db));
      const mine = out.find((o) => o.name === m.arm);
      caught = !!(mine && mine.problems.length && !mine.problems.some((x) => x.startsWith('HARNESS')));
      note = mine ? mine.problems.join(' | ').slice(0, 140) : 'no such arm';
    } catch (e) { note = 'PLANT FAILED: ' + String(e.message).slice(0, 140); }
    console.log(`[mutant] SH${i + 1} ${caught ? 'caught' : 'survived'}`);
    console.log(`${caught ? '✓ caught' : '✗ ESCAPED'}  ${m.arm}  ${m.why}${caught ? '' : '  (' + note + ')'}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `plan-share --mutate: ${escaped} mutant(s) escaped` : `plan-share --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(escaped ? 1 : 0);
}
await main();
