/**
 * Hearthfire art pilot processor.
 *  - loads each 1024 RGBA source in a real browser (Playwright chromium)
 *  - measures the alpha bounding box + alpha statistics (proves real alpha, not flattened)
 *  - MONSTERS: fit into an exactly-256x256 square canvas (spec: monster-art-prompts.md)
 *  - ITEMS/GEAR/FOOD: auto-crop to content, scale long edge to 256 (see report note)
 *  - writes PNG-24 RGBA out, then re-reads the header to prove dimensions + colour type 6
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const SRC  = process.argv[2];
const DEST = process.argv[3];
const ONLY = process.argv.slice(4);           // optional list of basenames

const MONSTER_PX = 256;   // square, hard spec
const ITEM_PX    = 256;   // long edge, auto-cropped

function walk(d){ let o=[]; for(const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if(e.isDirectory()) o=o.concat(walk(p)); else if(/\.png$/i.test(e.name)) o.push(p);} return o; }
function hdr(f){ const b=fs.readFileSync(f); return { w:b.readUInt32BE(16), h:b.readUInt32BE(20), depth:b[24], ct:b[25], bytes:b.length }; }

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

const rows = [];
for (const src of walk(SRC)) {
  const rel = path.relative(SRC, src).replace(/\\/g,'/');
  const base = path.basename(src);
  if (ONLY.length && !ONLY.includes(base)) continue;
  const isMonster = rel.startsWith('monsters/');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');

  const out = await page.evaluate(async ({ dataUrl, isMonster, MONSTER_PX, ITEM_PX }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;

    // alpha statistics
    let opaque = 0, transparent = 0, partial = 0;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    const T = 8;                                    // alpha threshold for "content"
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = d[(y*W + x)*4 + 3];
        if (a === 255) opaque++; else if (a === 0) transparent++; else partial++;
        if (a > T) { if (x<minX) minX=x; if (x>maxX) maxX=x; if (y<minY) minY=y; if (y>maxY) maxY=y; }
      }
    }
    // corner/edge alpha probe — a flattened-white export fails this
    const at = (x,y) => d[(y*W + x)*4 + 3];
    const corners = [at(0,0), at(W-1,0), at(0,H-1), at(W-1,H-1)];

    if (maxX < 0) return { error: 'fully transparent' };
    const cw = maxX - minX + 1, ch = maxY - minY + 1;

    let outW, outH, dx, dy, dw, dh;
    if (isMonster) {
      // square canvas, content fitted with a small breathing margin
      outW = outH = MONSTER_PX;
      const fit = MONSTER_PX * 0.98;
      const s = Math.min(fit / cw, fit / ch);
      dw = Math.round(cw * s); dh = Math.round(ch * s);
      dx = Math.round((outW - dw) / 2); dy = Math.round((outH - dh) / 2);
    } else {
      const s = ITEM_PX / Math.max(cw, ch);
      outW = Math.max(1, Math.round(cw * s)); outH = Math.max(1, Math.round(ch * s));
      dx = 0; dy = 0; dw = outW; dh = outH;
    }

    /* ALPHA NORMALISE — done on the SOURCE, before downscale, so the resample
       interpolates already-correct values.
       The Recraft exports come back with the subject's solid interior at
       alpha 240-254 (mean ~247), not 255 — a global ~3% translucency that is
       an export artifact, not an artistic choice. Over the hearthlight dark
       surface that reads as a faint wash. Lift only the band the artist meant
       to be solid (a >= 240) to 255; the real anti-aliased edge ramp lives
       below 240 and is left exactly as painted, so silhouettes stay soft. */
    for (let i = 3; i < d.length; i += 4) if (d[i] >= 240) d[i] = 255;
    const norm = new ImageData(d, W, H);
    g.putImageData(norm, 0, 0);

    const o = document.createElement('canvas'); o.width = outW; o.height = outH;
    const og = o.getContext('2d');
    og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.clearRect(0, 0, outW, outH);
    og.drawImage(c, minX, minY, cw, ch, dx, dy, dw, dh);

    // prove the OUTPUT still has real alpha
    const od = og.getImageData(0, 0, outW, outH).data;
    let oOpaque = 0, oTrans = 0;
    for (let i = 3; i < od.length; i += 4) { if (od[i] === 255) oOpaque++; else if (od[i] === 0) oTrans++; }

    return {
      srcW: W, srcH: H, cropX: minX, cropY: minY, cropW: cw, cropH: ch,
      opaquePct: +(100*opaque/(W*H)).toFixed(1),
      transparentPct: +(100*transparent/(W*H)).toFixed(1),
      partialPct: +(100*partial/(W*H)).toFixed(1),
      corners,
      outW, outH,
      outTransparentPct: +(100*oTrans/(outW*outH)).toFixed(1),
      png: o.toDataURL('image/png')
    };
  }, { dataUrl, isMonster, MONSTER_PX, ITEM_PX });

  if (out.error) { rows.push({ rel, error: out.error }); continue; }

  const dst = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(out.png.split(',')[1], 'base64'));
  const h = hdr(dst);
  rows.push({ rel, ...out, png: undefined, outHdr: `${h.w}x${h.h} ct=${h.ct} ${(h.bytes/1024).toFixed(0)}KB` });
}

await browser.close();

console.log('file\tsrc\tcontent-bbox\tsrc alpha (op/tr/part %)\tcorners\tOUT (header)\tout transparent%');
for (const r of rows) {
  if (r.error) { console.log(r.rel + '\tERROR ' + r.error); continue; }
  console.log([
    r.rel, `${r.srcW}x${r.srcH}`, `${r.cropW}x${r.cropH}@${r.cropX},${r.cropY}`,
    `${r.opaquePct}/${r.transparentPct}/${r.partialPct}`,
    r.corners.join(','),
    r.outHdr, r.outTransparentPct
  ].join('\t'));
}
