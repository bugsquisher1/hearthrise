// ============================================================
// src/platform/storage.js  — Platform Storage seam (architecture layer 4)
//
// Single chokepoint for LOCAL persistence. Today it is backed by
// localStorage; the point of the seam is that Steam (electron-store) and
// mobile (Capacitor Preferences) can swap the backend HERE without any
// game logic changing. This is the "platform seam" layer from the locked
// architecture direction in CLAUDE.md.
//
// The API is SYNCHRONOUS on purpose — it matches how the game already
// reads/writes state (saveLocal/loadLocal and ~30 feature keys). Native
// backends are async, so a future adapter hydrates the in-memory mirror
// (`mem`) at boot and flushes writes asynchronously; callers keep using
// the same sync API. Melvor Idle ships to Steam+mobile from one web core
// on exactly this shape.
//
// SAFETY: every operation is wrapped and falls back to the in-memory
// mirror, so a private-mode / quota / disabled-storage failure degrades
// to "this session works, just doesn't persist" instead of throwing. It
// must NEVER throw into a caller — saveLocal depends on that.
//
// Loaded as a classic script BEFORE legacy.js so window.HearthriseStorage
// exists by the time saveLocal/loadLocal run.
// ============================================================
(function () {
  'use strict';

  // In-memory mirror. Doubles as (a) the fallback when localStorage is
  // unavailable and (b) the cache a future async native adapter hydrates.
  var mem = Object.create(null);

  var hasLS = (function () {
    try {
      var k = '__hr_ls_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function get(key) {
    try {
      if (hasLS) {
        var v = window.localStorage.getItem(key);
        return v === null && key in mem ? mem[key] : v;
      }
    } catch (e) { /* fall through to mem */ }
    return key in mem ? mem[key] : null;
  }

  function set(key, val) {
    var s = String(val);
    mem[key] = s;                         // mirror first, so it's never lost
    try { if (hasLS) window.localStorage.setItem(key, s); } catch (e) { /* quota/private: mem holds it */ }
  }

  function remove(key) {
    delete mem[key];
    try { if (hasLS) window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function keys() {
    try {
      if (hasLS) {
        var out = [];
        for (var i = 0; i < window.localStorage.length; i++) out.push(window.localStorage.key(i));
        return out;
      }
    } catch (e) { /* fall through */ }
    return Object.keys(mem);
  }

  function getJSON(key, fallback) {
    var def = fallback === undefined ? null : fallback;
    var raw = get(key);
    if (raw == null) return def;
    try { return JSON.parse(raw); } catch (e) { return def; }
  }

  function setJSON(key, obj) {
    try { set(key, JSON.stringify(obj)); } catch (e) { /* circular/huge: skip, don't throw */ }
  }

  window.HearthriseStorage = {
    get: get,
    set: set,
    remove: remove,
    keys: keys,
    getJSON: getJSON,
    setJSON: setJSON,
    available: hasLS,           // false in private mode / storage disabled
    backend: 'localStorage'     // swap point for electron-store / Capacitor
  };

  console.log('[storage] seam ready (backend=localStorage, available=' + hasLS + ')');
})();
