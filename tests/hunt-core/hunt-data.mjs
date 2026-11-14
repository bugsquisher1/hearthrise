// tests/hunt-core/hunt-data.mjs — src/data/hunt-tuning.js and src/data/hunt-grounds.js validate. Run by run-all.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, groundRow, ROOT } from './fixtures/h1.js';

const MS = await import(pathToFileURL(join(ROOT, 'src/data/monster-spells.js')).href + '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1]);

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
    /* ONE PACK FOR EVERY GROUP (Tyler 2026-11-08): no ground carries the old party scale, and the King's hall is built for a party but walked by anyone */
    if (all.some((r) => 'partyScale' in r)) return 'a shipped ground still carries a party scale';
    const sewer = g.HUNT_GROUNDS.millrace_sewer;
    if (!(sewer.pockets[5] && sewer.pockets[5].forParty === 2 && sewer.route.includes(5))) return 'the Rat King\'s hall is not built for a party, or not on the route';
    if (g.HUNT_GROUNDS.mill_cellar.route.length !== 2) return 'the cellar lost a pocket';
    return null;
  },
  /* THE BLOW-SHARE RULE (designer ruling 2026-10-21, after Andy died to a 108 Rat King blow): no
     monster, bosses included, can hit for more than 35% of a hero's max HP at the floor of any hunt it
     appears in (combat.js: "bosses <= ~35%"). The blow is pull-cycle.js biggestBlowOn (every pocket, for
     every party size since 2026-11-08), the HP vitals.js maxHpFor at band[0], no armour. Read as
     a WHOLE percent, the precision the ruling was given in (the Warrens' 162 of 460 is its 35%). */
  'blow-share': (M) => {
    const MAX_PCT = 35;
    const out = [];
    for (const h of Object.values(M.HUNTS)) {
      /* A called room's blow is the warned exam (src/data/boss-calls.js), not a hunt's floor: its Level-ready bands are tests/boss-call.mjs's table. */
      if (h.called === true) continue;
      /* A keyed hall is the same warned exam (src/data/boss-halls.js: a key, a confirm that says he hits hard, one fight): its boss is fitted to
         the ship bar at the band's middle (tools/balance-sim/boss-call-table.mjs --hall), not held to a walked ground's floor. The ground the key
         drops on is still read here like any other. */
      if (h.hall === true) continue;
      const b = M.hunt['pull-cycle'].biggestBlowOn(h.id);
      const hp = M.vitals.maxHpFor(h.band[0], 0);
      if (!b) { out.push(h.id + ' has no blow to read'); continue; }
      const pct = Math.round((100 * b.hit) / hp);
      if (pct > MAX_PCT) out.push(h.id + ': ' + b.monster + ' hits ' + b.hit + ' = ' + pct + '% of the floor hero\'s ' + hp + ' HP (max ' + MAX_PCT + '%)');
    }
    /* every hero meets the King (Tyler 2026-11-08): the monsters a hunt can meet on the Sewer include its hall's boss */
    const sewerGrounds = Object.values(M.grounds.HUNT_GROUNDS).filter((g) => g.hunt === 'millrace_sewer');
    if (!sewerGrounds.some((g) => M.grounds.monstersOn(g).has('rat_king'))) out.push('the Sewer\'s monsters leave out the Rat King');
    return out.length ? out.join('; ') : null;
  },
  /* THE BLOW COUNTS THE SPELLS (audit 2026-11-13: Wickstead quoted 21 while the Smoke Pot lands up to 52 on every hero, with no
     to-hit roll): with the spells on, a hunt's biggest blow is at least every monster's spell top (monster-spells.js spellHit). */
  'blow-counts-spells': (M) => {
    const C = M.C;
    if (MS.SPELL_SWITCH.live !== true) return null;
    const out = [];
    for (const h of Object.values(M.HUNTS)) {
      if (h.called === true) continue;
      const b = M.hunt['pull-cycle'].biggestBlowOn(h.id);
      const ids = new Set(h.spawns.map((s) => s.monster));
      for (const g of Object.values(M.grounds.HUNT_GROUNDS)) if (g.hunt === h.id) for (const id of M.grounds.monstersOn(g)) ids.add(id);
      for (const id of ids) {
        const row = M.MONSTERS[id];
        for (const sid of (row && row.spells) || []) {
          const top = MS.spellHit(C.monsterMaxHit(row), MS.spellRow(sid))[1];
          if (!b || b.hit < top) out.push(h.id + ': the biggest blow reads ' + (b ? b.hit : 'none') + ' while ' + id + "'s " + sid + ' lands up to ' + top);
        }
      }
    }
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
      || refused({ pockets: [{ room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 12, y: 2 }], forParty: 9 }], route: [0] }, 'a hall built for more heroes than a party holds passed')
      || refused({ start: [] }, 'a ground with no entrance passed');
  },
};

const mutants = [
  { name: 'a clock that is not a whole number of sub-steps', case: 'tuning-valid',
    edits: [['src/data/hunt-tuning.js', '  stepMs: 100,', '  stepMs: 300,']] },
  { name: 'the biggest blow leaves the spells out again (the audit\'s Wickstead 21 against a Smoke Pot of 52)', case: 'blow-counts-spells',
    edits: [['src/core/hunt/pull-cycle.js', '    const hit = Math.max(swing, spell);', '    const hit = swing;']] },
  { name: 'the Rat King hits for 108 again (Andy\'s death)', case: 'blow-share',
    edits: [['src/data/monsters.js', 'hp: 556, atk: 7, baseAcc: 0.76, def: 11,', 'hp: 556, atk: 20, baseAcc: 0.76, def: 11,']] },
  { name: 'a walked ground\'s pockets are not read (the boss who holds a room is missed)', case: 'blow-share',
    edits: [['src/data/hunt-grounds.js', '(pk.pack || pk.spawns).concat(pk.spawns)', '[]']] },
  { name: 'Chief Coppercap swings 54 again (63% of the Warrens floor)', case: 'blow-share',
    edits: [['src/data/monsters.js', 'hp: 1096, atk: 28, baseAcc: 0.88, def: 33,', 'hp: 1096, atk: 69, baseAcc: 0.88, def: 33,']] },
  { name: 'the King\'s hall is left off the monsters a hunt meets', case: 'blow-share',
    edits: [['src/data/hunt-grounds.js', '  for (const i of ground.route) {\n    const pk', '  for (const i of ground.route.filter((j) => !ground.pockets[j].forParty)) {\n    const pk']] },
  { name: 'the client says per hour after 5 min (the server waits 10)', case: 'analyzer-rate-window',
    edits: [['src/data/hunt-sessions.js', 'export const ANALYZER_RATE_AFTER_MS = 10 * 60000;', 'export const ANALYZER_RATE_AFTER_MS = 5 * 60000;']] },
  { name: 'spawns are not checked against their room', case: 'grounds-refuse-bad-rows',
    edits: [['src/data/hunt-grounds.js', ' || !inRect(r, s.x, s.y)) bad(', ') bad(']] },
];

await suite('hunt-core/hunt-data', cases, mutants);
