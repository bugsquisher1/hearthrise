'use strict';
// Hunt-sim UI: hunt top bar, view switching, party panel, hunt analyzer and the bottom HUD (bars, 2x10 slots,
// action set / target / stance / distance). Reads sim state through the globals sim.js exposes.
const UI = (() => {
  const $ = id => document.getElementById(id);
  const S = () => window.__S(), AN = () => window.__AN();
  const ORDER = ['knight', 'paladin', 'druid', 'sorcerer'];
  // Hearthrise has no vocations (Tyler 2026-10-16): internal ids stay, players see roles
  const TAG = { knight: 'MEL', paladin: 'RNG', druid: 'HLR', sorcerer: 'MAG' };
  const NAME = { knight: 'Melee', paladin: 'Ranger', druid: 'Healer', sorcerer: 'Mage' };
  const nf = n => Math.round(n).toLocaleString('en-US');
  const kf = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'kk' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
  const hms = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const heroes = () => S().units.filter(u => u.side === 'hero');
  const sel = () => S().units.find(u => u.side === 'hero' && u.kind === VIEW.sel) || heroes()[0];
  const sessionSec = () => S().time - AN().t0;
  const STAMINA_H = 8;   // ASSUMED: an 8 h stamina/session budget, display only

  // ---------- icons ----------
  const ICON = {};
  for (const n of ['fire_rune', 'frost_rune', 'moonbloom_elixir', 'cooked_wolf_meat', 'wheat_bread', 'iron_sword', 'maple_bow', 'apprentice_staff', 'maple_staff',
    'rat_tail', 'bones', 'slime_gel', 'bat_wing', 'venom_sac', 'silk_thread', 'spider_eye', 'bone_chips', 'copper_ore', 'small_fang', 'night_fang', 'sticky_core', 'crown_shard', 'bolt']) {
    const i = new Image(); i.src = `assets/icons/${n}.png?v=35`; ICON[n] = i;
  }
  const ITEM_ICON = { fire_rune: 'fire_rune', frost_rune: 'frost_rune', mana_potion: 'moonbloom_elixir', ham: 'cooked_wolf_meat', bread: 'wheat_bread', bolt: 'bolt' };
  const ITEM_NAME = { fire_rune: 'Fire rune', frost_rune: 'Frost rune', mana_potion: 'Moonbloom tea', ham: 'Ham', bread: 'Bread', bolt: 'Crossbow bolt', mana: 'Mana (regen value)' };
  const ITEM_PRICE = id => id === 'mana' ? SUPPLIES.mana.price : SUPPLIES[id] ? SUPPLIES[id].price : CONSUMABLES[id] ? CONSUMABLES[id].price : 0;
  const BASIC_ICON = { knight: 'iron_sword', paladin: 'maple_bow', sorcerer: 'apprentice_staff', druid: 'maple_staff' };
  const iconUrl = id => `assets/icons/${id}.png?v=35`;

  // ability glyphs (8x8, drawn at 3 px per cell = 24 px, centred in the slot)
  const GLYPH = {
    sword: ['.......#', '......#.', '.....#..', '#..##...', '.##.#...', '..##....', '.#..#...', '#.......'],
    bolt: ['........', '#.......', '.#......', '..######', '.#......', '#.......', '........', '........'],
    leaf: ['.....###', '...#####', '..#####.', '.####.#.', '.###.#..', '.##.#...', '.#......', '#.......'],
    flame: ['...#....', '..##....', '..###...', '.####.#.', '.######.', '########', '.######.', '..####..'],
    shard: ['......##', '.....###', '....###.', '...###..', '..###...', '.###....', '##......', '#.......'],
    star: ['...##...', '...##...', '########', '.######.', '..####..', '.##..##.', '##....##', '........'],
    shield: ['.######.', '#......#', '#..##..#', '#.####.#', '#..##..#', '.#....#.', '..#..#..', '...##...'],
    cross: ['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...'],
    ring: ['..####..', '.#....#.', '#..##..#', '#.#..#.#', '#.#..#.#', '#..##..#', '.#....#.', '..####..'],
    burst: ['#..#...#', '.#.#..#.', '..###...', '########', '..###...', '.#.#.#..', '#..#..#.', '...#...#'],
  };
  const ABIL = {
    challenge: ['star', '#ffd070', 'Draws every monster within 6 tiles back onto the Melee. No stun.'],
    flame_strike: ['flame', '#ff8a30', 'Fire-wrapped melee hit. Uses a fire rune.'],
    power_strike: ['sword', '#f0e6d0', 'A heavy single-target melee strike.'],
    hunters_mark: ['ring', '#ff6060', 'Marks the toughest target: the Ranger deals +20% to it for 8 s.'],
    flame_volley: ['burst', '#ff8a30', 'A volley of burning bolts on a 3x3 cluster. Uses a fire rune and 3 bolts.'],
    precision_shot: ['bolt', '#e8e0c8', 'An aimed crossbow shot for extra damage.'],
    fireball: ['flame', '#ff7a20', 'Fire blast on a 3x3 cluster. Uses a fire rune.'],
    frost_lance: ['shard', '#9fdcff', 'Strong single-target frost damage. Uses a frost rune.'],
    arcane_barrier: ['shield', '#b4a0ff', 'Self shield that absorbs 40 damage. Heal lane.'],
    greater_mend: ['cross', '#7dff8a', 'Heals the most hurt ally under 70% HP.'],
    circle_of_renewal: ['ring', '#7dff8a', 'Heals the whole party when two or more are under 80%.'],
    natures_wrath: ['leaf', '#8fd36a', 'Nature damage on a 3x3 cluster; targets take +10% damage for 6 s.'],
  };
  function glyph(g, name, x, y, col, px) {
    const gl = GLYPH[name]; if (!gl) return; g.fillStyle = col;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gl[r][c] === '#') g.fillRect(x + c * px, y + r * px, px, px);
  }

  // ---------- drag ----------
  // Delegated on the panel itself (headers are rebuilt every few hundred ms), pointer capture on the panel, the panel
  // switched to top/left on grab (a bottom/right anchor would stretch it), and clamped so the header stays on screen.
  function draggable(el) {
    if (el._drag) return; el._drag = true;
    let d = null;
    el.addEventListener('pointerdown', e => {
      const hd = e.target.closest('.hd');
      if (!hd || !el.contains(hd) || e.target.closest('button, input, select, label') || e.button !== 0) return;
      const r = el.getBoundingClientRect();
      Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      el.setPointerCapture(e.pointerId); e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const w = el.offsetWidth;
      const x = Math.min(innerWidth - 40, Math.max(40 - w, e.clientX - d.dx));     // keep at least 40 px of header on screen
      const y = Math.min(innerHeight - 24, Math.max(10, e.clientY - d.dy));        // header row never leaves the top or bottom
      el.style.left = x + 'px'; el.style.top = y + 'px';
    });
    const end = e => { if (d && (!e || e.pointerId === d.id)) { try { el.releasePointerCapture(d.id); } catch (err) { /* already released */ } d = null; } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', () => { d = null; });
  }

  // ---------- top bar + view ----------
  let ended = false;
  // ---------- panels: minimize (title strip only), show/hide, H toggles all; remembered in localStorage ----------
  const PANELS = (() => {
    const IDS = { party: 'Party', hunt: 'Hunt analyzer', hud2: 'Bottom HUD', lootp: 'Loot log', log: 'Pulls log' };
    let st = {};
    try { st = JSON.parse(localStorage.getItem('huntsim-panels') || '{}') || {}; } catch (e) { st = {}; }
    const save = () => { try { localStorage.setItem('huntsim-panels', JSON.stringify(st)); } catch (e) { /* storage blocked: fine */ } };
    const apply = () => { for (const id in IDS) { const el = $(id), p = st[id] || {}; if (!el) continue;
      el.classList.toggle('min', !!p.min); el.classList.toggle('hidden', !!p.hidden || !!st.__allOff); }
      if (!$('panelsMenu')._built) {
        $('panelsMenu')._built = true;
        $('panelsMenu').innerHTML = Object.entries(IDS).map(([id, n]) => `<label><input type="checkbox" data-p="${id}"> ${n}</label>`).join('') +
          '<div style="color:var(--rail-ink);margin-top:3px">H hides / shows all</div>';
        $('panelsMenu').addEventListener('change', e => { const c = e.target.closest('[data-p]'); if (c) set(c.dataset.p, { hidden: !c.checked }); });
      }
      $('panelsMenu').querySelectorAll('[data-p]').forEach(c => { c.checked = !(st[c.dataset.p] || {}).hidden; }); };
    function set(id, patch) { st[id] = Object.assign({}, st[id], patch); if (patch.hidden === false) st.__allOff = false; save(); apply(); }
    // pointerdown, not click: panel headers are re-rendered on a timer and a click across a re-render is lost
    document.addEventListener('pointerdown', e => { if (e.button !== 0) return; const b = e.target.closest('.minb'); if (!b) return;
      const el = b.closest('.pnl, #hud2'); if (el) { e.preventDefault(); set(el.id, { min: !(st[el.id] || {}).min }); } });
    $('panelsBtn').onclick = () => $('panelsMenu').classList.toggle('hidden');
    addEventListener('keydown', e => { if ((e.key === 'h' || e.key === 'H') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { st.__allOff = !st.__allOff; save(); apply(); } });
    return { set, apply, get: id => st[id] || {} };
  })();
  $('details').onclick = () => PANELS.set('hunt', { hidden: !PANELS.get('hunt').hidden });
  $('expand').onclick = () => document.body.classList.toggle('dev');
  $('leave').onclick = () => {
    if (!$('pause').classList.contains('on')) $('pause').click();
    ended = true; PANELS.set('hunt', { hidden: false, min: false }); tab = 'session'; anView = 'party'; slow();
  };
  $('partyCam').onclick = () => { partyCam(); };
  $('keysBtn').onclick = () => {   // open just under the dev bar, whatever height it wrapped to
    $('keysMenu').style.top = ($('bar').getBoundingClientRect().bottom + 4) + 'px';
    $('keysMenu').classList.toggle('hidden');
  };
  addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    const i = '1234'.indexOf(e.key); const hs = heroes();
    if (i >= 0 && hs[i]) selectHero(hs[i].kind);
    if (e.key === 'p' || e.key === 'P') partyCam();
  });

  // ---------- build once, patch in place ----------
  // Panels are built when their SHAPE changes (party composition, analyzer tab / view / fold) and only patched after
  // that: text through the existing text node, widths and classes through memoised writes, list rows keyed by id.
  function T(el, v) {                    // set text without replacing nodes, and only when it changed
    v = String(v); if (el._t === v) return; el._t = v;
    const f = el.firstChild;
    if (f && f.nodeType === 3 && !f.nextSibling) f.nodeValue = v; else el.textContent = v;
  }
  function Wd(el, frac) { const v = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%'; if (el._w !== v) { el._w = v; el.style.width = v; } }
  function K(el, cls, on) { on = !!on; if (!el._k) el._k = {}; if (el._k[cls] !== on) { el._k[cls] = on; el.classList.toggle(cls, on); } }
  function A(el, name, v) { if (!el._a) el._a = {}; if (el._a[name] !== v) { el._a[name] = v; el.setAttribute(name, v); } }
  const mk = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  // ---------- party panel: a dark-wood board of carved stone plates ----------
  let partyKey = '', partyExpand = false, PR = {};
  const ROLE_RING = { knight: 'var(--role-melee)', paladin: 'var(--role-ranger)', sorcerer: 'var(--role-mage)', druid: 'var(--role-healer)' };
  const CREST = { knight: ['sword', '#c9ced6'], paladin: ['bolt', '#9fbf6a'], druid: ['leaf', '#7fd0b8'], sorcerer: ['flame', '#ffb457'] };
  function portrait(c, kind) {           // the hero's own south idle frame, head crop (16x16 from the top of the sprite) at 2x
    const im = new Image(); im.src = `assets/walk/${kind}/idle_south.png?v=35`;
    im.onload = () => {
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      let top = 0;
      try { const t = document.createElement('canvas'); t.width = im.width; t.height = im.height; const tg = t.getContext('2d'); tg.drawImage(im, 0, 0);
        const d = tg.getImageData(0, 0, im.width, im.height).data;
        outer: for (let y = 0; y < im.height; y++) for (let xx = 0; xx < im.width; xx++) if (d[(y * im.width + xx) * 4 + 3] > 40) { top = y; break outer; } } catch (e) { top = 4; }
      x.clearRect(0, 0, 32, 32); x.drawImage(im, Math.round(im.width / 2) - 8, Math.max(0, top - 1), 16, 16, 0, 0, 32, 32);
    };
  }
  function buildParty() {                // shape change only: the composition
    const hs = heroes(); partyKey = hs.map(h => h.kind).join(); PR = {};
    const lead = hs[0], el = $('party');
    el.textContent = '';
    el.append(mk('<span class="cb bl"></span>'), mk('<span class="cb br"></span>'),
      mk(`<div class="hd"><span class="ttl">Party</span><span class="sp"></span><button class="stud" data-act="pExp" title="show DPS / HPS for everyone">⋯</button><button class="minb stud" title="minimize">–</button><button class="stud" data-act="pClose" title="close">×</button></div>`));
    for (const h of hs) {
      const m = mk(`<div class="mem" data-k="${h.kind}" style="--ring:${ROLE_RING[h.kind]}" title="${NAME[h.kind]} — click to view">
        <div class="port">${h === lead ? '<span class="crown" title="leader">♛</span>' : '<span class="link" title="following the leader">⛓</span>'}<canvas width="32" height="32"></canvas><span class="plv" title="level"> </span></div>
        <div class="body">
          <div class="nm"><canvas class="crest" width="16" height="16" title="${NAME[h.kind]}"></canvas><span>${NAME[h.kind]}</span><span class="ag" title="holding aggro"> </span><span class="st"> </span><span class="sp"></span>${h === lead ? '' : '<span class="kick" title="kick (not in the sim)">×</span>'}</div>
          <div class="gg hp" title="health"><div class="gauge"><i style="background:#c8463a"></i></div><b> </b></div>
          <div class="gg mp" title="mana"><div class="gauge"><i style="background:#4e6cc8"></i></div><b> </b></div>
          <div class="stl"><i></i></div>
          <div class="dps">DPS <b> </b> · total <b> </b><div class="h">HPS <b> </b> · total <b> </b></div></div>
        </div></div>`);
      el.append(m);
      const q = s => m.querySelector(s), dps = m.querySelectorAll('.dps b');
      PR[h.kind] = { m, lv: q('.plv'), ag: q('.ag'), st: q('.st'), hp: q('.hp i'), hpn: q('.hp b'), mp: q('.mp i'), mpn: q('.mp b'), stl: q('.stl'), sb: q('.stl i'),
        dps: dps[0], dpt: dps[1], hps: dps[2], hpt: dps[3], hrow: q('.dps .h') };
      portrait(q('.port canvas'), h.kind); const [gn, col] = CREST[h.kind]; glyph(q('.crest').getContext('2d'), gn, 0, 0, col, 2);
    }
    el.append(mk(`<div class="ft"><div class="note">Costs are personal</div><div class="tabs"><button title="Stop accepting all (not in the sim)">⛔</button><button title="Leave party (not in the sim)">⎋</button></div></div>`));
    el.classList.toggle('expand', partyExpand);
    draggable(el); PANELS.apply();
  }
  // one delegated listener for the party board, wired once
  $('party').addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) { if (act.dataset.act === 'pClose') PANELS.set('party', { hidden: true }); else { partyExpand = !partyExpand; $('party').classList.toggle('expand', partyExpand); } return; }
    const m = e.target.closest('.mem'); if (m && !e.target.closest('.kick')) selectHero(m.dataset.k);
  });
  function partyFast() {
    if (heroes().map(h => h.kind).join() !== partyKey) buildParty();
    const sec = Math.max(1, sessionSec()), a = AN();
    for (const h of heroes()) {
      const r = PR[h.kind]; if (!r) continue;
      Wd(r.hp, h.alive ? h.hp / h.maxHp : 0); Wd(r.mp, h.maxMana ? h.mana / h.maxMana : 0);
      T(r.hpn, Math.max(0, Math.round(h.alive ? h.hp : 0))); T(r.mpn, Math.round(h.mana));
      const stam = Math.max(0, STAMINA_H * 3600 - sec); Wd(r.sb, stam / (STAMINA_H * 3600));
      A(r.stl, 'title', `stamina ${Math.floor(stam / 3600)}:${String(Math.floor(stam / 60) % 60).padStart(2, '0')}h left`);
      T(r.lv, h.level);
      T(r.ag, S().units.some(m => m.side === 'mon' && m.alive && m.target === h) ? '⛨' : ' ');
      T(r.st, !h.alive ? '✝' : h.regen ? '🍖' : (S().time - (h.flash.drink || -9)) < 1.2 ? '💧' : ' ');
      const H = a.hero[h.kind] || { dealt: 0 }, healed = a.healed[h.kind] || 0;
      T(r.dps, kf(H.dealt / sec)); T(r.dpt, kf(H.dealt)); T(r.hps, kf(healed / sec)); T(r.hpt, kf(healed)); K(r.hrow, 'hidden', !healed);
      K(r.m, 'sel', VIEW.mode === 'hero' && h.kind === VIEW.sel);
    }
  }

  // ---------- hunt analyzer ----------
  let tab = 'session', anView = 'hero', collapsed = {}, anShape = '', AR = {};
  const abName = id => id === 'basic' ? 'Basic attack' : (Object.values(ABILITIES).flat().find(x => x.id === id) || { name: id }).name;
  // the frame: built once
  $('hunt').append(mk('<span class="cb bl"></span>'), mk('<span class="cb br"></span>'),
    mk(`<div class="hd"><span class="ttl">Hunt Analyzer</span><span class="sp"></span><button data-act="anRst" class="stud" title="reset the session">⟲</button><button class="minb stud" title="minimize">–</button></div>`),
    mk('<div class="ended hidden">Hunt ended — session summary</div>'),
    mk(`<div class="top"><span title="time hunted this session">Session<b> </b></span><span title="estimated time to the viewed hero's next level" style="text-align:right">Next level<b> </b></span></div>`),
    mk(`<div class="tg"><button data-v="hero">This hero</button><button data-v="party">Party</button></div>`),
    mk(`<div class="tabs"><button data-t="session" title="session totals">⌛ Session</button><button data-t="in" title="damage taken">⛨ Taken</button><button data-t="out" title="damage dealt">⚔ Dealt</button></div>`),
    mk('<div class="pane"></div>'));
  const HN = { ended: $('hunt').querySelector('.ended'), ses: $('hunt').querySelectorAll('.top b')[0], next: $('hunt').querySelectorAll('.top b')[1],
    vHero: $('hunt').querySelector('[data-v="hero"]'), vParty: $('hunt').querySelector('[data-v="party"]'), pane: $('hunt').querySelector('.pane'), tabs: $('hunt').querySelectorAll('[data-t]') };
  $('hunt').addEventListener('click', e => {
    const b = e.target.closest('[data-act="anRst"], [data-v], [data-t], [data-s]'); if (!b) return;
    if (b.dataset.act) { window.__resetAnalyzer(); ended = false; }
    else if (b.dataset.v) anView = b.dataset.v;
    else if (b.dataset.t) tab = b.dataset.t;
    else collapsed[b.dataset.s] = !collapsed[b.dataset.s];
    slow();
  });
  // sections: fixed rows (k -> value) or keyed lists; built on shape change
  const SECTIONS = {
    session: [['s', 'Session', 'fixed', ['Enemies killed', 'XP gain', 'Gold', 'Waste', 'Balance']], ['h', 'Per hour', 'fixed', ['XP/h', 'Raw XP/h', 'Gold/h', 'Waste/h', 'Balance/h']],
      ['u', 'Supplies used', 'list'], ['l', 'Loot collected', 'list']],
    in: [['im', 'Damage taken by monster', 'list'], ['ie', 'Damage taken by element', 'list']],
    out: [['oa', 'Damage dealt by ability', 'list'], ['oe', 'Damage dealt by element', 'list']],
  };
  function buildPane() {
    const sameTab = anShape && anShape.startsWith(tab + '|' + anView + '|'), keep = HN.pane.scrollTop;   // folding keeps your place
    anShape = tab + '|' + anView + '|' + JSON.stringify(collapsed); AR = {};
    HN.pane.textContent = '';
    if (sameTab) queueMicrotask(() => { HN.pane.scrollTop = keep; });
    for (const [id, title, kind, rows] of SECTIONS[tab]) {
      const sec = mk(`<div class="sec"><div class="sh" data-s="${id}" title="click to fold">${collapsed[id] ? '▸' : '▾'} <span>${title}</span></div><div class="rows"></div></div>`);
      HN.pane.append(sec);
      const box = sec.querySelector('.rows'), head = sec.querySelector('.sh span');
      AR[id] = { box, head, kind, rows: new Map() };
      if (collapsed[id]) continue;
      if (kind === 'fixed') for (const k of rows) { const r = mk(`<div class="row"><span class="k">${k}</span><span class="v"> </span></div>`); box.append(r); AR[id].rows.set(k, { r, v: r.querySelector('.v') }); }
    }
  }
  function patchList(id, entries, makeRow, fill) {   // keyed rows: add once, update in place, drop when gone
    const S_ = AR[id]; if (!S_ || collapsed[id]) return;
    const keys = new Set(entries.map(e => e[0]));
    for (const [k, r] of S_.rows) if (!keys.has(k)) { r.r.remove(); S_.rows.delete(k); }
    for (const e of entries) { let r = S_.rows.get(e[0]); if (!r) { r = makeRow(e); S_.box.append(r.r); S_.rows.set(e[0], r); } fill(r, e); }
    if (!S_.empty) { S_.empty = mk('<div class="row"><span class="k">—</span></div>'); S_.box.append(S_.empty); }
    K(S_.empty, 'hidden', entries.length > 0);
  }
  const listRow = (icon) => (e) => { const r = mk(`<div class="row">${icon ? icon(e[0]) : ''}<span class="k"> </span><span class="x"> </span><span class="v"> </span></div>`);
    return { r, k: r.querySelector('.k'), x: r.querySelector('.x'), v: r.querySelector('.v') }; };
  const setV = (row, k, v, neg) => { const r = AR[row].rows.get(k); if (!r) return; T(r.v, v); K(r.v, 'dn', neg); };
  function slow() {
    if (!S()) return;
    const a = AN(), s = S(), hs = heroes(), h = sel(), secs = Math.max(1, sessionSec()), hrs = secs / 3600;
    const heroMode = anView === 'hero' && h;
    if ((tab + '|' + anView + '|' + JSON.stringify(collapsed)) !== anShape) buildPane();
    const H = heroMode ? (a.hero[h.kind] || { supplies: {}, outAb: {}, outEl: {}, inMon: {}, inEl: {}, xp: 0 }) : null;
    const supplies = heroMode ? H.supplies : a.supplies;
    const waste = Object.entries(supplies).reduce((t, [id, n]) => t + n * ITEM_PRICE(id), 0);
    const income = (a.loot + a.gold) / (heroMode ? Math.max(1, hs.length) : 1);   // loot split evenly; costs are personal
    const xp = heroMode ? H.xp : a.xp, bal = income - waste;
    const hxp = h && a.hero[h.kind] ? a.hero[h.kind].xp : 0;
    const nextLv = h && hxp > 0 ? ((h.level - HERO_START_LEVEL + 1) * HERO_XP_PER_LEVEL - h.xp) / (hxp / secs) : Infinity;
    K(HN.ended, 'hidden', !ended);
    T(HN.ses, hms(secs)); T(HN.next, isFinite(nextLv) ? hms(nextLv) : '--:--:--');
    T(HN.vHero, 'This hero' + (h ? ' (' + NAME[h.kind] + ')' : '')); K(HN.vHero, 'on', anView === 'hero'); K(HN.vParty, 'on', anView === 'party');
    HN.tabs.forEach(b => K(b, 'on', b.dataset.t === tab));
    const gp = n => nf(n) + ' gp';
    if (tab === 'session') {
      if (!collapsed.s) { setV('s', 'Enemies killed', nf(a.kills)); setV('s', 'XP gain', nf(xp)); setV('s', 'Gold', gp(income), income < 0); setV('s', 'Waste', gp(waste), true); setV('s', 'Balance', gp(bal), bal < 0); }
      if (!collapsed.h) { setV('h', 'XP/h', nf(xp / hrs)); setV('h', 'Raw XP/h', nf(xp / hrs)); setV('h', 'Gold/h', gp(income / hrs)); setV('h', 'Waste/h', gp(waste / hrs), true); setV('h', 'Balance/h', gp(bal / hrs), bal < 0); }
      patchList('u', Object.entries(supplies).filter(([, n]) => n > 0), listRow(id => ITEM_ICON[id] || ICONMAP[id] ? `<img src="${ICONMAP[id] ? ICONMAP[id].src : iconUrl(ITEM_ICON[id])}">` : '<span style="width:16px;display:inline-block"></span>'),
        (r, [id, n]) => { T(r.k, ITEM_NAME[id] || (CONSUMABLES[id] && CONSUMABLES[id].name) || id); T(r.x, '×' + nf(n)); T(r.v, gp(n * ITEM_PRICE(id))); K(r.v, 'dn', true); });
      if (AR.l) T(AR.l.head, heroMode ? 'Loot collected (split evenly)' : 'Loot collected');
      patchList('l', Object.entries(a.lootItems), listRow(id => `<img src="${iconUrl(id)}">`),
        (r, [id, n]) => { T(r.k, id.replace(/_/g, ' ')); T(r.x, '×' + n); T(r.v, gp(n * (LOOT_VALUE[id] || 0))); });
    } else {
      const src = heroMode ? H : a, out = tab === 'out';
      const lists = out ? [['oa', src.outAb, abName], ['oe', src.outEl, k => k]] : [['im', src.inMon, k => k], ['ie', src.inEl, k => k]];
      for (const [id, obj, name] of lists) patchList(id, Object.entries(obj).sort((x, y) => y[1] - x[1]), listRow(null),
        (r, [k, v]) => { T(r.k, name(k)); T(r.x, ' '); T(r.v, nf(v)); K(r.v, 'dn', !out); });
    }
    // top bar timer and view label: fixed structure, patched
    const next = s.packs.filter(p => !p.alive).map(p => p.respawnAt - s.time).filter(t => t > 0).sort((x, y) => x - y)[0];
    T(TB.rl, next != null ? 'READY IN ' : 'SESSION '); T(TB.rv, next != null ? `${Math.floor(next / 60)}:${String(Math.floor(next % 60)).padStart(2, '0')}` : hms(secs));
    T(TB.vl, 'Viewing '); T(TB.vv, VIEW.mode === 'party' ? 'Party (free cam)' : NAME[h.kind]); T(TB.vh, VIEW.mode === 'party' ? '' : ' · 1–4 switch · P party cam');
    syncRight();
    T(TB.loot, a.log.join('\n') || '—');
  }
  const TB = (() => {
    $('ready').textContent = ''; $('ready').append(mk('<span> </span>'), mk('<b> </b>'));
    $('viewlbl').textContent = ''; $('viewlbl').append(mk('<span> </span>'), mk('<b> </b>'), mk('<span> </span>'));
    $('lootBody').textContent = ' ';
    const r = $('ready').children, v = $('viewlbl').children;
    return { rl: r[0], rv: r[1], vl: v[0], vv: v[1], vh: v[2], loot: $('lootBody') };
  })();
  draggable($('hunt')); draggable($('lootp')); draggable($('log'));

  // ---------- bottom HUD: "Hearthrise light" ----------
  // One canvas at 1:1 (integer scale, 1 px iron lines): a dark-wood rail carrying 2x5 stone tablets either side of a
  // round iron hearth emblem (ember fill = level %), curved HP (warm) and mana (cool) gauges round it, a thin stamina
  // arc beneath, and two round sockets (food, charm). The control plaque sits to the right as DOM.
  const C = {   // src/styles/tokens.css (Charcoal & Gold) where a token exists
    bg0: '#0a0b0e', bg1: '#101217', bg2: '#1a1d23', bg3: '#252931', ink: '#e9e7e2', ink2: '#b8bcc4', ink3: '#979da7',
    gold: '#c9a24a', gold2: '#e3c77e', red: '#dc5f4c', gem: '#5262b3', steel: '#808b98', aqua: '#5c8f89',
    iron: '#0a0b0e', iron2: '#16191e', plank0: '#1f2329', plank1: '#14161b', seam: 'rgba(0,0,0,.55)', flame: '#ffd08a', lit: '#ffb457',
    oxblood: '#8e3324', railInk: '#cbbc9e', mana: '#6a86d6',   // mana: a lifted --gem so the gauge reads on the rail (no token yet)
  };
  // Layout scales with the window (never the text down): 34 px tablets at the 800 px pane, 44 px at 1200+ (~25% bigger).
  let SL = 34, GAP = 3, HALF = 0, MID = 0, PAD = 8, W_FULL = 0, H_FULL = 0;
  function layout() {
    SL = innerWidth >= 1200 ? 44 : 34; MID = innerWidth >= 1200 ? 280 : 236;
    HALF = 5 * (SL + GAP) - GAP; W_FULL = PAD * 2 + HALF * 2 + MID + 16; H_FULL = Math.max(2 * (SL + GAP) - GAP + PAD * 2 + 4, 112);
  }
  const FONT = "'Alegreya Sans', system-ui, sans-serif";
  const cv = $('hudCanvas'), g = cv.getContext('2d');
  let ICONMAP = {};
  fetch('assets/icons/manifest.json?v=35').then(r => r.ok ? r.json() : null).then(m => {
    if (!m) return;
    const map = m.icons || m.abilities || m;
    for (const [id, f] of Object.entries(map)) { if (typeof f !== 'string') continue; const i = new Image(); i.src = 'assets/icons/' + f.replace(/^.*icons\//, ''); ICONMAP[id] = i; }
  }).catch(() => {});
  const ready = i => i && i.complete && i.naturalWidth;

  function tablet(x, y) {               // carved dark-stone tablet with four iron rivets
    g.fillStyle = C.bg2; g.fillRect(x, y, SL, SL);
    g.fillStyle = 'rgba(214,224,240,.07)'; g.fillRect(x, y, SL, 1); g.fillRect(x, y, 1, SL);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y + SL - 1, SL, 1); g.fillRect(x + SL - 1, y, 1, SL);
    g.fillStyle = C.iron; g.fillRect(x - 1, y - 1, SL + 2, 1); g.fillRect(x - 1, y + SL, SL + 2, 1); g.fillRect(x - 1, y, 1, SL); g.fillRect(x + SL, y, 1, SL);
    g.fillStyle = C.steel; for (const [rx, ry] of [[2, 2], [SL - 4, 2], [2, SL - 4], [SL - 4, SL - 4]]) g.fillRect(x + rx, y + ry, 2, 2);
  }
  function crack(x, y) {
    const k = SL / 36, pts = [[6, 4], [13, 12], [11, 17], [19, 23], [17, 28], [26, 33]].map(([a, b]) => [Math.round(a * k), Math.round(b * k)]);
    g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + pts[0][0] + .5, y + pts[0][1] + .5); for (const [px, py] of pts.slice(1)) g.lineTo(x + px + .5, y + py + .5); g.stroke();
    g.strokeStyle = 'rgba(214,224,240,.22)'; g.beginPath(); g.moveTo(x + pts[0][0] + 1.5, y + pts[0][1] + .5); for (const [px, py] of pts.slice(1)) g.lineTo(x + px + 1.5, y + py + .5); g.stroke();
  }
  // all canvas text uses the UI font at >= 12 px; numbers bold 14-16 px; an outline keeps it legible over art
  function text(t, x, y, col, size, align, weight, base) {
    g.font = `${weight || 500} ${Math.max(12, size || 12)}px ${FONT}`; g.textAlign = align || 'left'; g.textBaseline = base || 'top';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineJoin = 'round'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y);
  }
  function drawSlot(u, s, i, x, y) {
    tablet(x, y);
    if (!s) return;
    const icon = s.ab ? ICONMAP[s.ab.id] : s.kind === 'basic' ? (ICONMAP['basic_' + NAME[u.kind].toLowerCase()] || ICON[BASIC_ICON[u.kind]]) : ICONMAP[s.id] || ICON[ITEM_ICON[s.id]];
    if (s.unusable) g.filter = 'grayscale(1) brightness(.55)';
    const o = Math.floor((SL - 32) / 2);
    if (ready(icon)) g.drawImage(icon, x + o, y + o, 32, 32);
    else if (s.ab) { const [gn, col] = ABIL[s.ab.id] || ['star', '#ccc']; glyph(g, gn, x + Math.floor((SL - 24) / 2), y + Math.floor((SL - 24) / 2), col, 3); }
    g.filter = 'none';
    if (s.unusable) crack(x, y);
    if (s.cd > 0.05 && s.cdMax) {   // cooldown: an ember rising from the bottom, with the seconds left
      const f = Math.min(1, 1 - s.cd / s.cdMax), h = Math.round((SL - 2) * f);
      g.fillStyle = 'rgba(10,11,14,.62)'; g.fillRect(x + 1, y + 1, SL - 2, SL - 2 - h);
      const eg = g.createLinearGradient(0, y + SL - 1 - h, 0, y + SL - 1);
      eg.addColorStop(0, 'rgba(255,180,87,.40)'); eg.addColorStop(1, 'rgba(142,51,36,.30)');
      g.fillStyle = eg; g.fillRect(x + 1, y + SL - 1 - h, SL - 2, h);
      g.fillStyle = C.lit; g.fillRect(x + 1, y + SL - 1 - h, SL - 2, 1);
      text(s.cd < 10 ? s.cd.toFixed(1) : String(Math.ceil(s.cd)), x + SL / 2, y + SL / 2, C.flame, 15, 'center', 800, 'middle');
    } else if (!s.unusable && s.kind !== 'item') {
      g.fillStyle = 'rgba(227,199,126,.6)'; g.fillRect(x + 1, y + 1, SL - 2, 1); g.fillRect(x + 1, y + 1, 1, SL - 2);
    }
    if (s.cost) text(String(s.cost), x + 2, y, '#b9c8f4', 12, 'left', 800);
    if (s.badge) text(s.badge, x + 2, y + SL - 13, C.gold2, 12, 'left', 700);
    if (s.count != null) text(String(s.count), x + SL - 2, y, s.count ? '#f2ead8' : '#f0907e', 12, 'right', 800);
    const fl = s.flashKey ? S().time - (u.flash[s.flashKey] ?? -99) : 99;
    if (fl < 0.3) { g.fillStyle = `rgba(255,208,138,${(0.45 * (1 - fl / 0.3)).toFixed(2)})`; g.fillRect(x + 1, y + 1, SL - 2, SL - 2); }
  }
  function rail(w, h) {
    g.fillStyle = C.plank1; g.fillRect(0, 0, w, h);
    g.fillStyle = C.plank0; g.fillRect(0, 4, w, Math.floor(h / 2) - 4);
    g.fillStyle = C.seam; g.fillRect(0, Math.floor(h / 2), w, 1);
    g.fillStyle = 'rgba(236,225,204,.028)'; for (let x = 7; x < w; x += 23) g.fillRect(x, 6, 9, 1);
    g.fillStyle = C.iron; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    g.fillStyle = C.iron2; g.fillRect(1, 1, w - 2, 1);
  }
  function arc(cx, cy, r, a0, a1, width, col) { g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'butt'; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); }
  function heart(x, y, col) { g.fillStyle = col; g.beginPath(); g.moveTo(x + 5, y + 9); g.lineTo(x, y + 4); g.arc(x + 2.5, y + 2.5, 2.5, Math.PI, 0); g.arc(x + 7.5, y + 2.5, 2.5, Math.PI, 0); g.lineTo(x + 5, y + 9); g.fill(); }
  function drop(x, y, col) { g.fillStyle = col; g.beginPath(); g.moveTo(x + 4, y); g.quadraticCurveTo(x + 9, y + 6, x + 4, y + 10); g.quadraticCurveTo(x - 1, y + 6, x + 4, y); g.fill(); }
  function glass(x, y, col) { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y); g.lineTo(x, y + 10); g.lineTo(x + 8, y + 10); g.closePath(); g.stroke(); }
  let hits = [];   // hover regions on the emblem: [x, y, w, h, title, detail]
  function emblem(u, cx, cy) {
    const into = u.xp - (u.level - HERO_START_LEVEL) * HERO_XP_PER_LEVEL, pct = Math.max(0, Math.min(1, into / HERO_XP_PER_LEVEL));
    const r = 28, GR = 42, GW = 7, hp = u.alive ? Math.max(0, u.hp / u.maxHp) : 0, mp = u.maxMana ? u.mana / u.maxMana : 0;
    const L0 = Math.PI * 0.62, L1 = Math.PI * 1.38, R0 = -Math.PI * 0.38, R1 = Math.PI * 0.38;
    arc(cx, cy, GR, L0, L1, GW + 2, C.iron); arc(cx, cy, GR, L0, L1, GW, C.bg0); arc(cx, cy, GR, L0, L0 + (L1 - L0) * hp, GW, C.red);
    arc(cx, cy, GR, R0, R1, GW + 2, C.iron); arc(cx, cy, GR, R0, R1, GW, C.bg0); arc(cx, cy, GR, R1 - (R1 - R0) * mp, R1, GW, C.mana);
    // XP: a thin gold ring segment round the hearth; stamina: a thin teal arc beneath it
    arc(cx, cy, r + 4, -Math.PI / 2, Math.PI * 1.5, 2, C.bg0); arc(cx, cy, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, 2, C.gold2);
    const stam = Math.max(0, STAMINA_H * 3600 - sessionSec()) / (STAMINA_H * 3600);
    arc(cx, cy, r + 9, Math.PI * 0.70, Math.PI * 0.30, 2, C.bg0); arc(cx, cy, r + 9, Math.PI * 0.70, Math.PI * 0.70 - Math.PI * 0.40 * stam, 2, C.aqua);
    g.fillStyle = C.iron; g.beginPath(); g.arc(cx, cy, r + 2, 0, 7); g.fill();
    g.strokeStyle = C.steel; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r + 1.5, 0, 7); g.stroke();
    g.fillStyle = '#08090b'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r - 1, 0, 7); g.clip();
    const top = cy + r - 2 * r * pct, eg = g.createLinearGradient(0, top, 0, cy + r);
    eg.addColorStop(0, C.lit); eg.addColorStop(0.35, '#c8641e'); eg.addColorStop(1, C.oxblood);
    g.fillStyle = eg; g.fillRect(cx - r, top, 2 * r, cy + r - top); g.restore();
    text('Lv', cx, cy - 24, '#e7d9bd', 12, 'center', 700);
    text(String(u.level), cx, cy - 11, C.flame, 16, 'center', 800);
    text(`XP ${Math.floor(pct * 100)}%`, cx, cy + 7, '#e7d9bd', 12, 'center', 700);
    // HP and MP readouts, labelled, with regen per second underneath
    const lx = cx - GR - 10, rx = cx + GR + 10;
    heart(lx - 70, cy - 26, C.red); text('HP', lx - 58, cy - 30, '#f0b0a4', 12, 'left', 700);
    text(`${Math.max(0, Math.round(u.alive ? u.hp : 0))}/${u.maxHp}`, lx, cy - 14, '#f0907e', 15, 'right', 800);
    const hpR = u.regen ? u.regen.perSec : 0;
    text(`+${hpR.toFixed(0)}/s`, lx, cy + 4, '#b8bcc4', 12, 'right', 500);
    drop(rx + 2, cy - 30, C.mana); text('MP', rx + 14, cy - 30, '#b9c8f4', 12, 'left', 700);
    text(`${Math.round(u.mana)}/${u.maxMana}`, rx, cy - 14, '#b9c8f4', 15, 'left', 800);
    const mpR = u.maxMana * COMBAT.manaRegenPerMin / 60;
    text(`+${mpR.toFixed(1)}/s${u.shield > 0 ? '  ◈' + Math.round(u.shield) : ''}`, rx, cy + 4, '#b8bcc4', 12, 'left', 500);
    const sh = Math.max(0, STAMINA_H * 3600 - sessionSec()), shT = `${Math.floor(sh / 3600)}:${String(Math.floor(sh / 60) % 60).padStart(2, '0')}h`;
    glass(cx - 26, cy + r + 13, '#9fd0c4'); text(shT, cx + 4, cy + r + 10, '#cfe6e0', 12, 'center', 700);
    hits.push([lx - 74, cy - 32, 80, 52, 'Health', `${Math.round(u.hp)} / ${u.maxHp} HP (${Math.round(hp * 100)}%). Regen +${hpR.toFixed(1)}/s from food.`]);
    hits.push([rx - 4, cy - 32, 90, 52, 'Mana', `${Math.round(u.mana)} / ${u.maxMana} MP (${Math.round(mp * 100)}%). Regen +${mpR.toFixed(1)}/s.${u.shield > 0 ? ` Arcane shield ${Math.round(u.shield)}.` : ''}`]);
    hits.push([cx - r, cy - r, 2 * r, 2 * r, 'Level and XP', `Level ${u.level}. ${Math.round(into)} / ${HERO_XP_PER_LEVEL} XP to level ${u.level + 1} (${(pct * 100).toFixed(1)}%).`]);
    hits.push([cx - 34, cy + r + 6, 68, 18, 'Stamina', `${shT} of hunting left in this session (display only).`]);
  }
  function socket(x, y, draw, label, tip) {
    g.fillStyle = C.iron; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill();
    g.strokeStyle = C.steel; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 12.5, 0, 7); g.stroke();
    g.fillStyle = '#08090b'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
    draw(); text(label, x, y + 15, '#e7d9bd', 12, 'center', 700);
    hits.push([x - 16, y - 14, 32, 44, tip[0], tip[1]]);
  }
  let slotList = [], slotRects = [], hudMin = false;
  function drawHud() {
    const u = sel(); if (!u) return;
    layout(); hits = [];
    hudMin = $('hud2').classList.contains('min');
    const w = hudMin ? MID + PAD * 2 : W_FULL, h = H_FULL;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
    rail(w, h);
    slotList = slotsFor(u); slotRects = [];
    const midX = hudMin ? PAD : PAD + HALF + 8, top = Math.floor((h - (2 * (SL + GAP) - GAP)) / 2);
    if (!hudMin) for (let i = 0; i < 20; i++) {
      const col = i % 10, row = Math.floor(i / 10), side = col < 5 ? 0 : 1, c5 = col % 5;
      const x = side === 0 ? PAD + c5 * (SL + GAP) : PAD + HALF + 16 + MID + c5 * (SL + GAP), y = top + row * (SL + GAP);
      slotRects[i] = [x, y]; drawSlot(u, slotList[i], i, x, y);
    }
    emblem(u, midX + MID / 2, Math.floor(h / 2) - 8);
    if (!hudMin) {
      const L = LOADOUTS[u.kind], fi = ICONMAP[L.food[0]] || ICON[ITEM_ICON[L.food[0]]], fd = CONSUMABLES[L.food[0]];
      socket(midX + 22, h - 34, () => { if (ready(fi)) g.drawImage(fi, midX + 14, h - 42, 16, 16); }, `Food ×${u.food}`,
        [fd.name, `${u.food} left. ${fd.hp} HP (half at once, half over 6 s) when HP falls under ${Math.round(fd.below * 100)}%.`]);
      socket(midX + MID - 22, h - 34, () => glyph(g, 'ring', midX + MID - 30, h - 42, C.gold, 2), 'Charm', ['Charm', 'Empty charm socket (not in the sim yet).']);
    }
  }
  function slotsFor(u) {
    const L = LOADOUTS[u.kind], out = [];
    out.push({ kind: 'basic', type: 'attack', name: 'Basic attack', cost: HEROES[u.kind].basic.mana || null, cd: Math.max(0, u.swing), cdMax: COMBAT.swing, flashKey: 'basic',
      tip: `Every ${COMBAT.swing.toFixed(1)} s${HEROES[u.kind].basic.mana ? `, ${HEROES[u.kind].basic.mana} mana` : ''}${HEROES[u.kind].basic.ammo ? ', 1 bolt' : ''}.`,
      unusable: HEROES[u.kind].basic.mana && u.mana < HEROES[u.kind].basic.mana });
    for (const ab of ABILITIES[u.kind]) if (!ACTION_SETS[u.set.actSet].skip(ab)) {
      const left = Math.max(0, (u.cd[ab.id] || 0) - S().time);
      out.push({ kind: 'ab', ab, type: 'spell', name: ab.name, cost: ab.mana || null, cd: left, cdMax: ab.cd, flashKey: ab.id,
        tip: `${ab.mana ? ab.mana + ' mana · ' : ''}${ab.cd} s cooldown · ${ab.lane} lane${ab.rune ? ' · 1 ' + ITEM_NAME[ab.rune].toLowerCase() : ''}. ${ABIL[ab.id] ? ABIL[ab.id][2] : ''}`,
        unusable: !!(ab.mana && u.mana < ab.mana) });
    }
    for (const [r, n] of Object.entries(u.runes || {})) out.push({ kind: 'item', id: r, type: 'rune', name: ITEM_NAME[r], count: n, tip: `${n} carried; store runes cover the rest (${SUPPLIES[r].price} gp each).` });
    const fd = CONSUMABLES[L.food[0]], dr = CONSUMABLES[L.drink[0]];
    const lane = Math.max(0, (u.lane.consume || 0) - S().time);
    out.push({ kind: 'item', id: L.food[0], type: 'food', name: fd.name, count: u.food, cd: lane, cdMax: CONSUMABLE_LANE, flashKey: 'food', badge: Math.round((u.set.foodBelow ?? fd.below) * 100) + '%',
      tip: `${fd.hp} HP (half at once, half over 6 s) · eaten under ${Math.round(fd.below * 100)}% HP when no heal is coming · ${fd.price} gp.`, unusable: !u.food });
    out.push({ kind: 'item', id: L.drink[0], type: 'potion', name: dr.name, count: u.drink, cd: lane, cdMax: CONSUMABLE_LANE, flashKey: 'drink', badge: Math.round((u.set.drinkBelow ?? dr.below) * 100) + '%',
      tip: `${dr.mana ? '+' + dr.mana + ' mana' : '+' + dr.hp + ' HP'} (half at once, half over 6 s) under ${Math.round(dr.below * 100)}% ${dr.mana ? 'mana' : 'HP'} · ${dr.price} gp.`, unusable: !u.drink });
    return out;
  }
  // tooltip: slots and every emblem element
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const i = slotRects.findIndex(p => p && mx >= p[0] && mx < p[0] + SL && my >= p[1] && my < p[1] + SL), s = slotList[i];
    const hit = !s && hits.find(([x, y, w, h]) => mx >= x && mx < x + w && my >= y && my < y + h);
    const tip = $('tip');
    if (!s && !hit) { tip.style.display = 'none'; return; }
    const html = s ? `<div class="n">${s.name}</div><div class="c">${s.tip}</div>` : `<div class="n">${hit[4]}</div><div class="c">${hit[5]}</div>`;
    if (tip._h !== html) { tip._h = html; tip.innerHTML = html; }
    tip.style.display = 'block'; tip.style.left = Math.min(innerWidth - 250, e.clientX + 12) + 'px'; tip.style.top = Math.max(4, e.clientY - 80) + 'px';
  });
  cv.addEventListener('mouseleave', () => { $('tip').style.display = 'none'; });

  // the carved control plaque: action set, target, stance + chase, distance — per selected hero, live in the sim
  $('plaque').innerHTML = `<label>Action set<select id="rSet">${Object.entries(ACTION_SETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></label>
    <label>Target<select id="rTgt"></select></label>
    <div class="modes"><button data-st="offensive" title="Offensive: +10% damage dealt and taken">Off</button><button data-st="balanced" title="Balanced">Bal</button><button data-st="defensive" title="Defensive: -10% dealt, -15% taken">Def</button><button class="chase" id="rChase" title="Chase / follow the target">Chase</button></div>
    <div class="dist">Distance<button id="dMinus">−</button><b id="dVal"></b><button id="dPlus">+</button></div>`;
  let syncedFor = null;
  function syncRight(force) {
    const u = sel(); if (!u) return;
    if (syncedFor !== u.kind || force) {
      syncedFor = u.kind;
      const lead = heroes()[0];
      $('rTgt').innerHTML = Object.entries(TARGET_MODES).map(([k, v]) => `<option value="${k}">${k === 'follow' ? 'Follow ' + (u === lead ? '(self: nearest)' : NAME[lead.kind]) : v}</option>`).join('');
    }
    $('rSet').value = u.set.actSet; $('rTgt').value = u.set.target; T($('dVal'), u.set.dist);
    $('plaque').querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', u.set.stance === b.dataset.st));
    $('rChase').classList.toggle('on', u.set.chase);
  }
  $('rSet').onchange = e => { sel().set.actSet = e.target.value; };
  $('rTgt').onchange = e => { sel().set.target = e.target.value; };
  $('plaque').querySelectorAll('[data-st]').forEach(b => b.onclick = () => { sel().set.stance = b.dataset.st; syncRight(); });
  $('rChase').onclick = () => { sel().set.chase = !sel().set.chase; syncRight(); };
  $('dMinus').onclick = () => { const u = sel(); u.set.dist = Math.max(1, u.set.dist - 1); syncRight(); };
  $('dPlus').onclick = () => { const u = sel(); u.set.dist = Math.min(8, u.set.dist + 1); syncRight(); };

  let lastFast = 0;
  function frame(now) {
    if (!S()) return;
    drawHud();
    if (now - lastFast > 100) { lastFast = now; partyFast(); }
  }
  return { frame, slow };
})();
window.UI = UI;
