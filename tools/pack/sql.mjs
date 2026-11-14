// ════════════════════════════════════════════════════════════════════════
// tools/pack/sql.mjs — A GROUND PACK'S SERVER ROWS AS ONE ADDITIVE FILE (lane/b-ground-pack phase 4).
//
// The pack's rows are not authored a second time: they are the DIFFERENCE between what the whole generators emit with the pack
// folded in and what they emit without it (tools/pack/whole.mjs). rowsOf() reads a generated file's top-level
// `insert into public.<t> (cols) values (...), (...);` statements as raw SQL tuples; diffRows() answers the added rows and
// refuses a moved or removed one (a pack ADDS: a row that changes is a world move, not a pack). packSql() writes the file:
// an upsert of each added row on its key, in the generators' table order, and a self-check that asserts the pack's OWN rows
// (never a whole-table count, so two packs commute).
// ════════════════════════════════════════════════════════════════════════

/* THE TABLES A PACK MAY WRITE, each with its key (the generators' own primary keys). A row in any other table is refused: it is
   not a pack's to write. Measured: the fixture (every shipped ground as a pack, tests/ground-pack.mjs) adds rows to exactly these. */
export const PACK_TABLES = Object.freeze({
  hr_items: ['item_id'],
  hr_item_slots: ['item_id', 'equip_slot'],
  hr_activities: ['kind', 'activity_id'],
  hr_hunts: ['hunt_id'],
  hr_hunt_spawns: ['hunt_id', 'monster_id'],
  hr_hunt_grounds: ['hunt_id'],
  hr_hunt_ground_spawns: ['hunt_id', 'monster_id'],
  hr_hunt_kill_bounds: ['monster_id'],
  hr_hunt_roster: ['monster_id'],
  hr_hunt_travel: ['hunt_id'],
  hr_hunt_vendor_value: ['item_id'],
  hr_ground_tiers: ['hunt_id', 'tier'],
  /* a pack's keyed hall (its `hall`, src/data/boss-halls.js): the one row that says which room its key opens. Krell's Hold is the first */
  hr_boss_halls: ['hall_id'],
});

/** Split `s` at top-level commas (outside quotes, parentheses and brackets). */
function splitTop(s) {
  const out = []; let depth = 0, q = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else q = false; } continue; }
    if (c === "'") { q = true; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Every top-level `insert into public.<t> (cols) values ...;` of a generated file: [{ table, cols, rows: [[raw, ...]], conflict }].
 * Statements inside a `do $$ ... $$` block (self-checks and probes) are skipped.
 */
export function rowsOf(sqlText) {
  const text = sqlText.replace(/\r\n/g, '\n');
  const out = [];
  let i = 0;
  const dollar = /\$\$/g;
  /* the spans of $$ ... $$ bodies, so an insert inside a function or a do block is not a catalogue row */
  const spans = []; let m, open = -1;
  while ((m = dollar.exec(text))) { if (open < 0) open = m.index; else { spans.push([open, m.index]); open = -1; } }
  const inBody = (at) => spans.some(([a, b]) => at > a && at < b);
  const head = /insert into public\.([a-z0-9_]+) \(([^)]*)\) values/g;
  while ((m = head.exec(text))) {
    if (inBody(m.index)) continue;
    /* the tuples run to the statement's `;` (outside quotes), or to an `on conflict` */
    let j = head.lastIndex, depth = 0, q = false, body = '';
    for (; j < text.length; j++) {
      const c = text[j];
      if (q) { body += c; if (c === "'") { if (text[j + 1] === "'") { body += "'"; j++; } else q = false; } continue; }
      if (c === "'") { q = true; body += c; continue; }
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (depth === 0 && (c === ';' || text.startsWith('on conflict', j))) break;
      body += c;
    }
    const conflict = text.startsWith('on conflict', j) ? text.slice(j, text.indexOf(';', j)).trim() : null;
    const cols = m[2].split(',').map((c) => c.trim());
    const rows = splitTop(body.trim()).map((t) => {
      if (!t.startsWith('(') || !t.endsWith(')')) throw new Error('pack sql: ' + m[1] + ' has a tuple that is not (...): ' + t.slice(0, 80));
      const v = splitTop(t.slice(1, -1));
      if (v.length !== cols.length) throw new Error('pack sql: ' + m[1] + ' has a tuple of ' + v.length + ' values for ' + cols.length + ' columns');
      return v;
    });
    out.push({ table: m[1], cols, rows, conflict });
    i = j;
  }
  return out;
}

/** One table's rows keyed by its PACK_TABLES key (or the whole tuple for a table a pack may not write). */
function keyed(stmts) {
  const t = new Map();
  for (const s of stmts) {
    const e = t.get(s.table) || { table: s.table, cols: s.cols, rows: new Map() };
    if (e.cols.join() !== s.cols.join()) throw new Error('pack sql: ' + s.table + ' is inserted with two column lists');
    const key = PACK_TABLES[s.table] ? PACK_TABLES[s.table].map((k) => s.cols.indexOf(k)) : null;
    if (key && key.some((k) => k < 0)) throw new Error('pack sql: ' + s.table + ' has no key column ' + PACK_TABLES[s.table].join(','));
    for (const r of s.rows) e.rows.set(key ? key.map((k) => r[k]).join('\u0001') : r.join('\u0001'), r);
    t.set(s.table, e);
  }
  return t;
}

/**
 * The rows `after` adds over `before` (two renders of the same whole files): [{ table, cols, rows }], in `after`'s table order.
 * Throws, naming the row, when a row of `before` is changed or gone, or when an added row is in a table a pack may not write.
 */
export function diffRows(before, after) {
  const b = keyed(before), a = keyed(after), added = [], bad = [];
  for (const [table, e] of a) {
    const was = b.get(table);
    const rows = [];
    for (const [k, r] of e.rows) {
      const old = was && was.rows.get(k);
      if (!old) rows.push(r);
      else if (old.join('\u0001') !== r.join('\u0001')) bad.push(table + ' row ' + k.split('\u0001').join('/') + ' moves: ' + old.join(', ') + ' -> ' + r.join(', '));
    }
    if (rows.length && !PACK_TABLES[table]) bad.push(table + ' gains ' + rows.length + ' row(s), and a pack may not write ' + table);
    if (rows.length) added.push({ table, cols: e.cols, rows });
  }
  for (const [table, e] of b) for (const k of e.rows.keys()) if (!(a.get(table) && a.get(table).rows.has(k))) bad.push(table + ' row ' + k.split('\u0001').join('/') + ' is gone');
  if (bad.length) { const err = new Error('not additive (a pack only adds rows; this is a world move):\n  ' + bad.slice(0, 20).join('\n  ') + (bad.length > 20 ? '\n  ... ' + (bad.length - 20) + ' more' : '')); err.rows = bad; throw err; }
  return added;
}

/** The pack's additive file: an upsert a table, in order, and a self-check on its own rows only. */
export function packSql(id, added, sources) {
  const n = added.reduce((s, t) => s + t.rows.length, 0);
  const lines = [
    '-- ════════════════════════════════════════════════════════════════════════',
    `-- Hearthrise — GROUND PACK ${id}  (GENERATED — DO NOT EDIT)`,
    '--',
    `--   Generated by tools/pack.mjs ship ${id} from src/data/grounds/${id}: the rows the whole catalogue generators`,
    '--   (' + sources.join(', ') + ') add with this pack folded in, and nothing else.',
    `--   ${n} rows in ${added.length} tables. Additive: an upsert on each row's key, so it never touches another ground's rows,`,
    '--   commutes with any other pack, and a later whole file that folds the pack re-states the same rows (tools/pack/whole.mjs).',
    '--   Any hand edit FAILS tests/ground-pack.mjs.',
    '-- ════════════════════════════════════════════════════════════════════════',
    '',
  ];
  for (const t of added) {
    const key = PACK_TABLES[t.table], rest = t.cols.filter((c) => !key.includes(c));
    lines.push(`insert into public.${t.table} (${t.cols.join(', ')}) values`);
    lines.push(t.rows.map((r) => '  (' + r.join(', ') + ')').join(',\n'));
    lines.push(`on conflict (${key.join(', ')}) do ` + (rest.length ? 'update set ' + rest.map((c) => `${c} = excluded.${c}`).join(', ') : 'nothing') + ';');
  }
  lines.push('', '-- §4 self-check: every row above is in place as written (its own rows only: no table count, so packs commute).', 'do $$', 'declare v_n int;', 'begin');
  for (const t of added) {
    const cond = (r) => '(' + t.cols.map((c, i) => (r[i] === 'null' ? `${c} is null` : `${c} = ${r[i]}`)).join(' and ') + ')';
    lines.push(`  select count(*) into v_n from public.${t.table} where ` + t.rows.map(cond).join('\n    or ') + ';');
    lines.push(`  if v_n <> ${t.rows.length} then raise exception 'pack ${id}: ${t.table} holds %% of its ${t.rows.length} rows as written', v_n; end if;`);
  }
  lines.push('end $$;', '');
  return lines.join('\n').replace(/%%/g, '%');
}
