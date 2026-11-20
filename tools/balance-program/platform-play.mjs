#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/platform-play.mjs — WHAT ONE OPEN TAB ASKS THE SERVER, COUNTED (balance program, dive 28).
//
// A brand-new account on tools/qa/local-world.mjs (the real play.html and engine on the replayed chain, headless, no production,
// no secrets). It counts every request the page sends, by server function, and the bytes that come back, over four stretches a
// real player lives in: the first load to a hero in town, two minutes standing in town pressing nothing, two minutes watching
// a hunt, and a reload. Then it skips an hour with the page closed to the hunt and counts the journal rows and the row counts
// that hour wrote. The dive's "what everyone pays whether or not they use it" table is read from this.
//
//   node tools/balance-program/platform-play.mjs [--idle 120] [--watch 120]
//
// mutant-anchors: none — a manual play script of the balance program, not a guard
// ════════════════════════════════════════════════════════════════════════
import { openWorld } from '../qa/local-world.mjs';

const num = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const IDLE_S = num('idle', 120), WATCH_S = num('watch', 120);
const world = await openWorld({ tickMs: false, liveCalendar: true });
const p = await world.play({ account: 'platformdive', viewport: { width: 1440, height: 900 } });
const page = p.page;

/* every request to the server, named by the function it calls */
let bucket = new Map();
const nameOf = (url, body) => {
  const u = new URL(url);
  if (u.pathname.includes('/rest/v1/rpc/')) return 'rpc ' + u.pathname.split('/rpc/')[1];
  if (u.pathname.includes('/functions/v1/')) {
    let op = '';
    try { const j = JSON.parse(body || '{}'); op = j.op || j.verb || (j.intent && (j.intent.verb || j.intent.kind)) || (j.slot !== undefined ? 'settle' : ''); } catch { /* not json */ }
    return 'edge ' + u.pathname.split('/v1/')[1] + (op ? ' ' + op : '');
  }
  if (u.pathname.includes('/auth/v1/')) return 'auth ' + u.pathname.split('/v1/')[1];
  if (u.pathname.includes('/rest/v1/')) return 'rest ' + u.pathname.split('/v1/')[1];
  if (u.pathname.includes('/realtime/')) return 'realtime';
  return null;   // the site's own files
};
page.on('requestfinished', async (req) => {
  const name = nameOf(req.url(), req.postData());
  if (!name) return;
  let bytes = 0;
  try { const s = await req.sizes(); bytes = s.responseBodySize || 0; } catch { /* a closed page */ }
  const b = bucket.get(name) || { n: 0, bytes: 0 };
  b.n++; b.bytes += bytes; bucket.set(name, b);
});
const report = (title, seconds) => {
  const rows = [...bucket.entries()].sort((x, y) => y[1].n - x[1].n);
  const n = rows.reduce((s, r) => s + r[1].n, 0), bytes = rows.reduce((s, r) => s + r[1].bytes, 0);
  console.log('\n===== ' + title + (seconds ? ' (' + seconds + ' s): ' + (n * 3600 / seconds).toFixed(0) + ' calls an hour, ' + (bytes * 3600 / seconds / 1e6).toFixed(1) + ' MB an hour' : ': ' + n + ' calls, ' + (bytes / 1e3).toFixed(0) + ' KB') + ' =====');
  for (const [k, v] of rows) console.log(String(v.n).padStart(5) + '  ' + String(Math.round(v.bytes / Math.max(v.n, 1))).padStart(7) + ' B each  ' + k);
  bucket = new Map();
};
const counts = async () => {
  const r = await world.db.query(`select (select count(*) from public.player_ledger) ledger, (select count(*) from public.player_intents) intents,
    (select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) from pg_stat_user_tables where schemaname = 'public') writes`);
  return Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
};
const delta = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]]));

try {
  await p.createHero('Platdive');
  await page.waitForTimeout(3000);
  report('FIRST LOAD: sign-up to a hero standing in town');

  await page.waitForTimeout(IDLE_S * 1000);
  report('IN TOWN, pressing nothing', IDLE_S);

  await p.enterHunt('mill_cellar');
  await page.waitForTimeout(3000);
  report('STARTING A HUNT');
  const w0 = await counts();
  await page.waitForTimeout(WATCH_S * 1000);
  const w1 = await counts();
  report('WATCHING THE HUNT', WATCH_S);
  const dw = delta(w0, w1);
  console.log('database, watched, an hour: journal rows ' + (dw.ledger * 3600 / WATCH_S).toFixed(0) + ', intents ' + (dw.intents * 3600 / WATCH_S).toFixed(0) + ', row writes ' + (dw.writes * 3600 / WATCH_S).toFixed(0));

  await p.reload();
  await page.waitForTimeout(3000);
  report('A RELOAD while the hero hunts');

  /* the page goes to the characters screen's background: an hour passes on the server alone */
  await page.goto('about:blank');
  const a0 = await counts();
  for (let i = 0; i < 6; i++) await world.skip(10);
  const a1 = await counts();
  const da = delta(a0, a1);
  console.log('\n===== AN HOUR AWAY (six skips of ten minutes, the world tick settles) =====');
  console.log('database, away, an hour: journal rows ' + da.ledger + ', intents ' + da.intents + ', row writes ' + da.writes + '   (a skip settles each ten minutes in one window, so this is a FLOOR: the live tick settles 36 windows an hour)');
  console.log('\nerrors on the page: ' + (p.errors || []).length);
} finally {
  await world.close();
}
