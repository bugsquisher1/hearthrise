-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-23-m8-parties-s1-3-client-surface.sql — M8 SLICE 1, FILE 3 OF 3:
--   RECORD THE SIX CLIENT-CALLABLE FUNCTIONS. THE S-14 FILE.
--
-- §18-SEC.1 S-14: *"Every function §18 adds needs its allowlist entry with its
-- claim argued, in the SAME lane-C batch, AFTER the file that grants it … or it
-- gets remembered on the morning the detector is red — and a detector expected
-- to be red hides the next real regression, which is the whole cost."*
--
-- Files 1 and 2 grant EXECUTE on six functions to `authenticated`:
--
--   hr_party_view(uuid)                    file 1
--   hr_party_create(int,uuid)              file 2
--   hr_party_invite(int,text,uuid)         file 2
--   hr_party_accept(int,uuid,uuid)         file 2
--   hr_party_leave(int,uuid)               file 2
--   hr_party_kick(int,text,uuid)           file 2
--
-- public.hr_client_rpc_baseline is the APPROVED CLIENT RPC SURFACE
-- (2026-08-11-grant-hygiene.sql). Check D2 of hr_assert_grant_hygiene lists
-- every function `anon` or `authenticated` can execute that is NOT in that
-- table, and RAISES in strict mode. Between applying file 1 and applying this
-- one the nightly `hr-grant-hygiene` cron job is RED on six entries. That gap
-- is the reason these three files apply in ONE sitting, in order.
--
--   ⚠ THIS FILE MUST NOT TRAIL ITS GRANTS OVERNIGHT.
--
-- ── WHICH ALLOWLIST, AND WHY NOT THE OTHER ONE ─────────────────────────────
-- There are two argued lists in this repo and they are not interchangeable:
--
--   c_engine_allow   inside hr_assert_grant_hygiene — what `hr_engine` may
--                    EXECUTE. Maintained by tools/derive-grant-hygiene.mjs as a
--                    DERIVED chain of links.
--   hr_client_rpc_baseline — what `anon`/`authenticated` may EXECUTE. A table.
--
-- **THIS BATCH GRANTS NOTHING TO `hr_engine`, so c_engine_allow is NOT
-- TOUCHED and no derive-grant-hygiene link is cut.** §5(c) asserts that
-- absence rather than leaving it to be inferred: an entry recorded for a grant
-- that does not exist is a pre-approval for a grant nobody has reviewed, and
-- the day someone "restored the allowlist" it would BE granted. The same
-- reasoning, in the other direction, is why 2026-09-22-trophy-claim.sql
-- deliberately registers nothing in hr_client_rpc_baseline and asserts THAT
-- absence: its verbs are engine-only.
--
-- S-14 also names hr_party_role, hr_party_of (and, in this batch,
-- hr_party_level and hr_party_hunt_live). Their correct "entry" is an asserted
-- ABSENCE from both lists, because they are granted to NOBODY — §5(b) proves
-- it per role and per list, so a later file that quietly grants one is red
-- here rather than red at 04:50 on a nightly cron.
--
-- ── TARGETED INSERTS, NEVER hr_grant_baseline_sync() ───────────────────────
-- A sync call re-approves the ENTIRE live surface and turns a differential
-- check into a rubber stamp. Six rows, six arguments, each naming what the
-- caller may send and what it can therefore reach.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   delete from public.hr_client_rpc_baseline where proname like 'hr_party%';
-- Then files 2 and 1 in reverse. Deleting these rows WITHOUT dropping the
-- grants makes the nightly detector red, which is the correct direction to
-- fail: a recorded surface that is not granted is inert, a granted surface
-- that is not recorded is unreviewed.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS — THE SIX GRANTS MUST EXIST BEFORE THEY ARE RECORDED ──
-- A file that records an allowlist entry for a grant that does not exist is a
-- pre-approval for a grant nobody has reviewed (the rule
-- 2026-09-22-engine-allowlist-hunt-reads.sql §1 states).
do $$
declare t text;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: hr_client_rpc_baseline is absent — apply 2026-08-11-grant-hygiene.sql first. Without it there is no approved client surface to record into and the detector cannot be green.';
  end if;
  foreach t in array array['public.hr_party_view(uuid)',
                           'public.hr_party_create(integer,uuid)',
                           'public.hr_party_invite(integer,text,uuid)',
                           'public.hr_party_accept(integer,uuid,uuid)',
                           'public.hr_party_leave(integer,uuid)',
                           'public.hr_party_kick(integer,text,uuid)'] loop
    if to_regprocedure(t) is null then
      raise exception 'PRECONDITION: % is absent — apply 2026-09-23-m8-parties-s1-1-tables.sql and 2026-09-23-m8-parties-s1-2-verbs.sql FIRST. This is file 3 of 3.', t;
    end if;
    if not has_function_privilege('authenticated', t, 'execute') then
      raise exception 'PRECONDITION: `authenticated` does not hold % — there is nothing to record, and recording it anyway pre-approves a grant nobody granted.', t;
    end if;
  end loop;
end $$;

-- ── 2. THE SIX ENTRIES, EACH WITH ITS CLAIM ARGUED ─────────────────────────
-- The claim every row makes: the caller's whole supplied surface is named, and
-- nothing in it can reach another player's economy or ranking. None of these
-- six moves gold, gems, Hearth Tokens, items, XP, a rank or a drop table;
-- 2026-09-23-m8-parties-s1-2-verbs.sql §8(y) asserts that by READING the five
-- verb bodies at apply time, so this note is checkable rather than asserted.
--
-- `delete` before `insert` so a re-apply converges rather than skipping a row
-- whose note has since been rewritten.
do $$
begin
  delete from public.hr_client_rpc_baseline
   where proname in ('hr_party_view','hr_party_create','hr_party_invite',
                     'hr_party_accept','hr_party_leave','hr_party_kick')
     and grantee = 'authenticated';

  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values

  ('hr_party_view', 'p_party uuid', 'authenticated',
   'added 2026-09-23 (M8 S1, Security S-7): THE ONE cross-user read M8 adds, and the only one it '
   'may have. Refuses any caller who is not a live member of the party named, checked against the '
   'CALLER''S OWN characters only — a caller cannot name someone else''s slot to borrow their '
   'membership. Returns a FROZEN column set per live member: display name, combat level, hp, '
   'hp_max, recovering_until, and the last settled window''s share_bp/xp/gold (NULL in S1, because '
   'nothing settles yet). NEVER inventory, never a gold BALANCE, never the ledger, never activity '
   'detail, never another member''s envelope. Adding a column is a code change with a review and '
   'file 1 §7(c) asserts the key set as an EQUALITY so it cannot drift. Caller surface: one party '
   'uuid, and a uuid they are not a member of answers not_in_party — the same string as one that '
   'never existed, so it is no existence probe. Read-only: writes nothing, calls nothing that '
   'writes. Rate-gated on the `party` bucket at 12/min.'),

  ('hr_party_create', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-09-23 (M8 S1): forms a party of ONE with the calling character as its leader, in '
   'one transaction — the 2026-08-11-clan-membership-authority.sql §8a lesson, that a two-step '
   'create can leave a party with no leader, i.e. a party nobody can ever administer. Caller '
   'surface: one of their OWN slots (validated 0..5 and against player_state) and an idempotency '
   'key. NO party id, name, size, role or timestamp is accepted from the client — size_cap is the '
   'column default under a CHECK of 2..4, the leader is auth.uid(), created_at is now(). Refuses '
   'already_in_party (invariant 1, and the partial unique index is the authority, not the read) '
   'and party_daily_cap at 10 per character per UTC day. Moves no value of any kind.'),

  ('hr_party_invite', 'p_slot integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-09-23 (M8 S1, Security S-13): leader-only invite BY DISPLAY NAME. The name is '
   'resolved INSIDE the function against public.display_names (already a public namespace by its '
   'own policy) and the target CHARACTER is chosen server-side as that account''s most recently '
   'updated slot — the client never names another player''s character. The sender is told exactly '
   'ONE refusal, invite_target_unavailable, for no-such-name / that-is-you / already-in-a-party / '
   'no-character / inbox-full alike, so the verb is not an oracle for whether a given player is '
   'currently partied; the real cause is journalled under its own hr_rejections code where the '
   'sender cannot read it. Clamped on BOTH sides: 20 sent per character per UTC day, and the '
   'receiver clamp §18 omitted — at most 5 live cards and 20 received per character per day. The '
   'success answer is {ok, sent} and names nothing about the target: not their user id, not their '
   'slot, not the invite id (which is the receiver''s row and the receiver''s policy to read). '
   'Moves no value.'),

  ('hr_party_accept', 'p_slot integer, p_invite uuid, p_idem uuid', 'authenticated',
   'added 2026-09-23 (M8 S1, Security S-11 and S-12): accepts an invite ADDRESSED TO THE CALLING '
   'CHARACTER — user_id and slot are in the WHERE clause, so naming another character''s invite id '
   'returns the same invite_gone as naming a uuid that never existed. Takes the party row lock '
   'before it decides anything, so the size re-count (T-6: a count read outside the lock is the '
   'shape the clan member-cap bug turned on) and the spread re-check are real rather than '
   'advisory. S-11: refused with party_hunt_running while the party has a live hunt (the predicate '
   'is FALSE in S1 and owned by S2; the call site ships tested). S-12: the ten-level combat spread '
   'is re-checked on EVERY accept, not only at hunt start, so a party cannot start inside the '
   'spread and then accept a level-1 alt. Caller surface: one of their own slots, one invite id '
   'addressed to them, one idempotency key. No role, no party id, no timestamp. Moves no value.'),

  ('hr_party_leave', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-09-23 (M8 S1): leaves the calling character''s party. DELIBERATELY UNCLAMPED per '
   '§18.3 — "a player may always leave" is a promise, so this verb has no day counter and no way '
   'to refuse a live member. Under the party row lock it stamps left_at, then either transfers '
   'leadership to the longest-tenured live member (order by joined_at, user_id — deterministic, '
   'no election, no window in which a party has no leader) or, if it was the last one out, stamps '
   'dissolved_at and revokes every live invite so no card survives its party. Caller surface: one '
   'of their own slots and an idempotency key; there is no target and no party id. Moves no value. '
   '(S-6''s churn clamp is on the SETTLE BOUNDARY a leave forces, which is S2''s: there is no '
   'window and nothing to pay in this slice, and membership is never held either way.)'),

  ('hr_party_kick', 'p_slot integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-09-23 (M8 S1): leader-only removal of one member, BY DISPLAY NAME, resolved only '
   'among that party''s own live members. By name and not by user id because hr_party_view''s '
   'frozen column set does not carry a user id and must not be widened to (S-7) — so the only '
   'names this can resolve are the ones the caller''s own panel already showed them, which makes '
   'it no oracle at all. Refuses not_party_leader, not_in_party for an unresolvable name, and '
   'bad_party for kicking yourself (leaving is hr_party_leave, which also transfers leadership). '
   'Clamped at 20 per PARTY per UTC day, counted off party_member.removed_by so a leadership '
   'transfer cannot reset it. Writes left_at and removed_by and nothing else; dissolves the party '
   'if the removal empties it. Moves no value. T-3 (kick-before-split settles the open window '
   'first and pays the member being removed) is S2''s and is named at the call site: there is no '
   'hunt, no window and nothing to pay in this slice.');
end $$;

-- ── 3. THE `party` BUCKET IS RECORDED WHERE AN OPERATOR LOOKS ──────────────
-- Not a table, a comment on the function that owns it: hr_rpc_gate's `else
-- return false` means an unknown bucket fails CLOSED, so "which buckets exist"
-- is a deployment fact, and it has been lost before
-- (2026-08-29-rpc-gate-bucket-restore.sql exists because of it).
comment on function public.hr_rpc_gate(text) is
  'The per-user, per-minute RPC rate gate. An UNKNOWN bucket returns FALSE, so '
  'a verb whose bucket was lost in a restatement ships green and dead — which '
  '2026-08-29-rpc-gate-bucket-restore.sql exists because of. The `party` bucket '
  '(M8 S1, 2026-09-23) sits at 12/min in the rarest band, with '
  'clan_create/clan_join/clan_kick, for that file''s reason: forming a party, '
  'inviting, accepting, leaving and kicking are once-in-a-while acts. It is a '
  'FLOOD fence and NOT the day clamp — §18.3''s per-day limits are '
  'player_progress `daily` rows per character, and party_kick''s is per PARTY, '
  'off party_member.removed_by.';

-- ── 4. THE CLIENT *WRITE* BASELINE IS NOT TOUCHED ──────────────────────────
-- Deliberately empty. public.hr_client_write_baseline records tables a client
-- holds INSERT/UPDATE/DELETE on. This batch grants none — the three party
-- tables are revoked from every client role and carry SELECT-only policies —
-- so registering one would declare a write grant nobody granted, and the next
-- "restore the baseline" would grant it. §5(d) asserts the ABSENCE, so this
-- comment cannot rot into a file that quietly started registering one.

-- ── 5. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- §18-SEC.3's last S1 line: *"Assert hr_assert_grant_hygiene(true) does not
-- raise."* It is the last arm here, because a detector that is green while
-- recording nothing is the failure this file exists to prevent — so (a)–(d)
-- first say WHAT is recorded and what is deliberately not.
do $$
declare
  v_n      bigint;
  v_report jsonb;
  t        text;
begin
  -- (a) SIX ROWS, SIX ARGUED CLAIMS. Counted, and the argument length is
  --     floored: "added for M8" is not a claim, and an allowlist whose entries
  --     stop being arguments is just a second place to hide.
  select count(*) into v_n from public.hr_client_rpc_baseline
   where proname in ('hr_party_view','hr_party_create','hr_party_invite',
                        'hr_party_accept','hr_party_leave','hr_party_kick')
     and grantee = 'authenticated';
  if v_n <> 6 then
    raise exception 'GATE(a): % hr_party_* row(s) in hr_client_rpc_baseline, expected 6', v_n; end if;
  if exists (select 1 from public.hr_client_rpc_baseline
              where proname in ('hr_party_view','hr_party_create','hr_party_invite',
                        'hr_party_accept','hr_party_leave','hr_party_kick')
                and length(coalesce(note, '')) < 200) then
    raise exception 'GATE(a): an hr_party_* baseline entry carries a note shorter than 200 characters. Adding an entry is a CLAIM about what the caller may send and what it can reach; a short note is not one.';
  end if;
  -- And every recorded row is actually REACHABLE, or the record is fiction.
  for t in select b.proname || '(' || b.identity_args || ')'
             from public.hr_client_rpc_baseline b
            where b.proname in ('hr_party_view','hr_party_create','hr_party_invite',
                        'hr_party_accept','hr_party_leave','hr_party_kick') loop
    -- Compared against pg_get_function_identity_arguments, which is EXACTLY the
    -- string check D2 matches on — not against to_regprocedure, which cannot
    -- parse an identity-args string carrying parameter NAMES. A row whose
    -- identity_args is a near miss is invisible to D2 and leaves the real grant
    -- unapproved while looking recorded, which is the worse of the two failures.
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public'
                      and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = t) then
      raise exception 'GATE(a): the baseline records public.%, and no function in public has that name AND that identity-args spelling. D2 matches on this string, so a near miss records nothing and leaves the grant unapproved while looking recorded.', t; end if;
  end loop;

  -- (b) THE INTERNAL PREDICATES ARE ON NO LIST, AND CALLABLE BY NOBODY.
  --     S-14 names hr_party_role and hr_party_of; hr_party_level and
  --     hr_party_hunt_live join them because this batch added them too. Their
  --     correct entry is an asserted ABSENCE, per role and per list.
  foreach t in array array['public.hr_party_of(uuid,integer)',
                           'public.hr_party_role(uuid,uuid,integer)',
                           'public.hr_party_level(uuid,integer)',
                           'public.hr_party_hunt_live(uuid)'] loop
    if has_function_privilege('anon', t, 'execute')
       or has_function_privilege('authenticated', t, 'execute')
       or has_function_privilege('service_role', t, 'execute') then
      raise exception 'GATE(b): % is executable by a client role. A client-callable membership predicate is an oracle it can sweep — hand it any (user, slot) and it answers which party that character is in, for every character in the game (hr_clan_may_admit''s rule).', t;
    end if;
  end loop;
  if exists (select 1 from public.hr_client_rpc_baseline
              where proname in ('hr_party_of','hr_party_role','hr_party_level','hr_party_hunt_live')) then
    raise exception 'GATE(b): an internal party predicate is REGISTERED in hr_client_rpc_baseline. That table is the approved CLIENT surface; a row there declares a client grant nobody granted, and the day someone restores the baseline it would BE granted.';
  end if;

  -- (c) c_engine_allow IS NOT TOUCHED, BECAUSE NOTHING HERE IS GRANTED TO
  --     hr_engine. Asserted from the live grants, not from the file's prose.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    foreach t in array array['public.hr_party_view(uuid)',
                             'public.hr_party_create(integer,uuid)',
                             'public.hr_party_invite(integer,text,uuid)',
                             'public.hr_party_accept(integer,uuid,uuid)',
                             'public.hr_party_leave(integer,uuid)',
                             'public.hr_party_kick(integer,text,uuid)',
                             'public.hr_party_of(uuid,integer)',
                             'public.hr_party_role(uuid,uuid,integer)',
                             'public.hr_party_level(uuid,integer)',
                             'public.hr_party_hunt_live(uuid)'] loop
      if has_function_privilege('hr_engine', t, 'execute') then
        raise exception 'GATE(c): hr_engine holds EXECUTE on %. This batch grants the engine NOTHING, so no derive-grant-hygiene link is cut and c_engine_allow carries no entry for it — which means the nightly detector would raise engine_execute_outside_allowlist on it tonight.', t;
      end if;
    end loop;
  end if;

  -- (d) NO CLIENT WRITE GRANT ON ANY OF THE THREE TABLES, AND NONE RECORDED.
  foreach t in array array['party','party_member','party_invite'] loop
    if exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = t
                  and grantee in ('anon','authenticated','PUBLIC','service_role')
                  and privilege_type <> 'SELECT') then
      raise exception 'GATE(d): a client role holds a non-SELECT privilege on public.%. The RPCs are the only door (§18.2.2): a client that could write here could invite itself.', t;
    end if;
  end loop;
  if to_regclass('public.hr_client_write_baseline') is not null then
    select count(*) into v_n from public.hr_client_write_baseline
     where table_name in ('party','party_member','party_invite');
    if v_n <> 0 then
      raise exception 'GATE(d): % party table(s) are registered in hr_client_write_baseline. This batch grants no client write, so a row there would declare one nobody granted.', v_n;
    end if;
  end if;

  -- (e) AND THE DETECTOR IS GREEN — STRICT, AND STILL A DETECTOR.
  --     A body that recorded the entries and stopped checking would pass a
  --     marker test and fail this one: the report is read for the two findings
  --     this batch could have produced, not merely for the absence of a raise.
  v_report := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(coalesce(v_report->'unapproved_client_rpcs', '[]'::jsonb)) > 0 then
    raise exception 'GATE(e): the detector still reports unapproved client RPC(s): %. This file exists to make that list empty.', v_report->'unapproved_client_rpcs';
  end if;
  if jsonb_array_length(coalesce(v_report->'ungated_client_rpcs', '[]'::jsonb)) > 0 then
    raise exception 'GATE(e): the detector reports ungated client RPC(s): %. Every client-callable SECURITY DEFINER function must reach a rate gate (A9).', v_report->'ungated_client_rpcs';
  end if;
  if not (v_report ? 'unapproved_client_rpcs' and v_report ? 'ungated_client_rpcs'
          and v_report ? 'engine_execute_outside_allowlist') then
    raise exception 'GATE(e): hr_assert_grant_hygiene returned a report missing its own checks (%). A detector that stopped checking passes a marker test and must fail this one.', v_report;
  end if;

  raise notice 'm8-parties-s1-3: six client-callable party functions recorded in hr_client_rpc_baseline, each with an argued claim of ≥200 characters and each reachable; the four internal predicates are callable by no client role and registered on NO list; hr_engine holds nothing from this batch so c_engine_allow is untouched; no client role holds a non-SELECT privilege on any of the three tables and none is recorded in hr_client_write_baseline; and hr_assert_grant_hygiene(true) returns GREEN with both of this batch''s findable lists empty and its own checks still present';
end $$;
