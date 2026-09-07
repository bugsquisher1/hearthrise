#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/raid-card-copy.mjs — THE RULE MUST BE ON THE CARD.
//
// A reward rule a player cannot see is the same failure as a stat that
// renders no number: they cannot aim at it, and they blame each other for
// outcomes nobody chose. The Hunt card used to print "Median <n>" -- a number
// that was somebody ELSE's damage, under a label that explained nothing.
//
// This drives the REAL raids.js in REAL headless Chromium against the REAL
// index.html, with only the two PostgREST reads stubbed (clan_raids and
// raid_contributions -- world-readable rows the card fetches), and asserts on
// the rendered card's own text. Nothing is reimplemented.
//
//   node tests/raid-card-copy.mjs [--headed]
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

/* THE MUTATION SEAM (used only by --selftest).
   `MUTATION` rewrites the SOURCE FILE the browser loads, so a planted defect is
   a defect in the real src/features/raids.js the real renderer runs — not in a
   fixture, and not in this test's own copy of anything. Nothing on disk is
   touched; the substitution happens on the way out of the static server. */
let MUTATION = null;

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = join(ROOT, p === '/' ? 'index.html' : p);
  if (!normalize(file).startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    let body = await readFile(file);
    const rel = normalize(file).slice(ROOT.length + 1).replace(/\\/g, '/');
    if (MUTATION) {
      const patched = MUTATION.patch(rel, body.toString('utf8'));
      if (patched != null) { MUTATION.applied = true; body = Buffer.from(patched, 'utf8'); }
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });

/** One full observation of the card: the gated render and the launched one. */
async function observe() {
  const page = await browser.newPage();
  // The b224 account wall keeps the engine from booting for a signed-out visitor.
  // Same test-only bypass run-smoke.mjs uses; the wall itself is guarded there.
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.HearthriseRaids && window.G, null, { timeout: 30000 });
  const out = await page.evaluate(readCard);
  await page.close();
  return out;
}

/* A Tier I Hunt declared by a clan of two -> pool 11,000, share 5,500.
   The player struck three times for 1,800: a third of her share, which under
   the retired median rule could have been anything from a Full share to
   nothing depending on what her clanmate did that week.

   ⚠ THE CARD IS BEHIND THE CLAN-LAUNCH GATE, AND THAT IS WHY THIS FILE WAS RED.
   b385 (src/features/raids.js:1152-1172) short-circuits render() through
   HearthriseClans.comingSoonHtml while CLAN_LAUNCHED is false, so what a player
   sees today is "Coming in Open Beta 1 / The Weekly Clan Boss / …". Every copy
   assertion below therefore read a placeholder and five of them failed —
   measured 2026-09-04, and the copy in raids.js is INTACT, not regressed: the
   guard was asserting against a screen the gate had replaced.
   Two renders, and the first one is not a formality: it PINS THE GATE. If
   somebody flips CLAN_LAUNCHED early, or the coming-soon short-circuit is
   deleted, a functional Strike/Claim/Declare control starts rendering on a
   surface whose claim + weekly-reset server half is deferred — and that is a
   value-crossing control, which is worth a red build on its own. Only then is
   the gate lifted, through the module's OWN exported seam (never by editing the
   flag), so the second render exercises the real card. */
async function readCard() {
  window.HearthriseSupabase = { getConfig: () => ({ url: 'https://stub.invalid', anonKey: 'stub' }) };
  window.HearthriseAuth = { getSession: () => ({ access_token: 't', user: { id: 'me' } }) };
  window.G.clanId = 'clan-1';
  const RAID = [{ clan_id: 'clan-1', week_key: 'w0', boss_id: 'emberclad_tyrant',
    hp_remaining: 0, max_hp: 11000, tier: 1, members_at_declare: 2, downed_at: '2026-08-11T00:00:00Z' }];
  const ROWS = [{ user_id: 'me', damage: 1800, strikes: 3 },
                { user_id: 'them', damage: 9200, strikes: 5 }];
  window.fetch = async (u) => ({
    ok: true, status: 200,
    json: async () => (String(u).includes('raid_contributions') ? ROWS : RAID)
  });
  const read = async () => {
    window.HearthriseRaids.invalidate?.();
    await window.HearthriseRaids.render();
    await new Promise((r) => setTimeout(r, 250));
    const el = document.getElementById('hr-raid-card');
    if (!el) return { text: null, controls: -1 };
    return {
      text: el.innerText.replace(/\s+/g, ' ').trim(),
      // Controls, not words: the coming-soon body legitimately says "strike
      // together across the week" in PROSE. What must not exist is something a
      // player can press.
      controls: el.querySelectorAll('button, a[href], input, [role="button"], [onclick]').length,
    };
  };

  // 1. The shipped state: the gate as the game really carries it.
  const g = await read();
  const gated = g.text; const gatedControls = g.controls;

  // 2. Lift it the way the launch will, at the exported seam.
  const CL = window.HearthriseClans;
  if (!CL || typeof CL.clanLaunched !== 'function') {
    return { gated, gatedControls, card: null };
  }
  CL.clanLaunched = () => true;
  const c = await read();
  return { gated, gatedControls, card: c.text };
}

/* NO SCREENSHOT, deliberately. The card is inside a panel that is
   display:none until its tab is opened, and forcing it visible produces a
   picture of the wrong box -- which would be worse than no picture, because
   it looks like evidence. This test owns the COPY (asserted above, off the
   live DOM). Whether three lines of rule text belong on this card at this
   density is a layout question and belongs to the Art Director; raised in
   HANDOFFS rather than answered here. */
// ── THE GRADING, as a pure function of what was rendered ─────────────────
// Extracted so --selftest grades planted defects with the SAME checks the plain
// run uses. Returns the list of assertions that failed, by NAME (the name is
// what a mutation is required to turn red, so "something went red" can never be
// mistaken for "the right thing went red").
function grade({ gated, gatedControls, card }, log = () => {}) {
  const fail = [];
  const check = (name, ok) => { log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`); if (!ok) fail.push(name); };

  /* THE GATE ITSELF, PINNED. b385 defers every clan surface behind one idiom; a
     Hunt card that renders a Strike/Claim/Declare control while the claim and the
     weekly reset are still deferred is a value-crossing control on a screen the
     server half does not back yet. Cheap to assert, and it is the reason the
     second render below is allowed to lift the gate at all. */
  check('GATE-CLOSED: with the gate closed the card is the shared coming-soon state, not a functional Hunt',
    /Coming in Open Beta 1/.test(gated || ''));
  check(`GATE-INERT: the gated card offers nothing pressable (found ${gatedControls} control(s)) — counting `
    + 'BUTTONS, not words, because the coming-soon body legitimately says "strike together" in prose',
    gatedControls === 0);
  check('GATE-LIFTS: lifting the gate CHANGES the card — otherwise every assertion below is reading the '
    + 'same placeholder and proving nothing',
    (gated || '') !== (card || ''));

  check('CARD-RENDERS: the clan Hunt card renders', !!card);
  check('NO-MEDIAN: the card no longer labels another player\'s damage as your bar',
    !/Median/i.test(card || ''));
  check('YOUR-SHARE: the card states YOUR SHARE, and it is the boss split over the roster it was declared for',
    /Your share 5,500/.test(card || ''));
  check('BAND-NAMED: 1,800 of a 5,500 share reads as a Partisan\'s share, not "No chest"',
    /Partisan/.test(card || ''));
  check('NOT-VS-CLANMATES: the card says outright that nobody else\'s week can shrink your chest',
    /never against your clanmates/.test(card || ''));
  check('PRICE-STATED: the card states the price of a share, which is the only thing that can refuse you',
    /2 strikes on 2 days/.test(card || ''));
  check('LADDER-STATED: the card states the whole ladder, so a player can aim at the next band',
    /half your share is a Full share/.test(card || '') && /Champion/.test(card || ''));

  return fail;
}

// ════════════════════════════════════════════════════════════════════════
// --selftest — THE MUTATION PROOF
//
// This guard exists because a REWARD RULE A PLAYER CANNOT SEE is the same
// failure as no rule at all — and because on 2026-09-04 it was found asserting
// against a screen the clan gate had replaced, i.e. passing/failing for a
// reason that had nothing to do with the copy. So each mutation below edits the
// REAL src/features/raids.js (or clans.js) on the way to the REAL browser,
// re-renders, and requires the NAMED assertion that owns that property to go
// red. Nothing on disk is modified.
//
// No mutation is a syntax break: every one is a plausible copy or logic edit.
// ════════════════════════════════════════════════════════════════════════
const RAIDS = 'src/features/raids.js';
const sub = (rel, src, file, from, to) => {
  if (rel !== file) return null;
  if (!src.includes(from)) throw new Error(`mutation anchor not found in ${file}: ${from}`);
  return src.split(from).join(to);
};

const MUTATIONS = [
  { id: 'C1-median-returns',
    why: 'the retired rule comes back: the card labels somebody ELSE\'s damage as your bar, which '
       + 'is the exact copy this file was written to kill',
    patch: (rel, s) => sub(rel, s, RAIDS, "'<span>Your share <b>'", "'<span>Median <b>'"),
    expect: ['NO-MEDIAN', 'YOUR-SHARE'] },

  { id: 'C2-share-split-by-current-roster',
    why: 'the share is divided by who is in the clan NOW instead of members_at_declare, so a player '
       + 'who reads "your share" is told a number that moves when somebody else joins',
    patch: (rel, s) => sub(rel, s, RAIDS,
      'var atDeclare = (raid && +raid.members_at_declare) || 0;',
      'var atDeclare = 4;'),
    expect: ['YOUR-SHARE'] },

  { id: 'C3-clanmate-reassurance-deleted',
    why: 'the one sentence that tells a player nobody else\'s week can shrink their chest is dropped '
       + 'as "wordy" — the rule still holds, and becomes invisible again',
    patch: (rel, s) => sub(rel, s, RAIDS, 'never against your clanmates', 'measured fairly'),
    expect: ['NOT-VS-CLANMATES'] },

  { id: 'C4-price-of-a-share-hidden',
    why: 'the strike requirement — the ONLY thing that can refuse a chest — stops being printed, so '
       + 'the refusal arrives with no warning',
    patch: (rel, s) => sub(rel, s, RAIDS,
      "'<b>' + MIN_STRIKES_FOR_CHEST + ' strikes on ' + MIN_STRIKES_FOR_CHEST + ' days</b> earn at least a '",
      "'<b>regular participation</b> earns at least a '"),
    expect: ['PRICE-STATED'] },

  { id: 'C5-ladder-collapsed',
    why: 'the band ladder is trimmed, so a player can see where they are and not what to aim at',
    patch: (rel, s) => sub(rel, s, RAIDS, 'half your share is a Full share; ', ''),
    expect: ['LADDER-STATED'] },

  { id: 'C6-clan-gate-opened-early',
    why: 'THE VALUE-CROSSING ONE: the coming-soon short-circuit stops firing, so a functional '
       + 'Strike/Claim/Declare card renders while the claim and weekly-reset server half is still '
       + 'deferred. The gated render must stop being the coming-soon state',
    patch: (rel, s) => sub(rel, s, RAIDS,
      "if (CL && typeof CL.clanLaunched === 'function' && !CL.clanLaunched()) {",
      "if (false) {"),
    expect: ['GATE-CLOSED', 'GATE-LIFTS'] },
];

async function selftest() {
  console.log('raid-card-copy --selftest: each mutation must turn a NAMED assertion RED\n');
  let bad = 0;

  // CLEAN control first: a guard that is red at rest proves nothing when red.
  MUTATION = null;
  const cleanFail = grade(await observe());
  if (cleanFail.length) {
    bad++;
    console.log('  FAIL  CLEAN control is RED — the mutations below prove nothing');
    for (const f of cleanFail) console.log('          ' + f.slice(0, 140));
  } else {
    console.log('  ok    CLEAN control is GREEN (the shipped card passes every assertion)');
  }

  for (const m of MUTATIONS) {
    MUTATION = { patch: m.patch, applied: false };
    let fails, reached;
    try { fails = grade(await observe()); }
    catch (e) { fails = ['THREW: ' + e.message]; }
    reached = MUTATION.applied;
    MUTATION = null;

    const names = fails.map((f) => f.split(':')[0]);
    const missed = m.expect.filter((n) => !names.includes(n));
    if (!reached) {
      bad++;
      console.log(`  FAIL  ${m.id} — the mutation never reached the browser (anchor served? file cached?)`);
    } else if (missed.length) {
      bad++;
      console.log(`  FAIL  ${m.id} — NOT CAUGHT by ${missed.join(', ')} (red: ${names.join(', ') || 'nothing'})`);
    } else {
      console.log(`  ok    ${m.id} — caught by ${m.expect.join(', ')}`);
    }
    console.log(`        ${m.why}`);
  }

  await browser.close(); server.close();
  console.log('');
  if (bad) { console.log(`raid-card-copy --selftest FAILED — ${bad} unproven`); process.exit(1); }
  console.log(`raid-card-copy --selftest PASSED — clean control green, ${MUTATIONS.length}/${MUTATIONS.length} mutations caught.`);
  process.exit(0);
}

if (process.argv.includes('--list')) {
  for (const m of MUTATIONS) console.log(m.id + '  —  ' + m.why);
  await browser.close(); server.close(); process.exit(0);
}
if (process.argv.includes('--selftest')) await selftest();

// ── The plain run ────────────────────────────────────────────────────────
const observed = await observe();
await browser.close();
server.close();

console.log('\nraid-card-copy — the rendered Hunt card\n');
console.log('  GATED (CLAN_LAUNCHED false, what a player sees today):');
console.log('  ' + (observed.gated || '(no card)') + '\n');
console.log('  LAUNCHED (CLAN_LAUNCHED lifted at the exported seam):');
console.log('  ' + (observed.card || '(no card)') + '\n');

const fail = grade(observed, (l) => console.log(l));

console.log('');
if (fail.length) { console.log(`FAILED — ${fail.length}`); process.exit(1); }
console.log('PASSED — the new rule is legible on the card a player actually reads.');
