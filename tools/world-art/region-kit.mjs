// tools/world-art/region-kit.mjs — EVERY HUNTING GROUND DRAWS FROM ITS REGION'S KIT (Tyler 2026-11-07, "region art kits").
//
// A region's grounds share one kit (src/data/world/region-kits.js): its tile family, its props, its creature bodies. A
// ground places only kit props and at most SIGNATURE_MAX signature pieces of its own, art no other ground places. A
// signature names a piece; its variants are the ids that start with it and an underscore (sl_stake_nets covers
// sl_stake_nets_torn), so "one or two signature pieces" counts ideas, not cells of a prop sheet.
// Held by tests/world-assets.mjs rule [kit] (its --selftest plants each defect below). Pure: the caller reads the tree.
//
//   kitFindings({ kits, signatureMax, maps, sprites, groundSource, loadedSets, retiredSets, classes })
//     kits          REGION_KITS
//     maps          WORLD_MAPS rows (only kind 'hunt' rows are grounds)
//     sprites       id -> { set, class } for every sprite a LOADED set carries
//     groundSource  terrain id -> its sidecar's `pixellab` record (or null when no loaded set carries the terrain)
//   -> [{ rule: 'kit', kind, detail }], kind one of shape | region | place | signature | family | pending | piece | sets
// mutant-anchors: none — tests/world-assets.mjs --selftest plants every kind into in-memory copies of the kits and maps

/** Is `id` signature piece `sig` or one of its variants. */
export const ofPiece = (id, sig) => id === sig || id.startsWith(sig + '_');

const UNIT_CONTACT = new Set(['unit', 'flier']);

export function kitFindings(d) {
  const out = [];
  const add = (kind, detail) => out.push({ rule: 'kit', kind, detail });
  const owner = new Map();          // ground id -> [kit id, ground row]
  const sigOf = new Map();          // signature id -> ground id
  for (const [kid, kit] of Object.entries(d.kits)) {
    for (const s of kit.sets) if (d.retiredSets.includes(s)) add('sets', `${kid} lists the retired set ${s}`);
    for (const [gid, g] of Object.entries(kit.grounds)) {
      if (owner.has(gid)) add('shape', `${gid} is a ground of both ${owner.get(gid)[0]} and ${kid}: one region a ground`);
      owner.set(gid, [kid, g]);
      if (!kit.families[g.family]) add('shape', `${kid}/${gid} names the tile family "${g.family}", which ${kid} does not have`);
      if (g.signature.length > d.signatureMax) add('shape', `${kid}/${gid} has ${g.signature.length} signature pieces (${g.signature.join(', ')}): at most ${d.signatureMax}`);
      for (const s of g.signature) {
        if (sigOf.has(s)) add('shape', `${s} is a signature of both ${sigOf.get(s)} and ${gid}`);
        sigOf.set(s, gid);
        const shared = kit.props.filter((p) => ofPiece(p, s));
        if (shared.length) add('shape', `${kid}/${gid} signs ${s}, but the kit's props list ${shared.join(', ')}: a signature is no kit prop`);
      }
    }
    /* a kit names its pieces truthfully: a prop is no creature, a unit is one */
    for (const p of kit.props) {
      const s = d.sprites[p];
      if (s && d.classes[s.class] && UNIT_CONTACT.has(d.classes[s.class].contact)) add('piece', `${kid} lists ${p} as a prop, but it is a ${s.class} (a creature)`);
    }
    for (const u of kit.units) {
      const s = d.sprites[u];
      if (s && !(d.classes[s.class] && UNIT_CONTACT.has(d.classes[s.class].contact))) add('piece', `${kid} lists ${u} as a body, but it is a ${s.class} (not a creature)`);
    }
    for (const p of kit.pending) if (d.sprites[p]) add('pending', `${kid} still lists ${p} as pending, but set ${d.sprites[p].set} carries it: take it off pending`);
  }
  const grounds = d.maps.filter((m) => m.kind === 'hunt');
  for (const m of grounds) {
    const got = owner.get(m.id);
    if (!got) { add('region', `${m.id} is a hunting ground no region kit claims (src/data/world/region-kits.js grounds)`); continue; }
    const [kid, g] = got, kit = d.kits[kid];
    for (const o of new Set(m.objects.map((x) => x.id))) {
      if (kit.props.includes(o) || g.signature.some((s) => ofPiece(o, s))) continue;
      const elsewhere = [...sigOf].find(([s]) => ofPiece(o, s));
      add(elsewhere ? 'signature' : 'place', elsewhere
        ? `${m.id} places ${o}, a signature piece of ${elsewhere[1]}: another ground's signature is never reused`
        : `${m.id} places ${o}, which is not in ${kid}'s kit and not one of its signature pieces (${g.signature.join(', ') || 'none'})`);
    }
    const fam = kit.families[g.family];
    const src = m.ground ? d.groundSource(m.ground) : null;
    if (fam && src) {
      const named = [].concat(src.map ? [src.map] : [], src.tileset ? String(src.tileset).split(',') : [], (src.retiled && src.retiled.tilesets) || []);
      const stray = named.filter((x) => !fam.maps.includes(x) && !fam.tilesets.includes(x));
      if (!named.length) add('family', `${m.id}'s ground ${m.ground} names no PixelLab map or tileset, so its tile family cannot be read`);
      else if (stray.length) add('family', `${m.id}'s ground ${m.ground} is painted from ${stray.join(', ')}, outside ${kid}'s ${g.family} family`);
    }
  }
  return out;
}
