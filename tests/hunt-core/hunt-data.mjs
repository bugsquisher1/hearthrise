// tests/hunt-core/hunt-data.mjs — src/data/hunt-tuning.js and src/data/hunt-grounds.js validate. Run by run-all.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, groundRow, ROOT } from './fixtures/h1.js';

/* The last migration in the apply order that writes hr_hunt_stats_of: the server's analyzer body. */
function statsBody() {
  const order = JSON.parse(readFileSync(join(ROOT, 'tests/schema-apply-order.json'), 'utf8')).order;
  const files = (Array.isArray(order) ? order : []).filter((f) => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8').includes('create or replace function public.hr_hunt_stats_of('));
  return files.length ? readFileSync(join(ROOT, 'supabase/migrations', files[files.length - 1]), 'utf8') : '';
}

const cases = {
  'tuning-valid': (M) => {
    const bad = M.tuning.validate();
    return bad.length ? bad.join('; ') : null;
  },
  'grounds-valid': (M) => {
    const bad = M.grounds.validate();
    if (bad.length) return bad.join('; ');
    const fixture = M.grounds.validateGround(groundRow());
    return fixture.length ? 'the fixture ground is refused: ' + fixture.join('; ') : null;
  },
  'party-defaults': (M) => {
    const g = M.grounds, all = Object.values(g.HUNT_GROUNDS);
    if (!all.every((r) => r.partyScale === true)) return 'a shipped ground does not state partyScale: true';
    const sewer = g.HUNT_GROUNDS.millrace_sewer;
    if (g.routeFor(sewer, 1).includes(5) || !g.routeFor(sewer, 2).includes(5)) return 'the Rat King pocket is not party-only';
    if (g.routeFor(g.HUNT_GROUNDS.mill_cellar, 1).length !== 2) return 'the cellar lost a pocket solo';
    if (g.yieldPermille(1) !== 550 || g.yieldPermille(4) !== 1000 || !g.MIN_PARTY_NOTE) return 'yield does not follow the pack scale';
    return null;
  },
  /* THE BLOW-SHARE RULE (designer ruling 2026-10-21, after Andy died to a 108 Rat King blow): no
     monster, bosses included, can hit for more than 35% of a hero's max HP at the floor of any hunt it
     appears in (combat.js: "bosses <= ~35%"). The blow is pull-cycle.js biggestBlowOn at the largest
     party (every pocket, minParty included), the HP vitals.js maxHpFor at band[0], no armour. Read as
     a WHOLE percent, the precision the ruling was given in (the Warrens' 162 of 460 is its 35%). */
  'blow-share': (M) => {
    const MAX_PCT = 35;
    const out = [];
    for (const h of Object.values(M.HUNTS)) {
      const b = M.hunt['pull-cycle'].biggestBlowOn(h.id, M.grounds.PARTY_SCALE.maxHeroes);
      const hp = M.vitals.maxHpFor(h.band[0], 0);
      if (!b) { out.push(h.id + ' has no blow to read'); continue; }
      const pct = Math.round((100 * b.hit) / hp);
      if (pct > MAX_PCT) out.push(h.id + ': ' + b.monster + ' hits ' + b.hit + ' = ' + pct + '% of the floor hero\'s ' + hp + ' HP (max ' + MAX_PCT + '%)');
    }
    /* the party filter is live: alone you never meet the King, so the Sewer's solo blow is a commoner's */
    const sewer1 = M.hunt['pull-cycle'].biggestBlowOn('millrace_sewer', 1);
    const sewer2 = M.hunt['pull-cycle'].biggestBlowOn('millrace_sewer', 2);
    if (!sewer1 || sewer1.monster === 'rat_king' || !sewer2 || sewer2.monster !== 'rat_king') out.push('the Sewer blow ignores minParty: ' + JSON.stringify([sewer1, sewer2]));
    return out.length ? out.join('; ') : null;
  },
  /* THE ANALYZER RATE WINDOW: the client's "per hour after N min" is the server's own window. */
  'analyzer-rate-window': (M) => {
    const { ANALYZER_RATE_AFTER_MS } = M.huntSessions;
    const m = /v_rated boolean := p_wall_h \* 60 >= (\d+);/.exec(statsBody());
    if (!m) return 'the live hr_hunt_stats_of body carries no rate window';
    return Number(m[1]) * 60000 === ANALYZER_RATE_AFTER_MS ? null
      : 'the server rates after ' + m[1] + ' min, the client says ' + ANALYZER_RATE_AFTER_MS / 60000;
  },
  'grounds-refuse-bad-rows': (M) => {
    const refused = (o, why) => (M.grounds.validateGround(groundRow(o)).length ? null : why);
    return refused({ hunt: 'no_such_hunt' }, 'an unknown hunt passed')
      || refused({ pockets: [{ room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 2, y: 2 }] }], route: [0] }, 'a spawn outside its room passed')
      || refused({ pockets: [{ room: [10, 1, 18, 6], spawns: [{ monster: 'no_such_monster', x: 12, y: 2 }] }], route: [0] }, 'an unknown monster passed')
      || refused({ route: [0, 0] }, 'a repeated route pocket passed')
      || refused({ respawnMs: 90050 }, 'a respawn off the sub-step grid passed')
      || refused({ pockets: [{ room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 12, y: 2 }], minParty: 2 }], route: [0] }, 'a ground with nothing to walk solo passed')
      || refused({ start: [] }, 'a ground with no entrance passed');
  },
};

const mutants = [
  { name: 'a clock that is not a whole number of sub-steps', case: 'tuning-valid',
    edits: [['src/data/hunt-tuning.js', '  stepMs: 100,', '  stepMs: 300,']] },
  { name: 'the Rat King hits for 108 again (Andy\'s death)', case: 'blow-share',
    edits: [['src/data/monsters.js', 'hp: 600, atk: 14, def: 4,', 'hp: 600, atk: 20, def: 4,']] },
  { name: 'a walked ground\'s pockets are not read (the boss who holds a room is missed)', case: 'blow-share',
    edits: [['src/data/hunt-grounds.js', '(pk.pack || pk.spawns).concat(pk.spawns)', '[]']] },
  { name: 'Chief Coppercap swings 54 again (63% of the Warrens floor)', case: 'blow-share',
    edits: [['src/data/monsters.js', 'hp: 1100, atk: 29, def: 28,', 'hp: 1100, atk: 54, def: 28,']] },
  { name: 'the blow ignores the party size (solo meets the King)', case: 'blow-share',
    edits: [['src/data/hunt-grounds.js', '  for (const i of routeFor(ground, partySize)) {\n    const pk', '  for (const i of ground.route) {\n    const pk']] },
  { name: 'the client says per hour after 5 min (the server waits 10)', case: 'analyzer-rate-window',
    edits: [['src/data/hunt-sessions.js', 'export const ANALYZER_RATE_AFTER_MS = 10 * 60000;', 'export const ANALYZER_RATE_AFTER_MS = 5 * 60000;']] },
  { name: 'spawns are not checked against their room', case: 'grounds-refuse-bad-rows',
    edits: [['src/data/hunt-grounds.js', ' || !inRect(r, s.x, s.y)) bad(', ') bad(']] },
];

await suite('hunt-core/hunt-data', cases, mutants);
