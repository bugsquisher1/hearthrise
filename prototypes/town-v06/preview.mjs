#!/usr/bin/env node
// prototypes/town-v06/preview.mjs — layout.json → <id>.preview.png (blueprint-style colour layout, labelled).
// Run build-maps.mjs first. Uses playwright (node_modules junction in the worktree).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = dirname(fileURLToPath(import.meta.url));
const req = createRequire(join(process.argv[2] || HERE, 'package.json'));
const { chromium } = req('playwright');
const L = JSON.parse(readFileSync(join(HERE, 'layout.json'), 'utf8'));
const S = 16;
const browser = await chromium.launch();
for (const [id, d] of Object.entries(L)) {
  const page = await browser.newPage({ viewport: { width: d.row.rows[0].length * S, height: d.row.rows.length * S + 28 } });
  await page.setContent('<body style="margin:0;background:#111"><canvas id=c></canvas></body>');
  await page.evaluate(({ d, S, id }) => {
    const r = d.row, w = r.rows[0].length, h = r.rows.length, c = document.getElementById('c');
    c.width = w * S; c.height = h * S + 28; const g = c.getContext('2d');
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, c.width, 28); g.fillStyle = '#fff'; g.font = '13px sans-serif';
    g.fillText(r.name + '  (' + id + ', ' + w + 'x' + h + ')   ● tree  ■ prop  ◆ needs-art  ★ start  ▶ exit', 8, 18);
    g.translate(0, 28);
    const col = { '.': '#4f8a4a', ':': '#a69c8a', '=': '#9a7b55', '#': '#8a6a3c', '^': '#64666e', '~': '#3d63b3' };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { g.fillStyle = col[r.rows[y][x]]; g.fillRect(x * S, y * S, S, S); }
    const tint = { stone: '#7c7d84', timber: '#8a5a36', ea: '#d9a441', fancy: '#b45ad1', wood: '#2f5a2a', quarry: '#9a7b55', rock: '#64666e' };
    for (const [name, x, y, bw, bh, t] of d.labels) {
      if (!['wood', 'quarry', 'rock'].includes(t)) { g.fillStyle = tint[t]; g.fillRect(x * S, y * S, bw * S, bh * S); g.strokeStyle = '#111'; g.strokeRect(x * S + .5, y * S + .5, bw * S - 1, bh * S - 1); }
    }
    for (const b of r.buildings) for (const [x, y] of b.doors) { g.fillStyle = '#2b1a0e'; g.fillRect(x * S + 4, y * S + 6, 8, 10); }
    for (const o of r.objects) {
      const tree = /oak|pine|deadtree/.test(o.id);
      g.fillStyle = tree ? '#1f4a22' : /hedge|bush/.test(o.id) ? '#2e6b2b' : /flower/.test(o.id) ? '#d46a8c' : '#e8d27a';
      if (tree) { g.beginPath(); g.arc(o.x * S + 8, o.y * S + 8, 6, 0, 7); g.fill(); g.strokeStyle = '#0b1f0d'; g.stroke(); }
      else g.fillRect(o.x * S + 4, o.y * S + 4, 8, 8);
    }
    for (const [, x, y] of d.want) { g.fillStyle = '#ff4fd8'; g.beginPath(); g.moveTo(x * S + 8, y * S + 2); g.lineTo(x * S + 14, y * S + 8); g.lineTo(x * S + 8, y * S + 14); g.lineTo(x * S + 2, y * S + 8); g.fill(); }
    g.fillStyle = '#ffeb3b'; g.font = 'bold 16px sans-serif'; g.fillText('★', r.start[0] * S + 1, r.start[1] * S + 14);
    for (const e of r.exits) { g.fillStyle = '#ff3b3b'; g.fillRect(e.x * S + 2, e.y * S + 2, 12, 12); }
    g.font = 'bold 11px sans-serif';
    const tag = (txt, x, y) => { g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(txt, x, y); g.fillStyle = '#fff'; g.fillText(txt, x, y); };
    for (const [name, x, y, bw, bh, t] of d.labels) tag(name, x * S + 3, (t === 'rock' ? y + 1 : y) * S + 12);
    for (const e of r.exits) tag('→ ' + e.to, Math.min(e.x * S, w * S - 120), e.y * S + (e.y === 0 ? 28 : -4));
  }, { d, S, id });
  await page.locator('#c').screenshot({ path: join(HERE, id + '.preview.png') });
  await page.close();
}
await browser.close();
console.log('previews written');
