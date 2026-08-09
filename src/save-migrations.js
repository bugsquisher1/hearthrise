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
  var CURRENT_SCHEMA_VERSION = 10;            // ← bump this when you add a migration

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
    {
      from: 7, to: 8,
      name: 'v7 → v8 (b226 pacing retune: per-skill gather counters, founder date, goal re-snapshot)',
      // Three things, all of them about not taking anything away.
      //
      // 1. PER-SKILL GATHER COUNTERS. Dailies, weeklies and achievements read
      //    ITEM-SPECIFIC collection counters ("Chop 500 logs" watched
      //    collection.normal_log), so a level-90 woodcutter cutting Duskwood
      //    made zero progress — the goals got harder the better you were. They
      //    now read stats.chopped / stats.mined / stats.fished. Those start at
      //    zero, which would have silently ERASED real achievement progress,
      //    so they are SEEDED from the collection log, which has always been a
      //    cumulative lifetime count. Nobody loses a step; a Duskwood chopper
      //    who was stuck on 0/500 usually gains several hundred.
      //    The id lists are frozen here on purpose: a migration must describe
      //    the world as it was, not import a table that will keep changing.
      //
      // 2. G.createdAt. Nothing ever stamped a creation date, so there is no
      //    way to tell a save that predates the retune from one made after it
      //    — which is exactly what the Founder's mark is gated on. Any save
      //    passing through this migration existed BEFORE the retune build by
      //    definition, so its best evidence of age is its own lastSeen, and a
      //    save with no lastSeen at all is older still.
      //
      // 3. The daily/weekly goal snapshots captured startValues against the
      //    OLD sources. Left alone, one day's goals would read as negative
      //    progress and sit at 0/N until UTC midnight. Dropping the snapshot
      //    re-rolls it cleanly on the next read.
      apply: function(save){
        var LOGS  = ['normal_log','oak_log','willow_log','maple_log','yew_log','runewood_log','duskwood_log'];
        var ORES  = ['copper_ore','iron_ore','coal','gold_ore','mithril_ore','emberstone_ore','dawnstone_ore'];
        var FISH  = ['shrimp','herring','trout','lobster','swordfish','frostfin','shark','moonfish'];
        var col = (save.collection && typeof save.collection === 'object') ? save.collection : {};
        function sum(ids){
          var t = 0;
          for(var i = 0; i < ids.length; i++){ var n = col[ids[i]]; if(typeof n === 'number' && isFinite(n) && n > 0) t += n; }
          return Math.floor(t);
        }
        if(!save.stats || typeof save.stats !== 'object') save.stats = {};
        if(typeof save.stats.chopped !== 'number') save.stats.chopped = sum(LOGS);
        if(typeof save.stats.mined   !== 'number') save.stats.mined   = sum(ORES);
        if(typeof save.stats.fished  !== 'number') save.stats.fished  = sum(FISH);

        if(typeof save.createdAt !== 'number' || !isFinite(save.createdAt)){
          save.createdAt = (typeof save.lastSeen === 'number' && isFinite(save.lastSeen)) ? save.lastSeen : 1;
        }

        if(save.dailyGoals) delete save.dailyGoals;
        if(save.weeklyGoals) delete save.weeklyGoals;
      },
    },
    {
      from: 8, to: 9,
      name: 'v8 → v9 (b227: room levels are clamped to the live ladder)',
      // WHAT A CORRUPTED SAVE WOULD LOOK LIKE, and what this does to it.
      //
      // Tyler reported the House screen "let me just keep building the forge",
      // which raised a fair question: did he pay for rooms he does not have,
      // and is G.rooms now past the end of its own ladder?
      //
      // Investigated before writing this, and the honest answer is NO. There
      // are exactly two writers of G.rooms in the whole codebase — upgradeRoom
      // (which advances by one and only when levels[lv] exists) and
      // homestead.js's grandfather pass (which writes the literal 1) — so no
      // live path can produce an out-of-range level, and no gold was spent on a
      // phantom rung. What Tyler actually hit was a missing REPAINT: three real
      // purchases at three escalating prices, none of them acknowledged on
      // screen, then a silent dead button. He owns what he paid for.
      //
      // This migration is therefore insurance, not a repair, and it is written
      // as insurance: it exists so the invariant "a room level is an integer in
      // [0, ladder length]" is ENFORCED at load rather than merely being true
      // by inspection of two call sites. A save that violates it — from a
      // future bug, a hand-edited localStorage, a cloud blob written by a build
      // whose ladder was longer — would otherwise reach getBonus, which reads
      // `levels[lv-1]` and would hand `undefined` to the bonus walk, and reach
      // renderHouse, which would offer a Build button for a rung that does not
      // exist.
      //
      // Shape of a corrupted save: `rooms: { forge: 7 }` (beyond a 5-rung
      // ladder), `{ forge: -2 }`, `{ forge: 2.5 }`, `{ forge: "3" }` or
      // `{ forge: NaN }`. After this: 5, 0, 2, 3 and 0 respectively.
      //
      // Three deliberate restraints:
      //   • It only ever clamps DOWN to the cap or up to zero. It never invents
      //     a level, and a legitimate save is byte-identical afterwards.
      //   • A room id the live ROOMS table does not know is left ALONE (beyond
      //     integer coercion). We cannot know its cap, and silently deleting a
      //     room because this build has not heard of it is how a save loses a
      //     feature during a staged rollout.
      //   • If window.ROOMS is somehow absent, the whole clamp is skipped. A
      //     migration that cannot read the rules must not guess at them.
      //
      // Refunds: none, and deliberately none. Nothing was over-charged — every
      // click bought the rung it was billed for. Paying gold back for a
      // purchase the player still owns would be the actual duplication bug.
      apply: function(save){
        if(!save.rooms || typeof save.rooms !== 'object') return;
        var LADDER = (typeof window !== 'undefined' && window.ROOMS) || null;
        Object.keys(save.rooms).forEach(function(id){
          var lv = Math.floor(Number(save.rooms[id]));
          if(!isFinite(lv) || lv < 0) lv = 0;
          var def = LADDER && LADDER[id];
          if(def && def.levels && lv > def.levels.length) lv = def.levels.length;
          save.rooms[id] = lv;
        });
      },
    },
    {
      from: 9, to: 10,
      name: 'v9 → v10 (b228: the Chronicle — reserve the shape, let the runtime seed it)',
      // The Chronicle is the permanent milestone record behind the topbar
      // bell. This migration deliberately does NOT write any entries.
      //
      // Why not seed here: a migration runs on a PARSED SAVE OBJECT, before
      // it is merged into G and before any feature module has booted. The
      // seed needs HearthriseRenown (to know which ranks a score has passed),
      // HearthriseHomestead.TIERS, window.MONSTERS, window.COMPANIONS and
      // window.SKILLS_DEF — none of which this function may assume, and
      // several of which are LIVE DATA TABLES that change between builds. A
      // migration must describe the world as it was; deriving milestones from
      // tables that will keep moving is exactly the thing a migration must
      // not do.
      //
      // So the shape is reserved here and chronicle.js seeds on its first
      // boot instead (`seeded === 0` is the trigger), with the current tables
      // in front of it. Everything that seed derives is stored `dated: 0` and
      // renders under "Before the Chronicle" — no timestamp is ever invented
      // for a moment nobody recorded.
      //
      // `seenAt: 0` is safe: the seed sets it to `now` in the same pass, so an
      // existing player's badge opens at 0 rather than at their whole history.
      apply: function(save){
        if(save.chronicle == null || typeof save.chronicle !== 'object' || Array.isArray(save.chronicle)){
          save.chronicle = { v: 1, entries: [], seenAt: 0, seeded: 0 };
          return;
        }
        // Idempotent repair for a partially-written record.
        if(!Array.isArray(save.chronicle.entries)) save.chronicle.entries = [];
        if(typeof save.chronicle.seenAt !== 'number') save.chronicle.seenAt = 0;
        if(typeof save.chronicle.seeded !== 'number') save.chronicle.seeded = 0;
        save.chronicle.v = 1;
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
