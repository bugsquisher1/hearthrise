// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/companions-claims-and-renown.js — companion grants, collection/milestone/rank/muster claims and the quest-reward transport.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 43 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, errorLog, stampBalanceLikeLoad, stampRecordLikeLoad, predZero, snapshotG, drain, stubSignedIn, restoreG, zeroRenownTerms, restoreRenownTerms, on, withClaimServer, goldOf, withServerBacked, hrCharmDriver, feedServerQuests, serverBagFixture } from './_harness.js?v=584';

/* LEDGER OF FIRSTS — the collection-log rungs read the SERVER mirrors, which
   are `_` scratch outside snapshotG. Each test saves and restores them by
   reference so no seeded count outlives its test. */
const MIRROR_KEYS = ['_bestiaryTrophies', '_collectionServer', '_collectionServerClaimed'];
const saveMirrors = () => {
  const G = window.G || {};
  const out = {};
  for (const k of MIRROR_KEYS) out[k] = Object.prototype.hasOwnProperty.call(G, k) ? { v: G[k] } : null;
  return out;
};
const restoreMirrors = (saved) => {
  const G = window.G; if (!G || !saved) return;
  for (const k of MIRROR_KEYS) { if (saved[k]) G[k] = saved[k].v; else delete G[k]; }
};
/* CLAIM-FROM-SERVER-3/-4 rig: THE QUEST STEP (hr_claim_quest).
   vitals 2026-09-28: `incomplete` on hr_claim_quest — first_cook counted LOCAL
   cook events and fired the claim at local 5/5. A step completes, claims and
   reads its number ONLY from the server's ev:<type> projection, stated through
   feedServerQuests (the QA seam); local counts move the bar only. */
const withQuestServer = async (counts, fn) => {
  const snap = snapshotG(), GC = window.HearthriseGoalClaim, note = window.notify, calls = [];
  let unfeed = feedServerQuests(counts);
  try {
    window.notify = () => {};
    window.HearthriseGoalClaim = { isSignedIn: () => true, claimQuest: (id) => { calls.push(id); return Promise.resolve({ ok: false, error: 'test_stub' }); } };
    window.ensureRetentionState();
    const q = window.G.quests.find((r) => r.id === 'first_cook');
    Object.assign(q, { done: false, claimed: false, progress: 0 });
    window.updateQuest('cooked', 5);                         // LOCAL 5/5
    const step = () => ({ s: { state: window.questClaimable(q) ? 'claimable' : 'open', count: window.hrQuestServerCount(q) } });
    await fn(q, () => calls.filter((id) => id === 'first_cook').length, step, (c) => { unfeed(); unfeed = feedServerQuests(c); });
  } finally { unfeed(); window.HearthriseGoalClaim = GC; window.notify = note; restoreG(snap); }
};
/* The hr_bestiary_of mirror the settle writes, seeded directly: `ids` killed once. */
const seedServerMonsters = (ids) => {
  const kbm = Object.create(null); ids.forEach((m) => { kbm[m] = 1; });
  window.G._bestiaryTrophies = { killsByMonster: kbm, index: Object.create(null), hasTrophyKey: false, claimed: new Set() };
};

export default [

  /* ══════════════════════════════════════════════════════════════════════════
     HATCH-REFUSE — A REFUSED COMPANION GRANT IS SURFACED, AND NOTHING IS SHOWN
     UNTIL THE SERVER HAS RECORDED IT.   (b499, regression)

     THE DEFECT. src/features/companions.js unlockCompanion PUSHED the id into
     G.companions.ownedIds, toasted "Companion unlocked", emitted the chronicle
     milestone, and only THEN fired hr_companion_grant fire-and-forget, `.catch(noop)`. The blob-retire capstone is ARMED (capstone.js
     BLOB_RETIRED = true), so accrue.js reconcileCompanions rebuilds
     G.companions from the SERVER owned-set on the next envelope: a refused grant
     therefore produced a toast, a Stable card and a chronicle line, and then the
     companion VANISHED with nothing said. Same shape as b494's rank claims.

     2026-09-06-companion-grant-hardening.sql made the refusals MACHINE CODES
     (unknown_unlock:<key> · missing_req_item · not_grantable) instead of a 500,
     so the client can now tell a refusal from an outage — and the fixtures below
     are that migration's own return envelopes, verbatim from its §4 probes.

     MUTATION (both proved): move applyUnlockLocally back ahead of the confirm →
     -1 goes red on four assertions; delete the notify in requestServerUnlock's
     refusal branch → -1 goes red on the notice assertions.
     ══════════════════════════════════════════════════════════════════════════ */



  () => tryRunAsync('server-credited (Tier-1 collection): under arm a milestone claim PROCEEDS, fires hr_claim_milestone WITH the slot, and does not double-pay locally', async () => {
    // 2026-08-22: hr_claim_milestone RE-DERIVES the DISTINCT monster/item count
    // from hr_bestiary_of / hr_collection_of and CREDITS the server-owned
    // gold+gems into player_state, once-guarded. The b411 defer is GONE. So under
    // arm the claim must PROCEED (mark claimed, fire the RPC with the active slot)
    // and NOT double-pay gold locally — the local write is a gated prediction the
    // envelope reconciles. Pre-arm it still pays locally (the control). Mirrors
    // the muster/raid and daily/quest server-credited tests.
    const C = window.HearthriseCollection;
    if (!C || typeof C.claimMilestone !== 'function' || !window.MONSTERS) return;
    const monIds = Object.keys(window.MONSTERS).slice(0, 10);
    if (monIds.length < 10) return;
    const snap = snapshotG();
    const mirrors = saveMirrors();
    const origMay = window.clientMayWriteRecordField;
    const origFetch = window.fetch;
    let unstub = () => {};
    const origRec = window.HearthriseRecord;
    let claimBody = null, claimCalls = 0, refreshCalls = 0;
    try {
      // A signed-in, server-backed environment with a mocked hr_claim_milestone.
      // Never let the balance refresh apply a real envelope into the live G.
      window.HearthriseRecord = { requestRecord: () => { refreshCalls++; return Promise.resolve(null); } };
      unstub = stubSignedIn(3);
      window.fetch = function (url, init) {
        if (String(url).indexOf('hr_claim_milestone') !== -1) {
          claimCalls++;
          try { claimBody = JSON.parse(init && init.body); } catch (e) { claimBody = null; }
          return Promise.resolve(new Response(
            JSON.stringify({ ok: true, milestone: 'hunter10', gold: 2000, gems: 0, credited: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      // Seed 10 SERVER-counted monsters (the hr_bestiary_of mirror — the only
      // thing that earns a rung since the Ledger of Firsts) so hunter10 is earned.
      seedServerMonsters(monIds);

      // ── CONTROL (pre-arm): the claim pays LOCALLY as a display prediction.
      window.clientMayWriteRecordField = function () { return true; };
      window.G.collectionLog = { claimed: [] };
      predZero(); window.G.gold = 0; claimCalls = 0; claimBody = null;
      const r1 = await C.claimMilestone('hunter10');
      assert(r1 && r1.gold === 2000, 'pre-arm claim must return the reward');
      assert(window.G.gold === 2000, 'pre-arm claim renders the reward locally; got ' + window.G.gold);
      assert(window.G.collectionLog.claimed.indexOf('hunter10') >= 0, 'pre-arm claim marks the milestone claimed');
      assert(claimCalls === 1, 'pre-arm claim must fire hr_claim_milestone exactly once; saw ' + claimCalls);
      assert(claimBody && claimBody.p_slot === 3, 'claim must pass the active slot; got ' + JSON.stringify(claimBody));

      // ── ARMED: the claim PROCEEDS, fires the RPC WITH the slot, marks claimed,
      //    and does NOT write gold locally (the server credited player_state).
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };
      window.G.collectionLog = { claimed: [] };
      predZero(); window.G.gold = 0; claimCalls = 0; claimBody = null; refreshCalls = 0;
      const r2 = await C.claimMilestone('hunter10');
      assert(r2 && r2.gold === 2000, 'armed claim must PROCEED and return the reward (the b411 defer is gone)');
      assert(window.G.gold === 0, 'armed claim must NOT double-pay gold locally (server credits player_state); got ' + window.G.gold);
      assert(window.G.collectionLog.claimed.indexOf('hunter10') >= 0, 'armed claim marks the milestone claimed (consumed server-side)');
      assert(claimCalls === 1, 'armed claim must fire hr_claim_milestone; the defer is removed; saw ' + claimCalls);
      assert(claimBody && claimBody.p_slot === 3, 'armed claim must pass the active slot for the server to credit; got ' + JSON.stringify(claimBody));
      assert(refreshCalls === 1, 'an ok credit must refresh the record so the balance moves; saw ' + refreshCalls);
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.fetch = origFetch;
      unstub();
      window.HearthriseRecord = origRec;
      if (C.__resetClaimState) C.__resetClaimState();
      restoreMirrors(mirrors);
      restoreG(snap);
    }
  }),

  /* ── MILESTONE-CLAIM-1 — THE SAME DEFECT ON THE SIBLING SURFACE ──────────────
     claimMilestone was fire-and-forget with an UNCONDITIONAL
     `s.claimed.push(id)`, and `G.collectionLog` is RESIDUE — so a refused
     milestone was marked claimed forever. And the refusal is the COMMON case,
     not the edge: `getStats` counts what the ATTENDED player saw (G.bestiary /
     G.collection), hr_claim_milestone counts its own away-sim rows, which
     realise 60–99% fewer kills. Client 12 monsters, server 4, `incomplete`, and
     an EARNED milestone is consumed with nothing paid. */
  () => tryRunAsync('MILESTONE-CLAIM-1: a REFUSED hr_claim_milestone leaves the milestone re-claimable, pays nothing, and says so honestly', async () => {
    const C = window.HearthriseCollection;
    if (!C || typeof C.claimMilestone !== 'function' || !window.MONSTERS) return;
    const monIds = Object.keys(window.MONSTERS).slice(0, 12);
    if (monIds.length < 12) return;
    const snap = snapshotG();
    const mirrors = saveMirrors();
    const origMay = window.clientMayWriteRecordField;
    const origFetch = window.fetch;
    let unstub = () => {};
    const origRec = window.HearthriseRecord;
    const origNotify = window.notify;
    let claimCalls = 0, refreshCalls = 0;
    const said = [];
    try {
      unstub = stubSignedIn(0);
      window.HearthriseRecord = { requestRecord: () => { refreshCalls++; return Promise.resolve(null); } };
      window.notify = (m) => { said.push(String(m || '')); };
      window.fetch = function (url) {
        if (String(url).indexOf('hr_claim_milestone') !== -1) {
          claimCalls++;
          return Promise.resolve(new Response(
            JSON.stringify({ ok: false, error: 'incomplete', milestone: 'hunter10', have: 4, goal: 10, domain: 'monsters' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };  // ARMED
      seedServerMonsters(monIds);
      window.G.collectionLog = { claimed: [] };
      predZero(); window.G.gold = 0;

      assert(C.claimable(window.G).some((m) => m.id === 'hunter10'), 'hunter10 must be claimable at 12 server-counted monsters');
      const out = await C.claimMilestone('hunter10', window.G);

      assert(claimCalls === 1, 'the claim must reach the server exactly once; saw ' + claimCalls);
      assert(out === null, 'a refused claim must resolve to null, never the reward');
      assert(window.G.collectionLog.claimed.indexOf('hunter10') < 0,
        'THE BUG: a REFUSED milestone was marked claimed — permanently and silently lost. It must stay unclaimed.');
      assert(C.claimable(window.G).some((m) => m.id === 'hunter10'),
        'a refused milestone must still be offered — the player has not been paid for it');
      assert((window.G.gold || 0) === 0, 'a refused claim must leave no gold prediction; got ' + window.G.gold);
      assert(refreshCalls === 0, 'a refused claim has nothing to refresh');
      const msg = said.join(' | ');
      assert(said.length >= 1, 'a refused claim must TELL the player — silence is the original defect');
      assert(msg.indexOf('incomplete') < 0, 'the player is told a sentence, never the raw error code: ' + msg);
      assert(/4/.test(msg) && /10/.test(msg), 'the refusal must answer in the SERVER’s own count: ' + msg);
      const sh = C.milestoneShortfall('hunter10');
      assert(sh && sh.have === 4 && sh.goal === 10 && sh.domain === 'monsters',
        'the server shortfall must be retained for the modal row; got ' + JSON.stringify(sh));

      // And it must be re-claimable for real once the server's count catches up.
      window.fetch = function (url) {
        if (String(url).indexOf('hr_claim_milestone') !== -1) {
          claimCalls++;
          return Promise.resolve(new Response(
            JSON.stringify({ ok: true, milestone: 'hunter10', gold: 2000, gems: 0, credited: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      const out2 = await C.claimMilestone('hunter10', window.G);
      assert(out2 && out2.gold === 2000, 'the retry after the server caught up must pay');
      assert(window.G.collectionLog.claimed.indexOf('hunter10') >= 0, 'the successful retry marks it claimed');
      assert(C.milestoneShortfall('hunter10') === null, 'a paid milestone must drop its shortfall note');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.fetch = origFetch;
      unstub();
      window.HearthriseRecord = origRec;
      window.notify = origNotify;
      if (C.__resetClaimState) C.__resetClaimState();
      restoreMirrors(mirrors);
      restoreG(snap);
    }
  }),

  /* ── LEDGER OF FIRSTS (2026-09-27) — A RUNG IS EARNED ONLY BY THE SERVER'S COUNT ──
     hr_claim_milestone verifies against hr_bestiary_of / hr_collection_of. The
     log used to decide "earned" from G.bestiary (attended kills, runs ahead of
     the server) and G.collection (the bag — gathered, crafted, bought) and so
     offered Claim on rungs the server answered `incomplete` (CLAUDE.md §6).
     Every test below seeds the RESIDUE richer than the SERVER, so pointing the
     gate back at G.bestiary / G.collection turns it red. */
  () => tryRunAsync('LEDGER-1: server 25 monsters (residue 40) — hunter25 claimable, hunter40 NOT; a credit marks it, a replay says already claimed', async () => {
    const C = window.HearthriseCollection;
    if (!C || typeof C.claimMilestone !== 'function' || !window.MONSTERS || typeof window.hrNoteServerTrophies !== 'function') {
      return skip('HearthriseCollection / hrNoteServerTrophies not loaded');
    }
    const ids = Object.keys(window.MONSTERS);
    if (ids.length < 40) return skip('fewer than 40 monsters');
    const snap = snapshotG();
    const mirrors = saveMirrors();
    const origMay = window.clientMayWriteRecordField;
    const origNotify = window.notify;
    const said = [];
    try {
      window.clientMayWriteRecordField = function (f) { return f !== 'gold' && f !== 'gems'; };  // ARMED
      window.notify = (m) => { said.push(String(m || '')); };
      window.G.bestiary = {}; ids.slice(0, 40).forEach((m) => { window.G.bestiary[m] = { kills: 3 }; });
      // The SERVER half, through the real adopter the settle calls.
      const kbm = {}; ids.slice(0, 25).forEach((m) => { kbm[m] = 1; });
      window.hrNoteServerTrophies({ ok: true, bestiary: { kills_by_monster: kbm, kills_by_class: {} } });
      window.G.collectionLog = { claimed: [] };
      const cl = C.claimable(window.G).map((m) => m.id);
      assert(cl.indexOf('hunter25') >= 0, 'hunter25 must be claimable at a SERVER count of 25; got ' + JSON.stringify(cl));
      assert(cl.indexOf('hunter40') < 0,
        'hunter40 is offered at a server count of 25 because the RESIDUE holds 40 — the server would answer incomplete');
      const before = goldOf();
      await withClaimServer({ ok: true, milestone: 'hunter25', gold: 4000, gems: 0, credited: true }, async (rig) => {
        const r = await C.claimMilestone('hunter25', window.G);
        assert(r && r.gold === 4000, 'a confirmed hunter25 claim must report its 4,000 gold');
        assert(rig.calls.length === 1 && rig.calls[0].args[0] === 'hunter25', 'the claim sent ' + JSON.stringify(rig.calls));
      });
      assert(goldOf() === before, 'the client paid the server-owned reward itself (' + before + ' -> ' + goldOf() + ')');
      assert(window.G.collectionLog.claimed.indexOf('hunter25') >= 0, 'a credited hunter25 must be marked claimed');
      assert(C.claimable(window.G).every((m) => m.id !== 'hunter25'), 'a claimed hunter25 is still offered');
      // REPLAY: a lost residue re-offers it; the server's once-guard answers.
      window.G.collectionLog = { claimed: [] };
      said.length = 0;
      await withClaimServer({ ok: false, error: 'already_claimed', milestone: 'hunter25' }, async () => {
        await C.claimMilestone('hunter25', window.G);
      });
      assert(said.some((m) => /already claimed/i.test(m)), 'the replay must say already claimed; said ' + JSON.stringify(said));
      assert(window.G.collectionLog.claimed.indexOf('hunter25') >= 0, 'already_claimed must mark the rung claimed');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.notify = origNotify;
      if (C.__resetClaimState) C.__resetClaimState();
      restoreMirrors(mirrors);
      restoreG(snap);
    }
  }),

  () => tryRun('LEDGER-2: residue 30 items, server found 10 — collect25 NOT claimable and the next rung reads 10/25; at found 25 it is', () => {
    const C = window.HearthriseCollection;
    if (!C || typeof C.noteServerCounts !== 'function' || !window.ITEMS) return skip('HearthriseCollection not loaded');
    const itemIds = Object.keys(window.ITEMS).slice(0, 30);
    if (itemIds.length < 30) return skip('fewer than 30 items');
    const snap = snapshotG();
    const mirrors = saveMirrors();
    const sCol = window.G.collection ? JSON.parse(JSON.stringify(window.G.collection)) : undefined;
    try {
      window.G.collection = {}; itemIds.forEach((id) => { window.G.collection[id] = 2; });
      window.G.collectionLog = { claimed: [] };
      assert(C.noteServerCounts({ ok: true, collection: { found: 10 } }) === true, 'the envelope block was not adopted');
      assert(C.claimable(window.G).every((m) => m.id !== 'collect25'),
        'collect25 is offered at a server count of 10 because the bag holds 30 ids — the server counts combat drops only');
      const nx = C.nextRungs(window.G).filter((r) => r.m.domain === 'items')[0];
      assert(nx && nx.m.id === 'collect25' && nx.have === 10 && nx.goal === 25,
        'the next items rung must read collect25 10/25; got ' + JSON.stringify(nx && { id: nx.m.id, have: nx.have, goal: nx.goal }));
      window.HearthriseJournal.open('collection');
      const line = document.querySelector('#panel-journal [data-cl-next="collect25"]');
      assert(line && /Magpie: 10\/25 combat drops/.test(line.textContent || ''),
        'the log must render the next rung "Magpie: 10/25 combat drops"; got ' + (line && line.textContent));
      assert(!document.querySelector('#panel-journal [data-cl-claim="collect25"]'), 'an unearned rung rendered a Claim button');
      C.noteServerCounts({ ok: true, collection: { found: 25 } });
      assert(C.claimable(window.G).some((m) => m.id === 'collect25'), 'collect25 must be claimable at server found 25');
    } finally {
      window.showTab('profile');
      if (sCol === undefined) delete window.G.collection; else window.G.collection = sCol;
      restoreMirrors(mirrors);
      restoreG(snap);
    }
  }),

  () => tryRun('LEDGER-3: a server claim row (kind collection, hunter25, claimed) wins over an unclaimed residue', () => {
    const C = window.HearthriseCollection;
    if (!C || typeof C.noteServerClaims !== 'function' || !window.MONSTERS) return skip('HearthriseCollection not loaded');
    const snap = snapshotG();
    const mirrors = saveMirrors();
    try {
      seedServerMonsters(Object.keys(window.MONSTERS).slice(0, 30));
      window.G.collectionLog = { claimed: [] };
      assert(C.claimable(window.G).some((m) => m.id === 'hunter25'), 'CONTROL: hunter25 must be claimable before the claim row arrives');
      C.noteServerClaims([{ kind: 'collection', key: 'hunter25', period: '', state: 'claimed' }]);
      assert(C.claimable(window.G).every((m) => m.id !== 'hunter25'),
        'the server holds a hunter25 claim row and the log still offers it — the residue alone decided "claimed"');
      assert(C.claimable(window.G).some((m) => m.id === 'hunter10'), 'hunter10 has no server claim row and must stay claimable');
    } finally {
      restoreMirrors(mirrors);
      restoreG(snap);
    }
  }),

  () => tryRun('LEDGER-4: no server mirror — zero claimable rungs, whatever the residue holds', () => {
    const C = window.HearthriseCollection;
    if (!C || typeof C.claimable !== 'function' || !window.MONSTERS || !window.ITEMS) return skip('HearthriseCollection not loaded');
    const snap = snapshotG();
    const mirrors = saveMirrors();
    const sCol = window.G.collection ? JSON.parse(JSON.stringify(window.G.collection)) : undefined;
    try {
      delete window.G._bestiaryTrophies; delete window.G._collectionServer; delete window.G._collectionServerClaimed;
      window.G.bestiary = {}; Object.keys(window.MONSTERS).forEach((m) => { window.G.bestiary[m] = { kills: 1 }; });
      window.G.collection = {}; Object.keys(window.ITEMS).forEach((id) => { window.G.collection[id] = 1; });
      window.G.collectionLog = { claimed: [] };
      const cl = C.claimable(window.G).map((m) => m.id);
      assert(cl.length === 0, 'with no server mirror the log offered ' + JSON.stringify(cl) + ' off the residue alone');
    } finally {
      if (sCol === undefined) delete window.G.collection; else window.G.collection = sCol;
      restoreMirrors(mirrors);
      restoreG(snap);
    }
  }),

  /* LEDGER-5 — an unknown server count is PENDING, never 0 (CLAUDE.md §6). The
     numbers ride only settle(), so the idle and away arms go through it. */
  () => tryRunAsync('LEDGER-5: an unknown count renders pending, never 0; the settle turns it into the number', async () => {
    const C = window.HearthriseCollection, A = window.HearthriseAccrual;
    if (!C || typeof C.tileLine !== 'function' || !A || !window.MONSTERS) return skip('HearthriseCollection not loaded');
    const snap = snapshotG(); const mirrors = saveMirrors(); const rig = hrCharmDriver(); const realFetch = window.fetch;
    const eight = {}; Object.keys(window.MONSTERS).slice(0, 8).forEach((m) => { eight[m] = 1; });
    const bestiary = { kills_by_monster: eight, kills_by_class: {} };
    const line = (id) => { const e = document.querySelector('#panel-journal [data-cl-next="' + id + '"]'); return e ? e.textContent || '' : null; };
    const unknown = () => { delete window.G._bestiaryTrophies; delete window.G._collectionServer; delete window.G._collectionServerClaimed; window.G.collectionLog = { claimed: [] }; };
    const resolved = (arm) => {
      assert(/Novice Hunter: 8\/10 monsters/.test(line('hunter10') || ''), arm + ': monsters line reads ' + line('hunter10'));
      assert(/Magpie: 21\/25 combat drops/.test(line('collect25') || ''), arm + ': items line reads ' + line('collect25'));
      assert(!document.querySelector('#panel-journal .hr-cl-top .bal-pending, #panel-journal [data-cl-next] .bal-pending'), arm + ': a pending mark survived the settle');
      assert(C.tileLine(window.G).text === 'Next: Magpie 21/25', arm + ': tile reads ' + JSON.stringify(C.tileLine(window.G)));
    };
    try {
      // UNKNOWN: no mirror at all.
      unknown(); window.HearthriseJournal.open('collection');
      const rows = [...document.querySelectorAll('#panel-journal [data-cl-next]')];
      assert(rows.map((r) => r.getAttribute('data-cl-next')).join() === 'hunter10,collect25', 'next rungs: ' + rows.map((r) => r.getAttribute('data-cl-next')));
      rows.forEach((r) => {
        assert(!/(^|\D)0\/\d/.test(r.textContent || ''), 'an unknown count rendered as 0: ' + r.textContent);
        assert(r.querySelector('.bal-pending'), 'no pending mark on ' + r.getAttribute('data-cl-next'));
      });
      const tl = C.tileLine(window.G);
      assert(tl && tl.pending === true && !/\b0\//.test(tl.text), 'tile: ' + JSON.stringify(tl));
      C.noteServerClaims([{ kind: 'collection', key: 'hunter10', period: '', state: 'claimed' }]); window.HearthriseJournal.open('collection');
      assert(line('hunter25') !== null && document.querySelector('#panel-journal [data-cl-next="hunter25"] .bal-pending'), 'a claimed rung was named next: ' + line('hunter10'));
      // ATTENDED/IDLE: the accrued:false reply a reloading player gets; the OPEN log resolves in place.
      unknown(); window.HearthriseJournal.open('collection');
      const idle = await rig.drive(bestiary, { collection: { found: 21 } });
      assert(idle && idle.outcome === 'nothing', 'idle settle: ' + JSON.stringify(idle));
      resolved('idle, same open modal');
      window.HearthriseJournal.open('collection'); resolved('idle, re-opened');
      // AWAY: an accrued:true envelope through settle().
      unknown(); rig.restore();
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      await withServerBacked({ extra: { accrued: true, away: {}, bestiary, collection: { found: 21 } } }, async () => {
        const away = await A.requestAccrual({ force: true });
        assert(away && away.outcome === 'accrued', 'away settle: ' + JSON.stringify(away && away.outcome));
      });
      window.HearthriseJournal.open('collection'); resolved('away');
      // REFUSED: a 503 writes no mirror; the line stays pending.
      unknown(); A.resetAccrualGate();
      window.fetch = (u, init) => (/hr-accrue/.test(String(u)) ? Promise.resolve(new Response('{"error":"down"}', { status: 503 })) : realFetch.call(window, u, init));
      const down = await A.requestAccrual({ force: true });
      assert(down && down.outcome === 'unavailable', 'refused settle: ' + JSON.stringify(down && down.outcome));
      window.HearthriseJournal.open('collection');
      assert(document.querySelector('#panel-journal [data-cl-next="hunter10"] .bal-pending') && !window.G._bestiaryTrophies && !window.G._collectionServer, 'a refused settle resolved the count');
    } finally {
      window.fetch = realFetch; rig.restore();
      window.showTab('profile');
      restoreG(snap); try { A.__resetAwayReceipt(); } catch (e) {}
      restoreMirrors(mirrors);
    }
  }),

  () => tryRunAsync('LEDGER-6: the boot hr_load feeds the server claim rows', async () => {
    const R = window.HearthriseRecord, C = window.HearthriseCollection;
    if (!R || typeof R.beginRecordLoad !== 'function' || !C || !window.MONSTERS || !window.HearthriseProperty) return skip('record.js not loaded');
    const realFetch = window.fetch, realG = window.G, P = window.HearthriseProperty;
    const prevProp = P.__resetPropertyRecord();   // the fixture's complete progress statement would observe tier 0
    try {
      R.resetRecord();
      R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon', authToken: () => 'jwt', slot: 0 });
      window.G = {};
      const now = new Date().toISOString();
      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({ ok: true, version: Date.now(), now,
          state: { slot: 0, gold: 1, gems: 0, accrued_to: now },
          progress: [{ kind: 'collection', key: 'hunter10', period: '', state: 'claimed' }], progress_truncated: false }), { status: 200 }));
      };
      const out = await R.beginRecordLoad();
      assert(out && out.outcome === 'loaded', 'boot load: ' + JSON.stringify(out));
      assert(Array.isArray(window.G._collectionServerClaimed) && window.G._collectionServerClaimed.includes('hunter10'),
        'the boot load dropped the server claim rows: ' + JSON.stringify(window.G._collectionServerClaimed));
      seedServerMonsters(Object.keys(window.MONSTERS).slice(0, 30));
      window.G.collectionLog = { claimed: [] };
      const cl = C.claimable(window.G).map((m) => m.id);
      assert(!cl.includes('hunter10') && cl.includes('hunter25'), 'after an idle boot the log offered ' + JSON.stringify(cl));
    } finally {
      window.fetch = realFetch; window.G = realG;
      R.resetRecord(); R.configureRecord(null); P.__resetPropertyRecord(prevProp);
    }
  }),








  () => tryRunAsync('QUEST-ITEM-1: a quest ITEM reward comes from the hr_claim_quest RESPONSE — completeQuest never mints it, and a failed claim grants nothing', async () => {
    /* ── THE BUG (P1, live) ─────────────────────────────────────────────────
       Every quest item reward was PHANTOM. completeQuest paid `reward.item`
       with `addItem()`, which writes G.inventory and nothing else, while
       hr_claim_quest credited GOLD only — so the item never existed on the
       server and the first envelope that spoke about the id took it back.
       `shrimp` is a FISH_SPOTS product, so serverOwnedItem('shrimp') is true and
       one away-eaten shrimp makes the envelope's figure for it ABSOLUTE: the
       server says 0 and the stack is deleted. That is why first_cook's
       first-night grant was withdrawn rather than shipped.

       THE PROPERTY, stated so it cannot be satisfied by the old code: the
       reward appears ONLY when the server says it credited it. Two halves —
         (1) a claim that RESOLVES ok+credited puts the items in the bag;
         (2) a claim that FAILS puts NOTHING in the bag.
       (2) is the whole test. The old `addItem(r.item, r.qty)` line passes (1)
       trivially and fails (2) every time.

       MUTATION: restore `if(r.item)addItem(r.item,r.qty||1,false);` in
       completeQuest → (2) goes red with 30 phantom shrimp. */
    const snap = snapshotG();
    const origClaim = window.HearthriseGoalClaim;
    const origMay = window.clientMayWriteRecordField;
    let unfeed = () => {};
    try {
      const C = window.HearthriseCore;
      assert(C && C.goalCatalogue && typeof C.goalCatalogue.questItemsAreServerCredited === 'function',
        'CONTROL: HearthriseCore.goalCatalogue.questItemsAreServerCredited must be published — without it '
        + 'completeQuest falls back to the client mint and this test is vacuous');
      assert(C.goalCatalogue.questItemsAreServerCredited('first_cook') === true,
        'CONTROL: first_cook must be a server-item-credited quest in the catalogue');

      const questRow = () => window.QUEST_DEFS.find((q) => q.id === 'first_cook');
      assert(questRow() && questRow().reward && questRow().reward.item === 'shrimp',
        'CONTROL: the authored first_cook reward must still carry an item (the parity guard binds the qty)');
      const authored = Object.assign({}, questRow(), { progress: questRow().goal, done: false });

      window.clientMayWriteRecordField = function () { return false; };   // armed, the live shape
      unfeed = feedServerQuests({ 'ev:cooked': 5 });   // server-complete: the claim may fire

      // ── (2) THE CLAIM FAILS → NOTHING IS GRANTED. ────────────────────────
      window.G.inventory = {};
      let fired = 0;
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: (id) => { fired++; return Promise.resolve({ ok: false, error: 'network', quest: id }); },
      };
      const qFail = Object.assign({}, authored);
      window.completeQuest(qFail);
      assert(fired === 1, 'completeQuest must fire exactly one claimQuest, fired ' + fired);
      assert(!window.G.inventory.shrimp,
        'SYNCHRONOUSLY after completeQuest the bag must still be empty — a client mint here is the phantom '
        + 'bug; got ' + window.G.inventory.shrimp);
      await Promise.resolve(); await Promise.resolve();
      assert(!window.G.inventory.shrimp,
        'THE BUG: a REFUSED claim granted ' + window.G.inventory.shrimp + ' shrimp locally. The item must come '
        + 'from the server receipt or not at all.');
      assert(qFail.claimed !== true, 'a refused claim must NOT mark the quest claimed — the sweep has to retry it');

      // ── (1) THE CLAIM SUCCEEDS → THE RECEIPT IS WHAT LANDS. ──────────────
      window.G.inventory = {};
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: (id) => Promise.resolve({ ok: true, credited: true, quest: id, gold: 200, items: { shrimp: 30 } }),
      };
      const qOk = Object.assign({}, authored);
      window.completeQuest(qOk);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      assert(window.G.inventory.shrimp === 30,
        'the granted items must be mirrored from the RPC response; got ' + window.G.inventory.shrimp);
      assert(qOk.claimed === true, 'a credited claim must mark the quest claimed so the sweep stops asking');

      // THE RECEIPT IS THE AUTHORITY, not the authored row: a server that says 7
      // must land 7. This is what makes it a mirror rather than a second copy of
      // the catalogue.
      window.G.inventory = {};
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: () => Promise.resolve({ ok: true, credited: true, gold: 200, items: { shrimp: 7 } }),
      };
      const qSeven = Object.assign({}, authored);
      window.completeQuest(qSeven);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      assert(window.G.inventory.shrimp === 7,
        'the client must render what the SERVER granted (7), not what the row authors (30); got '
        + window.G.inventory.shrimp);

      // A REPLAY (already_claimed) credits nothing but still stops the retry.
      window.G.inventory = {};
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: () => Promise.resolve({ ok: false, error: 'already_claimed' }),
      };
      const qReplay = Object.assign({}, authored);
      window.completeQuest(qReplay);
      await Promise.resolve(); await Promise.resolve();
      assert(!window.G.inventory.shrimp, 'already_claimed must grant nothing a second time');
      assert(qReplay.claimed === true, 'already_claimed IS the server confirming it paid — stop retrying');
    } finally {
      unfeed();
      window.HearthriseGoalClaim = origClaim;
      window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('QUEST-ITEM-2: a done-but-unconfirmed quest is re-claimed by the sweep, and a confirmed one is never asked again', async () => {
    /* completeQuest is fire-and-forget and `G.quests` is a RESIDUE field, so
       `done:true` survives a reload while a dropped claim does not — one lost
       packet used to mean the quest was finished forever with nothing paid.
       That was already true of the gold; the item credit makes it cost more.
       hrSweepUnclaimedQuests re-fires any done-and-unconfirmed quest (the server
       once-guard makes that free) and drains itself via `q.claimed`.
       MUTATION: delete the `!q.claimed` term → the confirmed-quest assertion
       goes red (it would ask for ever). */
    const snap = snapshotG();
    const origClaim = window.HearthriseGoalClaim;
    let unfeed = () => {};
    try {
      const asked = [];
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        claimQuest: (id) => { asked.push(id); return Promise.resolve({ ok: false, error: 'network' }); },
      };
      window.G.quests = [
        { id: 'gatherer', type: 'gather', goal: 15, progress: 15, reward: { gold: 150 }, done: true },
        { id: 'first_cook', type: 'cooked', goal: 5, progress: 5, reward: { gold: 200, item: 'shrimp', qty: 30 }, done: true, claimed: true },
        { id: 'first_blood', type: 'kill_any', goal: 5, progress: 2, reward: { gold: 150 }, done: false },
      ];
      unfeed = feedServerQuests({ 'ev:gather': 15, 'ev:cooked': 5, 'ev:kill_any': 2 });
      window.hrSweepUnclaimedQuests._at = 0;
      const n = window.hrSweepUnclaimedQuests();
      await Promise.resolve(); await Promise.resolve();
      assert(n === 1 && asked.length === 1 && asked[0] === 'gatherer',
        'the sweep must re-claim exactly the done-and-unconfirmed quest; asked ' + JSON.stringify(asked));

      // THROTTLED: a second pass inside the window must not re-fire.
      const again = window.hrSweepUnclaimedQuests();
      assert(again === 0 && asked.length === 1,
        'the sweep must be throttled — a busy session must not spin the RPC; asked ' + JSON.stringify(asked));

      // DRAINED: once every quest is confirmed there is nothing to ask, ever.
      window.G.quests.forEach((q) => { q.claimed = true; });
      window.hrSweepUnclaimedQuests._at = 0;
      assert(window.hrSweepUnclaimedQuests() === 0 && asked.length === 1,
        'a fully-confirmed quest list must cost zero RPCs; asked ' + JSON.stringify(asked));
    } finally {
      unfeed();
      window.HearthriseGoalClaim = origClaim;
      if (window.hrSweepUnclaimedQuests) window.hrSweepUnclaimedQuests._at = 0;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('COMBAT-XP-CREDIT-1 (#5 root pt2): armed combat XP accumulates + flushes to hr_credit_combat_xp, subtracts only what was sent, keeps failures pending', async () => {
    // Bug #5 root pt2 — "attack level reverts 5→4". Live combat XP is
    // client-predicted; the server's only combat-XP writer is the away/span-sim,
    // which undercounts, so on settle the prediction is retired DOWN and the level
    // reverts. The fix accumulates observed combat XP and flushes it to
    // hr_credit_combat_xp (server-clamped), so the server credits the ATTENDED
    // number. This proves the CLIENT half: the transport exists, addXp under the
    // arm buffers combat XP, and the flush subtracts exactly what it sent (so a
    // gain DURING the async call survives) and keeps a refused flush pending.
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!(window.HearthriseAccrual && window.HearthriseAccrual.awaySettleDone
      && window.HearthriseAccrual.awaySettleDone());
    try {
      assert(typeof window.hrCreditCombatXpFlush === 'function', 'hrCreditCombatXpFlush transport must exist');
      /* The flush is suppressed until the session's away window has been settled
         (2026-09-09 settle-first). This test is about the ATTENDED path, so stand
         in for "the boot settle already landed" rather than assert around it. */
      window.HearthriseAccrual.__resetAwaySettleLatch(true);

      // ── accumulation: armed, signed OUT → addXp buffers combat XP, no flush ──
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = { isSignedIn: () => false, creditCombatXp: () => Promise.resolve({ ok: true }) };
      window.G._combatXpPending = {};
      window.addXp('attack', 400);
      window.addXp('woodcutting', 999);   // NON-combat — must NOT buffer
      assert((window.G._combatXpPending.attack || 0) > 0, 'armed addXp must buffer combat XP for the credit');
      assert(!('woodcutting' in window.G._combatXpPending), 'a non-combat skill must never enter the combat-XP buffer');

      // ── flush: armed + signed in → sends the buffer, subtracts what was sent ──
      const calls = [];
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          calls.push(JSON.parse(JSON.stringify(m)));
          // A gain lands DURING the in-flight call — it must survive the subtract.
          window.G._combatXpPending.attack = (Number(window.G._combatXpPending.attack) || 0) + 50;
          return Promise.resolve({ ok: true, credited: m, credit: 999 });
        },
      };
      window.G._combatXpPending = { attack: 1000, strength: 300 };
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 1, 'flush must call creditCombatXp exactly once');
      assert(calls[0].attack === 1000 && calls[0].strength === 300, 'flush must send the buffered per-skill XP');
      assert((window.G._combatXpPending.attack || 0) === 50, 'flush must subtract ONLY what it sent (the mid-call +50 survives); got ' + window.G._combatXpPending.attack);
      assert((window.G._combatXpPending.strength || 0) === 0, 'a fully-sent skill must drain to 0');

      // ── refusal: a !ok verdict keeps the pending XP for the next flush ──
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: () => Promise.resolve({ ok: false, error: 'daily_budget' }),
      };
      window.G._combatXpPending = { attack: 777 };
      await window.hrCreditCombatXpFlush(true);
      assert((window.G._combatXpPending.attack || 0) === 777, 'a refused flush must keep the pending XP untouched; got ' + window.G._combatXpPending.attack);

      // ── b486: a FORCED flush while one is IN FLIGHT must AWAIT the in-flight
      //    credit, NOT early-return null. If it early-returned, accrue.js's
      //    credit-before-settle guarantee would break: the settle could price the
      //    attended window UNATTENDED and a live-gained level reverts on reconcile. ──
      let releaseInflight;
      const gate = new Promise((r) => { releaseInflight = r; });
      const raceCalls = [];
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          raceCalls.push(JSON.parse(JSON.stringify(m)));
          // the FIRST call blocks on the gate; the caller must await this commit.
          return raceCalls.length === 1
            ? gate.then(() => ({ ok: true, credited: m }))
            : Promise.resolve({ ok: true, credited: m });
        },
      };
      window.G._combatXpPending = { attack: 500 };
      const firstFlush = window.hrCreditCombatXpFlush(true);   // starts, now in flight (blocked)
      let secondSettled = false;
      const secondFlush = window.hrCreditCombatXpFlush(true).then((r) => { secondSettled = true; return r; });
      // Let microtasks drain — the forced second flush must STILL be pending
      // (awaiting the in-flight credit), not resolved-null.
      await Promise.resolve(); await Promise.resolve();
      assert(secondSettled === false, 'THE BUG: a forced flush during an in-flight credit must AWAIT it, not early-return null (would lose credit-before-settle)');
      releaseInflight();                                       // let the in-flight credit commit
      await firstFlush; await secondFlush;
      assert(secondSettled === true, 'the forced flush resolves only AFTER the in-flight credit settles');
      assert((window.G._combatXpPending.attack || 0) === 0, 'the in-flight credit still subtracts exactly what it sent — no lost/under-credited attended XP');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      window.HearthriseAccrual.__resetAwaySettleLatch(origLatch);
      restoreG(snap);
    }
  }),

  /* COMBAT-XP-SETTLE-FIRST-1 (regression suite) — Paione: "I did some offline
     combat. The items and kills are given but the experience is not." The booting
     client fired THREE attended combat-XP credits before the away settle landed;
     each stamped combat_xp_accrued_to = now(), and the settle credits combat XP
     only from max(fromMs, that watermark) — so a 4h02m / 828-kill window paid
     23,068 gold and every item, and ZERO XP. THE CLIENT HALF: the flush must not
     fire until the session's away window has been settled. THE SERVER HALF (the
     one that holds against a forged client) is hr_credit_combat_xp's
     `settle_first` refusal, proven by its own §4 gates and by
     tests/combat-xp-settle-first.mjs.
     MUTATION: delete the awaySettleDone() guard in hrCreditCombatXpFlush → the
     first assertion goes RED (the credit fires before any settle). */
  () => tryRunAsync('COMBAT-XP-SETTLE-FIRST-1: the attended combat-XP credit does not fire before the session away settle (would trim the whole absence)', async () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.awaySettleDone === 'function' && typeof A.__resetAwaySettleLatch === 'function',
      'the settle-first latch is missing — a boot can credit XP over an away window the server has not paid');
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!A.awaySettleDone();
    try {
      const calls = [];
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => { calls.push(m); return Promise.resolve({ ok: true, credited: m }); },
      };
      window.G._combatXpPending = { attack: 400, strength: 250 };

      // BEFORE the settle: suppressed, and the XP is KEPT (never thrown away).
      A.__resetAwaySettleLatch(false);
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 0,
        'THE BUG: a credit fired before the away settle — it stamps combat_xp_accrued_to and the settle then pays 0 combat XP for the whole absence');
      assert((window.G._combatXpPending.attack || 0) === 400,
        'the suppressed XP must stay pending — a deferred credit is not a lost one');

      // AFTER the settle: the attended credit resumes and sends the backlog.
      A.__resetAwaySettleLatch(true);
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 1 && (calls[0].attack || 0) === 400,
        'the credit did not resume once the away window was settled — attended XP would be priced unattended forever');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch);
      restoreG(snap);
    }
  }),

  /* COMBAT-XP-SETTLE-FIRST-2 (regression suite) — vitals 2026-09-16/17: 41
     `settle_first` refusals on one character. The server refuses the attended
     credit while `accrued_to` is >180 s stale (correct: the away settle owns that
     window) and WRITES NOTHING — its own migration comment says "The client keeps
     its pending XP and re-flushes after the settle." The client did the opposite:
     it dropped the pending snapshot on the refusal ALONE, so a throttled
     background tab (which makes the watermark stale every window) deleted the
     player's observed attended XP with nothing having paid it whenever the settle
     then failed, halted, or never ran. The BOOT path next door has always waited
     for a confirmed `accrued`/`nothing` before dropping; this is that asymmetry
     closed, plus asking for the settle the refusal names.
     MUTATION: restore `dropPendingCombatXp(snap, G)` on the refusal branch in
     hrCreditCombatXpFlush → the "must stay pending" assertion goes RED. */
  () => tryRunAsync('COMBAT-XP-SETTLE-FIRST-2: a `settle_first` refusal DEFERS the attended XP and re-submits it after the settle, and drops it only on a CONFIRMED settle', async () => {
    const A = window.HearthriseAccrual;
    assert(A && typeof A.deferPendingCombatXp === 'function' && typeof A.resolveCombatXpDeferral === 'function'
      && typeof A.__resetCombatXpDeferral === 'function',
      'THE BUG: there is no deferral seam for a `settle_first` refusal — the refused snapshot is discarded on the refusal alone, before anything has paid it');
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!A.awaySettleDone();
    const origReq = A.requestAccrual;
    try {
      A.__resetCombatXpDeferral();
      const calls = []; let refuse = true; let settles = 0;
      A.requestAccrual = () => { settles++; return Promise.resolve({ outcome: 'unreachable' }); };
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          calls.push(JSON.parse(JSON.stringify(m)));
          return Promise.resolve(refuse ? { ok: false, error: 'settle_first' } : { ok: true, credited: m });
        },
      };
      A.__resetAwaySettleLatch(true);            // ATTENDED path: the session away window is closed

      // ── (1) refused: the XP stays pending and the settle is ASKED FOR ──
      window.G._combatXpPending = { attack: 600, strength: 200 };
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 1, 'the flush must reach the RPC once; it fired ' + calls.length + ' time(s)');
      assert((window.G._combatXpPending.attack || 0) === 600 && (window.G._combatXpPending.strength || 0) === 200,
        'THE BUG: a `settle_first` refusal discarded the attended XP (attack=' + (window.G._combatXpPending.attack || 0)
        + '). The refusal writes NOTHING server-side — nothing has paid these fights yet');
      assert(settles === 1, 'a `settle_first` refusal must ask for the settle it is being told to run first (a throttled tab is not running the 90 s cadence)');
      assert(A.pendingCombatXpDeferral() && A.pendingCombatXpDeferral().attack === 600,
        'the refused snapshot must be held as the settle\u2019s debt, so a later confirmed settle can retire exactly it');

      // ── (2) the settle did NOT confirm ⇒ the window is still unpaid ⇒ re-submit ──
      A.resolveCombatXpDeferral('unreachable');
      assert(A.pendingCombatXpDeferral() && A.pendingCombatXpDeferral().attack === 600,
        'an unconfirmed settle must not retire the debt — nothing was paid');
      refuse = false;
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 2 && (calls[1].attack || 0) === 600 && (calls[1].strength || 0) === 200,
        'the deferred attended XP must be RE-SUBMITTED once the credit is admitted again; sent ' + JSON.stringify(calls[1] || null));
      assert((window.G._combatXpPending.attack || 0) === 0, 'the admitted re-submit drains what the server applied');
      assert(!A.pendingCombatXpDeferral(),
        'an ADMITTED credit must void the debt — otherwise the next confirmed settle restores XP the server has already credited (double credit)');

      // ── (3) the other half: a CONFIRMED settle retires the debt (no double credit) ──
      refuse = true;
      window.G._combatXpPending = { attack: 400 };
      await window.hrCreditCombatXpFlush(true);
      assert((window.G._combatXpPending.attack || 0) === 400, 'still deferred, not dropped, on the refusal');
      window.G._combatXpPending = {};                       // as if a drain had run
      const restored = A.resolveCombatXpDeferral('accrued');
      assert(restored === 400 && (window.G._combatXpPending.attack || 0) === 400,
        'a CONFIRMED settle stamps the span it just priced away — the deferred snapshot must go BACK so the server top-up can be claimed; restored=' + restored);
      assert(!A.pendingCombatXpDeferral(), 'the debt is cleared once handed back to the pending map');
      await A.combatXpReflushPromise();       // let the re-flush land on the stubs, not on the real RPC
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch);
      A.requestAccrual = origReq;
      A.__resetCombatXpDeferral();
      restoreG(snap);
    }
  }),

  /* COMBAT-XP-SETTLE-FIRST-3 / ATTENDED (regression suite) — Security S-1 on
     2026-09-17-attended-xp-on-settle. The server half stamps
     `player_state.combat_settle_span` on a >180 s stale settle and lets the NEXT
     hr_credit_combat_xp within 120 s top that span up to the attended cap
     (minus what the away sim already paid). It is reachable ONLY if the client
     re-sends the snapshot the `settle_first` refusal deferred. The client DROPPED
     it on a confirmed settle, so the stamp was written, never claimed, and NULLed
     by the next settle: the whole server half inert and the window priced away.
     MUTATION: make resolveCombatXpDeferral drop (dropPendingCombatXp) again →
     "must be RE-SUBMITTED" goes RED.
     AWAY half: COMBAT-XP-SETTLE-FIRST-4 below. */
  () => tryRunAsync('COMBAT-XP-SETTLE-FIRST-3 (attended): a stale settle confirmed ⇒ the deferred attended XP is re-submitted ONCE, inside the top-up grace', async () => {
    const A = window.HearthriseAccrual;
    assert(typeof A.restorePendingCombatXp === 'function' && typeof A.combatXpReflushPromise === 'function',
      'THE UNCLAIMED SPAN: accrue.js has no restore/re-flush seam — a confirmed settle drops the deferral, so the span the settle stamped is never claimed');
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!A.awaySettleDone();
    const origReq = A.requestAccrual;
    try {
      A.__resetCombatXpDeferral();
      const calls = []; let refuse = true;
      A.requestAccrual = () => Promise.resolve({ outcome: 'accrued' });
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          calls.push(JSON.parse(JSON.stringify(m)));
          return Promise.resolve(refuse ? { ok: false, error: 'settle_first' } : { ok: true, credited: m });
        },
      };
      A.__resetAwaySettleLatch(true);

      // (1) the attended flush is refused because the watermark is >180 s stale.
      window.G._combatXpPending = { attack: 500, strength: 120 };
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 1, 'the first flush must reach the RPC once; it fired ' + calls.length);

      // (2) the settle CONFIRMS. It has just stamped the span it priced away, so
      //     the deferral is handed back and re-flushed — one round trip, far
      //     inside the server's 120 s grace, with no intent sent in between.
      refuse = false;
      const t0 = Date.now();
      A.resolveCombatXpDeferral('accrued');
      await A.combatXpReflushPromise();
      assert(Date.now() - t0 < 120000, 're-flush must land inside the 120 s top-up grace');
      assert(calls.length === 2, 'THE UNCLAIMED SPAN: the confirmed settle sent ' + (calls.length - 1)
        + ' follow-up credit(s) — the stamped span must be claimed by exactly one re-submit');
      assert((calls[1].attack || 0) === 500 && (calls[1].strength || 0) === 120,
        'the re-submit must carry the deferred snapshot; sent ' + JSON.stringify(calls[1]));

      // (3) it is idempotent in the ordinary way: the admitted credit drained the
      //     map, so a second flush has nothing to send (never a second top-up).
      await window.hrCreditCombatXpFlush(true);
      assert(calls.length === 2, 'a second flush re-sent the same fights — the drained map must send nothing');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch);
      A.requestAccrual = origReq;
      A.__resetCombatXpDeferral();
      restoreG(snap);
    }
  }),

  /* COMBAT-XP-SETTLE-FIRST-4 / AWAY (regression suite) — the other half of the
     pair. A genuine absence has no deferred attended snapshot: the settle pays
     the window by simulation and the client must send NO credit afterwards, or
     the away window would be claimed at the attended rate. */
  () => tryRunAsync('COMBAT-XP-SETTLE-FIRST-4 (away): a confirmed settle with nothing deferred sends no credit at all', async () => {
    const A = window.HearthriseAccrual;
    const snap = snapshotG();
    const origMay = window.clientMayWriteRecordField;
    const origClaim = window.HearthriseGoalClaim;
    const origLatch = !!A.awaySettleDone();
    try {
      A.__resetCombatXpDeferral();
      const calls = [];
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => { calls.push(m); return Promise.resolve({ ok: true, credited: m }); },
      };
      A.__resetAwaySettleLatch(true);
      /* XP is pending, but NOTHING was deferred: no `settle_first` refusal ever
         happened, so this settle is an ordinary away window the simulation just
         priced. The confirmed settle must therefore fire NO credit of its own —
         a credit here would claim the absence at the attended rate and stamp the
         watermark over it. The cadence flush owns this map, not the settle. */
      window.G._combatXpPending = { attack: 300 };

      const restored = A.resolveCombatXpDeferral('accrued');
      assert(restored === 0 && !A.pendingCombatXpDeferral(),
        'an away settle has no debt to restore; restored=' + restored);
      const p = A.combatXpReflushPromise();
      if (p) await p;
      assert(calls.length === 0,
        'THE AWAY DOUBLE-CREDIT: the client sent a combat-XP credit after an away settle — that window was paid by the simulation');
    } finally {
      window.clientMayWriteRecordField = origMay;
      window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch);
      A.__resetCombatXpDeferral();
      restoreG(snap);
    }
  }),

  /* B568-2 — LIVE (Tyler, 2026-10-11 14:10, combat → Bronze Bar): the ledger read
     settle 46.584 → set_activity 46.983 → combat XP credit 48.450 answered
     `not_in_combat`. The pre-switch flush was refused `settle_first`, deferred, and
     its re-send (fired by the settle's answer) went out AFTER the switch — so XP the
     player watched land was never paid. A switch out of combat must have every
     attended credit on the server first. MUTATION: drop awaitAttendedCreditsClear
     from activity.js's declareActivity → the credit lands after set_activity → red. */
  () => tryRunAsync('B568-2: leaving combat sends the deferred combat-XP re-flush BEFORE the switch, never after it', async () => {
    const A = window.HearthriseAccrual, M = window.HearthriseActivity, G = window.G;
    assert(typeof A.awaitAttendedCreditsClear === 'function', 'CONTROL: accrue.js does not publish awaitAttendedCreditsClear');
    const snap = snapshotG(), realFetch = window.fetch;
    const origMay = window.clientMayWriteRecordField, origClaim = window.HearthriseGoalClaim, origLatch = !!A.awaySettleDone();
    const wasOn = A.isServerAccrualEnabled();
    const order = [];
    let refuse = true;
    try {
      A.__resetCombatXpDeferral();
      window.clientMayWriteRecordField = function (f) { return f !== 'skills'; };
      window.HearthriseGoalClaim = {
        isSignedIn: () => true,
        creditCombatXp: (m) => {
          const r = refuse;   // refused settle_first until the settle has answered (the watermark is stale until then)
          order.push(r ? 'credit:settle_first' : 'credit:ok');
          return Promise.resolve(r ? { ok: false, error: 'settle_first' } : { ok: true, credited: m });
        },
      };
      A.__resetAwaySettleLatch(true);
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        let b = null; try { b = JSON.parse(init && init.body); } catch (e) {}
        const verb = (b && b.verb) || 'accrue';
        order.push(verb);
        if (verb === 'accrue') {   // the settle takes a real round trip
          return new Promise((r) => setTimeout(() => { refuse = false; r(new Response(JSON.stringify({ ok: true, accrued: false, reason: 'idle', version: 1, now: new Date().toISOString() }), { status: 200 })); }, 40));
        }
        return Promise.resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 }));
      };
      A.setServerAccrualEnabled(true); A.resetAccrualGate();
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      M.resetActivity(); M.configureActivity({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt' });
      M.setConfirmedActivity({ kind: 'combat', id: 'slime' });
      G._combatXpPending = { attack: 500 };
      await M.declareActivity('idle', null);
      for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 10));
      const sw = order.indexOf('set_activity'), ok = order.indexOf('credit:ok');
      assert(order[0] === 'credit:settle_first' && order.indexOf('accrue') > 0 && order.indexOf('accrue') < ok, 'CONTROL: the fixture did not reproduce the refused flush + settle: ' + JSON.stringify(order));
      assert(sw > 0 && ok > 0, 'CONTROL: the switch or the re-flush never went out: ' + JSON.stringify(order));
      assert(ok < sw, 'the deferred combat XP re-flush went out AFTER the switch (' + JSON.stringify(order) + ') — the server is no longer in combat and answers not_in_combat, so the XP the player saw is never paid');
    } finally {
      window.fetch = realFetch;
      window.clientMayWriteRecordField = origMay; window.HearthriseGoalClaim = origClaim;
      A.__resetAwaySettleLatch(origLatch); A.__resetCombatXpDeferral();
      M.resetActivity(); M.configureActivity(null);
      try { A.resetAccrualGate(); A.configureAccrual(null); } catch (e) {}
      if (!wasOn) A.setServerAccrualEnabled(false);
      restoreG(snap);
    }
  }),

  () => tryRunAsync("CADENCE-NIC-1 (Security F1): a `not_in_combat` credit re-declares the fight ONCE and retries ONCE — never a loop", async () => {
    // supabase/migrations/2026-09-06-cadence-recovery-floor.sql caps the attended
    // credit window at player_state.active_since once the SERVER's pointer leaves
    // combat, and answers {reason:'not_in_combat', credited:0}. A client whose
    // DECLARATION was lost (a dropped set_activity, a server auto-stop, a
    // rate-limited switch) would otherwise keep polling the 60 s cadence and be
    // paid NOTHING for as long as it fights — silently, because a zero credit
    // looks like a throttle. The refusal is NAMED so the client can say again
    // what it is doing and ask once more.
    //
    // THE TWO HALVES OF THE CONTRACT, and the second is the one that matters:
    // exactly ONE re-declare + ONE retry, and a SECOND not_in_combat is accepted
    // as the server's verdict. A retry-on-retry would be an unbounded loop
    // spending a real player's rate budget against a server that has already
    // answered — the shape CLAUDE.md's intent contract forbids ("never retry the
    // switch alone in a loop").
    const GC = window.HearthriseGoalClaim;
    assert(GC && typeof GC._creditWithCombatRedeclare === 'function',
      'HearthriseGoalClaim._creditWithCombatRedeclare is missing — nothing recovers a lost combat declaration, so '
      + 'every attended kill/XP credit after one silently pays zero');
    const origPointer = window.localActivityPointer;
    const origActivity = window.HearthriseActivity;
    try {
      let declares = [];
      window.HearthriseActivity = {
        declareActivity: (kind, id, opts) => { declares.push({ kind, id, opts }); return Promise.resolve({ outcome: 'switched' }); },
      };
      window.localActivityPointer = () => ({ kind: 'combat', id: 'goblin' });

      // ── (1) refused once, then paid: ONE re-declare, ONE retry, the retry wins ──
      let fired = 0;
      let res = await GC._creditWithCombatRedeclare(() => {
        fired++;
        return Promise.resolve(fired === 1
          ? { ok: true, credited: 0, reason: 'not_in_combat' }
          : { ok: true, credited: 3 });
      });
      assert(fired === 2, 'a not_in_combat refusal must be retried exactly once; the RPC fired ' + fired + ' time(s)');
      assert(declares.length === 1, 're-declare must happen exactly once; it happened ' + declares.length + ' time(s)');
      assert(declares[0].kind === 'combat' && declares[0].id === 'goblin' && !!(declares[0].opts && declares[0].opts.force),
        're-declare must restate the CURRENT combat activity with {force:true} (a queued declaration would race the retry)');
      assert(res && res.credited === 3, 'the retry\'s verdict is what the caller gets back');

      // ── (2) THE ANTI-LOOP: refused TWICE → still exactly one re-declare and
      //       one retry, and the second refusal is returned as the answer. ──
      declares = []; fired = 0;
      res = await GC._creditWithCombatRedeclare(() => {
        fired++;
        return Promise.resolve({ ok: true, credited: 0, reason: 'not_in_combat' });
      });
      assert(fired === 2, 'THE BUG: a second not_in_combat must NOT be retried again; the RPC fired ' + fired + ' times');
      assert(declares.length === 1, 'THE BUG: a second not_in_combat must NOT re-declare again; declared ' + declares.length + ' times');
      assert(res && res.reason === 'not_in_combat', "the server's second verdict is returned verbatim, not swallowed");

      // ── (3) the client is NOT fighting → the refusal is RIGHT; touch nothing ──
      declares = []; fired = 0;
      window.localActivityPointer = () => ({ kind: 'idle', id: null });
      await GC._creditWithCombatRedeclare(() => { fired++; return Promise.resolve({ ok: true, credited: 0, reason: 'not_in_combat' }); });
      assert(fired === 1 && declares.length === 0,
        'when the CLIENT itself is idle the refusal is correct — re-declaring would assert a fight that is not happening');

      // ── (4) an ordinary answer is passed straight through, untouched ──
      declares = []; fired = 0;
      window.localActivityPointer = () => ({ kind: 'combat', id: 'goblin' });
      res = await GC._creditWithCombatRedeclare(() => { fired++; return Promise.resolve({ ok: true, credited: 7 }); });
      assert(fired === 1 && declares.length === 0 && res.credited === 7,
        'a successful credit must not re-declare or re-fire — the helper is inert on every path but the named refusal');
    } finally {
      window.localActivityPointer = origPointer;
      window.HearthriseActivity = origActivity;
    }
  }),

  () => tryRunAsync('CLIENT-STATE-CAP (b486): putClientState surfaces state_too_large distinctly, not swallowed into a silent infinite retry', async () => {
    // The whole residue bag shares ONE 256 KiB server cap; on overflow the RPC
    // answers {ok:false,error:'state_too_large'} and EVERY residue field stops
    // persisting. Swallowed into the generic {ok:false} it was an invisible
    // infinite retry (self-only progress quietly stops saving). Contract: the
    // overflow is FLAGGED (capExceeded) and surfaced, still non-fatal (no throw),
    // and a generic failure is NOT mis-flagged.
    const CS = window.HearthriseClientState;
    assert(CS && typeof CS.putClientState === 'function', 'putClientState must exist');
    if (typeof CS.__resetClientStateCapWarned === 'function') CS.__resetClientStateCapWarned();
    const mkFetch = (bodyObj) => async () => ({ ok: true, status: 200, json: async () => bodyObj });
    const opts = (bodyObj) => ({ url: 'https://example.test', anonKey: 'k', jwt: 'j', slot: 0, idem: 'cap-test-idem', fetch: mkFetch(bodyObj) });

    /* The overflow path SHOULD shout (console.error + captureException) — but a
       deliberate trigger inside the suite must not trip the harness's
       console-error detector. Capture-and-assert instead of leak. */
    const realError = console.error;
    const realCapture = window.captureException;
    let shouted = 0;
    console.error = () => { shouted++; };
    window.captureException = () => {};
    let over, patchOver, gen;
    try {
      over = await CS.putClientState({ stats: {} }, opts({ ok: false, error: 'state_too_large', cap: 262144 }));
      patchOver = await CS.putClientState({ stats: {} }, opts({ ok: false, error: 'patch_too_large', cap: 262144 }));
      gen = await CS.putClientState({ stats: {} }, opts({ ok: false, error: 'no_character' }));
    } finally {
      console.error = realError;
      window.captureException = realCapture;
    }
    assert(over && over.ok === false, 'a too-large put is still non-fatal (ok:false, never throws)');
    assert(over.capExceeded === true, 'THE BUG: an overflow must be FLAGGED (capExceeded), not swallowed into a generic {ok:false}');
    assert(over.error === 'state_too_large', 'the overflow error must be preserved for telemetry/observation');
    assert(shouted >= 1, 'the overflow must be SURFACED (console.error fired at least once — the one-time latch)');
    assert(patchOver.capExceeded === true, 'a single over-cap patch (patch_too_large) is flagged the same way');
    assert(gen && gen.ok === false && !gen.capExceeded, 'a generic failure must NOT be mis-flagged as a cap overflow');
  }),

  /* ── regression suite — THE OUTGOING RESIDUE IS ITS ALLOWLIST PROJECTION ────
     MEASURED 2026-09-16 (vitals --refusals): 569 forbidden_field/`buffs` refusals
     in a day from ONE character, 532 the day before. The server refuses the WHOLE
     patch on one denied key, so that character persisted NO residue for two days.
     A deny-list only refuses the names somebody typed; structurally now, the sent
     body is `patch ∩ RESIDUE_FIELDS` minus what the server refused, at the put. */
  () => tryRunAsync('CLIENT-STATE-ALLOWLIST (2026-09-16): the SENT residue body equals its allowlist projection, whatever the caller handed the put', async () => {
    const CS = window.HearthriseClientState;
    assert(CS && typeof CS.putClientState === 'function' && Array.isArray(CS.RESIDUE_FIELDS),
      'CONTROL: putClientState / RESIDUE_FIELDS unpublished — this test would pass vacuously');
    const allow = new Set(CS.RESIDUE_FIELDS);
    assert(!allow.has('buffs'), 'CONTROL: `buffs` is back in RESIDUE_FIELDS — the server denies it, so this is the bug itself');
    assert(allow.has('lootFilter') && allow.has('bestiary'),
      'CONTROL: the honest fields this test rides along are not on the allowlist');
    const sent = [];
    const fetchStub = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
    /* As a stale/forgetful assembly path hands it over: real preferences, plus the
       measured server-owned name and one no bundle ever owned. */
    const r = await CS.putClientState({
      lootFilter: ['junk'], bestiary: { rat: { kills: 3 } },
      buffs: [{ type: 'damage', magnitude: 2, remainingMs: 600000 }],
      someFieldNoAllowlistEverHad: 1,
    }, { url: 'https://example.test', anonKey: 'k', jwt: 'j', slot: 0, idem: 'allowlist-test', fetch: fetchStub });
    assert(r && r.ok === true, 'the put must still succeed — dropping the whole patch would BE the bug: ' + JSON.stringify(r));
    assert(sent.length === 1, 'exactly one request');
    const body = sent[0].p_patch;
    const strays = Object.keys(body).filter((k) => !allow.has(k));
    assert(strays.length === 0,
      'THE BUG: the residue body carried ' + JSON.stringify(strays) + ' — hr_put_client_state refuses the WHOLE patch on one '
      + 'non-allowlisted key, so every preference in the bag stops saving and the tab retries the identical body for ever');
    assert(Object.prototype.hasOwnProperty.call(body, 'lootFilter') && Object.prototype.hasOwnProperty.call(body, 'bestiary'),
      'the allowlisted fields must still ride — the projection KEEPS the residue, it does not empty it: ' + JSON.stringify(Object.keys(body)));
  }),

  () => tryRunAsync('CLIENT-STATE-FORBIDDEN (2026-09-14): a forbidden_field refusal drops the key, tells the player and reloads ONCE — never a silent retry for ever', async () => {
    /* MEASURED LIVE 2026-09-14 15:08 UTC: user b94fa8c0, code forbidden_field,
       intent hr_put_client_state, n=603 today, first refusal 2026-09-13
       20:48:28Z — the minute 2026-09-13-client-state-buffs-denylist.sql applied.
       A tab on an older bundle kept sending `buffs`; the server refuses the
       WHOLE patch on one denied key, so that account saved NO residue for 18
       hours (loot filter, achievements, bestiary, the "shown today" markers)
       while the client retried the identical bag every 60 s for ever.
       The contract, in the order a player meets it: the key is DROPPED for this
       page life (so the other twenty fields save again on the very next put),
       the player is TOLD, and the tab reloads ONCE — a key already reloaded for
       is never reloaded for again, because a reload loop is worse than the bug.
       2026-09-14-client-state-projection-denylist.sql adds nine more denied
       names, so this is the path every stale tab will take. */
    const CS = window.HearthriseClientState;
    assert(CS && typeof CS.putClientState === 'function', 'putClientState must exist');
    assert(typeof CS.__setClientStateReloadHook === 'function' && typeof CS.__resetForbiddenField === 'function',
      'the forbidden-field seam must expose its test hooks — otherwise this test can only be written by reloading the harness');
    const KEY = 'hr-forbidden-field-reload';
    const savedSession = sessionStorage.getItem(KEY);
    const realWarn = console.warn;
    const realNotify = window.notify;
    let reloads = 0;
    const toasts = [];
    const prevHook = CS.__setClientStateReloadHook(() => { reloads++; });
    const sent = [];
    const mkFetch = (bodyObj) => async (url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => bodyObj };
    };
    const opts = (bodyObj) => ({ url: 'https://example.test', anonKey: 'k', jwt: 'j', slot: 0, idem: 'forbidden-test', fetch: mkFetch(bodyObj) });
    const REFUSED = { ok: false, error: 'forbidden_field', field: 'streak' };
    try {
      sessionStorage.removeItem(KEY);
      CS.__resetForbiddenField();
      console.warn = () => {};
      window.notify = (m) => { toasts.push(String(m)); };

      /* 1. THE REFUSAL. A denied key, with an honest preference riding along. */
      const r1 = await CS.putClientState({ streak: { count: 1 }, lootFilter: ['junk'] }, opts(REFUSED));
      assert(r1 && r1.ok === false, 'a forbidden put stays non-fatal (ok:false, never throws)');
      assert(r1.forbiddenField === true && r1.dropped === true,
        'THE BUG: a forbidden_field refusal must be FLAGGED and the key dropped, not swallowed into a generic {ok:false} and retried for ever: '
        + JSON.stringify(r1));
      assert(reloads === 1, 'the tab must reload exactly once for a newly-refused key (reloads=' + reloads + ')');
      assert(toasts.some((t) => /older build/i.test(t)),
        'the player must be TOLD why the tab is reloading — a reload with no explanation is indistinguishable from a crash: ' + JSON.stringify(toasts));
      assert(String(sessionStorage.getItem(KEY) || '').split(',').indexOf('streak') >= 0,
        'the refused key must be recorded in sessionStorage BEFORE the reload, or the loop guard cannot survive it');
      assert(CS.forbiddenResidueFields().indexOf('streak') >= 0,
        'the dropped set must be readable for triage: ' + JSON.stringify(CS.forbiddenResidueFields()));

      /* 2. THE NEXT PUT NO LONGER CARRIES IT. This is the half that gives the
            player their other twenty preferences back. */
      sent.length = 0;
      const r2 = await CS.putClientState({ streak: { count: 1 }, lootFilter: ['junk'] }, opts({ ok: true }));
      assert(r2 && r2.ok === true, 'the put after the drop must succeed');
      assert(sent.length === 1, 'exactly one request');
      const patch = sent[0].p_patch;
      assert(!Object.prototype.hasOwnProperty.call(patch, 'streak'),
        'THE BUG: the refused key was sent AGAIN — every residue field stays unsaved for as long as the tab lives: ' + JSON.stringify(patch));
      assert(Object.prototype.hasOwnProperty.call(patch, 'lootFilter'),
        'the honest preferences must still be sent — dropping the whole patch would BE the bug');

      /* 3. NO RELOAD LOOP. A fresh page life (the module state resets; the
            sessionStorage record does not) that is refused for the SAME key
            drops it and carries on rather than reloading a second time. */
      CS.__resetForbiddenField();
      const r3 = await CS.putClientState({ streak: { count: 1 } }, opts(REFUSED));
      assert(r3.forbiddenField === true && r3.dropped === true, 'the key is still dropped after a reload');
      assert(reloads === 1, 'THE SECOND BUG: a key refused again AFTER a reload must NOT reload again — that is an infinite reload loop (reloads=' + reloads + ')');

      /* 4. A REFUSAL WITH NO NAMED FIELD still reloads once and never loops. */
      CS.__resetForbiddenField();
      const r4 = await CS.putClientState({ lootFilter: [] }, opts({ ok: false, error: 'forbidden_field' }));
      assert(r4.forbiddenField === true && r4.dropped === false,
        'a refusal that names no field cannot drop one, and must say so honestly');
      assert(reloads === 2, 'an unnamed forbidden_field reloads once on its own sentinel (reloads=' + reloads + ')');
      CS.__resetForbiddenField();
      await CS.putClientState({ lootFilter: [] }, opts({ ok: false, error: 'forbidden_field' }));
      assert(reloads === 2, 'the unnamed sentinel must not reload twice either');
    } finally {
      console.warn = realWarn;
      window.notify = realNotify;
      CS.__setClientStateReloadHook(prevHook);
      CS.__resetForbiddenField();
      if (savedSession === null) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, savedSession);
    }
  }),

  /* -- regression suite -- CLAIM-FROM-SERVER: A CLAIM IS OFFERED ONLY FROM THE SERVER'S COUNT.
     vitals 2026-09-28: hr_claim_* refused `incomplete` because a list graded
     local counters. THE QA SEAM for a claimable daily quest is the tally cache
     (HearthriseTally.__feed) — local counters can no longer do it. */


  () => tryRunAsync('CLAIM-FROM-SERVER-3: quest step local 5/5 against server 3/5 is not claimable and fires nothing; server 5/5 fires once', async () => {
    await withQuestServer({ 'ev:cooked': 3 }, async (q, calls, step, feed) => {
      let st = step();
      assert(!q.done && calls() === 0, 'THE BUG: local 5/5 completed first_cook and fired hr_claim_quest against server 3/5 (calls=' + calls() + ')');
      assert(st.s.state !== 'claimable' && st.s.count === 3, 'the step reads the server 3/5, got ' + JSON.stringify(st.s));
      q.done = true; window.hrSweepUnclaimedQuests._at = 0; window.hrSweepUnclaimedQuests();
      assert(calls() === 0 && !window.questClaimable(q), 'the sweep must not re-fire a server-incomplete step (calls=' + calls() + ')');
      q.done = false; feed({ 'ev:cooked': 5 }); window.updateQuest('cooked', 0);
      assert(q.done && calls() === 1 && step().s.state === 'claimable', 'server 5/5 completes the step and fires the claim exactly once (calls=' + calls() + ')');
    });
  }),

  () => tryRunAsync('CLAIM-FROM-SERVER-4: quest projection ABSENT → the step shows the pending dash and nothing claims', async () => {
    await withQuestServer(null, async (q, calls, step) => {
      const st = step();
      assert(st.s.count === null, 'unknown state is unknown (the dash), never 0, got: ' + st.s.count);
      assert(!q.done && calls() === 0 && st.s.state !== 'claimable' && !window.questClaimable(q), 'nothing claims from unknown state');
    });
  }),


  () => tryRun('b227: every room has a five-rung ladder with real, reachable costs', () => {
    // The b213 deadlock rule, re-run against the rungs this wave added: no
    // cost may name an item the game does not define. A ladder that lists a
    // price nobody can pay is a placeholder wearing a number.
    const ids = Object.keys(window.ROOMS);
    assert(ids.length === 8, 'expected 8 rooms, got ' + ids.length);
    ids.forEach((id) => {
      const r = window.ROOMS[id];
      assert(r.levels.length === 5, id + ' should have 5 rungs, has ' + r.levels.length);
      r.levels.forEach((rung, i) => {
        assert(typeof rung.nm === 'string' && rung.nm.length, id + ' L' + (i + 1) + ' needs a rung name');
        assert(typeof rung.bonus === 'string' && rung.bonus.length, id + ' L' + (i + 1) + ' needs an effect line');
        assert(rung.cost && Object.keys(rung.cost).length, id + ' L' + (i + 1) + ' needs a cost');
        Object.keys(rung.cost).forEach((k) => {
          assert(k === 'gold' || window.ITEMS[k], id + ' L' + (i + 1) + ' costs unknown item "' + k + '"');
          assert(rung.cost[k] > 0, id + ' L' + (i + 1) + ' cost ' + k + ' must be positive');
        });
        // Costs must rise. A rung that is cheaper than the one below it is a
        // typo the ladder cannot express any other way.
        if (i > 0) assert(rung.cost.gold > r.levels[i - 1].cost.gold,
          id + ' L' + (i + 1) + ' must cost more gold than L' + i);
      });
      // L1-L3 are gate-free (they are the live rungs); L4/L5 carry a tier.
      assert(r.levels[3].tier >= 3, id + ' L4 must require property tier 3 or better');
      assert(r.levels[4].tier >= 4, id + ' L5 must require property tier 4 or better');
      [0, 1, 2].forEach((i) => assert(r.levels[i].tier == null,
        id + ' L' + (i + 1) + ' is a live rung and must not have gained a tier gate'));
    });
  }),

  () => tryRun('b227 P1: no room rung can require a good the player cannot yet make (the §7 proof, executable)', () => {
    /* THE BUG THIS CLOSES. Workshop L1 cost `normal_plank:15`. The only plank
       source is the crafting recipe `saw_normal`; crafting is bench-gated on
       the Workshop; the Workshop is that room. A fresh account could never
       build it. b213 fixed exactly this class for the PROPERTY TIER costs and
       never walked ROOM costs, and homestead-deepening §7 proves its new L4/L5
       castle goods are reachable while simply ASSUMING the live rungs were.
       Both blind spots are the same blind spot, so this is the whole proof,
       run against live data instead of asserted in prose.

       The model: walk the property ladder. At tier T a player has passed every
       tier below, so they may own every room those tiers unlocked — and rooms
       ARE the benches. Anything they can gather, farm, kill or buy is free;
       anything else must come off a bench they can actually have by then. */
    const R = window.ROOMS, H = window.HearthriseHomestead;
    assert(R && H, 'rooms + homestead modules present');

    // ── what the world gives you for free, with no bench at all ──
    const raw = new Set(['gold']);
    [].concat(window.TREES || [], window.ROCKS || [], window.FISH_SPOTS || [])
      .forEach((n) => n && n.prod && raw.add(n.prod));
    Object.keys(window.CROPS || {}).forEach((c) => {
      const d = window.CROPS[c];
      if (d && d.prod) raw.add(d.prod);
      if (d && d.seed) raw.add(d.seed);      // seeds drop and are shop-stocked
    });
    Object.keys(window.MONSTERS || {}).forEach((m) => {
      ((window.MONSTERS[m] || {}).drops || []).forEach((d) => d && d.id && raw.add(d.id));
    });

    /* ── which bench each artisan skill needs, and when you may own it ──
       Every mapped skill is UNGATED since 2026-09-07 (a room sells speed, a
       level sells permission), so today this is 0 across the board and the
       walk below is a "reachable at all" proof rather than a bench-order one.
       It is kept as a FUNCTION of UNGATED rather than folded to 0 because the
       day a room gates something again is the day the circularity returns —
       and this is the only executable proof that it does not. */
    const BENCH = H.WORKBENCH;                    // skill → room
    const benchTier = (skill) => (H.UNGATED[skill] ? 0 : H.roomMinTier(BENCH[skill]));

    const inputsOf = (r) => (typeof window.getInputs === 'function')
      ? window.getInputs(r)
      : (r.inputs || (r.input ? { [r.input]: 1 } : {}));

    /* Everything obtainable by a player at property tier T, as a fixpoint:
       start from raw, then keep adding any recipe output whose bench is
       available by T and whose inputs are already obtainable.

       `without` is the whole point of the check and the reason a first draft
       of this test PASSED the very bug it was written for. The Workshop is a
       tier-2 room, so at T=2 a naive walk counts the crafting bench as
       available — and then Workshop L1's plank cost looks perfectly
       reachable, via the Workshop. That circularity IS the deadlock. So when
       checking a room's FIRST rung, the bench that room itself provides is
       removed from the world: you cannot use a workshop to build the
       workshop. From L2 onward it is legitimately available, because owning
       L1 is a precondition of buying L2. */
    const reachableAt = (T, without) => {
      const have = new Set(raw);
      for (let pass = 0; pass < 12; pass++) {
        let grew = false;
        Object.keys(window.ARTISAN_RECIPES || {}).forEach((skill) => {
          if (benchTier(skill) > T) return;       // that bench is not open yet
          if (without && BENCH[skill] === without && !H.UNGATED[skill]) return;
          (window.ARTISAN_RECIPES[skill] || []).forEach((r) => {
            if (!r.output || have.has(r.output)) return;
            const inp = inputsOf(r);
            if (Object.keys(inp).every((k) => have.has(k))) { have.add(r.output); grew = true; }
          });
        });
        if (!grew) break;
      }
      return have;
    };
    const cache = {};
    const reach = (T, without) => {
      const k = T + '|' + (without || '');
      return cache[k] || (cache[k] = reachableAt(T, without));
    };

    const problems = [];
    Object.keys(R).forEach((id) => {
      const roomTier = H.roomMinTier(id);
      R[id].levels.forEach((rung, i) => {
        // The earliest property tier at which this rung is legal at all.
        const T = Math.max(roomTier, rung.tier || 0);
        // Rung 1 is bought by someone who does NOT yet own this room.
        const have = reach(T, i === 0 ? id : null);
        Object.keys(rung.cost || {}).forEach((item) => {
          if (!have.has(item)) {
            problems.push(id + ' L' + (i + 1) + ' needs "' + item +
              '" but nothing reachable at property tier ' + T +
              (i === 0 ? ' (without the ' + R[id].name + ' itself)' : '') + ' produces it');
          }
        });
      });
    });
    assert(problems.length === 0, 'DEADLOCK — ' + problems.join(' | '));
    assert(reach(2, 'workshop').has('normal_log'), 'sanity: logs are free with no Workshop');
    /* THE VACUITY GUARD, IN THE ONLY TWO POSITIONS IT HAS. The self-exclusion
       above can only bite while some bench is GATED on its room; since
       2026-09-07 none is, so the circularity is structurally impossible and
       `without` is a no-op. That must be asserted from the exemption set rather
       than assumed, or this proof would decay into "somebody could make it",
       and the moment a bench is re-gated the first branch takes over again. */
    const gatedBench = Object.keys(BENCH).filter((s) => !H.UNGATED[s]);
    if (gatedBench.length) {
      const s = gatedBench[0], room = BENCH[s];
      const made = (window.ARTISAN_RECIPES[s] || []).find((r) => r.output);
      assert(made && !reach(9, room).has(made.output),
        'the self-exclusion is not working — ' + (made && made.output) + ' must be unreachable while the '
        + room + ' is excluded');
    } else {
      assert(reach(2, 'workshop').has('normal_plank'),
        'no bench is gated on a room, so a plank must be reachable with no Workshop — this walk and '
        + 'HearthriseHomestead.UNGATED disagree about the same rule');
    }

    /* The specific regression, still pinned — though the deadlock behind it is
       now impossible twice over: the cost is logs, AND the saw is a level-1
       crafting recipe no room gates, so a plank is reachable from the camp. */
    assert(!('normal_plank' in R.workshop.levels[0].cost),
      'Workshop L1 must not cost planks — it was once priced in its own output');
    assert(reach(0).has('normal_log'), 'logs must be free at a Wanderer\'s Camp');
    assert(reach(0).has('normal_plank'),
      'a plank must be reachable at the camp — saw_normal is Crafting 1 and no room gates it');
  }),

  () => tryRun('b227: the magnitude retune — small increments, and costs untouched', () => {
    /* Tyler, binding, mid-build: "the % boosts across the board are way too
       high. 50% smithing? it should be like increments of 2%."

       This OVERRIDES spec §1's "nothing already bought is devalued" corollary
       for MAGNITUDES, by the owner, as a stated global rebalance. What the
       corollary still protects — and what this test therefore guards — is that
       LEVELS and COSTS did not move: a player who bought Kitchen 3 still owns
       Kitchen 3 and still paid 8,000g and 30 Oak Log for it. Only the number
       printed on it came down. */
    const MAG = {
      kitchen:  ['cookSpeed', [.02, .04, .06, .08, .10]],
      forge:    ['smithSpeed', [.02, .04, .06, .08, .10]],
      workshop: ['craftSpeed', [.02, .04, .06, .08, .10]],
      shrine:   ['prayerSpeed', [.02, .04, .06, .08, .10]],
      library:  ['allXP', [.01, .02, .03, .04, .05]],
      trophy:   ['combatXP', [.01, .02, .03, .04, .05]],
      // Duration is EXEMPT from the small-percent grammar (bonus-rebase.md):
      // it is not throughput power, so it keeps the generous curve.
      cellar:   ['buffDuration', [.20, .40, .60, .80, 1.0]],
      garden:   ['farmYield', [1, 2, 4, 6, 8]],   // units, not a percentage
    };
    Object.keys(MAG).forEach((id) => {
      const [key, vals] = MAG[id];
      vals.forEach((v, i) => {
        const rung = window.ROOMS[id].levels[i];
        assert(rung.bk === key, id + ' L' + (i + 1) + ' should sell ' + key + ', sells ' + rung.bk);
        assert(Math.abs(rung.bv - v) < 1e-9,
          id + ' L' + (i + 1) + ' should grant ' + v + ', grants ' + rung.bv + ' — the retune drifted');
      });
    });
    // Every percentage on this screen is a whole even number of points (or a
    // whole point for the two +1..5 ladders). "Increments of 2%" as a shape,
    // not a one-off edit — a rung at 0.075 would pass a ceiling test and still
    // be exactly what Tyler asked us to stop doing.
    // Whole percentages EVERYWHERE, including the secondary maps — the rebase
    // spec's grammar test asserts integers, and a rung at 0.075 would pass a
    // ceiling check while being exactly what Tyler asked us to stop doing.
    const EXEMPT = { farmYield: 1, buffDuration: 1 };   // units / not throughput power
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((rung, i) => {
      const seen = [];
      if (rung.bk) seen.push([rung.bk, rung.bv || 0]);
      if (rung.bx) Object.keys(rung.bx).forEach((k) => seen.push([k, rung.bx[k]]));
      seen.forEach(([k, v]) => {
        const pts = v * 100;
        assert(Math.abs(pts - Math.round(pts)) < 1e-9,
          id + ' L' + (i + 1) + ' grants ' + pts + ' points of ' + k + ' — not a whole percentage');
        if (!EXEMPT[k]) {
          assert(pts <= 25, id + ' L' + (i + 1) + ' grants ' + pts + '% ' + k + ' — too high for the retuned grammar');
        }
      });
    }));
    // No room ships at the old 10/25/50 shape anywhere.
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((rung, i) => {
      if (EXEMPT[rung.bk]) return;
      assert(!(Math.abs(rung.bv - 0.25) < 1e-9 || Math.abs(rung.bv - 0.5) < 1e-9),
        id + ' L' + (i + 1) + ' is still on the pre-rebase 25/50 curve');
    }));
    // b228: the reserved payload is PAID. Library L4/L5 pay Rested XP as a flat
    // QUANTUM per banked charge (capacity, outside the percent grammar) instead
    // of the percentage potency that was provably worth nothing, and L5 also
    // deepens the bank. What must never come back is a `restedXp` PERCENTAGE.
    assert(window.ROOMS.library.levels[3].rested === 800, 'Library L4 must pay 800 XP per rested charge');
    assert(window.ROOMS.library.levels[4].rested === 1600, 'Library L5 must pay 1,600 XP per rested charge');
    assert(window.ROOMS.library.levels[4].restedCap === 120, 'the Great Library must deepen the bank to 120 charges');
    [3, 4].forEach((i) => {
      const rung = window.ROOMS.library.levels[i];
      assert(!rung.resv, 'Library L' + (i + 1) + ' must no longer say "reserved" — the payload shipped');
      assert(/[Rr]ested/.test(rung.bonus || ''), 'Library L' + (i + 1) + ' must SAY it pays Rested XP');
    });
    let restedProducers = 0;
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((r) => {
      if (r.bk === 'restedXp' || (r.bx && r.bx.restedXp != null)) restedProducers++;
    }));
    assert(restedProducers === 0, 'no homestead rung may promise Rested XP as a PERCENTAGE — it is a flat quantum now');

    // COSTS AND LEVELS ARE UNTOUCHED. This is the half of the corollary that
    // still stands, so it is frozen literally.
    const COST = {
      kitchen:  [{ gold: 500, normal_log: 20 }, { gold: 2000, normal_log: 50 }, { gold: 8000, oak_log: 30 }],
      cellar:   [{ gold: 1200, normal_log: 60 }, { gold: 4000, oak_log: 60 }, { gold: 12000, willow_log: 50 }],
      forge:    [{ gold: 800, copper_ore: 30 }, { gold: 3000, iron_ore: 50 }, { gold: 12000, iron_ore: 100 }],
      library:  [{ gold: 1000, normal_log: 50 }, { gold: 4000, oak_log: 50 }, { gold: 15000, maple_log: 30 }],
      garden:   [{ gold: 600, wheat: 20 }, { gold: 2500, wheat: 60 }, { gold: 9000, pumpkin: 5 }],
      trophy:   [{ gold: 2000, wolf_pelt: 5 }, { gold: 8000, troll_hide: 3 }, { gold: 25000, dragon_scale: 2 }],
      shrine:   [{ gold: 900, bones: 40 }, { gold: 3500, big_bones: 25 }, { gold: 13000, dragon_bones: 8 }],
    };
    Object.keys(COST).forEach((id) => COST[id].forEach((c, i) => {
      assert(JSON.stringify(window.ROOMS[id].levels[i].cost) === JSON.stringify(c),
        id + ' L' + (i + 1) + ' price changed: ' + JSON.stringify(window.ROOMS[id].levels[i].cost));
    }));
    // The Workshop is the ONE live cost that moved, and only because it was a
    // deadlock (see the §7 proof above). Pinned so the fix cannot be reverted.
    assert(JSON.stringify(window.ROOMS.workshop.levels[0].cost) === JSON.stringify({ gold: 700, normal_log: 40 }),
      'Workshop L1 must stay on raw logs — planks were the deadlock');

    // The Cellar is the one deliberate change of EFFECT, and it is a strict
    // gain: `storage` was read by nothing, so nobody can be worse off.
    window.ROOMS.cellar.levels.forEach((rung, i) => {
      assert(rung.bk === 'buffDuration', 'Cellar L' + (i + 1) + ' should now sell buff duration');
    });
    assert(window.getBonus('storage') === 0, 'storage must no longer be produced by anything');
    // Reliability is the Kitchen's mechanic, not a power number — explicitly
    // exempt from the retune.
    assert(window.ROOMS.kitchen.levels[2].bx.noBurn === 0.25, 'the noBurn column must NOT have been retuned');
  }),

  () => tryRun('b227 P1: the ESM merge does not silently eat legacy drop injections', () => {
    /* Found by the deadlock proof, and it is a live content bug ~80 builds old.
       legacy.js pushed 11 drops onto MONSTERS at parse time; main.js then runs
       `unifyObject` = `Object.assign(legacyObj, esmObj)`, a PER-KEY overwrite
       that replaces each whole monster object — discarding every push. Result:
       3 raw meats never dropped (so cooked_wolf_meat, and therefore
       field_ration — a castle good — were unobtainable) and 6 recipe scrolls
       never dropped (so 6 `gated:` recipes could never unlock). They now live
       in src/data/monsters.js with every other drop. */
    const M = window.MONSTERS || {};
    const dropsOf = (id) => ((M[id] || {}).drops || []).map((d) => d.id);
    const EXPECT = {
      small_wolf: 'raw_wolf_meat', wolf: 'raw_wolf_meat', dire_wolf: 'raw_wolf_meat',
      panther: 'raw_panther_meat', bear: 'raw_bear_meat', ancient_bear: 'raw_bear_meat',
      // goblin_warlord / warband_captain's gear scrolls left with the gear recipes (2026-10-14).
      lich: 'soul_recipe', dragon: 'marrow_cookbook', plague_swarm: 'field_cookbook',
    };
    Object.keys(EXPECT).forEach((mid) => {
      assert(dropsOf(mid).indexOf(EXPECT[mid]) >= 0,
        mid + ' no longer drops ' + EXPECT[mid] + ' — the ESM merge ate it again');
    });
    // No duplicates: if the legacy pushes are ever restored alongside the data,
    // every one of these would drop twice.
    Object.keys(EXPECT).forEach((mid) => {
      const ids = dropsOf(mid);
      assert(ids.length === new Set(ids).size, mid + ' has a duplicated drop entry');
    });
    // The b145 Phase-B suppression holds — a scroll that unlocks nothing is a
    // dead end, so a scroll must NOT drop until its target item ships.
    //
    // b343: two of the original three have now shipped their targets
    // (spellstone_diagram → spellstone_ring, gemcutter_note →
    // dragon_gem_earrings, both in src/data/slot-ladders.js), so they are
    // asserted the OTHER way round below. dragon_marrow_recipe's target
    // (dragonbone_spear) still does not exist and stays suppressed. The rule is
    // now stated as a rule rather than as a hardcoded list, so it cannot rot:
    // EVERY scroll item is checked against whether its target exists.
    const all = Object.keys(M).reduce((a, k) => a.concat(dropsOf(k)), []);
    // (W0 cut dragon_marrow_recipe itself — a scroll for an item that never shipped.)
    Object.entries(window.ITEMS || {}).forEach(([id, it]) => {
      if (!it || !it.recipe) return;                       // not a scroll
      const targetExists = !!(window.ITEMS || {})[it.recipe];
      if (!targetExists) {
        assert(all.indexOf(id) < 0, 'scroll ' + id + ' drops but its target item "' + it.recipe + '" does not exist (b145)');
      }
    });
    // b343: and the two that were unblocked must actually be obtainable now —
    // shipping the item without the drop leaves the recipe permanently locked.
    ['spellstone_diagram', 'gemcutter_note'].forEach((s) => {
      assert(all.indexOf(s) >= 0, s + ' must now drop — its target item shipped in b343 (slot-ladders.js)');
    });
    // And every scroll that DOES drop must actually unlock a live recipe.
    const gates = new Set();
    Object.keys(window.ARTISAN_RECIPES || {}).forEach((sk) =>
      (window.ARTISAN_RECIPES[sk] || []).forEach((r) => { if (r.gated) gates.add(r.gated); }));
    all.filter((id) => (window.ITEMS[id] || {}).recipe).forEach((id) => {
      assert(gates.has(id), 'scroll ' + id + ' drops but unlocks no recipe — a dead end');
    });
  }),

  () => tryRun('b227: the power budget holds at a maxed homestead (spec §6/H2)', () => {
    /* Asserted against the LADDER, not against a live getBonus reading, and
       that is deliberate. getBonus is wrapped additively by world-events,
       companions, clans, clan-seat-ui and muster, and the daily/weekly event
       pool contains speed and XP boosts — so a reading-based ceiling test goes
       red or green on the UTC date alone. (I shipped exactly that mistake in
       b225 and had to fix it in b226; a gate that flips on the calendar is
       worse than no gate.) The budget is a statement about what the HOMESTEAD
       may grant, so the homestead's own tables are what it is checked against. */
    const CEIL = {
      // Post-retune (Tyler, binding): small increments across the board.
      allXP: 0.05,
      combatXP: 0.05, cookSpeed: 0.10, smithSpeed: 0.10, craftSpeed: 0.10, prayerSpeed: 0.10,
      farmYield: 8, craftSave: 0.08, yield_cooking: 0.08, yield_smithing: 0.08,
      buffDuration: 1.0,    // exempt from the % grammar — not throughput power
      noBurn: 0.25,         // the Kitchen cancels the whole open-fire burn, never more
      restedXp: 0,          // reserved for the b228 rested rework — promised by nothing
    };
    const peak = {};
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((rung) => {
      const add = (k, v) => { peak[k] = Math.max(peak[k] || 0, v); };
      if (rung.bk) add(rung.bk, rung.bv || 0);
      if (rung.bx) Object.keys(rung.bx).forEach((k) => add(k, rung.bx[k]));
    }));
    Object.keys(CEIL).forEach((k) => {
      assert(Math.abs((peak[k] || 0) - CEIL[k]) < 1e-9,
        'the homestead ceiling for ' + k + ' should be ' + CEIL[k] + ', the ladder grants ' + (peak[k] || 0));
    });
    // No room may invent a key the budget has not accounted for — that is how
    // a ceiling stops meaning anything.
    Object.keys(peak).forEach((k) => assert(CEIL[k] != null,
      'a room rung grants "' + k + '", which is outside the audited power budget'));
    // H2: the homestead contributes NO goldFind. That lane is the castle
    // Treasury's, so the two pillars do not duplicate.
    assert(peak.goldFind == null, 'the homestead must contribute no goldFind');

    // allXP is the game's tightest budget (the fuse is 0.60 across every
    // system). Post-retune the homestead's whole contribution is 5 points,
    // which is the headroom problem solved rather than merely managed.
    assert(peak.allXP <= 0.05 + 1e-9, 'the homestead may not contribute more than +5% allXP');
  }),

  () => tryRun('b227: the fuses live where the number is SPENT, so no wrapper can escape them', () => {
    /* This test is the reason the fuses are not where the spec put them.

       homestead-deepening §8 specs both clamps as one-liners inside getBonus.
       Built there, this test measured prayerSpeed at 0.8999 through a clamp
       that said 0.85 — because getBonus is a CHAIN of seven additive wrappers
       (world-events, companions, clans, clan-seat-ui, muster + two in
       legacy.js), and a clamp in the base function is escaped by every wrapper
       above it. Both fuses therefore moved to the point of consumption. */
    /* b228: the chain-wide budget moved to features/power-budget.js as the
       FINAL wrapper (its own tests are below), and speedClamp stayed exactly
       where it is — as the last line of defence at `ms × (1 − speed)`. Its
       constant came to 0.70: the largest legal reading is gatherSpeed at the
       0.30 absolute peak plus the out-of-budget tool ladder's 0.35 = 0.65, so
       the fuse sits five points clear and never binds on a legal stack.
       RESTED_POTENCY_CAP is gone — Rested is a flat XP quantum now. */
    assert(typeof window.speedClamp === 'function', 'the speed fuse choke-point is not published');
    assert(window.SPEED_FUSE === 0.70, 'the speed fuse should be 0.70, got ' + window.SPEED_FUSE);
    assert(window.RESTED_POTENCY_CAP === undefined, 'the rested POTENCY cap must be retired, not left behind');
    assert(window.SPEED_FUSE > 0.30 + 0.35,
      'the speed fuse must sit above the highest legal gatherSpeed + tool ladder, or it silently nerfs a legal stack');

    // (a) The clamp clamps, at any input a wrapper chain could produce.
    assert(Math.abs(window.speedClamp(0.60) - 0.40) < 1e-9, 'an in-budget speed must pass through untouched');
    assert(Math.abs(window.speedClamp(0.90) - 0.30) < 1e-9, 'an over-budget speed must clamp to the fuse');
    assert(Math.abs(window.speedClamp(4) - 0.30) < 1e-9, 'an absurd total must still land on the fuse');
    assert(Math.abs(window.speedClamp(1) - 0.30) < 1e-9, 'speed 1.0 must never produce a zero interval');
    assert(window.speedClamp(2) > 0, 'the multiplier must never go negative — setInterval would spin');
    // A debuff still slows you: the fuse is a ceiling on fast, not a floor on slow.
    assert(Math.abs(window.speedClamp(-0.5) - 1.5) < 1e-9, 'a negative speed must still lengthen the action');
    assert(window.speedClamp(undefined) === 1 && window.speedClamp(NaN) === 1, 'garbage must be identity, not NaN');

    // (b) Every site that spends a speed key goes through it. A single
    //     un-routed `(1 - speed)` is a hole the fuse cannot see, so every
    //     live interval site is checked, not assumed.
    //     Read off the live function bodies rather than a source blob, so this
    //     cannot quietly become a no-op the way a missing global would.
    [['startArtisan', window.startArtisan],
     ['renderSkillDetail', window.renderSkillDetail],
     ['_activityXpHr', window._activityXpHr]].forEach(([name, fn]) => {
      if (typeof fn !== 'function') return;
      const src = Function.prototype.toString.call(fn);
      if (!/speed/.test(src)) return;                 // this copy does no interval math
      assert(!/\(\s*1\s*-\s*speed\s*\)/.test(src),
        name + ' still computes a raw (1 - speed) — that site bypasses the fuse');
    });
    // startArtisan is the live loop and MUST be routed. Asserted BEHAVIOURALLY
    // rather than by reading its source: startArtisan is defined three times in
    // legacy.js and the outermost copy is whichever loaded last, so a source
    // scan tests the wrapper's shape instead of the game's behaviour. Drive a
    // deliberately over-budget speed and read the interval the engine actually
    // committed to (G.skillMs, which the offline replay also uses).
    if (typeof window.startArtisan === 'function' && window.ARTISAN_RECIPES) {
      const snapA = snapshotG();
      try {
        const rec = (window.ARTISAN_RECIPES.cooking || [])[0];
        if (rec) {
          window.G.rooms = { __fuse_probe: 1 };
          window.ROOMS.__fuse_probe = { name: 'probe', icon: '', desc: '',
            levels: [{ nm: 'p', bonus: 'p', cost: { gold: 1 }, bk: 'cookSpeed', bv: 4 }] };
          window.G.skills = Object.assign({}, window.G.skills, { cooking: 9999999 });
          const inp = (typeof window.getInputs === 'function') ? window.getInputs(rec) : {};
          const bag = {}; Object.keys(inp).forEach((k) => { bag[k] = 9999; });
          window.G.inventory = Object.assign({}, window.G.inventory, bag);
          window.startArtisan('cooking', rec.id);
          if (typeof window.stopSkill === 'function') window.stopSkill();
          const floorMs = Math.max(500, Math.floor(window.pacedActionMs(rec.ms) * (1 - window.SPEED_FUSE)));
          assert(window.G.skillMs >= floorMs - 1,
            'a 400% cook speed produced a ' + window.G.skillMs + 'ms interval — the fuse was bypassed (floor ' + floorMs + ')');
          assert(window.G.skillMs > 0, 'the committed interval must never be zero or negative');
        }
      } finally { delete window.ROOMS.__fuse_probe; restoreG(snapA); }
    }

    // (c) A real spend honours it: drive the interval with an over-budget
    //     bonus and assert the resulting ms is the floored, fused one.
    const snap = snapshotG();
    try {
      window.G.plotBuildings = [];
      window.G.rooms = {};
      Object.keys(window.ROOMS).forEach((id) => { window.G.rooms[id] = window.ROOMS[id].levels.length; });
      // Permanent power must sit UNDER the fuse — that is what makes it a fuse
      // and not a nerf. Read off the ladder, not off getBonus, because the
      // wrapper chain includes calendar-driven world events and a test that
      // flips on the UTC date is worse than no test.
      ['cookSpeed', 'smithSpeed', 'craftSpeed', 'prayerSpeed'].forEach((k) => {
        let peak = 0;
        Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((r) => {
          if (r.bk === k) peak = Math.max(peak, r.bv || 0);
        }));
        assert(Math.abs(peak - 0.10) < 1e-9, 'the ' + k + ' ladder should top out at 0.10 post-retune, got ' + peak);
        assert(peak < window.SPEED_FUSE, k + ' permanent power reaches the fuse — that is a nerf, not a fuse');
      });
    } finally { restoreG(snap); }
  }),

  () => tryRun('b227: the material-only yield law (H6) — no extra output on equipment', () => {
    // Without this predicate a 20% extra-output roll on endgame armour prints
    // six figures at the vendor and the Forge becomes the game's largest gold
    // faucet. Materials, never equipment.
    assert(typeof window.isMaterialOutput === 'function', 'isMaterialOutput seam missing');
    const material = Object.keys(window.ITEMS).find((k) => !window.ITEMS[k].type);
    const equip = Object.keys(window.ITEMS).find((k) => !!window.ITEMS[k].type);
    assert(material && equip, 'need one material and one equipment item to test with');
    assert(window.isMaterialOutput({ output: material }) === true, material + ' is a material and should qualify');
    assert(window.isMaterialOutput({ output: equip }) === false, equip + ' has a type and must NEVER qualify');
    assert(window.isMaterialOutput({}) === false, 'a recipe with no output cannot yield extra');
    assert(window.isMaterialOutput({ output: 'nope_not_an_item' }) === false, 'an unknown output must not qualify');
    // Every recipe an extra-output rung can actually fire on must be a
    // material — i.e. the Forge's smelting lane, not its armoury.
    const smith = (window.ARTISAN_RECIPES.smithing || []).filter((r) => window.isMaterialOutput(r));
    assert(smith.length > 0, 'the Forge must have at least one material recipe for yield_smithing to mean anything');
    assert(smith.every((r) => !window.ITEMS[r.output].type), 'the filter must not admit a typed output');
  }),

  () => tryRun('b227: the Cellar finally does something — buff duration via registerBuffScaler', () => {
    // The oldest item on the design backlog. getBonus('storage') was read by
    // NOTHING, so up to 17,200 gold bought literally zero. Repurposed with no
    // migration and no seam: registerBuffScaler was built in b222 for exactly
    // this second consumer.
    const H = window.HearthriseHomestead;
    assert(H && typeof H.cellarScale === 'function', 'the Cellar scaler is not published');
    const snap = snapshotG();
    try {
      window.G.plotBuildings = [];
      /* b456: `rooms` is server-of-record, so a raw `G.rooms = …` is UNKNOWN to
         every reader (fail-closed to the empty map) and this test would measure
         "no Cellar" three times over. stampRecordLikeLoad pushes the rung through
         the REAL hr_load path, which is also what a player's Cellar actually is. */
      window.G.rooms = {};
      stampRecordLikeLoad(window.G);
      assert(Math.abs(H.cellarScale().duration - 1) < 1e-9, 'no Cellar means no change to a buff');
      // Derived from the ladder so the magnitude retune cannot silently break
      // the wiring test — what is guarded is that the rung reaches the scaler.
      const rungs = window.ROOMS.cellar.levels;
      window.G.rooms = { cellar: 1 };
      stampRecordLikeLoad(window.G);
      assert(Math.abs(H.cellarScale().duration - (1 + rungs[0].bv)) < 1e-9,
        'Root Cellar should lengthen buffs by its rung value, got ' + H.cellarScale().duration);
      window.G.rooms = { cellar: 5 };
      stampRecordLikeLoad(window.G);
      assert(Math.abs(H.cellarScale().duration - (1 + rungs[4].bv)) < 1e-9,
        'The Deep Cellar should lengthen buffs by its rung value, got ' + H.cellarScale().duration);
      assert(rungs[4].bv > rungs[0].bv, 'the Cellar ladder must still climb');
      // H7: duration ONLY. Magnitude is the castle Tavern Hearth's lane, and
      // the Cellar touching it is how two pillars multiply into a second
      // character.
      assert(H.cellarScale().magnitude == null, 'the Cellar must never scale buff MAGNITUDE');
      // …and it is registered, so applyBuff actually sees it.
      const scaled = window.buffScaleFor({ type: 'x' });
      assert(scaled.duration >= 1 + rungs[4].bv - 1e-9,
        'the registered scaler should be in the composition, got ' + scaled.duration);
    } finally { restoreG(snap); }
  }),

  () => tryRun('b227: roomDescriptor is pure and answers owned / available / locked', () => {
    const H = window.HearthriseHomestead;
    assert(H && typeof H.roomDescriptor === 'function', 'roomDescriptor is not published');
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 2 };                  // farmstead
      window.G.rooms = { forge: 2 };
      predZero(); window.G.gold = 0;
      window.G.inventory = {};
      // b456: rooms + gold are server-of-record — stamp them through the real
      // record path or every read below fail-closes and the test measures nothing.
      stampRecordLikeLoad(window.G);

      const owned = H.roomDescriptor('forge');
      assert(owned.state === 'built' && owned.level === 2, 'the Forge should read as owned at level 2');
      assert(owned.currentName === 'Stone Forge', 'an owned room must name the rung it is on');
      assert(owned.ladder.length === 5, 'the FULL ladder always renders, owned rungs included');
      assert(owned.ladder[0].owned && owned.ladder[1].owned, 'rungs 1-2 should be marked owned');
      assert(owned.ladder[2].next === true, 'rung 3 is the next one');
      assert(owned.ladder[3].locked === true, 'rung 4 is tier-locked at a farmstead');
      assert(/Stonecross/.test(owned.ladder[3].gateReason || ''), 'a locked rung must SAY which property opens it');
      assert(owned.next && owned.next.affordable === false, 'a broke player cannot afford the next rung');
      assert(owned.next.missing.length > 0, 'and the descriptor must name what is short');

      const unbuilt = H.roomDescriptor('cellar');
      assert(unbuilt.state === 'unbuilt' && unbuilt.level === 0, 'the Cellar is legal but unbuilt at a farmstead');
      assert(unbuilt.lockReason === null, 'an available room has no lock reason');

      const locked = H.roomDescriptor('shrine');
      assert(locked.state === 'locked', 'the Shrine is a tier-4 room and must be locked at a farmstead');
      assert(/Ironvale/.test(locked.lockReason || ''), 'a locked room must name the property tier that opens it');

      // Purity: it renders nothing and mutates nothing.
      const before = JSON.stringify(window.G.rooms);
      H.roomDescriptor('forge'); H.roomDescriptor('shrine');
      assert(JSON.stringify(window.G.rooms) === before, 'roomDescriptor must not mutate state');
      // Total over every live room — no room may be undescribable.
      Object.keys(window.ROOMS).forEach((id) => {
        const d = H.roomDescriptor(id);
        assert(d && d.title && d.theme && d.flavour, id + ' has no complete descriptor');
        assert(d.ladder.length === window.ROOMS[id].levels.length, id + ' ladder length disagrees with its room');
      });
    } finally { restoreG(snap); }
  }),

  () => tryRun('b521: the Forge and Workshop rung-1 CARD names the proc it pays', () => {
    /* Designer ruling 1b. With the permission gate gone, the first rung has to
       SELL the room, and a player reads the ladder line before they ever feel a
       proc. So the copy and the payload are asserted together: the line the card
       shows for rung 1 must name the mechanic, and the rung must actually carry
       it. A rung whose copy promises an extra bar and whose bx is empty is the
       Scarecrow bug (b228) again — description and grant wrong in different
       directions, each looking fine on its own. */
    const H = window.HearthriseHomestead;
    assert(H && typeof H.roomDescriptor === 'function', 'roomDescriptor is not published');
    const CASES = [
      ['forge',    'yield_smithing', /extra bar/i,           'Extra bar'],
      ['workshop', 'craftSave',      /crafts cost nothing/i, 'Free crafts'],
    ];
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 5 };
      window.G.rooms = { forge: 1, workshop: 1 };
      stampRecordLikeLoad(window.G);
      CASES.forEach(([id, key, copyRe, label]) => {
        const d = H.roomDescriptor(id);
        const line = d.ladder[0].effects || '';
        assert(copyRe.test(line), id + ' rung 1 reads "' + line + '" — it must name the proc it pays');
        assert(/1%/.test(line), id + ' rung 1 must state the 1% magnitude, reads "' + line + '"');
        const rung = window.ROOMS[id].levels[0];
        assert(rung.bx && Math.abs(rung.bx[key] - 0.01) < 1e-9,
          id + ' rung 1 promises the proc in copy but grants ' + ((rung.bx || {})[key]) + ' of ' + key);
        // And the owned-room panel shows it as a live effect, by its label.
        assert((d.now || []).some((e) => e.label === label),
          id + ' at rung 1 does not list "' + label + '" among what the room does right now');
      });
      // The ladder climbs 1/2/4/6/8 in the copy too, so no rung reads as a
      // downgrade of the one below it.
      CASES.forEach(([id]) => {
        const pcts = window.ROOMS[id].levels.map((r, i) => {
          const m = /·\s*(\d+)%/.exec(r.bonus || '');
          assert(m, id + ' L' + (i + 1) + ' states no proc percentage: "' + r.bonus + '"');
          return Number(m[1]);
        });
        assert(pcts.join(',') === '1,2,4,6,8', id + ' proc copy ladders ' + pcts.join('/') + ', expected 1/2/4/6/8');
      });
    } finally { restoreG(snap); }
  }),



  () => tryRun('LORE-3: wallRows keeps the highest claimed stage and reports unknown claims', () => {
    const T = window.HearthriseTrophies;
    assert(T && typeof T.wallRows === 'function', 'HearthriseTrophies.wallRows not published');
    const opts = { roster: { goblin: { name: 'Goblin' } }, isClaimed: (id, s) => id === 'goblin' && s <= 2, known: true };
    const w = T.wallRows(opts);
    assert(w.known === true && w.rows.length === 1 && w.rows[0].name === 'Goblin' && w.rows[0].stageName === 'Stalker',
      'want one Goblin/Stalker row, got ' + JSON.stringify(w.rows));
    assert(w.topStageId === 'stalker' && w.more === 0, 'topStageId ' + w.topStageId + ' more ' + w.more);
    assert(T.wallRows(Object.assign({}, opts, { known: false })).known === false, 'known:false must be reported');
  }),

  () => tryRun('LORE-3b: the Trophy Room omits its wall while the realm has not stated the claims', () => {
    const T = window.HearthriseTrophies, H = window.HearthriseHomestead, RR = window.HearthriseRooms;
    if (!T || !H || !RR || typeof RR.roomRung !== 'function') return skip('trophies / homestead / rooms seam absent');
    const ck = T.claimsKnown, rung = RR.roomRung;
    const wall = () => H.modalDescriptor('trophy').sections.some((s) => s.kind === 'rows' && s.title === 'On the wall');
    try {
      RR.roomRung = (g, id) => (id === 'trophy' ? 1 : rung(g, id));
      T.claimsKnown = () => false;
      assert(!wall(), 'claims unknown: the wall section must be omitted, never "bare"');
      T.claimsKnown = () => true;
      assert(wall(), 'claims known: the wall section must render (the arm above is not vacuous)');
    } finally { T.claimsKnown = ck; RR.roomRung = rung; }
  }),

  /* COMP-PAYS-1 — a companion does on the client exactly what the engine pays.
     src/core/companion-perk.js is the one definition (COMPANION_KEYS, priced by
     companionKeyBonus); the engine pays no proc, no combat stat, no rareDrop and
     no hpRegen. Every proc pet is driven through the real kill / combat-hit /
     gather / cook seams with its proc forced to chance 1, pet ON against pet OFF
     from the same seed: nothing observable may differ, the stream included. The
     literals below are pinned on purpose — a helper cannot vouch for itself. */

  () => tryRun('b227: every room opens a themed modal through the shared seam', () => {
    const H = window.HearthriseHomestead;
    if (!H || typeof H.modalDescriptor !== 'function' || !window.HearthriseRoomModal) return;
    const snap = snapshotG();
    try {
      window.G.homestead = { tier: 3 };
      window.G.rooms = { forge: 2, kitchen: 5 };
      stampRecordLikeLoad(window.G);   // b456: rooms are server-of-record
      const themes = {};
      Object.keys(window.ROOMS).forEach((id) => {
        const m = H.modalDescriptor(id);
        assert(m && m.title && m.theme, id + ' produced no modal descriptor');
        assert(typeof m.onAction === 'function', id + ' modal must handle its own actions');
        assert(/^<svg/.test(m.scene || ''), id + ' modal needs a scene');
        // The seam's published grammar, and nothing outside it.
        const kinds = m.sections.map((s) => s.kind);
        kinds.forEach((k) => assert(['note', 'meter', 'rows', 'ladder', 'actions', 'field'].indexOf(k) >= 0,
          id + ' used a section kind the seam does not define: ' + k));
        assert(kinds.indexOf('ladder') >= 0, id + ' modal must show its ladder');
        const ladder = m.sections.find((s) => s.kind === 'ladder');
        assert(ladder.rows.length === 5, id + ' modal ladder must show all five rungs');
        themes[m.theme] = (themes[m.theme] || 0) + 1;
      });
      // Themes are homestead vocabulary, never the castle's.
      Object.keys(themes).forEach((t) => {
        assert(['hearth', 'garden', 'workshop', 'cellar', 'forge', 'library', 'shrine', 'trophy'].indexOf(t) >= 0,
          'unexpected room theme "' + t + '" — homestead themes only');
      });

      // An owned rung shows no price (you already paid it) and says so.
      const maxed = H.modalDescriptor('kitchen');
      const kl = maxed.sections.find((s) => s.kind === 'ladder');
      assert(kl.rows.every((r) => r.costs === null), 'a fully owned ladder must show no prices');
      assert(/Built/.test(kl.rows[0].effect), 'an owned rung must be marked built');
      assert(!maxed.sections.some((s) => s.kind === 'actions' && s.buttons.some((b) => /^Build|^Upgrade/.test(b.label))),
        'a maxed room must offer no upgrade button');

      // A disabled action always carries a reason (spec §5 rule 5).
      predZero(); window.G.gold = 0; window.G.inventory = {};
      stampRecordLikeLoad(window.G);   // b456: the zeroed gold must be KNOWN-zero, not UNKNOWN
      const poor = H.modalDescriptor('forge');
      const acts = poor.sections.find((s) => s.kind === 'actions');
      const up = acts.buttons.find((b) => /^Upgrade|^Build/.test(b.label));
      assert(up && up.disabled && /Missing/.test(up.why || ''),
        'an unaffordable upgrade must be disabled AND name what is short');

      // It really opens, and really closes.
      H.openRoom('forge');
      assert(window.HearthriseRoomModal.isOpen(), 'the room modal did not open');
      assert(document.querySelector('.hr-room-wrap[data-room-theme="forge"]'), 'the theme did not reach the DOM');
      window.HearthriseRoomModal.close();
      assert(!window.HearthriseRoomModal.isOpen(), 'the room modal did not close');
    } finally { restoreG(snap); window.HearthriseRoomModal.close(); }
  }),

  /* ── b355 · THE INVISIBLE BLUEPRINT ──────────────────────────────────────
     Tyler, live, on the Kitchen room modal: "this doesn't tell me anywhere it
     requires a blueprint or how to get a blueprint. that should be made way
     more obvious."

     He could afford Iron Stove — gold and logs both green — so the pinned
     Build button was lit and PRIMARY. Clicking it produced a toast and no
     stove. The requirement existed only inside upgradeRoom, so no surface
     could state it and the view actively disagreed with the authority about
     whether the action was possible.

     These three tests are the contract: the gate is DATA on the descriptor,
     it REACHES the DOM with the item's name, its held state and its real
     source, and the button is dead-with-a-reason rather than lit-and-lying. */

  /* The dungeon blueprint this drove left in the 2026-10-14 demolition; a gold
     shortfall is the blocker every rung still has, and the bar must say it. */
  () => tryRun('b355: the pinned Build bar says WHY it is blocked — never a toast', () => {
    const H = window.HearthriseHomestead;
    if (!H || !window.HearthriseRoomModal) return;
    const snap = snapshotG(), bag = serverBagFixture();
    try {
      window.G.homestead = { tier: 3 };
      window.G.rooms = { kitchen: 1 };
      predZero(); window.G.gold = 0;
      stampRecordLikeLoad(window.G);    // b456: a KNOWN 0, and the rung through roomsOf
      window.G.inventory = { normal_log: 999, oak_log: 999 };
      bag.agree();

      const m = H.modalDescriptor('kitchen');
      const btn = m.sections.find((s) => s.kind === 'actions').buttons.find((b) => /^Upgrade|^Build/.test(b.label));
      assert(btn && btn.pin, 'the Build control must still be the pinned one');
      assert(btn.disabled, 'an unaffordable Build button must be disabled, not lit');
      assert(/Missing|gold/i.test(btn.why || ''), 'the button must name what is short: ' + btn.why);
      assert(!/Blueprint/.test(btn.why || ''), 'the demolished blueprint gate is back: ' + btn.why);

      H.openRoom('kitchen');
      const bar = document.querySelector('.hr-room-build');
      assert(bar, 'the pinned build bar must exist');
      assert(bar.querySelector('button[disabled]'), 'the bar button must be dead while the rung is unaffordable');
      assert(/Missing|gold/i.test(bar.textContent), 'the BAR must name the shortfall, not a toast: ' + bar.textContent);
      /* The whole point of the pin: this is ABOVE the scroll container. */
      assert(!bar.closest('.hr-room-body'), 'the build bar must never be inside the scrolling body');
    } finally { restoreG(snap); bag.restore(); window.HearthriseRoomModal && window.HearthriseRoomModal.close(); }
  }),

  () => tryRunAsync('SETTLE-FIRST-1: a settle_first Depot move waits for the settle, re-sends the SAME key once, succeeds', async () => {
    const SF = window.HearthriseSettleFirst, B = window.HearthriseBankSync, realFetch = window.fetch;
    assert(SF && B && typeof B.bankMove === 'function', 'src/net/settle-first.js or bank-sync.js did not load');
    const bodies = []; let cleared = 0;
    SF.__setClear(async (code) => { assert(code === 'settle_first', 'the clear was asked for ' + code); cleared++; });
    window.fetch = (u, init) => { bodies.push(init.body); return Promise.resolve(new Response(JSON.stringify(cleared
      ? { ok: true, item: 'logs', qty: 1 } : { ok: false, error: 'settle_first', unsettled_ms: 200000, threshold_ms: 180000, slot: 0 }), { status: 200 })); };
    try {
      const res = await B.bankMove('logs', 1, 'deposit', { url: 'https://probe.supabase.co', anonKey: 'anon', jwt: 'jwt', slot: 0 });
      assert(res.ok === true, 'the retry after the settle did not land: ' + JSON.stringify(res));
      assert(bodies.length === 2 && bodies[0] === bodies[1] && cleared === 1,
        'expected ONE settle then ONE identical re-send; sent ' + bodies.length + ', cleared ' + cleared);
    } finally { window.fetch = realFetch; SF.__setClear(null); }
  }),
  () => tryRunAsync('SETTLE-FIRST-2: party_hunt_running says the party words after exactly ONE retry — no storm', async () => {
    const SF = window.HearthriseSettleFirst, FS = window.HearthriseFarmSync, realFetch = window.fetch;
    assert(SF && FS && typeof FS.farmHarvest === 'function', 'src/net/settle-first.js or farm-sync.js did not load');
    let sent = 0;
    SF.__setClear(async () => {});
    window.fetch = () => { sent++; return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'party_hunt_running' }), { status: 200 })); };
    try {
      const res = await FS.farmHarvest(0, { url: 'https://probe.supabase.co', anonKey: 'anon', jwt: 'jwt', slot: 0 });
      assert(sent === 2, 'a party refusal was sent ' + sent + ' times — one retry, never a loop');
      assert(SF.settleRefusalText(res) === 'Your party hunt is still running',
        'the refusal did not read in the realm\'s words: ' + JSON.stringify(res));
    } finally { window.fetch = realFetch; SF.__setClear(null); }
  }),
  () => tryRunAsync('SETTLE-FIRST-3: a claim control is latched until the boot settle answers, then released', async () => {
    const SF = window.HearthriseSettleFirst, A = window.HearthriseAccrual, drv = hrCharmDriver();
    assert(SF && typeof A.bootSettlePending === 'function', 'the boot-settle latch seams are gone');
    const was = A.awaySettleDone(), box = document.createElement('div');
    box.innerHTML = '<button data-hr-settle-latch>Claim</button>';
    document.body.appendChild(box);
    const btn = box.firstChild; let taps = 0; btn.addEventListener('click', () => { taps++; });
    try {
      A.__resetAwaySettleLatch(false);
      A.configureAccrual({ url: 'https://proj.supabase.co', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
      assert(SF.sweepSettleLatch() && btn.disabled && btn.hasAttribute('data-hr-latched'), 'the latch did not hold before the boot settle');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); assert(taps === 0, 'a latched control answered a tap');
      await drv.drive(null); await Promise.resolve(); await Promise.resolve();
      assert(A.awaySettleDone() && !btn.disabled && !btn.hasAttribute('data-hr-latched'), 'the boot settle answered and the control stayed latched');
    } finally { drv.restore(); A.__resetAwaySettleLatch(was); box.remove(); }
  }),
];
