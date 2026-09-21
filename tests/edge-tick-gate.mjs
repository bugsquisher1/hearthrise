#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/edge-tick-gate.mjs — IS THE `op:'tick'` BYPASS NARROWER THAN THE GATE
//                            IT BYPASSES?
//
// Sibling of tests/edge-jwt-gate.mjs, and it exists because of that file.
// `edge-jwt-gate` asks "is `verify_jwt` actually on, on the LIVE function" —
// a network probe about a deploy-time setting. This one asks the question that
// came with milestone 1b (WORLD_TICK_DESIGN.md §15c): hr-accrue now has a
// branch that runs BEFORE the player JWT is verified, and that is a deliberate
// bypass of exactly the gate the sibling defends. So:
//
//   IT IS IN-PROCESS AND NEEDS NO CREDENTIAL. The subject is the SHIPPED module
//   (supabase/functions/hr-accrue/tick.js) driven with real Headers and a fake
//   `exec`, so every arm runs on every push rather than only where a network
//   and a token exist. A guard about an authentication path must not be the one
//   that gets skipped on a laptop.
//
// ── THE NINE ARMS ──────────────────────────────────────────────────────────
//   T-G1  the two geometry clamps still match hr_tick_config's CHECK ranges
//   T-A1  no X-HR-Tick-Auth  -> not a tick request at all; NOTHING runs
//   T-A2  wrong bearer       -> 401 not_signed_in, the same body the player
//                              path returns, and no database call
//   T-A3  unset / short env  -> every tick request refused, even a right guess
//   T-A4  constant time      -> the comparison is over two fixed-length
//                              digests, so length is not an oracle
//   T-B1  a forged body naming a user/slot/ts/amount changes NOTHING: the
//         selectors survive, every other field is dropped on the floor
//   T-K1  kill switch off    -> no-op: no engine, no settle, no write
//   T-S1  SHADOW             -> the fence writes the shadow row and the summary
//                              reports the FENCE's mode, never the body's flag
//   T-P1  a player JWT alone can never reach op:tick (wiring, packed bytes)
//   T-W1  the player path is byte-for-byte unchanged for non-tick ops (wiring)
//
// ── --selftest: FOUR MUTATIONS, EACH MUST GO RED ───────────────────────────
// A guard that has never been red is not a guard (CLAUDE.md §4). Each mutation
// is applied to the REAL caller — a patched module object, not a
// re-implementation — and the run fails if the arms stay green:
//   M1 remove the bearer check        M2 accept a body-supplied user id
//   M3 skip the kill switch           M4 write payable rows while shadowed
//
// Usage:
//   node tests/edge-tick-gate.mjs
//   node tests/edge-tick-gate.mjs --selftest
// ════════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pack } from '../tools/pack-edge.mjs';
import {
  tickGate, tickBearerOk, tickSecretUsable, parseTickBody, parseSelectors,
  probeKillSwitch, runTick,
  TICK_HEADER, TICK_OP, MIN_SECRET_LEN, MAX_ROSTER,
  CADENCE_MS_MIN, CADENCE_MS_MAX, FLUSH_MS_MIN, FLUSH_MS_MAX,
} from '../supabase/functions/hr-accrue/tick.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const SELFTEST = process.argv.slice(2).includes('--selftest');

let fails = 0;
const ok = (cond, label, detail) => {
  if (cond) { console.log(`  ✓ ${label}`); return true; }
  fails++; console.log(`  ✗ ${label}${detail ? '\n      ' + detail : ''}`); return false;
};
const group = (t) => console.log(`\n${t}`);

/* A real 64-hex secret, minted the way the Vault contract mints one. It is a
   TEST value and is not, and must never be, the production bearer. */
const SECRET = 'a'.repeat(32) + 'b'.repeat(32);
const WRONG = 'c'.repeat(64);

const headers = (o) => new Headers(o || {});

// ═══════════════════════════════════════════════════════════════════════════
// THE FAKE DATABASE — a recording `exec` that answers the four statements the
// entry can issue and REFUSES anything else, so a new query cannot appear
// without this file noticing.
// ═══════════════════════════════════════════════════════════════════════════
const NOW_ISO = '2026-09-21T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const UID = '11111111-2222-3333-4444-555555555555';
const EVIL = '99999999-9999-9999-9999-999999999999';

function fakeDb(cfg) {
  const o = Object.assign({
    enabled: true, shadow: true, markMs: NOW_MS - 120000,
    version: 7, activeKind: 'gather', known: new Set([UID]),
  }, cfg || {});
  const calls = [];
  const settles = [];
  const exec = async (text, params) => {
    calls.push({ text, params });
    if (text.includes('current_database()')) return [{ holder: 'cron:postgres' }];
    if (/^select now\(\)/.test(text)) return [{ now: NOW_ISO }];
    if (text.includes('hr_seed')) {
      return (params[2] || []).map((label, i) => ({ ord: i + 1, seed: 1000 + i }));
    }
    if (text.includes('hr_state_of')) {
      if (!o.known.has(params[0])) return [{ state: { ok: false, error: 'no_character' }, now: NOW_ISO }];
      return [{
        now: NOW_ISO,
        cap_ms: 43200000,
        state: {
          ok: true, version: o.version, now: NOW_ISO,
          state: {
            accrued_to: new Date(o.markMs).toISOString(),
            active_kind: o.activeKind, active_id: 'normal_tree',
            active_since: new Date(NOW_MS - 3600000).toISOString(),
            hp: 40, max_hp: 40, gold: 10,
            skills: { woodcutting: 500, hitpoints: 1200 }, inventory: {}, equipment: {},
            tool_carry: null,
          },
        },
      }];
    }
    if (text.includes('hr_tick_settle')) {
      const [holder, user, slot, channel, version, wFrom, wTo, key, delta] = params;
      if (!o.enabled) return [{ res: { ok: false, error: 'tick_disabled', mode: 'off' } }];
      if (user === null || slot === null || key === null) {
        return [{ res: { ok: false, error: 'bad_arguments' } }];
      }
      if (!o.known.has(user)) return [{ res: { ok: false, error: 'no_character' } }];
      if (o.activeKind !== channel) return [{ res: { ok: false, error: 'channel_moved' } }];
      if (Date.parse(wFrom) < o.markMs) {
        return [{ res: { ok: false, error: 'window_already_settled',
          accrued_to: new Date(o.markMs).toISOString(), shadow: o.shadow } }];
      }
      if (version !== o.version) return [{ res: { ok: false, error: 'version_conflict' } }];
      settles.push({ holder, user, slot, channel, version, wFrom, wTo, key, delta: JSON.parse(delta) });
      if (o.shadow) return [{ res: { ok: true, mode: 'shadow', paid: false, window_to: wTo } }];
      o.markMs = Date.parse(wTo); o.version += 1;
      return [{ res: { ok: true, mode: 'armed', paid: true } }];
    }
    throw new Error('fakeDb: unexpected statement — ' + text.slice(0, 80));
  };
  return { exec, calls, settles, cfg: o };
}

const rosterRow = (userId, extra) => Object.assign({
  user_id: userId, slot: 0, shard: 0, active_kind: 'gather', active_id: 'normal_tree',
  active_since: NOW_ISO, accrued_to: NOW_ISO, version: 1, seed: 1, state: {},
}, extra || {});

// ═══════════════════════════════════════════════════════════════════════════
// THE ARMS
// ═══════════════════════════════════════════════════════════════════════════
async function runArms(mod) {
  const { tickGate, parseTickBody, parseSelectors, probeKillSwitch, runTick } = mod;

  // ── T-G1 ────────────────────────────────────────────────────────────────
  group('T-G1  the geometry clamps still match hr_tick_config');
  {
    const sql = await readFile(join(ROOT, 'supabase', 'migrations',
      '2026-09-21-world-tick-settle-fence.sql'), 'utf8');
    const rangeOf = (name) => {
      const m = new RegExp(name + '\\s+between\\s+(\\d+)\\s+and\\s+(\\d+)').exec(sql);
      return m ? [Number(m[1]), Number(m[2])] : null;
    };
    const cad = rangeOf('cadence_seconds');
    const fl = rangeOf('flush_seconds');
    ok(cad && cad[0] * 1000 === CADENCE_MS_MIN && cad[1] * 1000 === CADENCE_MS_MAX,
      'T-G1a — cadence clamp matches the migration', `migration=${JSON.stringify(cad)} tick.js=[${CADENCE_MS_MIN},${CADENCE_MS_MAX}]`);
    ok(fl && fl[0] * 1000 === FLUSH_MS_MIN && fl[1] * 1000 === FLUSH_MS_MAX,
      'T-G1b — flush clamp matches the migration', `migration=${JSON.stringify(fl)} tick.js=[${FLUSH_MS_MIN},${FLUSH_MS_MAX}]`);
    const wild = parseTickBody({ op: 'tick', cadence_ms: 1, flush_ms: 1 });
    ok(wild.cadenceMs === CADENCE_MS_MIN && wild.flushMs >= wild.cadenceMs,
      'T-G1c — a body naming a 1 ms cadence is clamped, and flush >= cadence holds',
      JSON.stringify(wild));
  }

  // ── T-A1 ────────────────────────────────────────────────────────────────
  group('T-A1  no X-HR-Tick-Auth header');
  {
    const g = tickGate(headers({ authorization: 'Bearer aaa.bbb.ccc' }), SECRET);
    ok(g === null, 'T-A1a — no header is not a tick request; the branch is not entered at all',
      `gate returned ${JSON.stringify(g)}`);
    const db = fakeDb();
    ok(db.calls.length === 0 && db.settles.length === 0,
      'T-A1b — nothing ran: no statement, no settle');
  }

  // ── T-A2 ────────────────────────────────────────────────────────────────
  group('T-A2  a wrong bearer');
  {
    const g = tickGate(headers({ [TICK_HEADER]: WRONG }), SECRET);
    ok(g && g.ok === false && g.status === 401, 'T-A2a — refused with 401');
    ok(g && g.body && g.body.error === 'not_signed_in',
      'T-A2b — the SAME body the player path returns, so the branch is not an oracle',
      JSON.stringify(g && g.body));
    ok(mod.tickBearerOk('', SECRET) === false && mod.tickBearerOk(null, SECRET) === false,
      'T-A2c — an empty or absent presented value never compares equal');
    ok(mod.tickBearerOk(SECRET, SECRET) === true, 'T-A2d — the right bearer is accepted');
  }

  // ── T-A3 ────────────────────────────────────────────────────────────────
  group('T-A3  an unset or short secret fails CLOSED');
  {
    const short = 'a'.repeat(MIN_SECRET_LEN - 1);
    ok(mod.tickSecretUsable('') === false && mod.tickSecretUsable(undefined) === false
      && mod.tickSecretUsable(short) === false && mod.tickSecretUsable(SECRET) === true,
      'T-A3a — usable() is false for unset and for anything under ' + MIN_SECRET_LEN + ' chars');
    for (const [name, env] of [['unset', ''], ['undefined', undefined], ['short', short]]) {
      const g = tickGate(headers({ [TICK_HEADER]: env || 'x' }), env);
      ok(g && g.ok === false && g.status === 401,
        `T-A3b — with a ${name} secret even a matching guess is refused`);
    }
  }

  // ── T-A4 ────────────────────────────────────────────────────────────────
  group('T-A4  the comparison is length-independent');
  {
    /* The property, executed rather than timed: a wall-clock measurement on a
       JIT is a flake generator, and what actually matters is that NO input
       length reaches a different code path. Every one of these is a single
       32-byte digest comparison and every one answers false. */
    const lengths = [1, 8, 31, 32, 63, 64, 65, 4096];
    const all = lengths.map((n) => mod.tickBearerOk('z'.repeat(n), SECRET));
    ok(all.every((v) => v === false),
      'T-A4a — every wrong length answers false through the same digest compare',
      JSON.stringify(all));
    const nearly = SECRET.slice(0, -1) + 'z';
    ok(mod.tickBearerOk(nearly, SECRET) === false && nearly.length === SECRET.length,
      'T-A4b — a same-length near miss is refused');
  }

  // ── T-B1 ────────────────────────────────────────────────────────────────
  group('T-B1  a forged body is ignored except for its selectors');
  {
    const forged = parseTickBody({
      op: 'tick',
      holder: 'cron:attacker',
      shadow: false,
      roster: [rosterRow(UID, {
        version: 999999, accrued_to: '1999-01-01T00:00:00.000Z',
        active_kind: 'combat', shard: 42, seed: 1,
        state: { gold: 999999999, skills: { woodcutting: 99999999 } },
      })],
      gold: 999999, amount: 999999, user_id: EVIL, ts: '1999-01-01T00:00:00.000Z',
    });
    ok(forged.roster.length === 1, 'T-B1a — the roster selector survives');
    const keys = Object.keys(forged.roster[0]).sort();
    ok(JSON.stringify(keys) === '["slot","userId"]',
      'T-B1b — a roster row contributes EXACTLY user_id and slot; nothing else is read',
      'kept: ' + JSON.stringify(keys));
    ok(!('holder' in forged) && !('shadow' in forged) && !('user_id' in forged)
      && !('gold' in forged) && !('ts' in forged),
      'T-B1c — holder, shadow, a top-level user id, an amount and a timestamp are all dropped',
      Object.keys(forged).join(','));

    const db = fakeDb();
    const out = await runTick({ exec: db.exec, body: {
      op: 'tick', holder: 'cron:attacker', shadow: false,
      roster: [rosterRow(UID, { version: 999999, accrued_to: '1999-01-01T00:00:00.000Z' })],
    } });
    ok(db.settles.length === 1, 'T-B1d — the settle went through the fence');
    const s = db.settles[0];
    ok(s.holder === 'cron:postgres',
      'T-B1e — the holder is the SERVER-derived one, not the body\'s "cron:attacker"', s.holder);
    ok(s.version === db.cfg.version,
      'T-B1f — the version is hr_state_of\'s, not the body\'s 999999', String(s.version));
    ok(Date.parse(s.wFrom) === db.cfg.markMs,
      'T-B1g — the window starts at the FENCE\'s watermark, not the body\'s 1999 timestamp',
      `${s.wFrom} vs ${new Date(db.cfg.markMs).toISOString()}`);
    ok(out.body.shadowed === 1 && out.body.processed === 0,
      'T-B1h — the body said shadow:false and the FENCE said shadow; the fence won',
      JSON.stringify(out.body));

    /* A character this driver does not hold. The fake fence refuses it exactly
       as the real one does, and the summary says so rather than paying. */
    const db2 = fakeDb();
    const out2 = await runTick({ exec: db2.exec, body: { op: 'tick', roster: [rosterRow(EVIL)] } });
    ok(db2.settles.length === 0 && out2.body.processed === 0 && out2.body.shadowed === 0,
      'T-B1i — naming an unleased character settles nothing', JSON.stringify(out2.body));

    ok(parseSelectors([{ user_id: 'not-a-uuid', slot: 0 }]).length === 0
      && parseSelectors([{ user_id: UID, slot: -1 }]).length === 0
      && parseSelectors([{ user_id: UID, slot: 1.5 }]).length === 0,
      'T-B1j — a malformed selector is dropped, never coerced');
    ok(parseSelectors(new Array(MAX_ROSTER + 50).fill(0).map(() => rosterRow(UID))).length <= 1,
      'T-B1k — duplicate rows collapse to one character');
  }

  // ── T-K1 ────────────────────────────────────────────────────────────────
  group('T-K1  the kill switch');
  {
    const db = fakeDb({ enabled: false });
    const out = await runTick({ exec: db.exec, body: {
      op: 'tick', roster: [rosterRow(UID), rosterRow(UID, { slot: 1 })] } });
    ok(out.body.disabled === true, 'T-K1a — the fire reports disabled', JSON.stringify(out.body));
    ok(db.settles.length === 0, 'T-K1b — nothing was settled');
    ok(!db.calls.some((c) => c.text.includes('hr_state_of')),
      'T-K1c — NO-OP means no engine work: hr_state_of was never read',
      db.calls.map((c) => c.text.slice(7, 40)).join(' | '));
    ok(!db.calls.some((c) => c.text.includes('hr_seed')),
      'T-K1d — and no seed was drawn');
    const probe = await probeKillSwitch(fakeDb({ enabled: false }).exec, 'cron:postgres');
    ok(probe.enabled === false, 'T-K1e — the probe reads the switch through the fence');
    const weird = await probeKillSwitch(async () => [{ res: { ok: false, error: 'who_knows' } }], 'h');
    ok(weird.enabled === false,
      'T-K1f — an unrecognised answer fails CLOSED rather than proceeding');
  }

  // ── T-S1 ────────────────────────────────────────────────────────────────
  group('T-S1  SHADOW writes only the shadow table');
  {
    const db = fakeDb({ shadow: true });
    const before = db.cfg.markMs, ver = db.cfg.version;
    const out = await runTick({ exec: db.exec, body: { op: 'tick', roster: [rosterRow(UID)] } });
    ok(out.body.shadowed === 1 && out.body.processed === 0,
      'T-S1a — the summary counts it as shadowed, never processed', JSON.stringify(out.body));
    ok(db.cfg.markMs === before && db.cfg.version === ver,
      'T-S1b — nothing a player owns moved: watermark and version unchanged');
    ok(!db.calls.some((c) => c.text.includes('hr_apply')),
      'T-S1c — hr_apply was never called; the fence is the only door');
    const armed = fakeDb({ shadow: false });
    const outA = await runTick({ exec: armed.exec, body: { op: 'tick', roster: [rosterRow(UID)] } });
    ok(outA.body.processed === 1 && outA.body.shadowed === 0,
      'T-S1d — the same code armed reports processed, so T-S1a is not vacuous',
      JSON.stringify(outA.body));
  }

  // ── T-F1 — THE PACK-TIME FENCE ROUND THE 'tick' CALLER ──────────────────
  group("T-F1  the pack fence round `caller: 'tick'`");
  {
    /* `tickCallerProblems` used to say "never in an edge payload". Milestone 1b
       had to move the tick's production half INTO the payload, and a rule
       spelled "never" gets answered by deleting it — so it was restated as
       three properties instead. All three are mutation-proved here, because a
       guard that has never been red is a comment (CLAUDE.md §4). */
    const { tickCallerProblems, TICK_MODULES } = await import('../tools/pack-edge.mjs');
    const P = (files) => tickCallerProblems(files);
    const GATE = { name: 'supabase/functions/hr-accrue/index.ts',
      src: "const S = Deno.env.get('HR_TICK_SHARED_SECRET');\nconst t = tickGate(req.headers, S);\n" };
    const TICKMOD = { name: 'supabase/functions/hr-accrue/tick-gather.js',
      src: "  Object.assign({ caller: 'tick' }, opts);\n" };

    ok(P([{ name: 'supabase/functions/hr-accrue/set-activity.js', src: "  caller: 'tick',\n" }]).length === 1,
      'T-F1a — (1) still bites: `caller:\'tick\'` in an ordinary edge module is refused');
    ok(P([{ name: 'x.js', src: "/* caller: 'tick' in prose */\n" }]).length === 0,
      'T-F1b — a comment is not a call site');
    ok(P([GATE, TICKMOD]).length === 0,
      'T-F1c — the real shape — a tick module plus the bearer gate — is clean',
      JSON.stringify(P([GATE, TICKMOD])));
    ok(P([TICKMOD]).length === 1,
      "T-F1d — (2) bites: tick code with NO bearer gate in the payload is refused",
      JSON.stringify(P([TICKMOD])));
    ok(P([GATE, TICKMOD, { name: 'supabase/functions/hr-accrue/equip.js',
      src: "import { settleGatherSession } from './tick-gather.js';\n" }]).length === 1,
      'T-F1e — (3) bites: an ordinary verb importing a tick module is refused');
    ok(P([GATE, TICKMOD, { name: 'supabase/functions/hr-accrue/index.ts',
      src: "import { x } from './tick-gather.js';\n" }]).length === 1,
      'T-F1f — (3) bites: even the entrypoint may reach only tick.js');
    ok(TICK_MODULES.length === 4 && TICK_MODULES.every((m) => m.startsWith('supabase/functions/hr-accrue/tick')),
      'T-F1g — the allowlist is four named files, not a directory or a prefix');
  }

  // ── T-W1 / T-P1 — WIRING, against the PACKED bytes ──────────────────────
  group('T-P1/T-W1  the wiring, against the bytes that deploy');
  {
    const packed = await pack('hr-accrue');
    const files = new Map(packed.files.map((f) => [f.name, f.content]));
    const index = files.get('index.ts') || '';
    ok(files.has('tick.js'), 'T-P1a — tick.js is in the payload');
    const gateAt = index.indexOf('tickGate(');
    const jwtAt = index.indexOf('await verifyJwt(');
    ok(gateAt > 0 && jwtAt > 0 && gateAt < jwtAt,
      'T-P1b — the tick branch is BEFORE verifyJwt, which is the whole point of §15c',
      `tickGate@${gateAt} verifyJwt@${jwtAt}`);
    ok(/const\s+TICK_SECRET\s*=\s*Deno\.env\.get\('HR_TICK_SHARED_SECRET'\)/.test(index),
      'T-P1c — the bearer comes from the env var, never from a literal or the body');
    /* The player path must not be able to reach the tick. The ONLY caller of
       runTick in the payload is inside the `if (tick)` block, and `tick` is
       null unless the header was present and matched. */
    const afterGate = index.slice(gateAt);
    const runAt = afterGate.indexOf('runTick(');
    const guardAt = afterGate.indexOf('if (!tick.ok)');
    ok(runAt > 0 && guardAt > 0 && guardAt < runAt,
      'T-P1d — runTick is reached only after the bearer has been accepted');
    ok((index.match(/runTick\(/g) || []).length === 1,
      'T-P1e — exactly one call site, so there is no second way in');
    ok(!/op\s*===\s*['"]tick['"]/.test(index),
      'T-P1f — index.ts never discriminates on a BODY field; the header is the discriminator');

    /* T-W1. The player path below the branch is unchanged: the diff against
       origin/lane/world-tick-m1 must touch index.ts only in the two places the
       branch needs. Stated structurally rather than as a diff, so it survives a
       rebase: everything the player path reads is still read in the same order. */
    const order = ['tickGate(', 'await verifyJwt(', 'parseIntent(', 'isKnownVerb(',
      'runSetActivity(', 'computeAccrual('];
    let at = -1; let inOrder = true; const seen = [];
    for (const needle of order) {
      const i = index.indexOf(needle, at + 1);
      seen.push(`${needle}@${i}`);
      if (i <= at) { inOrder = false; break; }
      at = i;
    }
    ok(inOrder, 'T-W1a — the player path still runs in its original order beneath the branch',
      seen.join(' '));
    ok(index.includes("return json({ ok: false, error: 'not_signed_in' }, 401);"),
      'T-W1b — the player 401 is untouched and is the body the tick branch mirrors');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════
const REAL = {
  tickGate, tickBearerOk, tickSecretUsable, parseTickBody, parseSelectors,
  probeKillSwitch, runTick,
};

/* Each mutation replaces ONE function on the module object the arms are driven
   through, so the mutation is applied to the real caller rather than to a copy
   of it. The arms that must go red are named, and a mutation that leaves them
   all green is itself the failure. */
const MUTATIONS = [
  {
    id: 'M1', what: 'remove the bearer check',
    patch: (m) => Object.assign({}, m, {
      tickGate: (h) => (h.get(TICK_HEADER) === null ? null : { ok: true }),
      tickBearerOk: () => true,
      tickSecretUsable: () => true,
    }),
    mustFail: ['T-A2', 'T-A3', 'T-A4'],
  },
  {
    id: 'M2', what: 'accept a body-supplied user id',
    patch: (m) => Object.assign({}, m, {
      parseSelectors: (raw) => (Array.isArray(raw) ? raw : []).map((r) => {
        const s = Object.create(null);
        s.userId = r.user_id; s.slot = r.slot;
        s.version = r.version; s.accruedTo = r.accrued_to; s.holder = r.holder;
        return s;
      }),
      parseTickBody: (raw) => {
        const b = REAL.parseTickBody(raw);
        const out = Object.assign(Object.create(null), b);
        out.holder = raw && raw.holder;
        out.user_id = raw && raw.user_id;
        out.roster = (Array.isArray(raw && raw.roster) ? raw.roster : []).map((r) => {
          const s = Object.create(null); s.userId = r.user_id; s.slot = r.slot;
          s.version = r.version; s.accruedTo = r.accrued_to; return s;
        });
        return out;
      },
    }),
    mustFail: ['T-B1'],
  },
  {
    id: 'M3', what: 'skip the kill switch',
    patch: (m) => Object.assign({}, m, { probeKillSwitch: async () => ({ enabled: true }) }),
    mustFail: ['T-K1'],
  },
  {
    id: 'M4', what: 'write payable rows while shadowed',
    patch: (m) => Object.assign({}, m, {
      runTick: async (o) => {
        /* The fence is asked to settle as though nothing were shadowed, and the
           summary reports the BODY's flag — the two halves of "a shadow run
           that pays". */
        const out = await REAL.runTick(Object.assign({}, o, {
          exec: async (text, params) => {
            const rows = await o.exec(text, params);
            const r = rows && rows[0] && rows[0].res;
            if (r && r.mode === 'shadow') r.mode = 'armed';
            return rows;
          },
        }));
        return out;
      },
    }),
    mustFail: ['T-S1'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('edge-tick-gate: is the op:\'tick\' bypass narrower than the gate it bypasses?');
  await runArms(REAL);

  if (SELFTEST) {
    console.log('\n── --selftest: every mutation must go RED ─────────────────────────');
    const baseline = fails;
    for (const m of MUTATIONS) {
      const before = fails;
      const log = console.log;
      const lines = [];
      console.log = (...a) => lines.push(a.join(' '));
      try { await runArms(m.patch(REAL)); } catch { fails++; } finally { console.log = log; }
      const red = lines.filter((l) => l.includes('✗'));
      const hit = m.mustFail.filter((arm) => red.some((l) => l.includes(arm)));
      fails = before;                       // the mutation's reds are not OUR reds
      if (hit.length === m.mustFail.length) {
        console.log(`  ✓ ${m.id} (${m.what}) went red on ${hit.join(', ')}`);
      } else {
        fails++;
        console.log(`  ✗ ${m.id} (${m.what}) did NOT go red on `
          + `${m.mustFail.filter((a) => !hit.includes(a)).join(', ')} — the guard does not bite there`);
        for (const l of red.slice(0, 3)) console.log('      ' + l.trim());
      }
    }
    fails = baseline + (fails - baseline);
  }

  console.log('');
  if (fails) {
    console.log(`edge-tick-gate: RED — ${fails} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('edge-tick-gate: green — the tick branch is reachable only with the bearer, '
    + 'reads nothing but selectors from the body, honours the kill switch, and pays nothing in shadow.');
}

main().catch((e) => { console.error(e); process.exit(1); });
