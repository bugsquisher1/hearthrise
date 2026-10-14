// src/data/world/maps/index.js — every world map, and which one each scene opens on.
// A new map is a file in this folder plus one row below; nothing else changes.
import millCellar from './mill_cellar.js?v=582';
import townCommon from './town_common.js?v=582';
import homeCottage from './home_cottage.js?v=582';

export const WORLD_MAPS = Object.freeze([millCellar, townCommon, homeCottage]);

/** The map a non-hunt scene shows: the viewer's own choice of town or home. */
export const SCENE_MAPS = Object.freeze({ town: 'town_common', home: 'home_cottage' });
