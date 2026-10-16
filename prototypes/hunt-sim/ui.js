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
    const i = new Image(); i.src = `assets/icons/${n}.png?v=14`; ICON[n] = i;
  }
  const ITEM_ICON = { fire_rune: 'fire_rune', frost_rune: 'frost_rune', mana_potion: 'moonbloom_elixir', health_potion: 'moonbloom_elixir', ham: 'cooked_wolf_meat', bread: 'wheat_bread', bolt: 'bolt' };
  const ITEM_NAME = { fire_rune: 'Fire rune', frost_rune: 'Frost rune', mana_potion: 'Mana potion', health_potion: 'Health potion', ham: 'Ham', bread: 'Bread', bolt: 'Crossbow bolt', mana: 'Mana (regen value)' };
  const ITEM_PRICE = id => id === 'mana' ? SUPPLIES.mana.price : SUPPLIES[id] ? SUPPLIES[id].price : CONSUMABLES[id] ? CONSUMABLES[id].price : 0;
  const BASIC_ICON = { knight: 'iron_sword', paladin: 'maple_bow', sorcerer: 'apprentice_staff', druid: 'maple_staff' };
  const iconUrl = id => `assets/icons/${id}.png?v=14`;

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
  function draggable(el) {
    const hd = el.querySelector('.hd'); if (!hd) return;
    let d = null;
    hd.addEventListener('pointerdown', e => { if (e.target.tagName === 'BUTTON') return; d = [e.clientX - el.offsetLeft, e.clientY - el.offsetTop]; hd.setPointerCapture(e.pointerId); });
    hd.addEventListener('pointermove', e => { if (!d) return; el.style.left = Math.max(0, e.clientX - d[0]) + 'px'; el.style.top = Math.max(0, e.clientY - d[1]) + 'px'; el.style.right = 'auto'; });
    hd.addEventListener('pointerup', () => { d = null; });
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
      $('panelsMenu').innerHTML = Object.entries(IDS).map(([id, n]) => `<label><input type="checkbox" data-p="${id}" ${(st[id] || {}).hidden ? '' : 'checked'}> ${n}</label>`).join('') +
        '<div style="color:var(--dim);margin-top:3px">H hides / shows all</div>';
      $('panelsMenu').querySelectorAll('[data-p]').forEach(c => c.onchange = () => set(c.dataset.p, { hidden: !c.checked })); };
    function set(id, patch) { st[id] = Object.assign({}, st[id], patch); if (patch.hidden === false) st.__allOff = false; save(); apply(); }
    document.addEventListener('click', e => { const b = e.target.closest('.minb'); if (!b) return;
      const el = b.closest('.pnl, #hud2'); if (el) set(el.id, { min: !(st[el.id] || {}).min }); });
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
  addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    const i = '1234'.indexOf(e.key); const hs = heroes();
    if (i >= 0 && hs[i]) selectHero(hs[i].kind);
    if (e.key === 'p' || e.key === 'P') partyCam();
  });

  // ---------- party panel ----------
  let partyKey = '';
  function buildParty() {
    const hs = heroes(); partyKey = hs.map(h => h.kind).join();
    const lead = hs[0];
    $('party').innerHTML = `<div class="hd"><span>Party</span><span class="sp"></span><button class="minb" title="minimize">–</button><button title="close" id="pClose">×</button></div>` +
      hs.map(h => `<div class="mem" data-k="${h.kind}">
        <div class="r1"><span class="st" id="st-${h.kind}"></span><span>${NAME[h.kind]}</span><span class="tag">${TAG[h.kind]}</span><span class="ag" id="ag-${h.kind}" title="holding aggro"></span>
          ${h === lead ? '<span class="star" title="leader">★</span>' : '<span class="fol" title="following">↳</span>'}
          <span class="lv" id="lv-${h.kind}"></span>${h === lead ? '' : '<span class="kick" title="kick (not in the sim)">×</span>'}</div>
        <div class="bar"><i id="hp-${h.kind}" style="background:var(--hp)"></i></div>
        <div class="bar"><i id="mp-${h.kind}" style="background:var(--mp)"></i></div>
        <div class="stam"><div class="bar"><i id="sb-${h.kind}" style="background:var(--st)"></i></div><span id="sh-${h.kind}"></span></div>
        <div class="dps" id="dps-${h.kind}"></div></div>`).join('') +
      `<div class="ft">Costs are personal<div><button>Stop accepting all</button><button>Leave party</button></div></div>`;
    $('party').querySelectorAll('.mem').forEach(m => m.onclick = () => selectHero(m.dataset.k));
    $('pClose').onclick = () => PANELS.set('party', { hidden: true });
    draggable($('party')); PANELS.apply();
  }
  function partyFast() {
    if (heroes().map(h => h.kind).join() !== partyKey) buildParty();
    const sec = Math.max(1, sessionSec()), a = AN();
    for (const h of heroes()) {
      const w = (id, f) => { const e = $(id); if (e) e.style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%'; };
      w('hp-' + h.kind, h.alive ? h.hp / h.maxHp : 0); w('mp-' + h.kind, h.maxMana ? h.mana / h.maxMana : 0);
      const stam = Math.max(0, STAMINA_H * 3600 - sec); w('sb-' + h.kind, stam / (STAMINA_H * 3600));
      $('sh-' + h.kind).textContent = `${Math.floor(stam / 3600)}:${String(Math.floor(stam / 60) % 60).padStart(2, '0')}h`;
      $('lv-' + h.kind).textContent = 'Lv. ' + h.level;
      $('ag-' + h.kind).textContent = S().units.some(m => m.side === 'mon' && m.alive && m.target === h) ? '⛨' : '';
      $('st-' + h.kind).textContent = !h.alive ? '✝' : h.regen ? '🍖' : (S().time - (h.flash.drink || -9)) < 1.2 ? '🧪' : '';
      const H = a.hero[h.kind] || { dealt: 0 }, healed = a.healed[h.kind] || 0;
      $('dps-' + h.kind).innerHTML = `DPS: <b>${kf(H.dealt / sec)}</b> / Total: <b>${kf(H.dealt)}</b>` +
        (healed ? `<div class="hps">HPS: <b>${kf(healed / sec)}</b> / Total: <b>${kf(healed)}</b></div>` : '');
    }
    $('party').querySelectorAll('.mem').forEach(m => m.classList.toggle('sel', VIEW.mode === 'hero' && m.dataset.k === VIEW.sel));
  }

  // ---------- hunt analyzer ----------
  let tab = 'session', anView = 'hero', collapsed = {}, anCollapsed = false;
  function money(n, neg) { return `<span class="v${neg || n < 0 ? ' dn' : ''}">${nf(n)} gp</span>`; }
  function sec(id, title, body) {
    return `<div class="sec"><div class="sh" data-s="${id}">${collapsed[id] ? '▸' : '▾'} ${title}</div>${collapsed[id] ? '' : body}</div>`;
  }
  const row = (k, v, extra) => `<div class="row">${extra || ''}<span class="k">${k}</span>${v}</div>`;
  function slow() {
    if (!S()) return;
    const a = AN(), s = S(), hs = heroes(), h = sel(), secs = Math.max(1, sessionSec()), hrs = secs / 3600;
    const heroMode = anView === 'hero' && h;
    const H = heroMode ? (a.hero[h.kind] || { supplies: {}, outAb: {}, outEl: {}, inMon: {}, inEl: {}, xp: 0 }) : null;
    const supplies = heroMode ? H.supplies : a.supplies;
    const waste = Object.entries(supplies).reduce((t, [id, n]) => t + n * ITEM_PRICE(id), 0);
    const income = (a.loot + a.gold) / (heroMode ? Math.max(1, hs.length) : 1);   // loot split evenly; costs are personal
    const xp = heroMode ? H.xp : a.xp;
    const bal = income - waste;
    const hxp = h && a.hero[h.kind] ? a.hero[h.kind].xp : 0;
    const nextLv = h && hxp > 0 ? ((h.level - HERO_START_LEVEL + 1) * HERO_XP_PER_LEVEL - h.xp) / (hxp / secs) : Infinity;
    let body = '';
    if (tab === 'session') {
      body += sec('s', 'Session', row('Enemies killed', `<span class="v">${nf(a.kills)}</span>`) + row('XP gain', `<span class="v">${nf(xp)}</span>`) +
        row('Gold', money(income)) + row('Waste', money(waste, true)) + row('Balance', money(bal)));
      body += sec('h', 'Per hour', row('XP/h', `<span class="v">${nf(xp / hrs)}</span>`) + row('Raw XP/h', `<span class="v">${nf(xp / hrs)}</span>`) +
        row('Gold/h', money(income / hrs)) + row('Waste/h', money(waste / hrs, true)) + row('Balance/h', money(bal / hrs)));
      body += sec('u', 'Supplies used', Object.entries(supplies).filter(([, n]) => n > 0).map(([id, n]) =>
        row(ITEM_NAME[id] || id, `<span class="x">×${nf(n)}</span><span class="v dn">${nf(n * ITEM_PRICE(id))} gp</span>`, ITEM_ICON[id] ? `<img src="${iconUrl(ITEM_ICON[id])}">` : '<span style="width:16px;display:inline-block"></span>')).join('') || row('—', ''));
      body += sec('l', heroMode ? 'Loot collected (party, split evenly)' : 'Loot collected', Object.entries(a.lootItems).map(([id, n]) =>
        row(id.replace(/_/g, ' '), `<span class="x">×${n}</span><span class="v">${nf(n * (LOOT_VALUE[id] || 0))} gp</span>`, `<img src="${iconUrl(id)}">`)).join('') || row('—', ''));
    } else if (tab === 'in') {
      const src = heroMode ? H : a;
      body += sec('im', 'Damage taken by monster', Object.entries(src.inMon).sort((x, y) => y[1] - x[1]).map(([k, v]) => row(k, `<span class="v dn">${nf(v)}</span>`)).join('') || row('—', ''));
      body += sec('ie', 'Damage taken by element', Object.entries(src.inEl).map(([k, v]) => row(k, `<span class="v dn">${nf(v)}</span>`)).join('') || row('—', ''));
    } else {
      const src = heroMode ? H : a;
      const abName = id => id === 'basic' ? 'Basic attack' : (Object.values(ABILITIES).flat().find(x => x.id === id) || { name: id }).name;
      body += sec('oa', 'Damage dealt by ability', Object.entries(src.outAb).sort((x, y) => y[1] - x[1]).map(([k, v]) => row(abName(k), `<span class="v">${nf(v)}</span>`)).join('') || row('—', ''));
      body += sec('oe', 'Damage dealt by element', Object.entries(src.outEl).sort((x, y) => y[1] - x[1]).map(([k, v]) => row(k, `<span class="v">${nf(v)}</span>`)).join('') || row('—', ''));
    }
    $('hunt').innerHTML = `<div class="hd"><span>Hunt Analyzer</span><span class="sp"></span><button id="anRst" title="reset">⟲</button><button class="minb" title="minimize">–</button></div>` +
      (anCollapsed ? '' :
        (ended ? '<div class="ended">Hunt ended — session summary</div>' : '') +
        `<div class="top"><span>SESSION <b>${hms(secs)}</b></span><span>NEXT LEVEL <b>${isFinite(nextLv) ? hms(nextLv) : '--:--:--'}</b></span></div>` +
        `<div class="tg"><button data-v="hero" class="${anView === 'hero' ? 'on' : ''}">This hero${h ? ' (' + NAME[h.kind] + ')' : ''}</button><button data-v="party" class="${anView === 'party' ? 'on' : ''}">Party</button></div>` +
        `<div class="tabs"><button data-t="session" class="${tab === 'session' ? 'on' : ''}">SESSION</button><button data-t="in" class="${tab === 'in' ? 'on' : ''}">DAMAGE INPUT</button><button data-t="out" class="${tab === 'out' ? 'on' : ''}">DAMAGE OUTPUT</button></div>` + body);
    $('anRst').onclick = () => { window.__resetAnalyzer(); ended = false; slow(); };
    $('hunt').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { anView = b.dataset.v; slow(); });
    $('hunt').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; slow(); });
    $('hunt').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { collapsed[b.dataset.s] = !collapsed[b.dataset.s]; slow(); });
    // top bar timer: next pack respawn, else the session clock
    const next = s.packs.filter(p => !p.alive).map(p => p.respawnAt - s.time).filter(t => t > 0).sort((x, y) => x - y)[0];
    $('ready').innerHTML = next != null ? `READY IN <b>${Math.floor(next / 60)}:${String(Math.floor(next % 60)).padStart(2, '0')}</b>` : `SESSION <b>${hms(secs)}</b>`;
    $('viewlbl').innerHTML = VIEW.mode === 'party' ? 'Viewing <b>Party (free cam)</b>' : `Viewing <b>${NAME[h.kind]}</b> · 1–4 switch · P party cam`;
    syncRight();
    $('lootBody').textContent = a.log.join('\n') || '—';
  }
  draggable($('hunt')); draggable($('lootp')); draggable($('log'));

  // ---------- bottom HUD: "Hearthrise light" ----------
  // One canvas at 1:1 (integer scale, 1 px iron lines): a dark-wood rail carrying 2x5 stone tablets either side of a
  // round iron hearth emblem (ember fill = level %), curved HP (warm) and mana (cool) gauges round it, a thin stamina
  // arc beneath, and two round sockets (food, charm). The control plaque sits to the right as DOM.
  const C = {   // src/styles/tokens.css (Charcoal & Gold) where a token exists
    bg0: '#0a0b0e', bg1: '#101217', bg2: '#1a1d23', bg3: '#252931', ink: '#e9e7e2', ink2: '#b8bcc4', ink3: '#979da7',
    gold: '#c9a24a', gold2: '#e3c77e', red: '#dc5f4c', gem: '#5262b3', steel: '#808b98', aqua: '#5c8f89',
    iron: '#100c08', iron2: '#1c150e', plank0: '#241b13', plank1: '#1a130d', seam: 'rgba(0,0,0,.55)', flame: '#ffd08a', lit: '#ffb457',
    oxblood: '#8e3324', railInk: '#cbbc9e', mana: '#6a86d6',   // mana: a lifted --gem so the gauge reads on the rail (no token yet)
  };
  const SL = 36, GAP = 3, HALF = 5 * (SL + GAP) - GAP, MID = 158, PAD = 8;
  const W_FULL = PAD * 2 + HALF * 2 + MID + 16, H_FULL = 2 * (SL + GAP) - GAP + PAD * 2 + 4;
  const cv = $('hudCanvas'), g = cv.getContext('2d');
  let ICONMAP = {};
  fetch('assets/icons/manifest.json?v=14').then(r => r.ok ? r.json() : null).then(m => {
    if (!m) return;
    const map = m.icons || m.abilities || m;
    for (const [id, f] of Object.entries(map)) { if (typeof f !== 'string') continue; const i = new Image(); i.src = 'assets/icons/' + f.replace(/^.*icons\//, ''); ICONMAP[id] = i; }
  }).catch(() => {});
  const ready = i => i && i.complete && i.naturalWidth;

  function tablet(x, y) {               // carved dark-stone tablet with four iron rivets
    g.fillStyle = C.bg2; g.fillRect(x, y, SL, SL);
    g.fillStyle = 'rgba(214,224,240,.07)'; g.fillRect(x, y, SL, 1); g.fillRect(x, y, 1, SL);         // lit top/left arris
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y + SL - 1, SL, 1); g.fillRect(x + SL - 1, y, 1, SL); // shadowed bottom/right
    g.fillStyle = C.iron; g.fillRect(x - 1, y - 1, SL + 2, 1); g.fillRect(x - 1, y + SL, SL + 2, 1); g.fillRect(x - 1, y, 1, SL); g.fillRect(x + SL, y, 1, SL);
    g.fillStyle = C.steel; for (const [rx, ry] of [[2, 2], [SL - 4, 2], [2, SL - 4], [SL - 4, SL - 4]]) g.fillRect(x + rx, y + ry, 2, 2);
    g.fillStyle = C.iron; for (const [rx, ry] of [[3, 3], [SL - 3, 3], [3, SL - 3], [SL - 3, SL - 3]]) g.fillRect(x + rx, y + ry, 1, 1);
  }
  function crack(x, y) {                // a hairline crack across an unusable tablet
    g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 1; g.beginPath();
    const pts = [[6, 4], [13, 12], [11, 17], [19, 23], [17, 28], [26, 33]];
    g.moveTo(x + pts[0][0] + .5, y + pts[0][1] + .5); for (const [px, py] of pts.slice(1)) g.lineTo(x + px + .5, y + py + .5); g.stroke();
    g.strokeStyle = 'rgba(214,224,240,.18)'; g.beginPath(); g.moveTo(x + 7.5, y + 4.5); for (const [px, py] of pts.slice(1)) g.lineTo(x + px + 1.5, y + py + .5); g.stroke();
  }
  function text(t, x, y, col, size, align, base) {
    g.font = `${size || 9}px ui-monospace,Consolas,monospace`; g.textAlign = align || 'left'; g.textBaseline = base || 'top';
    g.fillStyle = '#000'; g.fillText(t, x + 1, y + 1); g.fillStyle = col; g.fillText(t, x, y);
  }
  function drawSlot(u, s, i, x, y) {
    tablet(x, y);
    text(String(i < 10 ? (i + 1) % 10 : '⇧' + ((i - 9) % 10)), x + SL - 3, y + SL - 10, C.ink3, 7, 'right');
    if (!s) return;
    const icon = s.ab ? ICONMAP[s.ab.id] : s.kind === 'basic' ? (ICONMAP['basic_' + u.kind] || ICON[BASIC_ICON[u.kind]]) : ICONMAP[s.id] || ICON[ITEM_ICON[s.id]];
    if (s.unusable) g.filter = 'grayscale(1) brightness(.55)';
    if (ready(icon)) {
      if (s.id === 'health_potion' && !ICONMAP[s.id]) g.filter = (s.unusable ? 'grayscale(1) brightness(.55) ' : '') + 'hue-rotate(-120deg) saturate(1.5)';
      g.drawImage(icon, x + 2, y + 2, 32, 32);
    } else if (s.ab) { const [gn, col] = ABIL[s.ab.id] || ['star', '#ccc']; glyph(g, gn, x + 6, y + 6, col, 3); }
    g.filter = 'none';
    if (s.unusable) crack(x, y);
    // cooldown: an ember rising from the bottom of the tablet, with a small number
    if (s.cd > 0.05 && s.cdMax) {
      const f = Math.min(1, 1 - s.cd / s.cdMax), h = Math.round((SL - 2) * f);
      g.fillStyle = 'rgba(10,11,14,.62)'; g.fillRect(x + 1, y + 1, SL - 2, SL - 2 - h);
      const eg = g.createLinearGradient(0, y + SL - 1 - h, 0, y + SL - 1);
      eg.addColorStop(0, 'rgba(255,180,87,.40)'); eg.addColorStop(1, 'rgba(142,51,36,.30)');
      g.fillStyle = eg; g.fillRect(x + 1, y + SL - 1 - h, SL - 2, h);
      g.fillStyle = C.lit; g.fillRect(x + 1, y + SL - 1 - h, SL - 2, 1);
      text(s.cd < 10 ? s.cd.toFixed(1) : String(Math.ceil(s.cd)), x + SL / 2, y + SL / 2 - 5, C.flame, 10, 'center');
    } else if (!s.unusable && s.kind !== 'item') {
      // ready: a soft amber edge light along the lit arrises
      g.fillStyle = 'rgba(227,199,126,.55)'; g.fillRect(x + 1, y + 1, SL - 2, 1); g.fillRect(x + 1, y + 1, 1, SL - 2);
    }
    if (s.cost) text(String(s.cost), x + 3, y + 2, '#a9b8ec', 8);
    if (s.badge) text(s.badge, x + 3, y + SL - 10, C.gold2, 7);
    if (s.count != null) text(String(s.count), x + SL - 3, y + 2, s.count ? C.ink : C.red, 8, 'right');
    const fl = s.flashKey ? S().time - (u.flash[s.flashKey] ?? -99) : 99;
    if (fl < 0.3) { g.fillStyle = `rgba(255,208,138,${(0.45 * (1 - fl / 0.3)).toFixed(2)})`; g.fillRect(x + 1, y + 1, SL - 2, SL - 2); }
  }
  function rail(w, h) {                 // dark-wood rail: planks, seams, iron edge
    g.fillStyle = C.plank1; g.fillRect(0, 0, w, h);
    g.fillStyle = C.plank0; g.fillRect(0, 4, w, Math.floor(h / 2) - 4);
    g.fillStyle = C.seam; g.fillRect(0, Math.floor(h / 2), w, 1);
    g.fillStyle = 'rgba(236,225,204,.028)'; for (let x = 7; x < w; x += 23) g.fillRect(x, 6, 9, 1);
    g.fillStyle = C.iron; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    g.fillStyle = C.iron2; g.fillRect(1, 1, w - 2, 1);
  }
  function arc(cx, cy, r, a0, a1, width, col) { g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'butt'; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); }
  function emblem(u, cx, cy) {
    const into = u.xp - (u.level - HERO_START_LEVEL) * HERO_XP_PER_LEVEL, pct = Math.max(0, Math.min(1, into / HERO_XP_PER_LEVEL));
    const r = 26;
    // gauges: HP on the left (warm), mana on the right (cool), drawn as a track then a fill from the bottom up
    const GR = 38, GW = 6, hp = u.alive ? Math.max(0, u.hp / u.maxHp) : 0, mp = u.maxMana ? u.mana / u.maxMana : 0;
    const L0 = Math.PI * 0.62, L1 = Math.PI * 1.38, R0 = -Math.PI * 0.38, R1 = Math.PI * 0.38;
    arc(cx, cy, GR, L0, L1, GW + 2, C.iron); arc(cx, cy, GR, L0, L1, GW, C.bg0);
    arc(cx, cy, GR, L0, L0 + (L1 - L0) * hp, GW, C.red);
    arc(cx, cy, GR, R0, R1, GW + 2, C.iron); arc(cx, cy, GR, R0, R1, GW, C.bg0);
    arc(cx, cy, GR, R1 - (R1 - R0) * mp, R1, GW, C.mana);
    // stamina: a thin arc under the emblem
    const stam = Math.max(0, STAMINA_H * 3600 - sessionSec()) / (STAMINA_H * 3600);
    arc(cx, cy, r + 5, Math.PI * 0.68, Math.PI * 0.32, 2, C.bg0);
    arc(cx, cy, r + 5, Math.PI * 0.68, Math.PI * 0.68 - (Math.PI * 0.36) * stam, 2, C.aqua);
    // the hearth: iron frame, dark hollow, an ember filled to the level %
    g.fillStyle = C.iron; g.beginPath(); g.arc(cx, cy, r + 2, 0, 7); g.fill();
    g.strokeStyle = C.steel; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r + 1.5, 0, 7); g.stroke();
    g.fillStyle = '#0d0a07'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r - 1, 0, 7); g.clip();
    const top = cy + r - 2 * r * pct, eg = g.createLinearGradient(0, top, 0, cy + r);
    eg.addColorStop(0, C.lit); eg.addColorStop(0.35, '#c8641e'); eg.addColorStop(1, C.oxblood);
    g.fillStyle = eg; g.fillRect(cx - r, top, 2 * r, cy + r - top);
    g.fillStyle = 'rgba(255,224,168,.55)'; g.fillRect(cx - r, Math.round(top), 2 * r, 1);
    g.restore();
    g.strokeStyle = C.iron; g.beginPath(); g.moveTo(cx - r + 4, cy + 9.5); g.lineTo(cx + r - 4, cy + 9.5); g.stroke();   // grate bar
    text(String(u.level), cx, cy - 9, C.flame, 14, 'center');
    text(Math.floor(pct * 100) + '%', cx, cy + 11, C.railInk, 8, 'center');
    // numbers beside the gauges
    text(`${Math.max(0, Math.round(u.hp))}/${u.maxHp}`, cx - GR - 6, cy - 22, C.red, 9, 'right');
    text(u.regen ? '+' + Math.round(u.regen.perSec) : '+0', cx - GR - 6, cy - 11, C.ink3, 8, 'right');
    text(`${Math.round(u.mana)}/${u.maxMana}`, cx + GR + 6, cy - 22, '#a9b8ec', 9, 'left');
    text('+' + (u.maxMana * COMBAT.manaRegenPerMin / 60).toFixed(1) + (u.shield > 0 ? '  ◈' + Math.round(u.shield) : ''), cx + GR + 6, cy - 11, C.ink3, 8, 'left');
    const sh = Math.max(0, STAMINA_H * 3600 - sessionSec());
    text(`${Math.floor(sh / 3600)}:${String(Math.floor(sh / 60) % 60).padStart(2, '0')}h`, cx, cy + r + 9, C.ink3, 8, 'center');
  }
  function socket(x, y, draw, label) {  // small round socket set into the rail
    g.fillStyle = C.iron; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
    g.strokeStyle = C.steel; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 10.5, 0, 7); g.stroke();
    g.fillStyle = '#0d0a07'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
    draw(); if (label != null) text(String(label), x + 9, y + 3, C.ink, 7, 'left');
  }
  let slotList = [], slotRects = [], hudMin = false;
  function drawHud() {
    const u = sel(); if (!u) return;
    hudMin = $('hud2').classList.contains('min');
    const w = hudMin ? MID + PAD * 2 : W_FULL, h = H_FULL;
    if (cv.width !== w) { cv.width = w; cv.height = h; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
    rail(w, h);
    slotList = slotsFor(u); slotRects = [];
    const midX = hudMin ? PAD : PAD + HALF + 8;
    if (!hudMin) for (let i = 0; i < 20; i++) {
      const col = i % 10, row = Math.floor(i / 10), side = col < 5 ? 0 : 1, c5 = col % 5;
      const x = side === 0 ? PAD + c5 * (SL + GAP) : PAD + HALF + 16 + MID + c5 * (SL + GAP), y = PAD + 2 + row * (SL + GAP);
      slotRects[i] = [x, y]; drawSlot(u, slotList[i], i, x, y);
    }
    emblem(u, midX + MID / 2, Math.floor(h / 2) - 2);
    if (!hudMin) {
      const L = LOADOUTS[u.kind], fi = ICON[ITEM_ICON[L.food[0]]];
      socket(midX + 14, h - 15, () => { if (ready(fi)) g.drawImage(fi, midX + 6, h - 23, 16, 16); }, u.food);
      socket(midX + MID - 14, h - 15, () => glyph(g, 'ring', midX + MID - 22, h - 23, C.gold, 2));
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
      tip: `${fd.hp} HP over ${fd.over} s · eaten under ${Math.round(fd.below * 100)}% HP when no heal is coming · ${fd.price} gp.`, unusable: !u.food });
    out.push({ kind: 'item', id: L.drink[0], type: dr.mana ? 'potion' : 'hpot', name: dr.name, count: u.drink, cd: lane, cdMax: CONSUMABLE_LANE, flashKey: 'drink', badge: Math.round((u.set.drinkBelow ?? dr.below) * 100) + '%',
      tip: `${dr.mana ? '+' + dr.mana + ' mana' : '+' + dr.hp + ' HP'} instantly under ${Math.round(dr.below * 100)}% ${dr.mana ? 'mana' : 'HP'} · ${dr.price} gp.`, unusable: !u.drink });
    return out;
  }
  // tooltip
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const i = slotRects.findIndex(p => p && mx >= p[0] && mx < p[0] + SL && my >= p[1] && my < p[1] + SL), s = slotList[i];
    const tip = $('tip');
    if (!s) { tip.style.display = 'none'; return; }
    tip.innerHTML = `<div class="n">${s.name}</div><div class="c">${s.tip}</div>`;
    tip.style.display = 'block'; tip.style.left = Math.min(innerWidth - 230, e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 64) + 'px';
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
    $('rSet').value = u.set.actSet; $('rTgt').value = u.set.target; $('dVal').textContent = u.set.dist;
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
