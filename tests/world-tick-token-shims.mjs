// ============================================================================
// tests/world-tick-token-shims.mjs — the three things Supabase has and PGlite
// does not, in ONE copy, so two guards cannot drift apart about what production
// looks like.
//
// Extracted from tests/world-tick-token-leak.mjs on 2026-09-23 when
// tests/world-tick-token-failclosed.mjs (Security T-1) needed the same fixtures
// to build the (Vault, no pgcrypto) state. It is a MOVE, not a rewrite: every
// string below is byte-for-byte what the leak guard pinned, and X-1 there still
// pins the crypto shim against node:crypto, against the migration's own
// constants and against tick.js before anything uses it for a verdict.
//
// ⚠ These are FAITHFUL STUBS OF DOCUMENTED BEHAVIOUR, not conveniences. Read
//   the header of tests/world-tick-token-leak.mjs for what each one does and —
//   more importantly — does NOT prove. In particular the pg_net stub ENCODES
//   the claim "pg_net stores convert_to(body::text,'UTF8')", read from pg_net's
//   own source; only the migration's d7, on production, proves it.
//
// This file has no assertions of its own. It is reachable through the two
// guards that import it (tests/guard-hygiene.mjs rule REACHABILITY, clause c).
// ============================================================================

/* The synthetic probe character. `gen_random_uuid()` cannot mint a v4 uuid with
   this body, so nothing here can collide with a real player row. */
export const PROBE = '00000000-0000-4000-8000-00000000d70c';

/* The token migration's own pinned vector (§5). Restated here so the files bind
   each other: if either constant moves, the leak guard's X-1 goes red. */
export const K_SECRET = 'a'.repeat(32) + 'b'.repeat(32);
export const K_BODY = '{"op": "tick"}';
export const K_BUCKET = 59666666;
export const K_SHA = '17282fb11f9af43c5f1eef8209d34638b3a13fb28ab449c2ad33ecdf1c0df883';
export const K_MAC = 'e64d6ce866a3f8a1333f774d5ae022f72a87a93ea3c4c4441571a5da1b5ccb91';

export function lit(s) { return `'${String(s).replace(/'/g, "''")}'`; }

/* ── THE pgcrypto SHIM. RFC 2104 over core sha256(). Not a mock of the answer:
      a second implementation of the algorithm, which is why it can be pinned. */
export const SHIM_CRYPTO = `
create schema if not exists extensions;
create or replace function extensions.digest(bytea, text)
returns bytea language plpgsql immutable as $f$
begin
  if $2 <> 'sha256' then raise exception 'shim: only sha256 (%)', $2; end if;
  return sha256($1);
end $f$;
create or replace function extensions.hmac(text, text, text)
returns bytea language plpgsql immutable as $f$
declare k bytea; i bytea := ''::bytea; o bytea := ''::bytea; n int; b int;
begin
  if $3 <> 'sha256' then raise exception 'shim: only sha256 (%)', $3; end if;
  k := convert_to($2, 'UTF8');
  if octet_length(k) > 64 then k := sha256(k); end if;
  for n in 0..63 loop
    if n < octet_length(k) then b := get_byte(k, n); else b := 0; end if;
    i := i || set_byte('\\x00'::bytea, 0, b # 54);
    o := o || set_byte('\\x00'::bytea, 0, b # 92);
  end loop;
  return sha256(o || sha256(i || convert_to($1, 'UTF8')));
end $f$;`;

/* ── THE SAME SHIM WITH ITS ARGUMENTS *NAMED*. Byte-for-byte the same algorithm;
      the only difference is three identifiers that pgcrypto happens not to spell.
      It exists for finding T-3: a resolution that matches
      `pg_get_function_identity_arguments` — which RENDERS ARGUMENT NAMES when
      they exist — would not find this, while `oidvectortypes(proargtypes)` is
      `'text, text, text'` either way. */
export const SHIM_CRYPTO_NAMED = SHIM_CRYPTO
  .replace('extensions.digest(bytea, text)', 'extensions.digest(p_data bytea, p_alg text)')
  .replace('extensions.hmac(text, text, text)', 'extensions.hmac(p_msg text, p_key text, p_alg text)');

/* ── THE VAULT SHIM. Two columns, the ones the driver and the helper read. The
      secret is a TEST value — the migration's own pinned vector — and is never
      production's. */
export const SHIM_VAULT = `
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (
  name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('hr_tick_shared_secret', ${lit(K_SECRET)}),
       ('hr_tick_gateway_key', 'test-anon-key-not-a-secret-by-design')
on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;`;

/* ── THE pg_net SHIM. pg_net's own body serialisation, verbatim. */
export const SHIM_NET = `
create schema if not exists net;
create table if not exists net.http_request_queue (
  id bigserial primary key, method text, url text, headers jsonb, body bytea,
  timeout_milliseconds int);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000)
returns bigint language sql as $f$
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('POST', url, headers, convert_to(body::text, 'UTF8'), timeout_milliseconds)
  returning id;
$f$;`;
