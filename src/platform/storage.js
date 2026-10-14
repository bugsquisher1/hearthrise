// ============================================================
// src/platform/storage.js — the platform storage seam
//
// The ONE file in shipped src/** that touches web storage. tests/platform-seam.mjs
// fails the build on a direct localStorage / sessionStorage / indexedDB /
// document.cookie anywhere else. A Steam or mobile shell swaps the backend HERE
// (createStore over its own Storage-shaped adapter) and no caller changes.
//
//   HearthriseStorage                    the DEVICE store (window.localStorage)
//   HearthriseStorage.session            the TAB store (window.sessionStorage):
//                                        the single-active-session instance id
//                                        lives here (CLAUDE.md §6)
//   HearthriseStorage.createStore(fn)    a store over any Storage-shaped backend
//                                        that fn() returns (a shell adapter, a test)
//
// Every store: get(k) → string|null · set(k, v[, {durable}]) → boolean ·
// remove(k) → boolean · keys() → string[] · getJSON(k, fallback) ·
// setJSON(k, v[, opts]) → boolean · available (probed once at load).
//
// THE CONTRACT (proved by tests/platform-seam.mjs against a refusing backend):
//  · Never throws. A private window, a sandboxed iframe or a full quota makes the
//    backend throw; the caller sees null / false instead.
//  · `set` answers true only when the backend holds the value. When it refuses,
//    the value becomes a stand-in that `get` returns for the rest of this page,
//    so a preference still works in the session it was chosen in. A caller whose
//    meaning depends on durability (a device or tab id, a copy that may only be
//    trusted if it landed) passes {durable:true}: a refused write keeps nothing.
//  · Reads go to the backend every time. Another tab's write or removal is seen,
//    and a spy on localStorage.setItem still sees every write made through here.
//
// Classic script, loaded before every other src/ script (index.html; the guard
// pins the order). ESM modules read globalThis.HearthriseStorage when they need
// it and treat its absence (Node) as "no storage", which is what a missing
// localStorage meant to them before.
// ============================================================
(function (root) {
  'use strict';

  function createStore(resolve) {
    var standIn = Object.create(null);    // values the backend refused, this page only

    var available = (function () {
      try {
        var b = resolve(), k = '__hr_storage_probe__';
        b.setItem(k, '1');
        b.removeItem(k);
        return true;
      } catch (e) { return false; }
    })();

    function get(key) {
      key = String(key);
      if (key in standIn) return standIn[key];
      try {
        var v = resolve().getItem(key);
        return v == null ? null : v;
      } catch (e) { return null; }
    }

    function set(key, val, opts) {
      key = String(key);
      var s = String(val);
      try {
        resolve().setItem(key, s);
        delete standIn[key];
        return true;
      } catch (e) {
        if (!(opts && opts.durable)) standIn[key] = s;
        return false;
      }
    }

    function remove(key) {
      key = String(key);
      delete standIn[key];
      try { resolve().removeItem(key); return true; } catch (e) { return false; }
    }

    // A snapshot, so a caller may remove() while walking it.
    function keys() {
      var out = [];
      try {
        var b = resolve();
        for (var i = 0; i < b.length; i++) { var k = b.key(i); if (k != null) out.push(k); }
      } catch (e) { /* unreadable backend: stand-ins only */ }
      for (var s in standIn) if (out.indexOf(s) < 0) out.push(s);
      return out;
    }

    function getJSON(key, fallback) {
      var def = fallback === undefined ? null : fallback;
      var raw = get(key);
      if (raw == null) return def;
      try { return JSON.parse(raw); } catch (e) { return def; }
    }

    function setJSON(key, obj, opts) {
      var s;
      try { s = JSON.stringify(obj); } catch (e) { return false; }   // circular: skip, don't throw
      return set(key, s, opts);
    }

    return { get: get, set: set, remove: remove, keys: keys,
      getJSON: getJSON, setJSON: setJSON, available: available };
  }

  var device = createStore(function () { return root.localStorage; });
  var tab = createStore(function () { return root.sessionStorage; });
  device.backend = 'localStorage';
  tab.backend = 'sessionStorage';
  device.session = tab;
  device.createStore = createStore;
  root.HearthriseStorage = device;

  console.log('[storage] seam ready (local=' + device.available + ', session=' + tab.available + ')');
})(window);
