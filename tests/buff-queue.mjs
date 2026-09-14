#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/buff-queue.mjs — THE SERVER OWNS THE BUFF CLOCK, PROVEN BY EXECUTION
//                        ON A REBUILT CHAIN.
//
//   node tests/buff-queue.mjs             the guard
//   node tests/buff-queue.mjs --list      the mutations
//   node tests/buff-queue.mjs --mutate=<id>   plant ONE defect, show the result
//   node tests/buff-queue.mjs --selftest  clean baseline green, every mutation RED
//
// ── WHAT IT IS FOR ─────────────────────────────────────────────────────────
// 2026-09-13-consumable-buffs.sql moves the buff clock onto the server:
// player_state.buffs = [{type, magnitude, until}] with an ABSOLUTE expiry, one
// new delta key `buff_apply = {item}` that resolves everything else from
// hr_item_buffs under the character lock, and a top-level `buffs` projection the
// accrual engine drains. 2026-09-13-client-state-buffs-denylist.sql takes the
// forgeable shadow copy away.
//
// The migrations carry strong §4 self-checks, but a §4 fires ONCE, at apply time.
// The regression that brings a buff forgery back is a LATER migration restating
// hr_apply from a stale template — at which point no §4 ever runs again and this
// guard is the only thing left standing. So every mutation below is ALSO run with
// the two §4 blocks SHORT-CIRCUITED, and the tick has to come from THIS FILE's
// assertions. A tick that only means "the apply threw" proves the migration can
// fail, not that anything is watching (the renown-faucet lesson).
//
// ── WHAT IT PROVES ─────────────────────────────────────────────────────────
//   [1] REACHABILITY — no client role holds EXECUTE on hr_apply / hr_state_of,
//       and a real call as `authenticated` is refused 42501. Without this, every
//       assertion below is decoration.
//   [2] THE CATALOGUE IS NOT A SECOND COPY — every hr_item_buffs row equals the
//       `buff` block in src/data/items.js, field for field, and every buff food
//       in that file has a row. This repo has been burned by a data double-copy
//       (src/main.js unifyObject) and hr_castle_items is still the hand-seeded
//       counter-example; a price list that drifts pays the wrong buff for ever.
//   [3] THE SERVER STAMPS THE CLOCK — a valid apply lands `until` at
//       now() + the CATALOGUE duration (±5 s) with the CATALOGUE type and
//       magnitude, none of which appeared in the delta.
//   [4] A FORGED FIELD IS REFUSED BY NAME — `until`, `magnitude`, `type`,
//       `duration_ms`, `remaining_ms` and `scale` each refuse the whole apply as
//       **bad_buff_shape**/forbidden_key with the queue UNMOVED. Refused, not
//       ignored: "ignored today" is one careless edit from "read tomorrow". It is
//       its OWN code (2026-09-13-buff-shape-code.sql) because a caller that
//       invented a field is not a player who ate a Trout, and hr_rejections
//       aggregates per (user, slot, day, code).
//  [3b] A BUFF MUST BE PAID FOR (F3, 2026-09-13-buff-apply-coupling.sql) — a
//       buff_apply with NO `items[<item>] = -1` in the SAME delta is refused
//       `buff_not_paid` with the queue and the bag unmoved, and 0 / -2 / +1 / +5
//       do not pay either. Without it the possession check would live in the Edge
//       Function, which is the layer that PROPOSES, not the one holding the lock.
//   [5] AN UNKNOWN OR NON-BUFF ITEM IS REFUSED — including a real item that
//       carries no buff, a numeric item, a string delta and an array delta.
//   [6] STACKING IS A MERGE — a second helping EXTENDS the tail (never restarts
//       it), a stronger dish raises the magnitude to max(old,new), a weaker one
//       cannot dilute it, the type stays ONE row, and a different type JOINS.
//   [7] THE CAP AND buff_at_max — repeated consumes land exactly on
//       now()+3,600,000 ms and the next one is REFUSED as buff_at_max with the
//       gold in the very same delta unmoved (the designer's rule: never eat the
//       item for nothing).
//   [8] IDEMPOTENCY — the same intent_id twice buffs ONCE.
//   [9] THE PROJECTION — top-level `buffs` with a server-derived remaining_ms,
//       an expired entry carried at 0 (the away engine needs it), and the three
//       neighbours the splice could have eaten still projected.
//  [10] AWAY-1 — with no live buff, the accrual engine's output is BYTE-IDENTICAL
//       across `buffs` absent / [] / an expired queue. This is the arm that says
//       the feature is inert until a buff is really running.
//  [11] …AND IT IS NOT INERT WHEN ONE IS — the same window with a live damage
//       buff pays MORE. A wiring that returned zero would satisfy [10] perfectly.
//  [12] NO CLIENT WRITE SURFACE — player_state has no non-read RLS policy and no
//       client role holds a write grant on hr_item_buffs.
//  [13] THE SHADOW COPY IS GONE — a client_state PUT carrying `buffs` is refused
//       forbidden_field, an HONEST residue PUT still saves, and `buffs` is not in
//       RESIDUE_FIELDS (which would refuse every residue patch for every player).
//  [14] A SECOND APPLY IS A NO-OP — both files re-apply with all three bodies
//       byte-identical and exactly one CHECK constraint. They patch bodies ten
//       patches deep; a double-patch is a silent corruption of the engine.
//  [16] PER-SEGMENT STACKING (F2) — all four orderings by execution (weaker
//       waits / stronger starts now and covers / an outliving weaker resumes /
//       same magnitude extends one segment), the per-type segment budget refuses a
//       ninth without eating the food, and src/core/buffs.js pays the RUNNING
//       segment rather than the SUM (measured 0.07 before the fix — the cheap food
//       adding to the expensive one).
// ⚠ ARM-TABLE NOTE: later files that PIN this block's text must be blinded here
//   (see the BLIND map) — otherwise their gate raises, the chain refuses and a
//   mutation scores HARNESS instead of the tick it earned.
//  [17] F4 — a buff food is neither equippable nor a rune, and the census of
//       inventory-CREDITING sites in hr_apply is pinned, so no future delta can
//       refund the food it just debited for a buff.
//  [18] THE EMITTER'S OWN DELTA — the delta `eat` actually builds (eat.js
//       eatDelta) is applied, not a hand-written imitation: it is accepted, it
//       buffs once, it spends exactly one serving, an AUTO eat debits and buffs
//       NOTHING, and a capped queue refuses it buff_at_max with the food still in
//       the bag. The join between the two halves; neither half's tests see it.
//  [19] THE EAT DELTA DOES NOT CLOSE THE ACCRUAL WINDOW and always carries the
//       debit beside buff_apply (the F3 coupling, emitter side).
//  [20] AWAY — a buff alive at the window start pays only until `until`, and no
//       client clock can pause it (the active:false freeze is gone).
//  [21] THE CELLAR SCALES THE CLOCK, AND ONLY THE SERVER SAYS SO (step 3) —
//       with no Cellar a buff lasts exactly the catalogue duration and is stamped
//       scale 1.0; on the top rung the SAME food lasts twice as long and is stamped
//       2.0; every rung in between pays its OWN payload from hr_room_perks (which
//       is checked against src/data/perks.js, so the SQL is not a second copy of a
//       balance ladder); the envelope carries the scale and a pre-scale segment
//       projects 1.0; the 60-minute ceiling still binds; and the client cannot send
//       a scale — that arm is [4], which already fires `scale` by name.
//  [15] ONE CEILING, ONE NUMBER — hr_apply's c_buff_max_ms and src/core/buffs.js
//       BUFF_MAX_UNTIL_MS agree. Two numbers for one bound is two that can drift.
//
// NO CREDENTIALS. NO NETWORK. Production is untouched — this is a rebuild.
// NO `?v=` on the imports (tests/**, not a browser module — b332).
// Exit: 0 green · 1 a violation · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { HR_APPLY_FINAL, HR_APPLY_S3_BLIND } from './hr-apply-final-body.mjs';
import { runMutationProof } from './mutation-proof.mjs';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ROOM_PERKS } from '../src/data/perks.js';
import { BUFF_MAX_UNTIL_MS, BUFFS_DEF, buffQueueFromServer, buffBonusFor, tickBuffs }
  from '../src/core/buffs.js';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
/* THE EMITTER ITSELF (step 2). [16]/[17] apply the delta the `eat` verb actually
   builds rather than a hand-written imitation of it, which is the only way this
   guard can see the two halves of the feature drift apart. */
import { eatDelta, resolveFood, runEat } from '../supabase/functions/hr-accrue/eat.js';
import { deltaClosesWindow } from '../supabase/functions/hr-accrue/intents.js';

/* ── THE FINAL-BODY RULE, AFTER THE RESTATEMENT (2026-09-14) ────────────
   Every anchor below that edits hr_apply's BODY now names MIG_APPLY. hr_apply is
   RESTATED WHOLE by 2026-09-14-hr-apply-restatement.sql, which runs LAST, so the
   six buff files' splices are drafts it overwrites: an arm left pointing at one
   of them mutates text the database never runs. That is the same lesson this
   file already learned twice (see client_authors_until and second_helping_-
   restarts) — it just has one answer now instead of six. The hr_state_of and
   catalogue arms are UNCHANGED: those bodies are still owned by their own files.
   tests/hr-apply-final-body.mjs holds the constant and the §3 blind. */
const MIG_APPLY = HR_APPLY_FINAL;
const MIG = '2026-09-13-consumable-buffs.sql';
const MIG_DENY = '2026-09-13-client-state-buffs-denylist.sql';
const MIG_CAT = '2026-09-13-item-buffs-catalogue.generated.sql';
const MIG_PAY = '2026-09-13-buff-apply-coupling.sql';
const MIG_SEG = '2026-09-13-buff-segments.sql';
const MIG_SHAPE = '2026-09-13-buff-shape-code.sql';
const MIG_SCALE = '2026-09-13-buff-cellar-scale.sql';
const MIG_PRED = '2026-09-13-buff-segments-predicate.sql';
const U = '00000000-0000-4000-8000-0000000000b5';
const J = { kind: 'admin', intent: 'buff-queue:probe' };
const CAP_MS = 3600000;

const harness = (m) => { const e = new Error(m); e.harness = true; return e; };

/* The FINAL body for hr_put_client_state__ungated: the deny-list this chain
   installs is patched once more by the projection purge, so a mutation to the
   text above has to account for it (see the BLIND entry). */
const MIG_PROJ = '2026-09-14-client-state-projection-denylist.sql';

/* ── THE §4 BLINDS ─────────────────────────────────────────────────────────
   Each migration's self-check is short-circuited with a `return;` at the head of
   its block, so a mutation's tick must come from THIS guard. A §4 fires once at
   apply time; the regression that matters is a later restatement, when it never
   fires again. */
const BLIND = {
  /* THE RESTATEMENT'S §3 (2026-09-14). It pins the CODE hash of the body it
     installs, so ANY body mutation makes it raise at apply time — correctly, and
     as a MIGRATION gate rather than this guard's tick. Every arm here runs
     gate-blind, so it is short-circuited for all of them. */
  [HR_APPLY_FINAL]: HR_APPLY_S3_BLIND,
  /* ⚠ LATER FILES THAT *PIN* THIS BLOCK'S TEXT MUST BE BLINDED HERE TOO.
     2026-09-13-rejections-verb-map-2.sql's GATE(e) is a SHAPE PIN on hr_apply it
     does not own: `buff_at_max` must be raised from exactly 2 sites with
     why='segment_budget' on one. A mutation that changes the buff block can make
     that pin RAISE, the chain refuse, and the arm score HARNESS instead of the
     tick it earned — measured on the set at 672296e2 (`second_helping_restarts`,
     exit 2) when the mutation still edited text a later file re-splices. The
     durable answer is two-part: plant every mutation in the file that owns the
     LIVE text (see second_helping_restarts / merge_replaces_other_types), AND
     blind any downstream gate that asserts this block's literal shape. Blinded
     NARROWLY — only the pin's `if`, so the rest of that file's §5 still runs. */
  '2026-09-13-rejections-verb-map-2.sql': [
    "  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is not null then",
    '  if false then  -- GATE(e) SHAPE PIN BLINDED FOR THE MUTATION PROOF (tests/buff-queue.mjs)'],
  [MIG]: ["  -- (a) THE COLUMN: present, jsonb, NOT NULL, defaulted to '[]'.",
    "  return;  -- §4 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)\n"
    + "  -- (a) THE COLUMN: present, jsonb, NOT NULL, defaulted to '[]'."],
  /* The coupling file's \u00a72. Anchored on its FIRST assertion rather than on the
     `v_apply := replace(pg_get_functiondef(` line, which \u00a70 uses too \u2014 an anchor
     that matches twice lands the blind in whichever block came first, and
     bootReplay (correctly) calls that a harness error rather than guessing. */
  [MIG_PAY]: ["  if strpos(v_apply, 'buff_not_paid') = 0 then",
    '  return;  -- \u00a72 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)\n'
    + "  if strpos(v_apply, 'buff_not_paid') = 0 then"],
  /* ⚠ THE FINAL BODY FOR hr_put_client_state__ungated IS A LATER FILE'S
     (2026-09-14-client-state-projection-denylist.sql), and it PINS this chain's
     deny-list text: §0 counts the `'buffs'` tail anchor and refuses to patch a
     body it cannot account for, then §2 asserts its own nine keys installed. Under
     `denylist_key_typo` both are true failures of a mutated chain and neither is
     this guard's tick, so both are blinded — narrowly, one `if` and one `return`,
     leaving that file's §1 patch and its grant re-statement to run. Without this
     the arm scores HARNESS and the typo goes unproven. */
  [MIG_PROJ]: [
    ["  if v_n <> 1 then", "  if false then  -- ANCHOR COUNT BLINDED FOR THE MUTATION PROOF (tests/buff-queue.mjs)"],
    ["  -- (a) EVERY key installed, and every PRE-EXISTING authority key SURVIVED. A",
      "  return;  -- §2 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)\n"
      + "  -- (a) EVERY key installed, and every PRE-EXISTING authority key SURVIVED. A"],
  ],
  /* The predicate file's §2 — its own (c1)/(c2) assertions catch the two predicate
     mutations, so without this blind the tick would be "the migration refused"
     rather than "this guard noticed" (MEASURED: merge_replaces_other_types threw). */
  [MIG_PRED]: ['  -- (a) THE PATCH LANDED, and nothing else in the buff block moved.',
    ['  return;  -- §2 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)',
      '  -- (a) THE PATCH LANDED, and nothing else in the buff block moved.'].join('\n')],
  /* The shape-code file's §2, anchored on its first assertion. */
  [MIG_SHAPE]: ["  if strpos(v_apply, $q$perform public.hr_reject('bad_buff_shape',$q$) = 0 then",
    '  return;  -- §2 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)\n'
    + "  if strpos(v_apply, $q$perform public.hr_reject('bad_buff_shape',$q$) = 0 then"],
  /* The segments file's §3, anchored on its first assertion. */
  [MIG_SEG]: ["  if strpos(v_apply, 'v_buff_newmag := greatest(v_buff_mag') > 0 then",
    '  return;  -- §3 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)\n'
    + "  if strpos(v_apply, 'v_buff_newmag := greatest(v_buff_mag') > 0 then"],
  /* The cellar-scale file's §3, anchored on its first assertion. Its own arms
     catch every scale mutation by raising at apply time, which would score the
     tick as "the migration refused" rather than "this guard noticed". */
  [MIG_SCALE]: ["  -- ── (a) THE TEXT, AND THE PREDECESSORS ────────────────────────────────────",
    ['  return;  -- §3 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)',
      '  -- ── (a) THE TEXT, AND THE PREDECESSORS ────────────────────────────────────'].join('\n')],
  [MIG_DENY]: ["  v_def := pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure);",
    '  return;  -- §2 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)\n'
    + "  v_def := pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure);"],
};

/* ── THE MUTATION CATALOGUE ───────────────────────────────────────────────
   Every `find` must match EXACTLY ONCE in its file (bootReplay raises a harness
   error otherwise, so a drifted anchor is repaired rather than scored green).
   `pairs` exists because one DEFECT is sometimes two lines: "the client authors
   the magnitude" needs the forgery gate disarmed AND the value read, and
   splitting it would produce an unreachable mutation that stays green for the
   right reason and the wrong proof. */
const MUTATIONS = {
  forgery_gate_off: {
    file: MIG_APPLY,   // was MIG — hr_apply body
    why: "the forbidden-key refusal is disarmed, so a buff_apply carrying `until` or `magnitude` is "
       + 'ACCEPTED (silently ignored today) — one edit away from being read, and unreviewable',
    pairs: [["      if exists (select 1 from jsonb_object_keys(p_delta->'buff_apply') as t(bk)\n                  where t.bk <> 'item') then",
      "      if exists (select 1 from jsonb_object_keys(p_delta->'buff_apply') as t(bk)\n                  where false) then"]],
  },
  client_authors_magnitude: {
    /* TWO FILES, one defect: the forgery gate lives in consumable-buffs.sql and the
       magnitude ASSIGNMENT moved to buff-segments.sql when max() was replaced by
       "its own magnitude". Mutating the old assignment text made the segments
       file's splice no-op, which cascaded into the predicate file refusing to
       install — a harness error three files downstream (MEASURED). */
    file: MIG_APPLY,   // was MIG + MIG_SEG — both halves are hr_apply body
    pairs: [
      ["                  where t.bk <> 'item') then", '                  where false) then'],
      ['      v_buff_newmag := v_buff_mag;',
        "      v_buff_newmag := coalesce((p_delta->'buff_apply'->>'magnitude')::numeric, v_buff_mag);"],
    ],
    why: 'THE ONE CLAUDE.md §1 FORBIDS BY NAME: the client\'s own `magnitude` reaches the stored buff '
       + '(forgery gate off + the delta read), so a browser sets its own damage bonus',
  },
  client_authors_until: {
    /* RE-POINTED (step 3). The forgery gate is still consumable-buffs.sql's, but
       the `until` COMPUTATION now lives in 2026-09-13-buff-cellar-scale.sql, which
       re-splices it to multiply by the perk scale. Mutating the old text made that
       file's anchor match zero times, the chain refused, and the arm scored
       HARNESS instead of the tick it earned — the same lesson as
       second_helping_restarts: plant the mutation in the file that owns the LIVE
       text. Anchored on the comment line above it, because the bare assignment
       appears TWICE in that file (its `find` anchor and its replacement). */
    file: MIG_APPLY,   // was MIG + MIG_SCALE — both halves are hr_apply body
    pairs: [
      ["                  where t.bk <> 'item') then", '                  where false) then'],
      ['      -- ceiling a queue may stand on.\n      v_buff_until := least(v_buff_base',
        "      -- ceiling a queue may stand on.\n"
        + "      v_buff_until := coalesce((p_delta->'buff_apply'->>'until')::timestamptz, v_buff_base);\n"
        + '      v_buff_until := least(v_buff_until'],
    ],
    why: 'the client\'s own `until` reaches the stored buff — a browser grants itself a buff that never '
       + 'expires, which is the whole reason the expiry is an absolute server stamp',
  },
  cap_refusal_off: {
    file: MIG_APPLY,   // was MIG — hr_apply body
    why: 'buff_at_max never fires, so a queue already at the ceiling silently eats the food for nothing '
       + '(the designer ruling this file exists to honour)',
    /* `and false` rather than `if false`: the segments file's §0 requires the literal
       `v_buff_gain < v_buff_need` to be present before it will install its
       per-segment form, so deleting the text makes the CHAIN refuse and the arm a
       harness error instead of a tick (MEASURED). The fuse is dead either way. */
    pairs: [['      if v_buff_gain < v_buff_need then',
      '      if v_buff_gain < v_buff_need and false then']],
  },
  min_gain_fuse_off: {
    file: MIG_APPLY,   // was MIG — hr_apply body
    why: 'the minimum-gain fuse degenerates back to `base >= cap`, which is UNREACHABLE across two '
       + 'transactions because the cap moves with now() — the defect the migration shipped in its first '
       + 'draft, which its own §4 could not see (a migration applies inside ONE transaction, where '
       + 'now() is frozen and the equality really does hold)',
    /* The literal survives (see cap_refusal_off) and the EFFECTIVE condition is the
       old, unreachable `base >= cap`: gain < need is implied by it, so ANDing them
       reproduces exactly the first draft's defect. */
    pairs: [['      if v_buff_gain < v_buff_need then',
      '      if v_buff_gain < v_buff_need and v_buff_base >= v_buff_cap then']],
  },
  clamp_off: {
    /* RE-POINTED (step 3), same reason as client_authors_until: the clamp lives in
       the expression 2026-09-13-buff-cellar-scale.sql now owns. Anchored WITH the
       make_interval line above it, which carries `v_buff_scale` and so appears
       exactly once. */
    file: MIG_APPLY,   // was MIG_SCALE — hr_apply body
    why: 'the 60-minute expiry clamp is gone, so 400 pies before bed bank eight hours of buffed away '
       + 'output — the stock ceiling that replaces a per-day clamp',
    pairs: [['                              + make_interval(secs => (v_buff_dur * v_buff_scale) / 1000.0),\n'
      + '                            v_buff_cap);',
    '                              + make_interval(secs => (v_buff_dur * v_buff_scale) / 1000.0),\n'
      + "                            v_buff_base + interval '400 hours');"]],
  },
  cellar_scale_ignored: {
    file: MIG_APPLY,   // was MIG_SCALE — hr_apply body
    why: 'the Cellar rung is read and then multiplied by zero, so a player who paid 320,000 gold for The '
       + 'Deep Cellar gets exactly the duration of a player who owns no Cellar — the residue-ahead defect '
       + 'the file exists to close, and one no §4 would see once it stopped running',
    pairs: [['      v_buff_scale := least(greatest(c_buff_scale * (1 + coalesce(v_buff_bonus, 0)),',
      '      v_buff_scale := least(greatest(c_buff_scale * (1 + 0 * coalesce(v_buff_bonus, 0)),']],
  },
  cellar_scale_not_projected: {
    file: MIG_SCALE,
    why: 'a segment stamped BEFORE the scale existed projects a fabricated number instead of an honest '
       + '1.0, so Active Effects tells a player their buff was multiplied by something that never '
       + 'happened',
    pairs: [["               'scale', coalesce((e.v->>'scale')::numeric, 1),",
      "               'scale', coalesce((e.v->>'scale')::numeric, 99),"]],
  },
  cellar_scale_not_journalled: {
    file: MIG_APPLY,   // was MIG_SCALE — hr_apply body
    why: 'the scale used stops reaching the append-only journal, so "why did that buff last twenty '
       + 'minutes" becomes unanswerable from the ledger — the only durable record',
    pairs: [["      'bs', case when p_delta ? 'buff_apply' and coalesce(v_buff_scale, 1) <> 1",
      "      'bs', case when false and p_delta ? 'buff_apply' and coalesce(v_buff_scale, 1) <> 1"]],
  },
  merge_replaces_other_types: {
    /* Re-pointed twice now: the rebuild moved to the segments file, then its
       predicate moved again to the predicate file (the repo/production
       convergence). A mutation belongs in whichever file owns the LIVE text. */
    file: MIG_APPLY,   // was MIG_PRED — hr_apply body
    why: 'the rebuild keeps only the type being applied, so eating a second dish DELETES the buff of '
       + 'every other type — a player pays for a Feast and loses the one they were running',
    /* ` and false` appended, NOT the predicate replaced: `and ((false` leaves the
       expression's parentheses unbalanced, the file fails to INSTALL, and a file
       that will not install is a harness error dressed up as a catch (MEASURED —
       "INTO specified more than once"). A mutation must apply CLEAN. */
    /* PLANTED IN THE FILE THAT OWNS THE LIVE TEXT. The type-explicit predicate
       lives in 2026-09-13-buff-segments-predicate.sql now: buff-segments.sql was
       reverted to the text production applied, so mutating it here would patch a
       string the next file replaces anyway. */
    pairs: [["              or ((e.v->>'type') = v_buff_type",
      "              or ((e.v->>'type') = v_buff_type and false"]],
  },
  /* ⚠ `magnitude_replaces_instead_of_max` LIVED HERE AND IS DELETED, not re-pointed.
     It inverted the max() merge — a rule that no longer exists: per-segment stacking
     replaced it with "each segment carries its OWN magnitude", so the text it
     mutated is text 2026-09-13-buff-segments.sql re-splices, and mutating it only
     stopped the segment model from installing (a harness error, MEASURED). Its
     PROPERTY — a cheap food must never carry an expensive magnitude — is owned by
     `segment_magnitude_laundered` below, which mutates the LIVE assignment and
     restores the real laundering. A mutation whose rule has been superseded is not
     re-pointed; it is removed, and the arm that replaced it is named. */
  second_helping_restarts: {
    /* OWNED BY THE SEGMENTS FILE NOW. It used to patch consumable-buffs.sql's base
       assignment — text 2026-09-13-buff-segments.sql REPLACES — so the mutation
       made that file's anchored splice no-op and the arm measured "the segment
       model did not install" instead of "the tail restarts". A mutation has to be
       planted in the file that owns the LIVE text, or its label is fiction. */
    file: MIG_APPLY,   // was MIG_SEG — hr_apply body
    why: 'the tail is computed from now() instead of max(now, the latest at-least-as-strong expiry), so a '
       + 'second helping RESTARTS the buff and the minutes already paid for are thrown away',
    pairs: [['      v_buff_base := greatest(v_buff_now, coalesce(v_buff_base, v_buff_now));',
      '      v_buff_base := v_buff_now;']],
  },
  catalogue_bypassed: {
    file: MIG_APPLY,   // was MIG — hr_apply body
    why: 'the item id stops selecting the row, so ANY item id resolves to some buff — a Trout becomes a '
       + 'Feast and the allowlist hr_item_buffs exists to be is gone',
    pairs: [['        from public.hr_item_buffs b where b.item_id = v_buff_item;',
      '        from public.hr_item_buffs b order by b.item_id limit 1;']],
  },
  projection_always_empty: {
    file: MIG,
    why: 'hr_state_of projects the key but reads a constant empty array instead of the column, so every '
       + 'buff is paid to nobody while the column fills up — the b341 class and the plotLevels '
       + 'false-green. (It replaced a KEY-RENAME mutation: renaming the key deletes the literal '
       + "2026-09-13-buff-segments.sql's §0 requires, so the CHAIN refused and the arm was a harness "
       + 'error instead of a tick — MEASURED.)',
    pairs: [["        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)\n    ), '[]'::jsonb),",
      "        from jsonb_array_elements('[]'::jsonb) as e(v)\n    ), '[]'::jsonb),"]],
  },
  remaining_ms_dead: {
    file: MIG,
    why: 'remaining_ms is projected as 0 for every entry, so the client renders no countdown and the '
       + 'step-2 reconcile would drop every live buff as expired',
    pairs: [["               'remaining_ms', greatest(0, floor(\n                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)",
      "               'remaining_ms', 0::bigint)"]],
  },
  denylist_key_typo: {
    file: MIG_DENY,
    why: "the deny-list gains 'buffsX' instead of 'buffs', so the forgeable client_state shadow copy "
       + 'survives — Security\'s condition silently unmet while the migration reports success',
    pairs: [["    'buffs'$new$);", "    'buffsX'$new$);"]],
    /* ⚠ THIS ARM MUTATES TEXT A LATER FILE PINS. 2026-09-14-client-state-
       projection-denylist.sql anchors its own patch on the `'buffs'` this file
       leaves behind and counts it, so the typo made THAT file refuse and the arm
       scored HARNESS instead of the tick it earns. The rule in the BLIND map
       applies verbatim: blind the downstream gate (narrowly), keep the tick where
       it belongs — this guard's own assertion that a forged buff patch is refused. */
  },
  payment_gate_off: {
    file: MIG_APPLY,   // was MIG_PAY — hr_apply body
    why: 'F3 is disarmed: a buff_apply with NO debit is accepted, so the possession check moves into '
       + 'the Edge Function — the layer that PROPOSES rather than the one that holds the lock — and a '
       + 'stale engine buffs a character who owns nothing',
    /* THE WHOLE CONDITION, not its first arm. Disarming one arm of an OR chain
       leaves the others refusing, so the first attempt at this mutation stayed
       green for the right reason and the wrong proof (MEASURED). */
    pairs: [[[
      "      if coalesce(jsonb_typeof(p_delta->'items'), '') <> 'object'",
      "         or coalesce(jsonb_typeof(p_delta->'items'->v_buff_item), '') <> 'number'",
      "         or (p_delta->'items'->>v_buff_item)::numeric <> -1 then",
    ].join('\n'), '      if false then']],
  },
  payment_accepts_any_quantity: {
    file: MIG_APPLY,   // was MIG_PAY — hr_apply body
    why: 'the debit stops having to be exactly -1, so a CREDIT of the food pays for the buff — eat the '
       + 'pie, keep the pie, and gain one more',
    pairs: [["         or (p_delta->'items'->>v_buff_item)::numeric <> -1 then",
      "         or false then"]],
  },
  segment_ignores_strength: {
    file: MIG_APPLY,   // was MIG_SEG — hr_apply body
    why: 'the new segment queues behind EVERY live segment of the type rather than only the '
       + 'stronger-or-equal ones, so a Feast eaten while a Roasted Carrot runs does NOTHING until the '
       + 'carrot expires — the player pays 2,600 gold and sees no change',
    pairs: [["         and (e.v->>'magnitude')::numeric >= v_buff_mag;", '         and true;']],
  },
  segment_keeps_covered_weaker: {
    file: MIG_APPLY,   // was MIG_PRED — hr_apply body
    why: 'a weaker segment the new one COVERS survives instead of being dropped, so its time did not '
       + 'pass while the stronger effect ran — the buff clock pauses, which is the exact property the '
       + 'absolute `until` model removed (BUFF_DRAIN_RULE)',
    /* The predicate file owns this text now (see merge_replaces_other_types), and
       the COVERAGE lines are byte-identical in that file's anchor and its
       replacement — so the find SPANS the line unique to the new form, and the
       coverage test becomes `true`: every live same-type segment is kept, i.e. a
       covered weaker one survives. */
    pairs: [[[
      "              or ((e.v->>'type') = v_buff_type",
      '                  and not (v_buff_same is not null and e.v = v_buff_same)',
      "                  and ((e.v->>'magnitude')::numeric >= v_buff_mag",
      "                       or (e.v->>'until')::timestamptz > v_buff_until)));",
    ].join('\n'), [
      "              or ((e.v->>'type') = v_buff_type",
      '                  and not (v_buff_same is not null and e.v = v_buff_same)',
      '                  and (true)));',
    ].join('\n')]],
  },
  segment_budget_off: {
    file: MIG_APPLY,   // was MIG_SEG — hr_apply body
    why: 'the per-type segment budget is disarmed, so the entry count is bounded only by (60 min / the '
       + 'shortest food) x 9 types = ~270 entries of jsonb on EVERY hr_state_of read',
    pairs: [['      if v_buff_segs >= c_buff_max_segments then', '      if false then']],
  },
  segment_magnitude_laundered: {
    file: MIG_APPLY,   // was MIG_SEG — hr_apply body
    why: 'THE LAUNDERING THIS FILE CLOSES, restored: the new segment takes the MAX magnitude of the live '
       + 'same-type segments, so a 12-gold Roasted Carrot extends a 2,600-gold elixir at +5%',
    pairs: [['      v_buff_newmag := v_buff_mag;',
      "      select greatest(v_buff_mag, max((e.v->>'magnitude')::numeric)) into v_buff_newmag\n"
      + "        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)\n"
      + "       where e.v->>'type' = v_buff_type and (e.v->>'until')::timestamptz > v_buff_now;"]],
  },
  shape_code_collapsed: {
    file: MIG_APPLY,   // was MIG_SHAPE — hr_apply body
    why: 'the forged-shape refusal falls back to sharing `bad_buff_item`, so hr_rejections — which '
       + 'aggregates per (user, slot, day, code) with meta last-writer-wins — cannot tell a caller who '
       + 'invented a magnitude field from a player who ate a Trout, and the code can never be '
       + 'classified c_incident',
    pairs: [["        perform public.hr_reject('bad_buff_shape',",
      "        perform public.hr_reject('bad_buff_item',"]],
  },
  catalogue_drift: {
    file: MIG_CAT,
    why: 'ONE generated row disagrees with src/data/items.js, which is the data double-copy this repo '
       + 'has already been burned by — the price list would pay a buff nobody authored',
    pairs: [null],   // filled in at load time from the real file (see below)
  },
};

/* The catalogue-drift mutation is derived rather than typed: the generated file
   is regenerated whenever a designer touches a buff, so a hand-typed anchor
   would rot into a harness error on the next balance change. */
{
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG_CAT), 'utf8')).replace(/\r\n/g, '\n');
  const m = /\n  \('([a-z0-9_]+)','([a-z_]+)',(\d+(?:\.\d+)?),(\d+)\)/.exec(sql);
  if (!m) throw harness(`could not find a row to mutate in ${MIG_CAT} — the generator's emit shape changed`);
  MUTATIONS.catalogue_drift.pairs = [[m[0], `\n  ('${m[1]}','${m[2]}',${Number(m[3]) + 7},${m[4]})`]];
  MUTATIONS.catalogue_drift.row = m[1];
}

const patchesFor = (mutate, blind) => {
  const map = new Map();
  const add = (file, pairs) => {
    if (!map.has(file)) map.set(file, []);
    for (const p of pairs) map.get(file).push(p);
  };
  /* A BLIND is one [find, replace] pair, or an ARRAY of them when a downstream
     file pins this block in more than one place (see MIG_PROJ). */
  if (blind) for (const [file, pair] of Object.entries(BLIND)) add(file, Array.isArray(pair[0]) ? pair : [pair]);
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) throw harness(`unknown mutation '${mutate}' (see --list)`);
    /* ONE DEFECT, SOMETIMES TWO FILES. "The client authors the magnitude" needs the
       forgery gate disarmed in the file that owns the gate AND the value read in
       the file that owns the assignment — this chain re-splices the same block
       three times, so a defect's lines do not all live together. `files` is the
       multi-file form; `file`/`pairs` stays for the single-file majority. */
    if (m.files) for (const [f, pairs] of m.files) add(f, pairs);
    else add(m.file, m.pairs);
  }
  return map.size ? map : undefined;
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed += 1; console.error(`  FAIL  ${msg}`); } };

// ── THE RUN ────────────────────────────────────────────────────────────────
async function run(mutate, blind) {
  const { db } = await bootReplay({ patches: patchesFor(mutate, blind) });

  // ── [14] IDEMPOTENCY, taken FIRST, before any row exists ─────────────────
  const defs = async () => (await db.query(
    `select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) as a,
            pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) as s,
            pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure) as p`
  )).rows[0];
  const before = await defs();
  for (const file of [MIG, MIG_DENY, MIG_SCALE, MIG_APPLY]) {
    let sql = (await readFile(join(ROOT, 'supabase', 'migrations', file), 'utf8')).replace(/\r\n/g, '\n');
    /* The SAME patched text the chain was built from, so under a mutation this
       measures the MUTATED file's idempotency rather than a mismatch. */
    for (const [f, r] of (patchesFor(mutate, blind) || new Map()).get(file) || []) {
      if (sql.split(f).length - 1 !== 1) throw harness(`[14] anchor matched != 1 time in ${file}`);
      sql = sql.replace(f, () => r);
    }
    let err = null;
    try { await db.exec(`begin;\n${sql}\ncommit;`); } catch (e) { err = e; await db.exec('rollback').catch(() => {}); }
    ok(!err, `[14] a second apply of ${file} did not run clean — ${err && String(err.message).split('\n')[0]}`);
  }
  const after = await defs();
  ok(before.a === after.a, '[14] the hr_apply body CHANGED on a second apply — the anchored patch is not '
    + 'idempotent, and it patches a body ten patches deep');
  ok(before.s === after.s, '[14] the hr_state_of body CHANGED on a second apply');
  ok(before.p === after.p, '[14] the hr_put_client_state body CHANGED on a second apply');
  const cons = (await db.query(
    `select count(*)::int n from pg_constraint
      where conrelid = 'public.player_state'::regclass and conname = 'player_state_buffs_sane'`)).rows[0].n;
  ok(cons === 1, `[14] ${cons} copies of player_state_buffs_sane after two applies (want exactly 1)`);

  // ── [1] REACHABILITY ─────────────────────────────────────────────────────
  for (const role of ['authenticated', 'anon']) {
    const p = (await db.query(
      `select has_function_privilege($1, 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') as a,
              has_function_privilege($1, 'public.hr_state_of(uuid,int)', 'execute') as s`, [role])).rows[0];
    ok(p.a === false, `[1] ${role} holds EXECUTE on hr_apply — the buff clock is client-writable and so is `
      + 'everything else hr_apply owns');
    ok(p.s === false, `[1] ${role} holds EXECUTE on hr_state_of`);
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
  await db.exec('set role authenticated');
  let denied = null;
  try {
    await db.query('select public.hr_apply($1::uuid,0,1::bigint,gen_random_uuid(),$2::jsonb)',
      [U, JSON.stringify({ buff_apply: { item: 'x' }, journal: J })]);
  } catch (e) { denied = e; }
  await db.exec('reset role');
  ok(!!denied && /permission denied|42501/i.test(denied.message),
    `[1] a call to hr_apply AS authenticated was not refused (${denied ? denied.message.slice(0, 70) : 'it succeeded'})`);

  // ── [2] THE CATALOGUE IS NOT A SECOND COPY ───────────────────────────────
  const rows = (await db.query('select item_id, type, magnitude::float8 as magnitude, duration_ms::bigint as duration_ms from public.hr_item_buffs')).rows;
  const byId = new Map(rows.map((r) => [r.item_id, r]));
  const authored = Object.keys(ITEMS).filter((id) => ITEMS[id] && ITEMS[id].buff);
  ok(authored.length > 0, '[2] src/data/items.js authors no buff food at all — the fixture is degenerate');
  ok(rows.length === authored.length,
    `[2] hr_item_buffs holds ${rows.length} rows but src/data/items.js authors ${authored.length} buff foods`);
  for (const id of authored) {
    const b = ITEMS[id].buff;
    const r = byId.get(id);
    if (!r) { ok(false, `[2] '${id}' carries a buff in src/data/items.js and has NO hr_item_buffs row`); continue; }
    ok(r.type === b.type, `[2] '${id}' type: catalogue ${r.type} vs items.js ${b.type}`);
    ok(Number(r.magnitude) === Number(b.magnitude),
      `[2] '${id}' magnitude: catalogue ${r.magnitude} vs items.js ${b.magnitude}`);
    ok(Number(r.duration_ms) === Number(b.durationMs),
      `[2] '${id}' duration: catalogue ${r.duration_ms} vs items.js ${b.durationMs}`);
    ok(Object.prototype.hasOwnProperty.call(BUFFS_DEF, r.type),
      `[2] '${id}' has type ${r.type}, which src/core/buffs.js cannot pay — the engine would grant nothing`);
  }

  // ── the character ────────────────────────────────────────────────────────
  await db.exec(`insert into auth.users (id) values ('${U}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
    values ('${U}', 0, 100000, 0, 10, 10, 1, now())
    on conflict (user_id, slot) do update set gold = 100000, version = 1, buffs = '[]'::jsonb,
      client_state = '{}'::jsonb;`);

  const queue = async () => (await db.query(
    'select buffs from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].buffs;
  const gold = async () => Number((await db.query(
    'select gold from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].gold);
  const apply = async (delta, key) => {
    const v = Number((await db.query(
      'select version from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].version);
    await db.exec('set role hr_engine');
    try {
      const r = await db.query(
        'select public.hr_apply($1::uuid,0,$2::bigint,$3::uuid,$4::jsonb) as res',
        [U, v, key || null, JSON.stringify(delta)]);
      return r.rows[0].res;
    } catch (e) {
      return { ok: false, error: '__threw__', message: String((e && e.message) || e) };
    } finally { await db.exec('reset role'); }
  };
  const newKey = async () => (await db.query('select gen_random_uuid() as k')).rows[0].k;
  /* The `exec` the Edge verb is given: one statement per call, AS hr_engine (the
     only role that holds execute on hr_apply). [18d] drives the real `runEat`. */
  const makeExec = () => async (text, params) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
  };
  /* ── THE PAID FORM (F3, 2026-09-13-buff-apply-coupling.sql) ──────────────
     A buff_apply is refused `buff_not_paid` unless the SAME delta spends exactly
     one of the item, because the `items` block IS the possession check (it locks
     the inventory row and refuses insufficient_item). So every honest consume in
     this guard sends the debit, and the fixture stocks the bag. `extra` is where
     the forgery arms add the key they are forging. */
  const eat = async (item, extra) => apply({
    buff_apply: Object.assign({ item }, extra || {}),
    items: { [item]: -1 },
    journal: J,
  }, await newKey());
  const stock = async (item, qty) => {
    await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
      values ('${U}', 0, '${item}', ${qty})
      on conflict (user_id, slot, item_id) do update set qty = ${qty}`);
  };
  const envelope = async () => {
    await db.exec('set role hr_engine');
    try { return (await db.query('select public.hr_state_of($1::uuid, 0) as e', [U])).rows[0].e; }
    finally { await db.exec('reset role'); }
  };

  /* THE FIXTURE FOOD, read from the CATALOGUE rather than named: a designer
     retuning items.js must never be able to make this guard vacuous. */
  const pick = (await db.query(
    `select item_id, type, magnitude::float8 as magnitude, duration_ms::bigint as duration_ms
       from public.hr_item_buffs order by duration_ms desc, item_id limit 1`)).rows[0];
  const other = (await db.query(
    `select item_id, type from public.hr_item_buffs where type <> $1 order by item_id limit 1`,
    [pick && pick.type])).rows[0];
  const stronger = (await db.query(
    `select item_id, magnitude::float8 as magnitude from public.hr_item_buffs
      where type = $1 and magnitude > $2 order by magnitude desc, item_id limit 1`,
    [pick && pick.type, pick && pick.magnitude])).rows[0];
  if (!pick || !other) throw harness('the catalogue does not carry two distinct buff types — every '
    + 'stacking assertion below would be vacuous');
  /* 400 of each: the cap loop below eats until it is refused, and a bag that ran
     dry mid-loop would report `insufficient_item` where the assertion expects
     `buff_at_max` — a fixture failure wearing a finding's clothes. */
  for (const it of [pick, other, stronger]) if (it) await stock(it.item_id, 400);
  const held = async (item) => Number(((await db.query(
    'select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2',
    [U, item])).rows[0] || { qty: 0 }).qty);

  // ── [3] THE SERVER STAMPS THE CLOCK ──────────────────────────────────────
  /* ── [3b] F3: A BUFF MUST BE PAID FOR, IN THE SAME DELTA ────────────────
     Taken FIRST because it is the contract every arm below now obeys. The bare
     form — the one a stale or compromised engine would post — must be refused
     with nothing written, and the wrong quantities must not pay either. */
  const heldBefore = await held(pick.item_id);
  const r3a = await apply({ buff_apply: { item: pick.item_id }, journal: J }, await newKey());
  ok(!!r3a && r3a.ok === false && r3a.error === 'buff_not_paid',
    `[3b] a buff_apply with NO debit was not refused as buff_not_paid — got `
    + `${JSON.stringify(r3a).slice(0, 140)}. The possession check would then live in the Edge `
    + 'Function, which is the layer that PROPOSES, not the one that holds the lock.');
  ok(((await queue()) || []).length === 0, '[3b] the unpaid apply still wrote the queue');
  ok((await held(pick.item_id)) === heldBefore, '[3b] the unpaid apply moved the inventory');
  for (const q of [0, -2, 1, 5]) {
    const r = await apply({ buff_apply: { item: pick.item_id },
      items: { [pick.item_id]: q }, journal: J }, await newKey());
    ok(!!r && r.ok === false && r.error === 'buff_not_paid',
      `[3b] items[${pick.item_id}] = ${q} was accepted as payment for a buff — a buff is ONE serving `
      + `and a credit is not a cost: ${JSON.stringify(r).slice(0, 120)}`);
  }
  ok((await held(pick.item_id)) === heldBefore, '[3b] a wrong-quantity apply moved the inventory');

  const r3 = await eat(pick.item_id);
  ok(r3 && r3.ok === true, `[3] an honest buff_apply was refused: ${JSON.stringify(r3).slice(0, 160)}`);
  let q = await queue();
  ok(Array.isArray(q) && q.length === 1, `[3] the queue holds ${q && q.length} entries after one apply (want 1)`);
  const e3 = (q || [])[0] || {};
  ok(e3.type === pick.type, `[3] the stored type is ${e3.type}, catalogue says ${pick.type}`);
  ok(Number(e3.magnitude) === Number(pick.magnitude),
    `[3] the stored magnitude is ${e3.magnitude}, catalogue says ${pick.magnitude}`);
  ok((await held(pick.item_id)) === heldBefore - 1,
    `[3b] the PAID form did not spend exactly one (${await held(pick.item_id)} vs ${heldBefore - 1})`);
  const skew = (await db.query('select extract(epoch from (($1::timestamptz) - now())) * 1000 as ms',
    [e3.until])).rows[0].ms;
  ok(Math.abs(Number(skew) - Number(pick.duration_ms)) < 5000,
    `[3] until is ${Math.round(Number(skew))} ms away but the catalogue duration is ${pick.duration_ms} ms — `
    + 'the expiry is not being stamped from the server clock plus the catalogue');

  // ── [4] A FORGED FIELD IS REFUSED BY NAME ────────────────────────────────
  const forgeries = [
    ['until', { until: '2099-01-01T00:00:00Z' }],
    ['magnitude', { magnitude: 9999 }],
    ['type', { type: 'damage' }],
    ['duration_ms', { duration_ms: 86400000 }],
    ['remaining_ms', { remaining_ms: 9e9 }],
    ['scale', { scale: 1000 }],
  ];
  const q4 = JSON.stringify(await queue());
  for (const [name, body] of forgeries) {
    const r = await eat(pick.item_id, body);
    /* `bad_buff_shape` since 2026-09-13-buff-shape-code.sql (Security): a caller
       that INVENTED a field is a different statement from "that item has no
       buff", and they shared a code — so hr_rejections, which aggregates per
       (user, slot, day, code) with meta last-writer-wins, could not tell a
       forgery attempt from a player eating a Trout. The honest codes are
       asserted separately at [5]. */
    ok(!!r && r.ok === false && r.error === 'bad_buff_shape' && r.why === 'forbidden_key',
      `[4] a buff_apply carrying a forged '${name}' was not refused as bad_buff_shape/forbidden_key — `
      + `got ${JSON.stringify(r).slice(0, 140)}`);
  }
  ok(JSON.stringify(await queue()) === q4,
    '[4] a REFUSED forged apply moved the queue — a rejection has to roll the block back, not report');

  // ── [5] UNKNOWN / NON-BUFF / MALFORMED ───────────────────────────────────
  const plain = (await db.query(
    `select i.item_id from public.hr_items i
      where not exists (select 1 from public.hr_item_buffs b where b.item_id = i.item_id)
      order by i.item_id limit 1`)).rows[0];
  ok(!!plain, '[5] every item in the game carries a buff — the non-buff arm would be vacuous');
  for (const [label, body] of [
    ['an unknown id', { item: 'no_such_item_at_all' }],
    ['a real item with no buff', { item: plain && plain.item_id }],
    ['a numeric item', { item: 42 }],
    ['a bare string', 'fishers_pie'],
    ['an array', []],
  ]) {
    /* NO debit here, and that is the point: `bad_buff_item` must win over
       `buff_not_paid`, because "there is no buff for that item" is the more
       specific truth and the one a client can act on. */
    const r = await apply({ buff_apply: body, journal: J }, await newKey());
    ok(!!r && r.ok === false && r.error === 'bad_buff_item',
      `[5] ${label} was not refused as bad_buff_item (the catalogue check must be ORDERED before the `
      + `payment check) — got ${JSON.stringify(r).slice(0, 140)}`);
  }

  // ── [6] STACKING IS A MERGE ──────────────────────────────────────────────
  /* Every read below is DEFENSIVE on purpose. A mutated tree can leave the queue
     empty or short, and a guard that throws is scored as a HARNESS error rather
     than as the tick it should be (tests/mutation-proof.mjs). `entry` returns {}
     instead of undefined so an assertion fails loudly with a readable value. */
  const entry = async (type) => ((await queue()) || []).find((x) => x && x.type === type) || {};
  const until1 = ((await queue()) || [])[0] && ((await queue()) || [])[0].until;
  ok(!!until1, '[6] the queue is empty before the stacking arms — the fixture cannot measure a merge');
  const r6a = await eat(pick.item_id);
  ok(r6a && r6a.ok === true, `[6] a second helping was refused: ${JSON.stringify(r6a).slice(0, 120)}`);
  q = await queue();
  ok(q.length === 1, `[6] a second helping of the SAME type made ${q.length} rows — the merge is an append`);
  const laterMs = (q[0] && until1) ? (await db.query(
    'select extract(epoch from (($1::timestamptz) - ($2::timestamptz))) * 1000 as ms',
    [q[0].until, until1])).rows[0].ms : 0;
  ok(Number(laterMs) > 1000,
    `[6] a second helping did not EXTEND the tail (moved ${Math.round(Number(laterMs))} ms) — the minutes `
    + 'already paid for were thrown away');
  const r6b = await eat(other.item_id);
  ok(r6b && r6b.ok === true, `[6] a DIFFERENT type was refused: ${JSON.stringify(r6b).slice(0, 120)}`);
  q = await queue();
  ok(q.length === 2 && q.some((x) => x.type === pick.type) && q.some((x) => x.type === other.type),
    `[6] a different buff type did not JOIN the queue (now ${JSON.stringify(q).slice(0, 160)}) — eating a `
    + 'second dish must never delete the one you were running');
  if (stronger) {
    await eat(stronger.item_id);
    const cur = await entry(pick.type);
    ok(Number(cur.magnitude) === Number(stronger.magnitude),
      `[6] a stronger dish left the magnitude at ${cur.magnitude} (want ${stronger.magnitude}) — max(old,new)`);
    await eat(pick.item_id);
    const cur2 = await entry(pick.type);
    ok(Number(cur2.magnitude) === Number(stronger.magnitude),
      `[6] a WEAKER dish diluted the magnitude to ${cur2.magnitude} (want ${stronger.magnitude}) — a Roasted `
      + 'Carrot must not wash out a Void Banquet');
  }

  // ── [8] IDEMPOTENCY (before the cap loop consumes the room) ──────────────
  const key8 = await newKey();
  const paid8 = { buff_apply: { item: other.item_id }, items: { [other.item_id]: -1 }, journal: J };
  await apply(paid8, key8);
  const until8 = (await entry(other.type)).until;
  const held8 = await held(other.item_id);
  const r8 = await apply(paid8, key8);
  ok(!!r8 && r8.replayed === true,
    `[8] a repeated intent_id was not answered as a REPLAY: ${JSON.stringify(r8).slice(0, 140)}`);
  ok((await entry(other.type)).until === until8,
    '[8] a REPLAYED intent extended the buff — the same eaten pie was paid twice');
  ok((await held(other.item_id)) === held8,
    '[8] a REPLAYED intent debited the food a SECOND time');

  // ── [7] THE CAP AND buff_at_max ──────────────────────────────────────────
  let refusal = null;
  let lastUntil = null;
  let goldBefore = null;
  for (let i = 0; i < 200; i += 1) {
    goldBefore = await gold();
    const r = await apply({ buff_apply: { item: pick.item_id }, items: { [pick.item_id]: -1 },
      gold: -1, journal: J }, await newKey());
    if (r && r.ok === true) {
      lastUntil = (await entry(pick.type)).until;
      if (!lastUntil) { ok(false, '[7] a successful consume left no entry of its own type in the queue'); break; }
      const over = (await db.query(
        'select extract(epoch from (($1::timestamptz) - (now() + make_interval(secs => $2)))) as s',
        [lastUntil, CAP_MS / 1000])).rows[0].s;
      if (Number(over) > 5) {
        ok(false, `[7] until ran ${Math.round(Number(over))} s PAST the 60-minute cap — the stock ceiling is gone`);
        break;
      }
    } else { refusal = r; break; }
  }
  ok(!!refusal && refusal.error === 'buff_at_max',
    `[7] repeated consumes never refused as buff_at_max (got ${JSON.stringify(refusal).slice(0, 140)}) — a `
    + 'player at the ceiling would eat the food for nothing');
  ok(refusal && (await gold()) === goldBefore,
    '[7] a buff_at_max refusal still moved the gold in the same delta — the whole block must roll back or '
    + 'the player pays for nothing (the eat path debits an item in exactly this shape)');
  if (lastUntil) {
    const gap = (await db.query(
      'select extract(epoch from (($1::timestamptz) - (now() + make_interval(secs => $2)))) as s',
      [lastUntil, CAP_MS / 1000])).rows[0].s;
    ok(Math.abs(Number(gap)) < 10,
      `[7] the PARTIAL clamp did not land on the cap (${Math.round(Number(gap))} s away) — a consume that `
      + 'fits partly must still buy the minutes that fit');
  }

  /* ── [7b] THE CLAMP, ON A QUEUE THAT IS *NOT* CAP-ALIGNED ────────────
     The loop above cannot see a missing clamp, and that is a property of the
     NUMBERS rather than of the code: the longest food in the catalogue divides
     3,600,000 ms exactly, so `base + duration` lands ON the cap and never past
     it. MEASURED — `--mutate=clamp_off` stayed green until this arm existed.
     So the queue is SEEDED off-grid: one entry of the fixture type expiring a
     little before the ceiling, chosen so that base + duration MUST overshoot.
     A direct UPDATE is fair here (this is a rebuilt database and a fabricated
     character) and it is the only way to reach a state the catalogue cannot
     produce on a round number. */
  const seed = async (mag, untilSql) => {
    await db.exec(`update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', '${pick.type}', 'magnitude', ${Number(mag)}, 'until', to_jsonb(${untilSql})))
      where user_id = '${U}' and slot = 0`);
  };
  /* STRONGER than the food, so the new segment QUEUES BEHIND it (per-segment
     stacking) and the clamp is measured on a tail that really is near the ceiling.
     Seeded at magnitude 1 this arm measured nothing after F2: a weaker seed makes
     the new segment start NOW, forty minutes short of the cap. */
  await seed(pick.magnitude + 10,
    `now() + make_interval(secs => ${(CAP_MS - Math.floor(pick.duration_ms / 2)) / 1000})`);
  const r7b = await eat(pick.item_id);
  ok(r7b && r7b.ok === true,
    `[7b] a consume with ${Math.round(pick.duration_ms / 2000)} s of headroom was refused `
    + `(${JSON.stringify(r7b).slice(0, 140)}) — a PARTIAL clamp must still buy the minutes that fit`);
  /* THE TYPE'S *LAST* SEGMENT, not its running one. Under per-segment stacking the
     new segment is appended behind the seeded stronger one, so `entry()` (which
     returns the RUNNING segment, by design) would measure the seed's expiry and
     report the clamp as 600 s short — it did, before this line read the tail. */
  const tail7b = ((await queue()) || []).filter((x) => x && x.type === pick.type)
    .map((x) => x.until).sort().pop();
  const over7b = (await db.query(
    'select extract(epoch from (($1::timestamptz) - (now() + make_interval(secs => $2)))) as s',
    [tail7b || '1970-01-01', CAP_MS / 1000])).rows[0].s;
  ok(Math.abs(Number(over7b)) < 10,
    `[7b] the clamp did not land the tail ON the 60-minute ceiling (${Math.round(Number(over7b))} s out). `
    + 'Positive means the cap is GONE — 400 pies before bed would bank hours of buffed away output, which '
    + 'is the stock ceiling that replaces a per-day clamp.');

  /* ── [18] THE EMITTER'S OWN DELTA, NOT A HAND-WRITTEN ONE (step 2) ─────────
     Every arm above builds the delta the way this guard imagines the Edge builds
     it. This one imports `eatDelta` from supabase/functions/hr-accrue/eat.js and
     applies WHAT THE VERB ACTUALLY POSTS, which is the only version of this
     assertion that notices the emitter drifting from the schema — a `buff_apply`
     the allowlist refuses, a missing debit, a stamping key, or the auto-eat gate
     inverting. It is the join between the two halves of this feature, and neither
     half's own tests can see it. */
  {
    const food = resolveFood(pick.item_id);
    if (!food.ok || food.hasBuff !== true) {
      throw harness(`[16] eat.js resolveFood refuses the fixture food ${pick.item_id} or does not see its `
        + `buff (${JSON.stringify(food)}) — the emitter and hr_item_buffs disagree about what a buff food is`);
    }
    /* A CLEAN QUEUE: [7]/[7b] left the fixture type sitting on the ceiling, and a
       capped queue would refuse the honest arm below for the right reason at the
       wrong time. */
    await db.exec(`update public.player_state set buffs = '[]'::jsonb
      where user_id = '${U}' and slot = 0`);
    const held16 = await held(pick.item_id);

    // (a) THE HUMAN EAT: accepted, buffs once, spends exactly one.
    const d16 = eatDelta(food, 1, false);
    const r16 = await apply(d16, await newKey());
    ok(!!r16 && r16.ok === true,
      `[18a] the REAL eat delta was refused: ${JSON.stringify(r16).slice(0, 160)} — the shape the Edge posts `
      + `(${Object.keys(d16).sort().join('+')}) is not the shape hr_apply accepts`);
    ok(((await queue()) || []).length === 1,
      `[18a] the real eat delta left ${((await queue()) || []).length} queue entries (want 1) — the emitter is `
      + 'wired but the buff does not land, which is a tooltip that lies with a server behind it');
    ok((await held(pick.item_id)) === held16 - 1,
      '[18a] the real eat delta did not spend exactly one serving');

    // (b) THE AUTO-EAT: debits, buffs NOTHING.
    const q16b = JSON.stringify(await queue());
    const held16b = await held(pick.item_id);
    const d16b = eatDelta(food, 1, true);
    ok(!Object.prototype.hasOwnProperty.call(d16b, 'buff_apply'),
      '[18b] eatDelta emitted buff_apply for an AUTO eat. The auto-eater fires up to 20×/min over the '
      + 'healing pool — fifteen of those rows carry an incidental buff — so it would cap the 60-minute queue '
      + 'in ~90 s of fighting and then be refused buff_at_max, which ROLLS BACK THE DEBIT: the b467 "food I '
      + 'eat gets restocked" P0, reintroduced.');
    const r16b = await apply(d16b, await newKey());
    ok(!!r16b && r16b.ok === true, `[18b] an auto eat delta was refused: ${JSON.stringify(r16b).slice(0, 140)}`);
    ok(JSON.stringify(await queue()) === q16b, '[18b] an auto eat moved the buff queue');
    ok((await held(pick.item_id)) === held16b - 1, '[18b] an auto eat did not debit the food');

    /* (c) buff_at_max MUST NOT DEBIT, MEASURED ON THE REAL DELTA. [7] proves the
       gold in a hand-written delta rolls back; this proves the thing a PLAYER
       loses — the food — is still in the bag after the refusal the designer's
       rule exists for ("never eat the item for nothing"). Seeded onto the
       ceiling, because the cap moves with the clock and no number of honest
       consumes reaches it deterministically. */
    await db.exec(`update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', '${pick.type}', 'magnitude', ${Number(pick.magnitude)},
        'until', to_jsonb(now() + make_interval(secs => ${CAP_MS / 1000}))))
      where user_id = '${U}' and slot = 0`);
    const held16c = await held(pick.item_id);
    const r16c = await apply(eatDelta(food, 1, false), await newKey());
    ok(!!r16c && r16c.ok === false && r16c.error === 'buff_at_max',
      `[18c] a capped queue did not refuse the real eat delta as buff_at_max — got `
      + `${JSON.stringify(r16c).slice(0, 140)}`);
    ok((await held(pick.item_id)) === held16c,
      `[18c] the buff_at_max refusal ATE THE FOOD (${await held(pick.item_id)} vs ${held16c}). The whole `
      + 'apply must roll back, or a player at the ceiling pays a Feast for nothing.');

    /* (d) [18d] THE HEAL LANDS EVEN WHEN THE BUFF CANNOT (Security F5, P1).
       `buff_at_max` rolls back the WHOLE delta, so a capped player pressing Eat on
       one of the fifteen healing foods that carry an incidental buff got: food kept,
       HP NOT HEALED — a button that does nothing, mid-fight, on the common path
       (auto-eat is a purchased trait most characters lack). `runEat` retries ONCE
       without the buff, on the SAME intentId, for food that heals. Driven through
       the REAL verb (not eatDelta), because the retry IS the verb's behaviour. */
    {
      /* A food that BOTH heals and buffs, read from the catalogue so a retune cannot
         make this vacuous. `pick` may be a pure-buff Feast; this arm needs the other
         kind, and if the catalogue has none it says so rather than passing. */
      let healBuff = null;
      for (const row of (await db.query(
        'select item_id, type from public.hr_item_buffs order by item_id')).rows) {
        const f = resolveFood(row.item_id);
        if (f.ok && f.heals > 0 && f.hasBuff) { healBuff = { ...row, food: f }; break; }
      }
      if (!healBuff) {
        throw harness('[18d] no food in hr_item_buffs both heals and buffs — the F5 retry is unreachable '
          + 'and this arm would pass for the wrong reason');
      }
      await stock(healBuff.item_id, 40);
      /* THE CAP, for the food's OWN type, and a hurt character so a heal is visible. */
      await db.exec(`update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
          'type', '${healBuff.type}', 'magnitude', 99,
          'until', to_jsonb(now() + make_interval(secs => ${CAP_MS / 1000})))),
          hp = 1, max_hp = 99 where user_id = '${U}' and slot = 0`);
      const q18d = JSON.stringify(await queue());
      const held18d = await held(healBuff.item_id);
      const hpOf = async () => Number((await db.query(
        'select hp from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].hp);
      const hpBefore = await hpOf();
      const out = await runEat({
        exec: makeExec(), user: U, slot: 0, intentId: await newKey(), item: healBuff.item_id,
      });
      ok(!!out && out.status === 200 && out.body && out.body.ok === true,
        `[18d] a MANUAL eat of a healing buff food at the cap was REFUSED (${out && out.status}: `
        + `${JSON.stringify(out && out.body).slice(0, 160)}). The whole apply rolls back on buff_at_max, so `
        + 'the player pressed Eat mid-fight, kept the food, healed NOTHING and died to a button that did '
        + 'nothing. The heal must land without the buff.');
      ok((await hpOf()) > hpBefore,
        `[18d] the retry did not HEAL (hp ${await hpOf()} from ${hpBefore}) — the heal is the whole point of `
        + 'the retry; a 200 that moved no hp is the same bug wearing an ok:true.');
      ok((await held(healBuff.item_id)) === held18d - 1,
        `[18d] EXACTLY ONE serving must leave the bag across both attempts (${await held(healBuff.item_id)} `
        + `vs ${held18d - 1}). Two debits is item loss; zero is a free heal. The retry reuses the intentId, `
        + 'which is safe ONLY because buff_at_max is a release code and the first attempt wrote nothing.');
      ok(JSON.stringify(await queue()) === q18d,
        '[18d] the retry moved the buff queue — it must carry no buff_apply at all, or the cap it was '
        + `refused for has just been exceeded by the retry: ${JSON.stringify(await queue()).slice(0, 160)}`);
      ok(out.body.buff_skipped === 'at_max',
        `[18d] the client is not TOLD the buff was skipped (${JSON.stringify(out.body.receipt)}), so the pill `
        + 'keeps the buff it predicted and the toast claims an effect the player did not get');
      /* AND A PURE-BUFF FOOD IS STILL REFUSED — the designer's rule survives the
         retry. There is nothing to buy, so eating it for nothing is the bug. */
      const pure = (await db.query(
        `select b.item_id from public.hr_item_buffs b join public.hr_items i using (item_id)
          where b.type = $1 order by b.item_id`, [healBuff.type])).rows
        .map((r) => resolveFood(r.item_id)).find((f) => f.ok && f.heals === 0 && f.hasBuff);
      if (pure) {
        await stock(pure.item, 5);
        const heldP = await held(pure.item);
        const outP = await runEat({
          exec: makeExec(), user: U, slot: 0, intentId: await newKey(), item: pure.item,
        });
        ok(outP.status === 409 && outP.body.error === 'buff_at_max',
          `[18d] a PURE-BUFF food at the cap must still be refused buff_at_max, not retried into a no-op: `
          + JSON.stringify(outP.body).slice(0, 140));
        ok((await held(pure.item)) === heldP,
          '[18d] the refused pure-buff food was eaten for nothing — the rule the retry must not break');
      }
      /* BOTH-PATH: the AWAY engine is not on this path. Its auto-eat emits a signed
         item debit and NEVER a buff_apply, so no accrual can be refused buff_at_max
         and nothing about the retry can reach it. Asserted on the engine's own
         output rather than by reading the code. */
      const AW_NOW = Date.UTC(2026, 8, 13, 12, 0, 0);
      const awayOut = computeAccrual({
        userId: U, slot: 0, nowMs: AW_NOW, accruedToMs: AW_NOW - 3600000,
        activeSinceMs: AW_NOW - 3600000, activeKind: 'combat', activeId: 'slime',
        capMs: 12 * 3600000, seed: 42, hp: 4, maxHp: 40, gold: 0,
        skills: { attack: 2000, strength: 2000, defense: 2000, hitpoints: 2000 },
        equipment: {}, items: ITEMS, monsters: MONSTERS,
        /* AUTO-EAT ON, with the buff food in the bag — the exact input that would
           emit a buff_apply if the away path had ever learned to. */
        autoEatEnabled: true, autoEatPct: 90, autoEatFood: healBuff.item_id,
        inventory: { [healBuff.item_id]: 20 },
        buffs: [{ type: healBuff.type, magnitude: 99,
          until: new Date(AW_NOW + 3600000).toISOString() }],
      });
      const awayDelta = JSON.stringify((awayOut && awayOut.delta) || awayOut || {});
      ok(!awayDelta.includes('buff_apply'),
        '[18d] AWAY: the accrual engine proposed a `buff_apply`. The away auto-eat must only ever DEBIT — a '
        + 'delta that can be refused buff_at_max would 409 an entire night (insufficient_item and friends '
        + 'are not on index.ts\'s DEGRADABLE list).');
      await db.exec(`update public.player_state set buffs = '[]'::jsonb
        where user_id = '${U}' and slot = 0`);
    }

    /* (d) [19] THE EAT DELTA MUST NOT CLOSE THE ACCRUAL WINDOW. hr_apply stamps
       `accrued_to = now()` on a delta carrying equip/activity/enchant, which
       DISCARDS any unpaid window. An eat is fired mid-fight and, through the
       auto-eat seam, up to 20×/min — so the day `buff_apply` (or anything else)
       joins that list, every meal confiscates the night the player was owed.
       Asked of the REAL delta through the REAL predicate. */
    ok(deltaClosesWindow(eatDelta(food, 1, false)) === false,
      '[19] the eat delta now CLOSES THE ACCRUAL WINDOW (intents.js deltaClosesWindow). hr_apply would stamp '
      + 'accrued_to = now() and throw away the unpaid window — a confiscated night per meal.');
    ok(deltaClosesWindow(eatDelta(food, 1, true)) === false,
      '[19] the AUTO eat delta closes the accrual window — see above, and auto-eat fires 20×/min.');
    /* AND IT ALWAYS CARRIES THE DEBIT (Security F3). The coupling is enforced in
       SQL ([3b]); this is the emitter side of it, so a refactor that made the
       debit conditional is red HERE too rather than only in a rebuilt database. */
    for (const auto of [false, true]) {
      const d = eatDelta(food, 1, auto);
      ok(d.items && d.items[pick.item_id] === -1,
        `[19] eatDelta(auto=${auto}) does not spend exactly one ${pick.item_id}: `
        + `${JSON.stringify(d.items)}. buff_apply performs no possession check of its own — the debit IS the `
        + 'check, and hr_apply refuses the pair with buff_not_paid if they ever come apart.');
    }
    await db.exec(`update public.player_state set buffs = '[]'::jsonb
      where user_id = '${U}' and slot = 0`);
  }

  /* ── [6b] max(old,new), BOTH DIRECTIONS, WITHOUT DEPENDING ON THE CATALOGUE ─
     The catalogue arm above only runs when a STRONGER food of the same type
     exists, and for the fixture type none does — so `--mutate=
     magnitude_replaces_instead_of_max` stayed green (MEASURED). The magnitudes
     are seeded instead: a weaker running buff must be RAISED to the new one, and
     a stronger running buff must NOT be diluted by a weaker dish. */
  await seed(Math.max(1, pick.magnitude / 2), "now() + interval '60 seconds'");
  await eat(pick.item_id);
  ok(Number((await entry(pick.type)).magnitude) === Number(pick.magnitude),
    `[6b] a WEAKER running buff was not raised to the new magnitude `
    + `(${(await entry(pick.type)).magnitude} vs ${pick.magnitude})`);
  await seed(pick.magnitude + 5, "now() + interval '60 seconds'");
  await eat(pick.item_id);
  ok(Number((await entry(pick.type)).magnitude) === Number(pick.magnitude) + 5,
    `[6b] a STRONGER running buff was DILUTED to ${(await entry(pick.type)).magnitude} by a weaker dish `
    + `(want ${pick.magnitude + 5}) — magnitude is max(old,new), never a replace`);

  /* ── [16] PER-SEGMENT STACKING (F2) — ALL FOUR ORDERINGS ────────────────
     Same-type foods stack as CONTIGUOUS SEGMENTS, each at its own magnitude. The
     magnitudes are seeded (the four orderings need a known strong/weak pair and a
     balance change must never make this vacuous) and then a REAL paid consume of
     the fixture food is applied on top. `seg` reads the stored column, which the
     migration keeps canonically ordered by expiry. */
  const seg = async (type) => ((await queue()) || []).filter((x) => x && x.type === type);
  const seedSegs = async (rows) => {
    const parts = rows.map((r) => `jsonb_build_object('type','${r.type}','magnitude',${r.mag},`
      + `'until', to_jsonb(now() + make_interval(secs => ${r.secs})))`).join(', ');
    await db.exec(`update public.player_state set buffs = jsonb_build_array(${parts})
      where user_id = '${U}' and slot = 0`);
  };
  const durS = pick.duration_ms / 1000;

  // (16a) STRONGER RUNNING, weaker eaten → the weak one WAITS its turn.
  await seedSegs([{ type: pick.type, mag: pick.magnitude + 10, secs: 300 }]);
  const r16a = await eat(pick.item_id);
  ok(r16a && r16a.ok === true, `[16a] a weaker same-type consume was refused: ${JSON.stringify(r16a).slice(0, 120)}`);
  let sg = await seg(pick.type);
  ok(sg.length === 2 && Number(sg[0].magnitude) === pick.magnitude + 10
     && Number(sg[1].magnitude) === Number(pick.magnitude),
    `[16a] a weaker food did not APPEND a segment at its OWN magnitude behind the stronger one: `
    + `${JSON.stringify(sg)}. max() letting the cheap food carry the expensive magnitude is the `
    + 'laundering this ruling closes.');

  // (16b) WEAKER RUNNING (60 s left), stronger eaten → it starts NOW and COVERS.
  await seedSegs([{ type: pick.type, mag: Math.max(1, pick.magnitude - 1), secs: 60 }]);
  const r16b = await eat(pick.item_id);
  ok(r16b && r16b.ok === true, `[16b] a stronger same-type consume was refused: ${JSON.stringify(r16b).slice(0, 120)}`);
  sg = await seg(pick.type);
  ok(sg.length === 1 && Number(sg[0].magnitude) === Number(pick.magnitude),
    `[16b] the covered weaker segment survived (${JSON.stringify(sg)}) — the drain is WALL-CLOCK, so its `
    + 'time really did pass while the stronger effect ran; a surviving remainder is a paused buff clock');

  // (16c) WEAKER RUNNING BUT OUTLIVING the stronger → it SURVIVES and resumes.
  await seedSegs([{ type: pick.type, mag: Math.max(1, pick.magnitude - 1), secs: durS + 600 }]);
  await eat(pick.item_id);
  sg = await seg(pick.type);
  ok(sg.length === 2 && Number(sg[0].magnitude) === Number(pick.magnitude)
     && Number(sg[1].magnitude) === Math.max(1, pick.magnitude - 1),
    `[16c] a weaker segment that OUTLIVES the new one was dropped or mis-ordered (${JSON.stringify(sg)}) `
    + '— the stronger runs first and the weaker resumes after it');

  // (16d) SAME MAGNITUDE → ONE segment, extended.
  await seedSegs([{ type: pick.type, mag: pick.magnitude, secs: 60 }]);
  const before16d = (await seg(pick.type))[0].until;
  await eat(pick.item_id);
  sg = await seg(pick.type);
  ok(sg.length === 1 && sg[0].until > before16d,
    `[16d] a same-magnitude re-eat did not EXTEND one segment (${JSON.stringify(sg)}) — topping up one `
    + 'dish would otherwise fill the segment budget with duplicates of the same number');

  // (16e) THE SEGMENT BUDGET refuses the ninth and eats nothing.
  await seedSegs(Array.from({ length: 8 }, (_, i) => (
    { type: pick.type, mag: pick.magnitude + 20 - i, secs: 120 * (i + 1) })));
  const held16 = await held(pick.item_id);
  const r16e = await eat(pick.item_id);
  ok(!!r16e && r16e.ok === false && r16e.error === 'buff_at_max' && r16e.why === 'segment_budget',
    `[16e] a NINTH live segment of one type was not refused as buff_at_max/segment_budget — got `
    + `${JSON.stringify(r16e).slice(0, 140)}. The cost bound would then be 60 min / the shortest food `
    + 'x 9 types = ~270 entries on every envelope read.');
  ok((await held(pick.item_id)) === held16, '[16e] the budget refusal still ate the food');

  /* (16f) THE CORE PAYS THE RUNNING SEGMENT, NOT THE SUM. This is the src/core
     half of F2, asserted in JS because bootReplay can only patch migrations.
     MEASURED BEFORE THE FIX on the designer's own worked example: buffBonusFor
     returned 0.07 for a +5 % elixir beside a +2 % trout — the cheap food ADDING to
     the expensive one, which is worse than the max() merge it replaced. */
  {
    const nowMs = Date.UTC(2026, 8, 13, 12, 0, 0);
    const two = buffQueueFromServer([
      { type: 'all_xp', magnitude: 5, until: new Date(nowMs + 480000).toISOString() },
      { type: 'all_xp', magnitude: 2, until: new Date(nowMs + 660000).toISOString() },
    ], nowMs);
    const one = buffQueueFromServer([
      { type: 'all_xp', magnitude: 5, until: new Date(nowMs + 480000).toISOString() },
    ], nowMs);
    const ctx = { away: true };
    ok(buffBonusFor(two, 'allXP', ctx) === buffBonusFor(one, 'allXP', ctx),
      `[16f] two same-type segments pay ${buffBonusFor(two, 'allXP', ctx)} where the RUNNING one alone `
      + `pays ${buffBonusFor(one, 'allXP', ctx)} — src/core/buffs.js is summing segments again, which is `
      + 'a mint: the cheap food adds its magnitude to the expensive one for the whole overlap');
    ok(buffBonusFor(two, 'allXP', ctx) === 0.05,
      `[16f] the running segment pays ${buffBonusFor(two, 'allXP', ctx)} (want 0.05 for +5%)`);
    /* …and after the first segment expires the SECOND one pays. A core that
       returned only the first entry for ever would satisfy the line above. */
    const later = buffQueueFromServer([
      { type: 'all_xp', magnitude: 5, until: new Date(nowMs - 1000).toISOString() },
      { type: 'all_xp', magnitude: 2, until: new Date(nowMs + 180000).toISOString() },
    ], nowMs);
    ok(buffBonusFor(later, 'allXP', ctx) === 0.02,
      `[16f] once the stronger segment has expired the weaker one must pay 0.02, got `
      + `${buffBonusFor(later, 'allXP', ctx)}`);
  }

  /* ── [17] F4 (Security, P3): A BUFF FOOD CANNOT BE CREDITED BACK ─────────
     The coupling makes a buff cost `items[X] = -1`. That is only airtight while X
     cannot ALSO be credited by another key of the same delta. Two set facts and
     one census: */
  const clash = (await db.query(
    `select b.item_id from public.hr_item_buffs b
      join public.hr_item_slots s on s.item_id = b.item_id`)).rows.map((r) => r.item_id);
  ok(clash.length === 0,
    `[17] ${clash.join(', ')} is BOTH a buff food and equippable — the equip block credits the previous `
    + 'occupant back into the bag, so the same delta could debit and refund the buff food');
  const runeClash = (await db.query(
    `select b.item_id from public.hr_item_buffs b join public.hr_runes r on r.rune_id = b.item_id`)).rows;
  ok(runeClash.length === 0,
    `[17] a buff food is also a RUNE (${JSON.stringify(runeClash)}) — the enchant block consumes runes on `
    + 'its own path and the two consumption rules would overlap');
  /* THE CENSUS. Every statement in hr_apply that CREDITS player_inventory, and the
     delta key whose block owns it. MEASURED on this chain: items (the general
     credit), equip x2 (unequip returns the occupant) and hearthfind (the trophy).
     enchant only ever DEBITS. A new crediting site — say a future equippable buff
     food refunded beside its own debit — reds this arm and has to be argued for. */
  {
    const src = (await db.query(
      `select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) as s`
    )).rows[0].s.replace(/\r/g, '').split('\n');
    const owners = [];
    src.forEach((l, i) => {
      if (!/player_inventory/.test(l)) return;
      if (!/insert into|qty \+|excluded\.qty/.test(l)) return;
      let key = '?';
      for (let j = i; j >= 0; j -= 1) {
        const m = /p_delta \? '([a-z_]+)'/.exec(src[j]);
        if (m) { key = m[1]; break; }
      }
      owners.push(key);
    });
    const tally = owners.sort().join(',');
    ok(tally === 'equip,equip,hearthfind,items',
      `[17] the inventory-CREDITING census changed: ${tally || '(none found)'} (measured: `
      + 'equip,equip,hearthfind,items). A new crediting site means a delta could refund an item it '
      + 'debited in the same call — which is how the buff coupling would stop being a cost.');
  }

  // ── [9] THE PROJECTION ───────────────────────────────────────────────────
  const env = await envelope();
  ok(!!env && Object.prototype.hasOwnProperty.call(env, 'buffs'),
    '[9] hr_state_of does not project a top-level `buffs` key — the engine can never learn the column '
    + 'exists and every buff is paid to nobody');
  const proj = (env && env.buffs) || [];
  ok(Array.isArray(proj) && proj.length >= 1, `[9] the projection is ${JSON.stringify(proj).slice(0, 120)}`);
  for (const p of proj) {
    ok(typeof p.type === 'string' && p.magnitude != null && p.until != null && p.remaining_ms != null,
      `[9] a projected entry is malformed: ${JSON.stringify(p)}`);
  }
  ok(proj.some((p) => Number(p.remaining_ms) > 0),
    '[9] every projected remaining_ms is 0 while a buff is running — the client would render no countdown '
    + 'and the step-2 reconcile would drop a live buff as expired');
  for (const k of ['renown_high', 'dungeon_cooldowns', 'place', 'now', 'state']) {
    ok(Object.prototype.hasOwnProperty.call(env || {}, k),
      `[9] the splice ATE the '${k}' projection — the patch was not additive`);
  }
  /* AN EXPIRED ENTRY IS STILL CARRIED, at 0. The away engine measures at the
     START of the window it prices, so a buff that died mid-absence must still be
     visible; filtering here would silently under-pay every long absence. */
  await db.exec(`update public.player_state
    set buffs = '[{"type":"damage","magnitude":3,"until":"2020-01-01T00:00:00Z"}]'::jsonb
    where user_id = '${U}' and slot = 0`);
  const envExp = await envelope();
  const pe = ((envExp && envExp.buffs) || [])[0];
  ok(!!pe && Number(pe.remaining_ms) === 0,
    `[9] an EXPIRED entry is not projected at remaining_ms 0 (${JSON.stringify(pe)}) — the away engine `
    + 'needs the entry that was alive when the window opened');

  // ── [12] NO CLIENT WRITE SURFACE ─────────────────────────────────────────
  const pol = (await db.query(
    `select count(*)::int n from pg_policy where polrelid = 'public.player_state'::regclass and polcmd <> 'r'`)).rows[0].n;
  ok(pol === 0, `[12] player_state has ${pol} non-read RLS policies — the buff clock would be client-authored`);
  const wr = (await db.query(
    `select count(*)::int n from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'hr_item_buffs'
        and grantee in ('anon','authenticated','service_role','PUBLIC') and privilege_type <> 'SELECT'`)).rows[0].n;
  ok(wr === 0, `[12] ${wr} client write grants on hr_item_buffs — the price list would be editable`);

  // ── [13] THE SHADOW COPY IS GONE ─────────────────────────────────────────
  const resSrc = await readFile(join(ROOT, 'src', 'net', 'client-state.js'), 'utf8');
  const resArr = /RESIDUE_FIELDS\s*=\s*(?:Object\.freeze\()?\[([\s\S]*?)\n\]/.exec(resSrc);
  ok(!!resArr, '[13] could not read RESIDUE_FIELDS out of src/net/client-state.js — the collision check '
    + 'did NOT run');
  if (resArr) {
    const names = new Set([...resArr[1].matchAll(/^\s*'([A-Za-z_][A-Za-z0-9_]*)',/gm)].map((m) => m[1]));
    ok(names.size > 20, `[13] RESIDUE_FIELDS scan found only ${names.size} names — the scan has drifted`);
    ok(!names.has('buffs'),
      '[13] `buffs` is STILL in RESIDUE_FIELDS while the server denies it — the server refuses the WHOLE '
      + 'patch on a forbidden key, so every residue field would stop saving for every player');
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
  await db.exec('set role authenticated');
  let put = null; let putOk = null;
  try {
    put = (await db.query(
      `select public.hr_put_client_state(0, $1::jsonb, gen_random_uuid()) as r`,
      [JSON.stringify({ buffs: [{ type: 'damage', magnitude: 9999, remainingMs: 9e9 }] })])).rows[0].r;
    putOk = (await db.query(
      `select public.hr_put_client_state(0, $1::jsonb, gen_random_uuid()) as r`,
      [JSON.stringify({ lootFilter: ['junk'] })])).rows[0].r;
  } catch (e) { put = { ok: false, error: '__threw__', message: String(e && e.message) }; }
  await db.exec('reset role');
  ok(!!put && put.ok === false && put.error === 'forbidden_field' && put.field === 'buffs',
    `[13] a client_state PUT carrying a forged buff queue was not refused forbidden_field/buffs — got `
    + `${JSON.stringify(put).slice(0, 140)}`);
  ok(!!putOk && putOk.ok === true,
    `[13] an HONEST residue PUT was refused (${JSON.stringify(putOk).slice(0, 140)}) — a deny-list that `
    + 'eats legitimate patches is worse than none');
  const stored = (await db.query(
    'select client_state from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].client_state;
  ok(!stored || !Object.prototype.hasOwnProperty.call(stored, 'buffs'),
    `[13] client_state stored a buffs key anyway: ${JSON.stringify(stored).slice(0, 120)}`);

  /* ── [21] THE CELLAR SCALES THE CLOCK, SERVER-SIDE (step 3) ───────────────
     2026-09-13-buff-cellar-scale.sql makes a perk the player BOUGHT reach the
     stamp that decides how long a buff runs. Three things have to be true at
     once and none of them is visible from the others: the SQL catalogue must
     equal the authored ladder, the duration must move with the rung, and the
     number must be REPORTED (envelope + ledger) rather than silently applied.
     A forged `scale` is [4]'s arm — it already fires that key by name. */
  {
    /* (a) THE RUNG LADDER IS NOT A SECOND COPY — the same rule as [2]. */
    const sortKeys = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, Number(o[k])]));
    const rp = (await db.query('select room_id, level, perks from public.hr_room_perks')).rows;
    const authoredRungs = Object.keys(ROOM_PERKS).reduce((n, r) => n + ROOM_PERKS[r].length, 0);
    ok(rp.length === authoredRungs,
      `[21] hr_room_perks holds ${rp.length} rungs but src/data/perks.js authors ${authoredRungs} — a `
      + 'balance ladder that exists twice pays one number and shows another');
    for (const row of rp) {
      const want = (ROOM_PERKS[row.room_id] || [])[row.level - 1];
      ok(!!want, `[21] hr_room_perks has ${row.room_id} rung ${row.level} and src/data/perks.js does not`);
      if (!want) continue;
      ok(sortKeys(row.perks) === sortKeys(want),
        `[21] ${row.room_id} rung ${row.level}: catalogue ${JSON.stringify(row.perks)} vs perks.js `
        + JSON.stringify(want));
    }

    const food = (await db.query(
      `select item_id, duration_ms::bigint as duration_ms from public.hr_item_buffs
        where duration_ms <= 900000 order by duration_ms desc, item_id limit 1`)).rows[0];
    ok(!!food, '[21] FIXTURE: no buff food short enough to double under the 60-minute ceiling');
    if (food) {
      await stock(food.item_id, 500);
      const clear = () => db.exec(
        `update public.player_state set buffs = '[]'::jsonb where user_id = '${U}' and slot = 0`);
      const left = (seg) => new Date(seg.until).getTime() - Date.now();

      /* (b) NEGATIVE CONTROL — no Cellar, scale 1.0, the catalogue duration. */
      await db.exec(
        `delete from public.player_progress where user_id = '${U}' and slot = 0 and key = 'room:cellar'`);
      await clear();
      let r = await eat(food.item_id);
      ok(r && r.ok === true, `[21] a plain consume was refused: ${JSON.stringify(r)}`);
      let q = await queue();
      ok(Number((q[0] || {}).scale) === 1,
        `[21] a character with NO Cellar was stamped at scale ${(q[0] || {}).scale} — the perk is being `
        + 'paid to everybody');
      const base = left(q[0] || { until: 0 });
      ok(Math.abs(base - Number(food.duration_ms)) < 5000,
        `[21] the unperked duration is ${base} ms, the catalogue says ${food.duration_ms}`);

      /* (c) EVERY RUNG PAYS ITS OWN PAYLOAD — ascending, because hr_unlock_guard
         refuses a level unlock that decreases (nothing takes a room away). */
      const rungs = (await db.query(
        `select level, (perks->>'buffDuration')::float8 as bd from public.hr_room_perks
          where room_id = 'cellar' order by level`)).rows;
      ok(rungs.length > 0, '[21] the Cellar has no rungs in hr_room_perks — the probe is vacuous');
      let topWant = 1;
      for (const rung of rungs) {
        await db.exec(
          `insert into public.player_progress (user_id, slot, kind, key, period_key, value)
             values ('${U}', 0, 'unlock', 'room:cellar', '', ${Number(rung.level)})
             on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`);
        await clear();
        r = await eat(food.item_id);
        ok(r && r.ok === true, `[21] rung ${rung.level} was refused: ${JSON.stringify(r)}`);
        q = await queue();
        const want = Math.min(1 + Number(rung.bd), 2);
        topWant = want;
        ok(Number((q[0] || {}).scale) === want,
          `[21] rung ${rung.level} stamped scale ${(q[0] || {}).scale}, its own payload says ${want} — `
          + 'the ladder is being flattened to one number');
        ok(Math.abs(left(q[0] || { until: 0 }) - base * want) < 5000,
          `[21] rung ${rung.level} bought ${left(q[0] || { until: 0 })} ms, expected ${base * want} ms — `
          + 'the rung is read and never reaches the clock');
      }

      /* (d) THE ENVELOPE — the stamped segment carries its scale, and a segment
         written BEFORE this file existed projects an honest 1.0 rather than a
         number a renderer has to guess at. */
      await db.exec(
        `update public.player_state set buffs = buffs || jsonb_build_array(jsonb_build_object(
           'type', 'gold_find', 'magnitude', 3, 'until', to_jsonb(now() + interval '20 minutes')))
         where user_id = '${U}' and slot = 0`);
      const els = (await envelope()).buffs || [];
      ok(els.length >= 2, `[21] the envelope projects ${els.length} buffs, expected at least 2`);
      const legacySeg = els.find((e) => e.type === 'gold_find');
      ok(!!legacySeg && Number(legacySeg.scale) === 1,
        `[21] a PRE-SCALE segment projects scale ${legacySeg && legacySeg.scale} instead of 1 — the `
        + 'envelope invents a multiplier that never happened');
      const stamped = els.find((e) => e.type !== 'gold_find');
      ok(!!stamped && Number(stamped.scale) === topWant,
        `[21] the stamped segment projects scale ${stamped && stamped.scale}, expected ${topWant}`);
      for (const e of els) {
        ok(e.until !== undefined && e.remaining_ms !== undefined && e.magnitude !== undefined,
          `[21] the projection patch ATE a field: ${JSON.stringify(e)}`);
      }

      /* (e) THE JOURNAL — the scale used is on the ONE ledger row the apply
         already writes. No row per buff: that is the game_events mistake. */
      const led = (await db.query(
        'select meta from public.player_ledger where user_id = $1 and slot = 0 order by id desc limit 1',
        [U])).rows[0];
      ok(!!led && led.meta && led.meta.delta && Number(led.meta.delta.bs) === topWant,
        '[21] the scale used is not journalled on the apply\'s ledger row: '
        + JSON.stringify(led && led.meta));
    }
  }

  // ── [15] ONE CEILING, ONE NUMBER ─────────────────────────────────────────
  const capSql = (await db.query(
    `select position('c_buff_max_ms constant bigint  := ' || $1::text || ';' in
       pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure)) as p`,
    [String(BUFF_MAX_UNTIL_MS)])).rows[0].p;
  ok(Number(capSql) > 0,
    `[15] hr_apply does not carry c_buff_max_ms = ${BUFF_MAX_UNTIL_MS} — src/core/buffs.js `
    + 'BUFF_MAX_UNTIL_MS and the SQL ceiling disagree, which is two numbers for one bound');

  // ── [10]/[11] THE ENGINE: INERT WITHOUT A BUFF, PAYING WITH ONE ──────────
  const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);
  const FROM = NOW - 3600000;
  const night = (buffs) => computeAccrual({
    userId: U, slot: 0,
    nowMs: NOW, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'combat', activeId: 'slime',
    capMs: 12 * 3600000, seed: 987654321,
    hp: 200, maxHp: 200, gold: 0,
    skills: { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 },
    equipment: {}, items: ITEMS, monsters: MONSTERS,
    buffs,
  });
  const bare = JSON.stringify(night(undefined));
  ok(bare === JSON.stringify(night(null)),
    '[10] AWAY-1: an ABSENT buffs input and an explicit null produce different accruals');
  ok(bare === JSON.stringify(night([])),
    '[10] AWAY-1: an EMPTY queue is not byte-identical to no queue — the feature is not inert when '
    + 'nobody has a buff, and every existing fixture would shift');
  ok(bare === JSON.stringify(night([{ type: 'damage', magnitude: 50, until: new Date(FROM - 1000).toISOString() }])),
    '[10] AWAY-1: an EXPIRED buff changed the accrual — a buff that ended before the window opened must '
    + 'pay nothing');
  const buffed = JSON.stringify(night(
    [{ type: 'damage', magnitude: 200, until: new Date(NOW + 600000).toISOString() }]));
  ok(buffed !== bare,
    '[11] a LIVE +200% damage buff changed NOTHING about the night — the projection is threaded but the '
    + 'engine does not pay it, which is exactly the false green [10] would report as perfect');

  /* ── [20] AWAY: A BUFF PAYS UNTIL `until`, AND NOT ONE TICK LONGER ─────────
     THE AWAY HALF OF STEP 2, and the arm that closes the exploit src/core/buffs.js
     was written about: a buff alive when a window OPENS used to keep paying for the
     whole window, because the only thing that drained it was a setInterval in a
     live tab. [10] proves the feature is inert with no buff and [11] proves it is
     not inert with one; neither can tell "paid ten minutes" from "paid all night".

     Measured as a SANDWICH rather than against a hand-computed number, because the
     engine's output is a rolled simulation and an equality on a total would be a
     fixture that has to be re-typed on every balance change:

       bare  <  ten minutes of buff  <  a buff that outlives the window

     and the upper bound is the load-bearing half. Same seed, same span in all
     three, so the only difference between them is the drain.

     AND THE EQUALITY: a buff whose `until` is exactly the window end pays the same
     as one an hour past it. That pins the payout to the WINDOW rather than to how
     much buff is left over afterwards, which is what a wall-clock drain measured
     from the window start means (BUFF_DRAIN_RULE / remainingAtMs). */
  const payout = (out) => {
    /* A DIGEST, not the whole object: the summary honestly reports buffPaidMs and
       buffsExpired, which DIFFER between an expiring buff and an immortal one by
       design — comparing the full JSON would make the assertion tautological. What
       must move is what the player is PAID. */
    const o = out || {};
    const d = o.delta || o;
    return JSON.stringify({ xp: d.xp || null, items: d.items || null, gold: d.gold ?? null,
      kills: (o.summary && o.summary.kills) ?? null });
  };
  const untilAt = (ms) => [{ type: 'damage', magnitude: 200, until: new Date(ms).toISOString() }];
  const tenMin = payout(night(untilAt(FROM + 600000)));
  const immortal = payout(night(untilAt(NOW + 3600000)));
  const barePay = payout(night(undefined));
  ok(tenMin !== barePay,
    '[20] a buff alive for the first ten minutes of the window paid EXACTLY what no buff paid — the away '
    + 'engine is not reading the queue at the window start');
  ok(tenMin !== immortal,
    '[20] a buff that expired ten minutes into a ONE-HOUR window paid the same as a buff that outlived the '
    + 'window. That is the b326 exploit in its original form: alive at the start, therefore paid for the '
    + 'whole absence. Draining and paying are one rule (src/core/buffs.js tickBuffs).');
  ok(payout(night(untilAt(NOW))) === immortal,
    '[20] a buff expiring EXACTLY at the window end paid differently from one expiring an hour later — the '
    + 'payout must be bounded by the WINDOW, not by the leftover buff');

  /* AND THE CLIENT CLOCK CANNOT PAUSE IT. The `active === false` freeze is deleted
     (step 2): an idling character's wall clock runs, the server has always drained
     by wall clock (every engine caller passes active:true), and a client that froze
     the countdown showed a buff that was already over. A regression here is a pill
     that reads 8m 40s for an hour. */
  {
    const fq = [{ type: 'damage', magnitude: 5, remainingMs: 1000 }];
    const fr = tickBuffs(fq, 2000, { active: false, away: false });
    ok(fr.frozen === false && fq[0].remainingMs <= 0,
      '[20] tickBuffs still FREEZES on ctx.active === false. BUFF_DRAIN_RULE is wall-clock and the authority '
      + 'is an absolute `until` the server goes on expiring; got '
      + `${JSON.stringify(fr)} / ${JSON.stringify(fq)}.`);
  }

  return failed;
}

/** Registered surface for run-ci-local / run-smoke. */
export async function buffQueueGuard() { failed = 0; await run(); return failed; }

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/buff-queue.mjs');

if (RUN_DIRECTLY) {
  try {
    if (argv.includes('--list')) {
      for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(34)} ${m.why}`);
      process.exit(0);
    }

    if (argv.includes('--selftest')) {
      /* Scored by tests/mutation-proof.mjs: the CLEAN baseline runs FIRST and must
         be green, and an undeclared throw is a HARNESS error rather than a free
         "caught". Every arm is run GATE-BLIND (both §4 self-checks short-
         circuited) so the tick comes from THIS guard's assertions and not from
         the migration refusing to install — the renown-faucet lesson. */
      const code = await runMutationProof({
        label: 'buff-queue',
        cases: Object.entries(MUTATIONS).map(([id, m]) => ({ id, why: m.why })),
        baseline: async () => { await run(); },
        arm: async (id) => { await run(id, true); },
        failures: () => failed,
        reset: () => { failed = 0; },
      });
      process.exit(code);
    }

    const mArg = argv.find((a) => a.startsWith('--mutate='));
    const n = await run(mArg ? mArg.split('=')[1] : undefined, !!mArg);
    if (n) {
      console.error(`buff-queue: ${n} violation(s)`);
      process.exit(mArg ? 0 : 1);
    }
    if (mArg) { console.error(`\nx --mutate=${mArg.split('=')[1]}: STAYED GREEN.`); process.exit(1); }
    console.log('buff-queue: the server owns the buff clock ON A REBUILT CHAIN, by execution — no client '
      + 'role can reach hr_apply and a call as `authenticated` is refused; hr_item_buffs equals '
      + 'src/data/items.js row for row and every type is one the engine can pay; a valid buff_apply '
      + 'stamps until from now() + the catalogue duration with the catalogue type and magnitude; a '
      + 'forged until/magnitude/type/duration_ms/remaining_ms/scale is refused BY NAME with the queue '
      + 'unmoved; an unknown, non-buff or malformed item is refused; a second helping EXTENDS the tail, '
      + 'a stronger dish raises the magnitude to max and a weaker one cannot dilute it, a different type '
      + 'JOINS, and the type stays one row; repeated consumes land on the 60-minute cap and the next is '
      + 'refused buff_at_max with the gold in the same delta unmoved; a replayed intent buffs once; the '
      + 'envelope projects the queue top-level with a server-derived remaining_ms (expired entries at 0) '
      + 'and ate no neighbour; client_state refuses a forged buff patch while an honest one still saves; '
      + 'the accrual engine is BYTE-IDENTICAL with no live buff and demonstrably richer with one; the '
      + 'Cellar rung the player BOUGHT is what lengthens the buff (scale 1.0 with no Cellar, each rung '
      + "paying its own payload from a catalogue equal to src/data/perks.js, the number on the envelope "
      + "and on the apply's ONE ledger row); and a second apply of all three migrations leaves all "
      + 'three bodies byte-identical.');
    process.exit(0);
  } catch (e) {
    if (e && e.harness) { console.error(`buff-queue: HARNESS — ${e.message}`); process.exit(2); }
    throw e;
  }
}
