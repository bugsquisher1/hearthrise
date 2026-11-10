// ════════════════════════════════════════════════════════════════════════
// src/world/core/plates.js — WHERE EACH NAME PLATE STANDS ON SCREEN.
//
// A plate is a name, and the title its owner wears on a second line under it (Tyler 2026-11-08: "Should maybe have
// the title come under neath the name? Fingerguns / The Rat catcher (centered of course)"). Both lines are centred on
// the owner, in the plate's one size and colour (ART_DIRECTION §7 calls for no other), and the block's foot stays where a
// one-line plate's foot is: the name steps up a line, so the title never lies on the head art or the bar.
// Names never print over each other: yours first, then each plate that would touch one already placed steps up a line
// until it is clear (STEPS tries). A plate whose owner is (even half) on the canvas slides in from the edge rather
// than being cut. The box is the press area too: a right-click on a name, or on its title, picks its owner.
// PURE: the canvas backend measures the text and draws what this returns (render/canvas-backend.js overlay).
// ════════════════════════════════════════════════════════════════════════

/** Screen px between a plate's lines, and the most lines a crowded plate steps up. */
export const PLATE_GAP = 2;
export const PLATE_STEPS = 6;

/**
 * @param {{text:string, title?:string|null, kind?:string, x:number, y:number}[]} plates  in draw order; x, y the anchor in
 *   screen px (y the foot of the block)
 * @param {{measure:(s:string, px:number)=>number, px:(kind?:string)=>number, width:number, edge:number}} o  the text's width at
 *   a size, a kind's size, the canvas width, and how far off the canvas an owner may stand and still slide its plate in
 * @returns {{plate:object, x:number, px:number, lines:{text:string, y:number}[], box:{l:number, r:number, t:number, b:number}}[]}
 */
export function layPlates(plates, o) {
  const placed = [], out = [];
  for (const p of plates) {
    const px = o.px(p.kind);
    const lines = p.title ? [p.text, p.title] : [p.text];
    const half = Math.max(...lines.map((s) => o.measure(s, px))) / 2 + px / 3;
    const tall = lines.length * px + (lines.length - 1) * PLATE_GAP;
    const x = p.x >= -o.edge && p.x <= o.width + o.edge ? Math.max(half, Math.min(o.width - half, p.x)) : p.x;
    const touches = (y) => placed.some((q) => x - half < q.r && x + half > q.l && y - tall < q.b && y > q.t);
    let y = p.y;
    for (let k = 0; k < PLATE_STEPS && touches(y); k++) y -= px + PLATE_GAP;
    const box = { l: x - half, r: x + half, t: y - tall, b: y };
    placed.push(box);
    out.push({ plate: p, x, px, lines: lines.map((text, i) => ({ text, y: y - (lines.length - 1 - i) * (px + PLATE_GAP) })), box });
  }
  return out;
}
