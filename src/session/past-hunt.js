// ════════════════════════════════════════════════════════════════════════
// src/session/past-hunt.js — THE HUNT A YARD TOOK OVER, AS THE SERVER TALLIED IT, READ ONCE.
//
// Post-patch audit 2026-11-18 (v0.2.139) B4: a hunt that rolled into the yard came back as its card with the Levels and the yard, but
// no Gold, no Kills and no Best find. The envelope's `hunt_analyzer` is the newest session's, and that is the yard's: the hunt's own
// tally is no longer in it. The server still holds it, and already answers for any one of the hero's sessions: hr_hunt_analyzer
// (p_slot, p_session), a read (2026-10-26-hunt-analyzer-basic.sql: rate-gated, the basic block for everyone, the rest for premium).
//
//   askPastHunt(account, cs, session)  ONE read of that session's analyzer per page (the alert centre asks when a yard's line comes
//                                      up, src/shell/alerts.js); the answer read by the analyzer's own reader (hunt-sections.js
//                                      analyzerFrom). A refusal is remembered as nothing; a network failure may be asked again.
//   pastHuntOf(cs, session)            the answer, or null (not asked, asking, or nothing): the away line reads it (away-recap.js).
// Display only: nothing here gates, prices or spends, and the residue holds none of it.
// ════════════════════════════════════════════════════════════════════════
import { analyzerFrom } from './hunt-sections.js?v=0.2.140';

const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const READS = new WeakMap();   // cs -> Map(session -> analyzer | null | 'asking')
const readsOf = (cs) => { let m = READS.get(cs); if (!m) { m = new Map(); READS.set(cs, m); } return m; };

/** The server's analyzer of `session` for this hero once it has answered, else null. */
export function pastHuntOf(cs, session) {
  const v = cs && READS.has(cs) ? READS.get(cs).get(session) : undefined;
  return v && typeof v === 'object' ? v : null;
}

/** Read `session`'s analyzer once (see the header); resolves to it, or null. */
export async function askPastHunt(account, cs, session) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || typeof session !== 'string' || !SESSION.test(session)) return null;
  const m = readsOf(cs);
  if (m.has(session)) return pastHuntOf(cs, session);
  m.set(session, 'asking');
  let ans;
  try { ans = await account.server.rpc('hr_hunt_analyzer', { p_slot: cs.slot, p_session: session }); } catch (e) { m.delete(session); return null; }
  const a = ans && ans.ok && ans.body && ans.body.ok === true ? analyzerFrom(cs, ans.body) : null;
  m.set(session, a);
  return a;
}
