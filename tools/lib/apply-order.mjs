// ════════════════════════════════════════════════════════════════════════
// tools/lib/apply-order.mjs — THE APPLY ORDER OF supabase/migrations/**, DERIVED FROM THE FILES.
//
// Until 2026-11-19 the order, every per-file apply note and the excluded list lived in ONE shared
// file, tests/schema-apply-order.json (1.3 MB). Every migration lane edited it, so every two
// migration lanes conflicted on it (four send-backs in one day: analyzer-coins, gold-plat,
// scaled-loot, tank runes), and the Coordinator hand-flipped notes in it at every release.
// (Fable's architecture audit 2026-11-18, item 5.) Now each migration says where it stands itself:
//
//   supabase/migrations/<file>.sql                  the chain (unchanged)
//   supabase/migration-notes/<file>.sql.json        ITS sidecar: placement + apply note
//   supabase/migration-notes/_chain.json            the replay's GUCs, the readme, history's last seq
//   supabase/migrations-retired/<file>.sql          superseded catalogues the replay skips (item 6)
//
// THE ORDER (the replay applies pre_schema, then supabase/schema.sql, then `order`):
//   HISTORY   a date-named file (YYYY-MM-DD-*.sql, every file before the cutover) carries its
//             position as `seq` in its sidecar: 1..history.last_seq, frozen by
//             tools/apply-order-convert.mjs from the old JSON. Filename order does NOT replay
//             (2026-08-14: 23 of 41 files applied in name order), so history keeps its measured order.
//   NEW       every new file is named NNNN-<slug>.sql (or .generated.sql), NNNN >= SEQ_FLOOR, made by
//             tools/new-migration.mjs as one more than the highest sequence on the lane's base, with
//             its own sidecar holding only its note. The name IS the position: no lane edits a shared
//             file to place it. Two lanes cut from the same base may pick the same number; neither
//             saw the other, so neither depends on the other, and they order by name. Two such
//             siblings that write the same function are a real conflict, which
//             tests/migration-names.mjs refuses (CLAUDE.md rule 12).
//   EVERY .sql has a sidecar (history or new): a file without one is unplaced and fails the replay.
//   PLACEMENT a sidecar may instead say {"pre_schema": n} (before schema.sql), {"excluded": true}
//             (never replayed: an operator one-shot or kill switch; a claim that a rebuilt database
//             is CORRECT without it) or {"retired": {...}} (moved to migrations-retired/).
//
// loadApplyOrder(root) returns the SAME SHAPE the JSON had — { gucs, pre_schema, order,
// _order_notes, excluded, ... } plus `retired` — so every reader keeps its verdicts; it throws (a
// harness error) when the files cannot be placed, exactly as the replay refused an unplaced file.
// Pure fs, synchronous, no database.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'));
export const MIG_DIR = 'supabase/migrations';
export const NOTES_DIR = 'supabase/migration-notes';
export const RETIRED_DIR = 'supabase/migrations-retired';
export const CHAIN_FILE = `${NOTES_DIR}/_chain.json`;
/** The old shared file. It must not come back: the loader refuses a tree that has it (half-converted). */
export const LEGACY_JSON = 'tests/schema-apply-order.json';

/** The first sequence a NEW file may take; history (the converted date-named files) ends below it. */
export const SEQ_FLOOR = 1000;
/** NNNN-slug.sql / NNNN-slug.generated.sql — the slug starts with a letter (so a date never parses as one); words of
    [a-z0-9_] joined by single hyphens (a ground pack's id has underscores). */
export const SLUG = /^[a-z][a-z0-9_]*(?:-[a-z0-9_]+)*$/;
export const SEQ_NAME = /^(\d{4,})-([a-z][a-z0-9_]*(?:-[a-z0-9_]+)*)(\.generated)?\.sql$/;
/** A history name: every file the converter froze (YYYY-MM-DD-…). New files may not take this shape. */
export const HISTORY_NAME = /^\d{4}-\d{2}-\d{2}-[A-Za-z0-9._-]+\.sql$/;

const SIDECAR_KEYS = new Set(['seq', 'note', 'pre_schema', 'excluded', 'retired']);

export const noteFileOf = (file) => `${file}.json`;
export const seqOfName = (file) => { const m = SEQ_NAME.exec(file); return m ? Number(m[1]) : null; };
export const isSeqName = (file) => SEQ_NAME.test(file);
export const isHistoryName = (file) => HISTORY_NAME.test(file);

const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

// ── reading the tree ────────────────────────────────────────────────────────
const sqlIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')) : []);

/**
 * The raw inputs, read once: the chain config, every sidecar and the .sql names on disk.
 * `disk: false` takes the sidecars' word for which files exist: for a generator run in a PARTIAL temp
 * copy of the tree (the notes copied, the migrations not), which needs positions and nothing else, as
 * it read the old JSON. The replay (tests/schema-replay.mjs chainFiles) always reconciles with disk.
 * @param {string} root
 * @param {{disk?: boolean}} [o]
 * @returns {{chain:object|null, sidecars:Map<string,any>, onDisk:string[], retiredDisk:string[], legacy:boolean, bad:string[]}}
 */
export function readTree(root = ROOT, { disk = true } = {}) {
  const bad = [];
  const notesDir = join(root, NOTES_DIR);
  let chain = null;
  if (existsSync(join(root, CHAIN_FILE))) {
    try { chain = JSON.parse(readFileSync(join(root, CHAIN_FILE), 'utf8')); }
    catch (e) { bad.push(`${CHAIN_FILE} is not JSON: ${String(e.message).split('\n')[0]}`); }
  }
  const sidecars = new Map();
  if (existsSync(notesDir)) {
    for (const n of readdirSync(notesDir)) {
      if (n === '_chain.json') continue;
      if (!n.endsWith('.sql.json')) { bad.push(`${NOTES_DIR}/${n} is not a sidecar (want <migration>.sql.json)`); continue; }
      try { sidecars.set(n.slice(0, -'.json'.length), JSON.parse(readFileSync(join(notesDir, n), 'utf8'))); }
      catch (e) { bad.push(`${NOTES_DIR}/${n} is not JSON: ${String(e.message).split('\n')[0]}`); }
    }
  }
  const isRetired = (f) => !!(sidecars.get(f) && sidecars.get(f).retired);
  return {
    chain, sidecars, bad,
    onDisk: disk ? sqlIn(join(root, MIG_DIR)).sort() : [...sidecars.keys()].filter((f) => !isRetired(f)).sort(),
    retiredDisk: disk ? sqlIn(join(root, RETIRED_DIR)).sort() : [...sidecars.keys()].filter(isRetired).sort(),
    legacy: existsSync(join(root, LEGACY_JSON)),
  };
}

// ── the derivation (pure) ───────────────────────────────────────────────────
/**
 * Place every migration. Pure: the selftests feed it planted trees.
 * @returns {{manifest:object, problems:string[]}}
 */
export function deriveApplyOrder(tree) {
  const problems = [...(tree.bad || [])];
  const say = (m) => problems.push(m);
  const chain = tree.chain || {};
  if (!tree.chain) say(`${CHAIN_FILE} is missing (the replay's GUCs and history's last sequence live there)`);
  if (tree.legacy) {
    say(`${LEGACY_JSON} exists next to the sidecars: a half-converted tree. Run node tools/apply-order-convert.mjs `
      + '(it re-converts from that file and deletes it), never hand-merge the two.');
  }
  const lastSeq = chain.history && Number.isInteger(chain.history.last_seq) ? chain.history.last_seq : null;
  if (tree.chain && lastSeq === null) say(`${CHAIN_FILE} has no history.last_seq`);
  if (lastSeq !== null && lastSeq >= SEQ_FLOOR) say(`history.last_seq ${lastSeq} reaches SEQ_FLOOR ${SEQ_FLOOR}; new names would collide with history`);

  const onDisk = new Set(tree.onDisk);
  const retiredDisk = new Set(tree.retiredDisk);
  const history = [];   // [seq, file]
  const fresh = [];     // [seq, file]
  const pre = [];       // [n, file]
  const notes = {};
  const excluded = {};
  const retired = {};
  const seqOwner = new Map();

  for (const [file, sc] of tree.sidecars) {
    if (!sc || typeof sc !== 'object' || Array.isArray(sc)) { say(`${NOTES_DIR}/${noteFileOf(file)} is not an object`); continue; }
    for (const k of Object.keys(sc)) if (!SIDECAR_KEYS.has(k)) say(`${NOTES_DIR}/${noteFileOf(file)}: unknown key "${k}"`);
    const note = sc.note;
    if (note !== undefined && typeof note !== 'string' && !(Array.isArray(note) && note.every((l) => typeof l === 'string'))) {
      say(`${NOTES_DIR}/${noteFileOf(file)}: "note" must be a string`);
    }
    const kinds = ['pre_schema', 'excluded', 'retired'].filter((k) => sc[k] !== undefined);
    if (kinds.length > 1) { say(`${NOTES_DIR}/${noteFileOf(file)} claims two placements: ${kinds.join(' + ')}`); continue; }
    const kind = kinds[0] || 'chain';

    if (kind === 'retired') {
      if (!retiredDisk.has(file)) say(`${file} is retired by its sidecar but is not in ${RETIRED_DIR}/`);
      if (onDisk.has(file)) say(`${file} is retired by its sidecar and still in ${MIG_DIR}/ (the replay would apply it)`);
      const r = sc.retired;
      if (!r || typeof r !== 'object' || !Number.isInteger(r.seq) || typeof r.superseded_by !== 'string' || !r.superseded_by) {
        say(`${NOTES_DIR}/${noteFileOf(file)}: "retired" wants {seq, superseded_by, proof}`);
      } else claimSeq(r.seq, file);
      retired[file] = r;
      if (note !== undefined) notes[file] = note;
      continue;
    }
    if (!onDisk.has(file)) {
      say(retiredDisk.has(file)
        ? `${file} is in ${RETIRED_DIR}/ but its sidecar does not say "retired"`
        : `${NOTES_DIR}/${noteFileOf(file)} names a migration that is not on disk (stale sidecar)`);
      continue;
    }
    if (kind === 'excluded') {
      if (sc.excluded !== true) say(`${NOTES_DIR}/${noteFileOf(file)}: "excluded" must be true`);
      if (typeof note !== 'string' || !note.trim()) say(`${NOTES_DIR}/${noteFileOf(file)}: an excluded file needs a note saying why a rebuild is correct without it`);
      if (sc.seq !== undefined) say(`${NOTES_DIR}/${noteFileOf(file)}: an excluded file has no seq (it never replays)`);
      excluded[file] = note;
      continue;
    }
    if (kind === 'pre_schema') {
      if (!Number.isInteger(sc.pre_schema) || sc.pre_schema < 1) say(`${NOTES_DIR}/${noteFileOf(file)}: "pre_schema" is its 1-based position`);
      pre.push([sc.pre_schema, file]);
      if (note !== undefined) notes[file] = note;
      continue;
    }
    // chain
    if (isSeqName(file)) {
      if (sc.seq !== undefined) say(`${NOTES_DIR}/${noteFileOf(file)}: a sequence-named file takes its position from its name; drop "seq"`);
      const s = seqOfName(file);
      if (s < SEQ_FLOOR) say(`${file}: sequence ${s} is under SEQ_FLOOR ${SEQ_FLOOR} (history's range)`);
      fresh.push([s, file]);
    } else if (!Number.isInteger(sc.seq) || sc.seq < 1) {
      say(`${NOTES_DIR}/${noteFileOf(file)}: a date-named (history) file needs its integer "seq"`);
      continue;
    } else {
      if (lastSeq !== null && sc.seq > lastSeq) {
        say(`${file}: seq ${sc.seq} is past history.last_seq ${lastSeq}. A date-named file is history only; a new `
          + 'migration is named by node tools/new-migration.mjs <slug> (NNNN-<slug>.sql)');
      }
      claimSeq(sc.seq, file);
      history.push([sc.seq, file]);
    }
    if (note !== undefined) notes[file] = note;
  }

  function claimSeq(seq, file) {
    if (seqOwner.has(seq)) say(`seq ${seq} is claimed twice: ${seqOwner.get(seq)} and ${file}`);
    else seqOwner.set(seq, file);
  }

  /* EVERY migration has a sidecar (a new one too: its apply note is the deployment record). A file
     without one is unplaced and would be silently omitted from every rebuild. */
  for (const file of onDisk) {
    if (tree.sidecars.has(file)) continue;
    say(`${file} is in ${MIG_DIR}/ with no sidecar (${NOTES_DIR}/${noteFileOf(file)}). A migration that is `
      + 'not placed would be silently omitted from every rebuild. New files: node tools/new-migration.mjs <slug>.');
  }
  for (const file of retiredDisk) if (!tree.sidecars.has(file)) say(`${file} is in ${RETIRED_DIR}/ with no sidecar recording why`);

  const bySeq = (a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  history.sort(bySeq); fresh.sort(bySeq); pre.sort(bySeq);
  const order = [...history.map(([, f]) => f), ...fresh.map(([, f]) => f)];

  for (const [k, v] of Object.entries(chain._legacy_notes || {})) {
    if (onDisk.has(k) || tree.sidecars.has(k)) say(`${CHAIN_FILE} _legacy_notes names a real migration (${k}); its note belongs in its sidecar`);
    else notes[k] = v;
  }

  const manifest = {
    _readme: chain._readme || [],
    gucs: chain.gucs || {},
    pre_schema: pre.map(([, f]) => f),
    _pre_schema_why: chain._pre_schema_why || [],
    order,
    _order_notes: notes,
    excluded,
    retired,
    history_last_seq: lastSeq,
  };
  return { manifest, problems };
}

/**
 * The apply order as the old JSON's shape (+ `retired`, `history_last_seq`), or a harness error when
 * the files cannot be placed. A fresh object every call: callers may mutate it.
 * @param {string} [root]
 * @param {{disk?: boolean}} [o]  disk: false for a partial temp tree (readTree)
 */
export function loadApplyOrder(root = ROOT, { disk = true } = {}) {
  const { manifest, problems } = deriveApplyOrder(readTree(root, { disk }));
  if (problems.length) {
    throw harness(`APPLY ORDER: the migration files cannot be placed (${problems.length} problem(s)):\n  - `
      + problems.join('\n  - '));
  }
  return manifest;
}

/** The replayed sequence: pre_schema then order (schema.sql sits between them). */
export const replayedFiles = (m) => [...(m.pre_schema || []), ...(m.order || [])];

/** Every file the record accounts for (chain, pre-schema, excluded, retired). */
export const knownFiles = (m) => new Set([...replayedFiles(m),
  ...(Array.isArray(m.excluded) ? m.excluded : Object.keys(m.excluded || {})), ...Object.keys(m.retired || {})]);

// ── a git revision (tools/settle-cost.mjs --before=<rev>) ───────────────────
/**
 * The apply order as a git revision held it: the old JSON when that revision predates the sidecars,
 * else the same derivation over that revision's files. Reading history is not a second format.
 */
export function applyOrderAt(rev, root = ROOT) {
  const git = (args, input) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28, input });
  const names = git(['ls-tree', '-r', '--name-only', rev, '--', MIG_DIR, NOTES_DIR, RETIRED_DIR, LEGACY_JSON]).toString('utf8').split('\n').filter(Boolean);
  if (names.includes(LEGACY_JSON) && !names.includes(CHAIN_FILE)) return JSON.parse(git(['show', `${rev}:${LEGACY_JSON}`]).toString('utf8'));
  const want = names.filter((n) => n.startsWith(`${NOTES_DIR}/`));
  /* one `cat-file --batch` for every sidecar: "<sha> blob <bytes>\n<bytes>\n" each, sized in BYTES */
  const out = git(['cat-file', '--batch'], want.map((n) => `${rev}:${n}\n`).join(''));
  const blobs = new Map();
  let at = 0;
  for (const n of want) {
    const nl = out.indexOf(0x0a, at);
    const size = Number(out.subarray(at, nl).toString('utf8').split(' ')[2]);
    blobs.set(n, out.subarray(nl + 1, nl + 1 + size).toString('utf8'));
    at = nl + 1 + size + 1;
  }
  const tree = { chain: null, sidecars: new Map(), bad: [], legacy: names.includes(LEGACY_JSON), onDisk: [], retiredDisk: [] };
  for (const n of names) {
    const base = n.slice(n.lastIndexOf('/') + 1);
    if (n === CHAIN_FILE) tree.chain = JSON.parse(blobs.get(n));
    else if (n.startsWith(`${NOTES_DIR}/`)) tree.sidecars.set(base.slice(0, -'.json'.length), JSON.parse(blobs.get(n)));
    else if (n.startsWith(`${MIG_DIR}/`) && base.endsWith('.sql') && !n.slice(MIG_DIR.length + 1).includes('/')) tree.onDisk.push(base);
    else if (n.startsWith(`${RETIRED_DIR}/`) && base.endsWith('.sql')) tree.retiredDisk.push(base);
  }
  const { manifest, problems } = deriveApplyOrder(tree);
  if (problems.length) throw harness(`APPLY ORDER at ${rev}:\n  - ${problems.join('\n  - ')}`);
  return manifest;
}

// ── writing (the tools that make or flip a migration) ───────────────────────
/** One sidecar, in a fixed key order so a flip is a one-line diff. */
export function sidecarText(sc) {
  const out = {};
  for (const k of ['seq', 'pre_schema', 'excluded', 'retired', 'note']) if (sc[k] !== undefined) out[k] = sc[k];
  return `${JSON.stringify(out, null, 2)}\n`;
}
export function readSidecar(root, file) {
  const p = join(root, NOTES_DIR, noteFileOf(file));
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
export function writeSidecar(root, file, sc) {
  writeFileSync(join(root, NOTES_DIR, noteFileOf(file)), sidecarText(sc));
}

/** The next free sequence on this tree: one more than every sequence-named file (chain, excluded or retired). */
export function nextSeq(root = ROOT) {
  const tree = readTree(root);
  let max = SEQ_FLOOR - 1;
  for (const f of [...tree.onDisk, ...tree.retiredDisk]) { const s = seqOfName(f); if (s !== null && s > max) max = s; }
  return max + 1;
}

/** `NNNN-<slug>.sql` (or `.generated.sql`) at the next free sequence. */
export function nextMigrationName(root, slug, { generated = false } = {}) {
  if (!SLUG.test(slug)) throw harness(`slug "${slug}": lower-case words ([a-z0-9_]) joined by single hyphens, starting with a letter`);
  return `${nextSeq(root)}-${slug}${generated ? '.generated' : ''}.sql`;
}

/**
 * Register a NEW migration's apply note (its sidecar). Refuses a name that is not sequence-named
 * and a sidecar that already exists.
 */
export function registerNew(root, file, note) {
  if (!isSeqName(file)) throw harness(`${file}: new migrations are sequence-named (node tools/new-migration.mjs <slug>)`);
  if (readSidecar(root, file)) throw harness(`${NOTES_DIR}/${noteFileOf(file)} already exists`);
  if (typeof note !== 'string' || !note.trim()) throw harness(`${file}: a new migration needs its apply note (STAGED, NOT APPLIED …)`);
  writeSidecar(root, file, { note });
}

/**
 * The Coordinator's flip after an apply: `APPLIED <date> by the Coordinator (<evidence>). Was: <old note>`.
 * Refuses a file whose note already leads with APPLIED (a second flip would bury the first).
 */
export function markApplied(root, file, evidence, date = new Date().toISOString().slice(0, 10)) {
  const sc = readSidecar(root, file);
  if (!sc) throw harness(`${file} has no sidecar (${NOTES_DIR}/${noteFileOf(file)})`);
  if (sc.retired) throw harness(`${file} is retired; it is not applied again`);
  const old = Array.isArray(sc.note) ? sc.note.join(' ') : String(sc.note || '');
  if (/^\s*APPLIED\b/.test(old)) throw harness(`${file}'s note already leads with APPLIED`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw harness('date is YYYY-MM-DD');
  if (!evidence || !String(evidence).trim()) throw harness('the flip carries its evidence (what was read back after the apply)');
  sc.note = `APPLIED ${date} by the Coordinator (${String(evidence).trim()}).${old ? ` Was: ${old}` : ''}`;
  writeSidecar(root, file, sc);
  return sc.note;
}
