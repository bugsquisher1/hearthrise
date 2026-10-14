// ════════════════════════════════════════════════════════════════════════
// src/world/town-scene.js — THE COMMON: who else is here, and where they stand.
//
// PEERS COME FROM THE SERVER'S TOWN VIEW, G._town (src/net/town.js polls
// hr_town_of while Home, Party or the World pane is open). Nothing here moves a
// peer: a peer stands at their activity's station (combat at the mill hatch,
// gathering at the woodpile, artisan work at the anvil, idle on the bench) on
// the slot their rank in the sorted name list picks, so two peers never share a
// tile and the same roster always stands the same way. Away peers stand at what
// they are still doing, dimmed. A nameplate is a name and a level band — never
// HP, gold, an exact level or a count of who is online: an empty plaza is just
// an empty plaza, and a view older than two polls shows nobody rather than
// people who may long since have left. Yourself is drawn once, as the hero.
// THE CRIER speaks the realm's latest find from its spot by the notice board.
// PURE: no DOM, no window, no G — the caller passes the view and the helpers.
// ════════════════════════════════════════════════════════════════════════
import { STATION_FALLBACK, PEER_LOOKS, CRIER_SPRITE } from '../data/world/stations.js?v=577';
import { reachFrom } from './core/path.js?v=577';
import { inRect } from './core/grid.js?v=577';
import { hash32 } from './choreo.js?v=577';

/** An away peer is drawn at this alpha: there, but not at the keyboard. */
export const AWAY_ALPHA = 0.55;

/** The stand tile for an activity kind: its own station, else the fallback, else the start. */
export function stationOf(map, kind) {
  const s = map.stations || {};
  return s[kind] || s[STATION_FALLBACK] || map.start;
}

/**
 * Every tile a peer may stand on, nearest first from each station: open,
 * reachable from the start, outside every building, not an exit, and not a
 * station's own tile (that one is kept for the local hero).
 */
function standTiles(map) {
  const seen = reachFrom(map.mask, map.w, map.h, map.start);
  const anchors = Object.values(map.stations || {}).concat([map.start]);
  const out = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!seen[y * map.w + x]) continue;
      if (map.buildings.some((b) => inRect(b.rect, x, y))) continue;
      if (map.exits.some((e) => e.x === x && e.y === y)) continue;
      if (anchors.some((a) => a[0] === x && a[1] === y)) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/**
 * Peers → [{ peer, x, y }]. Each station's peers are sorted by name and take the
 * free tiles nearest the station in that order (distance, then row, then
 * column), so the k-th name always lands on the k-th slot and nobody stacks.
 * A peer with no free tile left is not drawn — never on top of another.
 * @param {{canon?: (name: string) => string}} [o]
 */
export function placePeers(map, peers, o = {}) {
  const canon = o.canon || ((n) => String(n).toLowerCase());
  const tiles = standTiles(map);
  const taken = new Set();
  const groups = new Map();
  for (const p of peers || []) {
    const key = (map.stations || {})[p.kind] ? p.kind : STATION_FALLBACK;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const order = Object.keys(map.stations || {}).filter((k) => groups.has(k)).concat([...groups.keys()].filter((k) => !(k in (map.stations || {}))));
  const out = [];
  for (const key of order) {
    const [ax, ay] = stationOf(map, key);
    const near = tiles.slice().sort((a, b) => ((a[0] - ax) ** 2 + (a[1] - ay) ** 2) - ((b[0] - ax) ** 2 + (b[1] - ay) ** 2) || a[1] - b[1] || a[0] - b[0]);
    const ranked = groups.get(key).slice().sort((a, b) => { const x = canon(a.name), y = canon(b.name); return x < y ? -1 : x > y ? 1 : 0; });
    let at = 0;
    for (const peer of ranked) {
      while (at < near.length && taken.has(near[at][0] + ',' + near[at][1])) at++;
      if (at >= near.length) break;
      const [x, y] = near[at++];
      taken.add(x + ',' + y);
      out.push({ peer, x, y });
    }
  }
  return out;
}

/** A view the server answered within two polls of `now`. */
const fresh = (view, now, pollMs) => !!view && view.status === 'ok' && Math.abs(Number(now) - Number(view.at)) <= 2 * pollMs;

/**
 * The peers worth drawing now: a view the server answered within two polls,
 * without the viewer, each name once.
 * @param {{pollMs: number, you?: string|null, canon?: Function}} o
 */
export function peersOf(view, now, o) {
  if (!fresh(view, now, o.pollMs) || !Array.isArray(view.peers)) return [];
  const canon = o.canon || ((n) => String(n).toLowerCase());
  const you = o.you ? canon(o.you) : null;
  const seen = new Set();
  return view.peers.filter((p) => {
    if (!p || !p.name) return false;
    const c = canon(p.name);
    if (c === you || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

/**
 * The town's share of one frame: { units, bubbles }.
 * @param {object} map  compileMap() output for a town map
 * @param {object|null} view  G._town
 * @param {number} now  ms
 * @param {{pollMs: number, you?: string|null, canon?: Function, band?: (b: number) => string, crierLine?: (c: object) => string}} o
 */
export function townState(map, view, now, o) {
  const units = placePeers(map, peersOf(view, now, o), o).map(({ peer, x, y }) => {
    const band = peer.band != null && o.band ? o.band(peer.band) : '';
    return {
      id: PEER_LOOKS[hash32(String(peer.name)) % PEER_LOOKS.length], x, y, dir: 's',
      alpha: peer.away ? AWAY_ALPHA : 1,
      /* the plate stays readable; its own colour says "away" */
      plate: { text: peer.name + (band ? ' · ' + band : ''), kind: peer.away ? 'away' : 'peer', alpha: 1 },
    };
  });
  const bubbles = [];
  const crier = map.objects.find((m) => m.id === CRIER_SPRITE);
  const said = fresh(view, now, o.pollMs) && Array.isArray(view.crier) ? view.crier[0] : null;
  if (crier && said && o.crierLine) bubbles.push({ text: o.crierLine(said), x: crier.x, y: crier.y });
  return { units, bubbles };
}
