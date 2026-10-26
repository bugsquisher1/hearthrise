// ════════════════════════════════════════════════════════════════════════
// src/data/world/stations.js — WHERE PEOPLE STAND, AND WHAT A TAP OPENS.
//
// A town or home map row names its stand tiles by activity kind (`stations:
// { combat, gather, artisan, idle }`) for the map lint; the local hero never
// walks to one on its own (Tyler 2026-10-19: it moves only when steered or
// sent). Other players stand where they walked
// (src/world/town-scene.js, from the town presence).
//
// TAP_OPENS: a placed sprite the player can tap, and the existing screen it
// opens. Exits are not listed: an object standing on a map exit opens that
// exit (a hunt map names its hunt and the pane opens Hunts on it; a town/home map switches the
// scene), so a new hatch is a map row, not a row here.
// Display data only: nothing here is a server number, and no tap sends an
// intent — every action is navigation to a screen that already exists.
//
// TOWN_STATIONS: WHERE EVERY BODY IN TOWN STANDS, BY WHAT IT IS DOING (the real-town plan,
// docs/planning/PRIORITY_BOARD.md "Activity → station → stand"). The SERVER assigns the stand
// (supabase/migrations/2027-01-26-town-stands.sql): when a hero's town activity changes, a hunt
// starts or ends, or it appears in town, Postgres holds the lowest free stand of its station in
// its town instance under a unique key, so no two bodies ever hold one stand; a full station's
// next hero takes its overflow, then the nearest free bench, then the nearest free stand. These
// rows are mirrored into the server catalogue by tools/gen-town-stations.mjs
// (hr_town_stations, hr_town_stands, hr_town_station_hosts; `--check` is the twin guard), which
// refuses a stand off the map, on a blocked or unreachable tile, or shared by two stations.
//   TOWN_STATIONS[mapId] = [{ id, role, hosts?, face?, stands, overflow? }]
//     id        station id ([a-z0-9_]{1,40}); a stand is (station id, stand index 1..N: the
//               stands in order, then the overflow) on a whole tile [x, y]
//     role      'work'   a town activity's place (hosts name the activities)
//               'arrive' where a hunt sets its heroes down (hosts kind 'combat': every hunt, or ids)
//               'idle'   where a hero with nothing to do appears in town
//               'visit'  a counter or a keeper a tap sends the hero to (hr_town_go)
//               'bench'  the square's seats: a full station's last named resort
//     hosts     [{ kind: 'gather'|'artisan'|'training'|'combat', skill?, ids? }]: an activity
//               lands here by its id (ids), else its skill (the server's hr_activities.req_skill),
//               else its kind; a kind with no host lands on the map's 'idle' station
//     face      the tile its stands face (the anvil, the woodpile): each stand's facing is derived
//               from it; a stand may name its own as a third element, [x, y, 'n'|'s'|'e'|'w']
//     stands / overflow  [[x, y], …], primary first
// SEED (lane/c-town-stands, 2026-10-25): stations on TODAY's 24x14 Common, so the server half
// replays and runs before the real town lands. lane/b-town-map (L1) replaces these rows with the
// 192x116 town (Hearth Square, gatehouse, smithy yard, kitchen, mine, Westwood, shore, …) in this
// same shape, then regenerates (tools/gen-town-stations.mjs, a new dated OUT_FILE).
// TOWN_INSTANCE: one town instance holds `players` players (Tyler 2026-10-25: 40-60 people in the
// city), each fielding up to `heroesPerPlayer` bodies; the server never seats more players than
// floor(stands / heroesPerPlayer), so a free stand always exists (today's seed: 19 per instance).
// view/margin/cap: the area a viewer reads (its view in tiles + margin on every side, at most cap
// bodies a read; hr_town_view).
// ════════════════════════════════════════════════════════════════════════

export const TAP_OPENS = Object.freeze({
  anvil: Object.freeze({ open: 'skill', skill: 'smithing' }),
  woodpile: Object.freeze({ open: 'skill', skill: 'woodcutting' }),
  /* Tamsin Reeve and her Tally Board on the Common (2026-12-23-tally-tasks.sql): her window. PLACEHOLDER ART:
     the Common's style-1 crier and noticeboard stand in for her until her own sprite and board are drawn. */
  npc_crier: Object.freeze({ open: 'window', window: 'tally' }),
  noticeboard: Object.freeze({ open: 'window', window: 'tally' }),
});

const rows = (list) => Object.freeze(list.map((r) => Object.freeze(r.slice())));
const station = (s) => Object.freeze(Object.assign({}, s, {
  hosts: Object.freeze((s.hosts || []).map((h) => Object.freeze(Object.assign({}, h, h.ids ? { ids: Object.freeze(h.ids.slice()) } : {})))),
  face: s.face ? Object.freeze(s.face.slice()) : null,
  stands: rows(s.stands), overflow: rows(s.overflow || []),
}));

export const TOWN_STATIONS = Object.freeze({
  town_common: Object.freeze([
    /* SEED: the smithy yard's anvil hosts every bench but the cook's, the well's and the rune
       block's (L1: forge + anvils for smithing, work benches + grindstones for crafting) */
    station({ id: 'smithy_anvil', role: 'work', face: [6, 8],
      hosts: [{ kind: 'artisan', skill: 'smithing' }, { kind: 'artisan', skill: 'crafting' }],
      stands: [[7, 8], [7, 9], [6, 9], [5, 9], [7, 7], [6, 7], [5, 7], [4, 7]],
      overflow: [[4, 8], [4, 9], [3, 8], [3, 7]] }),
    /* SEED: the woodpile hosts every gatherer (L1: the Westwood, the Mine, the shore and the river bank) */
    station({ id: 'woodpile', role: 'work', face: [19, 8],
      hosts: [{ kind: 'gather', skill: 'woodcutting' }, { kind: 'gather', skill: 'mining' }, { kind: 'gather', skill: 'fishing' }],
      stands: [[19, 9], [20, 8], [18, 8], [20, 9], [18, 9], [20, 7], [19, 7], [18, 7]],
      overflow: [[21, 8], [21, 9], [21, 7], [17, 8]] }),
    /* SEED: the well yard stands in for the kitchen, the Hearth and the rune block (L1 gives each its place) */
    station({ id: 'well_yard', role: 'work', face: [14, 8],
      hosts: [{ kind: 'artisan', skill: 'cooking' }, { kind: 'artisan', skill: 'prayer' }, { kind: 'artisan', skill: 'runecrafting' }],
      stands: [[15, 8], [15, 9], [14, 9], [13, 9], [13, 8], [15, 7], [14, 7], [13, 7]],
      overflow: [[16, 8], [16, 9], [16, 7]] }),
    /* Tamsin's board: the crier and the noticeboard */
    station({ id: 'tally_board', role: 'visit', face: [8, 7],
      stands: [[9, 7], [9, 6], [9, 8], [8, 9]] }),
    /* where every hunt sets its heroes down (today: around the Common's start tile, the lane south) */
    station({ id: 'arrival', role: 'arrive', hosts: [{ kind: 'combat' }],
      stands: [[11, 9, 's'], [10, 9, 's'], [12, 9, 's'], [11, 10, 's'], [10, 10, 's'], [12, 10, 's'], [11, 11, 's'], [10, 11, 's'], [12, 11, 's'], [11, 12, 's']],
      overflow: [[10, 12, 's'], [12, 12, 's']] }),
    /* a hero with nothing to do appears on the green */
    station({ id: 'green', role: 'idle',
      stands: [[4, 11, 's'], [5, 11, 's'], [3, 11, 's'], [4, 12, 's'], [5, 12, 's'], [3, 12, 's'], [6, 11, 's'], [6, 12, 's'], [2, 11, 's'], [2, 12, 's']],
      overflow: [[4, 13, 's'], [5, 13, 's'], [3, 13, 's'], [6, 13, 's']] }),
    /* the east green: every full station's last named resort */
    station({ id: 'east_green', role: 'bench',
      stands: [[19, 10, 's'], [20, 10, 's'], [21, 10, 's'], [22, 10, 's'], [23, 10, 's'], [19, 11, 's'], [20, 11, 's'], [22, 11, 's'], [23, 11, 's'],
        [19, 12, 's'], [20, 12, 's'], [21, 12, 's'], [22, 12, 's'], [23, 12, 's']] }),
  ]),
});

export const TOWN_INSTANCE = Object.freeze({ players: 60, heroesPerPlayer: 4, view: Object.freeze([22, 14]), margin: 8, cap: 120 });
