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
  var CURRENT_SCHEMA_VERSION = 3;            // ← bump this when you add a migration

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
    // Future migrations go here. Example:
    // {
    //   from: 3, to: 4,
    //   name: 'v3 → v4 (rename foo to bar)',
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
