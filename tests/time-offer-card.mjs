#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/time-offer-card.mjs — THE BLOCK RULE'S ONE OFFER IS A COACH CARD THE SERVER DRIVES (designer, lane/designer-text-1126;
//   12-targets.md section 9.3; src/shell/time-offer-card.js over 1071-work-blocks.sql hr_time_offer_of / hr_time_offer_answer).
//
//   node tests/time-offer-card.mjs            the guard (the replayed chain, real CharacterSessions)
//   node tests/time-offer-card.mjs --mutate   every planted defect (in a temp copy of src) must turn its arm red
//
// mutant-anchors: src/shell/time-offer-card.js src/shell/launcher-coach.js
// ci-step: db-replay | Block offer card - shown when the server offers, buttons off until it answers, gone for good after an answer
// ci-run: node tests/time-offer-card.mjs
// ci-run: node tools/mutant-gate.mjs node tests/time-offer-card.mjs --mutate
//
//   OC-PLAY    THE CARD, PLAYED: an empty purse shows no card; once the server offers (a purse of 3 days' pay) the coach's own box
//              (launcher-coach.js pointerFor) shows the card before any tip, with the server's choices and Not now; a press on "Up to
//              2 a day" goes through the coach's act, every button is off while the answer is out and a second press sends nothing;
//              the answer lands, the server holds the rule, the card is gone, and A RELOAD (a new CharacterSession) shows none; a
//              choice the server did not offer is never sent
//   OC-NOT-NOW Not now on another account: the card goes, no rule is set, and a reload with a fuller purse never offers it again
// Exit: 0 green · 1 a red arm or an escaped mutant · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { planted } from './_pure-guard.mjs';

const MUTATE = process.argv.includes('--mutate');
const imp = (base, f) => import(pathToFileURL(join(base, f)).href);
const U = (n) => `000000c0-0000-4000-8000-0000000ce${String(n).padStart(3, '0')}`;
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';
const js = (v) => String(JSON.stringify(v === undefined ? null : v)).slice(0, 300);
const clear = (db) => db.query('delete from public.hr_rate_counters');

async function as(db, uid, sql, params) {
  await clear(db);
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.query('savepoint as_call');
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; await db.query('release savepoint as_call'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint as_call'); throw e; }
  finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)"); }
}
const setPurse = (db, uid, g) => db.query(`insert into public.account_wallet as w (user_id, gold) values ($1, $2)
  on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now()`, [uid, g]);
const rulesOf = async (db, uid) => (await db.query("select slot, up_to from public.hero_time_rules where user_id = $1 and kind = 'hunt' order by slot", [uid])).rows;

async function makeHero(db, uid, n) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Offer ' + n]);
  const h = await as(db, uid, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', ['Offer' + String.fromCharCode(97 + n) + 'x', COLORS, crypto.randomUUID()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
}

/* The client as the page has it: a viewed CharacterSession whose every rpc is the real verb, the account, and a shell context with no
   window open (the coach's box is drawn). `calls` counts the verbs sent. */
async function client(base, db, uid) {
  const { CharacterSession } = await imp(base, 'src/session/character-session.js');
  const calls = [];
  const server = {
    rpc: async (name, args) => {
      calls.push(name);
      const keys = Object.keys(args);
      const body = await as(db, uid, `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
        keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      return { ok: true, status: 200, body, closed: false };
    },
    accrue: async () => ({ ok: false, status: 0, error: 'network' }),
  };
  const cs = new CharacterSession({ slot: 0, uid, server, viewed: true, setTimer: () => 0, clearTimer: () => {}, now: () => Date.now() });
  await cs.load();
  const account = { server, characters: () => [cs] };
  const wm = { openIds: () => [], rows: () => [] };
  return { cs, calls, ctx: { character: cs, account, wm, now: null, doc: null } };
}
/* A press on one of the card's buttons, as the shell hands it to the coach's act. */
const pressOn = (n) => ({ type: 'click', target: { closest: (q) => (q === '[data-hs-act="time-offer"]' ? { getAttribute: (a) => (a === 'data-n' ? String(n) : null) } : null) } });
const settle = async (card, cs) => { for (let i = 0; i < 400 && /time_offer:wait/.test(card.offerCardHtml(cs)); i++) await new Promise((r) => setTimeout(r, 5)); };

const ARMS = {
  'OC-PLAY': async (base, db) => {
    const p = [];
    const card = await imp(base, 'src/shell/time-offer-card.js'), coach = await imp(base, 'src/shell/launcher-coach.js');
    const X = U(1);
    await makeHero(db, X, 1);
    await setPurse(db, X, 0);
    let c = await client(base, db, X);
    if (card.offerCardHtml(c.cs) || /time_offer/.test(coach.pointerFor(c.ctx))) p.push('an empty purse shows the card');
    await setPurse(db, X, 10000000000);
    await c.cs.load();
    const html = card.offerCardHtml(c.cs);
    const buttons = [...html.matchAll(/data-hs-act="time-offer" data-n="(\d+)"/g)].map((m) => Number(m[1]));
    if (js(buttons) !== js([1, 2, 0]) || !/Up to 2 a day/.test(html) || !/Not now/.test(html)) p.push('the offered card reads ' + html.slice(0, 200));
    if (!coach.pointerFor(c.ctx).includes('data-tutorial="time_offer"')) p.push('the coach box shows a tip, not the offer: ' + coach.pointerFor(c.ctx).slice(0, 120));
    /* a choice the server did not offer is never sent */
    const bad = await card.answerOffer(c.ctx, 3);
    if (bad.ok || c.calls.includes('hr_time_offer_answer')) p.push('a choice of 3 was sent: ' + js(bad));
    /* the press, through the coach's own act */
    if (!coach.actCoach(c.ctx, null, 'time-offer', pressOn(2))) p.push('the coach did not take the card\'s press');
    const wait = card.offerCardHtml(c.cs);
    if (!/time_offer:wait/.test(wait) || (wait.match(/ disabled>/g) || []).length !== 3) p.push('the buttons are not all off while the answer is out: ' + wait.slice(0, 200));
    const twice = await card.answerOffer(c.ctx, 1);
    await settle(card, c.cs);
    if (twice.ok || c.calls.filter((n) => n === 'hr_time_offer_answer').length !== 1) p.push('a second press while the first was out was sent: ' + js(c.calls));
    if (js(await rulesOf(db, X)) !== js([{ slot: 0, up_to: 2 }])) p.push('the server holds the rule ' + js(await rulesOf(db, X)));
    if (card.offerCardHtml(c.cs) || /time_offer/.test(coach.pointerFor(c.ctx))) p.push('the card stays after the answer: ' + card.offerCardHtml(c.cs).slice(0, 120));
    /* a reload: a new CharacterSession, read from the server */
    c = await client(base, db, X);
    if (card.offerCardHtml(c.cs)) p.push('a reload shows the card again');
    return p;
  },

  'OC-NOT-NOW': async (base, db) => {
    const p = [];
    const card = await imp(base, 'src/shell/time-offer-card.js'), coach = await imp(base, 'src/shell/launcher-coach.js');
    const Y = U(2);
    await makeHero(db, Y, 2);
    await setPurse(db, Y, 10000000000);
    let c = await client(base, db, Y);
    if (!card.offerCardHtml(c.cs)) { p.push('a full purse shows no card'); return p; }
    coach.actCoach(c.ctx, null, 'time-offer', pressOn(0));
    await settle(card, c.cs);
    if (card.offerCardHtml(c.cs)) p.push('Not now left the card up');
    if ((await rulesOf(db, Y)).length) p.push('Not now set a rule ' + js(await rulesOf(db, Y)));
    await setPurse(db, Y, 30000000000);
    c = await client(base, db, Y);
    if (card.offerCardHtml(c.cs) || /time_offer/.test(coach.pointerFor(c.ctx))) p.push('a reload after Not now offers the card again');
    return p;
  },
};

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
const CARD = 'src/shell/time-offer-card.js', COACH = 'src/shell/launcher-coach.js';
const MUTANTS = [
  { arm: 'OC-PLAY', why: 'the buttons stay on while the answer is out', over: () => swap(CARD, "const off = sc.pending ? ' disabled' : '';", "const off = '';") },
  { arm: 'OC-PLAY', why: 'a card with no offer from the server', over: () => swap(CARD, "return o && o.kind === 'hunt' ? o : null;", "return o && o.kind === 'hunt' ? o : { kind: 'hunt', choices: [1, 2], threshold: null };") },
  { arm: 'OC-PLAY', why: 'a choice the server did not offer is sent', over: () => swap(CARD, 'if (!o || !(n === 0 || o.choices.includes(n)))', 'if (!o)') },
  { arm: 'OC-PLAY', why: 'a tip takes the offer\'s place', over: () => swap(COACH, '  if (offer) return offer;\n', '') },
  { arm: 'OC-PLAY', why: 'the coach does not route the card\'s press', over: () => swap(COACH, '  if (actTimeOffer(ctx, el, action, ev)) return true;\n', '') },
  { arm: 'OC-NOT-NOW', why: 'Not now is never sent', over: () => swap(CARD, 'if (b) answerOffer(ctx, Number(b.getAttribute(\'data-n\'))', 'if (b && b.getAttribute(\'data-n\') !== \'0\') answerOffer(ctx, Number(b.getAttribute(\'data-n\'))') },
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
    console.log(red ? `time-offer-card: ${red} arm(s) red` : `time-offer-card: ${out.length} arms green`);
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
    console.log(`[mutant] OC${i + 1} ${caught ? 'caught' : 'survived'}`);
    console.log(`${caught ? '✓ caught' : '✗ ESCAPED'}  ${m.arm}  ${m.why}${caught ? '' : '  (' + note + ')'}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `time-offer-card --mutate: ${escaped} mutant(s) escaped` : `time-offer-card --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(escaped ? 1 : 0);
}
await main();
