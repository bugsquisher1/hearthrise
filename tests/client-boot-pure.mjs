#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/client-boot-pure.mjs — THE BOOT'S RULES THAT NEED NO BROWSER, PROVEN IN NODE.
//
//   node tests/client-boot-pure.mjs                    the rules
//   node tests/client-boot-pure.mjs --mutate           every planted defect must turn a rule RED
//   node tests/client-boot-pure.mjs --mutate --only <words>   only the mutants whose name holds <words>
//
// ci-step: client-guards | Client boot rules that need no browser (the boot's pure half)
// ci-run: node tests/client-boot-pure.mjs
// ci-run: node tools/mutant-gate.mjs node tests/client-boot-pure.mjs --mutate
//
// mutant-anchors: src/app/slot-offer.js src/session/account-session.js src/session/server.js src/app/legal-reader.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
// WHY (architecture audit item 8; lane/c-rules-in-node 2026-11-20). tests/client-boot.mjs was the second most expensive guard CI
// runs: nightly 44730692384 spent 4,930 job-seconds on it (137 plain + 4,794 across three --mutate shards), a page boot for each
// of its 109 mutants. Eight of them were planted in modules a page only hosts: the hero-slot offer (src/app/slot-offer.js,
// strings in, strings out), the account's admission read and the server link's keepalive and legal-page reads (src/session),
// and the legal reader's Markdown (src/app/legal-reader.js legalHtml, which B-20 already judged inside a page.evaluate). They
// cost 354 s of that nightly; here each is caught in about a second, by the rule id that caught it in the page.
//
// THE SPLIT KEEPS EVERY CATCH. tests/client-boot.mjs keeps every page rule (what the screens show, where, and what a press sends;
// B-11's clicks, B-11b's layout, B-7's notice, B-17's page leave, B-20's reader); B-20's two checks that only borrowed the page
// as a JavaScript runtime (legalHtml, readLegal) moved here whole. The answers come from a real AccountSession over a stub server
// that answers hr_load the way client-boot's stubServer does, so the roster rows are the ones the characters screen reads.
//
//   B-11 FOUR HERO SLOTS (Tyler 2026-11-21; 1036-four-starter-slots.sql): the line over the roster says how many play at once and
//        how many heroes are still to make, from the server's limit and roster; no slot is for sale, so the account holds no offer
//   B-7  ADMISSION: the door's answer is the server's word, in, closed, or unanswered: a failed read is never a no
//   B-17 THE AWAY STAMP OUTLIVES THE PAGE: a put asked to outlive it goes on a keepalive fetch (one under the browser's 64 KB cap)
//   B-20 THE LEGAL PAGES: the reader draws only what its rules allow (every character escaped, https and mailto links, the
//        owner's comments gone); the server link reads only the listed pages, with no request for any other path
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withServerLevel } from './_server-level.mjs';
import { ROOT, runPureGuard } from './_pure-guard.mjs';

const UID = '11111111-2222-3333-4444-555555555555';
/* Level 10's total on the shipped curve (src/core/xp.js), never typed. */
const LEVEL_10_XP = (await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href)).charXpForLevel(10);

/** The modules the rules read, from `base` (the repository, or a temp copy of src with a mutant planted). */
async function modulesOf(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  return { A: await imp('src/session/account-session.js'), SO: await imp('src/app/slot-offer.js'), S: await imp('src/session/server.js'),
    LR: await imp('src/app/legal-reader.js') };
}

/**
 * An account the way client-boot's stubServer states one: { heroes: { slot: name }, slots, purse, goldV, lag: { slot: { gold, v } },
 * ladder: { slot: price } }. Each hero's hr_load answer states the ACCOUNT purse (a lagging hero an older wallet version), the owned
 * slots and the next slot on sale. -> an AccountSession over it.
 */
function accountOf(M, o) {
  const answer = (body) => ({ ok: true, status: 200, body, closed: false });
  const server = {
    rpc: async (name, args) => {
      if (name !== 'hr_load') return answer({ ok: false, error: 'unknown' });
      const slot = args.p_slot, slots = o.slots;
      const next = Object.keys(o.ladder).map(Number).find((k) => !slots.includes(k));
      const account = { max_concurrent: 4, hero_slots_max: 4, hero_slot_offer: next === undefined ? null : { slot_id: next, cost_gold: o.ladder[next] } };
      if (!o.heroes[slot]) return answer({ ok: false, error: 'no_character', hero_slots: slots });
      const lag = o.lag && o.lag[slot];
      return answer(withServerLevel({ ok: true, version: 1, now: '2026-10-17T00:00:00Z', name: o.heroes[slot], skills: {}, inventory: {}, hero_slots: slots, account,
        state: { active_kind: 'idle', gold: lag ? lag.gold : o.purse, gold_v: lag ? lag.v : o.goldV, level_xp: LEVEL_10_XP } }));
    },
    accrue: async () => answer({ ok: false }),
  };
  return new M.A.AccountSession({ auth: { userId: () => UID, token: () => 'jwt', signOut: async () => {} }, server, tab: null, channel: null });
}

/* mutant-rules-start */
/** Every rule, in the page's order. Fail lines carry the page rule's id. */
async function pure(base) {
  const M = await modulesOf(base);
  const fails = [];

  { // B-20 THE PRIVACY POLICY AND THE TERMS: the reader draws only what its rules allow; the server link reads only the listed pages
    const drawn = M.LR.legalHtml('# T\n\n<img src=x onerror=alert(1)> **b** [ok](https://a.example/x) [bad](javascript:alert(1))\n\n<!-- note -->\n\n* one\n* two', { dropTitle: true });
    if (/<img|href="javascript|note/.test(drawn) || !/<strong>b<\/strong>/.test(drawn) || !/href="https:\/\/a\.example\/x"/.test(drawn) || !/<ul><li>one<\/li><li>two<\/li><\/ul>/.test(drawn)) fails.push('B-20 the reader drew: ' + drawn);
    const here = 'http://127.0.0.1:8080/play.html';
    const asked = [];
    const stub = async (u) => { asked.push(String(u)); return { ok: true, text: async () => 'page' }; };
    const link = { ok: await M.S.readLegal('legal/PRIVACY_POLICY.md', here, stub), bad: [] };
    for (const p of ['src/build-info.js', 'legal/../src/build-info.js', 'legal/PRIVACY_POLICY.md?x=1', 'https://evil.example/legal/PRIVACY_POLICY.md', '/legal/PRIVACY_POLICY.md', 'legal/EULA.md', '']) link.bad.push(await M.S.readLegal(p, here, stub));
    link.asked = asked;
    if (link.ok !== 'page' || link.bad.some((x) => x !== null) || link.asked.length !== 1 || !/\/legal\/PRIVACY_POLICY\.md$/.test(link.asked[0])) fails.push('B-20 the server link read a path outside its list, or refused one on it: ' + JSON.stringify(link));
  }

  { // B-17 the away stamp goes on a fetch that outlives the page (src/session/server.js: keepalive under the browser's 64 KB cap)
    const inits = [];
    const link = M.S.createServerLink({ url: 'https://nezapsylztqbbwuwembx.supabase.co', publishableKey: 'anon', token: () => 'jwt',
      fetch: async (u, init) => { inits.push(init); return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{"ok":true}' }; } });
    await link.rpc('hr_put_client_state', { p_slot: 0, p_patch: { awaySeen: { at: 1 } } }, { keepalive: true });
    await link.rpc('hr_put_client_state', { p_slot: 0, p_patch: { awaySeen: { at: 1 } } });
    await link.rpc('hr_put_client_state', { p_slot: 0, p_patch: { big: 'x'.repeat(70000) } }, { keepalive: true });
    const kept = inits.map((i) => !!(i && i.keepalive));
    if (kept.join() !== 'true,false,false') fails.push('B-17 the stamp was not sent on a fetch that outlives the page: ' + JSON.stringify(kept) + ' (want a keepalive put, a plain one, and one over 64 KB plain)');
  }

  { // B-11 four hero slots from the start: the line says the play limit and the heroes still to make; nothing is for sale
    const o = { heroes: { 0: 'Tester', 1: 'Fennick' }, slots: [0, 1, 2, 3], purse: 14100, goldV: 7, ladder: {} };
    let acct = accountOf(M, o);
    let rows = await acct.roster();
    const lead = M.SO.playLineOf(acct.statedLimit(), acct.limit(), rows);
    if (rows.length !== 4 || lead !== 'Heroes at once: up to 4. 2 more heroes to make.') fails.push('B-11 the line over two heroes of four reads ' + JSON.stringify(lead) + ' over ' + rows.length + ' slots');
    if ('slotOffer' in acct || typeof acct.buySlot === 'function') fails.push('B-11 the account still holds a slot offer or a purchase');
    Object.assign(o, { heroes: { 0: 'Tester', 1: 'Fennick', 2: 'Wren', 3: 'Moss' } });
    acct = accountOf(M, o);
    rows = await acct.roster();
    const full = M.SO.playLineOf(acct.statedLimit(), acct.limit(), rows);
    if (full !== 'Heroes at once: up to 4') fails.push('B-11 the line over four heroes reads ' + JSON.stringify(full));
    if (M.SO.playLineOf(null, 4, rows) !== '') fails.push('B-11 the line speaks before the server has stated its limit');
  }

  { // B-7 Check again is the server's word: in, closed, or unanswered (a failed read is not a no)
    const said = async (ans) => {
      const a = accountOf(M, { heroes: { 0: 'Tester' }, slots: [0], purse: 0, goldV: 0, ladder: {} });
      a.server = { rpc: async () => ans };
      return a.admission();
    };
    const no = await said({ ok: false, status: 403, body: { code: 'hr_closed' }, closed: true });
    const yes = await said({ ok: true, status: 200, body: { ok: true }, closed: false });
    const failed = await said({ ok: false, status: 0, error: 'network', closed: false });
    if (no !== 'closed') fails.push('B-7 a no does not say why: ' + JSON.stringify(no));
    if (failed !== 'unanswered') fails.push('B-7 a failed check reads as ' + JSON.stringify(failed) + ' (a failed read is not a no)');
    if (yes !== 'in') fails.push('B-7 once admitted, Check again reads ' + JSON.stringify(yes));
  }
  return fails;
}

/* The mutants of tests/client-boot.mjs planted in modules a page only hosts, moved here (lane/c-rules-in-node 2026-11-20); the four
   on the hero-slot offer left with the offer (FB-5, 2026-11-21), two on the line that replaced it took their place. */
const MUTANTS = [
  ['the line forgets the heroes still to make (B-11)', 'src/app/slot-offer.js', "  return empty ? t('slots.play_to_make', { most, count: empty }) : t('slots.play_up_to', { most });", "  return t('slots.play_up_to', { most });"],
  ['the line counts a made hero as one to make (B-11)', 'src/app/slot-offer.js', '.filter((r) => r && !r.exists).length', '.length'],
  /* the closed notice's Check again: a failed read is not a no (B-7) */
  ['a failed read reads as a no (B-7)', 'src/session/account-session.js', "return ans.closed ? 'closed' : ans.ok ? 'in' : 'unanswered';", "return ans.ok ? 'in' : 'closed';"],
  /* the away stamp outlives the page (B-17) */
  ['the keepalive never reaches the fetch (B-17)', 'src/session/server.js', '...(keep && body.length < KEEPALIVE_MAX_BYTES ? { keepalive: true } : {}),', ''],
  /* the legal pages (B-20) */
  ['the server link reads any path it is given (B-20)', 'src/session/server.js', 'if (!LEGAL_PATHS.includes(path)) return null;', ''],
  ['the reader shows the owner\'s notes to players (B-20)', 'src/app/legal-reader.js', ".replace(/<!--[\\s\\S]*?-->/g, '')", ''],
];

runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/client-boot-pure.mjs', pure, mutants: MUTANTS,
  green: 'the boot\'s pure rules hold (B-20, B-17, B-11, B-7)' })
  .then((code) => process.exit(code));
