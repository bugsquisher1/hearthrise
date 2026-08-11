-- R4 (E3) clan_members."join as self": the WITH CHECK pinned contributed, cp,
-- charge and role but left `joined_at` entirely to the client. joined_at is a
-- SECURITY DECISION INPUT -- raid_claim reads it for joined_after_kill and
-- joined_after_declare, and clan-seat reads it for the 72h alt-farm gate --
-- so a client-authored value there is a client-authored authorisation.
-- Pinned to the server clock with a two-minute tolerance either side (a
-- PostgREST round trip, not a game rule). The live client
-- (src/features/clans.js:139) posts {clan_id,user_id,role} and no joined_at at
-- all, so the column defaults to now() and this term is trivially satisfied.
--
-- NOTE: this does NOT close S-CAP-1 (any authenticated account can still join
-- ANY clan, because this policy is the only join path there is). That needs a
-- server-side clan_join RPC and is reported, not patched here.
drop policy if exists "join as self" on public.clan_members;
create policy "join as self" on public.clan_members for insert to authenticated
with check (
  (auth.uid() = user_id) and (contributed = 0) and (cp = 0) and (charge is null)
  and (joined_at between now() - interval '2 minutes' and now() + interval '2 minutes')
  and ((role = 'member') or ((role = 'leader')
    and exists (select 1 from clans c where c.id = clan_members.clan_id and c.created_by = auth.uid())
    and not exists (select 1 from clan_members m where m.clan_id = clan_members.clan_id)))
);
