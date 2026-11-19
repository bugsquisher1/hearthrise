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
      /* UNMARKED CATACOMBS, THE VAULTS UNDER HAVORA (lane/d-catacombs 2026-11-15, the board's "2026-11-15 Unmarked Catacombs"): the Keepers' vaults under the Great
         Hearth, a Level 165 ground below the Sewer. Its floors are owed (art/briefs/ground-unmarked_catacombs.txt): worn vault flagstone, the Keepers'
         setts, the Carters' packed earth and standing water, each meeting the cut-corner vault rock. Born on hr-world-56-v2 and chained (lane/a-catacomb-art,
         gen-2026-11-17/vault-tiles, tools/world-art/catacomb-ground.mjs): flagstone is the hub; the rock and the water are raised a quarter tile behind a
         pale lime rim; the setts meet the flagstone only. The walls are a lime-washed run laid over the paint. */
      vault: Object.freeze({
        terrains: Object.freeze({
          flagstone: '4910e009-f5cb-4ad3-a791-f1f821162d4d', rock: 'd5704cc2-79d3-4f92-ac2d-a0c148306547', earth: 'a42b0770-b391-434b-8ee2-bc0e0c3ce45b',
          water: '164582a7-835e-44ef-b079-95a8cba10cbe', setts: '25040f9c-4ece-489a-9928-b76631e60dff',
        }),
        /* flagstone/rock, earth/rock, flagstone/earth, water/flagstone, water/rock, flagstone/setts */
        tilesets: ids(`6cc9b014-2ce7-4c83-8a72-b66fa2cce2f3 9fc6c7de-7bcf-44ae-b254-e1bbf3464901 c7473d04-820c-4649-a1de-c3417a2fed8f
          4f2763d2-3871-44c9-9905-779a05ed4800 577ffa4d-5edd-4573-aa6d-cc4974c0de37 344c8c76-fde8-4536-b86a-b6583ea2e550`),
        maps: ids(''),
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
      mb_stepping_stones_1 mb_stepping_stones_2 mb_stepping_stones_3 mb_stepping_stones_4 mb_stepping_stones_5 mb_stepping_stones_6
      cw_coal_seam cw_copper_pots cw_copper_vein cw_gold_seam cw_iron_vein cw_mine_cart cw_ore_stain cw_plank_bridge cw_plank_bridge_wide cw_puddle
      cw_rails cw_rubble cw_stalagmite cw_tool_rack`),
    units: ids(`rat slime hive_wasp drain_rat sump_slime cistern_spider culvert_bat kobold_tosher gray_whelp gray_wolf briarcoat_wolf
      dire_gray goblin_scavenger goblin_skulker goblin_digger hobgoblin_foreman carrion_crow glade_poacher walking_vine goblin_sluicer
      granary_rat barn_wasp barn_spider turncoat rook_poacher orchard_boar brook_bear
      shrouded_pauper keeper_dunn night_carter vault_leech bone_wall`),
    /* vaultdead and vaultliving: the Unmarked Catacombs' bodies, its own dead and what came in from outside; vault: its painted floor and its two
       signature pieces (lane/a-catacomb-art, tools/world-art/import-catacombs-2026-11-16.mjs) */
    sets: ids('mill sewer common cottage forest warren glade stead hunt vaultdead vaultliving vault'),
    grounds: Object.freeze({
      mill_cellar: Object.freeze({ family: 'sewer', signature: ids('millstone') }),
      millrace_sewer: Object.freeze({ family: 'sewer', signature: ids('grate_bridge rat_nest') }),
      meadowbrook_thicket: Object.freeze({ family: 'meadow', signature: ids('mb_log_bridge') }),
      coppercap_warrens: Object.freeze({ family: 'cave', signature: ids('cw_throne') }),
      mosslight_glade: Object.freeze({ family: 'meadow', signature: ids('') }),
      wickstead: Object.freeze({ family: 'meadow', signature: ids('wk_footbridge') }),
      /* STAGED (src/data/grounds/unmarked_catacombs): the Wood Book on its lectern in the Keepers' Room, and the ossuary's bone wall */
      unmarked_catacombs: Object.freeze({ family: 'vault', signature: ids('uc_wood_book uc_ossuary_wall') }),
    }),
    /* the vault kit's four props any later ground under Havora may place (the candle niche and the iron sconce on a wall face, the stone bier,
       the Carters' hoist): art/briefs/ground-unmarked_catacombs.txt. The two signature pieces landed in set vault (lane/a-catacomb-art). */
    pending: ids('uc_niche_candles uc_sconce uc_bier uc_hoist'),
  }),

  /* THE BARROW MARCH, the 45-110 region (docs/planning/PRIORITY_BOARD.md, the ground pack plan): the Banded Company's dead
     below Hask's Ford, where the Meadowbrook's river slows. Its art was made on lane/b-hasks-ford-art and
     lane/b-muster-barrows-art. Loaded since lane/a-import-ford-art (2026-11-10): `march` (the kit's hf_ props and four of its
     bodies) and `ford` (Hask's Ford's painted ground and its two signature pieces). `muster` waits on its own import. One tile
     family, eight terrains in thirteen chained pro tilesets (read from PixelLab 2026-11-07): the Ford and the Slake paint
     the river, the Muster Barrows the mounds. The Pyre Field and Krell's Hold have a family each (ash, hold: lane/b-barrow-art-import
     2026-11-14); the coal seam is the kit's gather node until the Emberstone vein has a node kind. Props: the Ford's and the Muster's war-dead sheets, and the Greenhaven
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
          c62a50a3-6148-415d-88b4-b2e827e5b804 168be062-a561-4e5a-bf4f-8fb1964dd0ba ec6c96ef-8da7-4437-ab0c-a7b38cd44755
          7442c425-c417-4486-92fd-4c0f5b60d65a 5730601c-af79-4b9f-9eea-6cf5b8df42d0`),
        maps: ids('ee5f44c4-49da-446b-b26d-1a0de257fde1'),
      }),
      /* THE ASH FAMILY (brief 23, 2026-11-14): the Pyre Field's floor, every pair born on hr-world-56-v2. Ash meets scorched earth,
         cinder and charred timber; burnt grass meets scorched earth, charred timber and the March's grass. There is no ash/burnt
         grass and no scorched/charred pair: a paint grid keeps ash or timber between them (tools/world-art/barrow-grounds.mjs). */
      ash: Object.freeze({
        terrains: Object.freeze({
          ash: 'ed88d179-d866-4c6a-83e4-edc0af84b88a', scorched: '61e78317-25bf-42bb-a77c-8c79bfac95de',
          cinder: 'a613fed9-b71f-47f5-a640-6f53535f92a8', charred: '4e1250ef-7d9d-4557-b9d9-4622947dde2e',
          burnt_grass: 'c5ee7a66-e673-4fe2-8a4a-822876f73ccf', grass: '9e1580b2-3178-4872-8f45-c28befe2c460',
        }),
        tilesets: ids(`97189b07-386a-42cd-b854-727ad7172e91 a8118c34-4bca-4051-b78c-7e9d3b875e51 ae3c3036-3a26-4930-85ae-bc085b32d0ec
          ef2eed4d-1139-4738-a79f-434e5ed4dceb 27950f46-b568-4d46-bece-f3791f0996ef b54f3f77-14f5-4e95-9a65-b7a67500962e`),
        maps: ids(''),
      }),
      /* THE HOLD FAMILY (brief 29, 2026-11-14): Krell's castle floors, each material born once on the palette and chained, all at
         a median luminance of 0.027 or under so a lifted body reads 3:1 on them. Flagstone is the hub (it meets cobble, setts,
         planks and gravel); the cart road's earth meets cobble only. The walls are slices laid over the paint, not a tileset.
         The hill outside the walls (gen-2026-11-14/33-hold-hill, lane/b-hold-art) is the March's grass (the ash family's, chained)
         meeting the road's earth and the gravel path, and a gray hill rock that meets the grass only. */
      hold: Object.freeze({
        terrains: Object.freeze({
          earth: '6c769ec4-df9e-4ea6-ac56-22f35910d764', cobble: 'c5ce4639-040a-4e9b-84a7-98c29893063b',
          flagstone: '456e148f-3322-47f1-84e6-8efbad93a87c', setts: '9c3260b1-616c-4c44-b735-f5ebaae8fe39',
          planks: '6f4ca2d8-bc8a-4811-8448-c7ad1c38c123', gravel: '11bf114e-b2bf-449a-b74e-fb2556a41312',
          grass: '9e1580b2-3178-4872-8f45-c28befe2c460', rock: 'c5e4eabb-fb65-4d54-80c5-b95208f44e94',
          /* the keep's slate roof over the shut-in wall mass (lane/b-march-floors, gen-2026-11-14/34-march-floors) */
          roof: '51645f5f-dc70-43f1-9ca8-e78a61d1d1ed',
        }),
        tilesets: ids(`b2844c51-0965-47e7-8127-13e5867d7496 a828894c-b4ec-4d85-b12d-68d732738b48 dc901b7b-2852-4a9d-965b-504fc22cff0c
          a24a289a-6755-4014-9466-a08fa2b358e0 c7ab981f-32d2-4c72-987d-6c3a54999ac8 72391b8e-2fd0-4c03-884c-05c3a95238f0
          8552f1bf-4e1f-4265-b09a-bbe2710d5f9a dbb59875-0f09-406a-a4a9-79c23558a447 fc57725c-6167-42be-a7ff-9dc7020753a1
          473b8931-ad81-48ae-b5c5-3b2996b995c2`),
        maps: ids(''),
      }),
    }),
    props: ids(`
      hf_banded_shield hf_helm_heap hf_kerb_ring hf_palisade_broken hf_palisade_stake hf_pike_stakes hf_pikes_fallen hf_pyre_unlit
      hf_rowboat_sunk hf_standing_stone hf_standing_stone_leaning hf_stores_heap hf_tent_torn hf_wagon_tipped
      mu_bier_unburned mu_cairn mu_coffin_lid mu_crates mu_dead_hawthorn mu_drum_split mu_grave_goods mu_grave_open mu_horse_skull
      mu_kerbstones mu_shields_leaning mu_standard_fallen mu_sword_marker mu_urns mu_weapon_rack
      barrel_broken barrels bone_pile bones cart_wheel coins_scattered sack_pile skull
      mb_fallen_log mb_reeds mb_stepping_stones westwood_ash alder alder_stump
      mr_drowned_pikes mr_eel_trap mr_green_harness mr_greened_shield mr_mooring_post mr_silt_ripples mr_silt_ripples_b mr_silt_stain mr_silt_stain_small
      mr_stake_net_post mr_rope_coil mr_drowned_cart
      ma_fire_rake ma_log_stack ma_ash_barrow ma_charred_stake ma_burnt_ash
      kh_high_seat kh_lectern kh_hall_table kh_hall_table_runner kh_banner_stand kh_colors_upside_down kh_pell kh_weapon_rack
      kh_woodpile kh_well kh_coffin_open kh_chapel_bench kh_toll_box kh_brazier kh_candle_stand kh_banner_hung
      cw_coal_seam cw_coal_seam_spent`),
    units: ids(`banded_pikeman bannerman fordsunk wight barrow_knight barrow_pikeman cairn_wight mudlark greened_pikeman bargeman color_sergeant
      charred_pikeman stoker lurcher pyre_wraith provost farmhand hasks_lookout grave_guard pyre_priest gatekeeper lord_krell`),
    sets: ids('march ford muster slake pyre pyrefolk hold holdguard holdkeep'),
    grounds: Object.freeze({
      hasks_ford: Object.freeze({ family: 'march', signature: ids('hf_toll_stone hf_ford_marker') }),
      muster_barrows: Object.freeze({ family: 'march', signature: ids('mu_barrow_door') }),
      the_slake: Object.freeze({ family: 'march', signature: ids('sl_grounded_barge sl_stake_nets') }),
      /* the burnt pyres stand on the two pyre rows, which block a step: they are in the field's paint, and the sprites wait for an open cell */
      pyre_field: Object.freeze({ family: 'ash', signature: ids('pf_great_pyre pf_burnt_pyre') }),
      /* the gatehouse stands over the cart gate (class gate, open: its towers on the map's rock either side of a three-tile passage) */
      krells_hold: Object.freeze({ family: 'hold', signature: ids('kh_gatehouse kh_hall_fire') }),
    }),
    /* art/briefs/gen-2026-11-07/: the Slake's two signature pieces (03, 04), its one new body (01), the three re-poured
       bodies (scripted from banded_pikeman, fordsunk and bannerman: new names, new pixels, no generation) and the river
       pieces the kit lacks (04: a mud flat needs wear, ART_DIRECTION §5). The Ford's brief places `oak`: it is not in this
       kit (its light round canopy reads as Greenhaven beside the March's alder and ash; read 2026-11-07), so the Ford's
       import swaps it for westwood_ash or mu_dead_hawthorn. The alder (art/world/common, brief 20: drawn on the palette as the
       March's riverbank tree, the oaks' replacement) and its stump are the kit's: the Ford, the Muster and the Slake stand their
       willow gather nodes in it (art director, 2026-11-15). */
    pending: ids(''),
  }),

  /* THE MORROW HILLS, the 110-142 region past Krell (the board's "2026-11-14 The Morrow Hills" and "2026-11-19 ... what opens, and when";
     lane/b-morrow-kit 2026-11-19). One tile family, `morrow`: the approved sample's moor and road (5adbc664, the moor its base 0b13b11c),
     and the inn's floors born dim on the palette in three pro tilesets (gen-2026-11-19/morrow-kit): the yard's cobble and a flagstone,
     the stable's straw and the taproom's boards, the cellar's stone and the roof's slate. A ground paints every cell from its floor's fill
     and redraws every border from the fills' own pixels (tools/world-art/morrow-grounds.mjs), so the pairs' transition tiles are not used.
     The walls are laid over the paint: the inn's stone run (door, boarded window, hearth, quoin ends) and the dry stone wall with its two
     tumbled ends. Rules: art/briefs/morrow-hills-art-rules.txt (the floors paint dim; no pocket on bright grass). */
  morrow_hills: Object.freeze({
    name: 'The Morrow Hills',
    families: Object.freeze({
      morrow: Object.freeze({
        terrains: Object.freeze({
          road: 'd10e4fb9-6ade-4b86-b600-ccd669b08d14', moor: '0b13b11c-4266-4441-a441-6cede87e7a30',
          cobble: '6dac5e15-84b8-47be-a380-494d89a1e6ab', flagstone: '098ba500-a861-415b-932a-162b1519f10f',
          straw: '4d9faa74-4e52-4538-bb41-d45f61204d9a', boards: '34f6f747-0eda-446f-bb7d-b83798f12a1c',
          cellar: 'd4df0805-172d-4917-b698-597fc3966f2c', slate: 'f322fdd4-c07b-4fdc-a321-7f1ec3c956e7',
        }),
        /* moor/road, cobble/flagstone, straw/boards, cellar/slate */
        tilesets: ids(`5adbc664-7ece-4d86-8ecf-b04be989b72a a8f9871d-1c2a-4e9d-883b-9128f0a7aefe 8b3fd314-40e7-4e7c-9b70-03d4272a1e15
          aed84cba-58a9-4ccd-963f-2dc400b9dcec`),
        maps: ids(''),
      }),
    }),
    /* the inn's props (art/world/morrow: the cart, kegs, tables and the sixteen of the inn sheet 903b5d01, every one a value step under
       the trolls), the coal seam the kit's gather node (the Dawnstone Vein has no node kind yet), and the Greenhaven and Hold clutter an
       inn yard and stable already have; the Ox Road's train (the ore wagons, the dead teams in their yokes, a tipped wagon), each a step under the
       Undead teamsters */
    props: ids(`mh_harrys_cart mh_kegs mh_taproom_table mh_sacks mh_sack_spilt mh_straw_bale mh_straw_burst mh_stone_trough mh_bar_counter
      mh_table_over mh_bench mh_inn_sign mh_lantern_post mh_gate_pillar mh_gate_broken mh_slate_stack mh_keg_spilt mh_round_table
      mh_stool_broken mh_chopping_block mh_ore_wagon mh_ore_wagon_half mh_ore_wagon_broken mh_yoked_dead mh_ore_wagon_tipped mh_ore_wagon_slewed mh_yoked_one mh_vigil_brazier mh_vigil_wood mh_fire_ring mh_lantern_dropped mh_lost_wheel mh_ore_dropped mh_yoke_dropped cw_coal_seam hay_bale straw sack_pile sack_stack crates barrel_broken chopping_block`),
    units: ids('troll_picker slate_thrower troll_brewer stable_troll the_landlord'),
    sets: ids('morrowfolk morrow'),
    grounds: Object.freeze({
      /* STAGED (src/data/grounds/carters_rest): the Brewhouse's copper */
      carters_rest: Object.freeze({ family: 'morrow', signature: ids('cr_brew_kettle') }),
    }),
    pending: ids(''),
  }),

  /* THE GREAT HEARTH'S FLUE (lane/a-tower-art-gen, 2026-11-16): the Burning Tower's one room. One tile family on the Pyre Field's own ash
     (the ash pair chains to the ash family above: base tile ed88d179 is shared byte for byte), an iron plate for the landing and swept
     hearthstone for patches. The walls are slices of two kept soot-brick runs laid over the paint (tools/world-art/tower-flue.mjs). */
  hearth_flue: Object.freeze({
    name: "The Great Hearth's Flue",
    families: Object.freeze({
      flue: Object.freeze({
        terrains: Object.freeze({ iron: '1d9d972e-0dc5-4d34-ab3b-f26cf83d0c42', ash: 'ed88d179-d866-4c6a-83e4-edc0af84b88a', hearthstone: '44a79cf1-b948-4958-bf26-a17f2483cd27' }),
        tilesets: ids('cd1545ff-f75a-4757-96db-993247c27e06 6c66b9da-a61a-4edd-9f6a-91fa4d52d62d'),
        maps: ids(''),
      }),
    }),
    /* the flue's own seven (art/world/tower, PixelLab 2026-11-16: art/world-src/gen-2026-11-16/01-note.json "props"), the Stokers' ash barrow and rake,
       and the Hold's brazier: a sweep's room, all on the one palette */
    props: ids('tower_climbing_irons tower_soot_door tower_sweep_brush tower_coal_scuttle tower_soot_sacks tower_ash_heap tower_chimney_pot ma_ash_barrow ma_fire_rake kh_brazier'),
    units: ids(''),
    sets: ids('tower'),
    grounds: Object.freeze({ burning_tower: Object.freeze({ family: 'flue', signature: ids('') }) }),
    pending: ids(''),
  }),
});
