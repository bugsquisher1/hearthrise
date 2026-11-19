#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-outfits.mjs — GENERATE THE SERVER OUTFIT CATALOGUE (character window).
//
// src/data/outfits.js is the single source of the outfits (id, premium, the
// regions its masks define, the bundle or the faction pieces that own an earned
// one, and the staged faction looks whose sheets have not landed) and
// src/styles/tokens.css of the dye colours (--dye-0 .. --dye-{DYE_COUNT-1}).
// Postgres must know them to enforce what only it can: that a saved outfit
// exists and is owned (premium, a bundle used, every faction piece claimed),
// that a dye names one of the outfit's regions and one of the dyes. Emitted here
// as `hr_outfits` / `hr_outfit_dyes`; a new outfit is a data row + this regen.
//
//   Regenerate:  node tools/gen-outfits.mjs
//   Verify:      node tools/gen-outfits.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-outfits.mjs --selftest  (the refusals bite)
//
// THE ROWS ARE UPSERTED, NEVER DELETED AND REINSERTED: player_outfits points at
// hr_outfits (on delete set null), so a delete-and-insert regen would undress
// every character. An outfit removed from the data is deleted (its wearers go
// back to their role's look); every other row is updated in place.
//
// REFUSES (throws, nothing written): an outfit with no sprite, a bad id, a
// region with no label or more regions than mask colours, a dye token that is
// missing or not #rrggbb, a dye that is not a world palette colour, a look naming
// a piece src/data/factions.js FACTION_OUTFITS lacks or pieces of two sides, or
// a faction piece no look is owned by (a claim that would dress nothing).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* THE FORWARD FILE (lane/c-faction-outfit-path): 2027-04-30-sweeps-coat-outfits-catalogue.generated.sql is APPLIED history; this one
   carries every row again plus the faction looks with the pieces each needs, and applies right after 2027-05-19-faction-outfit-path.sql
   (its §0 refuses before it: under the reader before that file, every hero would own every faction look). */
export const OUT_FILE = '2027-05-19-faction-outfit-path-outfits-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);

/** The dye colours from the token sheet, index by index. */
export function dyesFrom(tokensCss, count) {
  return Array.from({ length: count }, (_, i) => {
    const m = tokensCss.match(new RegExp('--dye-' + i + ':\\s*(#[0-9a-fA-F]{6})\\b'));
    if (!m) throw new Error('gen-outfits: no --dye-' + i + ' token in src/styles/tokens.css');
    return m[1].toLowerCase();
  });
}

/**
 * Every problem between the looks' pieces and the faction pieces (src/data/factions.js FACTION_OUTFITS), as strings. Empty = holds. Pure.
 * @param {Array<[string, {pieces?: readonly string[]|null}]>} looks  every row the catalogue writes
 * @param {Record<string, {side: string}>} factionPieces
 */
export function lookPieceProblems(looks, factionPieces) {
  const out = [];
  const named = new Set();
  for (const [id, r] of looks) {
    if (!r.pieces) continue;
    for (const p of r.pieces) { named.add(p); if (!Object.hasOwn(factionPieces, p)) out.push(id + ': ' + p + ' is no faction piece (factions.js FACTION_OUTFITS)'); }
    if (new Set(r.pieces.map((p) => factionPieces[p] && factionPieces[p].side)).size > 1) out.push(id + ': its pieces are of two sides');
  }
  for (const p of Object.keys(factionPieces)) if (!named.has(p)) out.push(p + ': a faction piece no look is owned by, so its claim would dress nothing');
  return out;
}

/** The rows the catalogue writes, in order: the listed outfits, then the staged faction looks (no sheet yet, so no regions). */
export function lookRows(O) {
  return [...O.OUTFIT_IDS.map((id) => [id, O.OUTFIT_ROWS[id]]),
    ...Object.entries(O.STAGED_OUTFITS || {}).map(([id, pieces]) => [id, { premium: false, regions: [], bundle: null, pieces }])];
}

/** The generated SQL for these rows. Throws on anything the server would have to guess about. */
export function buildSql(O, dyes, palette, factionPieces) {
  const problems = O.validate();
  if (problems.length) throw new Error('gen-outfits: src/data/outfits.js is invalid: ' + problems.join('; '));
  const pal = new Set(Object.values(palette.ramps).flat().map((h) => h.toLowerCase()));
  for (const h of dyes) if (!pal.has(h)) throw new Error('gen-outfits: the dye ' + h + ' is not a world palette colour');
  /* A BUNDLE OUTFIT (src/data/outfits.js `bundle`, the Key Warden) is emitted WITH its bundle: hr_outfit_owned owns it only for a hero
     that used the bundle (2027-04-30-sweeps-coat.sql). A FACTION LOOK (`pieces`, and every staged look) is emitted WITH its pieces:
     hr_outfit_owned owns it only for a hero holding every one (2027-05-19-faction-outfit-path.sql). §0 below refuses this file until
     that body is the live one. */
  const looks = lookRows(O);
  const ids = looks.map(([id]) => id);
  for (const id of ids) if (!/^[a-z0-9_]{1,32}$/.test(id)) throw new Error('gen-outfits: bad outfit id ' + id);
  if (new Set(ids).size !== ids.length) throw new Error('gen-outfits: an outfit id is written twice');
  const lp = lookPieceProblems(looks, factionPieces || {});
  if (lp.length) throw new Error('gen-outfits: the faction looks and src/data/factions.js disagree: ' + lp.join('; '));
  const rowOf = Object.fromEntries(looks);
  const bundleOf = (id) => rowOf[id].bundle || null;
  const piecesOf = (id) => rowOf[id].pieces || null;
  const rows = ids.map((id, i) => "  ('" + id + "', " + rowOf[id].premium + ", '{" + rowOf[id].regions.join(',') + "}', " + (i + 1)
    + ', ' + (bundleOf(id) ? "'" + bundleOf(id) + "'" : 'null') + ', ' + (piecesOf(id) ? "'{" + piecesOf(id).join(',') + "}'" : 'null') + ')');
  const bundles = ids.filter(bundleOf).map((id) => id + ':' + bundleOf(id)).sort().join('|');
  const pieced = ids.filter(piecesOf).sort().map((id) => id + ':' + piecesOf(id).join('+')).join('|');
  const dyeRows = dyes.map((h, i) => '  (' + i + ", '" + h + "')");
  return `-- ════════════════════════════════════════════════════════════════════════
-- GENERATED by tools/gen-outfits.mjs from src/data/outfits.js and the --dye-N
-- tokens of src/styles/tokens.css. Do not hand-edit:
--   Any hand edit FAILS \`node tools/gen-outfits.mjs --check\`.
-- The outfit catalogue (hr_outfits) and the dyes (hr_outfit_dyes) the Character
-- window's outfit save and hr_hero_colors_set are checked against. Cosmetic: nothing here moves value.
-- THE FORWARD FILE (lane/c-faction-outfit-path, 2026-11-18): 2027-04-30-sweeps-coat-outfits-catalogue.generated.sql is APPLIED history;
-- this carries every row again plus each FACTION LOOK with the pieces it needs (hr_outfits.pieces: the Flamebearer and the Emberkeeper,
-- alone and with each set of their add-ons, owned only by a hero holding every piece; staged, so no sheet and no regions yet). STAGED,
-- NOT APPLIED. ORDER: right after 2027-05-19-faction-outfit-path.sql, which adds the column and makes hr_outfit_owned read the claims;
-- §0 refuses before it, because under the old body every hero would own every faction look.
-- Rows are UPSERTED (player_outfits references hr_outfits); a removed row is
-- deleted. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

do $mig$
begin
  if to_regclass('public.hr_outfits') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_outfits' and column_name = 'bundle')
     or strpos((select prosrc from pg_proc where oid = 'public.hr_outfit_owned(uuid,integer)'::regprocedure), 'player_cosmetics') = 0 then
    raise exception 'PRECONDITION: apply 2027-04-30-sweeps-coat.sql first (hr_outfits.bundle, and hr_outfit_owned owning a bundle outfit only for the hero that used its bundle: before it, every hero would own one)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_outfits' and column_name = 'pieces')
     or strpos((select prosrc from pg_proc where oid = 'public.hr_outfit_owned(uuid,integer)'::regprocedure), 'hr_faction_claims') = 0
     or to_regclass('public.hr_faction_outfits') is null then
    raise exception 'PRECONDITION: apply 2027-05-19-faction-outfit-path.sql first (hr_outfits.pieces, and hr_outfit_owned owning a faction look only for the hero holding every piece: before it, every hero would own one)'; end if;
end $mig$;

create table if not exists public.hr_outfits (
  outfit_id text primary key check (outfit_id ~ '^[a-z0-9_]{1,32}$'),
  premium   boolean not null,
  regions   text[]  not null default '{}' check (cardinality(regions) <= 8),
  sort      int     not null
);
create table if not exists public.hr_outfit_dyes (
  idx int  primary key check (idx between 0 and 63),
  hex text not null check (hex ~ '^#[0-9a-f]{6}$')
);
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hr_outfits', 'hr_outfit_dyes'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $mig$;

insert into public.hr_outfits (outfit_id, premium, regions, sort, bundle, pieces) values
${rows.join(',\n')}
  on conflict (outfit_id) do update set premium = excluded.premium, regions = excluded.regions, sort = excluded.sort, bundle = excluded.bundle,
    pieces = excluded.pieces;
delete from public.hr_outfits where outfit_id <> all (array[${ids.map((id) => "'" + id + "'").join(', ')}]);

insert into public.hr_outfit_dyes (idx, hex) values
${dyeRows.join(',\n')}
  on conflict (idx) do update set hex = excluded.hex;
delete from public.hr_outfit_dyes where idx >= ${dyes.length};

-- SELF-CHECK (CLAUDE.md §4): the rows are exactly the data's; each bundle outfit carries its bundle, a tradeable item, and is owned by
-- no hero that never used it; each faction look carries its pieces, every one a piece of the faction catalogue and every piece of it
-- dressing a look, and is owned by no hero that claimed none (executed: a hero no row names); no client reaches them.
do $$
declare v_role text;
begin
  if (select count(*) from public.hr_outfits) <> ${ids.length} or (select count(*) from public.hr_outfit_dyes) <> ${dyes.length}
     or (select count(*) from public.hr_outfits where premium) <> ${ids.filter((id) => rowOf[id].premium).length} then
    raise exception 'outfits-catalogue: the rows are not the generated set'; end if;
  if (select string_agg(outfit_id || ':' || bundle, '|' order by outfit_id || ':' || bundle collate "C") from public.hr_outfits where bundle is not null)
     is distinct from ${bundles ? "'" + bundles + "'" : 'null'} then
    raise exception 'outfits-catalogue: the bundle outfits are not the data''s'; end if;
  if exists (select 1 from public.hr_outfits o where o.bundle is not null
              and not exists (select 1 from public.hr_items i where i.item_id = o.bundle and i.tradeable and i.value > 0)) then
    raise exception 'outfits-catalogue: a bundle names no tradeable hr_items row of book value'; end if;
  if exists (select 1 from public.hr_outfits o where o.bundle is not null
              and o.outfit_id = any (public.hr_outfit_owned('00000000-0000-4000-8000-0000005c0a70'::uuid, 0))) then
    raise exception 'outfits-catalogue: a hero that used no bundle owns a bundle outfit'; end if;
  if (select string_agg(outfit_id || ':' || array_to_string(pieces, '+'), '|' order by outfit_id collate "C") from public.hr_outfits where pieces is not null)
     is distinct from ${pieced ? "'" + pieced + "'" : 'null'} then
    raise exception 'outfits-catalogue: the faction looks are not the data''s'; end if;
  if exists (select 1 from public.hr_outfits o cross join lateral unnest(o.pieces) p(piece_id)
              where not exists (select 1 from public.hr_faction_outfits f where f.piece_id = p.piece_id))
     or exists (select 1 from public.hr_faction_outfits f where not exists (select 1 from public.hr_outfits o where f.piece_id = any (o.pieces))) then
    raise exception 'outfits-catalogue: a look names a piece the faction catalogue lacks, or a claimable piece dresses no look'; end if;
  if exists (select 1 from public.hr_outfits o where o.pieces is not null
              and o.outfit_id = any (public.hr_outfit_owned('00000000-0000-4000-8000-0000005c0a70'::uuid, 0))) then
    raise exception 'outfits-catalogue: a hero that claimed no piece owns a faction look'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_outfits', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_outfit_dyes', 'select,insert,update,delete') then
      raise exception 'outfits-catalogue: % reaches the catalogue', v_role; end if;
  end loop;
  raise notice 'outfits-catalogue: ${ids.length} outfits, ${dyes.length} dyes; all green';
end $$;
`;
}

async function inputs(root) {
  const O = await import(pathToFileURL(join(root, 'src', 'data', 'outfits.js')).href);
  const { FACTION_OUTFITS } = await import(pathToFileURL(join(root, 'src', 'data', 'factions.js')).href);
  const tokens = await readFile(join(root, 'src', 'styles', 'tokens.css'), 'utf8');
  const palette = JSON.parse(await readFile(join(root, 'art', 'world', 'palette.json'), 'utf8'));
  return { O, dyes: dyesFrom(tokens, O.DYE_COUNT), palette, F: FACTION_OUTFITS };
}

async function selftest() {
  const { O, dyes, palette, F } = await inputs(ROOT);
  let bad = 0;
  /* a refusal must throw, and for the reason named when `why` is given (not some other refusal first) */
  const expectThrow = (name, fn, why) => {
    try { fn(); console.error('  MISSED  ' + name); bad++; } catch (e) {
      if (why && !why.test(String(e.message))) { console.error('  MISSED  ' + name + ' (it threw for another reason: ' + e.message + ')'); bad++; } else console.log('  caught  ' + name);
    }
  };
  expectThrow('a dye outside the world palette', () => buildSql(O, dyes.slice(0, -1).concat(['#123456']), palette, F));
  expectThrow('a missing dye token', () => dyesFrom('--dye-0: #2f2723;', 2));
  const bent = { ...O, validate: () => ['witch: region cape has no label'] };
  expectThrow('an invalid outfit row', () => buildSql(bent, dyes, palette, F));
  const idBad = { ...O, OUTFIT_IDS: ['Bad Id'], OUTFIT_ROWS: { 'Bad Id': { premium: false, regions: [] } } };
  expectThrow('a bad outfit id', () => buildSql(idBad, dyes, palette, F));
  /* THE FACTION LOOKS AGAINST THE FACTION DATA: a look names only real pieces, of one side; every claimable piece dresses a look */
  expectThrow('a look naming a piece the faction data lacks', () => buildSql({ ...O, STAGED_OUTFITS: { ...O.STAGED_OUTFITS, ghost: ['zz_nothing'] } }, dyes, palette, F), /ghost: zz_nothing is no faction piece/);
  expectThrow('a look of two sides', () => buildSql({ ...O, STAGED_OUTFITS: { ...O.STAGED_OUTFITS, mixed: ['flamebearer', 'emberkeeper'] } }, dyes, palette, F), /mixed: its pieces are of two sides/);
  expectThrow('a faction piece no look dresses', () => buildSql(O, dyes, palette, { ...F, zz_extra: { side: 'first_flame', hours: 1 } }), /zz_extra: a faction piece no look is owned by/);
  expectThrow('a look written twice', () => buildSql({ ...O, STAGED_OUTFITS: { ...O.STAGED_OUTFITS, knight: ['flamebearer'] } }, dyes, palette, F), /written twice/);
  if (!/on conflict \(outfit_id\) do update/.test(buildSql(O, dyes, palette, F))) { console.error('  MISSED  the rows are not upserted'); bad++; }
  /* a bundle outfit is written WITH its bundle, never as a free row, and the file refuses to land before hr_outfit_owned reads bundles */
  const bundled = Object.keys(O.OUTFIT_ROWS).filter((id) => O.OUTFIT_ROWS[id].bundle);
  const sql = buildSql(O, dyes, palette, F);
  const freeRowIn = (text, id) => new RegExp("\\('" + id + "', (true|false), '\\{[a-z,]*\\}', \\d+, null, null\\)").test(text);
  const withBundle = (id) => sql.includes(", '" + O.OUTFIT_ROWS[id].bundle + "', null)");
  if (!bundled.length || bundled.some((id) => freeRowIn(sql, id) || !withBundle(id)) || !sql.includes("'player_cosmetics') = 0 then")) {
    console.error('  MISSED  a bundle outfit reached hr_outfits as a free row, or the file lands before hr_outfit_owned reads bundles'); bad++;
  } else console.log('  caught  a bundle outfit carries its bundle, behind the owned-list precondition');
  const unbundled = { ...O, OUTFIT_ROWS: Object.fromEntries(Object.entries(O.OUTFIT_ROWS).map(([id, r]) => [id, { ...r, bundle: null }])) };
  const plain = buildSql(unbundled, dyes, palette, F);
  if (bundled.some((id) => !freeRowIn(plain, id))) { console.error('  MISSED  the free-row probe reads nothing'); bad++; }
  else console.log('  caught  the free-row probe sees a bundle outfit written without its bundle');
  /* a faction look is written WITH its pieces, never as a free row, and the file refuses to land before hr_outfit_owned reads claims */
  const looks = lookRows(O).filter(([, r]) => r.pieces).map(([id, r]) => [id, r.pieces]);
  const withPieces = (id, pieces) => sql.includes(", '{" + pieces.join(',') + "}')");
  if (looks.length < 2 || looks.some(([id, pieces]) => freeRowIn(sql, id) || !withPieces(id, pieces)) || !sql.includes("'hr_faction_claims') = 0")) {
    console.error('  MISSED  a faction look reached hr_outfits as a free row, or the file lands before hr_outfit_owned reads the claims'); bad++;
  } else console.log('  caught  a faction look carries its pieces, behind the claims precondition');
  const unpieced = { ...O, STAGED_OUTFITS: {}, OUTFIT_IDS: [...O.OUTFIT_IDS, ...looks.map(([id]) => id)],
    OUTFIT_ROWS: { ...O.OUTFIT_ROWS, ...Object.fromEntries(looks.map(([id]) => [id, { premium: false, regions: [], bundle: null, pieces: null }])) } };
  const loose = buildSql(unpieced, dyes, palette, {});
  if (looks.some(([id]) => !freeRowIn(loose, id))) { console.error('  MISSED  the free-row probe reads no faction look'); bad++; }
  else console.log('  caught  the free-row probe sees a faction look written without its pieces');
  if (bad) { console.error('gen-outfits --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-outfits --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const { O, dyes, palette, F } = await inputs(ROOT);
  const wanted = buildSql(O, dyes, palette, F);
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) {
      console.error('gen-outfits --check FAILED: ' + OUT_FILE + ' is stale. Run: node tools/gen-outfits.mjs');
      process.exit(1);
    }
    console.log('gen-outfits --check: catalogue matches src/data/outfits.js and the --dye-N tokens');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-outfits: wrote ' + OUT_FILE);
}

if (isMain(import.meta.url)) main();
