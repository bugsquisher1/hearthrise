// src/data/world/region-kits.js — ONE ART KIT PER REGION (Tyler 2026-11-07: "region art kits").
//
// A region's hunting grounds draw from one kit: the tile family their floors are painted in, the props any of them may
// place, and the creature bodies a ground may re-pour. A ground adds at most SIGNATURE_MAX pieces of its own, its
// SIGNATURE: art placed by that ground and no other. So a new ground is a layout, a floor painted from the kit's tilesets
// and one or two new pieces, never a full art pass.
//
// The renderer reads nothing here: a map that places a kit piece pulls that piece's atlas set itself
// (src/world/scene-sets.js). The art pipeline does: tools/world-art/region-kit.mjs holds every shipped ground to its kit
// (tests/world-assets.mjs rule [kit]), and an art lane paints a new floor from `families` (port-pixellab.mjs paint).
// Every piece is style 1 on the one grid and the one palette (src/data/world/art-budget.js, palette.js); a kit never lists
// a retired set (tools/world-art/style1.mjs).
//
//   families  name → { terrains: { material: PixelLab terrain id }, tilesets: [PixelLab pro tileset id] (each the Wang pair
//             of two of those terrains), maps: [PixelLab Map Workshop map id] }. A ground's painted terrain names its
//             tilesets or its map in its sidecar (art/world/<set>/<ground>.json `pixellab`): each must be its family's.
//   props     sprite ids any ground of the region may place (a map row's `objects`)
//   units     creature bodies a ground may re-pour (at most 3 of a ground's 4: the ground pack plan's pack-distinct)
//   sets      the atlas sets the kit's own art lives in. A set not yet loaded (src/data/world/atlas-sets.js) holds a held
//             ground's art; nothing reachable may name it until it loads (style1 [s1-ref]).
//   grounds   map id → { family, signature: [sprite id] }. A signature names a piece; its variants are the ids that start
//             with it and an underscore (sl_stake_nets covers sl_stake_nets_torn), so the limit counts ideas, not the
//             cells of a prop sheet. A ground with no map row yet (held or planned) is checked the day its row lands.
//   pending   sprite ids a planned ground needs that no set carries yet, each a generation brief in art/briefs/: what
//             the ground's art lane makes (new art is spend: Tyler approves each batch).

/* Tyler 2026-11-07: "each ground adding only one or two signature pieces". */
export const SIGNATURE_MAX = 2;

const ids = (s) => Object.freeze(s.split(/\s+/).filter(Boolean));

export const REGION_KITS = Object.freeze({
  /* GREENHAVEN, the Early Access region (Tyler 2026-10-15): the kit its six grounds already share. Three tile families:
     the Meadowbrook's (Thicket, Glade, Wickstead: one Map Workshop family on the grass base 42099ab7), the Warrens' cave
     and the cut-wall sewer (Sewer, Mill Cellar). docs/design/PIXELLAB_STYLE1_KIT.md §1-2, §8. */
  greenhaven: Object.freeze({
    name: 'Greenhaven',
    families: Object.freeze({
      meadow: Object.freeze({
        terrains: Object.freeze({ grass: '42099ab7-68ef-4c41-bed9-581b37501045', dirt: '97e71544-5fcf-4e48-94b7-c809721a12be' }),
        /* dirt/grass, river/grass bank, grass/forest floor, grass/rock; Wickstead's thicket/brook bank set 9b397402 is
           recorded by its short id only (its sidecar notes) */
        tilesets: ids(`c9c1dd5d-e97b-4b81-98d3-bf275c76abbb 8cc1cd86-cc17-4cad-9fcd-419347743236 edf46cbb-9b49-43fb-84d7-fe5a237f1ecf
          caacdbce-1b55-4dad-a9b5-b76b3c872395`),
        maps: ids('91df925a-d1cb-4bcf-b440-d39cbb9b0e9e 4589f28b-7358-49ee-90f8-0501f0ca0683 efbc2aa2-e9e5-42fb-a799-3f909b2cf9fe'),
      }),
      cave: Object.freeze({ terrains: Object.freeze({}), tilesets: ids(''), maps: ids('d7bff9e2-eb36-45a3-962d-5fb4478d07b4') }),
      sewer: Object.freeze({
        terrains: Object.freeze({ water: '21786242-b96f-4315-b9c8-e5184ad0b50a', floor: '6a3a2149-5a1d-4538-826d-208c0fe94e51', wall: '040d3343-fb71-4da1-bc73-337ca576c2f3' }),
        tilesets: ids('e0c9621c-fb2d-41df-a2fe-5039b76f9893 b342fc89-d714-4d10-adc1-d3b4a62f5230'),
        maps: ids('d9c3544c-a2a0-4214-b680-749fe48a2eda a055f449-7a3a-48f2-bc74-0fcacfe32063'),
      }),
    }),
    props: ids(`
      barrel_broken bone_pile bread_loaf candle coins_scattered grain_spill hay_bale ladder loot_bag mushrooms pebbles sack_pile
      sack_stack skull straw support_post wasp_nest web
      barrel_stack barrels bones brazier collapsed_cart corner_rubble cracked_flagstone crates drowned_lantern exposed_dirt
      floor_grate hanging_chains moss_puddle pipe_outflow wall_chunk wall_torch
      cart_wheel chest chopping_block flour_sack sack_tall turnip_crate
      bush oak pine rocks woodpile
      mb_fallen_log mb_fern mb_flowers mb_hollow_oak mb_leaf_litter mb_reeds mb_stepping_stones
      cw_coal_seam cw_copper_pots cw_copper_vein cw_gold_seam cw_iron_vein cw_mine_cart cw_ore_stain cw_plank_bridge cw_puddle
      cw_rails cw_rubble cw_stalagmite cw_tool_rack`),
    units: ids(`rat slime hive_wasp drain_rat sump_slime cistern_spider culvert_bat kobold_tosher gray_whelp gray_wolf briarcoat_wolf
      dire_gray goblin_scavenger goblin_skulker goblin_digger hobgoblin_foreman carrion_crow glade_poacher walking_vine goblin_sluicer
      granary_rat barn_wasp barn_spider turncoat rook_poacher orchard_boar brook_bear`),
    sets: ids('mill sewer common cottage forest warren glade stead hunt'),
    grounds: Object.freeze({
      mill_cellar: Object.freeze({ family: 'sewer', signature: ids('millstone') }),
      millrace_sewer: Object.freeze({ family: 'sewer', signature: ids('grate_bridge rat_nest') }),
      meadowbrook_thicket: Object.freeze({ family: 'meadow', signature: ids('mb_log_bridge') }),
      coppercap_warrens: Object.freeze({ family: 'cave', signature: ids('cw_throne') }),
      mosslight_glade: Object.freeze({ family: 'meadow', signature: ids('') }),
      wickstead: Object.freeze({ family: 'meadow', signature: ids('') }),
    }),
    pending: ids(''),
  }),

  /* THE BARROW MARCH, the 45-110 region (docs/planning/PRIORITY_BOARD.md, the ground pack plan): the Banded Company's dead
     below Hask's Ford, where the Meadowbrook's river slows. Its art was made on lane/b-hasks-ford-art and
     lane/b-muster-barrows-art. Loaded since lane/a-import-ford-art (2026-11-10): `march` (the kit's hf_ props and four of its
     bodies) and `ford` (Hask's Ford's painted ground and its two signature pieces). `muster` waits on its own import. One tile
     family, eight terrains in thirteen chained pro tilesets (read from PixelLab 2026-11-07): the Ford and the Slake paint
     the river, the Muster Barrows the mounds. Props: the Ford's and the Muster's war-dead sheets, and the Greenhaven
     clutter the Ford already places. */
  barrow_march: Object.freeze({
    name: 'The Barrow March',
    families: Object.freeze({
      march: Object.freeze({
        terrains: Object.freeze({
          river: '32062820-23ec-4670-bff9-b5aab5db74fa', shallows: '40e321d1-9a47-474b-a38b-e5a96c8a9560',
          gravel: '64f28123-bfbb-4399-9b6f-a977435865aa', mud: '2fdf9b47-aff6-4510-a1cf-8461af777554',
          grass: '61a68177-5975-468e-be66-3c611c4a3203', reeds: '8a61041f-fe25-4585-be53-4afbbdd5a45e',
          thicket: 'd40b5758-d7b9-4f2a-9569-24600a967c62', barrow: 'c1295240-6b10-4a2e-84e9-4597d576c741',
          silt: '330d6904-4e64-4737-b6a4-6239f79e74d1',
        }),
        /* reeds/shallows, gravel/shallows, grass/reeds, river/reeds, mud/shallows, reeds/thicket, mud/barrow, barrow/thicket,
           river/shallows, mud/grass, grass/thicket, grass/barrow, mud/reeds. There is no river/mud, river/grass or
           river/thicket pair: deep water meets land through reeds or shallows. */
        tilesets: ids(`01014c39-90a4-483a-b14d-0e8f6a117f8e 074e66cf-785a-4fe5-b00c-cd9da2f9dd45 2b6efce3-c8b5-42cb-8db7-6c907d17c8af
          4004bd16-a3be-44a4-8752-8462ce5427ab 4a3822fd-ece9-4cbe-81b6-a43e98153a9e 7739cc60-4ffa-463d-8460-22171ae47a78
          77869a44-e3d1-4c98-80de-4c2b3beea86f 7ec1b34b-cb91-46ab-be85-4691a0cf4b01 82b5e18b-baf3-4e49-8a4d-f50f31c67841
          9a817bf5-7444-4a77-8f3b-b0b61eed4258 a16e2cb5-5f05-4dbb-b230-5cae403ca499 d2acf6a0-7c4a-49ff-af74-48981e769ebf
          deb9194f-162c-41a5-af8a-5a7937ed898d
          c62a50a3-6148-415d-88b4-b2e827e5b804 168be062-a561-4e5a-bf4f-8fb1964dd0ba ec6c96ef-8da7-4437-ab0c-a7b38cd44755`),
        maps: ids('ee5f44c4-49da-446b-b26d-1a0de257fde1'),
      }),
    }),
    props: ids(`
      hf_banded_shield hf_helm_heap hf_kerb_ring hf_palisade_broken hf_palisade_stake hf_pike_stakes hf_pikes_fallen hf_pyre_unlit
      hf_rowboat_sunk hf_standing_stone hf_standing_stone_leaning hf_stores_heap hf_tent_torn hf_wagon_tipped
      mu_bier_unburned mu_cairn mu_coffin_lid mu_crates mu_dead_hawthorn mu_drum_split mu_grave_goods mu_grave_open mu_horse_skull
      mu_kerbstones mu_shields_leaning mu_standard_fallen mu_sword_marker mu_urns mu_weapon_rack
      barrel_broken barrels bone_pile bones cart_wheel coins_scattered sack_pile skull
      mb_fallen_log mb_reeds mb_stepping_stones westwood_ash
      mr_drowned_pikes mr_eel_trap mr_green_harness mr_greened_shield mr_mooring_post mr_silt_ripples mr_silt_stain mr_silt_stain_small`),
    units: ids('banded_pikeman bannerman fordsunk wight barrow_knight mudlark'),
    sets: ids('march ford muster slake'),
    grounds: Object.freeze({
      hasks_ford: Object.freeze({ family: 'march', signature: ids('hf_toll_stone hf_ford_marker') }),
      muster_barrows: Object.freeze({ family: 'march', signature: ids('mu_barrow_door') }),
      the_slake: Object.freeze({ family: 'march', signature: ids('sl_grounded_barge sl_stake_nets') }),
    }),
    /* art/briefs/gen-2026-11-07/: the Slake's two signature pieces (03, 04), its one new body (01), the three re-poured
       bodies (scripted from banded_pikeman, fordsunk and bannerman: new names, new pixels, no generation) and the river
       pieces the kit lacks (04: a mud flat needs wear, ART_DIRECTION §5). The Ford's brief places `oak`: it is not in this
       kit (its light round canopy reads as Greenhaven beside the March's alder and ash; read 2026-11-07), so the Ford's
       import swaps it for westwood_ash or mu_dead_hawthorn. */
    pending: ids('greened_pikeman bargeman color_sergeant'),
  }),
});
