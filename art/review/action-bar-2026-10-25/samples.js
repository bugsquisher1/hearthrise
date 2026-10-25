/* art/review/action-bar-2026-10-25/samples.js — THROWAWAY: rebuilds the action bar's interior for a sample shot.
   Run in the page (page.evaluate) after the real bar has mounted. Every number, icon and name is read back from
   the real bar the client just painted from the server's envelope; the slots' real icon nodes are reused.
   The vitals hub is PIXEL ART: a canvas at art resolution (1 px = 1 art px) painted pixel by pixel from the world
   palette (art/world/palette.json ramps), shown at x2 with image-rendering: pixelated. No CSS circle, no SVG arc.
     a  FORGED RING   today's floor plan, every part redrawn: segmented HP/MP channel (10 notches a side)
     b  CROWN         the hub is the centrepiece: a large crescent ring rising over two slot trays
     c  BEAD STRIP    the lowest bar: HP/MP as 10 beads a side, the slots as one sunk grid per side
   configure-food / configure-ammo: the Configure action window with Ammo on its own tab. */
(variant) => {
  const P = { sh: ['#0b0a0c', '#17141a', '#231d1f', '#2f2723'], st: ['#3a4652', '#5c6c7a', '#8a9aa8', '#c4ccd2'],
    ir: ['#2c2e33', '#4a4d54', '#6e727a', '#969aa1'], bl: ['#8e1f1f', '#c23a2a'], cl: ['#3e1216', '#5e1a1f'],
    fr: ['#4fa8e8', '#a8e4ff'], wa: ['#1a2c44', '#2b4a6a'], go: '#e8c547', to: ['#f2a03a', '#ffd36a'], br: ['#4a2e18', '#7a4f26', '#a8743a', '#cfa25c'] };
  const phone = matchMedia('(max-width: 540px), (max-height: 540px) and (max-width: 1024px)').matches;

  if (variant.startsWith('configure-')) return configure(variant.slice(10));

  const bar = document.querySelector('.hb-bar');
  if (!bar || bar.querySelector('.sb-in')) return 'already';
  const hub = bar.querySelector('.hb-hub');
  const t = (s) => ((hub.querySelector(s) || {}).textContent || '').trim();
  const pair = (s) => { const m = /([\d,]+)\s*\/\s*([\d,]+)/.exec(s); return m ? [+m[1].replace(/,/g, ''), +m[2].replace(/,/g, '')] : [0, 1]; };
  const hp = pair(t('[data-v="hp"]')), mp = pair(t('[data-v="mana"]'));
  const lv = t('.hb-lv'), xp = +((/(\d+)%/.exec(t('.hb-xp')) || [])[1] || 0);
  const stam = t('.hb-stam-v');
  /* The hunt section's regen (the fixture's mana_regen is per minute; HP's is the engine's in-fight rate). */
  const rg = (k) => t('[data-r="' + k + '"]') || '+3.0/s';
  const foodIco = hub.querySelector('.hb-socket.is-food .hb-socket-ico').innerHTML;
  const foodN = (/(\d+)/.exec(t('.hb-socket.is-food .hb-socket-k')) || [])[1] || '0';
  const ringGlyph = hub.querySelector('.hb-socket.is-charm .hb-socket-ico').innerHTML;
  const hourglass = hub.querySelector('.hb-stam svg').outerHTML;
  /* A rune spell's corner count = the runes it burns, carried (what the build must add; the bag's numbers). */
  const RUNES = { greater_mend: 86, circle_of_renewal: 86, protective_ward: 41, green_sickness: 18 };

  const slot = (li) => {
    const key = li.getAttribute('data-item') || '';
    const ico = li.querySelector('.hb-slot-ico');
    const off = li.classList.contains('is-off');
    let n = (li.querySelector('.hb-count').textContent || '').trim();
    const ab = key.startsWith('ability:') ? key.slice(8) : null;
    if (ab && RUNES[ab]) n = String(RUNES[ab]);
    if (off) n = '0';
    return { i: +li.getAttribute('data-slot'), empty: li.classList.contains('is-empty'), off, ico, n, key, title: li.getAttribute('aria-label') };
  };
  /* The strike: a 2-art-px pixel staircase corner to corner, red on a dark edge (no anti-aliased CSS line). */
  function strikeSvg() {
    let r = '';
    for (let i = 0; i < 16; i++) { const y = 15 - i; r += '<rect x="' + (i - 1) + '" y="' + y + '" width="4" height="1" fill="' + P.sh[0] + '"/>'; }
    for (let i = 0; i < 16; i++) { const y = 15 - i; r += '<rect x="' + i + '" y="' + y + '" width="2" height="1" fill="' + P.bl[1] + '"/>'; }
    return '<svg class="sb-strike" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">' + r + '</svg>';
  }
  const slots = Array.from(bar.querySelectorAll('.hb-slot')).map(slot).sort((a, b) => a.i - b.i);
  const firstEmpty = (slots.find((s) => s.empty) || {}).i;
  const li = (s) => {
    const el = document.createElement('li');
    el.className = 'sb-slot' + (s.empty ? ' is-empty' : '') + (s.off ? ' is-off' : '') + (s.i === firstEmpty ? ' is-next' : '');
    el.title = s.title;
    if (!s.empty) { const ic = document.createElement('span'); ic.className = 'sb-ico'; ic.appendChild(s.ico.firstElementChild ? s.ico.firstElementChild.cloneNode(true) : document.createElement('i')); el.appendChild(ic); }
    else el.insertAdjacentHTML('beforeend', '<i class="sb-plus" aria-hidden="true"></i>');
    if (s.n) el.insertAdjacentHTML('beforeend', '<b class="sb-n">' + s.n + '</b>');
    if (s.off) el.insertAdjacentHTML('beforeend', strikeSvg());
    return el;
  };
  /* Each row of ten splits round the hub as today: 1-5 / 11-15 on the left, 6-10 / 16-20 on the right. */
  const side = (right) => { const ol = document.createElement('ol'); ol.className = 'sb-slots ' + (right ? 'is-r' : 'is-l');
    for (const r of [0, 1]) for (let c = 0; c < 5; c++) ol.appendChild(li(slots[r * 10 + c + (right ? 5 : 0)])); return ol; };

  /* ── THE PIXEL RING ── */
  const fHp = hp[0] / hp[1], fMp = mp[0] / mp[1], fXp = xp / 100;
  function paint(cv, S, fn) {
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d'), img = g.createImageData(S, S), c = S / 2;
    const put = (x, y, hex) => { if (!hex || x < 0 || y < 0 || x >= S || y >= S) return; const k = (y * S + x) * 4; img.data[k] = parseInt(hex.slice(1, 3), 16); img.data[k + 1] = parseInt(hex.slice(3, 5), 16); img.data[k + 2] = parseInt(hex.slice(5, 7), 16); img.data[k + 3] = 255; };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
      const tb = Math.acos(Math.max(-1, Math.min(1, dy / (r || 1)))) / Math.PI;      // 0 at the bottom .. 1 at the top
      const cw = ((Math.atan2(dx, -dy) / (2 * Math.PI)) + 1) % 1;                   // clockwise from the top
      const lit = (-dx - dy) / ((r || 1) * Math.SQRT2);                              // +1 faces the upper-left light
      put(x, y, fn({ x, y, dx, dy, r, tb, cw, lit, left: dx < 0 }));
    }
    return { g, img, put, done: () => g.putImageData(img, 0, 0) };
  }
  const bezel = (o) => (o.lit > 0.45 ? P.st[2] : o.lit < -0.45 ? P.st[0] : P.st[1]);
  const disc = (o, R) => (o.r >= R - 1 ? (o.lit > 0.2 ? P.sh[0] : o.lit < -0.2 ? P.sh[3] : P.sh[1]) : P.sh[1]);
  const fillOf = (o) => (o.left ? fHp : fMp);
  const hpMp = (o, inner) => (o.left ? (inner ? P.bl[0] : P.bl[1]) : (inner ? P.wa[1] : P.fr[0]));
  const spent = (o) => (o.left ? P.cl[0] : P.wa[0]);

  /* A: 44 art px (phone 36). outline 1 · bezel 2 · channel 5 notched every 10% · rim 1 · XP 2 · sunk disc. */
  function ringA(cv, S) {
    const R = S / 2, ch = S >= 44 ? 4 : 3, xpW = 2;
    const cOut = R - 3, cIn = cOut - ch, xOut = cIn - 1, xIn = xOut - xpW;
    paint(cv, S, (o) => {
      if (o.r >= R) return null;
      if (o.r >= R - 1) return P.sh[0];
      if (o.r >= cOut) return o.r >= R - 2 && o.lit > 0.7 ? P.st[3] : bezel(o);
      if (o.r >= cIn) {
        if (Math.abs(o.dx) < 1) return P.sh[0];                                        // the divider at top and bottom
        const seg = o.tb * 10, along = (seg % 1) * (Math.PI * o.r / 10);
        if (along < 1 && seg > 0.5) return P.sh[0];                                    // a notch every 10%
        if (o.tb > fillOf(o)) return spent(o);
        return hpMp(o, o.r < cIn + 1);
      }
      if (o.r >= xOut) return P.ir[0];
      if (o.r >= xIn) return o.cw <= fXp ? (o.lit > 0.3 ? P.to[1] : P.go) : P.br[0];
      return disc(o, xIn);
    }).done();
  }
  /* B: 64 art px (phone 40). outline 1 · bezel 3 · a horseshoe: thick crescents from 7:30 / 4:30 up to the top with a
     lit outer edge, the bottom quarter a steel base the stamina sits on · rim 1 · XP 2 · disc. */
  function ringB(cv, S) {
    const R = S / 2, bz = S >= 60 ? 3 : 2, ch = S >= 60 ? 7 : 5;
    const cOut = R - 1 - bz, cIn = cOut - ch, xOut = cIn - 1, xIn = xOut - 2;
    paint(cv, S, (o) => {
      if (o.r >= R) return null;
      if (o.r >= R - 1) return P.sh[0];
      if (o.r >= cOut) return o.r >= R - 2 && o.lit > 0.6 ? P.st[3] : bezel(o);
      if (o.r >= cIn) {
        if (o.tb < 0.25) return o.r >= cOut - 1 ? P.sh[0] : o.r < cIn + 1 ? P.st[0] : bezel(o);   // the steel base (stamina sits on it)
        if (Math.abs(o.dx) < 1.5) return o.lit > 0 ? P.st[2] : P.st[1];                 // the steel cap at the top
        if ((o.tb - 0.25) / 0.75 > fillOf(o)) return o.r >= cOut - 1 ? P.sh[0] : spent(o);
        if (o.r >= cOut - 1) return P.sh[0];                                           // the channel's shadowed lip
        if (o.r >= cOut - 2 && o.lit > -0.2) return o.left ? P.to[0] : P.fr[1];         // the lit edge, upper-left
        return hpMp(o, o.r < cIn + 2);
      }
      if (o.r >= xOut) return P.ir[0];
      if (o.r >= xIn) return o.cw <= fXp ? (o.lit > 0.3 ? P.to[1] : P.go) : P.br[0];
      return disc(o, xIn);
    }).done();
  }
  /* C: 40 art px (phone 34). 8 gems a side (4x4, rounded, lit at the upper-left) set in a dark band, a 1 px gold
     XP ring inside, a sunk disc. */
  function ringC(cv, S) {
    const R = S / 2, bOut = R - 2, bIn = bOut - 6, Rb = (bOut + bIn) / 2, xR = bIn - 1;
    const pnt = paint(cv, S, (o) => {
      if (o.r >= R) return null;
      if (o.r >= R - 1) return P.sh[0];
      if (o.r >= bOut) return bezel(o);
      if (o.r >= bIn) return o.r >= bOut - 1 ? P.sh[0] : P.sh[1];                          // the dark band the gems sit in
      if (o.r >= xR) return o.cw <= fXp ? (o.lit > 0.3 ? P.to[1] : P.go) : P.br[0];       // XP, 1 px gold
      if (o.r >= xR - 1) return P.ir[1];
      return disc(o, xR - 1);
    });
    const N = 8;
    for (const left of [true, false]) for (let i = 0; i < N; i++) {
      const tb = (i + 0.5) / N, a = Math.PI * (0.06 + 0.88 * tb);
      const cx = Math.round(S / 2 + (left ? -1 : 1) * Rb * Math.sin(a) - 2), cy = Math.round(S / 2 + Rb * Math.cos(a) - 2);
      const on = i < Math.round((left ? fHp : fMp) * N);
      const [base, dark, hi] = left ? (on ? [P.bl[1], P.bl[0], P.to[0]] : [P.cl[0], P.cl[0], P.cl[1]]) : (on ? [P.fr[0], P.wa[1], P.fr[1]] : [P.wa[0], P.wa[0], P.wa[1]]);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        if ((x === 0 || x === 3) && (y === 0 || y === 3)) continue;                       // rounded corners
        pnt.put(cx + x, cy + y, (x === 1 && y === 0) || (x === 0 && y === 1) ? hi : (x === 3 || y === 3) ? dark : base);
      }
    }
    pnt.done();
  }

  const SIZE = { a: phone ? 36 : 44, b: phone ? 40 : 64, c: phone ? 34 : 40 }[variant];
  const cv = document.createElement('canvas');
  cv.className = 'sb-ring';
  ({ a: ringA, b: ringB, c: ringC })[variant](cv, SIZE);
  cv.style.width = cv.style.height = (SIZE * 2) + 'px';

  const read = (k, label, v, r) => '<div class="sb-read is-' + k + '"><b class="sb-v"><span class="sb-k">' + label + '</span>' + v[0].toLocaleString('en-GB') + '<span class="sb-max">/' + v[1].toLocaleString('en-GB') + '</span></b><small class="sb-r">' + r + '</small></div>';
  const hubEl = document.createElement('div');
  hubEl.className = 'sb-hub';
  hubEl.innerHTML = read('hp', 'HP', hp, rg('hp'))
    + '<div class="sb-medal" title="Level ' + lv + ': ' + xp + '% of the way to ' + (+lv + 1) + '"><span class="sb-lv"><b>' + lv + '</b><small>' + xp + '%</small></span></div>'
    + read('mp', 'MP', mp, rg('mana'))
    + '<div class="sb-sock is-food" title="Food: ' + foodN + ' in the hunt bag"><span class="sb-sock-ico">' + foodIco + '</span><b class="sb-n">' + foodN + '</b></div>'
    + '<div class="sb-sock is-charm" title="Charm: empty"><span class="sb-sock-ico">' + ringGlyph + '</span></div>'
    + '<div class="sb-stam" title="Stamina: hunting time left">' + hourglass + '<b>' + stam + '</b></div>';
  hubEl.querySelector('.sb-medal').prepend(cv);

  const setup = document.createElement('div');
  setup.className = 'sb-setup';
  setup.appendChild(bar.querySelector('.hb-plaque > .hb-pl-row').cloneNode(true));

  const inner = document.createElement('div');
  inner.className = 'sb-in';
  inner.append(side(false), hubEl, side(true), setup);
  bar.prepend(inner);
  bar.classList.add('sb', 'sb-' + variant);
  bar.closest('.hs-widget').classList.add('sb-w', 'sb-w-' + variant);
  return 'bar rebuilt: ' + variant + (phone ? ' (phone)' : '') + ', ring ' + SIZE + ' art px, Level ' + lv + ', HP ' + hp.join('/') + ', MP ' + mp.join('/') + ', XP ' + xp + '%';

  /* ── CONFIGURE ACTION: Spells | Runes | Food & drink | Ammo ── */
  function configure(tab) {
    const root = document.querySelector('.ca');
    if (!root || root.classList.contains('sb-ca')) return 'already';
    root.classList.add('sb-ca');
    const items = root.querySelector('.ca-tab[data-tab="items"]');
    items.click();
    const tabs = root.querySelector('.ca-tabs');
    items.textContent = 'Food & drink';
    const ammo = items.cloneNode(true);
    ammo.textContent = 'Ammo';
    ammo.setAttribute('data-tab', 'ammo');
    tabs.appendChild(ammo);
    for (const b of tabs.querySelectorAll('.ca-tab')) b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === (tab === 'ammo' ? 'ammo' : 'items')));
    const runs = root.querySelectorAll('.ca-run');
    const LABEL = { food: ['Food', 'restores HP'], drink: ['Drink', 'restores mana'], ammo: ['Arrows and bolts', 'what your bow or crossbow fires'] };
    for (const run of runs) {
      const k = run.getAttribute('data-run');
      run.hidden = tab === 'ammo' ? k !== 'ammo' : k === 'ammo';
      const h = run.querySelector('.ca-run-label');
      if (h && LABEL[k]) h.innerHTML = LABEL[k][0] + ' <small>' + LABEL[k][1] + '</small>';
      /* What each row restores or fires: a line under its name (patchRow never repaints it) and the amount's unit
         (samples.css, so the client's repaint keeps it). */
      for (const row of run.querySelectorAll('.ca-row')) {
        const id = row.getAttribute('data-id') || '';
        const sub = k === 'ammo' ? (id === 'loaded' ? 'what your weapon holds' : /bolt/.test(id) ? 'fired by a crossbow' : 'fired by a bow')
          : '';
        if (sub && !row.querySelector('.sb-sub')) row.querySelector('.ca-namebox').insertAdjacentHTML('beforeend', '<small class="sb-sub">' + sub + '</small>');
      }
    }
    root.classList.add('sb-tab-' + tab);
    /* The tab's empty line on Ammo when nothing matches, and the kinds with a home elsewhere (README). */
    const well = root.querySelector('.ca-well');
    if (tab === 'ammo') well.insertAdjacentHTML('beforeend', '<p class="sb-ca-note">Whetstones are worn in the gear’s ammo slot; runes are on the Runes tab.</p>');
    else well.insertAdjacentHTML('beforeend', '<p class="sb-ca-note">Food and drink share one 2 s cooldown. Half lands at once, the rest over 6 s.</p>');
    const first = root.querySelectorAll('.ca-run:not([hidden]) .ca-list .ca-row')[tab === 'ammo' ? 2 : 0];
    if (first) first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    /* Scroll the list's own scroller: Food & drink shows the Food run's end and the Drink run's head; Ammo its label at the top. */
    const target = root.querySelector(tab === 'ammo' ? '.ca-run[data-run="ammo"]' : '.ca-run[data-run="drink"]');
    let sc = target && target.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (sc) {
      const off = target.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
      sc.scrollTop = tab === 'ammo' ? off - 40 : off - sc.clientHeight * 0.45;
    }
    return 'configure sample: ' + tab + ', runs ' + Array.from(runs).filter((r) => !r.hidden).map((r) => r.getAttribute('data-run')).join('+');
  }
}
