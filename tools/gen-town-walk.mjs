#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-town-walk.mjs — GENERATE THE TOWN'S WALK MASK FOR THE SERVER.
//
// A hero's tile in town is drawn for every other player (hr_town_view), and
// until 2027-04-02 the server stored whatever tile inside the map's rectangle
// a client published (hr_town_move: audit 2026-11-09 F10, "a forged client can
// stand in walls"). Postgres must know where a hero can stand to refuse that.
// The one source is the map the World draws: the town map rows
// (src/data/world/maps), compiled by src/world/core/map-compile.js exactly as
// the browser compiles them. A tile is ON the mask when it is open AND a hero
// can walk to it from the map's start (the same rule as a stand in
// tools/gen-town-stations.mjs, and the only tiles an honest client's feet
// reach: src/world/steer-local.js). Emitted here as:
//   hr_town_walk        one row a town map: w, h, the mask (bit y*w + x, from each
//                       byte's low bit: PostgreSQL get_bit), how many tiles are open,
//                       and the collision-mask hash of the map row it was cut from
//   hr_town_walk_ok()   THE ONE READER: may a hero stand on (x, y) walking to (gx, gy)?
//                       null when the map has no mask (the caller refuses)
//
//   Regenerate:  node tools/gen-town-walk.mjs
//   Verify:      node tools/gen-town-walk.mjs --check     (exit 1 on drift: the twin guard)
//   Selftest:    node tools/gen-town-walk.mjs --selftest  (every refusal bites, the packing round-trips)
//
// A CHANGED TOWN MAP (anything that moves what blocks a step) is a NEW dated
// file: move OUT_FILE, regenerate, and apply it BEFORE the client that draws
// the new map ships (CLAUDE.md §3.3 lane C), or honest heroes on a newly opened
// tile are refused `off_mask` until it lands. --check fails until it is done.
//
// REFUSES (throws, nothing written): no town map; a map wider or taller than 256;
// a map whose row states another maskHash than it compiles to (the row is what
// the client believes); a start a hero cannot stand on; a map with no open tile.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { compiledFrom } from './gen-town-stations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* The dated file this generator writes. A map that blocks other tiles is a new dated file; an applied one stays as history. */
export const OUT_FILE = '2027-04-02-town-walk-mask.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** The walk mask of a compiled map: 1 per tile a hero may stand on (open, and walked to from the start). */
export function walkMask(m) {
  const out = new Uint8Array(m.w * m.h);
  for (let i = 0; i < out.length; i++) out[i] = m.mask[i] === 0 && m.reach[i] ? 1 : 0;
  return out;
}

/** Bits to bytes the way PostgreSQL's get_bit reads them: bit n is byte n >> 3, counted from that byte's LOW bit. */
export function pack(bits) {
  const bytes = new Uint8Array((bits.length + 7) >> 3);
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3] |= 1 << (i & 7);
  return bytes;
}
/** pack's inverse (get_bit in JS), for the guards. */
export function bitAt(bytes, n) { return (bytes[n >> 3] >> (n & 7)) & 1; }
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The catalogue rows for the town maps, validated.
 * @param {object[]} towns  map rows of kind 'town' (src/data/world/maps WORLD_MAPS)
 * @param {(id: string) => object} compiled  tools/gen-town-stations.mjs compiledFrom()
 */
export function catalogue(towns, compiled) {
  const problems = [];
  const rows = [];
  if (!towns.length) problems.push('no kind:\'town\' map row');
  for (const row of towns) {
    const m = compiled(row.id);
    if (!/^[a-z0-9_]{1,40}$/.test(row.id)) { problems.push('map id ' + row.id + ' is not a server id'); continue; }
    if (m.w < 1 || m.w > 256 || m.h < 1 || m.h > 256) { problems.push(row.id + ' is ' + m.w + 'x' + m.h + ', outside the server\'s 256x256'); continue; }
    if (m.maskHash !== row.maskHash) problems.push(row.id + ' states maskHash ' + row.maskHash + ' and compiles to ' + m.maskHash + ' (node tests/world-core.mjs --hashes)');
    const bits = walkMask(m);
    const open = bits.reduce((n, b) => n + b, 0);
    if (!open) { problems.push(row.id + ' has no tile a hero can stand on'); continue; }
    if (!m.start || !bits[m.start[1] * m.w + m.start[0]]) problems.push(row.id + '\'s start ' + JSON.stringify(m.start) + ' is not a tile a hero can stand on');
    /* PROBES the self-check asks the reader, so a transposed or bit-reversed read is refused at apply: the first and the
       last open tile, the start, and the first blocked tile after each of them in reading order. */
    const at = (i) => [i % m.w, (i - (i % m.w)) / m.w];
    const firstOpen = bits.indexOf(1), lastOpen = bits.lastIndexOf(1);
    const on = [firstOpen, lastOpen, m.start[1] * m.w + m.start[0]];
    const off = on.map((i) => { for (let k = 1; k < bits.length; k++) { const j = (i + k) % bits.length; if (!bits[j]) return j; } return -1; }).filter((j) => j >= 0);
    rows.push({ id: row.id, w: m.w, h: m.h, bits, bytes: pack(bits), open, hash: m.maskHash,
      on: Array.from(new Set(on)).map(at), off: Array.from(new Set(off)).map(at) });
  }
  if (problems.length) throw new Error('gen-town-walk: ' + problems.join('; '));
  return rows;
}

/** The generated SQL. */
export function buildSql(rows) {
  const maskLit = (bytes) => {
    const h = hex(bytes), lines = [];
    for (let i = 0; i < h.length; i += 96) lines.push('    ' + lit(h.slice(i, i + 96)));
    return 'decode(\n' + lines.join(' ||\n') + ',\n    \'hex\')';
  };
  const values = rows.map((r) => `  (${lit(r.id)}, ${r.w}, ${r.h}, ${r.open}, ${lit(r.hash)}, ${maskLit(r.bytes)})`).join(',\n');
  const ids = 'array[' + rows.map((r) => lit(r.id)).join(', ') + ']::text[]';
  const probes = rows.flatMap((r) => [...r.on.map(([x, y]) => `(${lit(r.id)}, ${x}, ${y}, true)`), ...r.off.map(([x, y]) => `(${lit(r.id)}, ${x}, ${y}, false)`)]).join(', ');
  const sizes = rows.map((r) => `${r.id} ${r.w}x${r.h}, ${r.open} of ${r.w * r.h} tiles open (${r.hash})`).join('; ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Generated by tools/gen-town-walk.mjs from the town map rows (src/data/world/maps),
-- compiled as the World compiles them (src/world/core/map-compile.js).
-- Do not hand-edit: any hand edit FAILS \`node tools/gen-town-walk.mjs --check\`.
-- THE TOWN'S WALK MASK: where a hero may stand, for the server (audit 2026-11-09 F10;
-- lane/c-server-debt, 2026-11-10). ${sizes}.
-- A tile is ON the mask when it is open and a hero can walk to it from the map's
-- start. ROWS ONLY plus the one reader: hr_town_walk is replaced whole for the
-- generated maps; no player row, no value. hr_town_move reads it from
-- 2027-04-02-town-walk-mask.sql on. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
begin
  if to_regclass('public.hr_town_maps') is null or to_regclass('public.hr_town_stands') is null then
    raise exception 'PRECONDITION: hr_town_maps / hr_town_stands are absent (2027-01-28-town-stands.sql and the stations catalogue first)'; end if;
end $mig$;

create table if not exists public.hr_town_walk (
  map_id    text     primary key references public.hr_town_maps (map_id) on delete cascade,
  w         smallint not null check (w between 1 and 256),
  h         smallint not null check (h between 1 and 256),
  open      integer  not null check (open >= 1),                       -- how many tiles a hero may stand on
  mask_hash text     not null check (mask_hash ~ '^[0-9a-f]{8}$'),     -- the map row's collision-mask hash this was cut from
  mask      bytea    not null,                                         -- bit (y * w + x), from each byte's low bit (get_bit): 1 = may stand
  constraint hr_town_walk_size check (octet_length(mask) = (w::int * h::int + 7) / 8)
);
-- kept in the row (one page read a move), compressed if it helps: never out of line while it fits
alter table public.hr_town_walk alter column mask set storage main;
alter table public.hr_town_walk enable row level security;
revoke all on public.hr_town_walk from public, anon, authenticated, service_role;
comment on table public.hr_town_walk is
  'GENERATED by tools/gen-town-walk.mjs from the town map rows: where a hero may stand (open and walked to from the start). Read only by hr_town_walk_ok. No client grant, no policy.';

insert into public.hr_town_walk (map_id, w, h, open, mask_hash, mask) values
${values}
  on conflict (map_id) do update set w = excluded.w, h = excluded.h, open = excluded.open, mask_hash = excluded.mask_hash, mask = excluded.mask;
delete from public.hr_town_walk where map_id <> all (${ids});

-- THE ONE READER: may a hero stand on (p_x, p_y) while walking to (p_gx, p_gy)? False off the map or on a tile that
-- blocks a step; NULL when the map has no mask (the caller refuses: a position is never taken unchecked).
-- Owner-only: hr_town_move asks it from inside its definer body.
create or replace function public.hr_town_walk_ok(p_map text, p_x integer, p_y integer, p_gx integer, p_gy integer)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $fn$
  select case when p_x is null or p_y is null or p_gx is null or p_gy is null
                or p_x < 0 or p_x >= m.w or p_y < 0 or p_y >= m.h
                or p_gx < 0 or p_gx >= m.w or p_gy < 0 or p_gy >= m.h then false
              else get_bit(m.mask, p_y * m.w + p_x) = 1 and get_bit(m.mask, p_gy * m.w + p_gx) = 1 end
    from public.hr_town_walk m where m.map_id = p_map
$fn$;
revoke all on function public.hr_town_walk_ok(text, integer, integer, integer, integer) from public, anon, authenticated, service_role;
comment on function public.hr_town_walk_ok(text, integer, integer, integer, integer) is
  'tools/gen-town-walk.mjs: may a hero stand on (x, y) walking to (gx, gy) on a town map? false off the map or on a blocking tile, null when the map has no mask. Server-only.';

-- SELF-CHECK (CLAUDE.md §4), executed.
do $chk$
declare v_r record; r text; v_n int;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(r, 'public.hr_town_walk', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'town-walk: % holds a privilege on hr_town_walk', r; end if;
    if has_function_privilege(r, 'public.hr_town_walk_ok(text,integer,integer,integer,integer)', 'execute') then
      raise exception 'town-walk: % can execute hr_town_walk_ok', r; end if;
  end loop;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.hr_town_walk'::regclass) then
    raise exception 'town-walk: row level security is off on hr_town_walk'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_town_walk') then
    raise exception 'town-walk: a policy stands on hr_town_walk'; end if;
  -- every town map the server holds has its mask, of that map's size, and the mask holds the tiles the generator counted
  if exists (select 1 from public.hr_town_maps t left join public.hr_town_walk m on m.map_id = t.map_id
              where m.map_id is null or m.w <> t.w or m.h <> t.h) then
    raise exception 'town-walk: a town map has no mask, or a mask of another size: %',
      (select jsonb_agg(jsonb_build_object('map', t.map_id, 'w', t.w, 'h', t.h, 'mask', case when m.map_id is null then null else jsonb_build_array(m.w, m.h) end))
         from public.hr_town_maps t left join public.hr_town_walk m on m.map_id = t.map_id where m.map_id is null or m.w <> t.w or m.h <> t.h); end if;
  if exists (select 1 from public.hr_town_walk m where bit_count(m.mask) <> m.open) then
    raise exception 'town-walk: a mask does not hold the tiles its row counts'; end if;
  -- the reader reads the bits the generator wrote (a transposed or bit-reversed read answers these wrong)
  for v_r in select * from (values ${probes}) t(map_id, x, y, want) loop
    if public.hr_town_walk_ok(v_r.map_id, v_r.x, v_r.y, v_r.x, v_r.y) is distinct from v_r.want then
      raise exception 'town-walk: (%, %) on % reads %, the map says %', v_r.x, v_r.y, v_r.map_id, public.hr_town_walk_ok(v_r.map_id, v_r.x, v_r.y, v_r.x, v_r.y), v_r.want; end if;
  end loop;
  -- ★ EVERY STAND THE SERVER PLACES A BODY ON IS ON THE MASK: a hero set down by the server can always say where it stands
  select count(*) into v_n from public.hr_town_stands s where public.hr_town_walk_ok(s.map_id, s.x, s.y, s.x, s.y) is not true;
  if v_n > 0 then
    raise exception 'town-walk: % stand(s) are off their map''s walk mask (the stations catalogue and this one were cut from different maps): %', v_n,
      (select jsonb_agg(jsonb_build_array(s.map_id, s.station_id, s.x, s.y)) from (select * from public.hr_town_stands s
         where public.hr_town_walk_ok(s.map_id, s.x, s.y, s.x, s.y) is not true order by 1, 2, 3 limit 5) s); end if;
  -- off the map, a null and an unknown map
  select map_id into r from public.hr_town_walk order by map_id limit 1;
  if public.hr_town_walk_ok(r, -1, 0, 0, 0) is not false or public.hr_town_walk_ok(r, 0, 0, 0, 100000) is not false
     or public.hr_town_walk_ok(r, null, 0, 0, 0) is not false or public.hr_town_walk_ok('no_such_town', 0, 0, 0, 0) is not null then
    raise exception 'town-walk: a tile off the map, a null or an unknown map is not answered false / false / false / null'; end if;
  raise notice 'town-walk: ${rows.length} town map(s) masked (${sizes}); every stand is on its mask; all green';
end $chk$;
`;
}

async function inputs(root) {
  const maps = await import(pathToFileURL(join(root, 'src', 'data', 'world', 'maps', 'index.js')).href);
  return { towns: maps.WORLD_MAPS.filter((m) => m.kind === 'town'), compiled: await compiledFrom(root) };
}

async function selftest() {
  const { towns, compiled } = await inputs(ROOT);
  let bad = 0;
  const expectThrow = (name, fn, want) => {
    try { fn(); console.error('  MISSED  ' + name); bad++; }
    catch (e) { if (String(e.message).includes(want)) console.log('  caught  ' + name); else { console.error('  MISSED  ' + name + ' (threw: ' + e.message + ')'); bad++; } }
  };
  const real = towns[0], m0 = compiled(real.id);
  const withMap = (patch) => (id) => Object.assign({}, compiled(id), patch);
  try { catalogue(towns, compiled); console.log('  ok      the real towns generate'); } catch (e) { console.error('  FAIL    the real towns do not generate: ' + e.message); bad++; }
  expectThrow('no town map at all', () => catalogue([], compiled), 'no kind:\'town\' map row');
  expectThrow('a map wider than the server\'s 256', () => catalogue(towns, withMap({ w: 257 })), 'outside the server\'s 256x256');
  expectThrow('a map row that states another maskHash than it compiles to', () => catalogue([Object.assign({}, real, { maskHash: '00000000' })], compiled), 'states maskHash 00000000');
  expectThrow('a start a hero cannot stand on', () => catalogue(towns, withMap({ start: [0, 0], reach: new Uint8Array(m0.w * m0.h) })), 'no tile a hero can stand on');
  expectThrow('a start walled in', () => {
    const mask = Uint8Array.from(m0.mask); mask[m0.start[1] * m0.w + m0.start[0]] = 1;
    catalogue(towns, withMap({ mask }));
  }, 'is not a tile a hero can stand on');
  /* THE PACKING: every bit comes back where PostgreSQL's get_bit will look for it, on an odd width too. */
  const bits = Uint8Array.from({ length: 13 * 7 }, (_, i) => ((i * 7 + 3) % 5 === 0 ? 1 : 0));
  const bytes = pack(bits);
  if (bytes.length !== 12 || bits.some((b, i) => bitAt(bytes, i) !== b)) { console.error('  FAIL    pack / bitAt do not round-trip on a 13x7 mask'); bad++; }
  else console.log('  ok      the packing round-trips on a 13x7 mask (low bit first)');
  if (pack(Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 1]))[0] !== 1 || pack(Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 1]))[1] !== 2) {
    console.error('  FAIL    bit 0 is not the low bit of byte 0, or bit 9 not bit 1 of byte 1'); bad++;
  } else console.log('  ok      bit 0 is the low bit of byte 0 (get_bit\'s order)');
  /* The mask is the stand rule: every open tile is walked to from the start, and the count is right. */
  const rows = catalogue(towns, compiled);
  for (const r of rows) {
    const m = compiled(r.id);
    let n = 0, wrong = 0;
    for (let i = 0; i < r.bits.length; i++) { if (r.bits[i]) n++; if (r.bits[i] && (m.mask[i] !== 0 || !m.reach[i])) wrong++; }
    if (n !== r.open || wrong) { console.error('  FAIL    ' + r.id + ': ' + wrong + ' masked tile(s) are blocked or unreached, open ' + n + ' vs ' + r.open); bad++; }
    else console.log('  ok      ' + r.id + ': ' + r.open + ' of ' + r.w * r.h + ' tiles open, each open and walked to from the start');
  }
  console.log(bad ? 'gen-town-walk --selftest: ' + bad + ' arm(s) failed' : 'gen-town-walk --selftest: every refusal bites, the packing is get_bit\'s');
  return bad ? 1 : 0;
}

async function main() {
  if (process.argv.includes('--selftest')) process.exit(await selftest());
  const { towns, compiled } = await inputs(ROOT);
  const wanted = buildSql(catalogue(towns, compiled));
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').then((s) => s.replace(/\r\n/g, '\n'), () => null);
    if (have !== wanted) {
      console.error('gen-town-walk: supabase/migrations/' + OUT_FILE + ' is not what the town maps generate.\n'
        + '  A map that blocks other tiles needs a NEW dated walk mask (move OUT_FILE, regenerate), applied before the client that draws it.');
      process.exit(1);
    }
    console.log('gen-town-walk: ' + OUT_FILE + ' is in sync with the town maps');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-town-walk: wrote supabase/migrations/' + OUT_FILE);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
