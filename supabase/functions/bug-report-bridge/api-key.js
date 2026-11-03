// supabase/functions/bug-report-bridge/api-key.js — THE PROJECT KEY THIS FUNCTION CALLS POSTGREST WITH.
//
// The platform injects SUPABASE_PUBLISHABLE_KEYS, a JSON object of named keys. The legacy
// SUPABASE_ANON_KEY is read only when that gives no publishable key, which is the switch's way
// back (2027-02-21-tick-gateway-apikey.sql): it dies with the legacy keys and then this line can
// go. Plain JS, so tests/legacy-keys.mjs drives the shipped bytes.

/** @param {(name: string) => string|undefined} env  @returns {string} '' when the project has no key */
export function projectApiKey(env) {
  let named = null;
  try { named = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || 'null'); } catch { named = null; }
  const key = named && typeof named === 'object' ? named.default : null;
  if (typeof key === 'string' && key.startsWith('sb_publishable_')) return key;
  return env('SUPABASE_ANON_KEY') || '';
}
