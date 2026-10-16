'use strict';
// Action bar (read-only for now): one compact row per hero — basic attack, 3 abilities, food, drink.
// Cooldown sweep from the ability's own cooldown (or the lane, whichever ends later), mana cost under the slot,
// stack counts on food and drink. Glyphs are tiny pixel shapes drawn in code until icons exist.
(function () {
  const ROW_H = 26, SLOT = 22, GAP = 2, NAME_W = 46, PAD = 4;
  const HEROES_ORDER = ['knight', 'paladin', 'druid', 'sorcerer'];
  const host = document.getElementById('actionbar');
  const cv = document.createElement('canvas'); host.appendChild(cv);
  const g = cv.getContext('2d');
  const W = PAD * 2 + NAME_W + 4 * (SLOT + GAP) + 6 + SLOT * 2 + GAP, H = PAD * 2 + ROW_H * 4;
  cv.width = W * 2; cv.height = H * 2; cv.style.width = W + 'px'; cv.style.height = H + 'px';

  const ELEM = { fire: '#ff8a30', frost: '#9fdcff', nature: '#8fd36a' };
  // pixel glyphs on an 8x8 grid, drawn at 2 px per cell
  const GLYPH = {
    sword: ['.......#', '......#.', '.....#..', '#..##...', '.##.#...', '..##....', '.#..#...', '#.......'],
    bolt: ['........', '#.......', '.#......', '..######', '.#......', '#.......', '........', '........'],
    orb: ['..####..', '.#....#.', '#..##..#', '#.####.#', '#.####.#', '#..##..#', '.#....#.', '..####..'],
    leaf: ['.....###', '...#####', '..#####.', '.####.#.', '.###.#..', '.##.#...', '.#......', '#.......'],
    flame: ['...#....', '..##....', '..###...', '.####.#.', '.######.', '########', '.######.', '..####..'],
    shard: ['......##', '.....###', '....###.', '...###..', '..###...', '.###....', '##......', '#.......'],
    star: ['...##...', '...##...', '########', '.######.', '..####..', '.##..##.', '##....##', '........'],
    shield: ['.######.', '#......#', '#..##..#', '#.####.#', '#..##..#', '.#....#.', '..#..#..', '...##...'],
    cross: ['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...'],
    ring: ['..####..', '.#....#.', '#......#', '#......#', '#......#', '#......#', '.#....#.', '..####..'],
    potion: ['...##...', '...##...', '..####..', '.#....#.', '#.####.#', '#.####.#', '#.####.#', '.######.'],
    ham: ['....##..', '...####.', '..######', '.#######', '.######.', '#.####..', '#.......', '#.......'],
    bread: ['........', '..####..', '.######.', '########', '#.#.#.##', '########', '.######.', '........'],
  };
  function glyph(name, x, y, col) {
    const gl = GLYPH[name]; if (!gl) return;
    g.fillStyle = col;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gl[r][c] === '#') g.fillRect(x + c * 2, y + r * 2, 2, 2);
  }
  const ABIL_GLYPH = { challenge: ['star', '#ffd070'], flame_strike: ['flame', ELEM.fire], power_strike: ['sword', '#f0e6d0'],
    hunters_mark: ['ring', '#ff6060'], flame_volley: ['flame', ELEM.fire], precision_shot: ['bolt', '#e8e0c8'],
    fireball: ['flame', ELEM.fire], frost_lance: ['shard', ELEM.frost], arcane_barrier: ['shield', '#b4a0ff'],
    greater_mend: ['cross', '#7dff8a'], circle_of_renewal: ['ring', '#7dff8a'], natures_wrath: ['leaf', ELEM.nature] };
  const BASIC_GLYPH = { knight: ['sword', '#e8e2d4'], paladin: ['bolt', '#d8c8a0'], sorcerer: ['orb', '#b48cff'], druid: ['leaf', ELEM.nature] };

  function sweep(x, y, frac) {           // dark clockwise cooldown wedge over the slot
    if (frac <= 0) return;
    const cx = x + SLOT / 2, cy = y + SLOT / 2;
    g.fillStyle = 'rgba(0,0,0,.62)'; g.beginPath(); g.moveTo(cx, cy);
    g.arc(cx, cy, SLOT, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); g.closePath();
    g.save(); g.beginPath(); g.rect(x, y, SLOT, SLOT); g.clip();
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, SLOT, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); g.closePath(); g.fill(); g.restore();
  }
  function slot(x, y, gl, col, opts) {
    g.fillStyle = 'rgba(20,22,26,.78)'; g.fillRect(x, y, SLOT, SLOT);
    g.strokeStyle = opts.ready ? 'rgba(224,160,80,.55)' : 'rgba(255,255,255,.12)'; g.strokeRect(x + .5, y + .5, SLOT - 1, SLOT - 1);
    glyph(gl, x + 3, y + 3, opts.dim ? 'rgba(150,150,150,.45)' : col);
    sweep(x, y, opts.cd || 0);
    g.font = '8px ui-monospace,Consolas,monospace'; g.textBaseline = 'alphabetic';
    if (opts.cost != null) { g.textAlign = 'left'; g.fillStyle = '#000'; g.fillText(opts.cost, x + 2, y + SLOT - 1); g.fillStyle = '#8fb8ff'; g.fillText(opts.cost, x + 1, y + SLOT - 2); }
    if (opts.count != null) { g.textAlign = 'right'; g.fillStyle = '#000'; g.fillText(opts.count, x + SLOT, y + SLOT - 1); g.fillStyle = opts.count ? '#f2ead8' : '#e07060'; g.fillText(opts.count, x + SLOT - 1, y + SLOT - 2); }
    if (opts.flash > 0) { g.fillStyle = `rgba(255,230,160,${(opts.flash * 0.5).toFixed(2)})`; g.fillRect(x, y, SLOT, SLOT); }
  }

  window.drawActionBar = function () {
    const S = window.__S(); if (!S) return;
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
    HEROES_ORDER.forEach((kind, row) => {
      const u = S.units.find(v => v.kind === kind && v.side === 'hero'); if (!u) return;
      const y = PAD + row * ROW_H;
      g.font = '9px ui-monospace,Consolas,monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = u.alive ? '#e6e1d6' : '#80786c'; g.fillText(kind, PAD, y + SLOT / 2 - 3);
      // tiny hp / mana bars under the name
      g.fillStyle = '#111'; g.fillRect(PAD, y + SLOT / 2 + 3, NAME_W - 6, 5);
      g.fillStyle = '#4fc65a'; g.fillRect(PAD, y + SLOT / 2 + 3, Math.round((NAME_W - 6) * Math.max(0, u.hp) / u.maxHp), 2);
      if (u.maxMana) { g.fillStyle = '#4a8cff'; g.fillRect(PAD, y + SLOT / 2 + 6, Math.round((NAME_W - 6) * u.mana / u.maxMana), 2); }
      let x = PAD + NAME_W;
      const b = HEROES[kind].basic, [bg, bc] = BASIC_GLYPH[kind];
      slot(x, y, bg, bc, { cd: Math.max(0, u.swing) / COMBAT.swing, cost: b.mana || null, dim: !u.alive, ready: u.swing <= 0 }); x += SLOT + GAP;
      for (const ab of ABILITIES[kind]) {
        const left = Math.max((u.cd[ab.id] || 0) - S.time, 0);
        const [ag, ac] = ABIL_GLYPH[ab.id] || ['star', '#ccc'];
        slot(x, y, ag, ac, { cd: left / ab.cd, cost: ab.mana || null, dim: !u.alive || u.mana < (ab.mana || 0), ready: left <= 0,
          flash: Math.max(0, 1 - (S.time - ((u.cd[ab.id] || -99) - ab.cd)) / 0.3) });
        x += SLOT + GAP;
      }
      x += 6;
      const L = LOADOUTS[kind], cl = Math.max(0, (u.lane.consume || 0) - S.time) / CONSUMABLE_LANE;
      slot(x, y, CONSUMABLES[L.food[0]].glyph, '#d9a066', { cd: cl, count: u.food, dim: !u.food, ready: !!u.regen }); x += SLOT + GAP;
      slot(x, y, 'potion', '#5a8cff', { cd: cl, count: u.drink, dim: !u.drink });
    });
  };
})();
