// ============================================================
// src/features/quest-nav.js  (b227)
//
// ONE resolver: goal -> the place you play it.
//
// The player-journey audit's finding #2: a quest told you to catch fish and
// the only button on the row opened a modal that did not contain the quest.
// Every quest surface in the game had its own private idea of where a goal
// leads (Home's `questRoute` regex table, the Quests modal's nothing at all),
// so "take me there" was either wrong, absent, or pointed at a tab that does
// not exist (`nav('market')` predates the market panel by two builds).
//
// This module is the single mapping, and it is DERIVED, not hand-tagged.
// No pool entry grows a `destination:` field. Instead the resolver reads the
// fields a goal already carries, strongest signal first:
//
//   1. `goal.source`  — 'stats.fished', '_dailyGoldDelta', … This is what the
//      goal literally MEASURES, so it is the most honest routing key there is.
//      Its gathering third is inverted from `window.SKILL_ACTION_STAT`, the
//      same map `doSkillAction()` writes those counters through — add a
//      gathering skill there and its quests route themselves.
//   2. `goal.type`    — 'kill_any' | 'gather' | 'harvest' | 'cooked' |
//      'smithed' | 'crafted'. This is `updateDaily()`'s existing action
//      vocabulary, not new metadata invented for navigation.
//   3. bounty shape   — a board contract (tier + difficulty + monster target).
//   4. the goal's own words — the net under hand-authored `G.quests` text,
//      and the only place an artisan LANE is inferred.
//   5. the skills grid — the total fallback, so the resolver never returns
//      null and a click is never dead.
//
// The b220 taxonomy lesson applies to lanes too: a lane is only ever chosen
// from `HearthriseArtisanCat.groups(skillId)` — the LIVE category list — so a
// renamed or deleted lane degrades to "no lane" instead of persisting a key
// that no longer exists.
//
// The suite asserts every source and every type in the live pools resolves
// WITHOUT hitting the fallback, so the fallback can never silently rot into
// the common case.
// ============================================================
(function () {
  'use strict';

  // ── destination constructors ───────────────────────────────────────────
  // `tab`     — showTab() target (always present)
  // `skillId` — skill whose DETAIL panel should open on arrival (optional)
  // `detail`  — artisan category lane to select inside that detail (optional)
  // `verb`    — the Go button's words
  // `label`   — the destination's human name (tooltips, tests)
  // `glyph`   — icon-set key for the door's picture (quest rows draw it)
  // `via`     — which derivation layer answered ('fallback' means none did)
  function dest(tab, opts) {
    opts = opts || {};
    return {
      tab: tab,
      skillId: opts.skillId || null,
      detail: opts.detail || null,
      verb: opts.verb || 'Go',
      label: opts.label || tab,
      glyph: opts.glyph || 'bountyHunter',
      via: opts.via || null,
    };
  }
  var COMBAT  = function () { return dest('combat',  { verb: 'Go fight', label: 'Combat',       glyph: 'navCombat' }); };
  var FARM    = function () { return dest('farming', { verb: 'Go farm',  label: 'Farm',         glyph: 'farming' }); };
  var MARKET  = function () { return dest('market',  { verb: 'Go sell',  label: 'Market',       glyph: 'gold' }); };
  var BOUNTY  = function () { return dest('bounty',  { verb: 'Go to the board',  label: 'Bounty Board', glyph: 'bountyHunter' }); };
  var EVENTS  = function () { return dest('events',  { verb: 'Go to the muster', label: 'Events',       glyph: 'uiBanner' }); };
  var HOUSE   = function () { return dest('house',   { verb: 'Go build', label: 'Homestead',    glyph: 'uiHome' }); };
  var GRID    = function () { return dest('skills',  { verb: 'Go train', label: 'Skills',       glyph: 'totalLvl' }); };

  // A skill's own detail screen. Verbs are the action the player performs
  // there, so the button can honestly carry the goal's own word.
  var SKILL_VERB = {
    woodcutting: 'Go chop', mining: 'Go mine', fishing: 'Go fish',
    cooking: 'Go cook', smithing: 'Go smith', crafting: 'Go craft',
    prayer: 'Go pray', farming: 'Go farm',
    runecrafting: 'Go bind', stonemason: 'Go cut stone',
  };
  function SKILL(id) {
    var def = window.SKILLS_DEF && window.SKILLS_DEF[id];
    // Farming is a skill in SKILLS_DEF but the plots live on their own panel —
    // sending a "plant 5 crops" quest to a skills-tab detail would land the
    // player next to the thing instead of on it.
    if (id === 'farming') return FARM();
    if (!def) return GRID();
    return dest('skills', {
      skillId: id, verb: SKILL_VERB[id] || 'Go train',
      label: def.name || id, glyph: id,
    });
  }

  // ── layer 1: what the goal measures ────────────────────────────────────
  // Inverted from the writer map so gathering never needs a second list.
  function gatherSkillByCounter() {
    var m = window.SKILL_ACTION_STAT ||
      { woodcutting: 'chopped', mining: 'mined', fishing: 'fished' };
    var out = {};
    Object.keys(m).forEach(function (skillId) { out[m[skillId]] = skillId; });
    return out;
  }
  // Counters that are not a gathering skill's output. Each entry is the place
  // the counter is MOVED, which is the only question the player is asking.
  var COUNTER_DEST = {
    kills: COMBAT, killStreak: COMBAT, bestKillStreak: COMBAT,
    killsByTier: COMBAT, killsByFamily: COMBAT, deaths: COMBAT,
    rareDrops: COMBAT,
    cooked: function () { return SKILL('cooking'); },
    burnt: function () { return SKILL('cooking'); },
    buffsConsumed: function () { return SKILL('cooking'); },
    smithed: function () { return SKILL('smithing'); },
    crafted: function () { return SKILL('crafting'); },
    // Both artisan skills bump `refined`; the grid is the honest answer.
    refined: GRID,
    planted: FARM, harvested: FARM, cropsHarvested: FARM,
    gathered: GRID,       // "any resource" — the grid IS the choice of which
    levelups: GRID,       // "gain a level" — any skill will do
    totalGoldEarned: MARKET, totalGoldSpent: MARKET,
    roomsBuilt: HOUSE,
  };

  function fromSource(source) {
    if (typeof source !== 'string' || !source) return null;
    if (source === '_dailyGoldDelta') return MARKET();
    var counter = source.indexOf('.') >= 0 ? source.split('.').pop() : source;
    var gathered = gatherSkillByCounter()[counter];
    if (gathered) return SKILL(gathered);
    var make = COUNTER_DEST[counter];
    return make ? make() : null;
  }

  // ── layer 2: updateDaily()'s action vocabulary ─────────────────────────
  var TYPE_DEST = {
    kill_any: COMBAT, kill: COMBAT, combat: COMBAT,
    gather: GRID,
    harvest: FARM, plant: FARM, farm: FARM,
    cooked: function () { return SKILL('cooking'); },
    smithed: function () { return SKILL('smithing'); },
    crafted: function () { return SKILL('crafting'); },
    gold: MARKET, sell: MARKET,
  };
  function fromType(type) {
    if (typeof type !== 'string' || !type) return null;
    var make = TYPE_DEST[type];
    if (make) return make();
    // A type named after a gathering counter ('chopped') or a skill id
    // ('fishing') routes itself without a new table entry.
    var gathered = gatherSkillByCounter()[type];
    if (gathered) return SKILL(gathered);
    if (window.SKILLS_DEF && window.SKILLS_DEF[type]) return SKILL(type);
    return null;
  }

  // ── layer 3: a bounty board contract ───────────────────────────────────
  // Bounties are goals too, and they are the one goal family whose "where"
  // is the board itself — you accept and track them there.
  function isBounty(goal) {
    return !!(goal && goal.difficulty && goal.tier != null && goal.target &&
      typeof goal.target === 'string');
  }

  // ── layer 4: the goal's own words ──────────────────────────────────────
  // Ordered: the first pattern that matches wins, so "Cook 12 fish" is
  // cooking (the verb) and not fishing (the noun).
  var TEXT_RULES = [
    [/\bbount/,                                  BOUNTY],
    [/\bmuster|\brally|\bevent\b/,               EVENTS],
    [/\bcook|\bbake|\broast|\bdish|\bmeal/,      function () { return SKILL('cooking'); }],
    [/\bsmith|\bsmelt|\bforge|\bbar\b/,          function () { return SKILL('smithing'); }],
    [/\bcraft|\bsaw\b|\bplank|\bfletch/,         function () { return SKILL('crafting'); }],
    [/\bfish|\bcatch\b/,                         function () { return SKILL('fishing'); }],
    [/\bchop|\blog\b|\blogs\b|\btree|\bwoodcut/, function () { return SKILL('woodcutting'); }],
    [/\bmine\b|\bmining|\bore\b|\bores\b|\brock/, function () { return SKILL('mining'); }],
    [/\bfarm|\bplant|\bharvest|\bcrop|\bseed/,   FARM],
    [/\bpray|\bprayer|\bbone/,                   function () { return SKILL('prayer'); }],
    [/\bkill|\bslay|\bdefeat|\bmonster|\bfight|\bcombat/, COMBAT],
    [/\bgold\b|\bsell\b|\bcoin|\bmarket|\btrade|\bearn\b/, MARKET],
    [/\bhomestead|\bbuild\b|\bupgrade\b/,        HOUSE],
    [/\bgather|\bresource|\blevel\b|\bskill/,    GRID],
  ];
  function fromText(text) {
    var t = String(text || '').toLowerCase();
    if (!t) return null;
    for (var i = 0; i < TEXT_RULES.length; i++) {
      if (TEXT_RULES[i][0].test(t)) return TEXT_RULES[i][1]();
    }
    return null;
  }

  // ── the artisan lane ───────────────────────────────────────────────────
  // Derived against the LIVE taxonomy: a lane is only ever returned if it is
  // currently one of that skill's groups. Rename a category and this stops
  // matching; it can never persist a key the strip no longer renders.
  function laneFor(skillId, text) {
    if (!skillId || !text) return null;
    var AC = window.HearthriseArtisanCat;
    if (!AC || typeof AC.groups !== 'function') return null;
    var groups;
    try { groups = AC.groups(skillId); } catch (e) { return null; }
    if (!groups || groups.length < 2) return null;   // one lane is not a choice
    var t = String(text).toLowerCase();
    // Words the player would actually type for a lane, checked against the
    // lane's own label first so a renamed lane keeps working for free.
    var HINTS = {
      smelting: /\bsmelt|\bbar\b|\bbars\b|\bingot/,
      weapons: /\bweapon|\bsword|\bblade|\bmaul|\bhammer|\bbow\b|\bstaff/,
      armour: /\barmour|\barmor|\bplate|\bhelm|\bshield|\bgreave|\bgauntlet/,
      tools: /\btool|\baxe\b|\bpickaxe|\brod\b/,
      jewellery: /\bjewel|\bring\b|\bamulet|\bnecklace/,
      ammunition: /\bammo|\barrow|\bbolt/,
      sawmill: /\bplank|\bsaw\b|\blumber/,
      castle: /\bcastle|\bstores\b|\bration|\bfitting|\bbeam\b|\bkeystone/,
      provisions: /\bprovision|\bheal|\bration/,
      feasts: /\bfeast|\bdraught|\bbuff\b|\belixir/,
    };
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var byLabel = new RegExp('\\b' + String(g.label).toLowerCase().replace(/[^a-z ]+/g, '.') + '\\b');
      if (byLabel.test(t)) return g.key;
      var hint = HINTS[g.key];
      if (hint && hint.test(t)) return g.key;
    }
    return null;
  }

  // ── the resolver ───────────────────────────────────────────────────────
  // TOTAL: always returns a destination. `via === 'fallback'` marks the ones
  // no layer claimed, which is what the suite gates on.
  function questDestination(goal) {
    if (!goal || typeof goal !== 'object') {
      var none = GRID(); none.via = 'fallback'; return none;
    }
    var text = goal.name || goal.label || goal.desc || '';
    var d = null, via = null;

    if (isBounty(goal)) { d = BOUNTY(); via = 'bounty'; }
    if (!d) { d = fromSource(goal.source); if (d) via = 'source'; }
    if (!d) { d = fromType(goal.type);     if (d) via = 'type'; }
    if (!d) { d = fromText(text);          if (d) via = 'text'; }
    if (!d) { d = GRID(); via = 'fallback'; }
    d.via = via;

    // A lane only ever refines an artisan destination — never redirects it.
    if (d.skillId && !d.detail) {
      var lane = laneFor(d.skillId, text);
      if (lane) d.detail = lane;
    }
    return d;
  }

  // ── arrival ────────────────────────────────────────────────────────────
  // Uses only the navigation the game already has: showTab, openSkillDetail,
  // and the b220 lane selection in window._artisanCat. The lane is written
  // BEFORE the detail opens so renderSkillDetail paints the right lane on its
  // first pass — setArtisanCategory() after the fact would repaint twice and
  // flash the default lane in between.
  function goToQuest(goal) {
    var d = questDestination(goal);
    try {
      if (d.detail && d.skillId && window._artisanCat) window._artisanCat[d.skillId] = d.detail;
      if (typeof window.showTab === 'function') window.showTab(d.tab);
      if (d.skillId && typeof window.openSkillDetail === 'function') window.openSkillDetail(d.skillId);
    } catch (e) {
      return null;
    }
    return d;
  }

  // ── diagnostics (the suite's totality gate) ────────────────────────────
  // Returns every entry in `goals` that no derivation layer claimed. A live
  // pool must always produce [].
  function unmapped(goals) {
    return (Array.isArray(goals) ? goals : []).filter(function (g) {
      return questDestination(g).via === 'fallback';
    });
  }
  // Every goal-shaped thing the game currently ships, flattened. Factories in
  // DAILY_TASK_POOL are evaluated here so the check covers what a player
  // actually receives, not the factory object.
  function livePools() {
    var out = [];
    function push(list) { if (Array.isArray(list)) out = out.concat(list.filter(Boolean)); }
    push(window.DAILY_GOAL_POOL);
    push(window.WEEKLY_GOAL_POOL);
    if (Array.isArray(window.DAILY_TASK_POOL)) {
      window.DAILY_TASK_POOL.forEach(function (f) {
        try { out.push(typeof f === 'function' ? f() : f); } catch (e) { /* factory needs G */ }
      });
    }
    if (window.G) { push(window.G.quests); push(window.G.daily && window.G.daily.tasks); }
    return out;
  }

  window.HearthriseQuestNav = {
    destination: questDestination,
    go: goToQuest,
    unmapped: unmapped,
    livePools: livePools,
  };
  // Convenience aliases — the quest surfaces live in three different scopes
  // (legacy IIFEs, ESM-adjacent classic scripts) and each one reaching for a
  // different property name is how the b224 cross-scope break happened.
  window.questDestination = questDestination;
  window.goToQuest = goToQuest;

  console.log('[quest-nav] loaded — one resolver, every quest surface');
})();
