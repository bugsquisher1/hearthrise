// ============================================================
// src/render/paint.js — a repaint writes only what changed (2026-10-14)
//
// Most screens repaint from the same calls: every live frame and every server
// answer runs refreshAll(), and a dozen timers repaint between them. The
// renderers they reach rebuilt their host with `host.innerHTML = markup` on
// every call, so an unchanged screen was torn down and re-parsed up to ten
// times a second. That is invisible until something else lives in the same
// DOM: an <img> re-decodes, an open <select> closes, a node another module
// added is wiped and comes back a moment later. The last one is what Tyler saw
// in the Local Shop: "Under the counter" blanking in and out.
//
// OWNERSHIP: the seam remembers the nodes each write produced. It skips a
// write only while every one of them is still a child of the host, so anyone
// who replaced the children gets a fresh write, while a node another module
// ADDED beside them (the inventory's mobile tab strip, the combat doll) is left
// alone instead of being wiped and re-added on every call.
//
// HearthrisePaint.html(host, markup)
//   Writes `markup` into `host` unless it is exactly what this seam last wrote
//   there and the host still holds those nodes. Returns true when it wrote. A
//   renderer that wires listeners onto the nodes it just wrote must wire only
//   on a true return (onclick assignment is safe either way).
//
// HearthrisePaint.rows(host, rows)
//   Keyed rows for a list whose parts change on their own: `rows` is
//   [[key, markup], ...] and each markup is ONE element. An unchanged row keeps
//   its node; a changed row keeps its node too when its own tag and attributes
//   match, and only its differing children are swapped (an affordability flip
//   swaps a button, never the row's art). Order follows `rows`; a key that
//   left is removed. Returns how many nodes it wrote.
//
// HearthrisePaint.text(host, value)
//   textContent, skipped when the host already holds exactly that text.
//
// HearthrisePaint.mount(host, nodes)
//   For renderers that BUILD nodes: mounts them only when their markup differs
//   from what the host shows; otherwise the built nodes are dropped.
//
// Classic script, loaded BEFORE legacy.js: legacy's renderers call it bare
// and run before any ES module has evaluated.
// ============================================================
(function () {
  'use strict';

  var held = new WeakMap();

  function remember(host, extra) {
    var s = { nodes: Array.prototype.slice.call(host.childNodes) };
    for (var k in extra) s[k] = extra[k];
    held.set(host, s);
  }

  /* Every node the last write produced is still a child of `host`; an empty
     write owns the host only while it stays empty. */
  function owned(host, s) {
    if (!s || !s.nodes) return false;
    if (!s.nodes.length) return !host.firstChild;
    for (var i = 0; i < s.nodes.length; i++) if (s.nodes[i].parentNode !== host) return false;
    return true;
  }

  function html(host, markup) {
    if (!host) return false;
    var m = String(markup == null ? '' : markup);
    var s = held.get(host);
    if (s && s.html === m && owned(host, s)) return false;
    host.innerHTML = m;
    remember(host, { html: m });
    return true;
  }

  function element(markup) {
    var t = document.createElement('template');
    t.innerHTML = markup;
    var c = t.content;
    return (c.childNodes.length === 1 && c.firstChild.nodeType === 1) ? c.firstChild : null;
  }

  function sameShell(a, b) {
    if (a.tagName !== b.tagName || a.attributes.length !== b.attributes.length) return false;
    for (var i = 0; i < a.attributes.length; i++) {
      var at = a.attributes[i];
      if (b.getAttribute(at.name) !== at.value) return false;
    }
    return a.childNodes.length === b.childNodes.length;
  }

  /* Move the differing children of `fresh` into `old`. Returns nodes written. */
  function patchInto(old, fresh) {
    var n = 0;
    var kids = Array.prototype.slice.call(fresh.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var o = old.childNodes[i];
      if (o.isEqualNode(kids[i])) continue;
      old.replaceChild(kids[i], o);
      n++;
    }
    return n;
  }

  function joined(list) {
    return list.map(function (r) { return String(r[1] == null ? '' : r[1]); }).join('');
  }

  function rows(host, list) {
    if (!host) return 0;
    var s = held.get(host);
    var prev = (s && s.rows && owned(host, s)) ? s.rows : null;
    /* Pass 1 parses and touches no DOM, so a row that is not one element or a
       repeated key falls back to the whole-host write before anything moved. */
    var plan = [];
    var seen = new Set();
    var same = !!prev && prev.size === list.length;
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i][0]);
      var m = String(list[i][1] == null ? '' : list[i][1]);
      var had = prev && prev.get(key);
      var kept = !!had && had.html === m;
      var fresh = kept ? null : element(m);
      if (seen.has(key) || (!kept && !fresh)) return html(host, joined(list)) ? 1 : 0;
      if (!kept || had.at !== i) same = false;
      seen.add(key);
      plan.push({ key: key, html: m, had: had, fresh: fresh });
    }
    if (same) return 0;
    var next = new Map();
    var order = [];
    var written = 0;
    for (var p = 0; p < plan.length; p++) {
      var r = plan[p];
      var el = r.had ? r.had.el : null;
      if (r.fresh) {
        if (el && sameShell(el, r.fresh)) written += patchInto(el, r.fresh);
        else { el = r.fresh; written++; }
      }
      next.set(r.key, { html: r.html, el: el, at: p });
      order.push(el);
    }
    var keep = new Set(order);
    var kids = Array.prototype.slice.call(host.childNodes);
    for (var k = 0; k < kids.length; k++) if (!keep.has(kids[k])) host.removeChild(kids[k]);
    var ref = host.firstChild;
    for (var j = 0; j < order.length; j++) {
      if (order[j] === ref) { ref = ref.nextSibling; continue; }
      host.insertBefore(order[j], ref);
    }
    remember(host, { rows: next });
    return written;
  }

  /* Plain text: a no-op when the host already holds exactly that one text node. */
  function text(host, value) {
    if (!host) return false;
    var t = String(value == null ? '' : value);
    var only = host.firstChild;
    if (host.childNodes.length === (t ? 1 : 0) && (!only || (only.nodeType === 3 && only.data === t))) return false;
    host.textContent = t;
    return true;
  }

  /* Freshly built nodes (a paper doll carries its own handlers): mounted only
     when their markup differs from what this host shows. */
  function mount(host, nodes) {
    if (!host) return false;
    var list = (nodes || []).filter(Boolean);
    var sig = list.map(function (n) { return n.nodeType === 1 ? n.outerHTML : String(n.textContent); }).join('\u0000');
    var s = held.get(host);
    if (s && s.mount === sig && owned(host, s)) return false;
    host.replaceChildren.apply(host, list);
    remember(host, { mount: sig });
    return true;
  }

  /* A host whose children someone else is about to own outright. */
  function forget(host) { if (host) held.delete(host); }

  window.HearthrisePaint = Object.freeze({ html: html, rows: rows, text: text, mount: mount, forget: forget });
})();
