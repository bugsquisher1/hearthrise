// ════════════════════════════════════════════════════════════════════════
// src/social/ground-presence.js — WHO ELSE IS HUNTING A GROUND, AS THE SERVER SAYS (MM-20; supabase/migrations/1045-ground-presence.sql
// hr_ground_presence), lane/c-social FB-12.
//
// "Seen, never fought beside": the other parties on a ground, by leader, clan tag and party size, friends and clan mates first, quiet
// and blocked players left off by the server. Asked when a ground's page shows and again at most once a minute while it stays up (the
// strip is a panel read, never a poll for nobody), one ask in flight per account; every number is the server's answer.
//   presenceOf(account, cs, hunt, onAnswer)  the last answer for this ground (or null), asking again when it is a minute old;
//                                            onAnswer() runs once the new answer is in
// ════════════════════════════════════════════════════════════════════════

const AGE_MS = 60000;
const KEPT = new WeakMap();   // account -> { [hunt]: { at, answer } , busy }

const int = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);

/** The server's answer, checked: { total, parties: [{ name, tag, size, level, friend, clan }] }, or null. Pure. */
export function stripOf(b) {
  if (!b || typeof b !== 'object' || b.ok !== true || int(b.total) === null || !Array.isArray(b.parties)) return null;
  const parties = b.parties.slice(0, 6).map((p) => (p && str(p.name, 24) && int(p.size) ? {
    name: p.name, tag: str(p.tag, 8), size: p.size, level: int(p.level), friend: p.friend === true, clan: p.clan === true } : null)).filter(Boolean);
  return { total: b.total, parties };
}

/** The strip for `hunt`: the last answer (or null), and a new ask when that one is a minute old. */
export function presenceOf(account, cs, hunt, onAnswer, now = Date.now()) {
  if (!account || !account.server || !cs || !Number.isInteger(cs.slot) || typeof hunt !== 'string') return null;
  let kept = KEPT.get(account);
  if (!kept) { kept = { grounds: Object.create(null), busy: false }; KEPT.set(account, kept); }
  const had = kept.grounds[hunt] || null;
  if (!kept.busy && (!had || now - had.at >= AGE_MS)) {
    kept.busy = true;
    kept.grounds[hunt] = { at: now, answer: had ? had.answer : null };
    Promise.resolve(account.server.rpc('hr_ground_presence', { p_slot: cs.slot, p_hunt: hunt })).then((ans) => {
      const s = ans && ans.ok ? stripOf(ans.body) : null;
      if (s) kept.grounds[hunt] = { at: now, answer: s };
    }, () => {}).finally(() => { kept.busy = false; if (typeof onAnswer === 'function') onAnswer(); });
  }
  return had ? had.answer : null;
}
