#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tutorial-once.mjs — THE TUTORIAL IS TAUGHT ONCE FOR FOUR HEROES (chapter 08 section 2.6: "An account lesson is taught once. A card
//   seen on one hero is seen for the account. Only a card about a weapon's own first move is per hero"; FB-5, 2026-11-21;
//   review/02-four-hero-hour.md quit point 3: "The same tips restart for each hero").
//
// The coach as the shell runs it (src/shell/launcher-coach.js heldCard over src/session/tutorial-sections.js), on the alpha fixture's
// envelope as two NEW heroes of one account that share the account's coach (src/session/account-coach.js, as AccountSession hands it out):
//   TO-1  the first hero's first card moves on as the hero does; the card it moved past is taught for the ACCOUNT
//   TO-2  a second hero, at the same point, is never shown a card the first was taught: the coach starts it further on
//   TO-3  a card about a weapon's own first move (a bar card) is still shown to the second hero
//   TO-4  a hero with no account coach (no recorder) is shown the whole chain, as before
//
//   node tests/tutorial-once.mjs            the guard
//   node tests/tutorial-once.mjs --mutate   each planted defect must turn its own line red
//
// mutant-anchors: src/session/tutorial-sections.js src/shell/launcher-coach.js src/session/account-coach.js
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { withServerLevel } from './_server-level.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function rules(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const L = await imp('src/shell/launcher-coach.js');
  const { residueOf } = await imp('src/session/residue.js');
  const { AccountCoach } = await imp('src/session/account-coach.js');
  const T = await imp('src/data/hunt-tutorial.js');
  const fails = [];
  const env0 = withServerLevel(JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8')));
  const fresh = () => {
    const e = JSON.parse(JSON.stringify(env0));
    for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party', 'hunt_bests']) delete e[k];
    e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 });
    e.tally = { held: [], paid_today: 0, per_day: 10, held_max: 3, weight: null, order: [], recent: [], day_ends_at: '2099-01-01T00:00:00Z' };
    return withServerLevel(e);
  };
  const hero = (slot, coach) => {
    const env = fresh();
    const cs = { slot, read: (k) => env[k], record: { data: env, residue: residueOf({}) }, setResidue() { return true; } };
    if (coach) cs.accountCoach = coach;
    return cs;
  };
  const ctx = (cs, t) => ({ character: cs, account: null, now: () => t, wm: { openIds: () => [], isOpen: () => false } });
  const coach = new AccountCoach(null);
  const a = hero(0, coach), b = hero(1, coach);
  /* TO-1: walk hero A past its first card, as the held card moves: Got it on what can take one, the account records what was taught */
  const first = L.heldCard(ctx(a, 0));
  if (!first) { fails.push('TO-0 CONTROL: a new hero in town is shown no card'); return fails; }
  const seenB0 = L.heldCard(ctx(b, 0));
  if (!seenB0 || seenB0.id !== first.id) fails.push('TO-0 CONTROL: two new heroes do not start on the same card (' + first.id + ', ' + (seenB0 && seenB0.id) + ')');
  /* hero A moves on: its server facts say the first step is done (the card a later one replaced) */
  coach.mark('taught', [first.id]);
  if (!coach.taught.has(first.id)) fails.push('TO-1 the card hero A moved past is not taught for the account');
  /* TO-2 */
  const b1 = L.heldCard(ctx(b, 1000));
  if (b1 && b1.id === first.id) fails.push('TO-2 the second hero is shown "' + first.id + '" again, taught on the first');
  /* TO-3: a bar card taught on one hero stays the other's */
  const bar = T.HUNT_TUTORIAL.find((r) => r.anchor === 'action_bar');
  if (bar) {
    coach.mark('taught', [bar.id]);
    const facts = L.coachFactsOf(b, null);
    if (facts.taught && facts.taught.has(bar.id)) fails.push('TO-3 a bar card ("' + bar.id + '") taught on one hero is passed by on another');
  } else fails.push('TO-3 CONTROL: the tutorial has no bar card');
  /* TO-4 */
  const lone = hero(2, null);
  const l0 = L.heldCard(ctx(lone, 0));
  if (!l0 || l0.id !== first.id) fails.push('TO-4 a hero with no recorder starts on ' + (l0 && l0.id) + ', not the chain\'s first card');
  return fails;
}

const MUTANTS = [
  ['the shell passes no taught cards (TO-2)', 'src/shell/launcher-coach.js', '    taught: taughtElsewhere(cs, HUNT_TUTORIAL),\n', '', 'TO-2'],
  ['the facts drop the taught cards (TO-2)', 'src/session/tutorial-sections.js', "  const hid = hid0 || taught ? new Set([...(hid0 || []), ...(taught || [])]) : null;", '  const hid = hid0;', 'TO-2'],
  ['a bar card is taught for every hero (TO-3)', 'src/session/account-coach.js', "  return !!card && card.anchor === 'action_bar';", '  return false;', 'TO-3'],
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const [name, file, find, repl, expect] of MUTANTS) {
      const tmp = mkdtempSync(join(tmpdir(), 'tutorial-once-'));
      try {
        cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true });
        const p = join(tmp, file), text = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (text.split(find).length !== 2) throw new Error('anchor for "' + name + '" matches ' + (text.split(find).length - 1) + ' times');
        writeFileSync(p, text.replace(find, () => repl));
        const fails = await rules(tmp);
        const caught = fails.some((f) => f.startsWith(expect));
        console.log((caught ? '  ✓ ' : '  ✗ MISSED ') + name + (caught ? '' : ' (' + fails.join(' | ') + ')'));
        if (!caught) missed++;
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    }
    console.log(missed ? 'tutorial-once --mutate: ' + missed + ' MISSED' : 'tutorial-once --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exit(missed ? 1 : 0);
  }
  const fails = await rules(ROOT);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'tutorial-once: RED, ' + fails.length + ' finding(s)' : 'tutorial-once: a card taught on one hero is taught for the account, but a bar card stays each hero\'s');
  process.exit(fails.length ? 1 : 0);
}
if (isMain(import.meta.url)) await main();
