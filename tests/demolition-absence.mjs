#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/demolition-absence.mjs — THE CLEAN SLATE STAYS CLEAN (client half)
//
//   node tests/demolition-absence.mjs             the guard
//   node tests/demolition-absence.mjs --selftest  every planted defect must turn it red
//   node tests/demolition-absence.mjs --report    print every hit, allowlisted or not
//
// On 2026-10-14 the game closed for a rebuild and the systems below were
// demolished client-side (lane D1, demolition plan §1/§5): clans and the castle,
// raids and the clan hunt, the party client, the muster / rallies / world events
// and blessings, renown, the daily quests / login reward / streaks, deeds, the
// bounty board / Marks / traits, dungeons / scrip / the Quartermaster, the gem
// shop (themes, cosmetics, IAP, the Hearth Token redeem), charms and the
// Hunter's Ledger, companions and pets, the Boss of the Day card, Set the Night
// and the night plan, Enchant v1, and the Auto-Eat client surface. This guard is
// what keeps them gone: re-adding any name below to shipped code is RED.
//
//   DA-1  no CODE under src/**, index.html, old-client.html or supabase/functions/** names a
//         demolished global, constant or intent verb (comments are not code;
//         string literals are, because a verb is a string)
//   DA-2  every demolished file stays deleted, and old-client.html loads none of them
//   DA-3  old-client.html carries no door or panel for a demolished screen
//   DA-4  src/data/skills.js declares neither bountyHunter nor stonemason
//   DA-5  THE ALLOWLIST ONLY SHRINKS. The engine/edge files C2 and B1 still own
//         (combat-sim, accrue, record, the hr-accrue edge, death-sheet, combat
//         screens …) carry a few of these names until their own follow-on lane
//         removes them. Each is listed by file AND name; an entry whose name has
//         left its file is STALE (red — delete the entry), and the total may not
//         exceed ALLOW_MAX (red — a new hit is a new demolished read, not debt).
//
// Deliberately NOT here (rulings after the plan): HearthriseTools and tool
// items stay — tools are optional boosts (Coordinator, 2026-10-14). The SQL half
// (hr_client_rpc_baseline, hr_rpc_gate, the schema replay, hr_apply / hr_state_of
// keys) lands with M1/M2 in tests/ alongside the migrations.
//
// Pure text, no database, no network, milliseconds. Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── What was demolished, by name ─────────────────────────────────────── */
export const NAMES = [
  // window globals
  'HearthriseClans', 'HearthriseClanSeat', 'HearthriseClanSeatUI', 'HearthriseRaids', 'HearthriseParty',
  'HearthriseMuster', 'HearthriseWorldEvents', 'HearthriseRenown', 'HearthriseDailyQuests', 'HearthriseDaily',
  'HearthriseStreakChip', 'HearthriseDeeds', 'HearthriseDeedsList', 'HearthriseBountyView', 'HearthriseCharms',
  'HearthriseCompanions', 'HearthriseGemUnlocks', 'HearthriseThisWeek', 'HearthriseTally', 'HearthrisePets',
  'HearthrisePetSession', 'HearthriseNightPlan', 'HearthriseSetTheNight', 'HearthriseHuntersLedger',
  'HearthriseSpoils', 'HearthriseEnchant', 'HearthriseHouseThemes', 'HearthriseMarks', 'HearthriseBossOfDay',
  // constants and fields
  'DAILY_TASK_POOL', 'RAID_BOSSES', 'BOUNTY_SHOP', 'IAP_CATALOG', 'HOUSE_THEMES', 'partyIntentFence', 'TRAITS',
  // client functions of the demolished surfaces
  'generateBountyBoard', 'ensureBountyState', 'renderBountyPanel', 'hrBountyView', 'buyTrait', 'hasTrait',
  'setAutoEatFood', 'openAutoEatPicker', 'openEnchantPicker', 'redeemHearthToken', 'renderClan', 'buyTheme',
];
/* Intent verbs: matched as a quoted string, since that is how a verb travels. */
export const VERBS = ['enchant', 'dungeon_settle', 'quartermaster_buy', 'claim_reward'];

export const DELETED_FILES = [
  'src/features/clans.js', 'src/features/clan-seat.js', 'src/features/clan-seat-ui.js', 'src/styles/clan-seat.css',
  'src/features/raids.js', 'src/net/party.js', 'src/render/party-panel.js', 'src/features/muster.js',
  'src/features/world-events.js', 'src/features/renown.js', 'src/features/daily-quests.js', 'src/features/this-week.js',
  'src/features/daily-reward.js', 'src/render/streak-chip.js', 'src/features/deeds.js', 'src/render/achievements.js',
  'src/core/bounty.js', 'src/render/bounty-progress.js', 'src/net/marks-record.js', 'src/dungeons.js',
  'src/dungeon-scavenger.js', 'src/net/dungeon-purchase.js', 'src/net/dungeon-settle.js', 'src/render/spoils-sheet.js',
  'src/styles/spoils.css', 'src/features/gem-unlocks.js', 'src/render/house-themes.js', 'src/features/hunters-ledger.js',
  'src/styles/hunters-ledger.css', 'src/render/bestiary-charms.js', 'src/features/companions.js', 'src/features/pets.js',
  'src/features/pet-session.js', 'src/render/companion-lines.js', 'src/net/enchant.js', 'src/features/boss-of-the-day.js',
  'src/features/set-the-night.js', 'src/features/night-plan.js', 'src/styles/night-plan.css',
  'tools/set-the-night-page.mjs', 'tools/gen-rally-action-times.mjs',
];
const SCREENS = ['clan', 'party', 'events', 'dungeons', 'bounty', 'stable'];

/* ── DA-5: what C2 / B1 still carry, by file and name. May only SHRINK. ── */
export const ALLOW = {
  // C2 (net/accrue, the hr-accrue edge): the engine/edge follow-on, plan §2 Phase 2.
  // The daily, party fence, enchant, dungeon settle, Quartermaster and claim_reward
  // entries left with C2's deletion of that code (2026-10-15 merge).
  'src/net/accrue.js': ['HearthriseRenown', 'enchant'],
  'supabase/functions/hr-accrue/intents.js': ['enchant'],
  // B1 (combat screens, death sheet, hunt panel): the hunt-screen rebuild.
  'src/features/combat-screens.js': ['HearthriseCharms'],
  'src/features/death-sheet.js': ['TRAITS'],
  'src/render/hunt-panel.js': ['HearthriseMuster'],
};
export const ALLOW_MAX = 6;    // 24 -> 6: C2 deleted the daily, party-fence, enchant, dungeon, Quartermaster and claim_reward code (2026-10-15)

/* ── Comments out, strings kept (a verb is a string) ──────────────────── */
export function stripComments(t) {
  let out = '', i = 0, q = null, prev = '';
  const n = t.length;
  const regexOk = () => !/[\w$)\]]$/.test(prev.trimEnd()) || /\b(return|typeof|case|in|of|delete|void|throw|new)$/.test(prev.trimEnd());
  while (i < n) {
    const c = t[i], two = t.slice(i, i + 2);
    if (q) {
      out += c;
      if (c === '\\') { out += t[i + 1] || ''; i += 2; continue; }
      if (c === q || (c === '\n' && q !== '`')) q = null;
      i++; continue;
    }
    if (two === '//') { while (i < n && t[i] !== '\n') i++; continue; }
    if (two === '/*') { const e = t.indexOf('*/', i + 2); const chunk = t.slice(i, e < 0 ? n : e + 2); out += chunk.replace(/[^\n]/g, ' '); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; prev += c; continue; }
    if (c === '/' && regexOk()) {   // a regex literal: copy it through untouched
      let j = i + 1, cls = false;
      while (j < n && t[j] !== '\n') { const d = t[j]; if (d === '\\') { j += 2; continue; } if (cls) { if (d === ']') cls = false; } else if (d === '[') cls = true; else if (d === '/') break; j++; }
      out += t.slice(i, j + 1); i = j + 1; prev = ')'; continue;
    }
    out += c; if (!/\s/.test(c)) prev = (prev + c).slice(-12); i++;
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function hitsIn(code) {
  const found = new Set();
  for (const nm of NAMES) if (new RegExp('(^|[^\\w$])' + esc(nm) + '(?![\\w$])').test(code)) found.add(nm);
  for (const v of VERBS) if (new RegExp('([\'"`])' + esc(v) + '\\1').test(code)) found.add(v);
  return found;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?js|ts|html)$/.test(e)) out.push(p);
  }
  return out;
}

export function loadWorld() {
  const files = new Map();
  for (const p of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase', 'functions')), join(ROOT, 'index.html'), join(ROOT, 'old-client.html')]) {
    files.set(relative(ROOT, p).replace(/\\/g, '/'), readFileSync(p, 'utf8'));
  }
  const exists = new Set(DELETED_FILES.filter((f) => existsSync(join(ROOT, f))));
  return { files, exists, skills: read('src/data/skills.js'), allow: ALLOW, allowMax: ALLOW_MAX };
}

/** Pure. Returns [{id, msg}] — empty is green. */
export function check(w, opts = {}) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });
  const report = [];
  const seen = {};
  for (const [file, text] of w.files) {
    const code = file.endsWith('.html') ? text.replace(/<!--[\s\S]*?-->/g, '') : stripComments(text);
    const hits = hitsIn(code);
    if (!hits.size) continue;
    seen[file] = hits;
    for (const h of hits) {
      const ok = (w.allow[file] || []).includes(h);
      report.push(`${ok ? 'allow' : 'RED  '}  ${file}  ${h}`);
      if (!ok) add('DA-1', `${file} names the demolished ${VERBS.includes(h) ? "verb '" + h + "'" : h} — that system is gone; do not bring it back`);
    }
  }
  for (const f of w.exists) add('DA-2', `${f} is a demolished file and exists again`);
  const html = w.files.get('old-client.html') || '';
  for (const f of DELETED_FILES) {
    const tail = f.replace(/^src\//, 'src/');
    if (html.includes('"' + tail + '?v=') || html.includes('"' + tail + '"')) add('DA-2', `old-client.html still loads ${f}`);
  }
  const htmlCode = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const s of SCREENS) {
    if (new RegExp('data-tab="' + s + '"').test(htmlCode)) add('DA-3', `old-client.html has a door to the demolished '${s}' screen`);
    if (new RegExp('id="panel-' + s + '"').test(htmlCode)) add('DA-3', `old-client.html has a panel for the demolished '${s}' screen`);
  }
  const skillsCode = stripComments(w.skills);
  for (const k of ['bountyHunter', 'stonemason']) {
    if (new RegExp('(^|[\\s{,])' + k + '\\s*:').test(skillsCode)) add('DA-4', `src/data/skills.js declares the demolished skill '${k}'`);
  }
  let total = 0;
  for (const [file, names] of Object.entries(w.allow)) {
    total += names.length;
    for (const nm of names) {
      if (!(seen[file] && seen[file].has(nm))) add('DA-5', `ALLOW names ${nm} in ${file}, which no longer carries it — delete the stale entry (the list only shrinks)`);
    }
  }
  if (total > w.allowMax) add('DA-5', `ALLOW holds ${total} entries, above ALLOW_MAX ${w.allowMax} — the list may only shrink`);
  if (opts.report) console.log(report.sort().join('\n'));
  return problems;
}

function clone(w) { return { files: new Map(w.files), exists: new Set(w.exists), skills: w.skills, allow: JSON.parse(JSON.stringify(w.allow)), allowMax: w.allowMax }; }

function selftest(w) {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(w);
  say(clean.length === 0, 'clean arm is green' + (clean.length ? ' → ' + clean.map((p) => p.id + ' ' + p.msg).join(' | ') : ''));
  const legacy = 'src/legacy.js';
  const arms = [
    ['a demolished global is read again (window.HearthriseClans in legacy.js)', 'DA-1', (x) => { x.files.set(legacy, x.files.get(legacy) + '\nvar __c = window.HearthriseClans;\n'); }],
    ['a demolished verb is sent again (\'claim_reward\' in a feature)', 'DA-1', (x) => { x.files.set('src/features/x.js', "send({ verb: 'claim_reward' });\n"); }],
    ['a demolished constant returns (DAILY_TASK_POOL)', 'DA-1', (x) => { x.files.set('src/features/y.js', 'export const DAILY_TASK_POOL = [];\n'); }],
    ['a demolished file is restored (src/features/clans.js)', 'DA-2', (x) => { x.exists.add('src/features/clans.js'); }],
    ['old-client.html loads a demolished script again', 'DA-2', (x) => { x.files.set('old-client.html', x.files.get('old-client.html') + '\n<script src="src/features/muster.js?v=1"></script>\n'); }],
    ['old-client.html grows the Clan door back', 'DA-3', (x) => { x.files.set('old-client.html', x.files.get('old-client.html') + '\n<button class="nav-btn" data-tab="clan"></button>\n'); }],
    ['the Bounty Hunter skill is declared again', 'DA-4', (x) => { x.skills += "\nexport const X = { bountyHunter: { name: 'Bounty Hunter' } };\n"; }],
    ['the allowlist grows past its cap', 'DA-5', (x) => { x.allow['src/legacy.js'] = ['HearthriseClans']; x.files.set(legacy, x.files.get(legacy) + '\nwindow.HearthriseClans;\n'); }],
    ['an allowlist entry goes stale (its file dropped the name)', 'DA-5', (x) => { const f = Object.keys(x.allow)[0]; x.allow[f] = x.allow[f].concat('HearthriseSpoils'); x.allowMax += 1; }],
  ];
  for (const [label, want, plant] of arms) {
    const x = clone(w); plant(x);
    const ids = new Set(check(x).map((p) => p.id));
    say(ids.has(want), `${label} → ${want}${ids.has(want) ? '' : ' (got ' + [...ids].join(',') + ')'}`);
  }
  const controls = [
    ['a comment naming HearthriseRenown', (x) => { x.files.set('src/features/z.js', '// HearthriseRenown left on 2026-10-14\n/* claim_reward is gone */\nvar ok = 1;\n'); }],
    ['an unrelated longer identifier (HearthriseDailyCount)', (x) => { x.files.set('src/features/z.js', 'var HearthriseDailyCount = 1;\n'); }],
    ['the word enchant in prose inside a string', (x) => { x.files.set('src/features/z.js', "var s = 'they enchant the hall';\n"); }],
  ];
  for (const [label, plant] of controls) {
    const x = clone(w); plant(x);
    const got = check(x);
    say(got.length === 0, `control: ${label} stays green${got.length ? ' (got ' + got.map((p) => p.id + ' ' + p.msg).join(' | ') + ')' : ''}`);
  }
  console.log(bad ? `✗ demolition-absence --selftest: ${bad} arm(s) wrong`
    : `✓ demolition-absence --selftest: clean arm green, ${arms.length}/${arms.length} plants caught, ${controls.length} controls green`);
  return bad ? 1 : 0;
}

try {
  const w = loadWorld();
  if (process.argv.includes('--selftest')) process.exit(selftest(w));
  const problems = check(w, { report: process.argv.includes('--report') });
  if (problems.length) {
    console.error(`✗ demolition-absence: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`    ${p.id}  ${p.msg}`);
    process.exit(1);
  }
  const allowed = Object.values(ALLOW).reduce((n, a) => n + a.length, 0);
  console.log(`✓ demolition-absence: ${w.files.size} files name none of the ${NAMES.length + VERBS.length} demolished names outside `
    + `${allowed} allowlisted engine reads (cap ${ALLOW_MAX}); ${DELETED_FILES.length} files stay deleted; no door to ${SCREENS.length} demolished screens`);
} catch (e) {
  console.error(`✗ demolition-absence harness error: ${e && e.stack || e}`);
  process.exit(2);
}
