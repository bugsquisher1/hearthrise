'use strict';
// Hunt-sim UI: hunt top bar, view switching, party panel, hunt analyzer and the bottom HUD (bars, 2x10 slots,
// action set / target / stance / distance). Reads sim state through the globals sim.js exposes.
const UI = (() => {
  const $ = id => document.getElementById(id);
  const S = () => window.__S(), AN = () => window.__AN();
  const ORDER = ['knight', 'paladin', 'druid', 'sorcerer'];
  const TAG = { knight: 'EK', paladin: 'RP', druid: 'ED', sorcerer: 'MS' };
  const NAME = { knight: 'Knight', paladin: 'Paladin', druid: 'Druid', sorcerer: 'Sorcerer' };
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
    const i = new Image(); i.src = `assets/icons/${n}.png?v=13`; ICON[n] = i;
  }
  const ITEM_ICON = { fire_rune: 'fire_rune', frost_rune: 'frost_rune', mana_potion: 'moonbloom_elixir', health_potion: 'moonbloom_elixir', ham: 'cooked_wolf_meat', bread: 'wheat_bread', bolt: 'bolt' };
  const ITEM_NAME = { fire_rune: 'Fire rune', frost_rune: 'Frost rune', mana_potion: 'Mana potion', health_potion: 'Health potion', ham: 'Ham', bread: 'Bread', bolt: 'Crossbow bolt', mana: 'Mana (regen value)' };
  const ITEM_PRICE = id => id === 'mana' ? SUPPLIES.mana.price : SUPPLIES[id] ? SUPPLIES[id].price : CONSUMABLES[id] ? CONSUMABLES[id].price : 0;
  const BASIC_ICON = { knight: 'iron_sword', paladin: 'maple_bow', sorcerer: 'apprentice_staff', druid: 'maple_staff' };
  const iconUrl = id => `assets/icons/${id}.png?v=13`;

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
    challenge: ['star', '#ffd070', 'Draws every monster within 6 tiles back onto the knight. No stun.'],
    flame_strike: ['flame', '#ff8a30', 'Fire-wrapped melee hit. Uses a fire rune.'],
    power_strike: ['sword', '#f0e6d0', 'A heavy single-target melee strike.'],
    hunters_mark: ['ring', '#ff6060', 'Marks the toughest target: the paladin deals +20% to it for 8 s.'],
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
        <div class="r1"><span class="st" id="st-${h.kind}"></span><span>${NAME[h.kind]}</span><span class="tag">${TAG[h.kind]}</span>
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

  // ---------- bottom HUD ----------
  const SL = 34, GAP = 2, COLS = 10;
  const cv = $('slots'), g = cv.getContext('2d');
  cv.width = COLS * (SL + GAP) - GAP; cv.height = 2 * (SL + GAP) - GAP;
  const TINT = { attack: '#a04a3a', spell: '#4a68b0', rune: '#b07030', food: '#8a6a3a', potion: '#4a6ac0', hpot: '#b04a4a', empty: '#3a3e44' };
  function slotsFor(u) {
    const L = LOADOUTS[u.kind], out = [];
    out.push({ kind: 'basic', type: 'attack', name: 'Basic attack', cost: HEROES[u.kind].basic.mana || null, cd: Math.max(0, u.swing), cdMax: COMBAT.swing, flashKey: 'basic',
      tip: `Every ${COMBAT.swing.toFixed(1)} s${HEROES[u.kind].basic.mana ? `, ${HEROES[u.kind].basic.mana} mana` : ''}${HEROES[u.kind].basic.ammo ? ', 1 bolt' : ''}.`,
      unusable: HEROES[u.kind].basic.mana && u.mana < HEROES[u.kind].basic.mana });
    for (const ab of ABILITIES[u.kind]) if (!ACTION_SETS[u.set.actSet].skip(ab)) {
      const left = Math.max(0, (u.cd[ab.id] || 0) - S().time);
      out.push({ kind: 'ab', ab, type: 'spell', name: ab.name, cost: ab.mana || null, cd: left, cdMax: ab.cd, flashKey: ab.id,
        tip: `${ab.mana ? ab.mana + ' mana · ' : ''}${ab.cd} s cooldown · ${ab.lane} lane${ab.rune ? ' · 1 ' + ITEM_NAME[ab.rune].toLowerCase() : ''}. ${ABIL[ab.id] ? ABIL[ab.id][2] : ''}`,
        unusable: (ab.mana && u.mana < ab.mana) });
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
  let slotList = [];
  function drawSlots() {
    const u = sel(); if (!u) return;
    slotList = slotsFor(u);
    g.clearRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    for (let i = 0; i < 20; i++) {
      const x = (i % COLS) * (SL + GAP), y = Math.floor(i / COLS) * (SL + GAP), s = slotList[i];
      g.fillStyle = 'rgba(14,16,19,.92)'; g.fillRect(x, y, SL, SL);
      g.strokeStyle = s ? TINT[s.type] : TINT.empty; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, SL - 1, SL - 1);
      g.font = '8px ui-monospace,Consolas,monospace'; g.textAlign = 'right'; g.textBaseline = 'top';
      g.fillStyle = '#6a6f78'; g.fillText((i < 10 ? '' : '⇧') + ((i % 10) + 1) % 10, x + SL - 2, y + 2);
      if (!s) { g.fillStyle = '#4a4f57'; g.font = '14px ui-monospace,Consolas,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', x + SL / 2, y + SL / 2 + 1); continue; }
      // icon: item art at 1x (32 px source), or a crisp 3 px glyph
      const icon = s.kind === 'basic' ? ICON[BASIC_ICON[u.kind]] : s.kind === 'item' ? ICON[ITEM_ICON[s.id]] : null;
      if (s.unusable) g.globalAlpha = 0.45;
      if (icon && icon.complete && icon.naturalWidth) {
        if (s.id === 'health_potion') g.filter = 'hue-rotate(-120deg) saturate(1.5)';
        g.drawImage(icon, x + 1, y + 1, 32, 32); g.filter = 'none';
      } else if (s.ab) { const [gn, col] = ABIL[s.ab.id] || ['star', '#ccc']; glyph(g, gn, x + 5, y + 5, col, 3); }
      g.globalAlpha = 1;
      if (s.cd > 0.05 && s.cdMax) {
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x + 1, y + 1 + Math.round((SL - 2) * (1 - s.cd / s.cdMax)), SL - 2, Math.round((SL - 2) * s.cd / s.cdMax));
        g.font = 'bold 12px ui-monospace,Consolas,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const t = s.cd < 10 ? s.cd.toFixed(1) : String(Math.ceil(s.cd));
        g.fillStyle = '#000'; g.fillText(t, x + SL / 2 + 1, y + SL / 2 + 1); g.fillStyle = '#fff'; g.fillText(t, x + SL / 2, y + SL / 2);
      }
      g.font = '9px ui-monospace,Consolas,monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
      if (s.cost) { g.fillStyle = '#000'; g.fillText(s.cost, x + 3, y + 3); g.fillStyle = '#9cc0ff'; g.fillText(s.cost, x + 2, y + 2); }
      if (s.badge) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x + 1, y + 1, 18, 9); g.fillStyle = '#ffd9a0'; g.font = '8px ui-monospace,Consolas,monospace'; g.fillText(s.badge, x + 2, y + 2); }
      if (s.count != null) { g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.font = '9px ui-monospace,Consolas,monospace';
        g.fillStyle = '#000'; g.fillText(s.count, x + SL - 1, y + SL - 1); g.fillStyle = s.count ? '#f2ead8' : '#e07060'; g.fillText(s.count, x + SL - 2, y + SL - 2); }
      if (s.unusable) { g.strokeStyle = 'rgba(224,90,70,.85)'; g.beginPath(); g.moveTo(x + 3, y + SL - 3); g.lineTo(x + SL - 3, y + 3); g.stroke(); }
      const fl = s.flashKey ? S().time - (u.flash[s.flashKey] ?? -99) : 99;
      if (fl < 0.3) { g.fillStyle = `rgba(255,230,160,${(0.55 * (1 - fl / 0.3)).toFixed(2)})`; g.fillRect(x + 1, y + 1, SL - 2, SL - 2); }
    }
  }
  // tooltip
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect(), i = Math.floor((e.clientY - r.top) / (SL + GAP)) * COLS + Math.floor((e.clientX - r.left) / (SL + GAP)), s = slotList[i];
    const tip = $('tip');
    if (!s) { tip.style.display = 'none'; return; }
    tip.innerHTML = `<div class="n">${s.name}</div><div class="c">${s.tip}</div>`;
    tip.style.display = 'block'; tip.style.left = Math.min(innerWidth - 230, e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 60) + 'px';
  });
  cv.addEventListener('mouseleave', () => { $('tip').style.display = 'none'; });

  // left block: HP, mana, XP, stamina + food/amulet round slots
  $('hudBars').innerHTML = `<div class="hb"><i id="bHp" style="background:#3f9a4a"></i><span id="tHp"></span><em id="rHp"></em></div>
    <div class="hb"><i id="bMp" style="background:var(--mp)"></i><s id="sMp" title="shield"></s><span id="tMp"></span><em id="rMp"></em></div>
    <div class="hb thin"><i id="bXp" style="background:var(--xp)"></i><span id="tXp"></span></div>
    <div class="hb thin"><i id="bSt" style="background:var(--st)"></i><span id="tSt"></span><em style="cursor:pointer" title="(no-op in the sim)">+</em></div>`;
  $('hudRound').innerHTML = '<canvas id="rFood" width="24" height="24" title="food"></canvas><canvas id="rAmu" width="24" height="24" title="amulet"></canvas>';
  function round(id, draw) { const c = $(id), x = c.getContext('2d'); x.clearRect(0, 0, 24, 24); x.fillStyle = 'rgba(14,16,19,.92)'; x.beginPath(); x.arc(12, 12, 11, 0, 7); x.fill(); x.strokeStyle = '#4a5058'; x.stroke(); x.imageSmoothingEnabled = false; draw(x); }
  function bars() {
    const u = sel(); if (!u) return;
    const pct = (a, b) => (Math.max(0, Math.min(1, b ? a / b : 0)) * 100).toFixed(1) + '%';
    $('bHp').style.width = pct(u.alive ? u.hp : 0, u.maxHp); $('tHp').textContent = `${Math.max(0, Math.round(u.hp))}/${u.maxHp}`;
    $('rHp').textContent = u.regen ? '+' + Math.round(u.regen.perSec) : '+0';
    $('bMp').style.width = pct(u.mana, u.maxMana); $('tMp').textContent = `${Math.round(u.mana)}/${u.maxMana}`;
    $('rMp').textContent = '+' + (u.maxMana * COMBAT.manaRegenPerMin / 60).toFixed(1); $('sMp').textContent = u.shield > 0 ? Math.round(u.shield) : '';
    const into = u.xp - (u.level - HERO_START_LEVEL) * HERO_XP_PER_LEVEL;
    $('bXp').style.width = pct(into, HERO_XP_PER_LEVEL); $('tXp').textContent = `Lv ${u.level}  ${(into / HERO_XP_PER_LEVEL * 100).toFixed(1)}%`;
    const stam = Math.max(0, STAMINA_H * 3600 - sessionSec());
    $('bSt').style.width = pct(stam, STAMINA_H * 3600); $('tSt').textContent = `${Math.floor(stam / 3600)}:${String(Math.floor(stam / 60) % 60).padStart(2, '0')}h`;
    const L = LOADOUTS[u.kind];
    round('rFood', x => { const i = ICON[ITEM_ICON[L.food[0]]]; if (i.complete && i.naturalWidth) x.drawImage(i, 4, 4, 16, 16); });
    round('rAmu', x => { glyph(x, 'ring', 4, 4, '#c9a64a', 2); });
  }
  // right block: action set, target, stance + chase, distance — per selected hero, live in the sim
  $('hudR').innerHTML = `<div>ACTION SET</div><select id="rSet">${Object.entries(ACTION_SETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select>
    <div>TARGET</div><select id="rTgt"></select>
    <div class="modes"><button data-st="offensive" title="offensive: +10% dmg, +10% taken">⚔</button><button data-st="balanced" title="balanced">⚖</button><button data-st="defensive" title="defensive: -10% dmg, -15% taken">🛡</button><button class="chase" id="rChase" title="chase / follow the target">»</button></div>
    <div class="dist">DISTANCE <button id="dMinus">−</button><b id="dVal"></b><button id="dPlus">+</button></div>`;
  let syncedFor = null;
  function syncRight(force) {
    const u = sel(); if (!u) return;
    if (syncedFor !== u.kind || force) {
      syncedFor = u.kind;
      const lead = heroes()[0];
      $('rTgt').innerHTML = Object.entries(TARGET_MODES).map(([k, v]) => `<option value="${k}">${k === 'follow' ? 'Follow ' + (u === lead ? '(self: nearest)' : NAME[lead.kind]) : v}</option>`).join('');
    }
    $('rSet').value = u.set.actSet; $('rTgt').value = u.set.target; $('dVal').textContent = u.set.dist;
    $('hudR').querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', u.set.stance === b.dataset.st));
    $('rChase').classList.toggle('on', u.set.chase);
  }
  $('rSet').onchange = e => { sel().set.actSet = e.target.value; };
  $('rTgt').onchange = e => { sel().set.target = e.target.value; };
  $('hudR').querySelectorAll('[data-st]').forEach(b => b.onclick = () => { sel().set.stance = b.dataset.st; syncRight(); });
  $('rChase').onclick = () => { sel().set.chase = !sel().set.chase; syncRight(); };
  $('dMinus').onclick = () => { const u = sel(); u.set.dist = Math.max(1, u.set.dist - 1); syncRight(); };
  $('dPlus').onclick = () => { const u = sel(); u.set.dist = Math.min(8, u.set.dist + 1); syncRight(); };

  let lastFast = 0;
  function frame(now) {
    if (!S()) return;
    drawSlots();
    if (now - lastFast > 100) { lastFast = now; partyFast(); bars(); }
  }
  return { frame, slow };
})();
window.UI = UI;
