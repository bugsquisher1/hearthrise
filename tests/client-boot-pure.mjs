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
//   B-11 BUY A HERO SLOT: the line over the roster says how the other slots come; the offer reads the account's purse at the
//        newest wallet version (never a lagging hero's), the server's price, what is short, off while short or buying ("Buying…"),
//        paid by the lowest hero; the first press asks at the server's price; none beside an empty slot or at the cap
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

/* What the offer block shows, read off its HTML the way the page's text reads (entities decoded). */
const decode = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&');
function offerView(html) {
  const tag = (re) => { const m = re.exec(html); return m ? m : null; };
  const buy = tag(/<button([^>]*)data-app="buy-slot"([^>]*)>([^<]*)<\/button>/);
  const attrs = buy ? buy[1] + buy[2] : '';
  const text = (cls) => { const m = new RegExp('<p class="' + cls + '"[^>]*>([^<]*)</p>').exec(html); return m ? decode(m[1]) : ''; };
  const yes = tag(/<button[^>]*data-app="buy-slot-yes"[^>]*>([^<]*)<\/button>/);
  return { html: html.length > 0, buy: buy ? { text: decode(buy[3]).trim(), off: /\sdisabled(\s|$)/.test(attrs), pay: (/data-pay="(\d+)"/.exec(attrs) || [])[1] || null } : null,
    purse: text('slot-offer-purse'), short: text('slot-offer-short'), q: text('slot-offer-ask'), yes: yes ? decode(yes[1]) : '',
    no: /data-app="buy-slot-no"/.test(html), picker: /<select/.test(html) };
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

  { // B-11 buy a hero slot with the account's gold, at the server's price; none at the cap
    const o = { heroes: { 0: 'Tester', 1: 'Fennick' }, slots: [0, 1], purse: 14100, goldV: 7, lag: { 1: { gold: 90000, v: 3 } }, ladder: { 2: 15000, 3: 40000 } };
    let acct = accountOf(M, o);
    let rows = await acct.roster();
    /* "Up to 4" beside two slots says how the other two come; the price is the offer block's own, so the line names none. */
    const lead = M.SO.playLineOf(acct.statedLimit(), acct.limit(), rows.length, acct.slotOffer, rows);
    if (!/Hero slots: 2 \(up to 4 play at once\)\. More cost gold/.test(lead)) fails.push('B-11 the line over the roster reads ' + JSON.stringify(lead));
    /* 14,100 at wallet version 7 is the purse; Fennick's older answer (90,000 at version 3) is not. */
    const b0 = offerView(M.SO.slotOfferHtml(acct.slotOffer, rows, { pending: false, asking: false }));
    if (!b0.buy || b0.buy.text !== 'Buy a hero slot for 15,000 gold' || !b0.buy.off || b0.buy.pay !== '0' || b0.picker
      || b0.purse !== 'Gold: 14,100 gp' || !/^Need 900 more gold/.test(b0.short)) fails.push('B-11 the offer short of gold reads ' + JSON.stringify(b0) + ' (expected Gold: 14,100, 900 short, off, no payer to pick)');
    else {
      Object.assign(o, { purse: 80000, goldV: 8, lag: null });
      acct = accountOf(M, o);
      rows = await acct.roster();
      const b1 = offerView(M.SO.slotOfferHtml(acct.slotOffer, rows, { pending: false, asking: false }));
      if (!b1.buy || b1.buy.off || b1.buy.pay !== '0' || b1.short || b1.purse !== 'Gold: 80,000 gp') fails.push('B-11 the offer with gold reads ' + JSON.stringify(b1));
      /* B-11c BUY ASKS FIRST: the asking block names the slot and the server's price, with Buy for N and Cancel, and no Buy */
      const a1 = offerView(M.SO.slotOfferHtml(acct.slotOffer, rows, { pending: false, asking: true }));
      if (a1.q !== 'Buy the Third hero slot for 15,000 gold?' || a1.yes !== 'Buy for 15,000 gold' || !a1.no || a1.buy) fails.push('B-11c the first press on Buy reads ' + JSON.stringify(a1));
      const b2 = offerView(M.SO.slotOfferHtml(acct.slotOffer, rows, { pending: true, asking: false }));
      if (!b2.buy || !b2.buy.off || b2.buy.text !== 'Buying…') fails.push('B-11 while the purchase is out the button reads ' + JSON.stringify(b2.buy));
      /* The new slot stands empty, so no other is on sale until a hero is in it; the third hero brings the fourth slot's price. */
      o.slots = [0, 1, 2];
      acct = accountOf(M, o);
      rows = await acct.roster();
      const b3 = M.SO.slotOfferHtml(acct.slotOffer, rows, { pending: false, asking: false });
      if (rows.length !== 3 || b3) fails.push('B-11 after the purchase the roster reads ' + JSON.stringify(offerView(b3)) + ' beside the new empty slot');
      Object.assign(o, { slots: [0, 1, 2, 3], heroes: { 0: 'Tester', 1: 'Fennick', 2: 'Wren', 3: 'Moss' } });
      acct = accountOf(M, o);
      rows = await acct.roster();
      if (rows.length !== 4 || M.SO.slotOfferHtml(acct.slotOffer, rows, { pending: false, asking: false })) fails.push('B-11 at four slots the roster still offers a slot, or does not list four');
    }
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

/* The eight mutants of tests/client-boot.mjs planted in modules a page only hosts, moved here verbatim (lane/c-rules-in-node
   2026-11-20). Each one's page rule is the rule that catches it here. */
const MUTANTS = [
  ['no hero slot is offered', 'src/app/slot-offer.js', "  if (!offer || !purse || actor === null || anEmptySlot(roster)) return '';", "  return '';"],
  ['the oldest hero answer is the purse', 'src/app/slot-offer.js', '    if (!best || v > best.v) best = { gold: r.gold, v };', '    if (!best || v < best.v) best = { gold: r.gold, v };'],
  ['the buy button stays lit while buying', 'src/app/slot-offer.js', "(o.pending || short > 0 ? ' disabled' : '')", "(short > 0 ? ' disabled' : '')"],
  ['a hero short of gold can press buy', 'src/app/slot-offer.js', "(o.pending || short > 0 ? ' disabled' : '')", "(o.pending ? ' disabled' : '')"],
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
