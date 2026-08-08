// ============================================================
// src/save-migrations.js
//
// Versioned save-schema migration registry.
//
// Why this exists:
//   Pre-launch we mutated G.* shape constantly. Every change made
//   ad-hoc fix-ups inside loadLocal() (defaulting fields, renaming
//   keys, etc). That worked fine while we had ~5 beta testers, but
//   once real users have weeks-old saves we need a deterministic,
//   replayable, debuggable upgrade path.
//
// How it works:
//   1. Each save carries `G.v` (an integer schema version).
//   2. MIGRATIONS is an ordered list of {from, to, name, apply}
//      entries. `apply(save)` mutates the save object in place and
//      should be idempotent.
//   3. applyMigrations(save) walks the list, running every migration
//      whose `from` matches the save's current version, until the
//      save is at CURRENT_SCHEMA_VERSION.
//   4. legacy.js loadLocal() calls window.applyMigrations(parsed)
//      AFTER JSON.parse but BEFORE merging into G and BEFORE
//      processOffline() — so migrations run on a clean cleansed
//      object and offline catch-up runs against the up-to-date shape.
//
// Adding a migration:
//   - Bump CURRENT_SCHEMA_VERSION at the bottom.
//   - Push a new entry: {from: <old>, to: <new>, name: 'human-readable', apply: fn}
//   - apply() should ONLY touch fields that v<old> didn't have or
//     had wrong, and must tolerate missing nested objects.
//   - Idempotency: re-running apply() against an already-migrated
//     save must be a no-op. Use `if(save.foo == null) save.foo = ...`.
//
// Safety:
//   - Every migration runs inside a try/catch. A failure logs to
//     captureException() (if observability.js is loaded) and the
//     save is rolled back to a backup snapshot taken before the run.
//   - A backup of the pre-migration save is written to
//     `hearthrise:save-backup:v<n>` so we can recover bad migrations.
//
// Test from devtools:
//   window.dumpSaveBackups()  // see snapshot history
//   window.restoreSaveBackup('hearthrise:save-backup:v2')
// ============================================================

(function(){
  'use strict';

  var SAVE_KEY = 'hearthbound-save-v2';      // localStorage key (matches legacy.js)
  var CURRENT_SCHEMA_VERSION = 7;            // ← bump this when you add a migration

  // ── Migration registry ─────────────────────────────────────
  var MIGRATIONS = [
    {
      from: 1, to: 2,
      name: 'v1 → v2 (legacy bootstrap)',
      // No-op: anything still on v1 was already auto-converted by
      // legacy.js's LEGACY_KEY path. We register the slot so the
      // pipeline is contiguous and the version chain is documented.
      apply: function(save){
        if(save.v == null) save.v = 2;
      },
    },
    {
      from: 2, to: 3,
      name: 'v2 → v3 (analytics + dungeons + market backfill)',
      apply: function(save){
        // ── Multi-char & profile -- guarantee shape exists
        save.entitlements = save.entitlements || {};
        save.ownedThemes  = save.ownedThemes  || ['default'];
        save.ownedCosmetics = save.ownedCosmetics || [];

        // ── Dungeon system tracking (added with src/dungeons.js)
        if(!save.dungeonStats){
          save.dungeonStats = {
            clears: {},        // {dungeonId: count}
            fastestClear: {},  // {dungeonId: ms}
            lastEntry: {},     // {dungeonId: ts}
            scavRunsCompleted: 0,
            scavRunsBailed: 0,
          };
        }

        // ── Player market tracking (added with src/market.js)
        if(!save.marketStats){
          save.marketStats = {
            listed: 0,
            sold: 0,
            bought: 0,
            taxPaidGold: 0,
          };
        }

        // ── Bounty hunter shape: warrants must be an object
        save.bountyHunter = save.bountyHunter || {};
        if(typeof save.bountyHunter.warrants !== 'object' || !save.bountyHunter.warrants){
          save.bountyHunter.warrants = {};
        }

        // ── Settings: add new defaults that older saves are missing
        save.settings = save.settings || {};
        if(typeof save.settings.musicVolume !== 'number') save.settings.musicVolume = 0.7;
        if(typeof save.settings.sfxVolume   !== 'number') save.settings.sfxVolume   = 0.8;

        // ── Gem balance defensively to integer
        if(typeof save.gems === 'number') save.gems = Math.max(0, Math.floor(save.gems));
        else save.gems = 0;

        // ── Telemetry: stamp first-seen-on-v3 for analytics joins
        save.migratedToV3At = save.migratedToV3At || Date.now();
      },
    },
    {
      from: 3, to: 4,
      name: 'v3 → v4 (auto-actions + drop-log + plot-levels — Batch A foundations)',
      // Adds the three new state objects this roadmap depends on.
      // All defaults are SAFE (disabled / empty / level 1) — old saves
      // resume with no behavior change. Re-running this migration is
      // idempotent: each branch is gated by `if (save.field == null)`.
      apply: function(save){
        // Auto-action engine config (Batch A scaffold; B/C wire engines)
        if(save.autoActions == null){
          // b134 forward-compat: backfill from the pre-roadmap auto-eat
          // fields so existing players' setups carry over. If foodSlot
          // was set, treat it as their explicit choice + flip enabled.
          var legacyFoodId   = (typeof save.foodSlot === 'string') ? save.foodSlot : null;
          var legacyEatPct   = (typeof save.autoEatPct === 'number') ? save.autoEatPct : 0.5;
          save.autoActions = {
            eat:         {
              enabled:   !!legacyFoodId,
              threshold: legacyEatPct,
              foodId:    legacyFoodId,
            },
            trainGoal:   { enabled: false, skillId: null, targetLevel: null },
            farmReplant: { enabled: false, cropId: null },
          };
        }
        // Per-monster drop-log table (Batch A; F renders it)
        if(save.dropLog == null){
          save.dropLog = {};
        }
        // Plot upgrade level — gates farming crop unlocks (Batch C).
        // Default 1 means existing saves keep current Turnip-only state.
        if(save.plotLevels == null){
          save.plotLevels = 1;
        }
      },
    },
    {
      from: 4, to: 5,
      name: 'v4 → v5 (profile launchpad — Batch D foundations)',
      // Adds two state fields the Profile launchpad consumes:
      //   - lastActivity: tracks the most recently stopped skill or combat
      //     so the "Resume" card on Profile knows what to offer. null
      //     means there's nothing to resume — totally fine for new saves.
      //   - daily.snapshot: baseline numbers captured at midnight so
      //     Today's Progress can compute deltas (xp/gold/kills since
      //     local midnight). Initialised to today's current values so
      //     existing players don't see a giant "today's gain" on first
      //     reload — they correctly start from zero.
      apply: function(save){
        if(save.lastActivity == null) save.lastActivity = null;
        if(!save.daily) save.daily = { lastReset: null, tasks: [] };
        if(save.daily.snapshot == null){
          var dayKey = (new Date()).toDateString();
          var skills = save.skills || {};
          var totalXp = 0;
          var sk = Object.keys(skills);
          for(var i = 0; i < sk.length; i++) totalXp += (skills[sk[i]] | 0);
          var stats = save.stats || {};
          var inv = save.inventory || {};
          save.daily.snapshot = {
            dayKey: dayKey,
            xpTotal:       totalXp,
            gold:          save.gold | 0,
            kills:         stats.kills | 0,
            gathered:      stats.gathered | 0,
            harvested:     stats.harvested | 0,
            deedsDropped:  inv.farm_deed | 0,
          };
        }
      },
    },
    {
      from: 5, to: 6,
      name: 'v5 → v6 (auto-eat becomes a purchased trait — grandfather existing users)',
      // b217: auto-eat is now a gold-purchased trait gated in
      // HearthriseAuto.maybeAutoEat(). Existing players who already had it
      // enabled (or a legacy foodSlot) must NOT lose it, so grant the trait
      // ONCE here, on load, keyed on the save version. This runs only for
      // pre-v6 saves — a fresh player's save is stamped at the current
      // version and never enters this branch (and would have eat.enabled=false
      // anyway), so new players correctly have to buy it.
      apply: function(save){
        if(save.traits == null) save.traits = {};
        var hadAutoEat = (save.autoActions && save.autoActions.eat && save.autoActions.eat.enabled)
                       || (typeof save.foodSlot === 'string' && save.foodSlot);
        if(hadAutoEat && !save.traits.auto_eat){
          save.traits.auto_eat = true;
        }
      },
    },
    {
      from: 6, to: 7,
      name: 'v6 → v7 (farming: watered flag → waterings window list — un-sticks stalled plots)',
      // b220 (backlog #13): watering was a mandatory ready-gate with no
      // timeout, so any plot with watered:false NEVER matured. Auto-replant
      // and every Tomato regrow planted dry, which means a lot of live saves
      // are carrying permanently frozen crops right now.
      //
      // Growth is now derived from `plantedAt` + a list of watering
      // timestamps (see features/farm-progression.js growthHours):
      //   watered:true  → waterings:[plantedAt]  retro-credits one 2h window;
      //                                          the crop matures EARLIER than
      //                                          the player expected, never later.
      //   watered:false → waterings:[]           the crop starts finishing. If it
      //                                          is already past its grow time it
      //                                          goes ready on the next 5s tick.
      // `watered` is READ here and nowhere else. b220 also dual-wrote it as
      // "has an active window" so a rollback to b219 would not brick saves;
      // b222 deleted that write (b220 and b221 both shipped, so the rollback
      // target is long gone, and a write-only field is state that drifts).
      // This migration must KEEP reading it: pre-b220 saves still carry it,
      // and it is the only thing that tells us whether to retro-credit a
      // window. Do not delete this read.
      apply: function(save){
        if(!Array.isArray(save.farmPlots)) return;
        var now = Date.now();
        for(var i = 0; i < save.farmPlots.length; i++){
          var p = save.farmPlots[i];
          if(!p || typeof p !== 'object') continue;
          if(Array.isArray(p.waterings)) continue;         // idempotent
          if(typeof p.plantedAt !== 'number' || !isFinite(p.plantedAt)){
            // Corrupt plot — restart its clock rather than crash or stall.
            p.plantedAt = now;
            p.waterings = [];
            continue;
          }
          p.waterings = p.watered ? [p.plantedAt] : [];
        }
      },
    },
    // Future migrations go here. Example:
    // {
    //   from: 4, to: 5,
    //   name: 'v4 → v5 (rename foo to bar)',
    //   apply: function(save){
    //     if(save.foo != null && save.bar == null){
    //       save.bar = save.foo;
    //       delete save.foo;
    //     }
    //   },
    // },
  ];

  // ── Backup helpers ──────────────────────────────────────────
  function backupKey(version){ return 'hearthrise:save-backup:v' + version; }
  function snapshotBackup(version, raw){
    try { localStorage.setItem(backupKey(version), raw); } catch(e){}
    pruneOldBackups();
  }
  function pruneOldBackups(){
    // Keep only the 3 most recent backups so we don't fill localStorage
    try {
      var keys = [];
      for(var i=0; i<localStorage.length; i++){
        var k = localStorage.key(i);
        if(k && k.indexOf('hearthrise:save-backup:') === 0) keys.push(k);
      }
      if(keys.length > 3){
        keys.sort();
        while(keys.length > 3){ localStorage.removeItem(keys.shift()); }
      }
    } catch(e){}
  }

  window.dumpSaveBackups = function(){
    var out = {};
    try {
      for(var i=0; i<localStorage.length; i++){
        var k = localStorage.key(i);
        if(k && k.indexOf('hearthrise:save-backup:') === 0){
          try { out[k] = JSON.parse(localStorage.getItem(k)); }
          catch(e){ out[k] = '<unparseable>'; }
        }
      }
    } catch(e){}
    console.log('[migrations] backup snapshots:', out);
    return out;
  };
  window.restoreSaveBackup = function(key){
    var raw = localStorage.getItem(key);
    if(!raw){ console.warn('[migrations] no backup at', key); return false; }
    localStorage.setItem(SAVE_KEY, raw);
    console.log('[migrations] restored', key, '— reload the page to apply.');
    return true;
  };

  // ── Core: applyMigrations ───────────────────────────────────
  // Takes a parsed save object; returns the migrated object.
  // Migrations mutate in-place. If a migration throws, we roll back
  // to the snapshot taken before the pipeline started.
  function applyMigrations(save){
    if(!save || typeof save !== 'object'){ return save; }
    var startVersion = (typeof save.v === 'number' && save.v > 0) ? save.v : 1;

    if(startVersion >= CURRENT_SCHEMA_VERSION){
      // Already current — nothing to do.
      return save;
    }

    // Snapshot the original raw save before we mutate anything,
    // keyed by the version we're upgrading FROM.
    var originalRaw;
    try { originalRaw = JSON.stringify(save); } catch(e){ originalRaw = null; }
    if(originalRaw) snapshotBackup(startVersion, originalRaw);

    var v = startVersion;
    var ranNames = [];
    try {
      while(v < CURRENT_SCHEMA_VERSION){
        var step = null;
        for(var i=0; i<MIGRATIONS.length; i++){
          if(MIGRATIONS[i].from === v){ step = MIGRATIONS[i]; break; }
        }
        if(!step){
          throw new Error('No migration defined from v' + v + ' (target v' + CURRENT_SCHEMA_VERSION + ')');
        }
        step.apply(save);
        save.v = step.to;
        ranNames.push(step.name);
        v = step.to;
        // safety: prevent infinite loop on bad declaration
        if(step.to <= step.from){
          throw new Error('Migration "' + step.name + '" did not advance version (' + step.from + ' → ' + step.to + ')');
        }
      }
      console.log('[migrations] applied', ranNames.length, 'migration(s):', ranNames);
      // Track the upgrade in analytics if observability is up
      if(typeof window.trackEvent === 'function'){
        window.trackEvent('save_migrated', { from: startVersion, to: CURRENT_SCHEMA_VERSION, count: ranNames.length });
      }
      return save;
    } catch(err){
      console.error('[migrations] FAILED, rolling back:', err);
      if(typeof window.captureException === 'function'){
        window.captureException(err, { source: 'save-migrations', from: startVersion, ran: ranNames });
      }
      // Roll back: restore raw original on top of the parsed object.
      if(originalRaw){
        try {
          var fresh = JSON.parse(originalRaw);
          // Replace all keys on `save` with rolled-back versions
          for(var k in save){ if(Object.prototype.hasOwnProperty.call(save,k)) delete save[k]; }
          for(var k2 in fresh){ if(Object.prototype.hasOwnProperty.call(fresh,k2)) save[k2] = fresh[k2]; }
        } catch(_){}
      }
      // Surface to the player so they don't silently lose progress
      if(typeof window.notify === 'function'){
        window.notify('Save migration failed — running on old schema. Tap support if anything looks off.', 'warn');
      }
      return save;
    }
  }

  // ── Public API ──────────────────────────────────────────────
  window.applyMigrations = applyMigrations;
  window.HEARTHRISE_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
  window.HEARTHRISE_MIGRATIONS = MIGRATIONS;

  console.log('[migrations] registry loaded — current schema v' + CURRENT_SCHEMA_VERSION + ', ' + MIGRATIONS.length + ' migration(s) registered');
})();
