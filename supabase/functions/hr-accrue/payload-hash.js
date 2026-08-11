// ============================================================================
// supabase/functions/hr-accrue/payload-hash.js — GENERATED AT PACK TIME.
//
// `tools/pack-edge.mjs` overwrites the constant below with the sha256 of the
// deploy payload (every packed file, sorted by name, with THIS file's content
// normalised to the placeholder so the digest cannot depend on itself).
//
// The deployed function returns it from `GET /hr-accrue`. That is the only
// mechanism in this program that can answer "are the bytes running in
// production the bytes in this repo?" — a question `pack-edge --check` cannot
// answer, because --check only ever compares the repo with itself.
//
// IN THE REPO IT MUST STAY THE PLACEHOLDER. A committed real hash would be
// stale the moment src/core changed, and a stale hash that looks authoritative
// is worse than no hash: --check asserts the placeholder is intact.
// ============================================================================
export const PAYLOAD_SHA256 = 'unpacked';
