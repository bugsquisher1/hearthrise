// ============================================================================
// tests/predict-display.mjs — THE DISPLAY-PREDICTION GUARD (b455).
//
// WHAT IT PROTECTS, in the words of the live bug report that produced it:
//
//     "my woodcutting exp is bouncing from lvl 5 to lvl 1 over and over again"
//
// and Tyler's requirement for the fix:
//
//     "it all needs to be instant, drops, kills, exp, everything."
//
// Both are properties of the SAME seam, so they are guarded together:
//
//   1. INSTANT      an action's gain is visible on the action, not at the
//                   server's next settle (which the accrual engine floors at
//                   ACCRUE_MIN_MS = 60s, i.e. up to ~90s of nothing happening).
//   2. AUTHORITATIVE the record still holds ONLY the server's number. A
//                   prediction never reaches G.skills / G.gold, never trips the
//                   b347 fingerprint, and is never read by anything that spends.
//   3. NO BOUNCE    even if some future writer DOES trip the fingerprint, the
//                   display degrades to a real number and never to level 1.
//   4. NO DOUBLE-COUNT the envelope that states the truth retires the prediction
//                   it already contains.
//   5. DORMANT      with the record un-armed, every accessor answers exactly
//                   what it answered before this module existed.
//
// Pure Node — it drives src/net/{record,predict,skill-record,balance}.js
// directly. The LEGACY WIRING (addXp routing, getLevel, the combat gold seam) is
// proven separately by the in-page regression tests in
// src/features/smoke-test.js, because those need the engine.
// ============================================================================

const problems = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const base = new URL('../src/', import.meta.url).href;
/* ⚠ THE VERSION QUERY IS DERIVED, NEVER TYPED, AND IT IS LOAD-BEARING HERE.
   src/net/* import each other WITH the build's `?v=NNN`, and Node treats
   `accrue.js?v=455` and `accrue.js` as TWO SEPARATE MODULE INSTANCES with
   separate state. If this file pinned a literal version it would silently detach
   the instant the build bumped: `setServerAccrualEnabled` would flip a switch
   record.js has never heard of and the whole guard would go green vacuously.
   Reading BUILD.cache makes drift impossible. It also keeps the b332 rule
   (`tests/**` may not carry a hard-coded `?v=`) satisfied — there is no literal
   cache-buster in this file for bump-version.sh to be unable to reach. */
const { BUILD } = await import(base + 'build-info.js');
const V = '?v=' + BUILD.cache;
const record = await import(base + 'net/record.js' + V);
const predict = await import(base + 'net/predict.js' + V);
const skillRec = await import(base + 'net/skill-record.js' + V);
const balance = await import(base + 'net/balance.js' + V);
const accrue = await import(base + 'net/accrue.js' + V);
const capstone = await import(base + 'net/capstone.js' + V);

/* A simple, explicit level curve so the assertions read as arithmetic rather
   than as a lookup into the shipped table. The shipped curve is guarded
   elsewhere; what is under test here is which NUMBER reaches it. */
const LV = (xp) => Math.floor((Number(xp) || 0) / 100) + 1;

/** @param lagMs how far BEHIND `now` the server has settled (`accrued_to`). The
 *  real engine floors a window at ACCRUE_MIN_MS = 60s, so a live envelope always
 *  lags; 0 is the degenerate "fully caught up" case. */
function envelope(version, skills, gold, gems, lagMs) {
  const nowMs = 1700000000000 + version * 1000;
  const now = new Date(nowMs).toISOString();
  const accrued = new Date(nowMs - (Number(lagMs) || 0)).toISOString();
  return {
    ok: true, version, now,
    state: { accrued_to: accrued, gold, gems: gems || 0, marks: 0, rested_xp: 0, rested_at: now },
    skills, equipment: {}, progress: [], inventory: {},
  };
}

export async function predictDisplayGuard() {
  problems.length = 0;
  notes.length = 0;

  /* ══════════════════════════════════════════════════════════════════════
     A. ARMED — the gain is instant, and the record does not move.
     ══════════════════════════════════════════════════════════════════════ */
  accrue.setServerAccrualEnabled(true);
  ok(record.isServerOfRecord('skills'), 'ARMED SETUP: `skills` is not on the active registry — '
    + 'the whole guard below would pass vacuously against the dormant path.');
  ok(record.isServerOfRecord('gold'), 'ARMED SETUP: `gold` is not on the active registry.');
  ok(record.clientMayWrite('skills') === false,
    'ARMED SETUP: clientMayWrite("skills") is true under the arm — the write gate is open, '
    + 'so nothing would ever route to the prediction.');

  const G = {};
  record.applyRecord(G, envelope(10, { woodcutting: 500, attack: 300 }, 1000));
  ok(record.recordValue(G, 'skills').known === true,
    'A: the record did not vouch for `skills` straight after applyRecord.');
  ok(skillRec.skillXpForDisplay(G, 'woodcutting').value === 500,
    'A: the display did not answer the server xp before anything was predicted.');
  ok(balance.balanceForDisplay(G, 'gold').value === 1000,
    'A: the display did not answer the server gold before anything was predicted.');

  const snapshotSkills = JSON.stringify(G.skills);
  const snapshotGold = G.gold;

  /* ONE gather tick's worth of xp and one kill's worth of gold. */
  predict.predictXp(G, 'woodcutting', 35);
  predict.predictBalance(G, 'gold', 7);

  ok(JSON.stringify(G.skills) === snapshotSkills,
    'A/INSTANT: predicting xp MUTATED G.skills. The prediction must never touch a stamped '
    + 'field — that is the whole defect this seam exists to remove.');
  ok(G.gold === snapshotGold,
    'A/INSTANT: predicting gold MUTATED G.gold.');
  ok(record.recordValue(G, 'skills').known === true,
    'A/INSTANT: the b347 fingerprint tripped after a prediction — something wrote G.skills.');
  ok(record.recordValue(G, 'gold').known === true,
    'A/INSTANT: the b347 fingerprint tripped after a gold prediction.');

  ok(skillRec.skillXpForDisplay(G, 'woodcutting').value === 535,
    'A/INSTANT: the displayed xp did not move on the tick (got '
    + skillRec.skillXpForDisplay(G, 'woodcutting').value + ', want 535). This IS the '
    + '"nothing happens for 90 seconds" defect.');
  ok(skillRec.skillLevelForDisplay(G, 'woodcutting', LV) === LV(535),
    'A/INSTANT: the displayed LEVEL did not follow the predicted xp.');
  ok(balance.balanceForDisplay(G, 'gold').value === 1007,
    'A/INSTANT: the displayed gold did not move on the kill.');
  ok(balance.fmtBalance(G, 'gold') === (1007).toLocaleString(),
    'A/INSTANT: fmtBalance — the one function every gold render funnels through — did not '
    + 'show the predicted balance.');

  /* An UNTOUCHED skill must not drift. A prediction is per-id. */
  ok(skillRec.skillXpForDisplay(G, 'attack').value === 300,
    'A: predicting woodcutting moved attack.');

  /* THE ROLLUP MAP — what getTotalLevel / getCombatLevel / the combat roll read.
     It must agree with the per-id accessor exactly, or total level sits still for
     90 seconds while every individual tile moves. */
  const rollup = skillRec.skillsForDisplay(G);
  ok(rollup.woodcutting === 535 && rollup.attack === 300,
    'A/ROLLUP: skillsForDisplay disagrees with skillXpForDisplay — got ' + JSON.stringify(rollup));

  /* ══════════════════════════════════════════════════════════════════════
     B. AUTHORITY IGNORES THE PREDICTION — display-only, and provably so.
     ══════════════════════════════════════════════════════════════════════ */
  ok(skillRec.skillXpOf(G, 'woodcutting').value === 500,
    'B/AUTHORITY: skillXpOf returned the PREDICTED xp. The authority accessor must answer the '
    + 'server and only the server.');
  ok(skillRec.skillLevelOf(G, 'woodcutting', LV) === LV(500),
    'B/AUTHORITY: skillLevelOf followed the prediction.');
  ok(balance.balanceOf(G, 'gold').value === 1000,
    'B/AUTHORITY: balanceOf returned the PREDICTED gold.');
  ok(balance.canAfford(G, 1005, 'gold') === false,
    'B/AUTHORITY: canAfford let a spend through on PREDICTED gold. A prediction may never '
    + 'authorise a spend — the server owns every debit and this check must agree with it.');
  ok(balance.canAfford(G, 1000, 'gold') === true,
    'B/AUTHORITY: canAfford refused a spend the SERVER balance covers.');

  /* ══════════════════════════════════════════════════════════════════════
     C0. THE COVERAGE BOUNDARY — the arithmetic the anti-rewind rests on.
     ══════════════════════════════════════════════════════════════════════ */
  {
    const arrive = 5_000_000;
    /* A 60-second lag: the server built this envelope at T and had settled only
       up to T-60s. Everything the client predicted in the last 60 seconds is
       therefore NOT in it. */
    const c = predict.coverageBoundary(envelope(1, {}, 0, 0, 60_000), arrive);
    ok(c.lagMs === 60_000 && c.at === arrive - 60_000,
      'C0: the coverage boundary is not (arrival − lag): ' + JSON.stringify(c));

    /* ⚠ SKEW IMMUNITY — the property that makes this a duration and not a clock
       comparison. The SAME envelope read on a device whose clock is an hour off
       must produce the SAME boundary relative to arrival. A naive
       `prediction.at <= Date.parse(accrued_to)` fails this and would rewind every
       fast-clocked device permanently. */
    const skewed = predict.coverageBoundary(envelope(1, {}, 0, 0, 60_000), arrive + 3_600_000);
    ok(skewed.at - (arrive + 3_600_000) === c.at - arrive,
      'C0/SKEW: the boundary moved with the clock. It must be a DURATION back from arrival.');

    /* An unreadable watermark must fail toward KEEPING progress. */
    const blind = predict.coverageBoundary({ ok: true, state: {} }, arrive);
    ok(blind.source === 'age-bound' && blind.at === arrive - predict.MAX_PREDICTION_AGE_MS,
      'C0/BLIND: an envelope with no readable watermark did not fall back to the age bound — it '
      + 'either rewound everything or kept it forever, and both are wrong: ' + JSON.stringify(blind));

    /* An `accrued_to` in the server's own FUTURE is not a negative lag. */
    const ahead = predict.coverageBoundary(envelope(1, {}, 0, 0, -60_000), arrive);
    ok(ahead.lagMs === 0 && ahead.at === arrive,
      'C0: a future accrued_to produced a boundary past NOW, which would retire predictions the '
      + 'envelope provably cannot describe.');
  }

  /* ══════════════════════════════════════════════════════════════════════
     C1. THE REWIND — the live defect, and the property that removes it.

         start {kills:3756, gold:501, atkXp:5}   ← the kill landed instantly
         +12s  {kills:3755, gold:500, atkXp:1}   ← the settle took it away
     ══════════════════════════════════════════════════════════════════════ */
  {
    const W = {};
    const t = Date.now();
    const LAG = 60_000;
    record.applyRecord(W, envelope(50, { attack: 500 }, 1000, 0, LAG));
    /* Two grants: one from BEFORE the window the next envelope will settle, one
       from after it. Only the first can possibly be in the server's number. */
    predict.predictXp(W, 'attack', 100, t - 90_000);
    predict.predictXp(W, 'attack', 4, t - 5_000);
    predict.predictBalance(W, 'gold', 20, t - 90_000);
    predict.predictBalance(W, 'gold', 1, t - 5_000);
    const xpBefore = skillRec.skillXpForDisplay(W, 'attack').value;
    const goldBefore = balance.balanceForDisplay(W, 'gold').value;
    ok(xpBefore === 604 && goldBefore === 1021,
      'C1 SETUP: the display did not show server + both predictions (' + xpBefore + '/' + goldBefore + ')');

    /* THE SETTLE. The server has incorporated the older grants and nothing else. */
    record.applyRecord(W, envelope(51, { attack: 600 }, 1020, 0, LAG));

    ok(predict.predictedXp(W, 'attack') === 4,
      'C1/REWIND: the un-covered grant was retired — the display just deleted xp the player '
      + 'watched land. Predicted left: ' + predict.predictedXp(W, 'attack'));
    ok(predict.predictedBalance(W, 'gold') === 1,
      'C1/REWIND: the un-covered gold was retired.');
    ok(skillRec.skillXpForDisplay(W, 'attack').value === xpBefore,
      'C1/REWIND: THE DISPLAYED XP MOVED ACROSS THE SETTLE (' + xpBefore + ' → '
      + skillRec.skillXpForDisplay(W, 'attack').value + '). It must be continuous: the server took '
      + 'over exactly the part it settled and the rest is still predicted.');
    ok(balance.balanceForDisplay(W, 'gold').value === goldBefore,
      'C1/REWIND: THE DISPLAYED GOLD MOVED ACROSS THE SETTLE (' + goldBefore + ' → '
      + balance.balanceForDisplay(W, 'gold').value + '). This is the live "gold 501 → 500".');

    /* …and the covered part is NOT double-counted: the server's 600 already
       contains the 100, and 604 is 600 + the 4 that is genuinely still pending. */
    ok(skillRec.skillXpOf(W, 'attack').value === 600,
      'C1: the authority value is not the server number.');

  }

  /* THE ABSOLUTE AGE BOUND, on a state of its own so the queue stays in the
     order a real caller produces. A prediction nothing ever covers — a server
     whose watermark has stopped advancing — must not become a permanent
     inflation: the next envelope past MAX_PREDICTION_AGE_MS drops it whatever
     the watermark says. */
  {
    const AGE = {};
    const t = Date.now();
    record.applyRecord(AGE, envelope(60, { attack: 500 }, 1000, 0, 60_000));
    predict.predictXp(AGE, 'attack', 7, t - (predict.MAX_PREDICTION_AGE_MS + 60_000));
    predict.predictXp(AGE, 'attack', 4, t - 5_000);
    /* An envelope whose watermark covers NOTHING recent (a 24-hour lag). */
    record.applyRecord(AGE, envelope(61, { attack: 500 }, 1000, 0, 24 * 3600_000));
    ok(predict.predictedXp(AGE, 'attack') === 4,
      'C1/AGE: the age bound did not drop a prediction nothing will ever cover (or it dropped a '
      + 'fresh one with it). Got ' + predict.predictedXp(AGE, 'attack') + ', want 4.');
  }

  /* ══════════════════════════════════════════════════════════════════════
     C. RECONCILE — the envelope retires what it already contains.
     ══════════════════════════════════════════════════════════════════════ */
  const applied = record.applyRecord(G, envelope(11, { woodcutting: 600, attack: 300 }, 1007));
  ok(applied.written.indexOf('skills') !== -1, 'C: the reconcile envelope did not write skills.');
  ok(predict.predictedXp(G, 'woodcutting') === 0,
    'C/RECONCILE: the xp prediction survived the envelope that already contains it — the next '
    + 'render would DOUBLE-COUNT it, and every settle after that would add another copy.');
  ok(predict.predictedBalance(G, 'gold') === 0,
    'C/RECONCILE: the gold prediction survived its envelope.');
  ok(skillRec.skillXpForDisplay(G, 'woodcutting').value === 600,
    'C/RECONCILE: the display is not the server truth after the settle (got '
    + skillRec.skillXpForDisplay(G, 'woodcutting').value + ', want 600).');
  ok(balance.balanceForDisplay(G, 'gold').value === 1007,
    'C/RECONCILE: the displayed gold is not the server truth after the settle.');
  ok(predict.hasPredictions(G) === false,
    'C/RECONCILE: predictions remain outstanding after a full envelope.');

  /* A LEAN envelope — one that supplies no `skills` — must NOT clear xp a live
     tick has predicted since. The server has not stated those actions yet, and
     dropping them would make the bar walk backwards mid-session. */
  predict.predictXp(G, 'woodcutting', 20);
  const lean = envelope(12, {}, 1050);        // decodeSkills({}) === null → skills MISSING
  record.applyRecord(G, lean);
  ok(predict.predictedXp(G, 'woodcutting') === 20,
    'C/LEAN: an envelope that supplied NO skills cleared the xp prediction anyway. Only a field '
    + 'the server actually restated may retire its prediction.');
  ok(predict.predictedBalance(G, 'gold') === 0,
    'C/LEAN: gold WAS restated by that envelope and its prediction should have been retired.');
  predict.resetPredictions(G);

  /* ══════════════════════════════════════════════════════════════════════
     D. THE BOUNCE — the live defect, reproduced, and proven unreachable.
     ══════════════════════════════════════════════════════════════════════ */
  const B = {};
  record.applyRecord(B, envelope(20, { woodcutting: 500 }, 1000));
  const authoritativeBefore = skillRec.skillLevelOf(B, 'woodcutting', LV);
  ok(authoritativeBefore === LV(500), 'D SETUP: the stamped level did not read back.');

  /* A writer this sweep did not find — the shape of every historical instance:
     a direct mutation of the stamped map. */
  B.skills.woodcutting += 100;

  ok(record.recordValue(B, 'skills').known === false,
    'D: the b347 fingerprint did NOT catch a direct G.skills write. The whole authority model '
    + 'rests on it noticing.');
  ok(skillRec.skillLevelOf(B, 'woodcutting', LV) === null,
    'D: the AUTHORITY accessor vouched for a client-written number. It must fail closed.');

  /* …and THIS is the property the bug report bought: the DISPLAY must not
     collapse. legacy getLevel() floors a null to 1, so a null here IS "level 1". */
  const displayed = skillRec.skillLevelForDisplay(B, 'woodcutting', LV);
  ok(displayed !== null,
    'D/BOUNCE: the DISPLAY level went UNKNOWN after a stray G.skills write. legacy getLevel() '
    + 'floors that to 1 — this is exactly "woodcutting bouncing from lvl 5 to lvl 1".');
  ok(displayed === LV(600),
    'D/BOUNCE: the display did not fall back to the local optimistic value (got ' + displayed
    + ', want ' + LV(600) + ').');
  ok(skillRec.skillsForDisplay(B).woodcutting === 600,
    'D/BOUNCE: the ROLLUP map collapsed after a stray write — total level would read as if every '
    + 'skill were 1. Got ' + JSON.stringify(skillRec.skillsForDisplay(B)));
  ok(skillRec.skillXpForDisplay(B, 'woodcutting').rung === 'local',
    'D/BOUNCE: the display did not report WHICH rung of the fallback ladder it used — a silent '
    + 'degrade is a degrade nobody notices.');

  /* The same ladder for a balance: a local optimistic write (which is exactly
     what gold.js's settleCurrency does under the arm) must not em-dash. */
  B.gold = 900;
  ok(balance.balanceOf(B, 'gold').known === false,
    'D: the fingerprint did not catch a direct G.gold write.');
  ok(balance.fmtBalance(B, 'gold') !== balance.UNKNOWN_TEXT,
    'D/BOUNCE: a locally-predicted gold balance rendered as the pending em dash. Every Buy '
    + 'control and the whole topbar go blank for the width of a round trip.');
  ok(balance.balanceForDisplay(B, 'gold').value === 900,
    'D/BOUNCE: the display did not fall back to the local optimistic gold.');

  /* An ABSENT field is still UNKNOWN — the strip state, and the honest answer to
     it. This is the rung the B353-3 sweep depends on; losing it would make that
     whole guard vacuous. */
  delete B.gold;
  ok(balance.fmtBalance(B, 'gold') === balance.UNKNOWN_TEXT,
    'D/STRIP: a field that is ABSENT from G rendered a number. An absent moved field means '
    + '"the strip ran and nothing has arrived" and must render pending, or B353-3 proves nothing.');

  /* ══════════════════════════════════════════════════════════════════════
     E. HYGIENE — the prediction bag can never become a liability.
     ══════════════════════════════════════════════════════════════════════ */
  ok(predict.PRED_KEY.charAt(0) === '_',
    'E: the prediction bag is not `_`-prefixed, so snapshot() would upload it and a display '
    + 'guess would become a cloud record.');
  ok(capstone.RESIDUE_FIELDS.indexOf(predict.PRED_KEY) === -1,
    'E: the prediction bag is on the capstone residue allowlist — it would be persisted.');
  /* …and PROVE it against the real uploader rather than trusting the convention.
     `snapshot()` is a DENYLIST (save-invariant #3), so a new key rides to the cloud
     by DEFAULT — which is the safe direction for progress and exactly the wrong one
     for a display guess. */
  {
    /* events.js attaches a window face at module scope, so it needs the global to
       exist to be importable at all. Shimmed for the length of this one import and
       removed immediately — a lingering `window` would tip every later accessor
       into its browser branch and quietly change what the rest of this guard
       measures. */
    const hadWindow = typeof globalThis.window !== 'undefined';
    if (!hadWindow) globalThis.window = {};
    let snap = null;
    try {
      const events = await import(base + 'net/events.js' + V);
      const U = { gold: 1, [predict.PRED_KEY]: { xp: { woodcutting: { total: 40, q: [] } } } };
      snap = events.snapshot(U);
    } finally {
      if (!hadWindow) { try { delete globalThis.window; } catch (e) { globalThis.window = undefined; } }
    }
    ok(snap && snap[predict.PRED_KEY] === undefined,
      'E/UPLOAD: snapshot() carried the prediction bag to the cloud. A display guess must never '
      + 'become a record — that is the two-sources bug arriving through the save path.');
  }

  /* The refusals below are SUPPOSED to warn — that is half of what is being
     asserted. Silenced for the length of the block so a green CI transcript does
     not carry four alarming lines that mean "the guard worked". */
  const realWarn = console.warn;
  console.warn = () => {};
  const H = {};
  predict.predictXp(H, 'mining', Infinity);
  ok(predict.predictedXp(H, 'mining') === 0,
    'E: an Infinity was accepted into the prediction bag. One of those turns every later sum '
    + 'into NaN and the display into "NaN" (gold.js F8, same lesson).');
  predict.predictXp(H, 'mining', NaN);
  ok(predict.predictedXp(H, 'mining') === 0, 'E: a NaN was accepted into the prediction bag.');
  predict.predictBalance(H, 'gold', Infinity);
  ok(predict.predictedBalance(H, 'gold') === 0, 'E: an Infinity was accepted as a gold prediction.');
  predict.predictBalance(H, 'hearth_token', 5);
  ok(predict.predictedBalance(H, 'hearth_token') === 0,
    'E: a field with no ABSOLUTE envelope counterpart was predicted. Nothing would ever retire it.');

  for (let i = 0; i < predict.MAX_PREDICTED_SKILLS + 40; i++) predict.predictXp(H, 'junk' + i, 1);
  console.warn = realWarn;
  ok(Object.keys(predict.predictionState(H).xp).length <= predict.MAX_PREDICTED_SKILLS,
    'E: the prediction bag grew past MAX_PREDICTED_SKILLS — an unbounded bag is a leak with a '
    + 'renderer attached.');

  /* Authority changing hands drops everything. A prediction made about one
     character must never be rendered against another. */
  const S = {};
  record.applyRecord(S, envelope(30, { woodcutting: 500 }, 1000));
  predict.predictXp(S, 'woodcutting', 50);
  record.forgetServerOfRecord(S);
  ok(predict.hasPredictions(S) === false,
    'E/SLOT: forgetServerOfRecord left predictions standing. They belong to the character that '
    + 'was just forgotten.');
  ok(record.recordLastKnown(S, 'skills') === undefined,
    'E/SLOT: the last-known-good cache survived the strip — the display would render the '
    + 'PREVIOUS character while the new one loads.');
  ok(skillRec.skillXpForDisplay(S, 'woodcutting').known === false,
    'E/SLOT: the display still vouched for a forgotten character.');

  /* ══════════════════════════════════════════════════════════════════════
     F. DORMANT — byte-for-byte the pre-b455 answers.
     ══════════════════════════════════════════════════════════════════════ */
  accrue.setServerAccrualEnabled(false);
  ok(record.isServerOfRecord('skills') === false,
    'F SETUP: `skills` is still on the registry with the master switch off.');
  const D = { skills: { woodcutting: 500 }, gold: 1000, gems: 4 };
  ok(skillRec.skillXpForDisplayOr(D, 'woodcutting', 0) === skillRec.skillXpOr(D, 'woodcutting', 0),
    'F/DORMANT: the display accessor disagrees with the authority accessor while dormant. '
    + 'Dormant they must be the same function.');
  ok(skillRec.skillLevelForDisplay(D, 'woodcutting', LV) === skillRec.skillLevelOf(D, 'woodcutting', LV),
    'F/DORMANT: the display level disagrees with the authority level while dormant.');
  ok(balance.fmtBalance(D, 'gold') === (1000).toLocaleString(),
    'F/DORMANT: fmtBalance changed while dormant.');
  predict.predictXp(D, 'woodcutting', 35);
  predict.predictBalance(D, 'gold', 7);
  ok(skillRec.skillXpForDisplayOr(D, 'woodcutting', 0) === 500,
    'F/DORMANT: a prediction was ADDED to a dormant display. Dormant the client writes the real '
    + 'value, so adding a prediction on top would double-count every gain.');
  ok(balance.fmtBalance(D, 'gold') === (1000).toLocaleString(),
    'F/DORMANT: a gold prediction was added to a dormant display.');
  ok(balance.balanceForDisplay(D, 'gems').value === 4,
    'F/DORMANT: a client-owned balance stopped reading through.');
  accrue.setServerAccrualEnabled(true);

  notes.push('armed: a tick moves the display instantly (500→535 xp, 1000→1007 gold) with G.skills '
    + 'and G.gold byte-unchanged and the b347 fingerprint intact');
  notes.push('the settle is CONTINUOUS: an envelope retires only what its accrued_to watermark '
    + 'covers, so the displayed xp/gold is identical either side of it (the live 501→500 rewind)');
  notes.push('the coverage boundary is a DURATION back from arrival, so a skewed device gets the '
    + 'same answer; an unreadable watermark falls back to the bounded age rule');
  notes.push('the envelope retires exactly what it restated (no double-count, no lean-envelope drop)');
  notes.push('the lvl-5→lvl-1 bounce is unreachable: a stray stamped-field write degrades the '
    + 'DISPLAY to the local number, never to UNKNOWN');
  notes.push('authority (skillXpOf / balanceOf / canAfford) is blind to every prediction');
  notes.push('dormant is byte-for-byte the pre-b455 answer');
  return { problems: problems.slice(), notes: notes.slice() };
}

export async function runAll() {
  const r = await predictDisplayGuard();
  return r.problems;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
    || process.argv[1]?.endsWith('predict-display.mjs')) {
  const r = await predictDisplayGuard();
  for (const n of r.notes) console.log('  · ' + n);
  if (r.problems.length) {
    console.log('\nDisplay-prediction guard — FAILED:');
    for (const p of r.problems) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('Display-prediction guard — instant + authoritative + no bounce + no double-count.');
}
