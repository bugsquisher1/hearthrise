// tools/world-art/validate.mjs — the scale, palette and ground-contact rules of the
// pixel world (src/data/world/art-budget.js), applied to LOCKED frames.
//
// A finding is { rule, id, detail }. The rules, each named so a test can demand
// the exact one a defect must trip:
//   class         the sidecar names a class the budget does not have
//   frame         a frame is not the class frame (characters share one 64×64 frame)
//   anchor-class  a sprite of a fixed-frame class moved the shared anchor
//   alpha         partial alpha (a soft, baked shadow survives only this way)
//   palette       an opaque pixel outside the locked palette
//   budget        the body is outside the class band ±TOLERANCE
//   width/canopy  the secondary band (a chest wider than a tile, a thin tree)
//   below-anchor  pixels under the contact row beyond the declared overhang:
//                 a baked shadow or a ground patch
//   anchor-drift  the declared anchor is not where the pixels meet the floor
//   contact       too little of the sprite rests on the floor (it floats)
//   iso-corner    the sprite is drawn corner-on (isometric), not top-down
//   feet / hover  a unit frame leaves the shared anchor / a flier is not hovering
//   empty         a frame with no pixels (a class with `blank` may fade through
//                 empty frames, never be empty in all of them)
// Every rule reads its GRID (src/data/world/art-budget.js GRIDS; the base grid by default):
// the grid's class table and T, and every pixel tolerance times its scale k, so a sprite
// drawn on the 64 px grid is held to exactly the base rules at twice the size.
import { TOLERANCE, WANG_KEYS, ATLAS_MAX, GRIDS } from '../../src/data/world/art-budget.js';
import { inPalette } from './lock.mjs';
import { measureFrame, countBelow, contactSpans, isoCorner } from './measure.mjs';

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : 0; };
const label = (f) => `${f.anim}/${f.dir}/${f.i}`;

function colourFindings(id, f, out) {
  const d = f.img.data;
  let partial = 0, off = 0, firstOff = null;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a !== 0 && a !== 255) partial++;
    if (a && !inPalette(d[i], d[i + 1], d[i + 2])) {
      off++;
      if (!firstOff) firstOff = [(i / 4) % f.img.width, Math.floor(i / 4 / f.img.width), d[i], d[i + 1], d[i + 2]];
    }
  }
  if (partial) out.push({ rule: 'alpha', id, detail: `${label(f)}: ${partial} partially transparent pixels` });
  if (off) {
    const [x, y, r, g, b] = firstOff;
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    out.push({ rule: 'palette', id, detail: `${label(f)}: ${off} pixels off the palette (first ${hex} at ${x},${y})` });
  }
}

/** The body measure of one frame for a class. */
export function bodyOf(cls, m0) {
  const m = cls.raw ? { mass: m0.box } : m0;
  return cls.measure === 'w' ? m.mass.w : cls.measure === 'max' ? Math.max(m.mass.w, m.mass.h) : cls.measure === 'min' ? Math.min(m.mass.w, m.mass.h) : m.mass.h;
}

/** The reference frames: frame 0 of the first animation, in every direction it has. */
export function referenceFrames(frames) {
  const first = frames.length ? frames[0].anim : null;
  return frames.filter((f) => f.anim === first && f.i === 0);
}

/**
 * sprite = { id, class, anchor:[x,y], footprint:[w,h], overhang:[t,r,b,l], hover,
 *            frames: [{ anim, dir, i, img }] } — frames already palette-locked.
 */
export function validateSprite(sp, grid = GRIDS.base) {
  const out = [];
  const id = sp.id;
  const k = grid.scale, T = grid.T;
  const cls = grid.classes[sp.class];
  if (!cls) return [{ rule: 'class', id, detail: `unknown class "${sp.class}"` }];
  if (!sp.frames.length) return [{ rule: 'empty', id, detail: 'no frames' }];
  const [ax, ay] = sp.anchor;
  const over = sp.overhang || [0, 0, 0, 0];
  const fw = sp.frames[0].img.width, fh = sp.frames[0].img.height;
  if (cls.frame && (fw !== cls.frame[0] || fh !== cls.frame[1])) out.push({ rule: 'frame', id, detail: `frame ${fw}x${fh}, class ${sp.class} is ${cls.frame.join('x')}` });
  for (const f of sp.frames) if (f.img.width !== fw || f.img.height !== fh) out.push({ rule: 'frame', id, detail: `${label(f)} is ${f.img.width}x${f.img.height}, not ${fw}x${fh}` });
  if (cls.anchor && (ax !== cls.anchor[0] || ay !== cls.anchor[1])) out.push({ rule: 'anchor-class', id, detail: `anchor ${ax},${ay}; every ${sp.class} shares ${cls.anchor.join(',')}` });

  const meas = new Map();
  for (const f of sp.frames) {
    colourFindings(id, f, out);
    const m = measureFrame(f.img, k);
    meas.set(f, m);
    if (m.empty) { if (!cls.blank) out.push({ rule: 'empty', id, detail: `${label(f)} has no pixels` }); continue; }
    if (cls.contact !== 'raised') {
      const below = countBelow(m.mask, f.img.width, f.img.height, ay + over[2]);
      if (below) out.push({ rule: 'below-anchor', id, detail: `${label(f)}: ${below} pixels below the contact row ${ay}${over[2] ? ` + overhang ${over[2]}` : ''} (a baked shadow or ground patch)` });
    }
  }
  if (cls.blank && sp.frames.every((f) => meas.get(f).empty)) out.push({ rule: 'empty', id, detail: 'every frame is blank' });
  const refs = referenceFrames(sp.frames).filter((f) => !meas.get(f).empty);
  if (!refs.length) return out;

  const body = median(refs.map((f) => bodyOf(cls, meas.get(f))));
  const lo = cls.body[0] * (1 - TOLERANCE), hi = cls.body[1] * (1 + TOLERANCE);
  if (body < lo || body > hi) out.push({ rule: 'budget', id, detail: `body ${body}px (${cls.measure}), class ${sp.class} allows ${cls.body.join('-')} ±${TOLERANCE * 100}% = ${lo.toFixed(1)}-${hi.toFixed(1)}` });
  const massW = median(refs.map((f) => meas.get(f).mass.w));
  if (cls.maxW && massW > cls.maxW * (1 + TOLERANCE)) out.push({ rule: 'width', id, detail: `mass ${massW}px wide, class ${sp.class} allows ${cls.maxW}` });
  // a crown is read by its outline, bare branches included: canopy is the box width
  const boxW = median(refs.map((f) => meas.get(f).box.w));
  if (cls.canopy && (boxW < cls.canopy[0] * (1 - TOLERANCE) || boxW > cls.canopy[1] * (1 + TOLERANCE))) out.push({ rule: 'canopy', id, detail: `canopy ${boxW}px wide, class ${sp.class} allows ${cls.canopy.join('-')}` });

  const c = cls.contact;
  if (c === 'unit') {
    for (const f of sp.frames) {
      const m = meas.get(f);
      if (m.empty) continue;
      const tol = (f.i === 0 && f.anim === refs[0].anim ? 1 : 4) * k;
      if (m.foot < ay - tol || m.foot > ay + over[2]) out.push({ rule: 'feet', id, detail: `${label(f)}: feet on row ${m.foot}, the shared anchor is row ${ay} (${tol} up, ${over[2]} overhang down)` });
    }
  } else if (c === 'flier') {
    const hv = sp.hover || 0;
    if (!cls.hover || hv < cls.hover[0] || hv > cls.hover[1]) out.push({ rule: 'hover', id, detail: `hover_px ${hv}, class ${sp.class} hovers ${cls.hover ? cls.hover.join('-') : '?'}` });
    for (const f of refs) {
      const y1 = meas.get(f).box.y1;
      if (Math.abs(y1 - (ay - hv)) > 3 * k) out.push({ rule: 'hover', id, detail: `${label(f)}: lowest pixel row ${y1}, expected ${ay - hv} (anchor ${ay} - hover ${hv})` });
    }
  } else if (c !== 'raised' && c !== 'flat') {
    for (const f of refs) {
      const m = meas.get(f);
      const where = label(f);
      if (c === 'wall') {
        let n = 0;
        for (let x = 0; x < fw; x++) if (m.profile[x] === ay) n++;
        if (n < 0.9 * fw) out.push({ rule: 'contact', id, detail: `${where}: ${n}/${fw} columns reach the base row ${ay}; a wall slice stands on its full width` });
        continue;
      }
      // Things on legs, posts and trunks, and small clutter lying flat, meet the floor
      // at their lowest feet; a solid base on its widest row.
      const meets = c === 'legged' || c === 'post' || c === 'touch' ? m.foot : m.contact;
      if (Math.abs(meets - ay) > k || ax < m.box.x0 || ax > m.box.x1) out.push({ rule: 'anchor-drift', id, detail: `${where}: declared anchor ${ax},${ay}, the pixels meet the floor on row ${meets} across x ${m.box.x0}-${m.box.x1}` });
      const spans = contactSpans(m.profile, ay, 2 * k).filter(([s, e]) => e >= m.box.x0 && s <= m.box.x1);
      const covered = spans.reduce((n, [s, e]) => n + e - s + 1, 0);
      if (c === 'solid') {
        if (covered < 0.4 * m.box.w) out.push({ rule: 'contact', id, detail: `${where}: ${covered}/${m.box.w} columns rest within ${2 * k}px of the anchor row ${ay}; needs 40%` });
        const iso = isoCorner(m.profile, m.box, k);
        if (iso.iso) out.push({ rule: 'iso-corner', id, detail: `${where}: the underside is a corner climbing ${iso.left} and ${iso.right} rows in straight stairs: drawn isometric, not top-down` });
      } else if (c === 'legged') {
        const ext = spans.length ? spans[spans.length - 1][1] - spans[0][0] + 1 : 0;
        // legs, or a base so close to the floor that the legs merge into one span
        if (!(spans.length >= 2 && ext >= 0.6 * m.box.w) && covered < 0.6 * m.box.w) out.push({ rule: 'contact', id, detail: `${where}: ${spans.length} contact spans covering ${ext}/${m.box.w}px; legged furniture needs 2+ spans over 60%` });
      } else if (c === 'post') {
        const half = ((sp.footprint || [1, 1])[0] * T) / 2;
        const ok = spans.some(([s, e]) => e - s + 1 >= 2 * k && Math.abs((s + e) / 2 - ax) <= half);
        if (!ok) out.push({ rule: 'contact', id, detail: `${where}: no post or trunk on row ${ay} within the footprint around x ${ax}` });
      } else if (c === 'touch' && !covered) {
        out.push({ rule: 'contact', id, detail: `${where}: nothing reaches the anchor row ${ay}` });
      }
    }
  }
  return out;
}

/** terrain = { id, kind?, cycle?, tiles: { key: [img, …] } } — locked tiles. */
export function validateTerrain(t, grid = GRIDS.base) {
  const out = [];
  const T = grid.T;
  const need = t.kind === 'fill' ? ['1111'] : WANG_KEYS;
  for (const k of need) if (!t.tiles[k] || !t.tiles[k].length) out.push({ rule: 'wang', id: t.id, detail: `no tile for corners ${k}` });
  if (t.kind === 'fill' && t.cycle && t.cycle[0] * t.cycle[1] !== (t.tiles['1111'] || []).length) out.push({ rule: 'wang', id: t.id, detail: `cycle ${t.cycle.join('x')} needs ${t.cycle[0] * t.cycle[1]} variants, has ${(t.tiles['1111'] || []).length}` });
  for (const [k, list] of Object.entries(t.tiles)) {
    list.forEach((img, i) => {
      const f = { anim: 'tile', dir: k, i, img };
      if (img.width !== T || img.height !== T) out.push({ rule: 'frame', id: t.id, detail: `tile ${k}/${i} is ${img.width}x${img.height}, terrain tiles are ${T}x${T}` });
      let holes = 0;
      for (let p = 3; p < img.data.length; p += 4) if (img.data[p] !== 255) holes++;
      if (holes) out.push({ rule: 'alpha', id: t.id, detail: `tile ${k}/${i}: ${holes} transparent pixels; terrain is opaque` });
      colourFindings(t.id, f, out);
    });
  }
  return out;
}

export function validateAtlasSize(set, w, h) {
  return w > ATLAS_MAX || h > ATLAS_MAX ? [{ rule: 'atlas-size', id: set, detail: `atlas ${w}x${h} exceeds ${ATLAS_MAX}x${ATLAS_MAX}` }] : [];
}
