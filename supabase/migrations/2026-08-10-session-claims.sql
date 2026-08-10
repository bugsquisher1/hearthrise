-- ============================================================
-- 2026-08-10 — SINGLE ACTIVE DEVICE (session claim)  [b302]
--
-- Enforces one active device per account, "new device wins": signing in on a
-- new device CLAIMS the account (overwrites the prior claim), and the old
-- device detects it lost the claim on its next poll and locks itself out.
--
-- This is a tiny authoritative record of "which device currently owns this
-- account's live session". The client:
--   • claims on connect  (POST upsert → this device_id becomes the owner)
--   • polls every ~15s    (GET → if owner != me, I've been kicked → lock out)
-- No heartbeat/staleness needed: ownership only ever changes on an explicit
-- claim (a real sign-in), never passively.
--
-- SAFETY: RLS restricts every row to its own auth.uid(), so a device can only
-- ever read/claim ITS OWN account's session. The client treats any error or
-- missing row as "no enforcement" and never locks out on a network failure.
-- Until this migration is applied the feature is simply inert.
-- ============================================================

create table if not exists public.session_claims (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  device_id    text        not null,
  claimed_at   timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);

alter table public.session_claims enable row level security;

-- A user may only ever see and write their own claim row.
drop policy if exists "session_claims_select_own" on public.session_claims;
create policy "session_claims_select_own" on public.session_claims
  for select using (auth.uid() = user_id);

drop policy if exists "session_claims_insert_own" on public.session_claims;
create policy "session_claims_insert_own" on public.session_claims
  for insert with check (auth.uid() = user_id);

drop policy if exists "session_claims_update_own" on public.session_claims;
create policy "session_claims_update_own" on public.session_claims
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "session_claims_delete_own" on public.session_claims;
create policy "session_claims_delete_own" on public.session_claims
  for delete using (auth.uid() = user_id);
