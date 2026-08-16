#!/usr/bin/env node
// gen-review-book.mjs — builds docs/design/review-book.html from two markdown sources:
//   docs/design/review-book-content.md        (Libraries 1-3: monsters, items, progression, decisions)
//   docs/design/events-donations-and-voting.md (Library 4: Kindling/Beacon events rework)
//
// The committed HTML is the generated output. Regenerate with:
//   node tools/gen-review-book.mjs
//
// Output is deterministic (no timestamps) so re-running on unchanged sources is a no-op diff.
// The page is fully self-contained: no external requests, works over file://.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_CONTENT = path.join(ROOT, 'docs', 'design', 'review-book-content.md');
const SRC_EVENTS = path.join(ROOT, 'docs', 'design', 'events-donations-and-voting.md');
const OUT = path.join(ROOT, 'docs', 'design', 'review-book.html');

// Normalise line endings on read. Git checks these files out as CRLF on Windows
// (core.autocrlf), and every anchor/fence regex below is written against \n — without this
// the parse silently depends on which platform cloned the repo, which is the opposite of
// the deterministic-output promise in the header.
const read = p => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const md = read(SRC_CONTENT);
const ev = read(SRC_EVENTS);

// ---------------------------------------------------------------- helpers

function fail(msg) { console.error('gen-review-book: ' + msg); process.exit(1); }

function idx(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) fail('anchor not found: ' + JSON.stringify(anchor));
  return i;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// inline markdown -> HTML (escape first, then code/bold/italic)
function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return t;
}

function stripMd(s) {
  return String(s).replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '');
}

// split a markdown block into logical paragraphs (hard-wrapped lines joined)
function paras(block) {
  return block.split(/\n\s*\n/)
    .map(p => p.split('\n').map(l => l.trim()).filter(Boolean).join(' ').trim())
    .filter(p => p && !p.startsWith('###') && !p.startsWith('---'));
}

function parseTableBlock(block) {
  const lines = block.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) fail('table block too short: ' + block.slice(0, 80));
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  return { headers: cells(lines[0]), rows: lines.slice(2).map(cells) };
}

// first markdown table appearing after `anchor` in `src`
function grabTable(src, anchor) {
  const rest = src.slice(idx(src, anchor));
  const m = rest.match(/\n((?:\|[^\n]*\n)+)/);
  if (!m) fail('no table after anchor: ' + anchor);
  return parseTableBlock(m[1]);
}

// ---------------------------------------------------------------- parse: monsters

const monSection = md.slice(idx(md, '## 1C'), idx(md, '## 1D'));
const monsterGroups = [];
for (const chunk of monSection.split('\n### ').slice(1)) {
  const heading = chunk.split('\n', 1)[0];
  const cat = stripMd(heading.split('—')[0]).trim();
  const note = (heading.match(/\*\((.+?)\)\*/) || [])[1] || '';
  const t = parseTableBlock(chunk.split('\n').filter(l => l.trim().startsWith('|')).join('\n') + '\n');
  const entries = t.rows.map(r => ({
    id: stripMd(r[0]).trim(),
    name: stripMd(r[1]).trim(),
    tier: r[2],
    lib: 'monsters', cat,
    meta: `Tier ${esc(r[2])} · ${esc(cat)}`,
    lines: [
      `<strong>Profile:</strong> ${r[3] && r[3] !== 'default' ? inline(r[3]) : 'category default'}`,
      `<strong>Inspiration:</strong> ${inline(r[4])}`,
      inline(r[5]),
    ],
  }));
  monsterGroups.push({ cat, note, entries });
}
const MON = monsterGroups.flatMap(g => g.entries);

// ---------------------------------------------------------------- parse: items

const planTable = grabTable(md, '## 2B');
const ITEM_PLAN = planTable.rows.map(r => ({
  id: stripMd(r[0]).trim(),
  name: stripMd(r[1]).trim().replace(/\.$/, ''),
  lib: 'items', cat: 'Already planned (specced)',
  meta: `Planned · source: ${esc(stripMd(r[2]))}`,
  lines: [inline(r[1])],
}));

const itemSection = md.slice(idx(md, '## 2C'), idx(md, '# LIBRARY 3'));
const itemGroups = [];
for (const chunk of itemSection.split('\n### ').slice(1)) {
  const heading = stripMd(chunk.split('\n', 1)[0]);
  const cat = heading.split(' — ')[0].split(' (')[0].trim();
  const t = parseTableBlock(chunk.split('\n').filter(l => l.trim().startsWith('|')).join('\n') + '\n');
  const entries = t.rows.map(r => ({
    id: stripMd(r[0]).trim(),
    name: stripMd(r[1]).trim(),
    tier: r[3],
    lib: 'items', cat,
    meta: `${esc(stripMd(r[2]))}${r[3] && r[3] !== '—' ? ' · Tier ' + esc(r[3]) : ''} · FUSE: ${esc(stripMd(r[6]))}`,
    lines: [inline(r[4]), `<strong>Inspiration:</strong> ${inline(r[5])}`],
  }));
  itemGroups.push({ cat, entries });
}
const ITEM_NEW = itemGroups.flatMap(g => g.entries);

// ---------------------------------------------------------------- parse: progression

const progSection = md.slice(idx(md, '### PROG-01'), idx(md, '## 3A'));
const PROG = [];
for (const block of progSection.split(/\n---\n/)) {
  const h = block.match(/### (PROG-\d+) · (.+?) — \*(.+?)\*/);
  if (!h) continue;
  const body = block.slice(block.indexOf('\n'));
  const ps = paras(body);
  const how = ps.filter(p => p.startsWith('**How it works'));
  const rest = ps.filter(p => !p.startsWith('**How it works'));
  PROG.push({
    id: h[1], name: stripMd(h[2]).trim(),
    lib: 'progression', cat: 'Progression mechanisms',
    meta: `Mechanism · from ${esc(stripMd(h[3]))}`,
    lines: rest.map(inline),
    details: how.length ? how.map(inline) : null,
  });
}
if (PROG.length !== 10) fail(`expected 10 PROG blocks, got ${PROG.length}`);

const matrixTable = grabTable(md, '## 3A');

// ---------------------------------------------------------------- parse: decisions + recommendations

const decTable = grabTable(md, '## 4 · Open decisions');
const DEC = decTable.rows.map(r => ({
  id: stripMd(r[0]).trim(),
  name: stripMd(r[0]).trim(),
  lib: 'decisions', cat: 'Open decisions',
  kind: 'decision', badge: 'DECISION',
  meta: 'Open decision · blocks approvals that reference it',
  lines: [inline(r[1])],
}));

// ---------------------------------------------------------------- parse: dungeon (Library 5)

const dngTable = grabTable(md, '# LIBRARY 5');
const DNG = dngTable.rows.map(r => ({
  id: stripMd(r[0]).trim(),
  name: stripMd(r[1]).trim(),
  lib: 'dungeon', cat: 'The Long Night (vampire household)',
  meta: `${esc(stripMd(r[2]))}`,
  lines: [
    inline(r[3]),
    `<strong>Drop:</strong> ${r[4] && r[4] !== '—' ? inline(r[4]) : '<em>none — this card is the frame, not a piece</em>'}`,
    `<strong>Note:</strong> ${inline(r[5])}`,
  ],
}));

const dngIntro = paras(md.slice(idx(md, '**A vampire household.**'), idx(md, '| id | Name | Role |')));

const sec0 = md.slice(idx(md, '## 0 ·'), idx(md, '## 0.1'));
const recMatch = sec0.match(/\*\*MONSTERS\.\*\*([\s\S]*?)\n\n\*\*ITEMS\.\*\*([\s\S]*?)\n\n\*\*PROGRESSION\.\*\*([\s\S]*?)\n\n\*\*The constraint/);
if (!recMatch) fail('could not parse section 0 recommendations');
const constraintPara = paras(sec0.slice(sec0.indexOf('**The constraint')))[0];
const rec = (id, name, lib, text) => ({
  id, name, lib, cat: 'Recommendation', kind: 'decision', badge: 'RECOMMENDATION',
  meta: "Designer's front-matter recommendation for this library",
  lines: paras(text).map(inline),
});
const REC_MON = rec('REC-MONSTERS', 'Recommendation — Monsters', 'monsters', recMatch[1]);
const REC_ITEM = rec('REC-ITEMS', 'Recommendation — Items', 'items', recMatch[2]);
const REC_PROG = rec('REC-PROGRESSION', 'Recommendation — Progression', 'progression', recMatch[3]);

const sec01 = md.slice(idx(md, '## 0.1'), idx(md, '# LIBRARY 1'));
const readingNotes = sec01.split('\n').filter(l => /^- |^  /.test(l))
  .join('\n').split(/\n(?=- )/).filter(b => b.trim().startsWith('- '))
  .map(b => inline(b.replace(/^- /, '').split('\n').map(l => l.trim()).filter(Boolean).join(' ')));

// tables for context
const taxonomyTable = grabTable(md, '**Eleven categories.**');
const foldTable = grabTable(md, '## 1B');
const coverageTable = grabTable(md, '## 1D');
const liveItemsTable = grabTable(md, '## 2A');

// ---------------------------------------------------------------- parse: events

const renameTable = grabTable(ev, '## 1 · The rename');
const namingTable = grabTable(ev, '**Naming, locked:**');
const renameRec = (ev.match(/### Recommendation: (.+)/) || fail('no rename recommendation'))[1];
const renameWhy = ev.slice(idx(ev, 'Why this one wins:'), idx(ev, '**Naming, locked:**'));
const renameBullets = renameWhy.split(/\n(?=- )/).filter(b => b.trim().startsWith('- '))
  .map(b => inline(b.replace(/^- /, '').split('\n').map(l => l.trim()).filter(Boolean).join(' ')));
const renameTail = paras(ev.slice(idx(ev, '`HearthriseMuster`'), idx(ev, '## 2 ·')))[0];

const poolShape = paras(ev.slice(idx(ev, '### 2.1'), idx(ev, '### 2.2')))[0];
const valuationTable = grabTable(ev, '### 2.2');
const capsTable = grabTable(ev, 'Per-player caps');
const thresholdsCode = (ev.slice(idx(ev, '### 2.3')).match(/```\n([\s\S]*?)```/) || fail('no thresholds code'))[1];
const antiAbuseTable = grabTable(ev, '### 2.5');
const donorGets = paras(ev.slice(idx(ev, '### 2.6'), idx(ev, '### 2.7')));
const awayRule = paras(ev.slice(idx(ev, '### 2.7'), idx(ev, 'Implementation consequence')))[0];
const fuseRule = ev.slice(idx(ev, '### 2.8')).match(/```\n([\s\S]*?)```/)[1];

const existingRollsTable = grabTable(ev, '### 3.2');
const newRollsTable = grabTable(ev, '### 3.3');
const rollTotals = paras(ev.slice(idx(ev, '**Totals:'), idx(ev, '**Design intent')))[0];
const rollIntent = paras(ev.slice(idx(ev, '**Design intent'), idx(ev, '### 3.4')))[0];
const blockedTable = grabTable(ev, '### 3.4');

const tzTable = grabTable(ev, '### 4.1');
const anchorLine = (ev.match(/### \*\*(Weekly reset:.+?)\*\*/) || fail('no anchor line'))[1];
const ballotBullets = ev.slice(idx(ev, '### 4.2'), idx(ev, '### 4.3'))
  .split(/\n(?=- )/).filter(b => b.trim().startsWith('- '))
  .map(b => inline(b.replace(/^- /, '').split('\n').map(l => l.trim()).filter(Boolean).join(' ')));
const eligBlock = ev.slice(idx(ev, '### 4.3'), idx(ev, '### 4.4'));
const eligItems = eligBlock.split(/\n(?=\d\. )/).filter(b => /^\d\. /.test(b.trim()))
  .map(b => inline(b.replace(/^\d\. /, '').split('\n').map(l => l.trim()).filter(Boolean).join(' ')));
const eligTail = paras(eligBlock.slice(eligBlock.indexOf('Donations grant')))[0];
const closeBullets = ev.slice(idx(ev, '### 4.4'), idx(ev, '### 4.5'))
  .split(/\n(?=- )/).filter(b => b.trim().startsWith('- '))
  .map(b => inline(b.replace(/^- /, '').split('\n').map(l => l.trim()).filter(Boolean).join(' ')));
const composeTable = grabTable(ev, '### 4.5');
const retireParas = paras(ev.slice(idx(ev, '## 5 ·'), idx(ev, '## 6 ·')));

// ---------------------------------------------------------------- render helpers

function renderTable(caption, t) {
  const head = t.headers.map(h => `<th>${inline(h)}</th>`).join('');
  const body = t.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n');
  return `<figure class="tblwrap">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></div></figure>`;
}

const allEntries = [];
function card(e) {
  allEntries.push(e);
  const badge = e.badge ? `<span class="badge">${esc(e.badge)}</span>` : '';
  const details = e.details
    ? `<details><summary>How it works (source game)</summary>${e.details.map(p => `<p>${p}</p>`).join('')}</details>` : '';
  const bodyList = e.bodyHtml || e.lines.map(p => `<p>${p}</p>`).join('\n');
  const search = (e.id + ' ' + e.name + ' ' + (e.cat || '') + ' ' +
    stripMd((e.lines || []).join(' ')).replace(/<[^>]+>/g, ' ')).toLowerCase().replace(/\s+/g, ' ').slice(0, 800);
  return `<article class="card${e.kind === 'decision' ? ' decision' : ''}" data-id="${esc(e.id)}" data-lib="${esc(e.lib)}" data-cat="${esc(e.cat)}" data-search="${esc(search)}" tabindex="-1">
<header>${badge}<span class="cid">${esc(e.id)}</span><h3>${esc(e.name)}</h3></header>
<p class="meta">${e.meta}</p>
<div class="body">${bodyList}${details}${e.extra || ''}</div>
<div class="controls">
<div class="verdicts" role="group" aria-label="verdict">
<button type="button" class="vbtn v-approve" data-v="approve">👍 Approve</button>
<button type="button" class="vbtn v-reject" data-v="reject">👎 Reject</button>
<button type="button" class="vbtn v-maybe" data-v="maybe">🤔 Maybe</button>
</div>
<textarea rows="2" placeholder="Notes…" aria-label="notes for ${esc(e.id)}"></textarea>
</div>
</article>`;
}

function group(cat, note, cards) {
  return `<div class="group" data-cat="${esc(cat)}">
<h3 class="ghead">${esc(cat)}${note ? ` <span class="gnote">${esc(note)}</span>` : ''}</h3>
<div class="cards">
${cards.join('\n')}
</div>
</div>`;
}

// ---------------------------------------------------------------- assemble sections

const secMonsters = `
<section data-lib="monsters">
<h2>Library 1 · Monsters</h2>
<p class="secnote">31 live monsters across 6 families today. The proposal: the <strong>eleven Tibia bestiary classes</strong> that fit our roster, where the <strong>class carries the weakness profile</strong> and a monster may override at most one axis. ${MON.length} candidates below, every tier filled.</p>
${card(REC_MON)}
${DEC.map(card).join('\n')}
<details class="ctx" open><summary>Context: what an approval commits us to (b342 audit)</summary><ul>${readingNotes.map(n => `<li>${n}</li>`).join('')}</ul></details>
${renderTable('The 11-category taxonomy — the category carries the weakness profile', taxonomyTable)}
${renderTable('Where the current 31 live monsters land (folds, not renames)', foldTable)}
${renderTable('Tier coverage — C = candidate, L = live monster folded in, — = deliberate band', coverageTable)}
${monsterGroups.map(g => group(g.cat, g.note, g.entries.map(card))).join('\n')}
</section>`;

const secItems = `
<section data-lib="items">
<h2>Library 2 · Items</h2>
<p class="secnote">426 live items — structurally healthy, thematically flat. The 44 candidates are weighted toward bane gear, category charms, utility that changes what you can do, and cosmetics with function. The 10 planned groups from existing specs are listed first, approvable as units.</p>
${card(REC_ITEM)}
${renderTable('What is live today (426 items, measured)', liveItemsTable)}
${group('Already planned (specced)', 'from consumable-economy / progression-depth / itemization-rework', ITEM_PLAN.map(card))}
${itemGroups.map(g => group(g.cat, '', g.entries.map(card))).join('\n')}
</section>`;

const secProg = `
<section data-lib="progression">
<h2>Library 3 · Progression advancement options</h2>
<p class="secnote">${inline(constraintPara)}</p>
${card(REC_PROG)}
${group('Progression mechanisms', 'each independently approvable', PROG.map(card))}
${renderTable('How the ten interact — if several are approved', matrixTable)}
</section>`;

const EVT = [
  {
    id: 'EVT-RENAME', name: 'The Rename — The Kindling & The Beacon',
    lib: 'events', cat: 'Events rework', kind: 'decision', badge: 'DECISION',
    meta: 'Replaces the Muster naming · recommendation shown below',
    lines: [`<strong>Recommendation:</strong> ${inline(renameRec)}`, ...renameBullets, inline(renameTail)],
    extra: renderTable('The five candidates', renameTable) + renderTable('Naming, locked (if approved)', namingTable),
  },
  {
    id: 'EVT-POOL', name: 'The Donation Pool — embers, thresholds, caps',
    lib: 'events', cat: 'Events rework',
    meta: 'Server-side valuation catalogue · per-capita thresholds · ratcheting +1…+5',
    lines: [inline(poolShape), inline(awayRule), ...donorGets.slice(0, 2).map(inline)],
    extra: renderTable('What is donatable, and what it is worth', valuationTable)
      + `<figure class="tblwrap"><figcaption>Threshold scaling (per active player, frozen at open)</figcaption><div class="tbl"><pre>${esc(thresholdsCode.trim())}</pre></div></figure>`
      + renderTable('Per-player caps', capsTable)
      + renderTable('Anti-abuse rules', antiAbuseTable)
      + `<figure class="tblwrap"><figcaption>Power-budget ruling (the fuse)</figcaption><div class="tbl"><pre>${esc(fuseRule.trim())}</pre></div></figure>`,
  },
  {
    id: 'EVT-LIBRARY', name: 'The Blessing Library — 12 new rolls',
    lib: 'events', cat: 'Events rework',
    meta: 'Wired-key audit stands: only keys some system actually reads',
    lines: [inline(rollTotals), inline(rollIntent)],
    extra: renderTable('New rolls (12)', newRollsTable)
      + renderTable('Existing rolls (unchanged, restated with eligibility)', existingRollsTable)
      + renderTable('Blocked until a seam exists (do not add yet)', blockedTable),
  },
  {
    id: 'EVT-VOTE', name: 'The Beacon Vote — weekly ballot',
    lib: 'events', cat: 'Events rework',
    meta: 'The vote picks WHICH · the pool decides HOW MUCH',
    lines: [`<strong>${inline(anchorLine)}</strong>`, inline(eligTail)],
    bodyHtml: `<p><strong>${inline(anchorLine)}</strong></p>
<p class="sub">The ballot:</p><ul>${ballotBullets.map(b => `<li>${b}</li>`).join('')}</ul>
<p class="sub">Eligible to vote:</p><ol>${eligItems.map(b => `<li>${b}</li>`).join('')}</ol>
<p>${inline(eligTail)}</p>
<p class="sub">Close, tie-breaks, turnout:</p><ul>${closeBullets.map(b => `<li>${b}</li>`).join('')}</ul>`,
    extra: renderTable('The weekly anchor in US time', tzTable)
      + renderTable('How vote and donations compose', composeTable),
  },
  {
    id: 'EVT-RETIRE', name: 'Muster retirement & Seal conversion',
    lib: 'events', cat: 'Events rework',
    meta: 'What is deleted, what is kept, and where Seals go',
    lines: retireParas.map(inline),
  },
];

const secDungeon = `
<section data-lib="dungeon">
<h2>Library 5 · Dungeon — The Long Night</h2>
${dngIntro.map(p => `<p class="secnote">${inline(p)}</p>`).join('\n')}
${group('The Long Night (vampire household)', 'one card per resident, per drop, and per rule', DNG.map(card))}
</section>`;

const secEvents = `
<section data-lib="events">
<h2>Library 4 · Events rework — The Kindling & The Beacon</h2>
<p class="secnote">Donation pools that raise the blessing, and a weekly vote that chooses it. Replaces the live Muster layer. Everything server-authoritative: the client renders and sends intents; it never computes a tier, a magnitude, an ember value or a tally.</p>
${EVT.map(card).join('\n')}
</section>`;

// ---------------------------------------------------------------- sanity checks against sources

const srcIds = new Set();
for (const m of (md + '\n' + ev).matchAll(/\b(?:MON-[A-Z]{3}-\d{2}|ITEM-(?:NEW|PLAN)-\d{2}|PROG-\d{2}|DEC-[A-Z]+-\d{2}|DNG-[A-Z]+-\d{2})\b/g)) {
  srcIds.add(m[0]);
}
const cardIds = new Set(allEntries.map(e => e.id));
if (cardIds.size !== allEntries.length) fail('duplicate card ids');
for (const id of srcIds) if (!cardIds.has(id)) fail('source id has no card: ' + id);
const counts = {
  MON: MON.length, ITEM_NEW: ITEM_NEW.length, ITEM_PLAN: ITEM_PLAN.length,
  PROG: PROG.length, DEC: DEC.length, REC: 3, EVT: EVT.length, DNG: DNG.length,
};
if (counts.MON !== 81) fail('expected 81 monster candidates, got ' + counts.MON);
if (counts.ITEM_NEW !== 38) fail('expected 38 new items, got ' + counts.ITEM_NEW);
if (counts.ITEM_PLAN !== 10) fail('expected 10 planned items, got ' + counts.ITEM_PLAN);
if (counts.DEC !== 6) fail('expected 6 open decisions, got ' + counts.DEC);
if (counts.DNG !== 6) fail('expected 6 dungeon cards, got ' + counts.DNG);

// every monster candidate must sit in one of the eleven adopted classes, and the retired
// Fey class must not come back through a copy-paste.
const CLASSES = ['Mammal', 'Vermin', 'Plant', 'Humanoid', 'Human', 'Undead', 'Demon', 'Dragon',
  'Elemental', 'Construct', 'Extra Dimensional'];
for (const g of monsterGroups) {
  if (!CLASSES.includes(g.cat)) fail('monster group is not one of the eleven classes: ' + g.cat);
}
if (monsterGroups.length !== 11) fail('expected 11 monster classes, got ' + monsterGroups.length);
if (/\bMON-FEY\b/.test(md)) fail('the Fey ids are retired and must not be reused');
// "Blight" may only survive as revision history in prose. It must never appear in a
// taxonomy row or a monster/item card, which is where it would become live content.
const blightRows = [...taxonomyTable.rows, ...MON.map(m => m.lines), ...ITEM_NEW.map(i => i.lines)]
  .filter(r => /\bBlight\b/i.test(r.join(' ')));
if (blightRows.length) fail('Blight was renamed to Poison — found ' + blightRows.length + ' live row(s)');

const total = allEntries.length;

// ---------------------------------------------------------------- page

const CSS = `
:root{
  --paper:#f5efe2; --card:#fffdf6; --ink:#2c2318; --ink-soft:#5c4f3d; --ink-faint:#8a7a63;
  --line:#d9cbab; --line-soft:#e8ddc4; --accent:#8a5a2b; --accent-deep:#6d4419;
  --approve:#2e7d32; --approve-bg:#e8f3e6; --reject:#b3402a; --reject-bg:#f9e9e4;
  --maybe:#9c7a1f; --maybe-bg:#f7f0da; --badge:#7a3b12; --badge-bg:#f3e2c8;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
  font:17px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif;}
h1,h2,h3,figcaption,.cid{font-family:Georgia,"Times New Roman",serif}
h2{font-size:1.7rem;border-bottom:3px double var(--line);padding-bottom:.3rem;margin:2.6rem 0 .6rem;color:var(--accent-deep)}
.ghead{font-size:1.25rem;margin:1.8rem 0 .7rem;color:var(--accent-deep)}
.gnote{font-size:.85rem;color:var(--ink-faint);font-family:"Segoe UI",system-ui,sans-serif;font-style:italic;font-weight:400}
.secnote{color:var(--ink-soft);max-width:70rem}
main{max-width:74rem;margin:0 auto;padding:0 1.2rem 6rem}
.top{position:sticky;top:0;z-index:10;background:var(--card);border-bottom:2px solid var(--line);
  box-shadow:0 2px 8px rgba(60,40,10,.08);padding:.6rem 1.2rem}
.top-inner{max-width:74rem;margin:0 auto}
.top h1{font-size:1.35rem;margin:0;display:inline;color:var(--accent-deep)}
.top .sub{color:var(--ink-faint);font-size:.85rem;margin-left:.6rem}
#progress{float:right;font-weight:600;color:var(--accent);font-size:.95rem;padding-top:.2rem}
.filters{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.55rem;align-items:center}
.filters select,.filters input[type=search]{font:inherit;font-size:.9rem;padding:.3rem .5rem;
  border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);max-width:16rem}
.filters input[type=search]{flex:1;min-width:10rem}
.filters button{font:inherit;font-size:.85rem;padding:.32rem .7rem;border:1px solid var(--accent);
  border-radius:6px;background:var(--badge-bg);color:var(--accent-deep);cursor:pointer}
.filters button:hover{background:var(--accent);color:#fff}
.kbd-hint{font-size:.75rem;color:var(--ink-faint);margin-top:.3rem}
kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 .3em;background:#fff;font-size:.85em}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(21rem,1fr));gap:.9rem}
.card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line);
  border-radius:10px;padding:.85rem 1rem;box-shadow:0 1px 3px rgba(60,40,10,.06)}
.card[data-verdict=approve]{border-left-color:var(--approve);background:linear-gradient(var(--approve-bg),var(--card) 30%)}
.card[data-verdict=reject]{border-left-color:var(--reject);background:linear-gradient(var(--reject-bg),var(--card) 30%)}
.card[data-verdict=maybe]{border-left-color:var(--maybe);background:linear-gradient(var(--maybe-bg),var(--card) 30%)}
.card.kfocus{outline:3px solid var(--accent);outline-offset:2px}
.card header{display:flex;align-items:baseline;gap:.55rem;flex-wrap:wrap}
.card h3{font-size:1.12rem;margin:0}
.cid{font-size:.8rem;letter-spacing:.04em;color:#fff;background:var(--accent);border-radius:5px;padding:.05rem .45rem;white-space:nowrap}
.badge{font-size:.7rem;font-weight:700;letter-spacing:.09em;color:var(--badge);background:var(--badge-bg);
  border:1px solid var(--accent);border-radius:4px;padding:.05rem .4rem}
.card .meta{font-size:.83rem;color:var(--ink-faint);margin:.25rem 0 .4rem;font-style:italic}
.card .body{font-size:.95rem}
.card .body p{margin:.35rem 0}
.card .body ul,.card .body ol{margin:.3rem 0;padding-left:1.3rem}
.card .body .sub{font-weight:600;color:var(--accent-deep);margin-bottom:.1rem}
.card.decision{grid-column:1/-1;border-left-color:var(--accent);background:linear-gradient(#fbf4e3,var(--card) 45%);margin:.4rem 0}
details{margin:.4rem 0}
details summary{cursor:pointer;color:var(--accent);font-size:.9rem}
details.ctx{background:var(--card);border:1px dashed var(--line);border-radius:8px;padding:.5rem .9rem;margin:1rem 0}
details.ctx summary{font-weight:600}
.controls{margin-top:.6rem;border-top:1px solid var(--line-soft);padding-top:.55rem}
.verdicts{display:flex;gap:.45rem;flex-wrap:wrap}
.vbtn{font:inherit;font-size:.88rem;padding:.28rem .7rem;border-radius:999px;border:1.5px solid var(--line);
  background:#fff;color:var(--ink-soft);cursor:pointer}
.vbtn:hover{border-color:var(--accent)}
.vbtn.on.v-approve{background:var(--approve);border-color:var(--approve);color:#fff}
.vbtn.on.v-reject{background:var(--reject);border-color:var(--reject);color:#fff}
.vbtn.on.v-maybe{background:var(--maybe);border-color:var(--maybe);color:#fff}
.controls textarea{width:100%;margin-top:.5rem;font:inherit;font-size:.88rem;padding:.4rem .55rem;
  border:1px solid var(--line);border-radius:6px;background:#fffef9;color:var(--ink);resize:vertical}
.controls textarea:focus{outline:2px solid var(--accent)}
.tblwrap{margin:.9rem 0}
figcaption{font-size:.92rem;color:var(--accent-deep);margin-bottom:.25rem;font-weight:700}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--card)}
.tbl table{border-collapse:collapse;width:100%;font-size:.85rem}
.tbl th,.tbl td{border-bottom:1px solid var(--line-soft);padding:.4rem .6rem;text-align:left;vertical-align:top}
.tbl th{background:var(--badge-bg);color:var(--accent-deep);white-space:nowrap}
.tbl tr:last-child td{border-bottom:none}
.tbl pre{margin:0;padding:.7rem .9rem;font-size:.82rem;overflow-x:auto}
.card .tblwrap{font-size:.9rem}
.hidden{display:none !important}
#toast{position:fixed;bottom:1.2rem;left:50%;transform:translateX(-50%);background:var(--accent-deep);
  color:#fff;padding:.5rem 1.1rem;border-radius:999px;font-size:.9rem;opacity:0;transition:opacity .25s;pointer-events:none}
#toast.show{opacity:1}
@media (max-width:700px){.cards{grid-template-columns:1fr}#progress{float:none;display:block}}
`;

const JS = `
(function(){
"use strict";
var KEY='hearthrise-review-book-v1';
var state={};
try{ state=JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ state={}; }
var cards=Array.prototype.slice.call(document.querySelectorAll('.card'));
var TOTAL=cards.length;
function save(){ try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){} }
function ent(id){ return state[id]||(state[id]={}); }
function applyCard(c){
  var s=state[c.dataset.id]||{};
  if(s.v) c.setAttribute('data-verdict',s.v); else c.removeAttribute('data-verdict');
  var bs=c.querySelectorAll('.vbtn');
  for(var i=0;i<bs.length;i++) bs[i].classList.toggle('on',bs[i].dataset.v===s.v);
  var ta=c.querySelector('textarea');
  if(ta && document.activeElement!==ta) ta.value=s.n||'';
}
function counter(){
  var n=0; cards.forEach(function(c){ var s=state[c.dataset.id]; if(s&&s.v) n++; });
  document.getElementById('progress').textContent=n+' of '+TOTAL+' reviewed';
}
var fLib=document.getElementById('f-lib'), fCat=document.getElementById('f-cat'),
    fStatus=document.getElementById('f-status'), fSearch=document.getElementById('f-search');
function catOptions(){
  var lib=fLib.value, seen={}, opts=['<option value="">All categories</option>'];
  cards.forEach(function(c){
    if(lib && c.dataset.lib!==lib) return;
    var cat=c.dataset.cat; if(!cat||seen[cat]) return; seen[cat]=1;
    opts.push('<option>'+cat.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</option>');
  });
  var cur=fCat.value; fCat.innerHTML=opts.join(''); if(seen[cur]) fCat.value=cur;
}
function matches(c){
  if(fLib.value && c.dataset.lib!==fLib.value) return false;
  if(fCat.value && c.dataset.cat!==fCat.value) return false;
  var s=state[c.dataset.id]||{};
  var st=fStatus.value;
  if(st==='unreviewed' && s.v) return false;
  if(st==='approved' && s.v!=='approve') return false;
  if(st==='rejected' && s.v!=='reject') return false;
  if(st==='maybe' && s.v!=='maybe') return false;
  if(st==='noted' && !(s.n&&s.n.trim())) return false;
  var q=fSearch.value.trim().toLowerCase();
  if(q && (c.dataset.search.indexOf(q)<0 && c.dataset.id.toLowerCase().indexOf(q)<0)) return false;
  return true;
}
function refresh(){
  cards.forEach(function(c){ c.classList.toggle('hidden',!matches(c)); });
  var groups=document.querySelectorAll('.group');
  for(var i=0;i<groups.length;i++){
    groups[i].classList.toggle('hidden',!groups[i].querySelector('.card:not(.hidden)'));
  }
  var secs=document.querySelectorAll('main > section');
  for(var j=0;j<secs.length;j++){
    secs[j].classList.toggle('hidden',!secs[j].querySelector('.card:not(.hidden)'));
  }
  counter();
}
[fLib,fCat,fStatus].forEach(function(el){ el.addEventListener('change',function(){ if(el===fLib) catOptions(); refresh(); }); });
fSearch.addEventListener('input',refresh);
document.addEventListener('click',function(e){
  var b=e.target.closest?e.target.closest('.vbtn'):null;
  if(!b) return;
  var c=b.closest('.card'), s=ent(c.dataset.id);
  if(s.v===b.dataset.v){ delete s.v; } else { s.v=b.dataset.v; }
  save(); applyCard(c); counter();
  if(fStatus.value) refresh();
});
document.addEventListener('input',function(e){
  if(e.target.tagName!=='TEXTAREA'||!e.target.closest('.card')) return;
  var c=e.target.closest('.card'), s=ent(c.dataset.id);
  if(e.target.value){ s.n=e.target.value; } else { delete s.n; }
  save();
});
var toastT;
function toast(msg){
  var t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(function(){ t.classList.remove('show'); },2200);
}
document.getElementById('btn-export').addEventListener('click',function(){
  var entries=[];
  cards.forEach(function(c){
    var s=state[c.dataset.id];
    if(s && (s.v || (s.n&&s.n.trim()))) entries.push({id:c.dataset.id,verdict:s.v||null,note:s.n||''});
  });
  var payload={generatedAt:Date.now(),entries:entries};
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='review-decisions.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); },5000);
  toast('Exported '+entries.length+' decisions');
});
document.getElementById('btn-import').addEventListener('click',function(){
  document.getElementById('file-import').click();
});
document.getElementById('file-import').addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(){
    try{
      var data=JSON.parse(r.result);
      var list=data.entries||[];
      var n=0;
      list.forEach(function(row){
        if(!row||!row.id) return;
        var s=ent(row.id);
        if(row.verdict){ s.v=row.verdict; } else { delete s.v; }
        if(row.note){ s.n=row.note; } else { delete s.n; }
        n++;
      });
      save();
      cards.forEach(applyCard);
      refresh();
      toast('Imported '+n+' decisions');
    }catch(err){ toast('Import failed: not valid JSON'); }
    e.target.value='';
  };
  r.readAsText(f);
});
document.getElementById('btn-summary').addEventListener('click',function(){
  var ap=[],rj=[],mb=[],notes=[];
  cards.forEach(function(c){
    var id=c.dataset.id, s=state[id]; if(!s) return;
    if(s.v==='approve') ap.push(id);
    if(s.v==='reject') rj.push(id);
    if(s.v==='maybe') mb.push(id);
    if(s.n&&s.n.trim()) notes.push('- **'+id+'**: '+s.n.trim().replace(/\\s+/g,' '));
  });
  var out='# Review summary \\u2014 Hearthrise Review Book\\n\\n'+
    '## Approved ('+ap.length+')\\n'+(ap.join(', ')||'(none)')+'\\n\\n'+
    '## Rejected ('+rj.length+')\\n'+(rj.join(', ')||'(none)')+'\\n\\n'+
    '## Maybe ('+mb.length+')\\n'+(mb.join(', ')||'(none)')+'\\n\\n'+
    '## Notes\\n'+(notes.join('\\n')||'(none)')+'\\n';
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=out; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast('Summary copied'); }
    catch(e2){ toast('Copy failed'); }
    ta.remove();
  }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(out).then(function(){ toast('Summary copied'); },fallback);
  } else fallback();
});
function visibleCards(){ return cards.filter(function(c){ return !c.classList.contains('hidden'); }); }
function focusCard(delta){
  var vis=visibleCards(); if(!vis.length) return;
  var curEl=document.querySelector('.card.kfocus');
  var i=curEl?vis.indexOf(curEl):-1;
  i=Math.max(0,Math.min(vis.length-1,i+delta));
  if(curEl) curEl.classList.remove('kfocus');
  var c=vis[i]; c.classList.add('kfocus');
  c.scrollIntoView({block:'center'});
}
document.addEventListener('keydown',function(e){
  var tag=(e.target.tagName||'').toLowerCase();
  if(tag==='textarea'||tag==='input'||tag==='select'||e.ctrlKey||e.metaKey||e.altKey) return;
  var k=e.key.toLowerCase();
  if(k==='j'){ focusCard(1); e.preventDefault(); }
  else if(k==='k'){ focusCard(-1); e.preventDefault(); }
  else if(k==='a'||k==='r'||k==='m'){
    var c=document.querySelector('.card.kfocus'); if(!c) return;
    var v=k==='a'?'approve':k==='r'?'reject':'maybe';
    var s=ent(c.dataset.id);
    if(s.v===v){ delete s.v; } else { s.v=v; }
    save(); applyCard(c); counter(); if(fStatus.value) refresh();
    e.preventDefault();
  }
});
cards.forEach(applyCard);
catOptions();
refresh();
})();
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hearthrise — Review Book</title>
<style>${CSS}</style>
</head>
<body>
<div class="top">
<div class="top-inner">
<span id="progress">0 of ${total} reviewed</span>
<h1>📖 Hearthrise Review Book</h1><span class="sub">candidate content · nothing ships un-picked · approvals reference the id, not the name</span>
<div class="filters">
<select id="f-lib" aria-label="library filter">
<option value="">All libraries</option>
<option value="monsters">1 · Monsters</option>
<option value="items">2 · Items</option>
<option value="progression">3 · Progression</option>
<option value="events">4 · Events rework</option>
<option value="dungeon">5 · Dungeon — The Long Night</option>
<option value="decisions">Open decisions</option>
</select>
<select id="f-cat" aria-label="category filter"><option value="">All categories</option></select>
<select id="f-status" aria-label="status filter">
<option value="">Any status</option>
<option value="unreviewed">Unreviewed</option>
<option value="approved">Approved</option>
<option value="rejected">Rejected</option>
<option value="maybe">Maybe</option>
<option value="noted">Has notes</option>
</select>
<input type="search" id="f-search" placeholder="Search id, name, text…" aria-label="search">
<button type="button" id="btn-export">Export JSON</button>
<button type="button" id="btn-import">Import</button>
<button type="button" id="btn-summary">Copy summary</button>
<input type="file" id="file-import" accept=".json,application/json" style="display:none">
</div>
<div class="kbd-hint"><kbd>j</kbd>/<kbd>k</kbd> next/prev card · <kbd>a</kbd> approve · <kbd>r</kbd> reject · <kbd>m</kbd> maybe · verdicts and notes save automatically (this browser, localStorage)</div>
</div>
</div>
<main>
${secMonsters}
${secItems}
${secProg}
${secEvents}
${secDungeon}
</main>
<div id="toast" role="status"></div>
<script>${JS}</script>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log('wrote ' + OUT);
console.log('entries: ' + total + '  (monsters ' + counts.MON + ', items-new ' + counts.ITEM_NEW +
  ', items-planned ' + counts.ITEM_PLAN + ', progression ' + counts.PROG + ', decisions ' + counts.DEC +
  ', recommendations ' + counts.REC + ', events ' + counts.EVT + ', dungeon ' + counts.DNG + ')');
console.log('source ids matched: ' + srcIds.size);
