// ============================================================================
// supabase/functions/hr-accrue/index.ts — the accrual Edge Function's I/O shell.
//
// This file does four things and nothing else: verify who is asking, read
// server state, hand it to the pure engine in accrual.js, and hand the
// engine's proposed delta to hr_apply. It contains no game rule and no
// arithmetic on a game value. If a number is computed here, it is in the wrong
// file.
//
// ── THE THREE CONSTRAINTS THIS FILE EXISTS TO HONOUR ────────────────────────
//
// 1. EDGE FUNCTIONS NEVER WRITE TABLES (design §2, "the commit point").
//    The connection is made as `hr_engine_login`, which is `NOINHERIT` and
//    granted exactly one thing: `SET ROLE hr_engine`. `hr_engine` holds ZERO
//    table privileges across every schema — verified — and EXECUTE on a short
//    list of functions. So the entire capability of this file, and of anyone
//    who compromises it, is "propose a delta to a function that re-validates
//    every invariant". There is no INSERT here to review because there is no
//    INSERT privilege to use.
//
// 2. THE TRANSACTION POOLER, PORT 6543. NEVER 5432 (design §2a-ii, HARD RULE).
//    Measured on this project: max_connections = 60 with 23 already in use at
//    six players. An Edge Function that opens a session per invocation
//    exhausts that long before CPU becomes interesting, and the failure is
//    total — nobody connects, including the dashboard. Transaction mode is
//    compatible with everything below because every unit of work is one short
//    transaction, and `pg_advisory_xact_lock` / `select … for update` are
//    transaction-scoped and therefore released at commit. It does mean session
//    state does not survive, which is why every transaction re-issues
//    `set local role hr_engine`.
//
// 3. THE CLIENT AUTHORS NOTHING. The request body is read for exactly one
//    value — `slot`, an integer 0…4 selecting a row the caller already owns —
//    and that value is validated before it is used. Everything else (the
//    clock, the cap, the equipment, the levels, the activity, the watermark,
//    the seed) is read from a server table inside the same transaction. The
//    engine is called with a literal object, field by field; the request body
//    is never spread into anything.
// ============================================================================

import postgres from 'npm:postgres@3.4.5';
import { computeAccrual, levelsOf } from './accrual.js';
import { ITEMS } from '../../../src/data/items.js?v=326';
import { MONSTERS } from '../../../src/data/monsters.js?v=326';

/* ── The connection. MODULE SCOPE, so a warm invocation reuses it. ──────────
   Creating the pool per request would defeat the whole point of using the
   pooler: the pool would be the thing exhausting connections. `max: 2` because
   an invocation runs at most two transactions and never concurrently.
   `prepare: false` is REQUIRED in transaction mode — a named prepared
   statement outlives the transaction that created it, but the backend it was
   prepared on does not, so the next statement fails with "prepared statement
   does not exist" under load and only under load. */
const DB_URL = Deno.env.get('HR_ENGINE_DB_URL') ?? '';

/* Constraint 2, enforced at MODULE LOAD rather than per request. A copy-pasted
   session-mode connection string is the single most likely way the pooler rule
   gets broken, and the damage it does is invisible until the project is busy
   enough to matter — at which point the failure is total and includes the
   dashboard. Checking it here means a misconfigured engine never constructs a
   pool at all and every request answers `engine_unconfigured`, which is a
   diagnosable outage instead of a slow-motion one. */
const POOLER_OK = /:6543(\/|\?|$)/.test(DB_URL);

const sql = (DB_URL && POOLER_OK)
  ? postgres(DB_URL, {
      max: 2,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    })
  : null;

function assertPooler(): void {
  if (!DB_URL) throw new Error('config:HR_ENGINE_DB_URL missing');
  if (!POOLER_OK) {
    throw new Error('config:HR_ENGINE_DB_URL must use the transaction pooler on port 6543, never 5432');
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/* ── Identity ───────────────────────────────────────────────────────────────
   `verify_jwt` is ON for this function, so the Supabase gateway has already
   validated the signature, the issuer and the expiry before Deno was reached —
   an unsigned or expired token never gets here. What is left is to read the
   subject, and to re-check the claims we actually depend on rather than
   assuming the gateway checked the ones we care about.

   Note what is NOT done: this function does not mint a token, and it does not
   hold a signing secret. That is the §2a-i decision — the engine's authority is
   a GRANT on a database role, not a claim in a JWT — and it is what makes the
   seam survive the project's migration to asymmetric signing keys, where
   nothing outside Supabase Auth can mint a token at all. */
function subjectOf(req: Request): string {
  const auth = req.headers.get('Authorization') || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const part = tok.split('.')[1];
  if (!part) throw new Error('not_signed_in');
  const pad = part.replace(/-/g, '+').replace(/_/g, '/');
  const claims = JSON.parse(atob(pad + '==='.slice((pad.length + 3) % 4)));
  const sub = String(claims.sub || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) {
    throw new Error('not_signed_in');
  }
  /* Independent expiry check. The gateway enforces this; duplicating it costs
     a comparison and means a gateway misconfiguration downgrades to a refusal
     instead of to an unauthenticated grant. */
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) {
    throw new Error('not_signed_in');
  }
  return sub;
}

/* ── Idempotency ────────────────────────────────────────────────────────────
   THE KEY IS DERIVED, NOT ACCEPTED. Every other intent takes a
   client-generated uuid, which is right for an intent the client initiates:
   the client knows which retry is which. An accrual is different — it is the
   same operation no matter who asks or how often, and it is defined entirely by
   (user, slot, the watermark it starts from). Deriving the key from those three
   makes a replay idempotent even across two concurrent invocations that have
   never heard of each other, and removes a client-supplied value from the one
   call whose whole job is to pay out.

   Concretely: two tabs returning at the same instant read the same
   `accrued_to`, derive the same key, and exactly one of them applies. The other
   receives the stored decision. With a client-generated key both would apply,
   the second would fail on `version_conflict` instead — correct, but by luck
   rather than by construction, and luck stops working the moment the first
   apply is retried.

   SHA-256, formatted as a v4-shaped uuid (the version/variant bits are set so
   Postgres's uuid type accepts it and it can never collide with a real v4). */
async function intentIdFor(user: string, slot: number, watermark: string): Promise<string> {
  const data = new TextEncoder().encode(`hr-accrue|${user}|${slot}|${watermark}`);
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = Array.from(buf.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  let user: string;
  try { user = subjectOf(req); }
  catch { return json({ ok: false, error: 'not_signed_in' }, 401); }

  /* The ENTIRE read of the request body. One integer, range-checked. */
  let slot = 0;
  try {
    const body = await req.json().catch(() => ({}));
    const n = Number((body as Record<string, unknown>)?.slot ?? 0);
    slot = Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
  } catch { slot = 0; }

  try {
    assertPooler();
    if (!sql) throw new Error('config:no_connection');

    // ── READ. One transaction, engine role, four server facts. ─────────────
    // `set local role hr_engine` must be inside the transaction: transaction
    // mode does not keep a backend between transactions, so a session-scoped
    // SET would be silently lost and hr_apply would then refuse to honour
    // p_user. That failure looks like `forbidden_impersonation`, which is a
    // confusing name for a pooler misconfiguration — hence this note.
    const read = await sql.begin(async (tx) => {
      await tx`set local role hr_engine`;
      const [row] = await tx`
        select public.hr_state_of(${user}::uuid, ${slot}::int)      as state,
               public.hr_offline_cap_ms(${user}::uuid, ${slot}::int) as cap_ms,
               now()                                                as now`;
      return row;
    });

    const env = read?.state as Record<string, any> | null;
    if (!env || env.ok !== true) {
      return json({ ok: false, error: (env && env.error) || 'no_character' }, 409);
    }

    const st = env.state;
    const nowMs = new Date(read.now as string).getTime();
    const accruedToMs = st.accrued_to ? new Date(st.accrued_to).getTime() : nowMs;

    // The seed is derived from a label that names the watermark, so the SAME
    // absence always replays to the SAME rolls (a dispute is resolvable from
    // the ledger) while remaining unpredictable, because hr_seed mixes a
    // 256-bit secret held in a table with RLS on, no policy and no grant to any
    // client role. The client can see `accrued_to` — hr_load returns it so the
    // UI can render a countdown — and that is exactly why the seed may not be a
    // function of visible values alone (review S20).
    const seedRow = await sql.begin(async (tx) => {
      await tx`set local role hr_engine`;
      const [r] = await tx`
        select (public.hr_seed(${user}::uuid, ${slot}::int,
                               ${'accrue:' + String(st.accrued_to)}) & 4294967295)::bigint as seed`;
      return r;
    });

    // ── COMPUTE. Pure, in-process, no I/O. Field by field. ─────────────────
    const skills: Record<string, number> = {};
    for (const k of Object.keys(env.skills || {})) skills[k] = Number(env.skills[k].xp) || 0;

    const out = computeAccrual({
      userId: user,
      slot,
      nowMs,
      accruedToMs,
      activeSinceMs: st.active_since ? new Date(st.active_since).getTime() : accruedToMs,
      activeKind: st.active_kind,
      activeId: st.active_id,
      capMs: Number(read.cap_ms) || 0,
      seed: Number(seedRow?.seed) || 0,
      hp: Number(st.hp) || 0,
      maxHp: Number(st.max_hp) || 0,
      gold: Number(st.gold) || 0,
      skills,
      equipment: env.equipment || {},
      items: ITEMS,
      monsters: MONSTERS,
    });

    if (!out.accrued) {
      // Nothing to pay. NOTHING IS WRITTEN — in particular the watermark is not
      // advanced, so a sub-threshold call cannot confiscate the time it
      // declined to pay for.
      return json({ ok: true, accrued: false, reason: out.reason, version: env.version, now: env.now });
    }

    // ── APPLY. The single writer. ──────────────────────────────────────────
    const intentId = await intentIdFor(user, slot, String(st.accrued_to));
    const applied = await sql.begin(async (tx) => {
      await tx`set local role hr_engine`;
      const [r] = await tx`
        select public.hr_apply(${user}::uuid, ${slot}::int, ${env.version}::bigint,
                               ${intentId}::uuid, ${JSON.stringify(out.delta)}::jsonb) as res`;
      return r;
    });
    const res = applied?.res as Record<string, any>;

    if (!res || res.ok !== true) {
      // A rejection here is an INCIDENT, not a tuning problem (design §2): every
      // clamp in hr_apply is set far above honest play. It is returned verbatim
      // so the machine code survives to the client and to hr_rejections.
      return json({ ok: false, error: (res && res.error) || 'apply_failed', detail: res ?? null }, 409);
    }

    return json({
      ok: true,
      accrued: true,
      // The authoritative post-apply envelope, straight from hr_state_of —
      // the client renders this and computes nothing.
      ...res,
      levels: levelsOf(Object.fromEntries(
        Object.entries(res.skills || {}).map(([k, v]) => [k, (v as any).xp]),
      )),
      // The welcome-back payload, stated by the simulation so no renderer can
      // invent a bonus that was not applied (the away ruling's "player-facing
      // honesty" clause). featuredDropMult included — b326.
      away: {
        grantMs: out.grantMs,
        capped: out.capped,
        tickMs: out.tickMs,
        kills: out.summary.kills,
        crits: out.summary.crits,
        died: out.summary.died,
        blessed: out.summary.blessed,
        buffsPaused: out.summary.buffsPaused,
        featuredMs: out.summary.featuredMs,
        featuredDropMult: out.summary.featuredDropMult,
        gold: out.summary.gold,
        xp: out.summary.xp,
        items: out.summary.items,
        levelUps: out.levelUps,
        events: out.events,
      },
    });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    // Configuration failures are distinguishable from runtime ones, because a
    // misconfigured engine that answers "server_error" is an outage nobody can
    // diagnose. Never echo the connection string.
    if (msg.startsWith('config:')) return json({ ok: false, error: 'engine_unconfigured' }, 503);
    return json({ ok: false, error: 'server_error' }, 500);
  }
});
