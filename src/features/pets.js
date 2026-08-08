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

  function parse(kind) {
    // returns [{petId, key, n}] for the given source kind
    var out = [];
    var C = defs();
    Object.keys(C).forEach(function (id) {
      var src = C[id] && C[id].source;
      if (typeof src !== 'string' || src.indexOf(kind + ':') !== 0) return;
      var parts = src.split(':');
      out.push({ petId: id, key: parts[1], n: Math.max(2, parseInt(parts[2], 10) || 2000) });
    });
    return out;
  }

  function tryUnlock(petId) {
    if (owned(petId)) return false;
    if (typeof window.unlockCompanion === 'function') window.unlockCompanion(petId);
    var d = defs()[petId] || {};
    if (window.notify) notify('🎉 A wild friend! ' + (d.icon || '🐾') + ' ' + (d.n || petId) + ' now follows you!', 'levelup');
    return true;
  }

  // Roll a pet for one skill-XP event. Exposed for tests.
  function rollSkillPet(skillId, rng) {
    var r = (typeof rng === 'function') ? rng : Math.random;
    var pets = parse('skill');
    for (var i = 0; i < pets.length; i++) {
      if (pets[i].key !== skillId || owned(pets[i].petId)) continue;
      if (r() < 1 / pets[i].n) return tryUnlock(pets[i].petId);
    }
    return false;
  }

  function rollBossPet(monsterId, rng) {
    var r = (typeof rng === 'function') ? rng : Math.random;
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
