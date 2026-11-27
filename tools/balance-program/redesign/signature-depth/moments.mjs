#!/usr/bin/env node
// tools/balance-program/redesign/signature-depth/moments.mjs — HOW OFTEN A WORN SIGNATURE'S RULE FIRES, before 12 seeds are spent on it
// (systems, lane/signatures-batch-2, 2026-11-26).
//
//   node tools/balance-program/redesign/signature-depth/moments.mjs <ground> <level> <tank sig> <ranger sig> <mage sig> <healer sig>
//   ('-' for none, e.g. muster_barrows 60 ferry_pennies - lamplighters_robe -)
//
// One hour of a real settle (tests/hunt-core/fixtures/play-ground.mjs, the reference bars, Protective Ward added for the healer), the
// tank, ranger, mage and healer each wearing the Signature named, counting what its rule leaves on the events: a status landing (by id), a
// burst, a reflect or a Poison tick's damage, a shield and a shield broken. A rule whose moment the four never meets (9 Challenges an hour,
// no hero under 30% on Steady, a mage nobody hits) shows here in seconds; batch2.sh then sizes the ones that fire. Prints one line.
// Exit 0 printed · 2 a bad argument.
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const [ground, L, ...sig] = process.argv.slice(2);
if (!ground || !Number.isInteger(Number(L)) || sig.length !== 4) { console.error('moments: <ground> <level> <tank> <ranger> <mage> <healer> (- for none)'); process.exit(2); }
const P = await loadPlay(ROOT);
const seen = {};
const bump = (k) => { seen[k] = (seen[k] || 0) + 1; };
P.run(ground, Number(L), ['tank', 'ranger', 'mage', 'healer'], { spanMs: 3600000, windowMs: 600000, secret: '-4611686018427387904', options: () => ({ risk: 'steady' }),
  equipment: (role, i, Lv) => ({ ...P.kitFor(Lv, role), ...(role === 'ranger' ? { ammo: 'steel_arrows' } : {}) }),
  bag: (role) => (role === 'ranger' ? { steel_arrows: { loaded: 400 } } : {}),
  signature: (role, i) => (sig[i] && sig[i] !== '-' ? sig[i] : null),
  bar: () => [{ action: { type: 'ability', id: 'protective_ward' }, conditions: [{ op: 'lt', value: 95, metric: 'ally_hp_pct', subject: 'lowest' }], join: 'and' }, ...P.refBar(ground)],
  onWindow: (out) => { for (const e of out.events || []) {
    if (e.type === 'status_on') bump('on:' + e.status);
    if (e.type === 'dmg' && ['burst', 'reflect', 'poison'].includes(e.ability)) bump('dmg:' + e.ability);
    if (e.type === 'shield') bump('shield');
    if (e.type === 'shield_break') bump('break');
  } } });
console.log(ground, sig.join(','), JSON.stringify(seen));
