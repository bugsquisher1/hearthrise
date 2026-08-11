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

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = join(ROOT, p === '/' ? 'index.html' : p);
  if (!normalize(file).startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage();
// The b224 account wall keeps the engine from booting for a signed-out visitor.
// Same test-only bypass run-smoke.mjs uses; the wall itself is guarded there.
await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.HearthriseRaids && window.G, null, { timeout: 30000 });

/* A Tier I Hunt declared by a clan of two -> pool 11,000, share 5,500.
   The player struck three times for 1,800: a third of her share, which under
   the retired median rule could have been anything from a Full share to
   nothing depending on what her clanmate did that week. */
const card = await page.evaluate(async () => {
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
  window.HearthriseRaids.invalidate?.();
  await window.HearthriseRaids.render();
  await new Promise((r) => setTimeout(r, 250));
  const el = document.getElementById('hr-raid-card');
  return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
});

/* NO SCREENSHOT, deliberately. The card is inside a panel that is
   display:none until its tab is opened, and forcing it visible produces a
   picture of the wrong box -- which would be worse than no picture, because
   it looks like evidence. This test owns the COPY (asserted above, off the
   live DOM). Whether three lines of rule text belong on this card at this
   density is a layout question and belongs to the Art Director; raised in
   HANDOFFS rather than answered here. */
await browser.close();
server.close();

const fail = [];
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

console.log('\nraid-card-copy — the rendered Hunt card\n');
console.log('  ' + (card || '(no card)') + '\n');

check(!!card, 'the clan Hunt card renders');
check(!/Median/i.test(card || ''), 'the card no longer labels another player\'s damage as your bar');
check(/Your share 5,500/.test(card || ''),
  'the card states YOUR SHARE, and it is the boss split over the roster it was declared for');
check(/Partisan/.test(card || ''),
  '1,800 of a 5,500 share reads as a Partisan\'s share, not "No chest"');
check(/never against your clanmates/.test(card || ''),
  'the card says outright that nobody else\'s week can shrink your chest');
check(/2 strikes on 2 days/.test(card || ''),
  'the card states the price of a share, which is the only thing that can refuse you');
check(/half your share is a Full share/.test(card || '') && /Champion/.test(card || ''),
  'the card states the whole ladder, so a player can aim at the next band');

console.log('');
if (fail.length) { console.log(`FAILED — ${fail.length}`); process.exit(1); }
console.log('PASSED — the new rule is legible on the card a player actually reads.');
