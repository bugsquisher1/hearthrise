// ============================================================
// src/features/pets.js  (b202, SYS-4)
//
// OSRS-style skilling + boss pets. The pet DEFINITIONS live in
// data/companions.js (they're companions — same stable, same equip
// slot, same bonus machinery). This module only ROLLS the two new
// source kinds companions.js doesn't handle:
//   'skill:<skillId>:<N>' — 1-in-N roll every time you earn XP in
//     that skill (gathering tick, artisan craft, bone burial …).
//   'boss:<monsterId>:<N>' — 1-in-N roll on each kill of that boss.
// These are meant to be HARD (N is large) — a pet is a flex first,
// an efficiency perk second.
//
// Hooks: wraps addXp (skill pets) and killMonster (boss pets). Both
// wrappers compose with the companions.js killMonster wrapper.
// ============================================================
(function () {
  'use strict';

  function defs() { return window.COMPANIONS || {}; }
  function owned(id) {
    var G = window.G || {};
    return !!(G.companions && G.companions.ownedIds && G.companions.ownedIds.indexOf(id) >= 0);
  }

  /* MEMOISED. `parse()` used to walk the whole COMPANIONS table on every call,
     and rollSkillPet() is hooked onto addXp — which fires three to five times
     per combat tick. A 12-hour away replay is ~18,000 ticks, so this rebuilt
     the same array roughly 60,000 times for a table that never changes at
     runtime. Measured at ~200ms of a single welcome-back catch-up, and it is
     on the LIVE hot path too.

     Keyed on the table's identity, so a data reload (or a test substituting
     window.COMPANIONS) invalidates the cache rather than serving a stale one. */
  var _parseCache = null, _parseFor = null;
  function parse(kind) {
    // returns [{petId, key, n}] for the given source kind
    var C = defs();
    if (_parseFor !== C) { _parseFor = C; _parseCache = {}; }
    if (_parseCache[kind]) return _parseCache[kind];
    var out = [];
    Object.keys(C).forEach(function (id) {
      var src = C[id] && C[id].source;
      if (typeof src !== 'string' || src.indexOf(kind + ':') !== 0) return;
      var parts = src.split(':');
      out.push({ petId: id, key: parts[1], n: Math.max(2, parseInt(parts[2], 10) || 2000) });
    });
    _parseCache[kind] = out;
    return out;
  }

  function tryUnlock(petId) {
    if (owned(petId)) return false;
    if (typeof window.unlockCompanion === 'function') window.unlockCompanion(petId);
    var d = defs()[petId] || {};
    if (window.notify) notify('🎉 A wild friend! ' + (d.icon || '🐾') + ' ' + (d.n || petId) + ' now follows you!', 'levelup');
    return true;
  }

  /* THE SEEDED STREAM, not Math.random() — the same rule companions.js's drop
     roll and dungeons.js's key drop already follow.

     Both rolls below hang off hooks the AWAY replay drives: rollSkillPet wraps
     addXp (400 draws in a 400-action away gather night, measured) and
     rollBossPet wraps killMonster (23 draws in a 30-minute away night on the
     lich, measured). A bare Math.random() there makes an away night
     unreplayable by construction: with the seed PINNED and only Math.random()
     varied, the same night unlocked `beaver` in one replay and not the other,
     and `lichling` in one and not the other. The server recomputes an absence
     from (user_id, slot, accrued_to); a grant it cannot reproduce is a grant it
     cannot adjudicate.

     `rng` stays the FIRST branch: it is the published test seam (the suite
     calls rollSkillPet('woodcutting', () => 0)), and delegation must never
     quietly remove a link from a chain a caller already had. Falls back to
     Math.random only if the core has not booted. */
  function rollRandom(rng) {
    if (typeof rng === 'function') return rng;
    var C = window.HearthriseCore;
    if (C && C.rng) return function () { return C.rng.next(); };
    return Math.random;
  }

  // Roll a pet for one skill-XP event. Exposed for tests.
  function rollSkillPet(skillId, rng) {
    var r = rollRandom(rng);
    var pets = parse('skill');
    for (var i = 0; i < pets.length; i++) {
      if (pets[i].key !== skillId || owned(pets[i].petId)) continue;
      if (r() < 1 / pets[i].n) return tryUnlock(pets[i].petId);
    }
    return false;
  }

  function rollBossPet(monsterId, rng) {
    var r = rollRandom(rng);
    var pets = parse('boss');
    for (var i = 0; i < pets.length; i++) {
      if (pets[i].key !== monsterId || owned(pets[i].petId)) continue;
      if (r() < 1 / pets[i].n) return tryUnlock(pets[i].petId);
    }
    return false;
  }

  // ── hooks ──
  var origAddXp = window.addXp;
  if (typeof origAddXp === 'function') {
    window.addXp = function (sk, amt) {
      var r = origAddXp.apply(this, arguments);
      try { rollSkillPet(sk); } catch (e) {}
      return r;
    };
  }
  var origKill = window.killMonster;
  if (typeof origKill === 'function') {
    window.killMonster = function (m) {
      var r = origKill.apply(this, arguments);
      try {
        var id = (typeof m === 'string') ? m : (m && (m.id || m.key));
        if (!id && window.G) id = window.G.activeMonster;
        if (id) rollBossPet(id);
      } catch (e) {}
      return r;
    };
  }

  window.HearthrisePets = {
    rollSkillPet: rollSkillPet,
    rollBossPet: rollBossPet,
    _parse: parse
  };
})();
