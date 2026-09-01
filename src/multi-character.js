// ============================================================
// src/multi-character.js
//
// Multi-character system. Each profile (Steam/Apple/Google account)
// owns N character slots. The currently-selected character is the
// "active" one — the live game state (G) IS that character's data.
// Switching characters serializes the active slot back to storage,
// then loads the chosen slot.
//
// Storage layout (localStorage):
//   hearthrise:profile = {
//     activeSlot:    0,                              // 0..4
//     unlockedSlots: 1,                              // 1..MAX_SLOTS
//     slots: [
//       {id:0, name:'...', combatLv:..., totalLv:..., createdAt:..., lastSeen:...},
//       ...
//     ],
//     entitlements:  {hearthHall:true, ...},         // ACCOUNT-level, not per-character
//     ownedThemes:   ['default'],                    // shared across chars
//     ownedCosmetics:['skin1', ...],                 // shared
//   }
//   hearthrise:char:0 = full G snapshot for slot 0
//   hearthrise:char:1 = full G snapshot for slot 1
//   ...
//
// HARD CAP: 5 slots. Pricing: slot 1 free, slots 2-5 escalating gems.
// Hearth Hall Premium unlocks 3 of the 4 paid slots automatically.
//
// Migrating an existing single-save player: on first run with this
// module loaded, copy 'hearthbound-save-v2' → 'hearthrise:char:0'
// and create a profile with 1 unlocked slot pointing at that data.
// ============================================================

(function(){
  'use strict';

  const MAX_SLOTS = 5;
  const SLOT_COSTS_GEMS = [0, 200, 500, 900, 1500];   // index = slotIndex (0..4)
  const PROFILE_KEY = 'hearthrise:profile';
  const SAVE_KEY = 'hearthbound-save-v2';

  /* b371 — how long the switch waits for the CURRENT character's cloud flush
     before it gives up and tells the player. Any wait at all has to be bounded:
     the whole b371 incident is what an unbounded one looks like from the
     player's chair. Six seconds is long enough for a slow-but-alive server and
     short enough that nobody thinks the tab has died. */
  const SWITCH_FLUSH_TIMEOUT_MS = 6000;

  function charKey(slot){ return 'hearthrise:char:' + slot; }

  // A character name can arrive over the network on a cloud restore, and both
  // the drawer and Home interpolate it into innerHTML — escape at the boundary.
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ── Profile load / save / migrate ─────────────────────────────
  function loadProfile(){
    try {
      var raw = localStorage.getItem(PROFILE_KEY);
      if(raw) return JSON.parse(raw);
    } catch(e){ console.warn('[multi-char] profile parse failed', e); }
    return null;
  }
  function saveProfile(p){
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }
    catch(e){ console.warn('[multi-char] profile save failed', e); }
  }
  function migrateLegacySave(){
    // First time loading the multi-char system: copy the existing single
    // save (if any) into slot 0 and create a profile.
    var legacy = localStorage.getItem(SAVE_KEY);
    var profile = {
      activeSlot: 0,
      unlockedSlots: 1,
      slots: [],
      entitlements: {},
      ownedThemes: ['default'],
      ownedCosmetics: [],
      version: 1,
    };
    if(legacy){
      // Stash legacy save into slot 0.
      localStorage.setItem(charKey(0), legacy);
      // Crack open the save to populate slot meta.
      try {
        var d = JSON.parse(legacy);
        profile.slots.push({
          id: 0,
          name: d.playerName || 'Adventurer',
          combatLv: 1, // recalc on next load
          totalLv: 1,
          createdAt: d.createdAt || Date.now(),
          lastSeen: d.lastSeen || Date.now(),
        });
        // Pull account-level fields out of the legacy save into the profile.
        if(d.entitlements) profile.entitlements = d.entitlements;
        if(d.ownedThemes) profile.ownedThemes = d.ownedThemes;
        if(d.ownedCosmetics) profile.ownedCosmetics = d.ownedCosmetics;
      } catch(e){
        profile.slots.push({ id:0, name:'Adventurer', combatLv:1, totalLv:1, createdAt:Date.now(), lastSeen:Date.now() });
      }
    } else {
      // Empty profile, slot 0 will be created as a fresh character.
      profile.slots.push({ id:0, name:'Adventurer', combatLv:1, totalLv:1, createdAt:Date.now(), lastSeen:Date.now() });
    }
    saveProfile(profile);
    return profile;
  }

  function notifySafe(msg, kind){
    try { if(typeof window.notify === 'function') window.notify(msg, kind || 'kill'); }
    catch(e){ console.warn('[multi-char] ' + msg); }
  }

  /* ══════════════════════════════════════════════════════════════════════
     b371 — THE IN-GAME CONFIRM. NOT `window.confirm`.

     THE BUG THIS DELETES: `confirm()` is a NATIVE MODAL, and a native modal
     BLOCKS THE RENDERER'S MAIN THREAD until it is answered. Every timer, every
     tick, every paint and every input handler in Hearthrise stops dead for as
     long as it is up — and if it is never answered (suppressed, raised while
     the tab is not frontmost, lost behind an OS window, raised twice in a row
     so Chrome offers "prevent this page from creating additional dialogs"), the
     tab is bricked with no self-recovery. Reproduced here with Playwright: with
     the dialog left unanswered the page stopped responding to script injection
     AND input for the entire life of the harness (>4 minutes) — byte-for-byte
     the reported symptom.

     There is no version of "answer the native dialog faster" that fixes that
     class. The fix is to stop having a main-thread-blocking primitive anywhere
     on a player-reachable path. This resolves a Promise instead, so the game
     keeps ticking underneath the question, and Escape / the backdrop / the
     Cancel button all guarantee a way out.

     Styling reuses the existing .qm-overlay / .qm-modal / .btn components — no
     new CSS, no new colours, tokens only (HARD RULE, CLAUDE.md).
     ══════════════════════════════════════════════════════════════════════ */
  /* b373: THIS IMPLEMENTATION MOVED TO src/utils/dialog.js and is now shared.
     It was the only non-blocking dialog in the codebase, which meant every
     other surface that wanted to ask something either reimplemented it or
     reached for window.confirm — and one of those (the rename prompt) froze
     the tab in the b372 FTUE run. The markup contract is unchanged
     (#hr-confirm-overlay / [data-hrc]), so tests/slot-switch.mjs answers it
     exactly as before. The local body stays as a fallback ONLY for a build
     where dialog.js failed to load: still not a native dialog, because a
     native dialog is the bug. */
  function confirmDialog(opts){
    var D = window.HearthriseDialog;
    if(D && typeof D.confirm === 'function') return D.confirm(opts);
    var o = opts || {};
    return new Promise(function(resolve){
      if(typeof document === 'undefined' || !document.body){ resolve(false); return; }
      var prev = document.getElementById('hr-confirm-overlay');
      if(prev){ try { prev.remove(); } catch(e){} }
      var ov = document.createElement('div');
      ov.className = 'qm-overlay';
      ov.id = 'hr-confirm-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.innerHTML =
        '<div class="qm-modal hr-confirm" style="position:relative;max-width:440px">' +
          '<h3 style="margin:0 0 6px">' + esc(o.title || 'Are you sure?') + '</h3>' +
          '<div class="hr-confirm-body" style="margin:0 0 16px">' + esc(o.body || '') + '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">' +
            '<button class="btn btn-sm" data-hrc="no">' + esc(o.cancelLabel || 'Cancel') + '</button>' +
            '<button class="btn btn-sm btn-primary" data-hrc="yes">' + esc(o.confirmLabel || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';
      var done = false;
      function finish(v){
        if(done) return;
        done = true;
        try { document.removeEventListener('keydown', onKey, true); } catch(e){}
        try { ov.remove(); } catch(e){}
        resolve(!!v);
      }
      function onKey(e){
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
        else if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
      }
      ov.addEventListener('click', function(e){
        var btn = (e.target && e.target.closest) ? e.target.closest('[data-hrc]') : null;
        if(btn){ finish(btn.getAttribute('data-hrc') === 'yes'); return; }
        if(e.target === ov) finish(false);              // backdrop = cancel
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
      try { ov.querySelector('[data-hrc="yes"]').focus(); } catch(e){}
    });
  }

  /* Flush the CURRENT character to the cloud before its save is set aside.
     Returns a NAMED OUTCOME and never a game value: 'ok' | 'skipped' (no
     transport wired — signed out, or the harness) | 'timeout' | 'error'.

     The timeout is a real timer racing the request, NOT a check performed after
     it resolves: a transport that never resolves must not be able to hold this
     open, which is the entire point. Nothing here blocks the main thread — the
     pending request is simply abandoned to whatever it eventually does. */
  function flushCurrentCharacter(timeoutMs){
    return new Promise(function(resolve){
      var S = (typeof window !== 'undefined') && window.HearthriseSync;
      if(!S || typeof S.snapshotIfDue !== 'function'){ resolve('skipped'); return; }
      var settled = false;
      var timer = setTimeout(function(){
        if(settled) return;
        settled = true;
        resolve('timeout');
      }, Math.max(1, timeoutMs || SWITCH_FLUSH_TIMEOUT_MS));
      var p;
      try { p = S.snapshotIfDue(true, false); }
      catch(e){ settled = true; clearTimeout(timer); resolve('error'); return; }
      Promise.resolve(p).then(function(){
        if(settled) return; settled = true; clearTimeout(timer); resolve('ok');
      }, function(){
        if(settled) return; settled = true; clearTimeout(timer); resolve('error');
      });
    });
  }

  /* One switch at a time. A second click while the first is waiting on the
     network used to be free to re-enter the whole path. */
  var _switching = false;
  function isSwitching(){ return _switching; }

  /* ══════════════════════════════════════════════════════════════════════
     b372 — THE SAVE QUIESCE LATCH. THE SWITCH DUPLICATED THE CHARACTER.

     REPORTED LIVE (Tyler, FTUE run on b371): switching to hero slot 1 produced
     a COPY of the slot-0 character in slot 1, and destroyed the save that had
     been there. Three writes, one race:

       1. switchSlot() copies the outgoing character into charKey(outgoing),
          MOVES profile.activeSlot to the target, and — for an empty target —
          REMOVES SAVE_KEY so the engine boots a fresh character.
       2. location.reload() then fires `pagehide`, and the page still holds the
          OUTGOING character in memory as `window.G`:
            · legacy.js  pagehide -> saveLocal()            rewrites SAVE_KEY
              with the outgoing G — the removal in (1) is undone;
            · net/sync.js pagehide -> snapshotIfDue(true,true) uploads that same
              outgoing G, and buildSnapshotRequest resolves the slot LIVE, so it
              lands on the TARGET slot's game_saves row.
       3. Boot reads that "newer" local clone, decideRestore prefers it over the
          target's older cloud row, and the next autosave cements the clone.

     Neither write is needed for durability: switchSlotAsync has ALREADY done a
     synchronous saveLocal() and an AWAITED cloud flush of the outgoing
     character before anything is swapped, and refuses to swap at all if that
     flush times out. During a switch these handlers carry no information and
     nothing but hazard, so the switch QUIESCES them.

     The latch is armed at the last instant before the pointer moves and is held
     THROUGH the reload (the reload resets it: a fresh page has no latch). It
     is NOT the `_switching` busy latch — that one is cleared in the promise
     tail, which runs as a microtask BEFORE unload, i.e. before the very
     handlers this has to stop.

     SELF-HEALING BY AGE, not by a timer. A latch that somehow outlived its
     reload (reload blocked, an exception between arm and navigate) would
     silently disable local saves — trading one data-loss bug for a worse one.
     After QUIESCE_MAX_MS it simply stops being believed. */
  var QUIESCE_MAX_MS = 15000;
  var _quiesce = null;          // {slot:<OUTGOING slot>, at:<ms>} | null
  function beginQuiesce(outgoingSlot){ _quiesce = { slot: outgoingSlot|0, at: Date.now() }; }
  function endQuiesce(){ _quiesce = null; }
  function saveQuiesced(){
    if(!_quiesce) return false;
    if(Date.now() - _quiesce.at > QUIESCE_MAX_MS){ _quiesce = null; return false; }
    return true;
  }
  /* The slot the in-memory G actually BELONGS to while quiesced — the outgoing
     character. Any write that still escapes (a snapshot already in flight when
     the pointer moved) must be addressed to this, never to the target. */
  function quiescedOutgoingSlot(){ return saveQuiesced() ? _quiesce.slot : null; }

  /* ── THE SWITCH, ASYNC AND BOUNDED (b371) ──────────────────────────────
     ORDER IS THE DESIGN. Nothing is swapped until the current character is
     safely flushed, so a server that never answers leaves the player exactly
     where they were — responsive, unchanged, and told why — instead of
     half-switched behind a frozen tab. Hearthrise is online-only by rule
     (CLAUDE.md, "Server authority"), so refusing to switch while the server is
     unreachable is the correct answer, not a degradation.

     Returns a verdict object; it never throws and it always clears the busy
     latch, including on an unexpected throw. */
  function switchSlotAsync(slotId, opts){
    var o = opts || {};
    if(_switching) return Promise.resolve({ ok:false, reason:'busy' });
    var profile = window.HearthriseProfile && window.HearthriseProfile.profile;
    if(!profile) return Promise.resolve({ ok:false, reason:'no-profile' });
    if(slotId === profile.activeSlot) return Promise.resolve({ ok:false, reason:'already-active' });
    if(!ownsSlot(slotId)){        // b371/b50x: the ENTITLEMENT (server first), not the local cache
      notifySafe('Slot not unlocked', 'kill');
      return Promise.resolve({ ok:false, reason:'locked' });
    }
    _switching = true;
    try { if(typeof document !== 'undefined' && document.body) document.body.classList.add('hr-switching'); } catch(e){}
    notifySafe('Saving your character…', 'levelup');
    /* Local durability first: synchronous, cheap, and the one step no server
       can take away. */
    try { if(typeof window.saveLocal === 'function') window.saveLocal(); } catch(e){}

    return flushCurrentCharacter(o.timeoutMs || SWITCH_FLUSH_TIMEOUT_MS).then(function(res){
      if(res === 'timeout' || res === 'error'){
        notifySafe('Couldn’t switch characters — the server isn’t responding. '
          + 'Your progress is saved on this device. Try again in a moment.', 'kill');
        return { ok:false, reason:'flush-' + res };
      }
      /* b372 — ARM BEFORE THE POINTER MOVES. Everything the outgoing character
         needed is already on disk (the saveLocal above) and in the cloud (the
         flush we just awaited); from here until the page is replaced, any save
         or snapshot would be the outgoing G written under the INCOMING slot. */
      beginQuiesce(profile.activeSlot);
      var p = switchSlot(slotId);
      if(!p){
        endQuiesce();                      // no swap happened — normal saving resumes
        notifySafe('Couldn’t switch characters — try again.', 'kill');
        return { ok:false, reason:'swap-failed' };
      }
      /* b372 TEST SEAM — the ONLY way to observe the transition window from
         outside. Between the swap and the reload the page is in a state no
         caller can otherwise reach (the reload is `location.reload()`, which
         cannot be stubbed), and that window is precisely where the duplication
         bug lived. The regression test fires `pagehide` here, exactly as the
         browser does during the reload. Never passed in production. */
      if(typeof o.duringTransition === 'function'){ try { o.duringTransition(); } catch(e){} }
      if(!o.noReload && typeof location !== 'undefined' && location.reload){
        /* HELD deliberately: pagehide fires during this navigation and the
           latch is what makes it harmless. The new page starts unlatched. */
        location.reload();
        return { ok:true, reason:'flush-' + res };
      }
      /* No reload — the b342 guard's seam and the suite's. There is no teardown
         to protect, and G is about to be re-pointed by the caller, so the latch
         must not linger and suppress that character's saves. */
      endQuiesce();
      return { ok:true, reason:'flush-' + res };
    }).catch(function(e){
      notifySafe('Couldn’t switch characters — try again.', 'kill');
      return { ok:false, reason:'threw', error:String((e && e.message) || e) };
    }).then(function(r){
      _switching = false;
      try { if(typeof document !== 'undefined' && document.body) document.body.classList.remove('hr-switching'); } catch(e){}
      return r;
    });
  }

  // ── Switching characters ──────────────────────────────────────
  // Saves current G into the active slot, then loads the requested slot.
  // Returns the new profile object on success.
  //
  // SYNCHRONOUS AND LOCAL-ONLY BY DESIGN — this is the key swap and nothing
  // else. It is called BY switchSlotAsync (which owns the flush, the timeout
  // and the player-facing failure) and directly by the b342 save-slot guard.
  // Do not put a network call, a dialog, or a wait of any kind in here.
  function switchSlot(slotId){
    var profile = window.HearthriseProfile && window.HearthriseProfile.profile;
    if(!profile) return null;
    if(!ownsSlot(slotId)){        // b371/b50x: the ENTITLEMENT (server first), not the local cache
      if(typeof window.notify === 'function') window.notify('Slot not unlocked', 'kill');
      return null;
    }
    // Snapshot current character.
    if(typeof window.G !== 'undefined' && typeof window.saveLocal === 'function'){
      window.saveLocal();
      // saveLocal writes to SAVE_KEY; copy that into the active slot.
      var snap = localStorage.getItem(SAVE_KEY);
      if(snap) localStorage.setItem(charKey(profile.activeSlot), snap);
    }
    profile.activeSlot = slotId;
    saveProfile(profile);
    // Now load the new slot's data into SAVE_KEY so the engine picks
    // it up on reload.
    var nextSnap = localStorage.getItem(charKey(slotId));
    if(nextSnap){
      localStorage.setItem(SAVE_KEY, nextSnap);
    } else {
      // First time activating this slot — clear so engine creates fresh.
      localStorage.removeItem(SAVE_KEY);
    }
    return profile;
  }

  /* ══════════════════════════════════════════════════════════════════════
     b371 — THE GEM DUPE: TWO STORES THAT DIVERGE.

     REPORTED LIVE: a 200-gem purchase of slot 2 debited `G.gems`, a cloud
     restore then reverted gems to the pre-purchase value — and the SLOT STAYED
     UNLOCKED. The purchase became free.

     THE CAUSE IS NOT THE RESTORE. It is that the two halves of one transaction
     lived in two different stores with two different lifetimes:

        gems      -> G -> hearthbound-save-v2 -> the CLOUD snapshot (restorable)
        the slot  -> localStorage['hearthrise:profile'] (device-local, never
                     uploaded, never restored, never rolled back)

     Any event that rewinds one and not the other mints an entitlement. A cloud
     restore is only the loudest such event; a failed save (production was
     failing saves at the time), a device switch, or a manual save-file restore
     all do it. Repainting the chip or saving harder does not fix this — the two
     values have to be ONE record.

     THE FIX: the ENTITLEMENT MOVES INTO THE SNAPSHOT. `G.heroSlotsUnlocked` is
     the authority on how many hero slots this account owns; the profile record
     keeps only per-character METADATA (names, levels, lastSeen) and its
     `unlockedSlots` field is a cache that is never consulted once G has the
     answer. Gems and the slot now rewind together because they are the same
     bytes. `snapshot()` is a DENYLIST, so this field syncs by default — which
     is the safe direction and requires nothing in src/net.

     THE PURCHASE IS ATOMIC-OR-NOTHING: debit and entitlement are applied to G
     together, the save is written AND READ BACK to prove it landed, and only a
     verified write is allowed to touch the profile record. A save that fails —
     the exact production condition — rolls the whole thing back and charges
     nothing.

     ⚠ THE CORRECT END STATE IS SERVER-SIDE, and this is not it. See the
     "hero-slot purchase" note in the report / DISCOVERIES: the real fix is one
     server intent (`hr_buy_hero_slot`) that debits gems and records the unlock
     in ONE transaction, with the client sending an intent and rendering the
     result. This change makes the client half impossible to desync; it does not
     make it authoritative, and a determined client can still forge either half.
     ══════════════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════════════
     THE SERVER OWNS THE ENTITLEMENT NOW (2026-09-08-hero-slot-buy.sql).

     The block above ends by naming the fix: "the real fix is one server intent
     (`hr_buy_hero_slot`) that debits gems and records the unlock in ONE
     transaction, with the client sending an intent and rendering the result."
     This is the client half of that, and the ⚠ note above is now DISCHARGED —
     a determined client can no longer forge either half.

     hr_state_of projects the ACCOUNT's owned slot set as a top-level
     `hero_slots` array; src/net/accrue.js reconcileHeroSlots puts it in
     `G._heroSlots` — deliberately NOT into `G.heroSlotsUnlocked`. Keeping the
     two apart IS the fix: the residue is a self-authored number a cloud restore
     can rewind while the entitlement it paid for stays granted (the b371 dupe
     above), so merging the server's answer into it would leave this module
     unable to tell "the server says you own this" from "a local field says so"
     — and the Buy button would go straight back to being lit before anything is
     known, which is the OTHER live defect this closes.

     THREE STATES, and the third is the one the old code could not express:
       · the server has answered  → its set is the authority, full stop;
       · it has not answered YET  → the residue is a HINT for LISTING the heroes,
                                    and nothing may be BOUGHT (slotRows() carries
                                    `serverKnown` so both renderers agree);
       · a forged residue         → buys nothing and unlocks nothing, because
                                    ownsSlot() prefers the server's set. ══════ */

  /* How long "we have not heard yet" is still an honest thing to say. After it,
     a locked row stops claiming to be checking and says it is unavailable —
     because a button that says "checking…" forever is a lie, and a lie the
     player cannot act on is only marginally better than the lit-and-dead button.
     Self-healing: the moment an envelope arrives, the row goes live. */
  var SERVER_WAIT_MS = 20000;
  var _armedAt = Date.now();

  /** The SERVER's owned set, or null if it has not answered. Never throws. */
  function serverSlots(){
    try {
      var g = (typeof window !== 'undefined') && window.G;
      var h = g && g._heroSlots;
      if(!h || !Array.isArray(h.owned) || !h.owned.length) return null;
      return h.owned;
    } catch(e){ return null; }
  }
  function serverKnown(){ return serverSlots() !== null; }
  /** Are we still inside the honest "checking" window? */
  function serverWaiting(){ return !serverKnown() && (Date.now() - _armedAt) < SERVER_WAIT_MS; }

  /* Adopt a set the server just handed us — from the boot envelope (through
     reconcileHeroSlots) or straight off a purchase receipt, so the drawer
     repaints on the ANSWER rather than on the next accrual. ONE home for the
     projection, so there is only ever one thing to keep in step. */
  function adoptServerSlots(list){
    if(!Array.isArray(list)) return false;
    var out = [];
    for(var i = 0; i < list.length; i++){
      var v = Number(list[i]);
      if(v === Math.floor(v) && v >= 0 && v < MAX_SLOTS && out.indexOf(v) < 0) out.push(v);
    }
    if(out.indexOf(0) < 0) out.push(0);   // slot 0 is free; a set without it is a partial
    out.sort(function(a,b){ return a - b; });
    try {
      var g = (typeof window !== 'undefined') && window.G;
      if(!g) return false;
      g._heroSlots = { owned: out, at: Date.now() };
      return true;
    } catch(e){ return false; }
  }

  /* The DEVICE-LOCAL hint — i.e. everything unlockedCount() used to be, kept
     verbatim as the pre-envelope fallback and as the WHOLE answer on a build
     where gems are not yet server-of-record. */
  function residueCount(){
    var g = (typeof window !== 'undefined') && window.G;
    var n = g && g.heroSlotsUnlocked;
    if(typeof n === 'number' && n >= 1 && n <= MAX_SLOTS) return n | 0;
    var p = window.HearthriseProfile && window.HearthriseProfile.profile;
    var q = p && p.unlockedSlots;
    return (typeof q === 'number' && q >= 1 && q <= MAX_SLOTS) ? (q | 0) : 1;
  }

  /* MEMBERSHIP, which is the honest question — "does this account own slot N".
     The server's set can legitimately have a HOLE (a grandfathered character on
     slot 3 with nothing bought below it — hr_hero_slots_of counts an existing
     character as ownership), and a COUNT cannot express one. */
  function ownsSlot(n){
    if(typeof n !== 'number' || n < 0 || n >= MAX_SLOTS) return false;
    var s = serverSlots();
    if(s) return s.indexOf(n | 0) >= 0;
    return (n | 0) < residueCount();
  }

  /* THE ONE ANSWER to "how many hero slots does this account own". Server first,
     always; the device-local record only while the server has not answered.
     Deliberately the CONTIGUOUS PREFIX of the server's set rather than its size,
     so a hole cannot inflate the count — "which slot is next in the ladder" and
     "do I own THIS slot" are different questions, and ownsSlot() answers the
     second one. */
  function unlockedCount(){
    var s = serverSlots();
    if(s){
      var k = 0;
      while(k < MAX_SLOTS && s.indexOf(k) >= 0) k++;
      return Math.max(1, k);
    }
    return residueCount();
  }

  /* One-time adoption for accounts that bought slots before the entitlement
     lived in the save. Runs at init(), writes the field, and after that the
     device-local number is never the authority again. */
  function adoptUnlockedIntoSave(profile){
    var g = (typeof window !== 'undefined') && window.G;
    if(!g || !profile) return;
    if(typeof g.heroSlotsUnlocked === 'number' && g.heroSlotsUnlocked >= 1) return;
    var n = profile.unlockedSlots;
    g.heroSlotsUnlocked = (typeof n === 'number' && n >= 1 && n <= MAX_SLOTS) ? (n | 0) : 1;
    try { if(typeof window.saveLocal === 'function') window.saveLocal(); } catch(e){}
  }

  // ── Slot purchases ────────────────────────────────────────────
  /* ⚠ unlockSlot IS THE PRE-ARM PATH AND ONLY THE PRE-ARM PATH.
     It is left byte-for-byte as it was, for the same reason legacy.js buyTrait()
     keeps its local branch: it is what runs on a build where the client still
     owns `gems` (clientMayWriteRecordField('gems') === true), and it is what the
     b371 atomicity regressions grade. Under the LIVE gems arm nothing reaches it
     — buySlot() routes to the server verb instead — and even if something did,
     the entitlement it writes into G.heroSlotsUnlocked is no longer the
     authority: ownsSlot() prefers the server's set, so a forged residue unlocks
     nothing. Do NOT wire a new caller to this. */
  function unlockSlot(slotId){
    var profile = window.HearthriseProfile.profile;
    var owned = unlockedCount();
    if(slotId !== owned) return { ok:false, reason:'Must unlock slots in order' };
    if(slotId >= MAX_SLOTS) return { ok:false, reason:'Max slots reached (' + MAX_SLOTS + ')' };
    var G = window.G;
    if(!G) return { ok:false, reason:'The game is still loading — try again in a moment' };
    var cost = SLOT_COSTS_GEMS[slotId] || 0;
    // Hearth Hall Premium grants 3 of the 4 paid slots free (slots 1, 2, 3).
    var hasPremium = profile.entitlements && profile.entitlements.hearthHall;
    var freeFromPremium = hasPremium && slotId >= 1 && slotId <= 3;
    if(!freeFromPremium && !window.balCanAfford(cost, 'gems')){
      return { ok:false, reason: window.balKnown('gems') ? ('Need ' + cost + ' gems')
        : window.balShortfall(cost, 'gems') };
    }

    // ── 1. debit + entitlement, TOGETHER, in the one store that restores ──
    var prevGems = G.gems, prevUnlocked = G.heroSlotsUnlocked;
    if(!freeFromPremium) G.gems -= cost;
    G.heroSlotsUnlocked = slotId + 1;

    /* ── 2. PROVE IT LANDED. Not "call saveLocal and hope": read the blob back
           and check BOTH halves are in it. Production was failing saves when
           this dupe was reported — a write we did not verify is exactly how the
           entitlement outlived the payment. */
    var durable = false;
    try {
      var blobRetired = false;
      try { blobRetired = !!(window.HearthriseCapstone && window.HearthriseCapstone.isBlobRetired()); } catch(e){}
      if (blobRetired) {
        /* b459 (suite catch SLOT-BUY-1): under the capstone the local blob is
           retired — saveLocal is a deliberate no-op and the read-back below can
           never succeed, which made EVERY slot purchase roll back ("Couldn't
           save your purchase"). Under arm the durable store is the SERVER:
           heroSlotsUnlocked rides the residue save (buildResiduePatch → the
           hardened putClientState) and gems are a record field whose spend is
           reconciled by the envelope. The blob proof is not weakened — it is
           MOOT: there is no local blob for the entitlement to outlive the
           payment in. The b371 dupe this proof stopped was a LOCAL-blob split;
           the armed model cannot express that split. */
        durable = true;
      } else {
        if(typeof window.saveLocal === 'function') window.saveLocal();
        var raw = localStorage.getItem(SAVE_KEY);
        if(raw){
          var d = JSON.parse(raw);
          durable = (d.gems === G.gems) && (d.heroSlotsUnlocked === G.heroSlotsUnlocked);
        }
      }
    } catch(e){ durable = false; }

    if(!durable){
      // ── ROLLBACK. Nothing was charged and nothing was granted. ──
      G.gems = prevGems;
      G.heroSlotsUnlocked = prevUnlocked;
      try { if(typeof window.saveLocal === 'function') window.saveLocal(); } catch(e){}
      try { if(typeof window.updateTopbar === 'function') window.updateTopbar(); } catch(e){}
      return { ok:false, reason:'Couldn’t save your purchase, so nothing was charged. Try again in a moment.' };
    }

    // ── 3. ONLY NOW the device-local metadata record ──────────────────────
    profile.unlockedSlots = G.heroSlotsUnlocked;      // cache, not authority
    if(!profile.slots.some(function(s){ return s.id === slotId; })){
      profile.slots.push({
        id: slotId,
        name: 'Adventurer ' + (slotId + 1),
        combatLv: 1, totalLv: 1,
        createdAt: Date.now(), lastSeen: Date.now(),
      });
    }
    saveProfile(profile);
    /* b371 — AND REPAINT. The header gem chip used to keep showing the
       pre-purchase number until a full reload (reported: chip 1006, G.gems 806)
       because nothing told the topbar its balance had changed. Same two-line
       pairing every other gem sink already does — see buyCosmetic in legacy.js. */
    try { if(typeof window.updateTopbar === 'function') window.updateTopbar(); } catch(e){}
    if(typeof window.notify === 'function') window.notify('Unlocked slot ' + (slotId+1) + (freeFromPremium ? ' (Premium)' : ' for ' + cost + ' gems'), 'levelup');
    return { ok: true };
  }

  /* ── THE BUY ACTION, SHARED (b371) ─────────────────────────────────────
     A premium-currency spend with no confirmation step was a misclick away from
     costing a player 1,500 gems. Both surfaces that can buy a slot (the topbar
     drawer and Home's "Your heroes") route through THIS, for the same reason
     slotRows()/selectSlot() are shared: two copies of a confirmation are two
     things that drift, and the one that drifts is the one that stops asking.
     Returns the unlockSlot verdict, plus {cancelled:true} when the player
     declined — so a caller can tell "no" apart from "failed". */
  function buySlot(slotId){
    var P = window.HearthriseProfile;
    var p = P && P.profile;
    if(!p) return Promise.resolve({ ok:false, reason:'No profile loaded' });
    var next = P.canUnlockNext();
    if(!next || next.slotId !== slotId){
      return Promise.resolve({ ok:false, reason:'Must unlock slots in order' });
    }
    var n = slotId + 1;
    var opts = next.free
      ? { title:'Unlock hero slot ' + n + '?',
          body:'Hero slot ' + n + ' is included with Hearth Hall Premium — unlocking it costs you nothing.',
          confirmLabel:'Unlock', cancelLabel:'Not now' }
      : { title:'Spend ' + next.cost + ' gems?',
          body:'Unlock hero slot ' + n + ' for ' + next.cost + ' gems. Gems are premium currency and this '
             + 'purchase cannot be undone.',
          confirmLabel:'Buy slot ' + n, cancelLabel:'Not now' };
    return confirmDialog(opts).then(function(yes){
      if(!yes) return { ok:false, cancelled:true, reason:'cancelled' };
      /* ── THE FORK (2026-09-08-hero-slot-buy.sql) ────────────────────────
         `mayWrite === false` means the gem balance has MOVED HOME: it is
         player_state.gems, and a local `G.gems -= cost` would be a
         client-authored debit the next envelope reconciles away while the slot
         stayed granted — which is the b371 dupe, and which is exactly what this
         path has been doing in production since gems were armed. The server verb
         is hr_buy_hero_slot; the confirm above still runs first, because a
         premium spend is never one click. */
      var mayWrite = (typeof window.clientMayWriteRecordField !== 'function')
        || window.clientMayWriteRecordField('gems');
      if(!mayWrite) return serverBuySlot(slotId);
      return unlockSlot(slotId);
    });
  }

  /* The honest toast for each machine code hr_buy_hero_slot can answer. Named
     per error rather than one opaque "unavailable" (the b494 voice): a player
     told "you cannot afford it" when the real answer is "sign in" files the
     wrong bug, and this surface's entire failure mode for the last several
     builds was a button that said nothing at all. */
  var SLOT_BUY_TOASTS = {
    unknown_slot:           'That hero slot is not for sale',
    bad_slot:               'That hero slot does not exist',
    already_owned:          'You already own that hero slot',
    requires_previous_slot: 'Unlock the slot before it first',
    insufficient_gems:      'Not enough gems',
    hero_slot_daily_cap:    'That is enough new heroes for today',
    no_character:           'Your character is still loading — try again in a moment',
    no_account:             'Your account is still loading — try again in a moment',
    intent_mismatch:        'That went out twice — try again in a moment',
    rate_limited:           'Slow down a moment, then try again',
    not_signed_in:          'Sign in to unlock hero slots',
    rpc_missing:            'Hero slots are unavailable right now',
    no_config:              'Hero slots are unavailable right now',
    network:                'No connection — your unlock did not go through',
    bad_response:           'The server is busy — try that again in a moment'
  };
  function slotBuyToast(res){
    var code = String((res && res.error) || '');
    if(code === 'insufficient_gems' && res && typeof res.short_by === 'number'){
      return 'Not enough gems — you need ' + res.short_by + ' more';
    }
    if(SLOT_BUY_TOASTS[code]) return SLOT_BUY_TOASTS[code];
    return 'Hero slots are unavailable right now';
  }

  /* ── THE SERVER PURCHASE ───────────────────────────────────────────────
     Sends a SLOT ID and nothing else. No price, no currency, no "free" flag:
     hr_buy_hero_slot reads the gem cost, the ladder order and the Hearth Hall
     waiver from its own catalogue under a per-account advisory lock, debits the
     ACTIVE character's server-owned gems and writes the ownership row in ONE
     transaction. NOTHING LOCAL IS DEBITED HERE, not even optimistically — the
     server owns the balance, and the client renders what comes back.

     ONE PURCHASE IN FLIGHT PER SLOT. A double tap must not spend two intent keys
     on one gesture: the second would be refused `already_owned` and read to the
     player as a failure. */
  var _buyingSlot = {};
  function serverBuySlot(slotId){
    var GC = window.HearthriseGoalClaim;
    if(!GC || typeof GC.buyHeroSlot !== 'function'){
      return Promise.resolve({ ok:false, reason: SLOT_BUY_TOASTS.rpc_missing });
    }
    if(_buyingSlot[slotId]){
      return Promise.resolve({ ok:false, cancelled:true, reason:'already in flight' });
    }
    _buyingSlot[slotId] = true;
    var p;
    try { p = GC.buyHeroSlot(slotId); } catch(e){ p = null; }
    if(!p || typeof p.then !== 'function'){
      _buyingSlot[slotId] = false;
      return Promise.resolve({ ok:false, reason: SLOT_BUY_TOASTS.rpc_missing });
    }
    return Promise.resolve(p).then(function(res){
      /* ADOPT THE SERVER'S WHOLE SET, on success AND on already_owned — both
         answers carry it, and `already_owned` means our picture was stale rather
         than that anything failed. */
      if(res && Array.isArray(res.hero_slots)) adoptServerSlots(res.hero_slots);

      if(res && res.ok === true){
        /* METADATA ONLY. `profile.unlockedSlots` is a CACHE that improves the
           pre-envelope render on the next cold boot; it is never consulted once
           the server has answered (see unlockedCount). The ENTITLEMENT is the
           server's row, and this device does not get a vote on it. */
        var p2 = window.HearthriseProfile && window.HearthriseProfile.profile;
        if(p2){
          p2.unlockedSlots = Math.max(p2.unlockedSlots || 1, unlockedCount());
          if(!(p2.slots || []).some(function(s){ return s && s.id === slotId; })){
            (p2.slots = p2.slots || []).push({
              id: slotId, name: 'Adventurer ' + (slotId + 1),
              combatLv: 1, totalLv: 1, createdAt: Date.now(), lastSeen: Date.now()
            });
          }
          saveProfile(p2);
        }
        /* Pull the new balance from the server rather than believing the
           receipt: `res.gems` is for rendering, and the RECORD is what every
           affordability check reads. Fire-and-forget; the next envelope settles
           it either way. The topbar repaint is the b371 pairing — without it the
           gem chip shows the pre-purchase number until a reload. */
        try {
          if(window.HearthriseRecord && typeof window.HearthriseRecord.requestRecord === 'function'){
            var r = window.HearthriseRecord.requestRecord();
            if(r && r.catch) r.catch(function(){});
          }
        } catch(e){}
        try { if(typeof window.updateTopbar === 'function') window.updateTopbar(); } catch(e){}
        notifySafe('Unlocked Hero ' + (slotId + 1) + ' for '
          + (Number(res.cost) || SLOT_COSTS_GEMS[slotId] || 0) + ' gems', 'levelup');
        return { ok:true, server:true, heroSlots: res.hero_slots || null };
      }

      if(res && res.error === 'already_owned'){
        /* The server says the account already holds it — a stale local picture,
           not a failure. Adopt the truth and say so once. */
        notifySafe(SLOT_BUY_TOASTS.already_owned, 'info');
        return { ok:true, server:true, alreadyOwned:true, heroSlots: res.hero_slots || null };
      }
      return { ok:false, server:true, code:(res && res.error) || null, reason: slotBuyToast(res) };
    }).catch(function(){
      return { ok:false, server:true, reason: SLOT_BUY_TOASTS.network };
    }).then(function(r){
      _buyingSlot[slotId] = false;
      return r;
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     b373 — THE IDENTITY RULING: NAME, PORTRAIT AND CLAN ARE ACCOUNT-SCOPED.
     HEROES ARE SLOTS, NOT PEOPLE. (Designer, LIVE-AUDIT-2026-08-17 FTUE run 2
     finding 3 + finding 5.)

     WHAT THE AUDIT SAW. A brand-new character on slot 2 opened wearing the
     ACCOUNT's name ("TYLER"), the account's veteran portrait, and a clan tag
     ([TestClan]) it had never joined — while the surrounding UI (a per-slot
     "Rename", per-slot rows, a Characters modal) implied each hero owned its
     own identity. Worse, changing the portrait on one character changed it for
     all, because the portrait IS account-level. The screen and the model
     disagreed, and the model was the one that was right.

     THE RULING — ACCOUNT-SCOPED, and the UI stops pretending otherwise:

       NAME     Account. It is an ADDRESS, not a decoration: chat whispers it,
                the market attributes a listing by it, the leaderboard ranks by
                it, and `public.display_names.canonical` is a UNIQUE INDEX
                keyed to `auth.uid()` (src/features/identity.js §"WHY
                UNIQUENESS IS THE FEATURE"). Per-character names would multiply
                the namespace by five, hand one account five addresses to be
                confused between, and make impersonation cheaper — for a purely
                cosmetic gain. Refused.
       PORTRAIT Account. It is stored at a DERIVED path — avatars/<uid>/avatar
                .webp — precisely so the path can never disagree with who owns
                it. Per-character portraits mean a per-character key, a storage
                migration and a second sync surface.
       CLAN     Account. Clan membership, the seat and the deposit ledger are
                all keyed to the account server-side. Nothing to decide.

     WHAT IS ACTUALLY PER-CHARACTER, and this is the honest promise the
     Characters modal now makes: skills, inventory, gold, equipment, bound
     items, quests, farm — i.e. everything you PLAY. That is a real and
     complete separation and it is the reason slots exist.

     SO A HERO IS ADDRESSED BY ITS SLOT, not by a name. heroLabel() is the one
     writer of that label. It is deliberately DERIVED rather than stored, for a
     reason that is not tidiness: `hearthrise:profile` is DEVICE-LOCAL (see the
     block above unlockedCount) and never uploaded, so a stored per-hero
     nickname would silently vanish on the player's second device — a
     "per-character name" that does not survive the character. Better to have
     no nickname than a lying one.

     ⚠ SERVER FOLLOW-UP, NAMED AND NOT BUILT HERE: if per-hero nicknames are
     ever wanted, they need a server-side per-character label column on the
     character row (alongside the existing slot addressing in
     src/net/character.js) so they sync, plus the same profanity/charset rules
     `validateName()` already applies. That is a Systems + server change, not a
     client one, and this ruling does not block it — it just refuses to fake it
     with device-local storage. Raised in DISCOVERIES.md. */
  /* The shipped padlock from the icon atlas, with an honest empty fallback:
     until the atlas has loaded the frame is simply blank, which reads as
     "nothing here yet" rather than as a broken glyph box. */
  function atlasGlyph(key, fill){
    var IS = window.HearthriseIconSet;
    var p = IS && IS.path && IS.path(key);
    if(!p) return '';
    return '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="' + (fill || 'var(--ink-3)') + '" d="' + p + '"/></svg>';
  }
  function lockGlyph(){ return atlasGlyph('uiLock'); }
  function closeGlyph(){ return atlasGlyph('uiClose', 'var(--ink-2)'); }

  function heroLabel(slotId){
    var n = (typeof slotId === 'number' && slotId >= 0) ? (slotId + 1) : 1;
    return 'Hero ' + n;
  }

  // ── Snapshot the active slot's meta (combat lv, total lv, etc.) ──
  function refreshActiveMeta(){
    var profile = window.HearthriseProfile.profile;
    if(!profile || !window.G) return;
    var slot = profile.slots[profile.activeSlot];
    if(!slot) return;
    /* b373 — THE NAME NO LONGER RIDES ALONG. (Designer ruling: identity is
       ACCOUNT-scoped; see heroLabel() below.) This line used to copy
       `G.playerName` — which src/features/identity.js adopt() sets to the
       account's server-claimed display name — into the per-slot record. So
       every character an account played eventually renamed itself to the
       account's name, and the hero list showed "Tyler / Tyler / Tyler". The
       slot record keeps levels and lastSeen; the NAME is not its business. */
    slot.combatLv = (typeof window.getCombatLevel === 'function') ? window.getCombatLevel() : 1;
    slot.totalLv  = (typeof window.getTotalLevel === 'function') ? window.getTotalLevel() : 1;
    slot.lastSeen = Date.now();
    saveProfile(profile);
  }

  // ── Public API + side-effects ─────────────────────────────────
  window.HearthriseProfile = {
    profile: null,
    MAX_SLOTS: MAX_SLOTS,
    SLOT_COSTS_GEMS: SLOT_COSTS_GEMS,
    init: function(){
      var p = loadProfile();
      if(!p) p = migrateLegacySave();
      this.profile = p;
      /* b371 — move the entitlement into the save on first sight, so that from
         here on gems and hero slots rewind together. See unlockSlot's block. */
      try { adoptUnlockedIntoSave(p); } catch(e){}
      // Keep the slot meta fresh on every save tick.
      var origSave = window.saveLocal;
      if(typeof origSave === 'function' && !window.__profileSaveHooked){
        window.saveLocal = function(){
          var r = origSave.apply(this, arguments);
          try { refreshActiveMeta(); } catch(e){}
          return r;
        };
        window.__profileSaveHooked = true;
      }
      return p;
    },
    /* b339 — WHICH CHARACTER IS LIVE, published as an ANSWER rather than as a
       record other modules parse. src/net/{accrue,character}.js need it to
       address the right server-side character (they were hard-coded to slot 0,
       which meant a player on slot 2 ensured and accrued against slot 0). They
       must NOT read `profile.activeSlot` or the PROFILE_KEY themselves: a
       second reader of this record is a second thing to drift, and this module
       is the one that writes it.
       Falls back to the stored profile when `init()` has not run yet (the net
       modules can be wired before this script's init on a slow boot), and to 0
       when there is no profile at all — which is the pre-b339 behaviour and the
       only correct answer for an account that has never had a second slot. */
    activeSlot: function(){
      var p = this.profile || loadProfile();
      var s = p && p.activeSlot;
      /* b371 — DELIBERATELY *NOT* CLAMPED to the entitlement. This number is an
         ADDRESS: every net module uses it to name the server-side character
         whose save it reads and writes. If a restore rewinds the entitlement
         below the slot the player is currently on, silently re-addressing them
         to slot 0 would point the autosave at a different character's cloud row
         — a data-loss bug traded for a cosmetic one. The entitlement governs
         what can be BOUGHT and LISTED (see unlockedCount / slotRows /
         canUnlockNext / switchSlotAsync); it does not evict a player mid-session
         from the character they are playing. */
      return (typeof s === 'number' && s >= 0 && s < MAX_SLOTS) ? (s | 0) : 0;
    },
    unlockedCount: unlockedCount,
    /* ── THE SERVER-ENTITLEMENT SEAM (2026-09-08-hero-slot-buy.sql) ────────
       `ownsSlot` is the honest membership question and the one every gate in
       this module now asks; `unlockedCount` stays for the ladder and for callers
       that genuinely want a count. `adoptServerSlots` is how the hr_state_of
       projection gets in (src/net/accrue.js reconcileHeroSlots writes the same
       key; this is the explicit door for a purchase receipt and for the suite).
       `serverKnownSlots` is what the renderers use to stay honest about not
       knowing yet. */
    ownsSlot: ownsSlot,
    adoptServerSlots: adoptServerSlots,
    serverKnownSlots: serverKnown,
    switchSlot: switchSlot,
    switchSlotAsync: switchSlotAsync,
    isSwitching: isSwitching,
    /* b372 — the SAVE QUIESCE seam. legacy.js (saveLocal/loadLocal) and
       src/net/sync.js read these; nobody else derives the answer. See the long
       note on beginQuiesce() for the duplication bug they exist to stop. */
    saveQuiesced: saveQuiesced,
    quiescedOutgoingSlot: quiescedOutgoingSlot,
    confirmDialog: confirmDialog,
    flushCurrentCharacter: flushCurrentCharacter,
    SWITCH_FLUSH_TIMEOUT_MS: SWITCH_FLUSH_TIMEOUT_MS,
    unlockSlot: unlockSlot,
    buySlot: buySlot,
    /* b371 — CLAMPED. `p.slots` is device-local metadata that a cloud restore
       cannot rewind; the entitlement in the save can. A character row for a slot
       the account no longer owns is the free slot, still on screen. */
    listSlots: function(){
      var p = this.profile || loadProfile();
      if(!p) return [];
      /* MEMBERSHIP, not a count (2026-09-08): the server's owned set can have a
         hole, and `id < unlockedCount()` would drop a grandfathered hero above
         it. Same rule slotRows() applies, so the two cannot disagree. */
      return (p.slots || []).filter(function(s){ return ownsSlot(s.id); });
    },
    canUnlockNext: function(){
      var p = this.profile;
      if(!p) return null;
      /* THE FIRST SLOT THIS ACCOUNT DOES NOT OWN, asked as membership rather
         than derived from a count — the server's set can have a hole (a
         grandfathered character with nothing bought beneath it) and the ladder
         has to point at the first GAP, which is what hr_buy_hero_slot's
         `requires_previous_slot` will accept. */
      var nextId = 0;
      while(nextId < MAX_SLOTS && ownsSlot(nextId)) nextId++;
      if(nextId >= MAX_SLOTS) return null;
      /* ⚠ `free` IS DEVICE-LOCAL AND IS NOW DISPLAY-ONLY. Under the arm the
         Hearth Hall waiver is a fact about OWNERSHIP that the server decides
         (hr_hero_slots_of reads an `entitlement:hearthHall` flag row), so a
         waived slot arrives ALREADY OWNED and never reaches this function at
         all — which is why `free` is forced false once the server has spoken.
         Pre-envelope, and on a build where gems are still the client's, the old
         localStorage rule stands so nothing changes byte-for-byte. */
      var hasPremium = !serverKnown() && p.entitlements && p.entitlements.hearthHall;
      var free = hasPremium && nextId >= 1 && nextId <= 3;
      return {
        slotId: nextId,
        cost: free ? 0 : SLOT_COSTS_GEMS[nextId],
        free: !!free,
        serverKnown: serverKnown(),
      };
    },
    // b229 — ONE model of "what slots exist and what each row can do", read by
    // BOTH the topbar drawer and the Home "Your heroes" block so the two
    // surfaces cannot drift. Existing character rows first, then the locked /
    // buyable rows up to MAX_SLOTS. Rendering + wiring stay per-surface (Home
    // speaks hd-*, the drawer speaks cs-*); the DATA and the actions are shared.
    slotRows: function(){
      var p = this.profile || loadProfile();
      if(!p) return [];
      /* b371 — every count in here comes from the ENTITLEMENT (the save), not
         from the device-local record, so the list a player sees cannot outlive
         the gems they paid with. */
      var active = this.activeSlot();
      /* The character being PLAYED is always listed, even if a restore rewound
         the entitlement below it — see the note on activeSlot(). It still buys
         nothing: `canBuy` below keys on the entitlement alone. */
      var byId = {};
      (p.slots || []).forEach(function(s){ if(s && typeof s.id === 'number') byId[s.id] = s; });
      var rows = [];
      /* Driven by MEMBERSHIP rather than by the metadata list, in both
         directions. A restore can rewind the entitlement below the number of
         local character records (rows must disappear), and it can also raise it
         above them — a snapshot carried in from another device, or a slot bought
         on another device, owns slots this device has never seen metadata for,
         and those must still be listed and playable rather than silently
         missing. Asked per slot rather than as a count because the server's set
         can have a HOLE (a grandfathered character with nothing bought beneath
         it) and a count cannot express one. */
      var _srv = serverKnown();
      var _wait = serverWaiting();
      var buyNext = -1;
      for(var k = 0; k < MAX_SLOTS; k++){
        if(k === active || ownsSlot(k)){
          var s = byId[k] || { id:k, combatLv:1, totalLv:1, lastSeen:0 };
          rows.push({
            /* b373 — heroLabel(), never s.name. See the ruling on heroLabel. */
            kind: 'char', id: k, name: heroLabel(k),
            combatLv: s.combatLv || 1, totalLv: s.totalLv || 1,
            active: k === active, lastSeen: s.lastSeen,
          });
        } else if(buyNext < 0){
          buyNext = k;                    // the first GAP is the ladder's next rung
        }
      }
      for(var i = 0; i < MAX_SLOTS; i++){
        if(i === active || ownsSlot(i)) continue;
        /* ⚠ `free` IS DISPLAY-ONLY AND DEVICE-LOCAL. See canUnlockNext: under the
           arm the Hearth Hall waiver is decided SERVER-SIDE and a waived slot
           arrives already owned, so it renders as a hero row and never as a
           "free unlock" button. `hearthrise:profile` is localStorage that nothing
           in the shipped build ever writes — one devtools line used to be three
           free hero slots — so once the server has spoken, this claim is not
           consulted. */
        var hasPremium = !_srv && p.entitlements && p.entitlements.hearthHall;
        var free = hasPremium && i >= 1 && i <= 3;
        /* b465 — `canBuy` NEVER MEANT "you can buy this".
           It means "this is the next slot in order", and both renderers read it
           as permission: a brand-new account holding ONE gem was shown "200
           gems" with a lit, fully enabled Buy button. Pressing it did nothing
           useful — the spend path refuses — so the first premium surface a new
           player meets is a button that lies. Affordability is now carried in
           the ROW, beside the cost it is a judgement about, so the drawer and
           the Home rail cannot disagree about it. `afford` is null when the
           balance is UNKNOWN (server not yet heard from): unknown is not a
           shortfall, and a renderer must not paint it as one — the same
           distinction balShortfall() draws for gold. */
        var _cost = free ? 0 : SLOT_COSTS_GEMS[i];
        var _have = null;
        try {
          var _B = window.HearthriseBalance;
          _have = (_B && typeof _B.balanceNum === 'function')
            ? _B.balanceNum(window.G, 'gems')                       // null when UNKNOWN
            : ((window.G && typeof window.G.gems === 'number') ? window.G.gems : null);
          if (typeof _have !== 'number' || !isFinite(_have)) _have = null;
        } catch (e) { _have = null; }
        rows.push({
          kind: 'locked', slotId: i, free: !!free,
          cost: _cost, canBuy: (i === buyNext),
          afford: free ? true : (_have === null ? null : _have >= _cost),
          shortBy: (free || _have === null) ? 0 : Math.max(0, _cost - _have),
          /* ── THE HONEST BUTTON (2026-09-08) ─────────────────────────────
             `canBuy` still means only "this is the next rung in the ladder"
             (b465). What was missing is whether the SERVER can be asked at all:
             hr_buy_hero_slot is the only path that can complete a purchase now,
             and until hr_state_of has told us which slots this account owns we
             do not know that the verb is even deployed. Rendering a lit Buy in
             that state is the b465 lie in a new place — and it is precisely the
             live defect the play-gate found, where the click dead-ended through
             a confirm modal with no visible outcome.
               serverKnown === true   → the row is live (afford still governs);
               serverKnown === false  → the row is DISABLED. `waiting` splits
                 that into the two honest sentences: inside the first few
                 seconds we genuinely are still checking; after that the truthful
                 answer is "unavailable right now", not a spinner that never
                 resolves. Both renderers read these two fields, so the drawer
                 and the Home rail cannot disagree. */
          serverKnown: _srv,
          waiting: !_srv && _wait,
        });
      }
      return rows;
    },
    /* The shared switch action: confirm, flush-and-swap, reload. The reload is
       intentional — the engine boots from hearthbound-save-v2 and has no live
       save-swap seam (§1.4).

       b371 — NOW ASYNCHRONOUS, AND THAT IS THE FIX. It returns a
       Promise<boolean> (false = no-op: already active, declined, or the switch
       failed and the player was told). It used to return a bare boolean because
       every step in it was synchronous — including a `window.confirm()` that
       froze the whole renderer, which is the P0 this replaces. Callers must
       consume the promise; both in-repo call sites do. */
    selectSlot: function(id){
      var p = this.profile; if(!p) return Promise.resolve(false);
      if(id === p.activeSlot) return Promise.resolve(false);
      /* b373 — heroLabel(), so the confirm names the hero the same way the
         list, the drawer and Home do. It used to read the slot's stored name,
         which by then was the ACCOUNT's name on every row. */
      var nm = heroLabel(id);
      return confirmDialog({
        title: 'Switch character?',
        body: 'Switch to ' + nm + '? Your current character is saved first, and the game reloads.',
        confirmLabel: 'Switch', cancelLabel: 'Stay here',
      }).then(function(yes){
        if(!yes) return false;
        return switchSlotAsync(id).then(function(r){ return !!(r && r.ok); });
      });
    },
    timeSince: timeSince,
    esc: esc,
    /* b373 — the ONE writer of a hero's on-screen label. Exported so the
       Characters drawer, Home and the suite all read the same rule. */
    heroLabel: heroLabel,
  };

  // Initialize on DOMContentLoaded so legacy.js has loaded first.
  //
  // b224 ACCOUNT WALL: init() is not read-only. With no `hearthrise:profile`
  // present it runs migrateLegacySave(), which WRITES a profile and copies the
  // save into slot 0 — character-slot creation, on a device whose visitor has
  // not proved they own an account. Slots belong to an account now, so the
  // whole module (init, the migration, and the slot-select UI that can buy a
  // slot with gems) waits for the gate. Nothing here is deleted: signed in,
  // it behaves exactly as before.
  function start(){ window.HearthriseProfile.init(); injectUI(); }
  function arm(){
    if(document.readyState !== 'loading'){ setTimeout(start, 50); }
    else document.addEventListener('DOMContentLoaded', start);
  }
  if(window.HearthriseGate && typeof window.HearthriseGate.whenOpen === 'function') window.HearthriseGate.whenOpen(arm);
  else arm();

  // ── UI: character-select drawer ──────────────────────────────
  // Triggered by clicking the player avatar in the topbar.
  function injectUI(){
    if(document.getElementById('char-select-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'char-select-overlay';
    ov.className = 'char-select-overlay';
    ov.innerHTML = '<div class="cs-modal" id="cs-modal"></div>';
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    document.body.appendChild(ov);

    function close(){ ov.classList.remove('open'); }
    window.closeCharacterSelect = close;
    window.openCharacterSelect = function(){
      var p = window.HearthriseProfile.profile;
      if(!p) return;
      render();
      ov.classList.add('open');
    };

    function render(){
      var modal = ov.querySelector('#cs-modal');
      // b229: rows come from the SHARED model so the drawer and Home never
      // disagree about which slots exist or what each one costs.
      var rows = window.HearthriseProfile.slotRows();
      var html = rows.map(function(r){
        if(r.kind === 'char'){
          /* b373 — THE ACCOUNT PORTRAIT, DELIBERATELY, ON EVERY ROW.
             This was a 🧙 emoji per row: an emoji-as-art violation (Final
             Directive) and, worse, a lie of omission — it implied each hero had
             a face of its own that the game just hadn't drawn. Under the
             account-scoped ruling (see heroLabel) every hero genuinely wears the
             account's portrait, so showing it identically on every row is the
             TRUE picture, and the sub-copy below says why. `data-hr-avatar`
             enrols these in the b371 portrait registry, so a portrait changed
             while the drawer is open repaints them all at once. */
          return '<button class="cs-slot ' + (r.active?'active':'') + '" data-slot="' + r.id + '">' +
            '<div class="cs-slot-portrait"><img src="' +
              esc(window._playerAvatar || 'assets/avatars/placeholder-portrait.webp') +
              '" alt="" data-hr-avatar></div>' +
            '<div class="cs-slot-meta">' +
              '<div class="cs-slot-name">' + esc(r.name) + (r.active?' <span class="cs-active-pill">active</span>':'') + '</div>' +
              '<div class="cs-slot-stats">Cmb Lv <b>' + (r.combatLv||1) + '</b> · Tot Lv <b>' + (r.totalLv||1) + '</b></div>' +
              '<div class="cs-slot-since">' + (r.active ? 'now' : timeSince(r.lastSeen)) + '</div>' +
            '</div>' +
          '</button>';
        }
        return '<div class="cs-slot locked">' +
          /* b373 — glyph, not 🔒. Same Final Directive fix as the portrait row
             directly above; leaving one emoji on a modal we just de-emojified
             is how the rule erodes. */
          '<div class="cs-slot-portrait">' + lockGlyph() + '</div>' +
          '<div class="cs-slot-meta">' +
            '<div class="cs-slot-name">Hero ' + (r.slotId+1) + (r.free ? ' <span class="cs-pill premium">Premium</span>' : '') + '</div>' +
            /* b373 — "900 gems", not "900 💎". The last emoji on this modal. */
            '<div class="cs-slot-stats">' + (r.free ? 'Included with Hearth Hall' : (r.cost + ' gems')) + '</div>' +
          '</div>' +
          /* b465 — a Buy you cannot pay for is disabled, and says why. Unknown
             (afford === null) still offers the button: we do not know that they
             are short, and the spend path answers honestly if they are.
             2026-09-08 — and a Buy the SERVER cannot yet be asked about is
             disabled too. The purchase is hr_buy_hero_slot now; until the
             envelope has told us which slots this account owns, a lit button is
             the same lie in a new place (and was, live: it dead-ended through a
             confirm modal with no visible outcome). Checked FIRST, because "we
             do not know if this is possible" outranks "you are short". */
          (r.canBuy
            ? (!r.serverKnown
              ? '<button class="cs-buy" disabled title="Waiting for the server to confirm which '
                + 'heroes this account owns">' + (r.waiting ? 'Checking…' : 'Unavailable') + '</button>'
              : (r.afford === false
                ? '<button class="cs-buy" disabled title="You have ' + (r.cost - r.shortBy) + ' of ' + r.cost + ' gems">'
                  + 'Needs ' + r.shortBy + ' more gems</button>'
                : '<button class="cs-buy" data-buy="' + r.slotId + '">' + (r.free ? 'Unlock' : 'Buy') + '</button>'))
            : '<div class="cs-locked-tag">unlock the previous slot first</div>') +
        '</div>';
      }).join('');

      modal.innerHTML =
        /* b373 — the last literal glyph-character on this modal, swapped for
           the shipped atlas close icon (Final Directive: no emoji/dingbats as
           art). Falls back to the character only if the atlas has not loaded,
           so the modal can never render a dismissless box. */
        '<button class="cs-close" aria-label="Close">' + (closeGlyph() || '×') + '</button>' +
        '<h2>Characters</h2>' +
        /* b373 — the copy now states the SCOPE SPLIT in both directions,
           because the old sentence listed only what is separate and left the
           player to discover the account-level half by being surprised by it
           (audit: a fresh hero wearing the account's name, face and clan tag).
           Two clauses, one line, and nothing on screen contradicts either. */
        '<p class="cs-sub">Your name, portrait and clan belong to your account — every hero shares them. ' +
        'Skills, inventory, gold, equipment and quests are separate for each. Up to ' + MAX_SLOTS + ' heroes.</p>' +
        '<div class="cs-slots">' + html + '</div>';

      modal.querySelector('.cs-close').addEventListener('click', close);
      modal.querySelectorAll('.cs-slot[data-slot]').forEach(function(b){
        b.addEventListener('click', function(){
          var sid = parseInt(this.dataset.slot, 10);
          /* Shared switch action (confirm + flush + swap + reload). Resolves
             false when the tapped slot is already active, the player declined,
             or the switch could not complete — close the drawer then, so the
             player is never left staring at a modal that did nothing. */
          window.HearthriseProfile.selectSlot(sid).then(function(ok){ if(!ok) close(); })
            .catch(function(){ close(); });
        });
      });
      modal.querySelectorAll('.cs-buy[data-buy]').forEach(function(b){
        b.addEventListener('click', function(){
          var sid = parseInt(this.dataset.buy, 10);
          // b371: buySlot confirms first — a premium spend is never one click.
          window.HearthriseProfile.buySlot(sid).then(function(r){
            if(r && r.ok) render();
            else if(r && !r.cancelled && typeof window.notify === 'function') window.notify(r.reason, 'kill');
          }).catch(function(){});
        });
      });
    }

    // Hook the topbar avatar click → open character select.
    function wireAvatar(){
      var av = document.querySelector('.topbar .avatar, .topbar [class*="avatar"], #topbar-player');
      if(!av){ setTimeout(wireAvatar, 200); return; }
      if(av.__characterSelectWired) return;
      av.__characterSelectWired = true;
      av.style.cursor = 'pointer';
      av.title = 'Switch character';
      av.addEventListener('click', function(){
        if(typeof window.openCharacterSelect === 'function') window.openCharacterSelect();
      });
    }
    wireAvatar();
  }

  function timeSince(ts){
    if(!ts) return 'never';
    var s = (Date.now() - ts) / 1000;
    if(s < 60) return Math.floor(s) + 's ago';
    if(s < 3600) return Math.floor(s/60) + 'm ago';
    if(s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }

  console.log('[multi-character] loaded — max ' + MAX_SLOTS + ' slots');
})();
