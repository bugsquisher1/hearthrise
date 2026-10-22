#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/companion-equip-version-bump.mjs — EVERY WRITE OF THE EQUIPPED PET
//                                          BUMPS THE ROW VERSION.
//
//   node tests/companion-equip-version-bump.mjs            the guard (one chain replay)
//   node tests/companion-equip-version-bump.mjs --mutate   every mutant must turn its arm red
//
// THE INVARIANT (Security residual, 2026-10-14). hr_apply refuses a
// companion_xp_frac key whose pet is not the equipped one
// (`companion_not_equipped`, 2026-10-12-companion-xp-frac.sql). That refusal
// is a STALL, not a bug, only because the tick and accrue read
// player_state.version BEFORE they read the pet id: a swap between the read and
// the settle bumps the version, the settle answers `version_conflict`, the
// engine re-reads and proposes against the new pet. A writer of
// `companion_equipped` that does NOT bump the version lets the engine propose
// for the old pet against a version that still matches, and every window after
// the swap is refused until somebody notices — the pet's XP stalls silently.
//
// Today hr_companion_equip (2026-08-20-companion-model.sql) is the only writer
// and it bumps in the same UPDATE. Nothing said the next writer must. This does.
//
// THE ARMS (all on the installed bodies of a full chain replay):
//   CE0  the scan is not vacuous: hr_companion_equip is found as a writer
//   CE1  every statement that writes companion_equipped — an UPDATE's SET, a
//        tuple SET, an INSERT … ON CONFLICT DO UPDATE SET — sets
//        `version = [<alias>.]version + 1` IN THE SAME STATEMENT. Stricter than
//        "same transaction" on purpose: one statement cannot be split by a
//        branch, an early return or a WHERE that matches a different row.
//        A plain INSERT is exempt — a row that did not exist has no version an
//        engine could have read.
//   CE2  no write form the scan cannot read: a record-field assignment
//        (`new.companion_equipped := …`, a trigger), dynamic SQL naming the
//        column inside a string handed to EXECUTE, or MERGE.
//   CE3  no client-facing role holds UPDATE on the column (a direct
//        PostgREST PATCH is a writer with no body to scan).
//   CE4  behaviour: a real equip via hr_companion_equip moves version by
//        exactly 1 and lands the pet; the no-op re-equip moves it by 0.
//
// WHAT IT CANNOT SEE: dynamic SQL that builds the column NAME at runtime
// (`format('%I', v_col)` with v_col never spelled `companion_equipped`) — no
// static scan can; CE3 + the grant-hygiene detector bound who could run such a
// body. Fixture writes inside a migration's rolled-back §4 DO block are not
// functions and are not scanned.
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// Protocol: tests/mutant-control.mjs (`[mutants] N`, `[mutant] <id> caught|survived`;
// HR_MUTANT_CONTROL=1 plants nothing).
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const COL = 'companion_equipped';
const KNOWN_WRITER = 'hr_companion_equip';
const CLIENT_ROLES = ['anon', 'authenticated', 'hr_engine'];
const UID = '00000000-0000-4000-8000-0000000ce0b1';

// ── THE SCAN (pure; exported for reuse) ─────────────────────────────────────
/** Strip SQL comments and replace every string literal with `'§n§'`, keeping
    the literals so CE2 can see a column named inside dynamic SQL. Dollar-quoted
    nested bodies (`$x$…$x$`) are literals too. */
export function lexSql(src) {
  const lits = [];
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    if (src.startsWith('--', i)) { while (i < n && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
    const dq = /^\$([A-Za-z_]\w*)?\$/.exec(src.slice(i, i + 64));
    if (dq) {
      const end = src.indexOf(dq[0], i + dq[0].length);
      const stop = end < 0 ? n : end;
      lits.push(src.slice(i + dq[0].length, stop));
      out += `'§${lits.length - 1}§'`; i = end < 0 ? n : end + dq[0].length; continue;
    }
    if (src[i] === '\'') {
      let j = i + 1; let s = '';
      while (j < n) { if (src[j] === '\'' && src[j + 1] === '\'') { s += '\''; j += 2; continue; } if (src[j] === '\'') break; s += src[j++]; }
      lits.push(s); out += `'§${lits.length - 1}§'`; i = j + 1; continue;
    }
    out += src[i++];
  }
  return { code: out, lits };
}
/** Split on top-level commas (parentheses respected). */
function topSplit(s) {
  const parts = []; let d = 0; let cur = '';
  for (const c of s) {
    if (c === '(') d++; else if (c === ')') d--;
    if (c === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}
/** The SET list that starts at `at` (just after the keyword), to the first
    top-level WHERE / FROM / RETURNING / ON / end of statement. */
function setClause(stmt, at) {
  let d = 0;
  for (let i = at; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === '(') d++; else if (c === ')') d--;
    else if (d === 0 && /\s/.test(stmt[i - 1] || ' ') && /^(where|from|returning)\b/i.test(stmt.slice(i))) return stmt.slice(at, i);
  }
  return stmt.slice(at);
}
const BUMP = /^\s*version\s*=\s*(?:[A-Za-z_]\w*\s*\.\s*)?version\s*\+\s*1\s*$/i;
const NAMES_COL = new RegExp(`(?:^|[^\\w$])${COL}(?![\\w$])`, 'i');
/** One function body → { writes, unbumped[], unreadable[] }. */
export function scanBody(prosrc, { blind = false } = {}) {
  const { code, lits } = lexSql(prosrc);
  const res = { writes: 0, unbumped: [], unreadable: [] };
  const stmts = code.split(';');
  for (const raw of stmts) {
    const stmt = raw.trim();
    const brief = stmt.replace(/\s+/g, ' ').slice(0, 110);
    // CE2: forms the scan cannot read.
    if (new RegExp(`${COL}\\s*:=`, 'i').test(stmt)) res.unreadable.push(`record-field assignment: ${brief}`);
    if (/\bmerge\s+into\b/i.test(stmt) && NAMES_COL.test(stmt)) res.unreadable.push(`MERGE: ${brief}`);
    const named = [...stmt.matchAll(/'§(\d+)§'/g)].map((m) => lits[Number(m[1])]);
    if (/\bexecute\b/i.test(stmt) && named.some((l) => NAMES_COL.test(l))) res.unreadable.push(`dynamic SQL naming ${COL}: ${brief}`);
    if (blind) continue;
    // CE1: every SET clause that assigns the column also bumps the version.
    for (const m of stmt.matchAll(/\b(?:update\s+(?:only\s+)?[\w."]+(?:\s+(?:as\s+)?[A-Za-z_]\w*)?|do\s+update)\s+set\b/gi)) {
      const items = topSplit(setClause(stmt, m.index + m[0].length));
      const writes = items.some((it) => {
        const lhs = it.split(/=(?!=)/)[0];
        return NAMES_COL.test(lhs) && /=/.test(it);
      });
      if (!writes) continue;
      res.writes++;
      if (!items.some((it) => BUMP.test(it))) res.unbumped.push(brief);
    }
  }
  return res;
}

// ── THE ARMS ────────────────────────────────────────────────────────────────
async function bodies(db) {
  return (await db.query(`
    select n.nspname || '.' || p.proname as name, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog', 'information_schema') and p.prolang <> 13 /* internal */
       and p.prosrc ~* '${COL}'`)).rows;
}
async function arms(db, { blind = false } = {}) {
  const red = [];
  const writers = [];
  for (const { name, prosrc } of await bodies(db)) {
    const r = scanBody(prosrc, { blind });
    if (r.writes) writers.push(name);
    for (const u of r.unbumped) red.push(`CE1: ${name} writes ${COL} without \`version = version + 1\` in the same statement: ${u}`);
    for (const u of r.unreadable) red.push(`CE2: ${name} — ${u} (write it as an UPDATE … SET ${COL} = …, version = version + 1)`);
  }
  if (!writers.includes(`public.${KNOWN_WRITER}`)) red.push(`CE0: the scan found no write in public.${KNOWN_WRITER} — the scan is blind, not the chain (writers: ${writers.join(', ') || 'none'})`);
  for (const role of CLIENT_ROLES) {
    const r = await db.query(`select exists (select 1 from pg_roles where rolname = $1) as e`, [role]);
    if (!r.rows[0].e) continue;
    const g = await db.query(`select has_column_privilege($1, 'public.player_state', '${COL}', 'UPDATE') as u`, [role]);
    if (g.rows[0].u) red.push(`CE3: role ${role} holds UPDATE on public.player_state.${COL} — a writer with no body to scan`);
  }
  red.push(...await behaviour(db));
  return { red, writers };
}
async function behaviour(db) {
  const red = [];
  await db.exec('begin');
  try {
    await db.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [UID]);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [UID]);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: UID, role: 'authenticated' })]);
    await db.query('select public.hr_create_character(0)');
    const ver = async () => (await db.query(`select version, ${COL} from public.player_state where user_id = $1 and slot = 0`, [UID])).rows[0];
    const v0 = await ver();
    const r1 = (await db.query(`select public.${KNOWN_WRITER}(0, 'fox', false) as r`)).rows[0].r;
    const v1 = await ver();
    if (!r1?.ok) red.push(`CE4: equipping the starter fox was refused (${JSON.stringify(r1)}) — the arm cannot measure`);
    else if (v1[COL] !== 'fox' || Number(v1.version) !== Number(v0.version) + 1) {
      red.push(`CE4: a real equip moved version ${v0.version} → ${v1.version} (pet ${v1[COL]}); it must move by exactly 1`);
    }
    await db.query(`select public.${KNOWN_WRITER}(0, 'fox', false)`);
    const v2 = await ver();
    if (Number(v2.version) !== Number(v1.version)) red.push(`CE4: the no-op re-equip moved version ${v1.version} → ${v2.version}`);
  } catch (e) {
    red.push(`CE4: the behavioural arm threw: ${e.message}`);
  } finally { await db.exec('rollback'); }
  return red;
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    console.error(`harness: the migration chain would not replay — ${e.message}`); process.exit(2);
  }
  if (!MUTATE) {
    console.log('companion-equip-version-bump: every write of the equipped pet bumps the row version');
    const { red, writers } = await arms(db);
    if (!red.length) {
      console.log(`  ✓ CE0 — writers of ${COL} on the chain: ${writers.join(', ')}`);
      console.log('  ✓ CE1/CE2 — each writes it in one UPDATE that also sets version = version + 1; no unreadable write form');
      console.log(`  ✓ CE3 — no client role (${CLIENT_ROLES.join(', ')}) holds UPDATE on the column`);
      console.log('  ✓ CE4 — a real equip moves version by exactly 1; the no-op re-equip by 0');
    }
    for (const x of red) console.log(`  ✗ ${x}`);
    await db.close();
    console.log(red.length ? `\nRED (${red.length})` : '\nGREEN: a pet swap always turns an in-flight settle into version_conflict');
    process.exit(red.length ? 1 : 0);
  }

  console.log('\ncompanion-equip-version-bump --mutate: every mutant must turn its named arm red');
  const control = await arms(db);
  if (control.red.length) { console.error(`harness: the unmutated control is red (${control.red.join(' | ')})`); process.exit(2); }
  const equipDef = (await db.query(`select pg_get_functiondef('public.${KNOWN_WRITER}(int,text,boolean)'::regprocedure) d`)).rows[0].d;
  const fn = (name, body, lang = 'plpgsql') => async () => {
    await db.exec(`create function public.${name}(p_uid uuid, p_pet text) returns void language ${lang} as $fn$ ${body} $fn$`);
    return async () => { await db.exec(`drop function public.${name}(uuid, text)`); };
  };
  const equipMutant = (from, to) => async () => {
    if (equipDef.split(from).length !== 2) throw Object.assign(new Error(`anchor matched ${equipDef.split(from).length - 1}x: ${from}`), { harness: true });
    await db.exec(equipDef.replace(from, () => to));
    return async () => { await db.exec(equipDef); };
  };
  const BUMP_LINE = '         version    = version + 1,\n';
  const MUTANTS = [
    { id: 'CE1-writer-without-bump', arms: /^CE1:/,
      plant: fn('zz_pet_swap', `begin update public.player_state set ${COL} = p_pet, updated_at = now() where user_id = p_uid and slot = 0; end`) },
    { id: 'CE1-equip-loses-its-bump', arms: /^(CE1|CE4):/, plant: equipMutant(BUMP_LINE, '') },
    { id: 'CE1-bump-that-is-not-a-bump', arms: /^CE1:/,
      plant: fn('zz_pet_swap', `begin update public.player_state set ${COL} = p_pet, version = version where user_id = p_uid and slot = 0; end`) },
    { id: 'CE1-tuple-set-without-bump', arms: /^CE1:/,
      plant: fn('zz_pet_swap', `begin update public.player_state as ps set (${COL}, updated_at) = (p_pet, now()) where ps.user_id = p_uid and ps.slot = 0; end`) },
    { id: 'CE1-upsert-without-bump', arms: /^CE1:/,
      plant: fn('zz_pet_swap', `begin insert into public.player_state (user_id, slot, ${COL}) values (p_uid, 0, p_pet) on conflict (user_id, slot) do update set ${COL} = excluded.${COL}; end`) },
    { id: 'CE1-sql-language-writer', arms: /^CE1:/,
      plant: fn('zz_pet_swap', `update public.player_state set ${COL} = p_pet where user_id = p_uid and slot = 0`, 'sql') },
    { id: 'CE2-trigger-record-assignment', arms: /^CE2:/,
      plant: async () => {
        await db.exec(`create function public.zz_pet_trg() returns trigger language plpgsql as $t$ begin new.${COL} := 'fox'; return new; end $t$`);
        return async () => { await db.exec('drop function public.zz_pet_trg()'); };
      } },
    { id: 'CE2-dynamic-sql-names-the-column', arms: /^CE2:/,
      plant: fn('zz_pet_swap', `begin execute 'update public.player_state set ${COL} = $1 where user_id = $2 and slot = 0' using p_pet, p_uid; end`) },
    { id: 'CE3-client-role-granted-update', arms: /^CE3:/,
      plant: async () => {
        await db.exec(`grant update (${COL}) on public.player_state to authenticated`);
        return async () => { await db.exec(`revoke update (${COL}) on public.player_state from authenticated`); };
      } },
    { id: 'CE0-scan-blinded', arms: /^CE0:/, blind: true },
  ];
  console.log(`[mutants] ${MUTANTS.length}`);
  let survived = 0;
  for (const m of MUTANTS) {
    let undo = null; let red;
    try {
      if (!CONTROL && m.plant) undo = await m.plant();
      red = (await arms(db, { blind: !CONTROL && m.blind })).red;
    } catch (e) {
      if (e.harness) { console.error(`harness: ${m.id}: ${e.message}`); process.exit(2); }
      red = [`threw: ${e.message}`];
    } finally { if (undo) await undo(); }
    const hit = red.some((x) => m.arms.test(x));
    console.log(`[mutant] ${m.id} ${hit ? 'caught' : 'survived'}`);
    if (hit) console.log(`  ✓ ${m.id}: RED via ${[...new Set(red.filter((x) => m.arms.test(x)).map((x) => x.split(':')[0]))].join(', ')}`);
    else { survived++; console.log(`  ✗ ${m.id}: ${red.length ? `red only via ${red.join(' | ')}` : 'SURVIVED'}`); }
  }
  const after = await arms(db);
  if (after.red.length) { console.error(`harness: the restored chain is red (${after.red.join(' | ')})`); process.exit(2); }
  await db.close();
  if (CONTROL) {
    console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
    process.exit(0);
  }
  console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
  process.exit(survived ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
