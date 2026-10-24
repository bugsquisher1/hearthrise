/* art/review/action-bar-2026-10-24/mock-bar.js — THROWAWAY: rebuilds the action bar's INTERIOR for a mock shot.
   Run in the page (page.evaluate) after the bar has mounted. The medallion and its arcs are removed (Tyler
   2026-10-24: "that circle is disgusting"); every number is read from the real hub the client just patched
   from the server's envelope (HP, MP, Level, XP %, stamina), so the mock shows the game's own values.
   Builds:
     .mk-vitals    Level in gold, slim HP / MP bars with their numbers, a thin XP bar, stamina left
     .mk-supplies  the real Food and Charm sockets, moved, each with a plain label
     the setup's two icon buttons get words ("Setups", "Fight settings")
   The variant (v1 column / v2 band) is a class on the bar; the stylesheet does the rest. */
(variant) => {
  const bar = document.querySelector('.hb-bar');
  if (!bar || bar.querySelector('.mk-vitals')) return 'already';
  const hub = bar.querySelector('.hb-hub');
  const t = (s) => (hub.querySelector(s) || {}).textContent || '';
  const pair = (s) => { const m = /([\d,]+)\s*\/\s*([\d,]+)/.exec(s); return m ? [+m[1].replace(/,/g, ''), +m[2].replace(/,/g, '')] : null; };
  const hp = pair(t('[data-v="hp"]')), mp = pair(t('[data-v="mana"]'));
  const lv = t('.hb-lv'), xp = (/(\d+)%/.exec(t('.hb-xp')) || [])[1];
  const pct = (p) => (p && p[1] ? Math.round((p[0] / p[1]) * 1000) / 10 : 0);
  const num = (p) => (p ? p[0].toLocaleString('en-GB') + ' / ' + p[1].toLocaleString('en-GB') : '–');
  const regen = (k) => t('[data-r="' + k + '"]');
  const gauge = (k, label, p, r) => '<div class="mk-row is-' + k + '"><span class="mk-k">' + label + '</span>'
    + '<span class="mk-track"><i style="width:' + pct(p) + '%"></i></span><b class="mk-v">' + num(p) + '</b>'
    + (r ? '<small class="mk-r">' + r + '</small>' : '') + '</div>';
  const vit = document.createElement('div');
  vit.className = 'mk-vitals';
  vit.innerHTML = '<div class="mk-lv"><b>Level ' + (lv || '–') + '</b></div>'
    + gauge('hp', 'HP', hp, regen('hp')) + gauge('mp', 'MP', mp, regen('mana'))
    + '<div class="mk-row is-xp" title="Level XP: ' + (xp || 0) + '% of the way to ' + (+lv + 1) + '"><span class="mk-k">XP</span>'
    + '<span class="mk-track"><i style="width:' + (xp || 0) + '%"></i></span><b class="mk-v">' + (xp || 0) + '%</b></div>';
  const stam = hub.querySelector('.hb-stam');
  if (stam) { stam.classList.add('mk-stam'); stam.insertAdjacentHTML('beforeend', '<small>stamina</small>'); vit.appendChild(stam); }
  const sup = document.createElement('div');
  sup.className = 'mk-supplies';
  for (const s of hub.querySelectorAll('.hb-socket')) sup.appendChild(s);
  hub.style.display = 'none';
  const slots = bar.querySelectorAll('.hb-slots');
  bar.insertBefore(vit, slots[0]);
  slots[1].after(sup);
  for (const [act, words] of [['setups', 'Setups'], ['panel', 'Fight settings']]) {
    const b = bar.querySelector('.hb-plaque > .hb-pl-row [data-hs-act="' + act + '"]');
    if (b) { b.classList.add('mk-word'); b.textContent = words; }
  }
  bar.classList.add('mk', 'mk-' + variant);
  return 'bar rebuilt: ' + variant + ', Level ' + lv + ', HP ' + num(hp) + ', MP ' + num(mp) + ', XP ' + xp + '%';
}
