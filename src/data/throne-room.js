// ============================================================================
// src/data/throne-room.js — THE THRONE ROOM: the castle's recurring gold sink.
//
// ── THE PROBLEM IT ANSWERS (lane econ-crew-and-sink, 2026-10-08) ────────────
// tools/econ-sim.mjs, pricing every kill, gather, craft and crew tick through
// the real engines: a maxed player has bought EVERY gold sink in the game by
// day 15-17 and then banks ~2.6M a day with nothing left to want — 195M by
// day 90 after the crew fix. The castle card said so in as many words: "The
// realm is yours." A finished spine is a dead end, and a dead end with a full
// purse is the moment a player stops logging in.
//
// ── THE RULING ──────────────────────────────────────────────────────────────
// After the castle, you FURNISH it. Thirty pieces, each a real thing a castle
// gains over a lifetime — rushes on the floor, a chandelier, a minstrels'
// gallery — ending on the last one: THE THRONE. "Rise to the Throne" is the
// game's spine; this is where the personal half of it finally arrives.
//
//   · GOLD ONLY, PRESTIGE ONLY. A furnishing grants no XP, no yield, no speed,
//     no drop rate, no renown and no offline time. That is not modesty, it is
//     the economy rule this repo has already written down twice: a gold sink
//     must not sell throughput (gold is tradeable and the Hearth Token bond
//     touches the market — docs/design/review-book-content.md PROG-08), and
//     gold must never become renown (events-donations-and-voting.md §2.6).
//     What a rung buys is a room that looks like your effort, a named hall, and
//     — in a shared world — something other players can see (handoff: Art
//     Director, profile/inspect).
//   · A LADDER, NOT A SHOP: one price per rung, rising 16% a rung, so a
//     maxed player who earns more simply climbs further; the 30th piece costs
//     ~37M and the whole room ~267M, more than the sim's grinder banks by day
//     90. A casual castle-owner can afford the first piece with a day's income.
//   · IT REUSES THE SPEND RPC THAT ALREADY EXISTS. Each piece is one rung of a
//     MAX-merge unlock ladder (`throne_room`, 1..30) sold by public.hr_unlock_buy
//     with NO new code path: server-priced from public.hr_unlock_offers, gated
//     on the character's OWN server property tier (the castle), one rung per
//     call, rung order enforced, at most 32 per namespace per UTC day, gold
//     debited and journalled to player_ledger in one transaction. The Edge
//     forwards an OFFER ID and nothing else (gold-ladder-catalogue.js).
//
// ── ONE SOURCE, THREE READERS ───────────────────────────────────────────────
//   tools/gen-throne-room.mjs  → supabase/migrations/2026-10-08-throne-room.generated.sql
//                                (its `--check` fails the build on any drift)
//   supabase/functions/hr-accrue/gold-ladder-catalogue.js → the forward set
//   src/main.js → window.THRONE_ROOM, read by src/features/homestead.js to draw
//                 the room and quote the next price (display only; the server
//                 re-reads the price it charges)
//
// PURE ESM, no imports, no I/O, no globals. Node, Deno and the browser read it.
// ============================================================================

/** The property-tier index of Hearthrise Castle (src/features/homestead.js
 *  TIERS: camp 0 … castle 5). Re-derived and asserted by the generator. */
export const THRONE_ROOM_REQ_TIER = 5;

/** Price of rung n (1-based): 500,000 x 1.16^(n-1), to the nearest 1,000 gold. */
export const THRONE_ROOM_BASE = 500000;
export const THRONE_ROOM_GROWTH = 1.16;
export function throneRoomRungPrice(n) {
  return Math.round(THRONE_ROOM_BASE * Math.pow(THRONE_ROOM_GROWTH, n - 1) / 1000) * 1000;
}

/* The thirty pieces, in the order a castle earns them. `hall` names the room a
   visitor walks into once that many pieces stand (10 / 20 / 30). */
const PIECES = [
  ['Swept Flagstones', 'The great floor is cleared of the builders’ rubble for the first time, and your footsteps ring right across it'],
  ['Rush Matting', 'Fresh rushes and sweet herbs are strewn down the hall, and the draught from the door stops biting at the ankles'],
  ['Oak Trestle Tables', 'Long tables of valley oak, scarred already by the first night’s supper and none the worse for it'],
  ['Iron Sconces', 'A torch on every pillar, and the far end of the hall can be seen from the door at last'],
  ['Woollen Hangings', 'Thick wool on the north wall, dyed in the valley, and the hall holds its warmth long after the fire is banked'],
  ['Carved Benches', 'Benches with backs, which the old soldiers among your guests remark upon loudly and gratefully'],
  ['Hearth Firedogs', 'A pair of wrought-iron hounds to cradle the logs, cast by the smith who first shod your horse'],
  ['Glazed Windows', 'Real glass in the high windows, and on a clear morning the whole valley lies in the hall with you'],
  ['Iron Chandelier', 'A wheel of iron and forty candles, hauled up on a chain by four men and a great deal of advice'],
  ['The Lord’s Dais', 'A raised floor at the head of the hall: the first place in the castle that is unmistakably yours', 'A Worthy Hall'],
  ['Pewter Plate', 'Plates that ring when they are set down, and guests who stop eating from bread trenchers with some relief'],
  ['Painted Shields', 'The shields of everyone who has stood with you, painted bright and hung where they can be counted'],
  ['Minstrels’ Gallery', 'A gallery above the screen for pipes and fiddles, and the hall is never quite silent again'],
  ['Bearskin Rugs', 'Three great pelts before the hearth, each with a story that improves every winter'],
  ['The Founding Tapestry', 'Your first camp, your first field and your first worker, stitched in wool along the east wall'],
  ['Silver Candelabra', 'Silver on the high table, polished by a steward who takes it very personally'],
  ['Carved Oak Screen', 'A carved screen hides the kitchen passage, and supper now arrives as if by kindness rather than by door'],
  ['Stained-Glass Window', 'A window of coloured glass over the dais; at noon the light lands on the throne-stair like a blessing'],
  ['Banner of Your House', 'Your own colours, sewn by the valley’s best hands, hung where every guest must pass beneath them'],
  ['The High Table', 'A single table of black oak across the dais, set for the people you trust most', 'A Grand Hall'],
  ['Marble Floor', 'White stone from the southern quarries laid over the old flags, cold and bright and impossible to forget'],
  ['Gilded Sconces', 'Gold leaf on every bracket, and the torchlight comes back off the walls twice as warm'],
  ['Hunting Tapestries', 'The great hunts of the realm along the west wall, every beast in it one you have actually brought down'],
  ['Painted Ceiling', 'Stars and saints and a sky that never clouds, painted by a master who lay on his back for a whole summer'],
  ['Golden Plate', 'Gold on the high table, which nobody eats from, and everybody looks at'],
  ['Ermine Hangings', 'White fur edged in black behind the dais, the colours every herald in the realm reads at a glance'],
  ['Carved Throne-Stair', 'Seven steps of carved stone rising to an empty place, and the whole hall now faces it'],
  ['The Crown Window', 'A great round window cut above the stair, so the morning comes in behind whoever sits there'],
  ['The Canopy of State', 'Cloth of gold on four gilt poles over the empty place: the hall is ready, and everyone knows for what'],
  ['The Throne', 'Oak from the first tree you ever felled, iron from your first ore, gold from everything since. You have risen. Sit', 'A Throne Room'],
];

/** The thirty rungs: { n, offer_id, name, lore, hall?, gold }. */
export const THRONE_ROOM_PIECES = Object.freeze(PIECES.map(([name, lore, hall], i) => Object.freeze({
  n: i + 1,
  offer_id: `throne_room.${i + 1}`,
  name,
  lore,
  hall: hall || null,
  gold: throneRoomRungPrice(i + 1),
})));

export const THRONE_ROOM_RUNGS = THRONE_ROOM_PIECES.length;
export const THRONE_ROOM_UNLOCK_ID = 'throne_room';

/** Exactly the hr_unlock_offers columns hr_unlock_buy reads. Gold only; no item
 *  lines, no blueprint, no skill gate — the castle is the prerequisite. */
export const THRONE_ROOM_OFFERS = Object.freeze(THRONE_ROOM_PIECES.map((p) => Object.freeze({
  offer_id: p.offer_id,
  table_name: 'throne_room',
  name: `Throne Room: ${p.name}`,
  unlock_id: THRONE_ROOM_UNLOCK_ID,
  value: p.n,
  gold: p.gold,
  items: Object.freeze({}),
  req_property_tier: THRONE_ROOM_REQ_TIER,
})));

/** The hr_unlocks catalogue row: one MAX ladder, rungs 1..30. */
export const THRONE_ROOM_UNLOCK = Object.freeze({
  unlock_id: THRONE_ROOM_UNLOCK_ID,
  namespace: 'throne_room',
  merge: 'max',
  progress_kind: 'unlock',
  max_value: THRONE_ROOM_RUNGS,
  rungs: Object.freeze(THRONE_ROOM_PIECES.map((p) => p.n)),
});

/** The offer-id set the Edge forwards. Disjoint from every shop, gold-ladder
 *  and companion id (namespace `throne_room.*`). */
export const THRONE_ROOM_OFFER_IDS = Object.freeze(THRONE_ROOM_OFFERS.map((o) => o.offer_id));

/** The hall's name once `owned` pieces stand ('' before the 10th). */
export function throneRoomHallName(owned) {
  let name = '';
  for (const p of THRONE_ROOM_PIECES) if (p.hall && owned >= p.n) name = p.hall;
  return name;
}
