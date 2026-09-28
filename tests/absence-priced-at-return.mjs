#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/absence-priced-at-return.mjs — SETTLE BEFORE MUTATE (Security F1).
//
//   node tests/absence-priced-at-return.mjs                 clean run
//   node tests/absence-priced-at-return.mjs --list          the mutation catalogue
//   node tests/absence-priced-at-return.mjs --mutate=<id>   one planted defect
//   node tests/absence-priced-at-return.mjs --mutate        every mutation must be CAUGHT
//   node tests/absence-priced-at-return.mjs --selftest      (same as --mutate)
//
// docs/planning/SEC_ABSENCE_PRICED_AT_RETURN_2026-09-28.md. The return settle
// prices the whole open window `[accrued_to, now)` with the character as it is
// AT THE REQUEST, and nothing forced it to run before a verb that adds a
// priceable input. Production (2026-09-27): a pickaxe claimed at 00:58 paid
// +13.5 % ore over a 7.25 h mithril night mined at 12.80 s without it.
//
// ── WHAT IT DRIVES ──────────────────────────────────────────────────────────
// The REAL edge modules (market.js, eat.js, claim-reward.js, set-activity.js)
// behind the same one-statement `exec` seam index.ts hands them, as `hr_engine`,
// against the REAL migration chain in PGlite. `accrue` is index.ts's verb and
// index.ts is Deno TypeScript, so the settle it performs is driven through
// `collectCurrentWindow` — the SAME computeAccrual literal (A14 proves the two
// call sites hand the engine the same input set) and the same derived key.
//
// ⚠ ONE HARNESS PRIVILEGE, STATED. The seed of a window is
//   hr_seed(user, slot, 'accrue:<watermark>') — a per-character secret. R1 and
//   R2 compare two ORDERS OF THE SAME GESTURES, which needs two characters with
//   the same dice; the exec seam replaces the `seed` column of the seed read
//   with one constant. Nothing else is touched, and the salt (the key half) is
//   the real one.
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────────
//   R1   production shape: Mining 61 on mithril_rock (12.80 s with no tool),
//        accrued_to = now − 7.25 h. An iron pickaxe BOUGHT FROM ANOTHER PLAYER
//        at return, then accrue, pays byte-identically to accrue-then-buy —
//        ore, mining XP. CONTROL: a character who held the pickaxe all night is
//        paid MORE, so equality is not vacuous.
//        (The literal production path — `road_forge` → iron_pickaxe — is the
//        client-direct hr_claim_quest RPC: F2's, see R5. The edge claim_reward
//        verb prices `daily:login` only, gold and gems, so R1c proves the
//        claim verb SETTLES FIRST rather than a pricing delta.)
//   R1c  claim_reward daily:login at return settles the window first: the
//        body carries `collected`, the ore it reports is byte-identical to
//        R1's accrue-first night, and the watermark has moved.
//   R2   eat hunters_feast then settle a combat night == settle then eat
//        (drops, gold, XP, kills), and the live buff keeps its full duration.
//   R3   the self-market loop: slot 1 lists the pickaxe, slot 0 of the SAME
//        player buys it at return, then accrue — slot 0 is paid the no-tool rate.
//   R4   (world-tick P5 fold) — not in this file; tests/world-tick-parity.mjs.
//   R5   a client-direct RPC on a stale row — F2 (lane C), NOT this lane. Noted.
//   S1   a sub-minute window writes nothing: no apply, no version bump beyond
//        the verb's own, accrued_to untouched.
//   S2   the settle DEFERS its sub-action remainder (the pointer survives):
//        after a paid settle, now − accrued_to is in (0, one action).
//   S3   the receipt reaches the client: `collected` on the body equals what
//        the database moved, the envelope is the post-settle+commit state, and
//        a commit refused AFTER a paid settle still carries `collected`.
//   S4   a partied character's settle verbs proceed WITHOUT a settle; its
//        switch verbs are still refused (party-fence second class).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { xpForLevel } from '../src/core/xp.js';

const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);

const ROW = (verb, bucket, v) =>
  `  ${verb}: Object.freeze({ bucket: '${bucket}', needsKey: true, collectsFirst: ${v} }),`;

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry plants a REAL defect in the edge half. `--mutate` demands every
   one turns the run RED; an anchor that does not match exactly once is a
   HARNESS failure, never a pass. */
const MUTATIONS = {
  flipCollect: {
    file: FN('intents.js'),
    why: 'claim_reward goes back to collectsFirst:false — a claim at return no longer settles '
       + 'the night first (R1c)',
    find: ROW('claim_reward', 'claim', 'true'),
    repl: ROW('claim_reward', 'claim', 'false'),
  },
  flipCollectMarket: {
    file: FN('intents.js'),
    why: 'market_buy goes back to collectsFirst:false — a pickaxe bought at return prices the '
       + 'whole night at the new tool (R1, R3)',
    find: ROW('market_buy', 'shop', 'true'),
    repl: ROW('market_buy', 'shop', 'false'),
  },
  flipCollectEat: {
    file: FN('intents.js'),
    why: 'eat goes back to collectsFirst:false — a feast eaten at return is paid over the whole '
       + 'absence and then runs its full duration anyway (R2)',
    find: ROW('eat', 'activity', 'true'),
    repl: ROW('eat', 'activity', 'false'),
  },
  settleStampsNow: {
    file: FN('set-activity.js'),
    why: 'the settle takes the switch\'s \'collect\' privilege — it stamps now() and forfeits the '
       + 'sub-action remainder on every purchase (S2)',
    find: '    callerAuthority: pointerSurvives ? null : CALLER_AUTHORITY,',
    repl: '    callerAuthority: CALLER_AUTHORITY,',
  },
  partySettles: {
    file: FN('settle-first.js'),
    why: 'a partied character settles anyway — the settle moves a watermark the party owns (S4)',
    find: "  if (o.partyOwnsWindow === true) return unchanged('party_owns_window');",
    repl: '',
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const argOf = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? null : hit.slice(n.length + 3);
};

const SEED = 0x5eed1e55;                         // the one harness privilege
const HOURS = 7.25;
const NODE = 'mithril_rock';
const ORE = 'mithril_ore';
const TOOL = 'iron_pickaxe';
const FEAST = 'hunters_feast';

const U = {
  seller: '00000000-0000-4000-bf1a-000000000001',
  a: '00000000-0000-4000-bf1a-00000000000a',      // R1 order A: buy, then accrue
  b: '00000000-0000-4000-bf1a-00000000000b',      // R1 order B: accrue, then buy
  t: '00000000-0000-4000-bf1a-00000000001f',      // R1 CONTROL: held the tool all night
  c: '00000000-0000-4000-bf1a-00000000000c',      // R3: the self-market loop (slots 0 and 1)
  d: '00000000-0000-4000-bf1a-00000000000d',      // R1c: claim at return
  e: '00000000-0000-4000-bf1a-00000000000e',      // R2 order A: eat, then settle
  f: '00000000-0000-4000-bf1a-00000000000f',      // R2 order B: settle, then eat
  s: '00000000-0000-4000-bf1a-000000000051',      // S1: sub-minute window
  p: '00000000-0000-4000-bf1a-000000000071',      // S4: partied
  g: '00000000-0000-4000-bf1a-000000000052',      // S2: the deferred remainder
};

const uuid = () => crypto.randomUUID();

/* Mutated modules are imported FROM DISK and import their siblings by relative
   path, so the function directory and src/ are copied to a temp root at the same
   depth, the patched file is overwritten there, and the copy is imported. */
async function loadModules(mutate) {
  const { pathToFileURL } = await import('node:url');
  let dir = FN('');
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    const src = (await readFile(m.file, 'utf8')).replace(/\r\n/g, '\n');
    const n = src.split(m.find).length - 1;
    if (n !== 1) {
      const e = new Error(`mutation "${mutate}" anchor matched ${n} times (need exactly 1)`);
      e.harness = true; throw e;
    }
    const { writeFile, mkdtemp, cp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const base = await mkdtemp(join(tmpdir(), 'hr-f1-'));
    dir = join(base, 'supabase', 'functions', 'hr-accrue');
    await cp(FN(''), dir, { recursive: true });
    await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
    await writeFile(join(dir, m.file.split(/[\\/]/).pop()), src.replace(m.find, m.repl), 'utf8');
  }
  const bust = `?t=${Date.now()}${Math.random()}`;
  const imp = async (f) => import(pathToFileURL(join(dir, f)).href + bust);
  const mods = {
    sa: await imp('set-activity.js'),
    mk: await imp('market.js'),
    eat: await imp('eat.js'),
    cr: await imp('claim-reward.js'),
    sb: await imp('shop-buy.js'),
    it: await imp('intents.js'),
  };
  /* The helper this lane adds. Absent on the base build — the arms that need
     it then report RED rather than the harness crashing. */
  try { mods.sf = await imp('settle-first.js'); } catch { mods.sf = null; }
  try { mods.pf = await imp('party-fence.js'); } catch { mods.pf = null; }
  return mods;
}

/** THE SEAM, as `hr_engine` (zero table privileges). The one harness privilege:
    the `seed` column of the seed read is replaced — see the header. */
function makeExec(db) {
  return async (text, params) => {
    await db.exec('set role hr_engine');
    let rows;
    try { rows = (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
    if (/hr_seed\(/.test(text) && rows[0] && 'seed' in rows[0]) rows[0] = { ...rows[0], seed: SEED };
    return rows;
  };
}

async function run(mutate) {
  const fails = [];
  const notes = [];
  const ok = (c, m) => { if (!c) fails.push(m); return !!c; };
  const mods = await loadModules(mutate);
  const { sa, mk, eat, cr, it } = mods;

  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    if (e.harness) throw e;
    return { fails: [`the migration chain would not apply: ${e.message}`], notes };
  }
  const exec = makeExec(db);
  const q = async (t, p) => (await db.query(t, p)).rows;
  const clearGate = () => db.query('delete from public.hr_rate_counters');

  const create = async (uid, slot = 0) => {
    await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query('insert into profiles(id, display_name) values ($1,$2) '
      + 'on conflict (id) do update set display_name = excluded.display_name', [uid, 'F1' + uid.slice(-4)]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.query('select public.hr_create_character($1::int)', [slot]);
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  };
  const qty = async (uid, item, slot = 0) => Number((await q(
    'select qty::text q from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3',
    [uid, slot, item]))[0]?.q ?? 0);
  const give = (uid, item, n, slot = 0) => q(
    `insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,$2,$3,$4)
     on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [uid, slot, item, n]);
  const xpOf = async (uid, skill, slot = 0) => Number((await q(
    'select xp::text x from public.player_skills where user_id=$1 and slot=$2 and skill_id=$3',
    [uid, slot, skill]))[0]?.x ?? 0);
  const row = async (uid, slot = 0) => (await q(
    `select version::text v, extract(epoch from accrued_to)*1000 as at_ms,
            extract(epoch from now())*1000 as now_ms, gold::text g, buffs
       from public.player_state where user_id=$1 and slot=$2`, [uid, slot]))[0];

  /** A miner at the production shape: Mining 61, no pickaxe anywhere, on
      mithril_rock, with the window open for 7.25 h. */
  const miner = async (uid, slot = 0) => {
    await q(
      `insert into public.player_skills (user_id, slot, skill_id, xp) values ($1,$2,'mining',$3)
       on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`,
      [uid, slot, xpForLevel(61)]);
    await q(`delete from public.player_inventory where user_id=$1 and slot=$2 and item_id like '%pickaxe'`,
      [uid, slot]);
    await q(`update public.player_state set gold = 100000, buffs = '[]'::jsonb,
               active_kind = 'gather', active_id = $3,
               active_since = now() - make_interval(secs => $4),
               accrued_to   = now() - make_interval(secs => $4)
             where user_id=$1 and slot=$2`, [uid, slot, NODE, HOURS * 3600]);
  };

  /** The accrue verb's settle — see the header for why it is driven through the
      collect. Reads with the `accrue` bucket, the gate index.ts spends. */
  const accrue = async (uid, slot = 0) => {
    await clearGate();
    const [read] = await exec(sa.READ_SQL, [uid, slot, 'accrue']);
    const env = read.state;
    const c = await sa.collectCurrentWindow({
      exec, user: uid, slot, env, st: env.state,
      nowMs: new Date(read.now).getTime(), capMs: Number(read.cap_ms) || 0,
    });
    if (!ok(c.outcome === 'paid' || c.outcome === 'nothing',
      `HARNESS: the accrue settle for ${uid.slice(-4)} was refused: ${JSON.stringify(c).slice(0, 240)}`)) return null;
    return c;
  };

  /** A listing of one iron pickaxe by `seller`, returned by id. */
  const listTool = async (seller, slot = 0) => {
    await clearGate();
    await give(seller, TOOL, 1, slot);
    const l = await mk.runMarketList({ exec, user: seller, slot, intentId: uuid(), item: TOOL, qty: 1, ask: 300 });
    ok(l.status === 200 && l.body.ok === true, `HARNESS: list refused ${JSON.stringify(l.body).slice(0, 200)}`);
    return l.body.receipt && l.body.receipt.listing_id;
  };
  const buyTool = async (uid, listing, slot = 0) => {
    await clearGate();
    return mk.runMarketBuy({ exec, user: uid, slot, intentId: uuid(), listing, qty: 1 });
  };

  try {
    for (const k of Object.keys(U)) await create(U[k]);
    /* Slot 1 is a hero slot: owned the way hr_buy_hero_slot records it (a
       `character_slot:1` flag), then created the way a player creates it. */
    await q(`insert into public.player_progress (user_id, slot, kind, key, period_key, value)
             values ($1, 0, 'flag', 'character_slot:1', '', 1)`, [U.c]);
    await create(U.c, 1);

    // ══ R1 — PRODUCTION SHAPE, A PICKAXE BOUGHT AT RETURN ════════════════
    const l1 = await listTool(U.seller);
    const l2 = await listTool(U.seller);
    const oreA0 = await qty(U.a, ORE); const xpA0 = await xpOf(U.a, 'mining');
    const oreB0 = await qty(U.b, ORE); const xpB0 = await xpOf(U.b, 'mining');
    const oreT0 = await qty(U.t, ORE);

    await miner(U.a);
    const bA = await buyTool(U.a, l1);
    ok(bA.status === 200 && bA.body.ok === true, `R1-CONTROL: order A's buy refused ${JSON.stringify(bA.body).slice(0, 240)}`);
    await accrue(U.a);

    await miner(U.b);
    const accB = await accrue(U.b);
    const bB = await buyTool(U.b, l2);
    ok(bB.status === 200 && bB.body.ok === true, `R1-CONTROL: order B's buy refused ${JSON.stringify(bB.body).slice(0, 240)}`);

    await miner(U.t);
    await give(U.t, TOOL, 1);
    await accrue(U.t);

    const oreA = (await qty(U.a, ORE)) - oreA0; const xpA = (await xpOf(U.a, 'mining')) - xpA0;
    const oreB = (await qty(U.b, ORE)) - oreB0; const xpB = (await xpOf(U.b, 'mining')) - xpB0;
    const oreT = (await qty(U.t, ORE)) - oreT0;
    notes.push(`R1: buy→accrue ore=${oreA} xp=${xpA} · accrue→buy ore=${oreB} xp=${xpB} · tool-all-night ore=${oreT}`);
    ok(oreB > 0 && oreT > oreB,
      `R1-CONTROL: the tool-all-night night paid ${oreT} ore against ${oreB} without it — the fixture `
      + 'does not discriminate a pickaxe, so an equality below would be vacuous');
    ok(oreA === oreB && xpA === xpB,
      `R1: a pickaxe bought at return re-priced the night that was mined without it — buy→accrue `
      + `paid ${oreA} ore / ${xpA} XP, accrue→buy paid ${oreB} ore / ${xpB} XP. The order of two `
      + 'gestures must not move value (production: +13.5 % ore, 2026-09-27).');

    // ══ S2 — THE SETTLE DEFERS ITS REMAINDER ═════════════════════════════
    //    A window of 1 h + 6.4 s at 12.80 s leaves 281 actions and a 9.6 s
    //    remainder. The pointer survives a purchase, so that remainder stays OPEN
    //    (accrued_to lands ~9.6 s before the commit's now); a switch's collect
    //    would stamp now() and forfeit it.
    {
      await miner(U.g);
      await q(`update public.player_state
                  set accrued_to = now() - interval '3606.4 seconds', active_since = now() - interval '3606.4 seconds'
                where user_id=$1 and slot=0`, [U.g]);
      await clearGate();
      const r = await mods.sb.runShopBuy({ exec, user: U.g, slot: 0, intentId: uuid(), offer: 'seed.turnip_seed', qty: 1 });
      ok(r.status === 200 && r.body.ok === true, `S2-CONTROL: the shop buy refused ${JSON.stringify(r.body).slice(0, 240)}`);
      const lag = Date.parse(r.body.now) - Number((await row(U.g)).at_ms);
      ok(lag > 6000 && lag < 12800,
        `S2: after the buy's settle, commit-now − accrued_to = ${lag.toFixed(0)} ms (expected ~9,600). `
        + 'A settle whose pointer survives must DEFER the sub-action remainder; ~0 means it stamped '
        + 'now() and forfeited the partial action on every purchase, > one action means it did not settle.');
    }

    // ══ S3 — THE RECEIPT REACHES THE CLIENT ══════════════════════════════
    {
      const c = bA.body.collected;
      ok(c && c.items && Number(c.items[ORE]) === oreA,
        `S3: the buy's body reports collected=${JSON.stringify(c && c.items)} but the database moved `
        + `${oreA} ${ORE}. Render it, do not recompute it — and it must be the server's number.`);
      const envOre = bA.body.inventory && Number(bA.body.inventory[ORE]);
      ok(envOre === await qty(U.a, ORE),
        `S3: the buy's envelope says ${envOre} ${ORE}, the database ${await qty(U.a, ORE)} — the `
        + 'envelope is not the post-settle, post-commit state');
      ok(bA.body.inventory && Number(bA.body.inventory[TOOL]) === 1,
        'S3: the buy\'s envelope does not show the pickaxe it just bought');
      ok(accB && accB.outcome === 'paid' && bB.body.collected === null,
        `S3: accrue→buy — the buy reported collected=${JSON.stringify(bB.body.collected)} for a `
        + 'window the accrue had already paid');

      /* A commit refused AFTER a paid settle still carries the settle's receipt. */
      await miner(U.a);
      await q(`delete from public.player_inventory where user_id=$1 and slot=0 and item_id=$2`, [U.a, TOOL]);
      const ore0 = await qty(U.a, ORE);
      const gone = await buyTool(U.a, uuid());
      const moved = (await qty(U.a, ORE)) - ore0;
      ok(gone.status === 409 && gone.body.ok === false,
        `S3-CONTROL: a buy of a listing that does not exist answered ${gone.status}`);
      ok(gone.body.collected && Number(gone.body.collected.items[ORE]) === moved && moved > 0,
        `S3: the settle paid ${moved} ${ORE} and the refused buy reported `
        + `collected=${JSON.stringify(gone.body.collected)}. The settle is its own apply and stays `
        + 'paid — the body has to be able to say so (set_activity\'s C5).');
    }

    // ══ R1c — claim_reward SETTLES FIRST ═════════════════════════════════
    {
      await miner(U.d);
      const ore0 = await qty(U.d, ORE);
      await clearGate();
      const r = await cr.runClaimReward({
        exec, user: U.d, slot: 0, intentId: uuid(), reward: { kind: 'daily', key: 'login' },
      });
      ok(r.status === 200 && r.body.ok === true,
        `R1c-CONTROL: the daily login claim refused ${JSON.stringify(r.body).slice(0, 240)}`);
      const moved = (await qty(U.d, ORE)) - ore0;
      const st = await row(U.d);
      ok(r.body.collected && Number(r.body.collected.items && r.body.collected.items[ORE]) === moved,
        `R1c: a claim at return reported collected=${JSON.stringify(r.body.collected)} (ore moved `
        + `${moved}). The claim must SETTLE the open night before it grants.`);
      ok(moved === oreB,
        `R1c: the claim's settle paid ${moved} ${ORE}; the accrue-first night paid ${oreB}. The same `
        + 'window at the same state must pay byte-identically.');
      ok(Number(st.now_ms) - Number(st.at_ms) < 12800,
        'R1c: the watermark did not move across the claim — the night is still open, priced later '
        + 'at whatever the claim granted');
    }

    // ══ R3 — THE SELF-MARKET LOOP, CROSS-SLOT ════════════════════════════
    {
      await clearGate();
      const lc = await listTool(U.c, 1);
      await miner(U.c, 0);
      const ore0 = await qty(U.c, ORE);
      const b = await buyTool(U.c, lc, 0);
      ok(b.status === 200 && b.body.ok === true,
        `R3-CONTROL: slot 0 could not buy slot 1's listing: ${JSON.stringify(b.body).slice(0, 240)}`);
      await accrue(U.c, 0);
      const ore = (await qty(U.c, ORE)) - ore0;
      notes.push(`R3: cross-slot buy→accrue ore=${ore} (no-tool night ${oreB}, tool night ${oreT})`);
      ok(ore === oreB,
        `R3: slot 0 bought its own slot 1's pickaxe at return and was paid ${ore} ${ORE} for a night `
        + `mined without it; the no-tool rate is ${oreB}. One tool relisted between five slots `
        + 'would re-price five nights.');
    }

    // ══ R2 — A FEAST EATEN AT RETURN ═════════════════════════════════════
    {
      const fighter = async (uid) => {
        await give(uid, FEAST, 1);
        await q(`update public.player_state
                    set max_hp = 900, hp = 900, buffs = '[]'::jsonb,
                        active_kind = 'combat', active_id = 'goblin',
                        active_since = now() - interval '2 hours', accrued_to = now() - interval '2 hours'
                  where user_id=$1 and slot=0`, [uid]);
      };
      const snap = async (uid) => {
        const inv = Object.fromEntries((await q(
          'select item_id, qty::text q from public.player_inventory where user_id=$1 and slot=0', [uid]))
          .map((r) => [r.item_id, Number(r.q)]));
        const sk = Object.fromEntries((await q(
          'select skill_id, xp::text x from public.player_skills where user_id=$1 and slot=0', [uid]))
          .map((r) => [r.skill_id, Number(r.x)]));
        const r = await row(uid);
        return { inv, sk, gold: Number(r.g) };
      };
      const diff = (a, b) => {
        const out = {};
        for (const part of ['inv', 'sk']) {
          const keys = new Set([...Object.keys(a[part]), ...Object.keys(b[part])]);
          for (const k of keys) {
            const d = (b[part][k] || 0) - (a[part][k] || 0);
            if (d) out[`${part}.${k}`] = d;
          }
        }
        if (b.gold !== a.gold) out.gold = b.gold - a.gold;
        return out;
      };
      const eatFeast = async (uid) => {
        await clearGate();
        return eat.runEat({ exec, user: U[uid], slot: 0, intentId: uuid(), item: FEAST, auto: false });
      };

      await fighter(U.e);
      const e0 = await snap(U.e);
      const ea = await eatFeast('e');
      ok(ea.status === 200 && ea.body.ok === true, `R2-CONTROL: order A's eat refused ${JSON.stringify(ea.body).slice(0, 240)}`);
      const eatAt = Number((await row(U.e)).now_ms);
      await accrue(U.e);
      const dE = diff(e0, await snap(U.e));

      await fighter(U.f);
      const f0 = await snap(U.f);
      await accrue(U.f);
      const fb = await eatFeast('f');
      ok(fb.status === 200 && fb.body.ok === true, `R2-CONTROL: order B's eat refused ${JSON.stringify(fb.body).slice(0, 240)}`);
      const dF = diff(f0, await snap(U.f));

      notes.push(`R2: eat→settle ${JSON.stringify(dE)}`);
      notes.push(`R2: settle→eat ${JSON.stringify(dF)}`);
      ok(Object.keys(dF).length > 2 && (dF['inv.' + FEAST] === -1),
        `R2-CONTROL: the settle-first night moved ${JSON.stringify(dF)} — no fight happened, or the `
        + 'feast was not eaten, so an equality would be vacuous');
      ok(JSON.stringify(Object.entries(dE).sort()) === JSON.stringify(Object.entries(dF).sort()),
        'R2: a Hunter\'s Feast eaten at return re-priced the two-hour fight before it — eat→settle '
        + `moved ${JSON.stringify(dE)}, settle→eat moved ${JSON.stringify(dF)}. A 15-minute food `
        + 'must never buy a night of +5 % drops.');
      const buffs = (await row(U.e)).buffs || [];
      const drop = buffs.find((b) => b && b.type === 'drop_rate');
      const left = drop ? Date.parse(drop.until) - eatAt : -1;
      ok(drop && left >= 900000 - 5000,
        `R2: after eat→settle the drop_rate buff has ${left} ms left of its 900,000 — the live `
        + `buff must keep its full duration (${JSON.stringify(buffs)})`);
    }

    // ══ S1 — A SUB-MINUTE WINDOW WRITES NOTHING ══════════════════════════
    {
      await miner(U.s);
      await q(`update public.player_state set accrued_to = now() - interval '30 seconds'
                where user_id=$1 and slot=0`, [U.s]);
      const before = await row(U.s);
      /* Rows a SETTLE writes (a window's pay), never rows a buy writes. */
      const settleRows = async () => Number((await q(
        `select count(*)::text n from public.player_ledger
          where user_id=$1 and kind in ('accrue','gather','combat','craft')`, [U.s]))[0].n);
      const ledger0 = await settleRows();
      await clearGate();
      const r = await mods.sb.runShopBuy({ exec, user: U.s, slot: 0, intentId: uuid(), offer: 'seed.turnip_seed', qty: 1 });
      const after = await row(U.s);
      const ledger1 = await settleRows();
      ok(r.status === 200 && r.body.ok === true, `S1-CONTROL: the shop buy refused ${JSON.stringify(r.body).slice(0, 240)}`);
      ok(Number(after.v) === Number(before.v) + 1,
        `S1: a buy over a 30 s window bumped version ${before.v} → ${after.v}; only the buy may write`);
      ok(Math.abs(Number(after.at_ms) - Number(before.at_ms)) < 1,
        'S1: a sub-minute window moved accrued_to — the settle wrote a window shorter than the floor');
      ok(ledger1 === ledger0, `S1: ${ledger1 - ledger0} settle ledger row(s) for a buy over a 30 s window`);
      ok(r.body.collected === null, `S1: collected=${JSON.stringify(r.body.collected)} for a window that paid nothing`);
    }

    // ══ S4 — THE PARTY FENCE'S SECOND CLASS ══════════════════════════════
    {
      ok(!!mods.sf && !!mods.pf && typeof mods.pf.partyRefusalFor === 'function',
        'S4: settle-first.js is missing — there is no settle-before-mutate implementation');
      if (mods.sf && mods.pf) {
        ok(mods.pf.partyRefusalFor('equip') === 'party_hunt_running'
           && mods.pf.partyRefusalFor('market_buy') === 'party_owns_window'
           && mods.pf.partyRefusalFor('eat') === 'party_owns_window'
           && mods.pf.partyRefusalFor('trophy_claim') === null,
          'S4: the fence does not split SWITCH (refused) from SETTLE (proceeds without its settle)');
        await miner(U.p);
        const before = await row(U.p);
        const [read] = await exec(sa.READ_SQL, [U.p, 0, 'shop']);
        const s = await mods.sf.settleBeforeMutate({
          exec, user: U.p, slot: 0, verb: 'market_buy', env: read.state,
          nowMs: new Date(read.now).getTime(), capMs: Number(read.cap_ms) || 0, partyOwnsWindow: true,
        });
        const after = await row(U.p);
        ok(s.proceed === true && s.collected === null && after.v === before.v && after.at_ms === before.at_ms,
          'S4: a partied character\'s settle verb moved its watermark — hr_party_tick_settle owns '
          + `that window (§18.4 T-5b). version ${before.v}→${after.v}`);
      }
    }

    // ══ R5 — NOT THIS LANE ═══════════════════════════════════════════════
    notes.push('R5: client-direct RPCs on a stale row (hr_claim_quest/goal/daily/milestone/rank, '
      + 'hr_set_auto_eat, hr_credit_kills) are F2 (lane C, hr_require_settled). The literal '
      + 'production path — road_forge claimed via hr_claim_quest — stays open until F2 applies.');
  } catch (e) {
    if (e && e.harness) throw e;
    fails.push(`unexpected: ${e && e.stack || e}`);
  } finally {
    await db.close();
  }
  return { fails, notes };
}

// ════════════════════════════════════════════════════════════════════════
async function main() {
  if (has('list')) {
    for (const [k, m] of Object.entries(MUTATIONS)) console.log(`${k.padEnd(20)} ${m.why}`);
    return 0;
  }
  const one = argOf('mutate');
  if (has('mutate') || has('selftest') || one) {
    const ids = one ? [one] : Object.keys(MUTATIONS);
    let slipped = 0;
    for (const id of ids) {
      const { fails } = await run(id);
      if (fails.length) console.log(`  CAUGHT   ${id} — ${fails[0].slice(0, 160)}`);
      else { slipped++; console.log(`  SLIPPED  ${id} — ${MUTATIONS[id].why}`); }
    }
    console.log(slipped ? `absence-priced-at-return --mutate: ${slipped} SLIPPED` : `absence-priced-at-return --mutate: all ${ids.length} caught`);
    return slipped ? 1 : 0;
  }
  const { fails, notes } = await run(null);
  if (has('verbose') || fails.length) for (const n of notes) console.log(`  · ${n}`);
  if (fails.length) {
    console.log(`absence-priced-at-return: RED — ${fails.length} failure(s)`);
    for (const f of fails) console.log(`  ✗ ${f}`);
    return 1;
  }
  console.log('absence-priced-at-return: OK — settle-before-mutate: R1 pickaxe-at-return, R1c claim settles, '
    + 'R2 feast-at-return, R3 self-market loop, S1 sub-minute no-write, S2 remainder deferred, '
    + 'S3 receipt on body+refusal, S4 party second class (real PG + the deployed edge modules)');
  return 0;
}

main().then((c) => process.exit(c), (e) => {
  console.error(e && e.harness ? `harness: ${e.message}` : (e && e.stack || e));
  process.exit(2);
});
