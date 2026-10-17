// tests/hunt-core/hunt-data.mjs — src/data/hunt-tuning.js and src/data/hunt-grounds.js validate. Run by run-all.mjs.
import { suite, groundRow } from './fixtures/h1.js';

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
  'grounds-refuse-bad-rows': (M) => {
    const refused = (o, why) => (M.grounds.validateGround(groundRow(o)).length ? null : why);
    return refused({ hunt: 'no_such_hunt' }, 'an unknown hunt passed')
      || refused({ pockets: [{ room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 2, y: 2 }] }], route: [0] }, 'a spawn outside its room passed')
      || refused({ pockets: [{ room: [10, 1, 18, 6], spawns: [{ monster: 'no_such_monster', x: 12, y: 2 }] }], route: [0] }, 'an unknown monster passed')
      || refused({ route: [0, 0] }, 'a repeated route pocket passed')
      || refused({ respawnMs: 90050 }, 'a respawn off the sub-step grid passed')
      || refused({ start: [] }, 'a ground with no entrance passed');
  },
};

const mutants = [
  { name: 'a clock that is not a whole number of sub-steps', case: 'tuning-valid',
    edits: [['src/data/hunt-tuning.js', '  stepMs: 100,', '  stepMs: 300,']] },
  { name: 'spawns are not checked against their room', case: 'grounds-refuse-bad-rows',
    edits: [['src/data/hunt-grounds.js', ' || !inRect(r, s.x, s.y)) bad(', ') bad(']] },
];

await suite('hunt-core/hunt-data', cases, mutants);
