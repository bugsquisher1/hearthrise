#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/proposals.mjs — THE PROPOSED GAME (Tyler 2026-11-21: "this dashboard needs to be built with all of these anticipated
// changes that we are discussing now.. not the current game"; lane/c-balance-matrix, phase 3).
//
//   loadProposals(root)            the registry, tools/balance-program/proposals.json (ONE data file: every proposal, modelled or not, why)
//   composePatch(root, ids)        one patch of several proposals: their edits in registry order, their knobs multiplied, their plan steps
//                                  merged, their targets joined. The proposed game is composePatch(root, recommended)
//   node tools/balance-program/proposals.mjs --list                 the registry: modelled (with patch and label) and not modelled (with why)
//   node tools/balance-program/proposals.mjs --write                the static structural patches (R7, one tier table, the gear curve)
//   node tools/balance-program/proposals.mjs --derive [--workers N] the two DERIVED patches, measured on the matrix: the kill reward (R12:
//                                  the reference kill-health an hour of a lone MID hammer on Normal, on the proposed game without R12 and R13,
//                                  fitted c x L^d) and the Level law (R13: the pace seat's multiple of the contract on the proposed game
//                                  without R13). Each written with what it was measured on
//
//   node tools/balance-program/proposals.mjs --selftest [--quick]   the registry is whole, every toggle plants, an alternative stacked on
//                                  what it replaces is refused; without --quick, each proposal's toggle is played on a mini plan against the
//                                  proposed game and must move a metric its targets are judged on (an identity: none), and the check bites
//
// Every patch is a scratch-copy derivation (matrix-scratch.mjs plantScratch): nothing here edits the tree.
// Exit: 0 green · 1 a check failed.
// mutant-anchors: none — the selftest plants on scratch copies; no tracked file is patched
// ci-step: economy-selftests | The proposal registry is whole, every toggle plants, and an alternative stacked on what it replaces is refused
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/proposals.mjs --selftest --quick
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const PROPOSALS_FILE = 'tools/balance-program/proposals.json';
export const PROPOSALS_SCHEMA = 'hearthrise.balance-proposals/1';

export function loadProposals(root = ROOT) {
  const doc = JSON.parse(readFileSync(join(root, PROPOSALS_FILE), 'utf8'));
  if (doc.schema !== PROPOSALS_SCHEMA) throw new Error('proposals: ' + PROPOSALS_FILE + ' is ' + doc.schema);
  const byId = new Map(doc.proposals.map((p) => [p.id, p]));
  return { ...doc, frame: doc.frame || [], byId, recommended: doc.proposals.filter((p) => p.recommended).map((p) => p.id) };
}
/* THE FRAME: Tyler's rulings the proposed game assumes (never a toggle). RULE-2026-11-21, all four heroes from the start: the matrix never
   charged for a hero slot, so it is an identity on every cell; the readings it retires (the slot-arrival day and the slot-price guard cells)
   are listed so the dashboard drops them from the proposed side */
export const retiredOn = (reg) => new Set(reg.frame.flatMap((f) => f.retires || []));
/* a proposal plays one patch file, or several in order (GR-27: Dangerous brings five, then the balance pass's one blow dial): edits in order,
   knobs multiplied, plan steps merged (a later file's wins), targets joined, the last file's kind */
const readPatch = (root, p) => {
  const files = Array.isArray(p.patch) ? p.patch : p.patch ? [p.patch] : [];
  const out = { schema: 'hearthrise.balance-patch/1', knobs: {}, edits: [], plan: {}, targets: [] };
  for (const file of files) {
    const x = JSON.parse(readFileSync(join(root, 'tools/balance-program', file), 'utf8'));
    if (files.length === 1) return x;
    for (const [k, m] of Object.entries(x.knobs || {})) out.knobs[k] = (out.knobs[k] || 1) * m;
    out.edits.push(...(x.edits || [])); Object.assign(out.plan, x.plan || {});
    for (const t of x.targets || []) if (!out.targets.includes(t)) out.targets.push(t);
    if (x.kind) out.kind = x.kind;
    out.name = (out.name ? out.name + ' + ' : '') + (x.name || file);
  }
  return files.length ? out : {};
};

/** One patch of several proposals (registry order, so the edits apply in a stable order and a conflict is found the same way each time). */
export function composePatch(root, ids, o = {}) {
  const reg = o.reg || loadProposals(root);
  const want = new Set(ids);
  for (const id of want) if (!reg.byId.has(id)) throw new Error('proposals: no modelled proposal ' + id);
  for (const id of want) for (const x of reg.byId.get(id).excludes || []) if (want.has(x)) throw new Error('proposals: ' + id + ' is an alternative to ' + x + ' (' + reg.byId.get(id).excludesWhy + '): never both');
  /* `requires`: a proposal whose patch edits what another writes (GR-6-seat edits R13's law) never plays without it */
  for (const id of want) for (const x of reg.byId.get(id).requires || []) if (!want.has(x)) throw new Error('proposals: ' + id + ' requires ' + x + ' (its patch edits what ' + x + ' writes)');
  const out = { schema: 'hearthrise.balance-patch/1', name: o.name || 'proposals ' + [...want].join('+'), knobs: {}, edits: [], plan: {}, targets: [], derived: [], proposals: [] };
  for (const p of reg.proposals) {
    if (!want.has(p.id)) continue;
    out.proposals.push(p.id);
    if (p.derived) out.derived.push(p.derived);
    const patch = readPatch(root, p);
    for (const [k, m] of Object.entries(patch.knobs || {})) out.knobs[k] = (out.knobs[k] || 1) * m;
    out.edits.push(...(patch.edits || []).map((e) => ({ ...e, proposal: p.id })));
    Object.assign(out.plan, patch.plan || {});
    for (const t of patch.targets || []) if (!out.targets.includes(t)) out.targets.push(t);
  }
  return out;
}

/** Every proposal that requires `id` (its `requires`), and theirs in turn. */
export function dependentsOf(reg, id) {
  const out = new Set(), todo = [id];
  while (todo.length) { const x = todo.pop(); for (const p of reg.proposals) if ((p.requires || []).includes(x) && !out.has(p.id)) { out.add(p.id); todo.push(p.id); } }
  return [...out];
}
/** A toggle's set: `base` with `id` off (and whatever requires it), or ('+id') on in place of the proposals it is an alternative to (with what it requires). */
export function toggled(reg, base, v) {
  const id = v.replace(/^\+/, '');
  if (!reg.byId.has(id)) throw new Error('proposals: no modelled proposal ' + id);
  if (!v.startsWith('+')) { const off = new Set([id, ...dependentsOf(reg, id)]); return base.filter((x) => !off.has(x)); }
  const ex = new Set((reg.byId.get(id).excludes || []).flatMap((x) => [x, ...dependentsOf(reg, x)])), need = (reg.byId.get(id).requires || []).filter((x) => !base.includes(x));
  return [...base.filter((x) => !ex.has(x)), ...need, id];
}

/** The "ships with" and order flags of a set: [{ id, missing, why }] for every pair the registry ties together that the set breaks. */
export function shipsWithFlags(reg, ids) {
  const on = new Set(ids), out = [];
  for (const id of on) {
    const p = reg.byId.get(id);
    if (!p) continue;
    for (const w of p.shipsWith || []) if (reg.byId.has(w) && !on.has(w)) out.push({ id, missing: w, why: 'ships with' });
  }
  return out;
}

/* ── THE STATIC STRUCTURAL PATCHES (exact text of the tree they plant on; the plant refuses a text that is not there once) ── */
const STATIC = {
  'patches/R7-tier-dial-once.json': {
    name: 'R7: a tier\'s dial applied once (blow and aim only), and one source for hero health (44 R7; X-TIER-TRIPLE, X-REFHP-OFF-BY-ONE)',
    why: 'Armor and Defense XP read the monster row\'s own Level, not the Level the dial makes; the stat formula sizes blows on 150 + 10 x (L - 1), the health a hero has. A correctness fix; 44 says the dial may need one step up to hold S3 and S4',
    kind: 'coefficient', targets: ['survival', 'S3', 'S4'],
    edits: [
      { file: 'src/data/hunt-tiers.js', from: "export const levelAtTier = (level, dial) => { const pm = pmOf(dial, 'dmgPm'); return pm !== 1000 ? Math.round((level * pm) / 1000) : level; };",
        to: 'export const levelAtTier = (level, dial) => (void dial, level);' },
      { file: 'src/data/balance-sheet.js', from: '  refHp: (L) => VITALS.hpBase + VITALS.hpPerLevel * L,', to: '  refHp: (L) => VITALS.hpBase + VITALS.hpPerLevel * (L - 1),' },
    ],
  },
  'patches/one-tier-table.json': {
    name: 'One tier table: no per-ground tier dials, no floor-16 pull rule (60 G-5, 44 section 5.2, R12)',
    why: 'Every ground takes TIER_DIALS. A ground keeps its pull capacity (how many its rooms hold: geography), loses its own dials, and the bigger pulls are no longer held back under floor 16',
    kind: 'derivation', targets: ['pace', 'P9', 'survival'],
    edits: [
      { file: 'src/data/balance-sheet.js', from: 'export const TIER_PULL_OVERRIDES = Object.freeze(foldRows(',
        to: 'export const TIER_PULL_OVERRIDES = ((o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([g, r]) => { const { dials, ...rest } = r; void dials; return [g, Object.freeze(rest)]; }))))(foldRows(' },
      { file: 'src/data/balance-sheet.js', from: 'export const TIER_PULL_FROM_FLOOR = 16;', to: 'export const TIER_PULL_FROM_FLOOR = 0;' },
    ],
  },
  'patches/talents-hook.json': {
    name: 'Talents: the engine seams a cell reads its four stat lines through (10-level-choices.md section 8.2; on the scratch copy only)',
    why: 'Chapter 10 section 8.2: a cell carries each seat\'s allocation on m.perks.talents (tools/balance-program/talents.mjs, the suggested build of its way, BASELINE) and the member turns it into rows. These four edits are that turn, planted on the scratch copy, never on the tree: Force on the permanent damage key (inside its 20% cap), Footing on the hero\'s Defense rating, Grit on max health, Reserve on max mana. Linger and every unlock have no seam and are NOT MODELLED. A cell that carries no allocation plays as before',
    kind: 'derivation', targets: ['pace', 'survival'],
    edits: [
      { file: 'src/core/perks.js', from: '    propertyTier: nonNegInt(r.propertyTier),', to: "    propertyTier: nonNegInt(r.propertyTier),\n    talents: r.talents && typeof r.talents === 'object' ? r.talents : null," },
      { file: 'src/core/perks.js', from: '  /* The property capstone. */', to: "  /* TALENTS (the matrix's scratch hook): Force on the permanent damage key, summed with the rest and capped with them */\n  if (key === 'damage' && s.talents && s.talents.force > 0) t += s.talents.force / 1000;\n\n  /* The property capstone. */" },
      { file: 'src/core/member.js', from: 'function applyVitals(state, equipment, items) {\n  const v = vitalsOf({ levelXp: state.levelXp, skills: state.skills, equipment, items });',
        to: 'function applyVitals(state, equipment, items, talents) {\n  const v0 = vitalsOf({ levelXp: state.levelXp, skills: state.skills, equipment, items });\n  const v = talents ? { ...v0, maxHp: Math.round(v0.maxHp * (1 + (talents.grit || 0) / 1000)), maxMana: Math.round(v0.maxMana * (1 + (talents.reserve || 0) / 1000)) } : v0;' },
      { file: 'src/core/member.js', from: '  applyVitals(state, equipment, items);', to: '  applyVitals(state, equipment, items, mi.perks && mi.perks.talents);' },
      { file: 'src/core/member.js', from: 'applied > 0) applyVitals(state, equipment, items);', to: 'applied > 0) applyVitals(state, equipment, items, mi.perks && mi.perks.talents);' },
      { file: 'src/core/member.js', from: '> lv0) applyVitals(state, equipment, items);', to: '> lv0) applyVitals(state, equipment, items, mi.perks && mi.perks.talents);' },
      { file: 'src/core/member.js', from: 'temper: mi.perks && mi.perks.temper ? mi.perks.temper : null };', to: 'temper: mi.perks && mi.perks.temper ? mi.perks.temper : null, talents: mi.perks && mi.perks.talents ? mi.perks.talents : null };' },
      { file: 'src/core/member.js', from: "  const def = Math.floor((Number(levelsOf(state.skills).defense) || 1) + skillPlusOf(c.eq, 'defense') + (Number(c.eq.guardB) || 0));",
        to: "  const def = Math.floor(((Number(levelsOf(state.skills).defense) || 1) + skillPlusOf(c.eq, 'defense') + (Number(c.eq.guardB) || 0)) * (1 + ((c.talents && c.talents.footing) || 0) / 1000));" },
    ],
  },
  'patches/party-xp-by-size.json': {
    name: 'S-10: party XP by party size alone for the first build (the sitting, RULED 2026-11-21, option C)',
    why: 'Tyler 2026-11-21 (review/01-sitting.md S-10, C): "Size alone for the first build", the classes rule may return as one row after Deadly is sized on a fixed tool. Every party reads its size\'s cell whatever classes it holds; the cell is the one a mixed party reads today (880/1500 a pair, 1700 a three and a four), so the standard four is unchanged and a one-class party rises to it. The SIZE values are a HYPOTHESIS until the size table is written; the lineup cells stay a report of which fours win',
    kind: 'derivation', targets: ['pace'],
    edits: [
      { file: 'src/data/party-class-xp.js', from: '  const cell = cells[Math.min(Math.max(classes.length, 1), cells.length) - 1];', to: '  const cell = cells[cells.length - 1];' },
    ],
  },
  'patches/level-xp-hook.json': {
    name: 'S-4: the seam a clan room\'s standing Level XP bonus drops into (the sitting, RULED 2026-11-21, option A; size not designed)',
    why: 'Tyler 2026-11-21 (review/01-sitting.md S-4, A): a clan room pays a standing Level XP bonus, size still to be designed. The engine has no Level XP buff on a hunt (the buff types pay skill and gather XP), so this plants one seam on the scratch copy: a kill\'s Level XP times 1 + perks.levelXpPm / 1000. A cell carries it as a buff row { type: \'level_xp\', magnitude: percent } (cell.mjs). No cell sets one until the size is designed, so today it moves nothing',
    kind: 'identity', targets: [],
    edits: [
      { file: 'src/core/member.js', from: '    addLevelXp(amt, raw, ev) {\n      const n = Math.max(0, Math.floor(Number(amt) || 0));',
        to: '    addLevelXp(amt, raw, ev) {\n      const n = Math.max(0, Math.floor((Number(amt) || 0) * (1 + ((mi.perks && mi.perks.levelXpPm) || 0) / 1000)));' },
    ],
  },
  'patches/R10-gear-curve.json': {
    name: 'The gear curve past tier 7 (60 G-4, 44 R10 and R11, 47 C20): a band every +24%, the line linear in the band\'s Level',
    why: 'From Level 110 a MID or BiS hero\'s weapon and armor are the line (the Dawnsteel row x the band Level / 110) at the band at or under its Level: 110, 136, 169, 210, 260, 322, 400 and on by +24%. LOW wears one band back. HYPOTHESIS: the band size until one band is played; uniques spending a budget (R11) and jewelry as a 6% share are not modelled',
    kind: 'derivation', targets: ['pace', 'gear', 'E1'],
    plan: { gearCurve: { from: 110, step: 1.24 } },
  },
};

/** Write the static patches; answers the files written. */
export function writeStatic(root = ROOT) {
  const out = [];
  for (const [file, p] of Object.entries(STATIC)) {
    writeFileSync(join(root, 'tools/balance-program', file), JSON.stringify({ schema: 'hearthrise.balance-patch/1', ...p }, null, 1) + '\n');
    out.push(file);
  }
  return out;
}

/* ── THE DERIVED PATCHES ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
/* the ruled hours of the Level table (core-model.js LEVEL_PACE.targets): [Level, cumulative hunted hours] */
const fitPower = (pts) => {
  const xs = pts.map(([L]) => Math.log(L)), ys = pts.map(([, v]) => Math.log(v)), n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const d = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return { c: Math.exp(my - d * mx), d };
};

/** R12's reference line: kill-health an hour of a lone MID hammer on Normal (each kill's HP x its role's XP share x the lone hero's bonus). */
export async function referenceKillHealth(root, cells, V) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const { placeholderWhatIf, projectedFloor } = await imp('tools/balance-program/grid-project.mjs');
  const BS = V.BS, roleOf = {};
  for (const roster of Object.values(BS.GROUND_ROSTER)) for (const [id, r] of Object.entries(roster)) if (!roleOf[id]) roleOf[id] = r;
  const solo = (await imp('src/data/party-class-xp.js')).SOLO_XP_PM / 1000;
  const pts = [];
  for (const c of cells.filter((x) => x.m && x.party === 1 && x.styles[0] === 'hammer' && x.gear === 'mid' && x.tier === 'normal' && !x.step && x.block !== 'grounds')) {
    const rows = c.stretch === 'PROJECTED' ? { ...V.MONSTERS, ...placeholderWhatIf(V.projectD, projectedFloor(c.L)).monsters } : V.MONSTERS;
    let khp = 0;
    for (const [m, n] of Object.entries(c.m.killsByPerH || {})) { const row = rows[m]; if (!row) continue; khp += n * row.hp * ((BS.MONSTER_ROLES[roleOf[m]] || {}).xp || 1) * solo; }
    if (khp > 0) pts.push([c.L, khp]);
  }
  return { pts, ...fitPower(pts) };
}

async function derive(o) {
  const BM = await import('./balance-matrix.mjs');
  const MP = await import('./matrix-plan.mjs');
  const { loadGridData, compsOf } = await import('./progression-grid.mjs');
  const { loadKits } = await import('./grid-kit.mjs');
  const SC = await import('./matrix-scratch.mjs');
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const reg = loadProposals(ROOT);
  const playOn = async (ids, run, label) => {
    const s = await SC.plantScratch(composePatch(ROOT, ids, { reg }));
    let res;
    try { res = await BM.playRun(D, K, run, s.root, { workers: o.workers, quiet: true, calibrate: false, label }); } finally { s.done(); }
    /* a cell that ended no_fight measured an engine stall (audit A-0): the derivation still prints, and the command exits 1 */
    if (BM.printToolReds(res.cells, (x) => console.error(x), label)) process.exitCode = 1;
    return res;
  };
  /* R12: on the proposed game without R12 (and R13, which comes after it), the gear curve on (R10 before R12). `--r13-only` keeps R12 as written */
  if (!o.r13Only) {
  const base12 = reg.recommended.filter((id) => !['GR-5', 'GR-6'].includes(id));
  const run12 = { id: 'derive-r12', levels: MP.RUNS.subset.levels, seeds: 1, hours: 1, blocks: [{ id: 'ways', comps: [[['hammer'], 'h']], gears: ['mid'], tiers: ['normal'] }] };
  const r12 = await playOn(base12, run12, 'R12 reference');
  const ref = await referenceKillHealth(ROOT, r12.cells, r12.V);
  const c = Number(ref.c.toPrecision(6)), d = Number(ref.d.toPrecision(6));
  const patch12 = { schema: 'hearthrise.balance-patch/1', name: 'R12: the kill reward follows the pace line (60 G-5, 44 section 5.2)', kind: 'derivation', targets: ['pace', 'P2'],
    why: 'XP a health point = contractXpPerH(L) / (' + c + ' x L^' + d + '), the reference kill-health an hour of a lone MID hammer on Normal (each kill\'s HP x its role\'s XP share x the lone bonus), MEASURED on the proposed game without R12 and R13 at Levels '
      + ref.pts.map(([L]) => L).join(', ') + ' and fitted. The 15 per-ground XP fits, the floor fit and the 0.4 exponent go; party grounds pay two thirds of a plain kill (was 0.8). COMPUTED',
    measuredOn: { proposals: base12, points: ref.pts.map(([L, v]) => [L, Math.round(v)]) },
    edits: [
      { file: 'src/data/balance-sheet.js', from: '  const xp = Math.max(1, Math.round(Math.max(F.xp.min || 0, F.xp.a * L ** F.xp.b) * hp * R.xp * fit.xp * gx * xFloor));',
        to: '  const xp = (void gx, void xFloor, Math.max(1, Math.round((contractXpPerH(L) / (' + c + ' * Math.max(1, L) ** ' + d + ')) * hp * R.xp * fit.xp)));' },
      { file: 'src/data/balance-sheet.js', from: '    party: Object.freeze({ hp: 2.5, blow: 0.75, xp: 0.8,', to: '    party: Object.freeze({ hp: 2.5, blow: 0.75, xp: 0.667,' },
    ] };
  writeFileSync(join(HERE, 'patches/R12-kill-reward.json'), JSON.stringify(patch12, null, 1) + '\n');
  console.log('R12: reference kill-health ' + c + ' x L^' + d + ' (' + ref.pts.length + ' points)');
  }
  /* R13: the Level law's seat multiple, FITTED AT THE RULED POINTS (12-balance-pass.md 3.5 and 9: a median does not land the ruled Levels). The MID
     four plays the subset's Levels to 400 on Dangerous and on the hardest tier it holds, on the proposed game without R13. The default seat is the
     four on the hardest tier with no death (its Level XP before deaths); the Dangerous four after its deaths is the GR-6-seat toggle (12 section 7,
     item 1, waits on Tyler). A seat at x(L) times the contract spends, from Level 10, hours(L) = m x the sum of the ruled hours a Level / x; m is the
     one number that puts those hours on the ruled points' hours best (least squares on the logs). */
  /* without R13 and whatever edits its law (GR-6-seat, ON since S-11 c) */
  const base13 = toggled(reg, reg.recommended, 'GR-6');
  const run13 = { id: 'derive-r13', levels: MP.RUNS.subset.levels.filter((L) => L >= 10 && L <= 400), seeds: 2, hours: 1, blocks: [{ id: 'four', comps: compsOf(4), gears: ['mid'], tiers: ['dangerous', 'hardest'] }] };
  const r13 = await playOn(base13, run13, 'R13 pace seats');
  const CM = (await import('../../src/data/core-model.js')).LEVEL_PACE;
  const targets = CM.targets, contract = (L) => CM.contract.a * Math.max(1, L) ** CM.contract.b;
  const lawH = (L) => { const p = targets; let i = 1; while (i < p.length - 1 && p[i][0] < L) i++; const [a, ha] = p[i - 1], [b, hb] = p[i]; return Math.exp(Math.log(ha) + (Math.log(hb) - Math.log(ha)) * (Math.log(L) - Math.log(a)) / (Math.log(b) - Math.log(a))); };
  const hardestOf = (L) => { const ts = r13.cells.filter((c) => c.L === L && c.m).map((c) => c.tier); return ts.includes('deadly') ? 'deadly' : ts.includes('dangerous') ? 'dangerous' : null; };
  const seatPoints = (tierAt, field) => r13.cells.filter((c) => c.m && c.tier === tierAt(c.L) && Number.isFinite(c.m[field]) && c.m[field] > 0).map((c) => [c.L, c.m[field] / contract(c.L)]).sort((a, b) => a[0] - b[0]);
  const fitSeat = (pts) => {
    const x = (L) => { if (L <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (L <= pts[i][0]) { const [a, xa] = pts[i - 1], [b, xb] = pts[i]; return xa * (xb / xa) ** ((L - a) / (b - a)); } return pts[pts.length - 1][1]; };
    const ruled = targets.filter(([L]) => L > 10 && L <= 400), logs = [];
    for (const [L, H] of ruled) { let S = 0; for (let l = 11; l <= L; l++) S += (lawH(l) - lawH(l - 1)) / x(l - 1); logs.push(Math.log((H - lawH(10)) / S)); }
    return { m: Number(Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length).toFixed(3)), points: pts.map(([L, v]) => [L, Number(v.toFixed(3))]), ruled: ruled.map(([L]) => L) };
  };
  const deadly = fitSeat(seatPoints(hardestOf, 'levelXpPerH')), dangerous = fitSeat(seatPoints(() => 'dangerous', 'netLevelXpPerH'));
  const seat = deadly.m;
  const law = 'const LAW = { pts: ' + JSON.stringify(targets) + ', m: ' + seat + ', from: 10 };\n'
    + 'const lawH = (L) => { const p = LAW.pts; let i = 1; while (i < p.length - 1 && p[i][0] < L) i++; const [a, ha] = p[i - 1], [b, hb] = p[i]; return Math.exp(Math.log(ha) + (Math.log(hb) - Math.log(ha)) * (Math.log(L) - Math.log(a)) / (Math.log(b) - Math.log(a))); };\n'
    + 'const LAW_XP = [];\n'
    + 'const lawXp = (L) => { if (!LAW_XP.length) LAW_XP[LAW.from] = xpForLevelOn(LEVEL_ROWS, LAW.from); for (let l = LAW_XP.length; l <= L; l++) LAW_XP[l] = LAW_XP[l - 1] + Math.max(1, Math.round((lawH(l) - lawH(l - 1)) * LEVEL_PACE.contract.a * (l - 1) ** LEVEL_PACE.contract.b * LAW.m)); return LAW_XP[L]; };\n';
  const patch13 = { schema: 'hearthrise.balance-patch/1', name: 'R13: the Level law, your table of hours is the law (60 G-6, 44 section 5.2)', kind: 'derivation', targets: ['pace', 'P1', 'P11', 'P12'],
    why: 'From Level 10 the XP a Level costs = the ruled hours for it (log-linear between ' + targets.map(([L, h]) => L + ':' + h).join(', ') + ', on at the last slope) x the pace contract x the pace seat\'s multiple, '
      + seat + ': the MID four on the hardest tier it holds with no death, FITTED at the ruled points ' + deadly.ruled.join(', ') + ' (12-balance-pass.md 3.5 and 9), MEASURED on the proposed game without R13 (2 seeds of 1 hour). Levels 1 to 10 keep today\'s steps (27-2). Not the withdrawn power law',
    measuredOn: { proposals: base13, seat: 'mid four, hardest tier, no death', points: deadly.points },
    edits: [
      { file: 'src/core/xp.js', from: "import { LEVEL_CURVE, SKILL_CURVE } from '../data/core-model.js';", to: "import { LEVEL_CURVE, SKILL_CURVE, LEVEL_PACE } from '../data/core-model.js';" },
      { file: 'src/core/xp.js', from: 'export function charXpForLevel(lv) { return xpForLevelOn(LEVEL_ROWS, lv); }',
        to: law + 'export function charXpForLevel(lv) { const L = Math.max(1, Math.floor(Number(lv) || 1)); return L <= LAW.from ? xpForLevelOn(LEVEL_ROWS, L) : lawXp(L); }' },
      { file: 'src/core/xp.js', from: 'export function charLevelFromXp(xp) {',
        to: 'export function charLevelFromXp(xp) { { const x = Math.max(0, Math.floor(Number(xp) || 0)); if (x >= lawXp(LAW.from)) { let lo = LAW.from, hi = LAW.from * 2; while (lawXp(hi) <= x) hi *= 2; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lawXp(mid) <= x) lo = mid; else hi = mid; } return lo; } }' },
    ] };
  writeFileSync(join(HERE, 'patches/R13-level-law.json'), JSON.stringify(patch13, null, 1) + '\n');
  /* the GR-6-seat toggle: the same law timed on the Dangerous four after its deaths, one edit on R13's multiple */
  const seatPatch = { schema: 'hearthrise.balance-patch/1', name: 'Balance pass: the Level law timed on the MID four on Dangerous (seat multiple ' + dangerous.m + ', the default ' + seat + ')',
    why: 'R13 times the XP a Level costs on the MID four on the hardest tier it holds with no death (' + seat + '). The sitting ruled Deadly a tier you watch or gamble on and Dangerous the idle tier (S-6), so the four that is left alone hunts Dangerous. Its multiple, FITTED at the ruled points ' + dangerous.ruled.join(', ') + ' on its XP after deaths, is ' + dangerous.m + ' (MEASURED on the proposed game without R13, 2 seeds of 1 hour; 12-balance-pass.md 3.5, item 1 of section 7 waits on Tyler). Layer: coefficient. Written by proposals.mjs --derive',
    kind: 'coefficient', targets: ['P1', 'P12'], measuredOn: { proposals: base13, seat: 'mid four, Dangerous, after deaths', points: dangerous.points },
    edits: [{ file: 'src/core/xp.js', from: 'm: ' + seat + ', from: 10 };', to: 'm: ' + dangerous.m + ', from: 10 };' }] };
  writeFileSync(join(HERE, 'patches/bp-level-law-dangerous-seat.json'), JSON.stringify(seatPatch, null, 1) + '\n');
  console.log('R13: the seat multiple fitted at the ruled points: the Deadly four, no death ' + seat + ' (points ' + JSON.stringify(deadly.points) + '); the Dangerous four ' + dangerous.m + ' (points ' + JSON.stringify(dangerous.points) + ')');
}

/* ── THE SELFTEST: the registry is whole, every toggle plants, and each proposal's patch moves its targets on the proposed game ────────── */
/* the band groups and ids a patch names, read as the cell metrics they are judged on */
const TARGET_METRICS = {
  pace: ['levelXpPerH', 'xContract', 'hoursPerLevel'], P1: ['hoursPerLevel'], P11: ['hoursPerLevel'], P12: ['hoursPerLevel'], P2: ['xContract', 'levelXpPerH'], P6: ['levelXpPerH'], P9: ['levelXpPerH'],
  B9: ['levelXpPerH'], R: ['hoursPerLevel'], survival: ['takenPerH', 'lowHpTypical', 'lowHpP10', 'deathsPer1000h', 'hpUnder30'], S3: ['lowHpTypical'], S4: ['lowHpTypical'],
  gold: ['netPerH', 'storePerH', 'incomePerH'], gear: ['dps', 'levelXpPerH', 'takenPerH'], E1: ['dps', 'takenPerH'],
};
const metricsOf = (targets) => [...new Set((targets || []).flatMap((t) => TARGET_METRICS[t] || TARGET_METRICS[t.split('.')[0]] || []))];
/** What a played pair moved: { moved: [cell metric], hit: [cell metric of the named targets] } (the same dice on both sides). */
export function movedBetween(a, b, targets) {
  const want = new Set(metricsOf(targets)), B = new Map(b.filter((c) => c.m).map((c) => [c.key, c]));
  const moved = [], hit = [];
  for (const c of a.filter((x) => x.m)) {
    const d = B.get(c.key);
    if (!d) continue;
    for (const [id, v] of Object.entries(c.m)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v === d.m[id]) continue;
      moved.push(c.key + ' ' + id);
      if (want.has(id)) hit.push(c.key + ' ' + id);
    }
  }
  return { moved, hit };
}
async function selftest(o) {
  const t0 = Date.now(), fails = [];
  const check = (name, ok, why = '') => { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ': ' + why)); if (!ok) fails.push(name); };
  const reg = loadProposals(ROOT);
  const SC = await import('./matrix-scratch.mjs');
  const STD = await import('./standards.mjs');
  /* 1. the registry is whole */
  const ids = reg.proposals.map((p) => p.id), LABELS = ['MEASURED', 'COMPUTED', 'HYPOTHESIS'];
  const bad = [];
  for (const p of reg.proposals) {
    if (!LABELS.includes(p.label)) bad.push(p.id + ': label ' + p.label);
    if (!p.patch && !p.derived) bad.push(p.id + ': neither a patch nor a derived reading');
    if (p.patch) { try { const x = readPatch(ROOT, p); if (x.schema !== 'hearthrise.balance-patch/1') bad.push(p.id + ': ' + p.patch + ' schema ' + x.schema); SC.checkPatch(x); } catch (e) { bad.push(p.id + ': ' + e.message); } }
    for (const w of p.excludes || []) if (!ids.includes(w)) bad.push(p.id + ' is an alternative to ' + w + ', which is no modelled proposal');
    for (const w of p.shipsWith || []) if (!ids.includes(w) && !reg.notModelled.some((n) => n.id === w)) bad.push(p.id + ' ships with ' + w + ', which the registry does not hold');
    for (const w of p.requires || []) if (!ids.includes(w)) bad.push(p.id + ' requires ' + w + ', which is no modelled proposal');
  }
  if (new Set(ids).size !== ids.length) bad.push('an id twice');
  for (const n of reg.notModelled) if (!n.reason) bad.push(n.id + ': not modelled without a reason');
  const bandIds = new Set(STD.BANDS.map((b) => b.id));
  for (const f of reg.frame) for (const r of f.retires || []) if (!bandIds.has(r) && !/^(X|G)\d+$/.test(r)) bad.push(f.id + ' retires ' + r + ', which is no band');
  check('the registry is whole (' + reg.proposals.length + ' modelled, ' + reg.notModelled.length + ' not, ' + reg.frame.length + ' frame rulings)', !bad.length, bad.join('; '));
  /* 2. the proposed game composes; every toggle plants; an alternative stacked on what it replaces is refused */
  const toggles = reg.proposals.filter((p) => p.patch).map((p) => (p.recommended ? p.id : '+' + p.id));
  const plantErr = [];
  for (const v of [null, ...toggles]) {
    const set = v ? toggled(reg, reg.recommended, v) : reg.recommended;
    try { const s = await SC.plantScratch(composePatch(ROOT, set, { reg }), { regen: false }); s.done(); } catch (e) { plantErr.push((v || 'the proposed game') + ': ' + e.message.slice(0, 160)); }
  }
  check('the proposed game and every toggle (' + toggles.length + ') plant on a scratch copy', !plantErr.length, plantErr.join('; '));
  const alt = reg.proposals.find((p) => (p.excludes || []).length);
  let refused = false;
  if (alt) { try { composePatch(ROOT, [...reg.recommended, alt.id], { reg }); } catch { refused = true; } }
  check('an alternative stacked on what it replaces is refused (' + (alt ? alt.id + ' with ' + alt.excludes.join(',') : 'none') + ')', !alt || refused);
  const flags = shipsWithFlags(reg, reg.recommended.filter((id) => id !== 'GR-5b'));
  check('ships-with: the proposed game without GR-5b flags GR-5 (it ships with it)', flags.some((f) => f.id === 'GR-5' && f.missing === 'GR-5b'), JSON.stringify(flags));
  /* requires (S-11 c put GR-6-seat on, and it edits R13's law): GR-6 off takes it along; on its own it is refused by name */
  const req = reg.proposals.find((p) => (p.requires || []).length);
  let reqRefused = false;
  if (req) { try { composePatch(ROOT, toggled(reg, reg.recommended, req.id).filter((x) => x !== req.requires[0]).concat(req.id), { reg }); } catch (e) { reqRefused = /requires/.test(e.message); } }
  check('requires: ' + (req ? req.requires[0] + ' off takes ' + req.id + ' along, and ' + req.id + ' without it is refused' : 'no proposal requires another'),
    !!req && !toggled(reg, reg.recommended, req.requires[0]).includes(req.id) && reqRefused && toggled(reg, toggled(reg, reg.recommended, req.requires[0]), '+' + req.id).includes(req.requires[0]));
  if (o.quick) return done();
  /* 3. EACH PROPOSAL MOVES ITS TARGETS ON THE PROPOSED GAME: its toggle (the game without it, or with an alternative) played on a mini plan
     against the proposed game on the same dice; a non-identity patch must move a metric its targets are judged on, an identity none */
  const BM = await import('./balance-matrix.mjs');
  const MP = await import('./matrix-plan.mjs');
  const { loadGridData, compsOf } = await import('./progression-grid.mjs');
  const { loadKits } = await import('./grid-kit.mjs');
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const lone = (w) => [[w], w === 'hammer' ? 'h' : w];
  const PMINI = { id: 'proposals-selftest', levels: [], seeds: 1, hours: 0.15, blocks: [
    /* the early grounds (pull floor, per-ground tier dials), every tier (Dangerous's own row), BiS (the perked jewels) */
    { id: 'e', levels: [10, 30], comps: [lone('hammer')], gears: ['mid', 'bis'], tiers: 'all' },
    { id: 'a', levels: [60, 150], comps: [lone('hammer'), lone('axes'), lone('mage'), lone('crossbow')], gears: ['mid'], tiers: 'all' },
    { id: 'b', levels: [60], comps: [...compsOf(2), ...compsOf(3), ...compsOf(4)], gears: ['mid'], tiers: ['normal', 'hardest'] },
    { id: 'g', grounds: true, quick: true, only: ['the_slake'] },
  ] };
  const play = async (ids) => { const p = composePatch(ROOT, ids, { reg }); const s = await SC.plantScratch(p); try { return (await BM.playRun(D, K, PMINI, s.root, { workers: o.workers, quiet: true, calibrate: false, plan: p.plan })).cells; } finally { s.done(); } };
  const proposed = await play(reg.recommended);
  check('the mini plan plays on the proposed game (' + proposed.length + ' cells)', proposed.length > 20 && proposed.every((c) => c.m), (proposed.find((c) => c.error) || {}).error);
  const verdict = (p, patch, m) => {
    if (p.identity || patch.kind === 'identity') return m.moved.length === 0 ? null : m.moved.length + ' metric(s) moved, e.g. ' + m.moved[0];
    if (!m.moved.length) return 'nothing moved';
    return (patch.targets || []).length && !m.hit.length ? 'moved ' + m.moved.length + ' metric(s), none its targets (' + patch.targets.join(', ') + ') are judged on' : null;
  };
  for (const v of toggles) {
    const p = reg.byId.get(v.replace(/^\+/, ''));
    const cells = await play(toggled(reg, reg.recommended, v));
    const patch = readPatch(ROOT, p), m = movedBetween(proposed, cells, patch.targets);
    const why = verdict(p, patch, m);
    check((v.startsWith('+') ? 'with ' : 'without ') + p.id + ' (' + (patch.kind || 'no kind') + '): ' + (p.identity || patch.kind === 'identity' ? 'moves nothing' : 'moves its targets (' + m.hit.length + ' of ' + m.moved.length + ' moved)'), !why, why);
  }
  /* the mutants: a coefficient that moves nothing reads "nothing moved"; one that moves only metrics its targets are not judged on is caught;
     an identity that moves something is caught (the check is not blind) */
  const still = movedBetween(proposed, proposed.map((c) => ({ ...c })), ['gold']);
  const off = movedBetween(proposed, proposed.map((c) => ({ ...c, m: { ...c.m, ttkS: (c.m.ttkS || 0) + 1 } })), ['gold']);
  const idMoved = movedBetween(proposed, proposed.map((c) => ({ ...c, m: { ...c.m, netPerH: (c.m.netPerH || 0) + 1 } })), []);
  check('the check bites: still, off-target and a moving identity are each caught',
    verdict({}, { kind: 'coefficient', targets: ['gold'] }, still) === 'nothing moved' && /none its targets/.test(verdict({}, { kind: 'coefficient', targets: ['gold'] }, off) || '') && verdict({}, { kind: 'identity' }, idMoved) !== null);
  /* 4. GR-7, the Blessing ladder (a derived reading): from Level 100 a harder tier keeps more after the ruled deaths; under it nothing changes */
  const { deriveMatrix } = await import('./matrix-metrics.mjs');
  const ad = deriveMatrix(proposed).afterDeaths;
  const lo = ad.filter((r) => r.L < 100), hi = ad.filter((r) => r.L >= 100);
  check('GR-7 (' + ad.length + ' harder-tier cells): from Level 100 the ladder reads over three Blessings, under 100 the same', hi.length > 0 && hi.every((r) => r.vsNormalLadder > r.vsNormalThree) && lo.every((r) => r.vsNormalLadder === r.vsNormalThree), JSON.stringify(ad.slice(0, 3)));
  return done();
  function done() { console.log('proposals selftest: ' + (fails.length ? fails.length + ' FAILED' : 'green') + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s'); return fails.length ? 1 : 0; }
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2), arg = (k, dflt) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
  if (argv.includes('--selftest')) process.exit(await selftest({ quick: argv.includes('--quick'), workers: Number(arg('workers', 4)) }));
  if (argv.includes('--write')) console.log('wrote ' + writeStatic().join(', '));
  else if (argv.includes('--derive')) await derive({ workers: Number(arg('workers', 4)), r13Only: argv.includes('--r13-only') });
  else {
    const reg = loadProposals();
    for (const f of reg.frame) console.log('FRAME ' + f.id + ' (' + f.label + '): ' + f.title + '. Retires ' + (f.retires || []).join(', '));
    console.log('PROPOSED GAME: ' + reg.recommended.join(', '));
    for (const p of reg.proposals) console.log((p.recommended ? 'ON  ' : 'off ') + p.id.padEnd(14) + p.label.padEnd(11) + (p.patch || p.derived || '').padEnd(42) + p.title);
    console.log('\nNOT MODELLED (' + reg.notModelled.length + ')');
    for (const p of reg.notModelled) console.log('  ' + p.id.padEnd(7) + p.title.slice(0, 60).padEnd(62) + p.reason);
  }
  if (!existsSync(join(ROOT, PROPOSALS_FILE))) process.exit(2);
}
