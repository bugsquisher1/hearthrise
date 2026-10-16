/* Hearthrise map editor v0 - plain script, works over file://. */
// Baked 2026-10-15 from: src/data/world/terrain.js (MATERIALS keys), assets/world/atlas-*.json (sprite ids, all sets except hero),
// building kinds from *_wall sprites, MATERIALS[].wall, and the wall/floor/roof values in src/data/world/maps/*.js.
var KNOWN_TERRAIN = ["cobble","earth","flagstone","grass","planks","rock"];
var KNOWN_OBJECTS = ["altar","anvil","apple_crate","armour_stand","banner","barrel","barrel_banded","barrel_broken","barrel_lid","barrel_old","barrel_planter","basket","bed","bellows","bench","bone","bones","bookshelf","bottle","brazier","bush","candelabra","candle","cart_wheel","chair","chair_side","chest","chest_iron","chimney","chopping_block","coins","coins_scattered","counter","crate","crate_stack","deadtree","desk","display_case","door","dummy","firewood","flour_sack","flower_bed","flower_box","forge","grain_sack","grain_spill","grindstone","hatch","hearth","hedge","herbs_hanging","hive_wasp","ladder","lamppost","lantern_post","loot_bag","mill_sign","millstone","mushrooms","noticeboard","npc_crier","npc_smith","oak","pebbles","pine","plank_cap","plank_end","plank_stub","plank_wall","plank_wall_door","puddle","rat","rat_skull","roof_slate","roof_wood","rug","sack_lying","sack_pile","sack_stack","sack_tall","shield_wall","signpost","skull","slime","statue","stone_cap","stone_cap_h","stone_cap_w","stone_end","stone_house_end","stone_house_wall","stone_house_wall_door","stone_house_wall_window","stone_stub","stone_wall","stone_wall_arch","straw","support_post","swords_wall","table","timber_end","timber_wall","timber_wall_door","timber_wall_window","trophy_wolf","wall_torch","wardrobe","wasp_nest","waterwheel","weapon_rack","web","well","woodpile","workbench","young_oak"];
var KNOWN_WALLS = ["plank","stone","stone_house","timber"];
var KNOWN_FLOORS = ["plank_floor"];
var KNOWN_ROOFS = ["roof_slate","roof_wood"];

/* ---------- parse / serialize (pure; also used by the node round-trip test) ---------- */
function parseMapSource(src) {
  var i = src.indexOf('export default');
  if (i < 0) throw new Error('no "export default" in file');
  var header = src.slice(0, i);
  var body = src.slice(i + 'export default'.length).trim().replace(/;\s*$/, '');
  var frozen = [];
  var re = /^ {2}([A-Za-z_$][\w$]*): Object\.freeze\(/gm, m;
  while ((m = re.exec(body))) frozen.push(m[1]);
  var data = new Function('Object', 'return (' + body + ')')({ freeze: function (x) { return x; } });
  return { header: header, frozen: frozen, map: data };
}
function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function key(k) { return /^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k); }
function lit(v) {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return q(v);
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
  var ks = Object.keys(v);
  return ks.length ? '{ ' + ks.map(function (k) { return key(k) + ': ' + lit(v[k]); }).join(', ') + ' }' : '{}';
}
function serializeMap(doc) {
  var M = doc.map, fz = {}, out = [];
  (doc.frozen || []).forEach(function (k) { fz[k] = 1; });
  Object.keys(M).forEach(function (k) {
    var v = M[k], wrap = fz[k] || (v && typeof v === 'object'), s;
    if (k === 'rows' || ((k === 'objects' || k === 'buildings' || k === 'faces') && v.length > 3)) {
      var per = k === 'rows' || k === 'buildings' ? 1 : 3, lines = [];
      for (var i = 0; i < v.length; i += per) lines.push('    ' + v.slice(i, i + per).map(lit).join(', ') + ',');
      s = '[\n' + lines.join('\n') + '\n  ]';
    } else s = lit(v);
    out.push('  ' + key(k) + ': ' + (wrap ? 'Object.freeze(' + s + ')' : s) + ',');
  });
  return (doc.header || '') + 'export default Object.freeze({\n' + out.join('\n') + '\n});\n';
}
if (typeof module !== 'undefined') module.exports = { parseMapSource: parseMapSource, serializeMap: serializeMap };

/* ---------- editor ---------- */
if (typeof document !== 'undefined') (function () {
  var $ = function (id) { return document.getElementById(id); };
  var T = 32, Z = 1, doc = null, M = null, fname = 'new_map.js', base = '';
  var undo = [], redo = [], sel = null, drag = null, tool = 'brush', paint = '.';
  var layers = { terrain: 1, labels: 1, buildings: 1, objects: 1, markers: 1 };
  var objIds = KNOWN_OBJECTS.slice(), needsArt = [];
  var cv = $('cv'), cx = cv.getContext('2d');
  var TOOLS = ['select', 'brush', 'rect', 'object', 'building', 'door', 'station', 'exit', 'start', 'focus'];
  var COL = { grass: '#5d9b4a', cobble: '#9a948a', earth: '#7a5a3a', rock: '#3f3a36', flagstone: '#8a8070', planks: '#a07040' };
  function col(t) { if (COL[t]) return COL[t]; var h = 0; for (var i = 0; i < (t || '').length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return 'hsl(' + h + ',45%,45%)'; }
  function W() { return M.rows[0] ? M.rows[0].length : 0; } function H() { return M.rows.length; }
  function snap() { return JSON.stringify(M); }
  function geo() { return JSON.stringify([M.rows, M.legend, M.objects, M.buildings, M.faces]); }
  function flagArt(id, what) {
    if (!id || needsArt.some(function (n) { return n.id === id; })) return;
    needsArt.push({ id: id, description: what + ' (not in engine lists)' }); renderNA();
  }
  function arr(k) { if (!Array.isArray(M[k])) M[k] = []; return M[k]; }

  function load(d, name) {
    doc = d; M = d.map; fname = name; undo = []; redo = []; sel = null;
    ['rows', 'objects', 'buildings', 'exits'].forEach(arr);
    if (!M.legend) M.legend = {}; if (!M.stations) M.stations = {};
    base = geo();
    M.objects.forEach(function (o) { if (objIds.indexOf(o.id) < 0) { objIds.push(o.id); flagArt(o.id, 'object'); } });
    Object.keys(M.legend).forEach(function (c) { if (KNOWN_TERRAIN.indexOf(M.legend[c]) < 0) flagArt(M.legend[c], 'terrain'); });
    paint = Object.keys(M.legend)[0] || '.'; $('fname').textContent = fname; all();
  }
  function all() { ui(); draw(); validate(); }

  /* --- panels --- */
  function ui() {
    $('tools').innerHTML = ''; TOOLS.forEach(function (t) {
      var b = document.createElement('button'); b.textContent = t; if (t === tool) b.className = 'on';
      b.onclick = function () { tool = t; ui(); }; $('tools').appendChild(b);
    });
    $('legend').innerHTML = ''; Object.keys(M.legend).forEach(function (c) {
      var d = document.createElement('div'); if (c === paint) d.className = 'on';
      d.innerHTML = '<span class="sw" style="background:' + col(M.legend[c]) + '"></span><code>' + c + '</code> ' + M.legend[c];
      d.onclick = function () { paint = c; ui(); }; $('legend').appendChild(d);
    });
    var os = $('objId'), cur = os.value; os.innerHTML = '';
    objIds.forEach(function (id) { var o = document.createElement('option'); o.textContent = id; os.appendChild(o); });
    if (cur) os.value = cur;
    $('layers').innerHTML = ''; Object.keys(layers).forEach(function (l) {
      var lb = document.createElement('label'); lb.innerHTML = '<input type="checkbox"' + (layers[l] ? ' checked' : '') + '> ' + l + ' ';
      lb.firstChild.onchange = function (e) { layers[l] = e.target.checked; draw(); }; $('layers').appendChild(lb);
    });
    var meta = $('meta'); meta.innerHTML = '';
    ['id', 'name', 'kind', 'light', 'ground', 'outdoor', 'hunts', 'maskHash'].forEach(function (k) {
      field(meta, k, Array.isArray(M[k]) ? M[k].join(',') : M[k], function (v) {
        if (k === 'outdoor') M[k] = v === 'true'; else if (k === 'hunts') M[k] = v ? v.split(',').map(function (s) { return s.trim(); }) : []; else M[k] = v;
      });
    });
    selPanel();
  }
  function field(parent, k, val, set, list) {
    var lb = document.createElement('label'); lb.textContent = k + ' ';
    var inp = document.createElement('input'); inp.value = val === undefined ? '' : val;
    if (list) inp.setAttribute('list', 'dl_' + list);
    inp.onchange = function () { mut(function () { set(inp.value); }); };
    lb.appendChild(inp); parent.appendChild(lb);
  }
  function mkList(name, items) { var dl = document.createElement('datalist'); dl.id = 'dl_' + name; items.forEach(function (i) { var o = document.createElement('option'); o.value = i; dl.appendChild(o); }); document.body.appendChild(dl); }
  mkList('walls', KNOWN_WALLS); mkList('floors', KNOWN_FLOORS); mkList('roofs', KNOWN_ROOFS); mkList('terrain', KNOWN_TERRAIN); mkList('objects', KNOWN_OBJECTS);
  $('lgTer').setAttribute('list', 'dl_terrain'); $('objNew').setAttribute('list', 'dl_objects');
  function selPanel() {
    var p = $('sel'); p.innerHTML = '';
    if (!sel) { p.textContent = 'nothing'; return; }
    var del = document.createElement('button'); del.textContent = 'Delete (Del)'; del.onclick = delSel;
    if (sel.t === 'b') {
      var b = M.buildings[sel.i];
      field(p, 'id', b.id, function (v) { b.id = v; });
      field(p, 'rect', b.rect.join(','), function (v) { b.rect = v.split(',').map(Number); });
      field(p, 'wall', b.wall, function (v) { b.wall = v; if (KNOWN_WALLS.indexOf(v) < 0) flagArt(v, 'wall kit'); }, 'walls');
      field(p, 'floor', b.floor, function (v) { b.floor = v; if (KNOWN_FLOORS.indexOf(v) < 0) flagArt(v, 'floor'); }, 'floors');
      field(p, 'windows (x,..)', (b.windows || []).join(','), function (v) { b.windows = v ? v.split(',').map(Number) : []; });
      field(p, 'chimney x', b.chimney, function (v) { if (v === '') delete b.chimney; else b.chimney = Number(v); });
      field(p, 'closed', b.closed === undefined ? '' : b.closed, function (v) { if (v === '') delete b.closed; else b.closed = v === 'true'; });
      field(p, 'roof kind', b.roof ? b.roof.kind : '', function (v) {
        if (!v) delete b.roof; else { b.roof = b.roof || { rect: b.rect.slice() }; b.roof.kind = v; if (KNOWN_ROOFS.indexOf(v) < 0) flagArt(v, 'roof'); }
      }, 'roofs');
      var sy = document.createElement('button'); sy.textContent = 'roof rect = rect'; sy.onclick = function () { mut(function () { if (b.roof) b.roof.rect = b.rect.slice(); }); };
      p.appendChild(sy);
      p.appendChild(document.createTextNode(' doors: ' + JSON.stringify(b.doors || []) + ' '));
    } else if (sel.t === 'o') { var o = M.objects[sel.i]; field(p, 'id', o.id, function (v) { o.id = v; if (KNOWN_OBJECTS.indexOf(v) < 0) flagArt(v, 'object'); }, 'objects'); p.appendChild(document.createTextNode(' at ' + o.x + ',' + o.y + ' ')); }
    else if (sel.t === 'e') { var e = M.exits[sel.i]; field(p, 'to', e.to, function (v) { e.to = v; }); }
    else if (sel.t === 's') { field(p, 'station name', sel.k, function (v) { var val = M.stations[sel.k]; delete M.stations[sel.k]; M.stations[v] = val; sel.k = v; }); }
    else p.appendChild(document.createTextNode(sel.t + ' '));
    p.appendChild(del);
  }

  /* --- mutation / undo --- */
  function mut(fn) { var s = snap(); fn(); if (snap() !== s) { undo.push(s); redo = []; } all(); }
  function restore(s) { var d = JSON.parse(s); Object.keys(M).forEach(function (k) { delete M[k]; }); Object.assign(M, d); sel = null; all(); }
  function doUndo() { if (undo.length) { redo.push(snap()); restore(undo.pop()); } }
  function doRedo() { if (redo.length) { undo.push(snap()); restore(redo.pop()); } }
  function setTile(x, y, c) { if (x < 0 || y < 0 || x >= W() || y >= H()) return; var r = M.rows[y]; M.rows[y] = r.slice(0, x) + c + r.slice(x + 1); }

  /* --- hit tests --- */
  function hit(x, y) {
    var i;
    if (layers.markers) {
      if (M.start && M.start[0] === x && M.start[1] === y) return { t: 'start' };
      if (M.focus && M.focus[0] === x && M.focus[1] === y) return { t: 'focus' };
      for (i = 0; i < M.exits.length; i++) if (M.exits[i].x === x && M.exits[i].y === y) return { t: 'e', i: i };
      for (var k in M.stations) if (M.stations[k][0] === x && M.stations[k][1] === y) return { t: 's', k: k };
    }
    if (layers.objects) for (i = M.objects.length - 1; i >= 0; i--) if (M.objects[i].x === x && M.objects[i].y === y) return { t: 'o', i: i };
    if (layers.buildings) for (i = M.buildings.length - 1; i >= 0; i--) { var r = M.buildings[i].rect; if (x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return { t: 'b', i: i, corner: x === r[0] + r[2] - 1 && y === r[1] + r[3] - 1 }; }
    return null;
  }
  function moveTo(s, x, y) {
    if (s.t === 'b') { shiftBuilding(M.buildings[s.i], x - drag.lx, y - drag.ly); return; }
    var p = s.t === 'start' ? M.start : s.t === 'focus' ? M.focus : s.t === 's' ? M.stations[s.k] : s.t === 'e' ? M.exits[s.i] : M.objects[s.i];
    if (Array.isArray(p)) { p[0] = x; p[1] = y; } else if (p) { p.x = x; p.y = y; }
  }
  function shiftBuilding(b, dx, dy) {
    b.rect[0] += dx; b.rect[1] += dy; if (b.roof && b.roof.rect) { b.roof.rect[0] += dx; b.roof.rect[1] += dy; }
    (b.doors || []).forEach(function (d) { d[0] += dx; d[1] += dy; });
    if (b.windows) b.windows = b.windows.map(function (w) { return w + dx; });
    if (typeof b.chimney === 'number') b.chimney += dx;
  }

  /* --- mouse --- */
  function tileOf(e) { var r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / (T * Z)), Math.floor((e.clientY - r.top) / (T * Z))]; }
  cv.onmousedown = function (e) {
    if (!M) return; var t = tileOf(e), x = t[0], y = t[1], h = hit(x, y), nm;
    drag = { s0: snap(), x0: x, y0: y, lx: x, ly: y };
    if (tool === 'brush') { setTile(x, y, paint); drag.paint = 1; }
    else if (tool === 'rect') drag.rect = 1;
    else if (tool === 'door') {
      M.buildings.forEach(function (b) {
        var r = b.rect, inside = x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
        if (inside && (x === r[0] || y === r[1] || x === r[0] + r[2] - 1 || y === r[1] + r[3] - 1)) {
          b.doors = b.doors || []; var k = b.doors.findIndex(function (d) { return d[0] === x && d[1] === y; });
          if (k >= 0) b.doors.splice(k, 1); else b.doors.push([x, y]);
        }
      });
    } else if (h && (tool === 'select' || tool === 'object' || tool === 'building' || h.t !== 'b')) {
      sel = h; drag.move = h; if (h.t === 'b' && h.corner) drag.resize = 1;
    } else if (tool === 'object') { M.objects.push({ id: $('objId').value, x: x, y: y }); sel = { t: 'o', i: M.objects.length - 1 }; drag.move = sel; }
    else if (tool === 'building') { M.buildings.push({ id: 'building' + M.buildings.length, rect: [x, y, 1, 1], wall: 'timber', floor: 'plank_floor', doors: [], windows: [], roof: { rect: [x, y, 1, 1], kind: 'roof_wood' } }); sel = { t: 'b', i: M.buildings.length - 1 }; drag.resize = 1; drag.move = sel; }
    else if (tool === 'station') { nm = $('stName').value || 'idle'; M.stations[nm] = [x, y]; sel = { t: 's', k: nm }; drag.move = sel; }
    else if (tool === 'exit') { M.exits.push({ x: x, y: y, to: $('exTo').value }); sel = { t: 'e', i: M.exits.length - 1 }; drag.move = sel; }
    else if (tool === 'start' || tool === 'focus') { M[tool] = [x, y]; sel = { t: tool }; drag.move = sel; }
    else sel = null;
    all();
  };
  cv.onmousemove = function (e) {
    if (!M) return; var t = tileOf(e), x = t[0], y = t[1]; $('cursor').textContent = 'x,y: ' + x + ',' + y;
    if (!drag) return;
    if (drag.paint) setTile(x, y, paint);
    else if (drag.resize) { var b = M.buildings[drag.move.i], r = b.rect; r[2] = Math.max(1, x - r[0] + 1); r[3] = Math.max(1, y - r[1] + 1); if (b.roof && b.roof.rect) { b.roof.rect[2] = r[2]; b.roof.rect[3] = r[3]; } }
    else if (drag.move && (x !== drag.lx || y !== drag.ly)) moveTo(drag.move, x, y);
    drag.lx = x; drag.ly = y; draw();
  };
  window.onmouseup = function () {
    if (!drag) return;
    if (drag.rect) { for (var y = Math.min(drag.y0, drag.ly); y <= Math.max(drag.y0, drag.ly); y++) for (var x = Math.min(drag.x0, drag.lx); x <= Math.max(drag.x0, drag.lx); x++) setTile(x, y, paint); }
    if (snap() !== drag.s0) { undo.push(drag.s0); redo = []; }
    drag = null; all();
  };
  function delSel() {
    if (!sel) return;
    mut(function () {
      if (sel.t === 'o') M.objects.splice(sel.i, 1); else if (sel.t === 'b') M.buildings.splice(sel.i, 1);
      else if (sel.t === 'e') M.exits.splice(sel.i, 1); else if (sel.t === 's') delete M.stations[sel.k];
      else delete M[sel.t];
      sel = null;
    });
  }
  document.onkeydown = function (e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    else if (e.key === 'Delete') delSel();
  };

  /* --- draw --- */
  function draw() {
    if (!M) return; var s = T * Z, x, y; cv.width = W() * s; cv.height = H() * s;
    cx.font = (10 * Z) + 'px monospace'; cx.textBaseline = 'top';
    for (y = 0; y < H(); y++) for (x = 0; x < W(); x++) {
      var c = M.rows[y][x], t = M.legend[c];
      if (layers.terrain) { cx.fillStyle = t ? col(t) : '#f0f'; cx.fillRect(x * s, y * s, s, s); }
      cx.strokeStyle = 'rgba(0,0,0,.25)'; cx.strokeRect(x * s + .5, y * s + .5, s, s);
      if (layers.labels) { cx.fillStyle = 'rgba(255,255,255,.6)'; cx.fillText(c, x * s + 2, y * s + 2); }
    }
    if (layers.buildings) M.buildings.forEach(function (b, i) {
      var r = b.rect; cx.fillStyle = 'rgba(120,60,20,.35)'; cx.fillRect(r[0] * s, r[1] * s, r[2] * s, r[3] * s);
      cx.lineWidth = 3; cx.strokeStyle = sel && sel.t === 'b' && sel.i === i ? '#fff' : '#c08040'; cx.strokeRect(r[0] * s, r[1] * s, r[2] * s, r[3] * s); cx.lineWidth = 1;
      (b.doors || []).forEach(function (d) { cx.fillStyle = '#ffd040'; cx.fillRect(d[0] * s + s / 4, d[1] * s + s / 4, s / 2, s / 2); });
      (b.windows || []).forEach(function (w) { cx.fillStyle = '#80d0ff'; cx.fillRect(w * s + s / 3, (r[1] + r[3] - 1) * s, s / 3, s / 4); });
      cx.fillStyle = '#fff'; cx.fillText(b.id + (b.chimney !== undefined ? ' ch' + b.chimney : ''), r[0] * s + 3, r[1] * s + 12 * Z);
      cx.fillStyle = '#fff'; cx.fillRect((r[0] + r[2]) * s - 6, (r[1] + r[3]) * s - 6, 6, 6);
    });
    if (layers.objects) M.objects.forEach(function (o, i) {
      cx.fillStyle = sel && sel.t === 'o' && sel.i === i ? '#fff' : '#2050c0'; cx.beginPath(); cx.arc(o.x * s + s / 2, o.y * s + s / 2, s / 4, 0, 7); cx.fill();
      cx.fillStyle = '#fff'; cx.fillText(String(o.id).slice(0, 5), o.x * s + 1, o.y * s + s - 11 * Z);
    });
    if (layers.markers) {
      var mk = function (p, label, color) { if (!p) return; cx.fillStyle = color; cx.fillRect(p[0] * s + 2, p[1] * s + 2, s - 4, s - 4); cx.fillStyle = '#000'; cx.fillText(label, p[0] * s + 3, p[1] * s + s / 2); };
      for (var k in M.stations) mk(M.stations[k], k.slice(0, 5), 'rgba(255,160,0,.8)');
      M.exits.forEach(function (e) { mk([e.x, e.y], '>' + String(e.to).slice(0, 4), 'rgba(255,60,60,.8)'); });
      mk(M.start, 'START', 'rgba(60,255,120,.8)'); mk(M.focus, 'FOCUS', 'rgba(200,120,255,.8)');
      (M.faces || []).forEach(function (f) { cx.strokeStyle = '#f0f'; cx.strokeRect(f.x * s + 4, f.y * s + 4, s - 8, s - 8); });
    }
    if (drag && drag.rect) { cx.strokeStyle = '#fff'; cx.strokeRect(Math.min(drag.x0, drag.lx) * s, Math.min(drag.y0, drag.ly) * s, (Math.abs(drag.lx - drag.x0) + 1) * s, (Math.abs(drag.ly - drag.y0) + 1) * s); }
  }

  /* --- validation --- */
  function validate() {
    var out = [], w = W(), h = H(), k;
    function inb(x, y, what) { if (!(x >= 0 && y >= 0 && x < w && y < h)) out.push(['err', what + ' out of bounds (' + x + ',' + y + ')']); }
    M.rows.forEach(function (r, y) {
      if (r.length !== w) out.push(['err', 'row ' + y + ' length ' + r.length + ' != ' + w]);
      for (var i = 0; i < r.length; i++) if (!(r[i] in M.legend)) { out.push(['err', 'row ' + y + ' char "' + r[i] + '" not in legend']); break; }
    });
    var seen = {};
    M.objects.forEach(function (o) { inb(o.x, o.y, 'object ' + o.id); var kk = o.x + ',' + o.y; if (seen[kk]) out.push(['err', 'objects ' + seen[kk] + ' and ' + o.id + ' share ' + kk]); seen[kk] = o.id; });
    (M.faces || []).forEach(function (f) { inb(f.x, f.y, 'face ' + f.id); });
    M.buildings.forEach(function (b) {
      var r = b.rect; inb(r[0], r[1], 'building ' + b.id); inb(r[0] + r[2] - 1, r[1] + r[3] - 1, 'building ' + b.id + ' corner');
      (b.doors || []).forEach(function (d) { if (!(d[0] >= r[0] && d[1] >= r[1] && d[0] < r[0] + r[2] && d[1] < r[1] + r[3] && (d[0] === r[0] || d[1] === r[1] || d[0] === r[0] + r[2] - 1 || d[1] === r[1] + r[3] - 1))) out.push(['err', 'door ' + d + ' of ' + b.id + ' not on rect edge']); });
    });
    for (k in M.stations) inb(M.stations[k][0], M.stations[k][1], 'station ' + k);
    M.exits.forEach(function (e) { inb(e.x, e.y, 'exit to ' + e.to); });
    ['start', 'focus'].forEach(function (kk) { if (M[kk]) inb(M[kk][0], M[kk][1], kk); });
    (M.path || []).concat(M.spawns || []).forEach(function (p) { inb(p[0], p[1], 'path/spawn'); });
    if (geo() !== base) out.push(['warn', 'maskHash must be recomputed (node tests/world-core.mjs --hashes)']);
    if (!out.length) out.push(['ok', 'all checks pass']);
    $('val').innerHTML = out.map(function (o) { return '<li class="' + o[0] + '">' + o[1].replace(/</g, '&lt;') + '</li>'; }).join('');
  }

  /* --- resize --- */
  function shiftAll(dx, dy) {
    function p(a) { if (a) { a[0] += dx; a[1] += dy; } }
    M.objects.forEach(function (o) { o.x += dx; o.y += dy; }); (M.faces || []).forEach(function (o) { o.x += dx; o.y += dy; });
    M.exits.forEach(function (o) { o.x += dx; o.y += dy; }); M.buildings.forEach(function (b) { shiftBuilding(b, dx, dy); });
    (M.path || []).forEach(p); (M.spawns || []).forEach(p); for (var k in M.stations) p(M.stations[k]);
    p(M.start); p(M.focus); if (Array.isArray(M.frame)) p(M.frame);
  }
  function resize(side, d) {
    mut(function () {
      var fill = paint;
      if (side === 'top') { if (d > 0) M.rows.unshift(fill.repeat(W())); else M.rows.shift(); shiftAll(0, d); }
      if (side === 'bottom') { if (d > 0) M.rows.push(fill.repeat(W())); else M.rows.pop(); }
      if (side === 'left') { M.rows = M.rows.map(function (r) { return d > 0 ? fill + r : r.slice(1); }); shiftAll(d, 0); }
      if (side === 'right') { M.rows = M.rows.map(function (r) { return d > 0 ? r + fill : r.slice(0, -1); }); }
    });
  }
  ['top', 'bottom', 'left', 'right'].forEach(function (s) {
    var tr = document.createElement('tr'); tr.innerHTML = '<td>' + s + '</td><td><button>+1</button></td><td><button>-1</button></td>';
    var bs = tr.querySelectorAll('button'); bs[0].onclick = function () { if (M) resize(s, 1); }; bs[1].onclick = function () { if (M) resize(s, -1); };
    $('resize').appendChild(tr);
  });

  /* --- needs art --- */
  function renderNA() {
    $('naList').innerHTML = ''; needsArt.forEach(function (n, i) {
      var li = document.createElement('li'); li.textContent = n.id + ' - ' + n.description + ' ';
      var x = document.createElement('button'); x.textContent = 'x'; x.onclick = function () { needsArt.splice(i, 1); renderNA(); };
      li.appendChild(x); $('naList').appendChild(li);
    });
  }
  $('naAdd').onclick = function () { if ($('naId').value) { needsArt.push({ id: $('naId').value, description: $('naDesc').value }); $('naId').value = $('naDesc').value = ''; renderNA(); } };
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  $('naExport').onclick = function () { download('needs-art.json', JSON.stringify(needsArt, null, 2)); };

  /* --- top bar --- */
  $('file').onchange = function (e) {
    var f = e.target.files[0]; if (!f) return; var rd = new FileReader();
    rd.onload = function () { try { load(parseMapSource(rd.result), f.name); } catch (err) { alert('Could not parse: ' + err.message); } e.target.value = ''; };
    rd.readAsText(f);
  };
  $('newBtn').onclick = function () {
    var w = +prompt('Width (tiles)', '24'), h = +prompt('Height (tiles)', '14'), ter = prompt('Fill terrain (' + KNOWN_TERRAIN.join(', ') + ')', 'grass'), id = prompt('Map id', 'new_map');
    if (!w || !h || !ter || !id) return; if (KNOWN_TERRAIN.indexOf(ter) < 0) flagArt(ter, 'terrain');
    var rows = []; for (var i = 0; i < h; i++) rows.push('.'.repeat(w));
    load({ header: '// src/data/world/maps/' + id + '.js\n', frozen: [], map: { id: id, name: id, kind: 'town', hunts: [], outdoor: true, light: 'day', ground: 'town_ground', legend: { '.': ter }, rows: rows, faces: [], objects: [], buildings: [], path: [], spawns: [], stations: {}, exits: [], start: [1, 1], maskHash: '' } }, id + '.js');
  };
  $('saveBtn').onclick = function () { if (M) download(fname, serializeMap(doc)); };
  $('undoBtn').onclick = doUndo; $('redoBtn').onclick = doRedo;
  $('zoom').onchange = function (e) { Z = +e.target.value; draw(); };
  $('lgAdd').onclick = function () {
    var c = $('lgChar').value, t = $('lgTer').value; if (!M || !c || !t) return;
    if (KNOWN_TERRAIN.indexOf(t) < 0) flagArt(t, 'terrain');
    paint = c; mut(function () { M.legend[c] = t; });
  };
  $('objAdd').onclick = function () { var v = $('objNew').value.trim(); if (!v) return; if (objIds.indexOf(v) < 0) objIds.push(v); if (KNOWN_OBJECTS.indexOf(v) < 0) flagArt(v, 'object'); if (M) ui(); else { var o = document.createElement('option'); o.textContent = v; $('objId').appendChild(o); } $('objId').value = v; };
  window.__editorLoad = function (text, name) { load(parseMapSource(text), name); };
  renderNA();
})();
