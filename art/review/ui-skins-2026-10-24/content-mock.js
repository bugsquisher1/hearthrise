/* art/review/ui-skins-2026-10-24/content-mock.js — the SAME content for every Hunts-window shot (today and
   each skin), pasted into the browser pane as the javascript tool's text. Inspection mock only.
   1. The picked ground is Mosslight Glade.
   2. "Who lives here" faces front (dir 's', shipping in v0.2.39) and every creature stands on a pixel ground
      shadow: an ellipse 0.8x its body wide, 4 art px tall, drawn in the shadow colour at half alpha at the
      art's own pixels, then the whole picture scaled x2 (smoothing off), like the world draws it.
   3. The drops become the coming "% chance per kill" lines: the hero's own armour line (Iron) and the
      weapon, then each Rare, with its carrier; odds from src/data/monsters.js (the server's catalogue). */
(async () => {
  const V = '?v=0.2.38';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { creatureArt, drawCreature } = await import('/src/render/creature-sprite.js' + V);
  const { itemIconHtml } = await import('/src/shell/widgets/bits.js' + V);
  const { ITEMS } = await import('/src/data/items.js' + V);
  if (!document.querySelector('.hs-win[data-hs-win="hunts"]')) {
    [...document.querySelectorAll('.hs-launch')].find((b) => b.dataset.tip === 'Hunts').click();
    await sleep(900);
  }
  const row = [...document.querySelectorAll('.hw-hunt')].find((li) => /Mosslight Glade/.test(li.textContent));
  if (row && !row.classList.contains('is-picked')) { row.click(); await sleep(700); }
  const det = [...document.querySelectorAll('.hw-hunt-detail')].find((d) => !d.hidden && /Mosslight Glade/.test(d.querySelector('.hw-hd-name').textContent));
  if (!det) return 'no Mosslight page';

  /* 2. front-facing, on a ground shadow */
  const art = await creatureArt(document, '0.2.38');
  for (const li of det.querySelectorAll('.hw-hd-mon')) {
    const id = li.getAttribute('data-monster'), c = li.querySelector('canvas');
    const one = document.createElement('canvas');
    if (!drawCreature(one, art, id, { dir: 's', scale: 1 })) continue;
    const w = one.width, h = one.height, rx = Math.max(5, Math.round(w * 0.4)), ry = 2;
    const W = Math.max(w, rx * 2 + 1), H = h + ry;
    const pic = document.createElement('canvas'); pic.width = W; pic.height = H;
    const g = pic.getContext('2d');
    g.fillStyle = 'rgba(11, 10, 12, 0.5)';   /* palette shadow #0b0a0c at half alpha */
    const cx = (W - 1) / 2, cy = h - 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g.fillRect(x, y, 1, 1);
    g.drawImage(one, Math.round((W - w) / 2), 0);
    c.width = W * 2; c.height = H * 2;
    const k = c.getContext('2d'); k.imageSmoothingEnabled = false; k.drawImage(pic, 0, 0, W * 2, H * 2);
    c.setAttribute('data-drawn', id);   /* the page's own repaint leaves a drawn canvas alone */
  }
  const tallest = Math.max(...[...det.querySelectorAll('.hw-hd-mon canvas')].map((c) => c.height));
  det.querySelector('.hw-hd-lineup').style.setProperty('--stand-h', tallest + 'px');

  /* 3. the drops as chance per kill */
  if (!det.querySelector('.hw-hd-odds')) {
    const lines = [
      ['iron_platebody', 0.05, 'Goblin Sluicer'], ['iron_platelegs', 0.028, 'Glade Poacher'], ['longbow', 0.028, 'Glade Poacher'],
      ['iron_helm', 0.019, 'Walking Vine'], ['iron_boots', 0.0095, 'Carrion Crow'],
      ['rooks_whistle', 0.0038, 'Rook the Poacher', 1], ['steel_helm', 0.0038, 'Rook the Poacher', 1],
      ['boarhide_helmet', 0.0038, 'Rook the Poacher', 1], ['scholar_helmet', 0.0038, 'Rook the Poacher', 1],
    ];
    const pct = (p) => Number((p * 100).toPrecision(2)) + '%';
    const name = (id) => (ITEMS[id] && ITEMS[id].n) || id;
    const html = '<h4 class="hw-hd-h hw-hd-odds-h">Drops, chance per kill</h4><ul class="hw-hd-odds" aria-label="Drops, chance per kill">'
      + lines.map(([id, p, by, rare]) => '<li class="hw-hd-odd' + (rare ? ' is-rare' : '') + '"><span class="hw-ico">' + itemIconHtml(window.HR_GLYPHS || {}, id) + '</span>'
        + '<span class="hw-hd-odd-main"><b>' + name(id) + '</b><small>' + by + '</small></span><span class="hw-hd-odd-p">' + pct(p) + '</span></li>').join('')
      + '</ul><p class="hw-hd-odds-note">Studded and Adept pieces drop at the same chance as Iron.</p>';
    det.querySelector('.hw-hd-lineup').insertAdjacentHTML('afterend', html);
  }
  det.closest('.hs-win-body').scrollTop = 0;
  return 'content set: ' + det.querySelectorAll('.hw-hd-mon canvas[data-drawn]').length + ' creatures, ' + det.querySelectorAll('.hw-hd-odd').length + ' drop lines';
})();
