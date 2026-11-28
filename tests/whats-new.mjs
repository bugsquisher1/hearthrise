#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/whats-new.mjs — "WHAT'S NEW": ONE CARD ON THE FIRST SIGN-IN TO A RELEASE, ONCE AN ACCOUNT, AND "YOU START FRESH" FOR A RETURNING ONE
//   (lane/wn-sh WN, 2026-11-26; docs/design/redesign/20-v030-the-roads.md band 5 "Shown once an account").
//   src/data/whats-new.js (the rows), src/app/whats-new.js (whatsNewOf, paintWhatsNew), src/session/account-coach.js over
//   1039-account-coach.sql (the seen mark: the account's coach reads, server-held display state).
//
//   node tests/whats-new.mjs            the guard (WN-ONCE on the replayed chain)
//   node tests/whats-new.mjs --mutate   every planted defect (in a temp copy of src) must turn its arm red
//
// mutant-anchors: src/app/whats-new.js src/data/whats-new.js src/styles/app.css
// ci-step: db-replay-17 | What's new - one card an account, the fresh line for a returning account
// ci-run: node tests/whats-new.mjs
// ci-run: node tools/mutant-gate.mjs node tests/whats-new.mjs --mutate
//
//   WN-ROWS   the rows: a semver each, oldest first, a unique card id the coach takes (^[a-z0-9_]{1,64}$), every id a text row; the fresh
//             line and the lead written as plain sentences (no semicolon, em dash or colon-joined clause, CLAUDE.md section 10), every
//             feature line a short LABEL (no sentence's period, at most 10 words); forNew a boolean
//   WN-CARD   whatsNewOf: no card under the row's version; at it, an account made before the release's day sees the card with its fresh
//             line; 0.3.0 is forNew false (designer 2026-11-26), so a brand-new account and one of no known age see none; a forNew row
//             shows a new account the card with no fresh line; a read card is gone; only the NEWEST row is ever shown
//   WN-ONCE   THE REAL SERVER (PGlite, hr_account_coach): a returning account signs in and the characters screen shows the card with its
//             fresh line; Got it marks it read; A RELOAD (a new AccountCoach, the server read again) and A SECOND DEVICE show nothing;
//             another account still sees it; a coach the server will not read shows no card (never on every sign-in)
//   WN-LOOK   Got it is a thumb's press on a phone (min-height var(--tap) in app.css's phone block; visual read 2026-11-26: 30 px)
// Exit: 0 green · 1 a red arm or an escaped mutant · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { planted } from './_pure-guard.mjs';

const MUTATE = process.argv.includes('--mutate');
const imp = (base, f) => import(pathToFileURL(join(base, f)).href);
const U = (n) => `000000c0-0000-4000-8000-0000000cc${String(n).padStart(3, '0')}`;
const DAY = 24 * 3600 * 1000;

async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.query('savepoint as_call');
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; await db.query('release savepoint as_call'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint as_call'); throw e; }
  finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)"); }
}
const serverFor = (db, uid) => ({
  rpc: async (name, args) => {
    const keys = Object.keys(args);
    const body = await as(db, uid, `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}::${Array.isArray(args[k]) ? 'text[]' : 'uuid'}`).join(', ')}) as r`, keys.map((k) => args[k]));
    return { ok: true, status: 200, body };
  },
});
/* The characters screen's section, as much of a DOM as paintWhatsNew touches. */
function fakeBox() {
  const press = { fns: [], addEventListener(ev, fn) { if (ev === 'click') this.fns.push(fn); }, click() { for (const f of this.fns) f(); } };
  return { isConnected: true, hidden: true, innerHTML: '', press, querySelector: (q) => (q === '.whats-new-ok' ? press : null) };
}

const ARMS = {
  'WN-ROWS': async (base) => {
    const p = [];
    const { WHATS_NEW, semverCmp } = await imp(base, 'src/data/whats-new.js'), { hasText, t } = await imp(base, 'src/render/player-text.js');
    const cards = new Set();
    let last = null;
    if (!WHATS_NEW.length) p.push('no rows');
    for (const r of WHATS_NEW) {
      if (!/^\d+\.\d+\.\d+$/.test(r.version)) p.push(`${r.card}: version ${r.version}`);
      if (!/^[a-z0-9_]{1,64}$/.test(r.card) || cards.has(r.card)) p.push(`${r.card}: card id`);
      cards.add(r.card);
      if (last && semverCmp(last, r.version) >= 0) p.push(`${r.card}: rows are oldest first`);
      last = r.version;
      if (r.since !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.since))) p.push(`${r.card}: since ${r.since}`);
      if (typeof r.forNew !== 'boolean') p.push(`${r.card}: forNew ${r.forNew}`);
      for (const id of [r.fresh, r.lead].filter(Boolean)) {
        if (!hasText(id)) { p.push(`${r.card}: no text row ${id}`); continue; }
        const s = t(id);
        if (/[;—–]|\w:\s/.test(s)) p.push(`${id} is not a plain sentence: "${s}"`);
        if (!/[.!?]$/.test(s)) p.push(`${id} does not end as a sentence: "${s}"`);
      }
      if (!r.lines.length) p.push(`${r.card}: no feature lines`);
      for (const id of r.lines) {
        if (!hasText(id)) { p.push(`${r.card}: no text row ${id}`); continue; }
        const s = t(id);
        if (/[;—–]/.test(s) || /\.$/.test(s)) p.push(`${id} is not a label: "${s}"`);
        if (s.split(/\s+/).filter((w) => w !== '·').length > 10) p.push(`${id} is more than a label's 10 words: "${s}"`);
      }
    }
    return p;
  },

  'WN-CARD': async (base) => {
    const p = [];
    const { whatsNewOf } = await imp(base, 'src/app/whats-new.js');
    const day = '2026-12-20', at = Date.parse(day + 'T00:00:00Z');
    const of = (o) => whatsNewOf({ buildDate: day, read: new Set(), ...o });
    if (of({ version: '0.2.143', createdAtMs: at - DAY }) !== null) p.push('a card under its version');
    const fresh = of({ version: '0.3.0', createdAtMs: at - 30 * DAY });
    if (!fresh || fresh.card !== 'whats_new_0_3_0' || !fresh.fresh || !fresh.lead || fresh.lines.length < 1) p.push('a returning account: ' + JSON.stringify(fresh));
    /* 0.3.0 is for the accounts it starts fresh: a brand-new one has nothing to compare against (forNew false) */
    const newbie = of({ version: '0.3.0', createdAtMs: at + 3600 * 1000 });
    if (newbie !== null) p.push('a brand-new account sees the 0.3.0 card: ' + JSON.stringify(newbie));
    if (of({ version: '0.3.0', createdAtMs: null }) !== null) p.push('an account of no known age sees the 0.3.0 card');
    if (of({ version: '0.3.0', createdAtMs: at - DAY, read: new Set(['whats_new_0_3_0']) }) !== null) p.push('a read card shows again');
    /* a forNew row: a new account sees it with no fresh line; a later build with no date on the row still shows it, its fresh line
       waiting on the row's own date */
    const open = [{ version: '0.3.0', card: 'open_card', lead: null, lines: ['share.news_030_risk'], fresh: 'share.news_030_fresh', since: null, forNew: true }];
    const nu = whatsNewOf({ version: '0.3.0', buildDate: day, read: new Set(), createdAtMs: at + 3600 * 1000, rows: open });
    if (!nu || nu.fresh !== null) p.push('a forNew row to a new account: ' + JSON.stringify(nu));
    const later = whatsNewOf({ version: '0.3.1', buildDate: day, read: new Set(), createdAtMs: at - DAY, rows: open });
    if (!later || later.fresh !== null) p.push('0.3.1 with no `since`: ' + JSON.stringify(later));
    /* only the NEWEST row: a newer release's card replaces an older unread one */
    const rows = [{ version: '0.3.0', card: 'old_card', lines: ['share.news_030_talents'], fresh: null, since: null, forNew: true },
      { version: '0.4.0', card: 'new_card', lines: ['share.news_030_risk'], fresh: null, since: null, forNew: true }];
    const newest = whatsNewOf({ version: '0.4.2', read: new Set(), rows });
    if (!newest || newest.card !== 'new_card') p.push('an older card than the newest: ' + JSON.stringify(newest));
    if (whatsNewOf({ version: '0.4.2', read: new Set(['new_card']), rows }) !== null) p.push('an older unread card shows once the newest is read');
    return p;
  },

  'WN-LOOK': async (base) => {
    /* Got it is a thumb's press on a phone, as every other press on the account screens is (src/styles/app.css, the phone block) */
    const css = readFileSync(join(base, 'src/styles/app.css'), 'utf8');
    const q = '@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px) {';
    const blocks = css.split(q).slice(1).map((b) => b.slice(0, b.indexOf('\n}')));
    return blocks.some((b) => /\.whats-new-ok\s*\{[^}]*min-height:\s*var\(--tap\)/.test(b)) ? [] : ['Got it is under a thumb\'s press on a phone'];
  },
  'WN-ONCE': async (base, db) => {
    const p = [];
    const { paintWhatsNew } = await imp(base, 'src/app/whats-new.js'), { AccountCoach } = await imp(base, 'src/session/account-coach.js');
    const X = U(1), Y = U(2);
    for (const uid of [X, Y]) await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    const o = { version: '0.3.0', buildDate: '2026-12-20', createdAtMs: Date.parse('2026-10-01T00:00:00Z') };
    /* first sign-in: the card, with the fresh line */
    const c1 = new AccountCoach(serverFor(db, X));
    const b1 = fakeBox();
    if (!(await paintWhatsNew(b1, { coach: c1 }, o)) || b1.hidden || !/whats-new-fresh/.test(b1.innerHTML)) p.push('the first sign-in shows no card with its fresh line: ' + b1.innerHTML.slice(0, 120));
    b1.press.click();
    if (!b1.hidden) p.push('Got it left the card up');
    await c1._sending;
    const held = await as(db, X, 'select public.hr_account_coach(null, null, null)', []);
    if (!held || !Array.isArray(held.read) || !held.read.includes('whats_new_0_3_0')) p.push('Got it reached no server row: ' + JSON.stringify(held));
    /* a reload and a second device: a new coach, read from the server */
    for (const what of ['a reload', 'a second device']) {
      const b = fakeBox();
      if (await paintWhatsNew(b, { coach: new AccountCoach(serverFor(db, X)) }, o)) p.push(what + ' shows the card again');
    }
    /* another account still sees it */
    if (!(await paintWhatsNew(fakeBox(), { coach: new AccountCoach(serverFor(db, Y)) }, o))) p.push('another account does not see the card');
    /* the coach cannot be read: no card (better unseen than shown on every sign-in) */
    const down = new AccountCoach({ rpc: async () => ({ ok: false, status: 0, error: 'network' }) });
    if (await paintWhatsNew(fakeBox(), { coach: down }, o)) p.push('a coach the server would not read showed the card');
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
const MUTANTS = [
  { arm: 'WN-LOOK', why: 'Got it shrinks to a line of text on a phone', over: () => swap('src/styles/app.css', '  .whats-new-ok { min-height: var(--tap); }\n', '') },
  { arm: 'WN-ONCE', why: 'Got it marks nothing', over: () => swap('src/app/whats-new.js', "    coach.mark('read', [card.card]);\n", '') },
  { arm: 'WN-ONCE', why: 'a coach that cannot be read still shows the card', over: () => swap('src/app/whats-new.js', 'if (!ok || !box.isConnected) return false;', 'if (!box.isConnected) return false;') },
  { arm: 'WN-CARD', why: 'a read card shows again', over: () => swap('src/app/whats-new.js', "if (!row || (read && typeof read.has === 'function' && read.has(row.card))) return null;", 'if (!row) return null;') },
  { arm: 'WN-CARD', why: 'every account reads the fresh line', over: () => swap('src/app/whats-new.js', 'const returning = Number.isFinite(createdAtMs) && Number.isFinite(since) && createdAtMs < since;', 'const returning = true;') },
  { arm: 'WN-CARD', why: 'the version gate is gone', over: () => swap('src/app/whats-new.js', '.filter((r) => semverCmp(r.version, version) <= 0)', '') },
  { arm: 'WN-ROWS', why: 'the lead with a semicolon', over: () => swap('src/data/text/share.js', "'The Roads are open. Every weapon", "'The Roads are open; every weapon") },
  { arm: 'WN-ROWS', why: 'a feature line written as a sentence', over: () => swap('src/data/text/share.js', "Only Bold can die',", "Only Bold can die.',") },
  { arm: 'WN-CARD', why: 'a brand-new account sees the 0.3.0 card', over: () => swap('src/data/whats-new.js', 'since: null, forNew: false,', 'since: null, forNew: true,') },
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
    console.log(red ? `whats-new: ${red} arm(s) red` : `whats-new: ${out.length} arms green`);
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
    console.log(`[mutant] WN${i + 1} ${caught ? 'caught' : 'survived'}`);
    console.log(`${caught ? '✓ caught' : '✗ ESCAPED'}  ${m.arm}  ${m.why}${caught ? '' : '  (' + note + ')'}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `whats-new --mutate: ${escaped} mutant(s) escaped` : `whats-new --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(escaped ? 1 : 0);
}
await main();
