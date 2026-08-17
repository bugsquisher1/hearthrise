// ============================================================================
// tests/items-catalogue.mjs — SECURITY CONDITION S5:
//   src/data/items.js  ⊆  hr_items
//
// Spec: docs/design/live-settlement.md §10 PHASE 2. Run as a preflight from
// tests/run-smoke.mjs, alongside versionQueryGuard() and the catalogue drift
// check, because it must fail a BUILD rather than a migration nobody re-applies.
//
// ── WHY THIS IS A PRECONDITION OF THE FLIP, AND NOT HOUSEKEEPING ────────────
// Before the flip an item the server has never heard of is harmless: the b359
// max-merge treats an omitted key as UNKNOWN, so the client's stack survives.
// After the flip the envelope is a COMPLETE statement of the bag and omission
// means ZERO. So an item id that exists in src/data/items.js and not in
// hr_items is no longer a display curiosity — the first settle after a player
// picks one up DELETES IT FROM EVERY BAG THAT HOLDS IT, silently, and the
// deletion is indistinguishable from the server correctly disagreeing.
//
// That is not hypothetical: it is b361 with the nouns changed. Stonemason
// shipped minutes before its hr_skills row and bricked two live players' accrue
// keys. §5.3's first stated deviation keeps SKILLS safe from exactly that by
// leaving an omitted skill alone; `hr_items` gets no such amnesty, deliberately
// — an absent item row genuinely means an empty stack, which is the property
// that closes the b362 faucet. This guard is what makes that property TRUE.
//
// ── WHY IT IS NOT THE SAME CHECK AS `gen-catalogues.mjs --check` ────────────
// The drift check regenerates the SQL and compares it to the file, so both
// sides of its comparison come out of the SAME generator. It proves the file is
// what the generator currently emits — and it would go on passing if the
// generator learnt to skip a class of item (a filter, a `tradeable` predicate,
// a try/catch around one import). This reads the two artefacts INDEPENDENTLY:
// the ids come from importing src/data/items.js as a module, the rows come from
// parsing the shipped .sql as text. Neither can vouch for the other.
//
// ── DIRECTION, STATED ───────────────────────────────────────────────────────
// One-way on purpose: every authored item must be in the catalogue. The reverse
// (a row for an id no longer authored) is NOT a failure here — it is a stale
// row that no envelope can name, it deletes nothing, and it is what a
// re-applied migration lagging a deleted item looks like. `gen-catalogues
// --check` already covers the exact-equality question.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
export const CATALOGUE_SQL = join('supabase', 'migrations', '2026-08-11-catalogue.generated.sql');

/**
 * The item ids the generated migration actually INSERTS into hr_items.
 * Parsed from the text, never from the generator.
 *
 * Anchored on the `insert into public.hr_items (` statement and stopped at its
 * terminating `;` so a later statement that happens to mention an item id
 * (hr_item_slots, the starting-inventory self-check) cannot pad the set and
 * make a missing row look present.
 */
export function itemIdsInSql(sql) {
  const text = String(sql || '');
  const start = text.indexOf('insert into public.hr_items (');
  if (start < 0) return { ok: false, why: 'no `insert into public.hr_items (` statement', ids: new Set() };
  const valuesAt = text.indexOf(' values', start);
  if (valuesAt < 0) return { ok: false, why: 'the hr_items insert has no VALUES list', ids: new Set() };
  const end = text.indexOf(';', valuesAt);
  if (end < 0) return { ok: false, why: 'the hr_items insert is unterminated', ids: new Set() };
  const body = text.slice(valuesAt, end);
  const ids = new Set();
  const re = /\(\s*'([^']+)'\s*,/g;
  let m;
  while ((m = re.exec(body)) !== null) ids.add(m[1]);
  return { ok: true, ids };
}

/** @returns string[] of problems — empty is green. */
export async function itemsCatalogueGuard(opts) {
  const o = opts || {};
  const problems = [];
  const sqlPath = o.sqlPath || join(ROOT, CATALOGUE_SQL);
  let sql = '';
  try { sql = await readFile(sqlPath, 'utf8'); }
  catch (e) {
    return { problems: [`could not read ${CATALOGUE_SQL} — the server's item allowlist is the thing this guard `
      + 'exists to compare against, so an unreadable one is a failure, never a skip'], note: '' };
  }
  const parsed = itemIdsInSql(sql);
  if (!parsed.ok) {
    return { problems: [`${CATALOGUE_SQL}: ${parsed.why} — the guard could not see the catalogue and must not `
      + 'report green on nothing'], note: '' };
  }

  const modUrl = o.itemsUrl || pathToFileURL(join(ROOT, 'src', 'data', 'items.js')).href;
  let ITEMS = null;
  try { ({ ITEMS } = await import(modUrl)); }
  catch (e) { return { problems: [`could not import src/data/items.js: ${e && e.message}`], note: '' }; }
  if (!ITEMS || typeof ITEMS !== 'object') {
    return { problems: ['src/data/items.js did not export an ITEMS object'], note: '' };
  }

  const authored = Object.keys(ITEMS);
  /* VACUITY FIRST. "every id is present" also passes against an empty set, and
     an import that silently produced `{}` is exactly how this family of guard
     has failed eleven times in this repo. */
  if (authored.length < 100) {
    problems.push(`only ${authored.length} authored item(s) were read — the guard is checking nothing`);
  }
  if (parsed.ids.size < 100) {
    problems.push(`only ${parsed.ids.size} hr_items row(s) were parsed out of ${CATALOGUE_SQL} — the guard `
      + 'is checking nothing');
  }

  const missing = authored.filter((id) => !parsed.ids.has(id));
  if (missing.length) {
    problems.push(
      `${missing.length} item id(s) exist in src/data/items.js but have NO hr_items row: `
      + missing.slice(0, 12).join(', ') + (missing.length > 12 ? `, +${missing.length - 12} more` : '')
      + '. Under the absolute envelope (live-settlement.md §5.3) an item the server does not know is '
      + 'OMITTED from every envelope, and omission means zero — so the first settle after any player picks '
      + 'one up DELETES IT FROM THEIR BAG. Regenerate with `node tools/gen-catalogues.mjs --write` and '
      + 're-apply supabase/migrations/2026-08-11-catalogue.generated.sql BEFORE this build reaches clients.');
  }
  return {
    problems,
    note: `${authored.length} authored items ⊆ ${parsed.ids.size} hr_items rows`,
  };
}

/* ── ITEMS-CATALOGUE-GUARD — THE GUARD, GRADED ─────────────────────────────
   `--check passes` proves nothing by itself; this repo's own rule
   (tests/rpc-resolution.mjs, tests/shop-drift-guard.mjs) is that a probe which
   cannot demonstrate it can SEE failure is treated as broken rather than as a
   pass. So: a green control first, then two mutations in the two directions the
   guard is supposed to care about, each on a COPY — nothing in the repo is
   touched.

     1. an item authored with no catalogue row  → RED   (the S5 condition)
     2. a catalogue whose hr_items insert is unreadable → RED (not a silent skip)

   And one NON-mutation that must stay green, because a guard that fires on it
   would be un-shippable: a catalogue row for an id nobody authors any more. */
export async function itemsCatalogueMutationGuard() {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const problems = [];

  const control = await itemsCatalogueGuard();
  if (control.problems.length) {
    return { problems: ['the CONTROL is already red, so no mutation below proves anything: '
      + control.problems.join(' | ')], note: '' };
  }

  const dir = await mkdtemp(join(tmpdir(), 'hr-items-s5-'));
  const realItems = pathToFileURL(join(ROOT, 'src', 'data', 'items.js')).href;

  // 1. AN ITEM THE SERVER HAS NEVER HEARD OF.
  const fakePath = join(dir, 'items-with-a-fake.mjs');
  await writeFile(fakePath,
    `import { ITEMS as REAL } from ${JSON.stringify(realItems)};\n`
    + "export const ITEMS = { ...REAL, hr_s5_fake_item: { n: 'S5 Fake', v: 1 } };\n", 'utf8');
  const mutated = await itemsCatalogueGuard({ itemsUrl: pathToFileURL(fakePath).href });
  if (!mutated.problems.some((p) => /hr_s5_fake_item/.test(p))) {
    problems.push('adding an item id with no hr_items row did NOT fail the guard — S5 is decorative, and '
      + 'under the absolute envelope that item would be deleted from every bag at the first settle');
  }

  // 2. AN UNREADABLE CATALOGUE MUST NOT READ AS "NOTHING MISSING".
  const blindPath = join(dir, 'catalogue-without-the-insert.sql');
  const real = await readFile(join(ROOT, CATALOGUE_SQL), 'utf8');
  await writeFile(blindPath, real.replace('insert into public.hr_items (', 'insert into public.NOT_hr_items ('), 'utf8');
  const blind = await itemsCatalogueGuard({ sqlPath: blindPath });
  if (!blind.problems.length) {
    problems.push('a catalogue with no readable hr_items insert passed — the guard reports green when it '
      + 'cannot see the thing it grades, which is this repo\'s signature failure');
  }

  // 3. THE NON-MUTATION. A stale row deletes nothing and must not fail a build.
  const staleItems = join(dir, 'items-missing-one.mjs');
  await writeFile(staleItems,
    `import { ITEMS as REAL } from ${JSON.stringify(realItems)};\n`
    + 'const { ...rest } = REAL; delete rest[Object.keys(rest)[0]];\n'
    + 'export const ITEMS = rest;\n', 'utf8');
  const stale = await itemsCatalogueGuard({ itemsUrl: pathToFileURL(staleItems).href });
  if (stale.problems.length) {
    problems.push('an hr_items row for an id nobody authors any more failed the guard — that is a stale row, '
      + 'not a deletion, and failing on it would block every item removal: ' + stale.problems.join(' | '));
  }

  return { problems, note: '3 mutations graded (missing row RED, blind catalogue RED, stale row GREEN)' };
}

export default itemsCatalogueGuard;
