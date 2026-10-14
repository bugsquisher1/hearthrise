// ════════════════════════════════════════════════════════════════════════
// src/world/core/compose.js — ONE FRAME, AS A DRAW LIST.
//
// Both backends draw exactly this list, in this order, so the node tests read
// the same decisions the canvas paints:
//   decals   → ground-level art (rugs) under everything that stands
//   shadows  → ONE mask: ellipses under units/props, cast parallelograms
//   sprites  → walls, doors, props, trunks and units, y-sorted (zsort.js)
//   canopies → tree crowns, above units; 50% while the hero stands under one
//   roofs    → last; the hero's own building's roof fades out (roofs.js)
//   lights   → the map's light kind plus point lights (art px)
//   plates   → screen-resolution text anchors (the hero's name)
// The baked ground is not in the list: it is static per map and the backend
// bakes it once (wang.js).
//
// Geometry: a static's contact point is the centre of its footprint's south
// edge; a frame's `ax, ay` is seated on it. A wall slice is a frame WALL_PX
// tall (a WALL_FACE_PX face that a door fits under, plus its cap).
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { BIAS, ySort } from './zsort.js?v=573';
import { heroBuilding, wallHeight } from './roofs.js?v=573';
import { ellipseShadow, castShadow } from './shadows.js?v=573';

export const WALL_FACE_PX = 48;
export const WALL_PX = 58;
/** The hero carries a light this many tiles across in any map that is not lit by day. */
const HERO_LIGHT_TILES = 4;
/** A unit's nameplate sits this far above its feet: the character body budget plus a gap. */
const PLATE_LIFT_PX = 42;
const ROOF_OVERHANG = 4;
/** A unit stands this far down its tile (its feet), in tiles. */
const FEET = 0.85;

/**
 * @param {object} map       compileMap() output
 * @param {(id: string, cls?: string) => {w:number,h:number,ax:number,ay:number,hover?:number}} frameOf
 * @param {{hero: {x:number,y:number}|null, name?: string, roofAlpha?: object}} state  tile coords
 * @param {{ox:number, oy:number, w:number, h:number}} view  compose region, art px
 * @param {number} T
 */
export function composeFrame(map, frameOf, state, view, T) {
  const hero = state.hero;
  const heroId = heroBuilding(map.buildings, hero);
  const lit = map.light === 'day';
  const seen = (x, y, w, h) => x < view.ox + view.w && y < view.oy + view.h && x + w > view.ox && y + h > view.oy;
  const decals = [], shadows = [], stand = [], canopies = [], roofs = [];

  for (const s of map.statics) {
    const f = frameOf(s.sprite, s.cls);
    const cx = (s.x + s.fw / 2) * T, cy = (s.y + s.fh) * T;
    if (s.kind === 'decal') { decals.push({ sprite: s.sprite, cls: s.cls, x: cx - f.ax, y: cy - f.ay, w: f.w, h: f.h }); continue; }
    const tall = s.kind === 'wall' || s.kind === 'door' ? wallHeight(s, heroId, f.h) : f.h;
    const top = cy - f.ay + (f.h - tall);
    if (!seen(cx - f.ax, top, f.w, tall + T)) continue;
    stand.push({ kind: s.kind, sprite: s.sprite, cls: s.cls, x: cx - f.ax, y: top, w: f.w, h: tall, crop: f.h - tall, row: s.row, bias: s.bias, tx: s.x });
    if (s.kind === 'prop') shadows.push(Object.assign({ type: 'ellipse' }, ellipseShadow(cx, cy, s.fw, T)));
    if (lit && (s.kind === 'wall' || s.kind === 'trunk')) {
      const pts = s.kind === 'trunk'
        ? castShadow(cx - f.w / 2, cx + f.w / 2, cy - 4, cy, frameOf(s.sprite + ':canopy', 'canopy').ay)
        : castShadow(s.x * T, (s.x + s.fw) * T, s.y * T, cy, WALL_FACE_PX);
      shadows.push({ type: 'poly', pts });
    }
  }
  if (hero) {
    const f = frameOf('hero', 'hero');
    const cx = (hero.x + 0.5) * T, cy = (hero.y + FEET) * T;
    const lift = f.hover || 0;
    stand.push({ kind: 'unit', sprite: 'hero', cls: 'hero', x: cx - f.ax, y: cy - f.ay - lift, w: f.w, h: f.h, crop: 0, row: hero.y, bias: BIAS.unit, tx: hero.x });
    shadows.push(Object.assign({ type: 'ellipse' }, ellipseShadow(cx, cy, 1, T)));
  }
  for (const c of map.canopies) {
    const f = frameOf(c.sprite, 'canopy');
    const cx = (c.x + c.fw / 2) * T, cy = (c.y + c.fh) * T;
    const x = cx - f.ax, y = cy - f.ay;
    const hx = hero ? (hero.x + 0.5) * T : 0, hy = hero ? (hero.y + FEET) * T : 0;
    const under = !!hero && hx >= x && hx < x + f.w && hy >= y && hy < y + f.h;
    if (seen(x, y, f.w, f.h)) canopies.push({ sprite: c.sprite, x, y, w: f.w, h: f.h, alpha: under ? 0.5 : 1 });
  }
  for (const b of map.buildings) {
    const r = b.roof.rect;
    const alpha = state.roofAlpha && b.id in state.roofAlpha ? state.roofAlpha[b.id] : (b.id === heroId ? 0 : 1);
    const top = (r.y + 1) * T - WALL_PX - ROOF_OVERHANG;
    roofs.push({ id: b.id, sprite: 'roof:' + b.roof.kind, x: r.x * T - ROOF_OVERHANG, y: top,
      w: r.w * T + 2 * ROOF_OVERHANG, h: (r.y + r.h) * T - WALL_FACE_PX - top, alpha });
  }
  const points = map.lights.map((l) => ({ x: l.x * T, y: l.y * T, r: l.radius * T, tint: l.tint }));
  if (hero && !lit) points.push({ x: (hero.x + 0.5) * T, y: (hero.y + 0.5) * T, r: HERO_LIGHT_TILES * T, tint: 'hero' });
  const plates = [];
  if (hero && state.name) {
    const f = frameOf('hero', 'hero');
    plates.push({ text: state.name, x: (hero.x + 0.5) * T, y: (hero.y + FEET) * T - PLATE_LIFT_PX - (f.hover || 0) });
  }
  return { heroBuilding: heroId, decals, shadows, sprites: ySort(stand), canopies, roofs, lights: { kind: map.light, points }, plates };
}
