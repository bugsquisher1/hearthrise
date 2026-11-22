#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/release-plan.mjs — THE BIG RELEASE'S APPLY ORDER AND ITS EDGE POINT, DERIVED FROM THE SIDECARS (lane/r6-release-plan, 2026-11-22).
//
//   node tools/release-plan.mjs                     the plan: every STAGED file from 1009 on, in replay order, its fate, the edge point
//   node tools/release-plan.mjs --strict            the same, and exit 1 while anything is still owed (held, blocked)
//   node tools/release-plan.mjs --keep 1012,1028    a what-if: those files' fate is Keep for this run (nothing is written)
//   node tools/release-plan.mjs --from 1009         the first sequence it plans (default 1009)
//   node tools/release-plan.mjs --json              the plan as JSON
//   node tools/release-plan.mjs --replay            and PROVE it: replay the whole chain on PGlite with every held and blocked file
//                                                   blanked; a release file that needed one of them fails to apply (a dependency the
//                                                   static reader below could not see). Minutes, not seconds; never in CI.
//   node tools/release-plan.mjs --selftest          planted trees, each fault must be refused
//   node tools/release-plan.mjs --mutate            each of the reader's rules switched off in turn; a planted case must go red each time
//
// READ-ONLY. It reads supabase/migration-notes/** (tools/lib/apply-order.mjs) and the fate table of
// docs/design/redesign/12-targets.md section 2.7; it writes nothing, applies nothing and deploys nothing (CLAUDE.md section 2).
//
// ── WHY ────────────────────────────────────────────────────────────────────
// 11-build-audit.md section 2: 49 STAGED sidecars, 33 with no place in the handoff's hand-written order, and edge rules that collide
// (1016 edge first, 1052-settle-flush and 1053-hunt-report before the edge, 1055 and 1056 after it, 1026 apply-then-deploy). A
// hand-written order cannot see a new file (R2's 1057) or a fate change. This one is derived every time.
//
// ── THE RULES ──────────────────────────────────────────────────────────────
// ORDER. The release applies files in REPLAY order (the order tests/schema-drift.mjs proves rebuilds the database), never reordered:
//   an order no replay has proven is not offered. A file is planned when its note's leading claim is STAGED and its sequence >= --from.
// FATE (12-targets 2.7): Keep -> planned; Retire / Re-cut -> HELD (out of this release, owed). A file the table does not name is Keep
//   (the handoff's order, or newer). "Keep, re-derived after NNNN" waits on NNNN: if NNNN is held, so is the re-derivation (BLOCKED).
//   A RETIRED file leaves the chain only by `node tools/chain-retire.mjs --retire` with its end state proven identical; that tool takes
//   APPLIED catalogues only, so a STAGED file it cannot take is listed as OWED with what carries it.
// DEPENDENCY. Read from the note's own words (the sidecar is the only placement record, CLAUDE.md section 4 rule 12):
//   "after X[, Y and Z]" / "after X-Y" (a range)     this file needs X
//   "before X"                                       X needs this file
//   "X (STAGED) carried whole" / "carries X whole"   this file holds X's rows: it cannot ship without X
//   "folded into ... X"                              part of this file's change lives in X
//   "X's image" / "X's link"                         this file is pinned on (or rides) X's restated body
//   Clauses that only place a number ("renumbered", "independent of", "every file on", "the set's", "no ... shared", "neither needs")
//   carry no dependency. A planned file that needs a held or blocked one is BLOCKED (owed), transitively. A dependency on a file that
//   sorts LATER is an ORDERING FAULT; on a file the chain does not hold, a MISSING FAULT. Both refuse the plan.
// EDGE. One hr-accrue deploy per release. Each file is classed from its EDGE clause (or an explicit `EDGE-ORDER: before|after|either`
//   token anywhere in the note, which wins and must agree with the prose when the prose classes too):
//   before    "apply this file before the edge" / "apply first, then deploy" / "APPLY THIS FILE BEFORE THAT EDGE DEPLOYS"
//   before!   "deploys right after this apply" / "right after it": the edge must come IMMEDIATELY after it (no 'before' file after it)
//   after     "edge first" / "deploy ... BEFORE this applies" / "the hr-accrue ... right after NNNN" (NNNN an earlier file)
//   either    "either order" / "either side" / "EDGE: none" / "none of its own" / "no engine or edge file"
//   with N    "EDGE: with NNNN's" / "the same hr-accrue as NNNN": N's class
//   A note it cannot class REFUSES the plan (UNCLASSED): a guessed edge point is the failure this tool exists to stop.
//   The edge goes right after the last 'before' file. A planned 'after' file that sorts before a planned 'before' file is an EDGE
//   COLLISION, and so is a 'before!' file that is not the last 'before': the plan is refused, naming the pair.
//
// Exit: 0 a plan (owed files listed) · 1 refused (or --strict with anything owed) · 2 harness.
// mutant-anchors: none — --mutate switches the reader's rules off in memory (RULES below), never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { ROOT, MIG_DIR, loadApplyOrder, seqOfName } from './lib/apply-order.mjs';
import { claimOf } from '../tests/apply-order-honesty.mjs';

export const TARGETS_DOC = 'docs/design/redesign/12-targets.md';
const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

/* Every rule is switchable so --mutate can prove each one bites (a rule nobody can turn off unnoticed is a rule that is tested). */
export const RULES = {
  collision: true, immediate: true, unclassed: true, blocked: true, ordering: true, missing: true, carried: true,
  folded: true, image: true, fateDerive: true, staleFate: true, inherit: true, tokenAgree: true, afterAnchor: true,
};

const noteText = (n) => (Array.isArray(n) ? n.join(' ') : String(n || ''));
/* file names and versions lose their dots, so a sentence split never cuts "1033-approved-cuts-items-catalogue.generated.sql" */
const flatten = (s) => s.replace(/(\d{4,}-[a-z0-9_-]+?)(?:\.generated)?\.sql\b/gi, '$1').replace(/\bv\d+\.\d+\.\d+/g, 'vX').replace(/\bset\/vX/g, 'the set');

// ── EDGE ─────────────────────────────────────────────────────────────────────
/** The EDGE clause: from "EDGE:" to the next CAPS label ("ORDER:", "CLIENT:", "MEASURED:", "ALSO:", "FOLDED IN", ...) or the end. */
export function edgeClause(note) {
  const s = flatten(noteText(note));
  const i = s.search(/\bEDGE:/);
  if (i < 0) return '';
  const rest = s.slice(i + 5);
  const j = rest.search(/\s(?:[A-Z][A-Z-]{2,}(?:\s[A-Z]{2,})?:|FOLDED IN|REGENERATED IN PLACE)/);
  return ('EDGE:' + (j < 0 ? rest : rest.slice(0, j))).trim();
}

/**
 * One file's edge class from its note. Pure.
 * @returns {{cls:'before'|'after'|'either'|'with'|null, immediate?:boolean, with?:number, anchor?:number, token?:string, why:string}}
 */
export function edgeOf(note, ownSeq, rules = RULES) {
  const full = flatten(noteText(note));
  const c = edgeClause(note);
  let prose = null;
  if (c) {
    if (/deploys?\s+right\s+after\s+(?:this\s+apply|it)\b/i.test(c)) prose = { cls: 'before', immediate: true, why: 'the edge right after this apply' };
    else if (/apply\s+(?:this\s+file\s+)?before\s+(?:that|the)\s+edge|apply\s+first,?\s+then\s+deploy/i.test(c)) prose = { cls: 'before', why: 'apply before the edge' };
    else if (/\bedge\s+first\b|deploy[^.;]{0,160}\bBEFORE\s+this\s+(?:file\s+)?appl/i.test(c)) prose = { cls: 'after', why: 'edge first' };
    else if (rules.afterAnchor && /right\s+after\s+(\d{4})\b/i.test(c) && Number(/right\s+after\s+(\d{4})\b/i.exec(c)[1]) < ownSeq) {
      const n = Number(/right\s+after\s+(\d{4})\b/i.exec(c)[1]);
      prose = { cls: 'after', anchor: n, why: `the edge right after ${n}, an earlier file` };
    } else if (/^EDGE:\s*(?:with|the\s+same\s+hr-accrue\s+as)\s+(\d{4})/i.test(c)) {
      prose = { cls: 'with', with: Number(/^EDGE:\s*(?:with|the\s+same\s+hr-accrue\s+as)\s+(\d{4})/i.exec(c)[1]), why: 'the same deploy as another file' };
    } else if (/either\s+(?:deploy\s+)?(?:order|side)|order\s+is\s+safe|^EDGE:\s*none\b|none\s+of\s+its\s+own|none\s+for\s+this\s+file|^EDGE:\s*no\s+engine\s+or\s+edge\s+file/i.test(c)) {
      prose = { cls: 'either', why: 'no edge order' };
    }
  }
  const tok = /\bEDGE-ORDER:\s*(before|after|either)\b/i.exec(full);
  if (tok) {
    const t = tok[1].toLowerCase();
    if (rules.tokenAgree && prose && prose.cls !== 'with' && prose.cls !== t) return { cls: null, why: `EDGE-ORDER: ${t} disagrees with its own EDGE clause (${prose.cls}: ${prose.why})` };
    return { cls: t, token: t, why: `EDGE-ORDER: ${t}` };
  }
  if (prose) return prose;
  return { cls: null, why: c ? `cannot class "${c.slice(0, 140)}"` : 'no EDGE clause and no EDGE-ORDER token' };
}

// ── DEPENDENCIES ─────────────────────────────────────────────────────────────
/** Every sequence number a phrase names: "1012 and 1020", "1036-1039" (a range), "1053-lever-gates" (a name). */
function numbersIn(s) {
  const out = [];
  /* a history name (2027-06-05-harder-monsters-…) is a file by its whole name, never a sequence 2027 */
  for (const m of s.matchAll(/\b(\d{4}-\d{2}-\d{2}-[a-z][a-z0-9_-]*)/gi)) out.push({ seq: null, name: m[1].toLowerCase() });
  const rest = s.replace(/\b\d{4}-\d{2}-\d{2}-[a-z][a-z0-9_-]*/gi, ' ');
  /* (?![\d.]) : not the head of a longer number (42501, an md5 "3097347b…", "1.5") */
  for (const m of rest.matchAll(/\b(\d{4})(?:-(\d{4})(?![\d])|-([a-z][a-z0-9_-]*))?(?![\da-f]|\.\d)/gi)) {
    const a = Number(m[1]);
    if (m[2]) { for (let k = a; k <= Number(m[2]); k++) out.push({ seq: k }); }
    else out.push({ seq: a, name: m[3] ? `${m[1]}-${m[3]}`.toLowerCase() : null });
  }
  return out;
}
const PLACEMENT_ONLY = /renumbered|independent|every\s+file|the\s+set'?s?\b|no\s+(?:object|function|table|shared)|neither\s+needs|\bpast\b/i;

/**
 * What a note says this file needs, and what it says needs it. Pure.
 * @returns {{after:{seq:number,name:string|null,kind:string}[], before:{seq:number,name:string|null}[]}}
 */
export function depsOf(note, rules = RULES) {
  const s = flatten(noteText(note));
  const after = [], before = [];
  for (const clause of s.split(/[;()]|\.\s/)) {
    if (PLACEMENT_ONLY.test(clause)) continue;
    for (const m of clause.matchAll(/\bafter\s+([^]*?)(?=\bbefore\b|\bwhose\b|\bwhich\b|\bso\b|$)/gi)) {
      for (const n of numbersIn(m[1])) after.push({ ...n, kind: 'after' });
    }
    for (const m of clause.matchAll(/\bbefore\s+([^]*?)(?=\bafter\b|\bwhose\b|\bwhich\b|\bso\b|$)/gi)) {
      for (const n of numbersIn(m[1])) before.push(n);
    }
  }
  if (rules.carried) {
    const NAME = '(\\d{4}(?:-\\d{2}-\\d{2})?(?:-[a-z][a-z0-9_-]*)?)';
    for (const m of s.matchAll(new RegExp(`\\b${NAME}\\s*(?:\\([^)]*\\)\\s*)?carried\\s+whole`, 'gi'))) for (const n of numbersIn(m[1])) after.push({ ...n, kind: 'carries' });
    for (const m of s.matchAll(new RegExp(`\\bcarries\\s+${NAME}[^.;]{0,40}?\\bwhole`, 'gi'))) for (const n of numbersIn(m[1])) after.push({ ...n, kind: 'carries' });
  }
  /* "pinned pre (1032's image)", "rides 1032's link 25": this file's anchors or its grant entry live in that file's restated body
     (found by --replay 2026-11-22: 1048 and 1051 refuse to apply without 1032's detector, link 25) */
  if (rules.image) {
    for (const m of s.matchAll(/\b(\d{4}(?:-[a-z][a-z0-9_-]*)?)'s\s+(?:image|link)\b/gi)) for (const n of numbersIn(m[1])) after.push({ ...n, kind: 'pinned on its body' });
  }
  if (rules.folded) {
    for (const m of s.matchAll(/folded\s+into\s+([^.;]*)/gi)) for (const n of numbersIn(m[1])) after.push({ ...n, kind: 'folded into' });
  }
  return { after, before };
}

// ── FATES (12-targets 2.7) ───────────────────────────────────────────────────
/**
 * The fate table's rows: [{ seq, words, fate:'keep'|'retire'|'recut', derive:number|null, text }]. Pure (the doc's text in).
 * A row is "| NNNN words | Fate | Why |" inside the section that holds the table.
 */
export function fatesFrom(md) {
  const rows = [];
  const sec = String(md).split(/\n(?=#{2,3}\s)/).find((x) => /^#{2,3}\s+2\.7\b/.test(x));
  if (!sec) return rows;
  for (const line of sec.split('\n')) {
    const m = /^\|\s*(\d{4})\s+([^|]*?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (!m) continue;
    const f = m[3].replace(/\*/g, '').trim();
    const fate = /^keep/i.test(f) ? 'keep' : /^retire/i.test(f) ? 'retire' : /^re-?cut/i.test(f) ? 'recut' : null;
    rows.push({ seq: Number(m[1]), words: m[2].toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), fate, derive: (/re-derived after (\d{4})/i.exec(f) || [])[1] ? Number(/re-derived after (\d{4})/i.exec(f)[1]) : null, text: f });
  }
  return rows;
}

/** The file a fate row names: its sequence, then the most slug words in common (two files share 1040, three share 1053). */
function fileOfRow(row, files) {
  const same = files.filter((f) => seqOfName(f) === row.seq);
  if (same.length <= 1) return same[0] || null;
  const score = (f) => f.replace(/\.generated\.sql$|\.sql$/, '').split('-').slice(1).filter((w) => row.words.includes(w)).length;
  const best = same.map((f) => [score(f), f]).sort((a, b) => b[0] - a[0]);
  return best[0][0] > 0 && best[0][0] > (best[1] ? best[1][0] : -1) ? best[0][1] : null;
}

// ── THE PLAN (pure) ──────────────────────────────────────────────────────────
/**
 * @param {{chain:string[], notes:Record<string,any>, fateRows:object[], from?:number, keep?:number[]}} input
 *   chain: every replayed file in replay order (applied or not); notes: file -> note; fateRows: fatesFrom(12-targets)
 * @returns {{plan:object[], edgeAfter:string|null, held:object[], blocked:object[], refusals:string[], owed:string[], files:object[], unfated:object}}
 */
export function planOf({ chain, notes, fateRows, from = 1009, keep = [] }, rules = RULES) {
  const refusals = [];
  const pos = new Map(chain.map((f, i) => [f, i]));
  const staged = chain.filter((f) => { const q = seqOfName(f); return q !== null && q >= from && claimOf(noteText(notes[f])).kind === 'staged'; });
  const stagedSet = new Set(staged);
  const bySeq = (n) => chain.filter((f) => (n.seq === null || seqOfName(f) === n.seq) && (!n.name || f.startsWith(n.name + '.') || f.startsWith(n.name + '-') || f.replace(/\.generated\.sql$|\.sql$/, '') === n.name));

  /* fates */
  const fate = new Map(staged.map((f) => [f, { fate: 'keep', why: 'not in 12-targets 2.7 (the handoff order, or newer)', derive: null }]));
  for (const row of fateRows) {
    const f = fileOfRow(row, chain);
    if (!f) { if (rules.staleFate) refusals.push(`STALE FATE: 12-targets 2.7 names ${row.seq} ${row.words.join(' ')}, which no chain file matches`); continue; }
    if (!stagedSet.has(f)) { if (rules.staleFate) refusals.push(`STALE FATE: 12-targets 2.7 rules on ${f}, which is not STAGED from ${from} on`); continue; }
    if (!row.fate) { refusals.push(`UNREAD FATE: ${f}: "${row.text}"`); continue; }
    fate.set(f, { fate: row.fate, why: `12-targets 2.7: ${row.text}`, derive: rules.fateDerive ? row.derive : null });
  }
  for (const k of keep) for (const f of staged.filter((x) => seqOfName(x) === k)) fate.set(f, { fate: 'keep', why: `--keep ${k} (a what-if)`, derive: null });

  /* edges */
  const info = new Map();
  for (const f of staged) info.set(f, { file: f, seq: seqOfName(f), edge: edgeOf(notes[f], seqOfName(f), rules), needs: [] });
  for (const x of info.values()) {
    if (x.edge.cls !== 'with') continue;
    const src = staged.find((f) => seqOfName(f) === x.edge.with && info.get(f).edge.cls !== 'with');
    if (rules.inherit && src) x.edge = { cls: info.get(src).edge.cls, why: `with ${src}` };
    else x.edge = { cls: null, why: `EDGE names ${x.edge.with}, which has no class of its own` };
  }

  /* dependencies: needs[] = files this one must follow */
  for (const f of staged) {
    const { after, before } = depsOf(notes[f], rules);
    for (const d of after) {
      const hits = bySeq(d);
      if (!hits.length) { if (rules.missing) refusals.push(`MISSING: ${f} needs ${d.name || d.seq}, which the chain does not hold`); continue; }
      for (const h of hits) if (h !== f) info.get(f).needs.push({ file: h, kind: d.kind });
    }
    for (const d of before) for (const h of bySeq(d)) if (h !== f && info.has(h)) info.get(h).needs.push({ file: f, kind: `${f} says BEFORE it` });
    const dv = fate.get(f).derive;
    if (dv !== null && dv !== undefined) for (const h of bySeq({ seq: dv })) info.get(f).needs.push({ file: h, kind: 're-derived after' });
  }
  for (const x of info.values()) {
    for (const n of x.needs) {
      if (rules.ordering && pos.get(n.file) > pos.get(x.file)) refusals.push(`ORDERING: ${x.file} needs ${n.file} (${n.kind}), which replays after it`);
    }
  }

  /* held, then blocked (transitively) */
  const held = staged.filter((f) => fate.get(f).fate !== 'keep');
  const out = new Map(held.map((f) => [f, fate.get(f).fate]));
  const blockedBy = new Map();
  if (rules.blocked) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const x of info.values()) {
        if (out.has(x.file)) continue;
        const n = x.needs.find((d) => out.has(d.file));
        if (n) { out.set(x.file, 'blocked'); blockedBy.set(x.file, n); moved = true; }
      }
    }
  }
  const plan = staged.filter((f) => !out.has(f)).map((f) => info.get(f));

  /* the edge point */
  for (const x of plan) if (!x.edge.cls && rules.unclassed) refusals.push(`UNCLASSED: ${x.file}: ${x.edge.why}`);
  const befores = plan.filter((x) => x.edge.cls === 'before');
  const lastBefore = befores.length ? befores[befores.length - 1] : null;
  const iLast = lastBefore ? plan.indexOf(lastBefore) : -1;
  if (rules.collision) {
    for (const a of plan.filter((x) => x.edge.cls === 'after')) {
      if (plan.indexOf(a) < iLast) refusals.push(`EDGE COLLISION: ${a.file} goes after the edge (${a.edge.why}) but replays before ${lastBefore.file}, which goes before it (${lastBefore.edge.why})`);
    }
  }
  if (rules.immediate) {
    for (const b of befores.filter((x) => x.edge.immediate && x !== lastBefore)) {
      refusals.push(`EDGE COLLISION: ${b.file} wants the edge right after it, but ${lastBefore.file} replays later and must also go before the edge`);
    }
  }

  const owed = [];
  for (const f of held) {
    const carriers = [...info.values()].filter((x) => x.needs.some((n) => n.file === f && (n.kind === 'carries' || n.kind === 'folded into'))).map((x) => x.file);
    if (fate.get(f).fate === 'retire') {
      owed.push(`${f}: RETIRE owed. tools/chain-retire.mjs takes APPLIED catalogues only, so a STAGED file cannot leave with an end-state proof; `
        + `it leaves by deletion once nothing carries it${carriers.length ? `. Carried by: ${carriers.join(', ')} (regenerate those first)` : ''}`);
    } else owed.push(`${f}: RE-CUT owed (${fate.get(f).why})${carriers.length ? `. Carried by: ${carriers.join(', ')}` : ''}`);
  }
  for (const [f, n] of blockedBy) owed.push(`${f}: BLOCKED, needs ${n.file} (${n.kind}), which is ${out.get(n.file) === 'blocked' ? 'blocked' : out.get(n.file) === 'retire' ? 'retired' : 're-cut'}`);

  /* the same staged set with no fates: why the fates are needed (information only, never a refusal) */
  const unfated = { collisions: [] };
  {
    const all = staged.map((f) => info.get(f));
    const bs = all.filter((x) => x.edge.cls === 'before');
    const lb = bs.length ? bs[bs.length - 1] : null;
    for (const a of all.filter((x) => x.edge.cls === 'after')) if (lb && all.indexOf(a) < all.indexOf(lb)) unfated.collisions.push(`${a.file} (after) replays before ${lb.file} (before)`);
  }

  return {
    plan: plan.map((x) => ({ file: x.file, edge: x.edge.cls, immediate: !!x.edge.immediate, why: x.edge.why, fate: fate.get(x.file).why })),
    edgeAfter: lastBefore ? lastBefore.file : null,
    held: held.map((f) => ({ file: f, fate: fate.get(f).fate, why: fate.get(f).why })),
    blocked: [...blockedBy].map(([f, n]) => ({ file: f, needs: n.file, kind: n.kind })),
    refusals: [...new Set(refusals)], owed, unfated,
    files: staged.map((f) => ({ file: f, edge: info.get(f).edge.cls, why: info.get(f).edge.why, needs: info.get(f).needs })),
  };
}

// ── THE REAL TREE ────────────────────────────────────────────────────────────
export function realInput(root = ROOT) {
  const m = loadApplyOrder(root);
  return { chain: [...(m.pre_schema || []), ...m.order], notes: m._order_notes, fateRows: fatesFrom(readFileSync(join(root, TARGETS_DOC), 'utf8')) };
}

function render(p) {
  const lines = [];
  lines.push(`RELEASE PLAN: ${p.plan.length} file(s) in replay order; the hr-accrue edge deploys ${p.edgeAfter ? `right after ${p.edgeAfter}` : 'first (no file must precede it)'}`);
  let i = 0, placed = !p.edgeAfter;
  if (placed) lines.push('   >>> EDGE DEPLOY (hr-accrue) <<<');
  for (const x of p.plan) {
    lines.push(`${String(++i).padStart(3)}. ${x.file.padEnd(58)} ${String(x.edge || '?').padEnd(6)}${x.immediate ? '!' : ' '} ${x.why}`);
    if (!placed && x.file === p.edgeAfter) { lines.push('   >>> EDGE DEPLOY (hr-accrue) <<<'); placed = true; }
  }
  if (p.held.length) { lines.push('', `HELD (${p.held.length}, out of this release):`); for (const h of p.held) lines.push(`  ${h.fate.padEnd(7)} ${h.file}`); }
  if (p.blocked.length) { lines.push('', `BLOCKED (${p.blocked.length}, a planned file that needs a held one):`); for (const b of p.blocked) lines.push(`  ${b.file}  needs ${b.needs} (${b.kind})`); }
  if (p.owed.length) { lines.push('', 'OWED:'); for (const o of p.owed) lines.push('  - ' + o); }
  if (p.unfated.collisions.length) { lines.push('', `WITHOUT THE FATES the staged set collides at the edge (${p.unfated.collisions.length}): ${p.unfated.collisions.slice(0, 4).join('; ')}${p.unfated.collisions.length > 4 ? ' ...' : ''}`); }
  if (p.refusals.length) { lines.push('', `REFUSED (${p.refusals.length}):`); for (const r of p.refusals) lines.push('  x ' + r); }
  return lines.join('\n');
}

// ── --replay: the plan rebuilt on PGlite with every held and blocked file blanked ──
async function replayProof(p) {
  const { bootReplay, closeReplays } = await import('../tests/schema-replay.mjs');
  const blank = [...p.held.map((h) => h.file), ...p.blocked.map((b) => b.file)];
  const patches = new Map();
  for (const f of blank) {
    const sql = readFileSync(join(ROOT, MIG_DIR, f), 'utf8').replace(/\r\n/g, '\n');
    patches.set(f, [[sql, `-- held by tools/release-plan.mjs --replay: ${f} is out of this release\nselect 1;\n`]]);
  }
  const t0 = Date.now();
  const r = await bootReplay({ patches, tolerant: true, fullChain: 'release-plan --replay: the release set must rebuild end to end with its held files out' });
  await closeReplays();
  return { failures: r.failures, blanked: blank.length, applied: r.applied.length, s: Math.round((Date.now() - t0) / 1000) };
}

// ── --selftest / --mutate ────────────────────────────────────────────────────
const N = (s) => `STAGED, NOT APPLIED (lane/x). ${s}`;
const FATES = (rows) => `# t\n\n### 2.7 The files\n\n| File | Fate | Why |\n|---|---|---|\n${rows.map(([a, b]) => `| ${a} | ${b} | x |`).join('\n')}\n\n### 2.8 next\n`;
/* each case: a planted tree and what the plan must say about it */
export const CASES = [
  ['a clean tree: the edge right after the last before-file', () => planOf({ chain: ['0999-old.sql', '1009-a.sql', '1010-b.sql', '1011-c.sql'],
    notes: { '0999-old.sql': 'APPLIED', '1009-a.sql': N('ORDER: 1009. EDGE: none.'), '1010-b.sql': N('ORDER: after 1009. EDGE: apply first, then deploy.'), '1011-c.sql': N('ORDER: after 1010. EDGE: edge first.') }, fateRows: [] }, RULES),
  (p) => !p.refusals.length && p.edgeAfter === '1010-b.sql' && p.plan.length === 3],
  ['an edge-first file before an apply-first file is a collision', () => planOf({ chain: ['1009-a.sql', '1010-b.sql'],
    notes: { '1009-a.sql': N('EDGE: deploy it with this file, edge first.'), '1010-b.sql': N('EDGE: APPLY THIS FILE BEFORE THAT EDGE DEPLOYS.') }, fateRows: [] }, RULES),
  (p) => p.refusals.some((r) => /EDGE COLLISION: 1009-a/.test(r))],
  ['a right-after-this-apply file with a later before-file is a collision', () => planOf({ chain: ['1009-a.sql', '1010-b.sql'],
    notes: { '1009-a.sql': N('EDGE: the hr-accrue deploys right after this apply.'), '1010-b.sql': N('EDGE: apply this file before the edge deploy.') }, fateRows: [] }, RULES),
  (p) => p.refusals.some((r) => /wants the edge right after it/.test(r))],
  ['a note with no readable edge refuses the plan', () => planOf({ chain: ['1009-a.sql'], notes: { '1009-a.sql': N('EDGE: talk to Bob.') }, fateRows: [] }, RULES),
  (p) => p.refusals.some((r) => /UNCLASSED: 1009-a/.test(r))],
  ['a kept file after a retired one is blocked, and so is the file after it', () => planOf({ chain: ['1009-a.sql', '1010-b.sql', '1011-c.sql'],
    notes: { '1009-a.sql': N('EDGE: none.'), '1010-b.sql': N('ORDER: after 1009. EDGE: none.'), '1011-c.sql': N('ORDER: 1011, after 1010-b. EDGE: none.') }, fateRows: fatesFrom(FATES([['1009 a', '**Retire**']])) }, RULES),
  (p) => p.plan.length === 0 && p.blocked.map((b) => b.file).join() === '1010-b.sql,1011-c.sql' && p.held[0].fate === 'retire'],
  ['a file that carries a retired one whole is blocked, and the retirement names its carrier', () => planOf({ chain: ['1009-a.sql', '1012-z.sql'],
    notes: { '1009-a.sql': N('EDGE: none.'), '1012-z.sql': N('A FORWARD FILE. 1009 (STAGED) carried whole. ORDER: 1012 in its name. EDGE: none.') }, fateRows: fatesFrom(FATES([['1009 a', 'Retire']])) }, RULES),
  (p) => p.blocked.some((b) => b.file === '1012-z.sql' && b.kind === 'carries') && p.owed.some((o) => /1009-a.*Carried by: 1012-z/.test(o))],
  ['a dependency on a later file is an ordering fault', () => planOf({ chain: ['1009-a.sql', '1010-b.sql'],
    notes: { '1009-a.sql': N('ORDER: after 1010. EDGE: none.'), '1010-b.sql': N('EDGE: none.') }, fateRows: [] }, RULES),
  (p) => p.refusals.some((r) => /ORDERING: 1009-a/.test(r))],
  ['a dependency on a file the chain lacks is a missing fault', () => planOf({ chain: ['1009-a.sql'], notes: { '1009-a.sql': N('ORDER: after 1004. EDGE: none.') }, fateRows: [] }, RULES),
  (p) => p.refusals.some((r) => /MISSING: 1009-a/.test(r))],
  ['placement-only words carry no dependency', () => planOf({ chain: ['1009-a.sql', '1010-b.sql'],
    notes: { '1009-a.sql': N('ORDER: 1009 (renumbered from 1012 past the set). EDGE: none.'), '1010-b.sql': N('ORDER: 1010 (after every file on the set, up to 1099); independent of 1009. EDGE: none.') }, fateRows: [] }, RULES),
  (p) => !p.refusals.length && p.plan.length === 2],
  ['"EDGE: with NNNN" takes NNNN\'s class', () => planOf({ chain: ['1009-a.sql', '1010-b.sql', '1011-c.sql'],
    notes: { '1009-a.sql': N('EDGE: deploy it with this file, edge first.'), '1010-b.sql': N('EDGE: with 1009\'s.'), '1011-c.sql': N('EDGE: apply first, then deploy.') }, fateRows: [] }, RULES),
  (p) => p.refusals.some((r) => /EDGE COLLISION: 1010-b/.test(r))],
  ['"right after NNNN" of an earlier file puts this one after the edge', () => planOf({ chain: ['1009-a.sql', '1010-b.sql', '1011-c.sql'],
    notes: { '1009-a.sql': N('EDGE: the hr-accrue deploys right after this apply.'), '1010-b.sql': N('EDGE: the hr-accrue right after 1009.'), '1011-c.sql': N('EDGE: apply first, then deploy.') }, fateRows: [] }, RULES),
  (p) => p.refusals.some((r) => /EDGE COLLISION: 1010-b/.test(r))],
  ['an EDGE-ORDER token that contradicts its own prose refuses', () => planOf({ chain: ['1009-a.sql'], notes: { '1009-a.sql': N('EDGE: edge first. EDGE-ORDER: before') }, fateRows: [] }, RULES),
  (p) => p.refusals.some((r) => /disagrees/.test(r))],
  ['"Keep, re-derived after NNNN" waits on a re-cut NNNN', () => planOf({ chain: ['1009-a.sql', '1010-b.sql'],
    notes: { '1009-a.sql': N('EDGE: none.'), '1010-b.sql': N('EDGE: none.') }, fateRows: fatesFrom(FATES([['1009 a', '**Re-cut**'], ['1010 b', 'Keep, re-derived after 1009']])) }, RULES),
  (p) => p.blocked.some((b) => b.file === '1010-b.sql' && b.kind === 're-derived after')],
  ['a fate row for no chain file is stale', () => planOf({ chain: ['1009-a.sql'], notes: { '1009-a.sql': N('EDGE: none.') }, fateRows: fatesFrom(FATES([['1077 gone', 'Retire']])) }, RULES),
  (p) => p.refusals.some((r) => /STALE FATE/.test(r))],
  ['"folded into" makes the cut wait on the files that hold its half', () => planOf({ chain: ['1009-a.sql', '1010-b.sql'],
    notes: { '1009-a.sql': N('EDGE: none.'), '1010-b.sql': N('The other half is folded into the STAGED 1009-a. EDGE: none.') }, fateRows: fatesFrom(FATES([['1009 a', 'Retire']])) }, RULES),
  (p) => p.blocked.some((b) => b.file === '1010-b.sql' && b.kind === 'folded into')],
  ['a file pinned on a held file\'s image is blocked', () => planOf({ chain: ['1009-a.sql', '1010-b.sql'],
    notes: { '1009-a.sql': N('EDGE: none.'), '1010-b.sql': N('One insertion, pinned pre (1009\'s image) and post. EDGE: none.') }, fateRows: fatesFrom(FATES([['1009 a', 'Retire']])) }, RULES),
  (p) => p.blocked.some((b) => b.file === '1010-b.sql' && b.kind === 'pinned on its body')],
];

function runCases(rules) {
  const red = [];
  for (const [name, make, ok] of CASES) {
    let p;
    try { p = make.length ? make(rules) : (() => { const saved = { ...RULES }; Object.assign(RULES, rules); try { return make(); } finally { Object.assign(RULES, saved); } })(); }
    catch (e) { red.push(`${name}: threw ${e.message}`); continue; }
    if (!ok(p)) red.push(name);
  }
  return red;
}

function selftest() {
  const red = runCases(RULES);
  for (const [name] of CASES) console.log(`  ${red.includes(name) ? 'x  ' : 'ok '} ${name}`);
  /* the real tree: every STAGED file from 1009 is classed (an unclassed note is a refusal on release day; better to know now) */
  const p = planOf(realInput());
  const unclassed = p.files.filter((x) => !x.edge);
  console.log(`  ${unclassed.length ? 'x  ' : 'ok '} the real tree: all ${p.files.length} STAGED sidecars from 1009 class at the edge${unclassed.length ? ': ' + unclassed.map((x) => x.file).join(', ') : ''}`);
  if (red.length || unclassed.length) { console.error(`\nrelease-plan --selftest: ${red.length + (unclassed.length ? 1 : 0)} case(s) red`); process.exit(1); }
  console.log(`\nrelease-plan --selftest: all ${CASES.length} planted trees judged as they must be, and the real tree classes`);
}

function mutate() {
  if (runCases(RULES).length) { console.error('release-plan --mutate: the clean rules already fail a case (run --selftest)'); process.exit(1); }
  let miss = 0;
  for (const k of Object.keys(RULES)) {
    const red = runCases({ ...RULES, [k]: false });
    console.log(`  ${red.length ? 'ok  ' : 'MISS'} rule "${k}" off${red.length ? ` -> ${red.length} case(s) red: ${red[0]}` : ' -> no case noticed'}`);
    if (!red.length) miss += 1;
  }
  if (miss) { console.error(`\nrelease-plan --mutate: ${miss} rule(s) can be switched off unnoticed`); process.exit(1); }
  console.log(`\nrelease-plan --mutate: all ${Object.keys(RULES).length} rules bite`);
}

async function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  if (argv.includes('--mutate')) return mutate();
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const keep = (val('--keep') || '').split(',').filter(Boolean).map(Number);
  const from = val('--from') ? Number(val('--from')) : 1009;
  const p = planOf({ ...realInput(), from, keep });
  if (argv.includes('--json')) console.log(JSON.stringify(p, null, 1));
  else console.log(render(p));
  let code = p.refusals.length ? 1 : 0;
  if (argv.includes('--replay')) {
    const r = await replayProof(p);
    console.log(`\nREPLAY: the chain with ${r.blanked} held/blocked file(s) blanked: ${r.applied} applied, ${r.failures.length} failed (${r.s} s)`);
    for (const f of r.failures) console.log(`  x ${f.file}: ${String(f.error).split('\n')[0].slice(0, 300)}`);
    if (r.failures.length) code = 1;
  }
  if (argv.includes('--strict') && (p.held.length || p.blocked.length)) code = 1;
  process.exit(code);
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.harness ? `release-plan: ${e.message}` : e); process.exit(2); });
}
