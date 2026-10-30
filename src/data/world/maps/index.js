// src/data/world/maps/index.js — every world map, and which one each scene opens on.
// A new map is a file in this folder plus one row below; nothing else changes.
import millCellar from './mill_cellar.js?v=0.2.72';
import townCommon from './town_common.js?v=0.2.72';
import homeCottage from './home_cottage.js?v=0.2.72';
import millraceSewer from './millrace_sewer.js?v=0.2.72';
import meadowbrookThicket from './meadowbrook_thicket.js?v=0.2.72';
import coppercapWarrens from './coppercap_warrens.js?v=0.2.72';
import mosslightGlade from './mosslight_glade.js?v=0.2.72';
import sandboxHd64 from './sandbox_hd64.js?v=0.2.72';
import wickstead from './wickstead.js?v=0.2.72';

export const WORLD_MAPS = Object.freeze([millCellar, townCommon, homeCottage, millraceSewer, meadowbrookThicket, coppercapWarrens, mosslightGlade, wickstead, sandboxHd64]);

/* STAGED MAPS: a staged hunt's map (src/data/hunts.js `staged`): its grid is authored and walked by the
   engine, its painted ground art is not done yet. No client draws it (src/world reads WORLD_MAPS only);
   tests/world-core.mjs lints it like any map except for the ground art. It moves to WORLD_MAPS, and its
   hunt loses `staged`, when the art lands (tests/hunt-core/forest-cave.mjs staged-until-art). */
/* Empty since Wickstead opened on its painted ground (lane b-wickstead-art, 2026-10-28). */
export const STAGED_MAPS = Object.freeze([]);

/** The row of map `id`, shipped or staged, or null: the engine's grid reader (src/core/hunt-ground.js). */
export function mapRowOf(id) {
  return WORLD_MAPS.find((m) => m.id === id) || STAGED_MAPS.find((m) => m.id === id) || null;
}

/** The map a non-hunt scene shows: the viewer's own choice of town or home (or the 64 px sandbox, src/data/world/sandbox.js). */
export const SCENE_MAPS = Object.freeze({ town: 'town_common', home: 'home_cottage', sandbox: 'sandbox_hd64' });
