// tests/hunt-core/signature-rules.mjs — A WORN SIGNATURE IN THE FIGHT: the sample of 5 plays its rule as reactions, dark for players
// (lane/signatures-sample, systems, 2026-11-26; src/core/hunt/signature-rules.js, src/data/signatures.js, src/core/hunt/reactions.js,
// docs/design/redesign/15-signature-candidates.md "Decision: count and size"). Run by run-all.mjs.
//
//   worn-signature    the id the engine plays: an unknown id dropped, a list plays its first known one; heroSetup and the frozen peer carry it;
//                     the boundary adds its rows after the Roads' own (named by the Signature, never ramped), twice adds them once, gone
//                     takes them off and leaves the Roads' rows
//   rows              every row passes the one reaction check the Roads read (src/data/talents.js reactProblems) on the live moves; its home
//                     is a monster that exists (24 section 4's contract), its move live, its seat a hunt role, its ground a Danger scale ground;
//                     the five are the ruled sample
//   low-health-shield Cairn Belt: a blow that leaves the wearer under 30% shields it for 25% of its max health, once a 60 s clock; a blow
//                     that leaves it over the line shields nothing; another hero's line is not the wearer's
//   reset-per-kill    Barrow Knight's Blade: a Turning Cut hit offers a 6% shield, one shell never added up; another move's hit nothing;
//                     the reset piece (a planted row): a Turning Cut kill takes 1 s off Turning Cut, at most 4 s a cast
//   pass-on-death     Lurcher's Collar: a marked monster's death (any hero's blow) moves its Mark, time left, to the nearest engaged monster
//                     not marked; an unmarked death moves nothing; the general piece moves a status the wearer laid (a Bleed, scale and time)
//   reset-from-move   The Wood Book: any Frost Lance hit makes Hoarfrost ready now, another move's nothing; the has filter (a planted
//                     row): only on a chilled target, or another move's
//                     hit on a chilled one, nothing; the chill is read as the hit lands
//   heal-boon         Brewer's Apron: a Circle of Renewal landing on a hero gives it Emboldened for 4 s (+10% dealt), once a hero a cast;
//                     another heal gives nothing
//   real-settle       THE BOTH PATHS (CLAUDE.md section 4): a Muster four each playing a Signature plays a different hunt from the same four
//                     with none, the boon and the passed Mark show on its events, and it settles the same in 10-minute and 100-second windows
//   dark              SIGNATURE_RULES.live is false and no src or server file but the engine's three readers names `wornSignature`; a hero
//                     with none writes no field (the switch off plays as before: engine-parity holds with no re-pin)
//
// mutant-anchors: src/core/hunt/signature-rules.js src/core/hunt/reactions.js src/core/hunt/react-queue.js src/core/hunt/damage.js src/core/hunt/heal-rules.js src/core/hunt-spawn.js src/core/member.js src/core/combat-sim.js src/data/signatures.js
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadCore, plant, makeReport, ROOT } from './fixtures/h1.js';
import { H, E, inst2, sc2, world } from './fixtures/h2.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.SR = await imp('src/core/hunt/signature-rules.js');
  M.RX = await imp('src/core/hunt/reactions.js');
  M.HR = await imp('src/core/hunt/heal-rules.js');
  M.SG = await imp('src/data/signatures.js');
  M.TD = await imp('src/data/talents.js');
  M.AD = await imp('src/data/abilities.js');
  M.ST = await imp('src/data/statuses.js');
  M.DG = await imp('src/data/danger.js');
  M.RO = await imp('src/data/hunt-roles.js');
  M.SPAWN = await imp('src/core/hunt-spawn.js');
  M.SE = await imp('src/core/hunt/status-effects.js');
  M.MON = await imp('src/data/monsters.js');
  return M;
}

const fight = (M, units, o) => inst2(M, world(M, units, Object.assign({ phase: 'fight', risk: 'steady' }, o || {})));
/* hero `u` plays Signature `id`, as the boundary writes it */
const wear = (M, u, id) => M.SR.syncSignature(u, { wornSignature: id });
const blowAt = (M, inst, sc, src, t, n, id) => M.damage.landHit(inst, sc, src, t, n, null, { id: id || 't', exact: true }, false);

const cases = {
  'worn-signature': (M) => {
    const S = M.SR;
    if (S.wornSignatureOf('nope') !== null || S.wornSignatureOf(null) !== null || S.wornSignatureOf([]) !== null) return 'an unknown id or none played a Signature';
    if (S.wornSignatureOf(['nope', 'cairn_belt', 'the_wood_book']) !== 'cairn_belt') return 'a list did not play its first known Signature';
    const set = M.SPAWN.heroSetup({ weaponType: 'shield', wornSignature: ['cairn_belt', 'brewers_apron'] });
    if (!set || set.wornSignature !== 'cairn_belt') return 'heroSetup carries ' + JSON.stringify(set && set.wornSignature);
    if ('wornSignature' in M.SPAWN.heroSetup({ weaponType: 'shield' })) return 'heroSetup wrote a Signature for a hero with none';
    /* after the Roads (a row as syncTalents writes one): theirs stay, the Signature's join named by it, at full size (never ramped) */
    const u = H(M, 1, 12, 3, 'tank');
    u.reacts = Object.freeze([Object.freeze({ kind: 'react', id: 'cold_iron', on: 'hit_taken', do: 'status', status: 'chill', ms: 2000, melee: true })]);
    const roads = (u.reacts || []).length;
    wear(M, u, 'cairn_belt');
    wear(M, u, 'cairn_belt');
    const mine = (u.reacts || []).filter((r) => r.sig === true);
    if (u.reacts.length !== roads + 1 || mine.length !== 1) return 'two boundaries left ' + mine.length + ' Signature rows beside ' + roads + ' of the Roads';
    if (mine[0].id !== 'cairn_belt' || mine[0].pm !== M.SG.SIGNATURES.cairn_belt.reacts[0].pm || u.signature !== 'cairn_belt') return 'the row reads ' + JSON.stringify(mine[0]);
    wear(M, u, null);
    if (u.signature !== undefined || (u.reacts || []).length !== roads || (u.reacts || []).some((r) => r.sig)) return 'a hero whose Signature went kept it';
    const bare = H(M, 2, 12, 3, 'tank');
    wear(M, bare, 'cairn_belt'); wear(M, bare, null);
    if (bare.reacts !== undefined) return 'a hero with no Roads kept an empty reaction list';
    return null;
  },
  rows: (M) => {
    const moves = Object.keys(M.AD.ABILITIES);
    const SAMPLE = ['cairn_belt', 'barrow_knights_blade', 'lurchers_collar', 'the_wood_book', 'brewers_apron'];
    const ids = Object.keys(M.SG.SIGNATURES);
    if (ids.join() !== SAMPLE.join()) return 'the Signatures are ' + ids + ', not the ruled sample';
    const nums = new Set();
    for (const [id, s] of Object.entries(M.SG.SIGNATURES)) {
      if (s.id !== id || nums.has(s.n) || !Number.isInteger(s.n)) return id + ': its id or number';
      nums.add(s.n);
      for (const r of s.reacts) { const bad = M.TD.reactProblems({ kind: 'react', id, ...r }, moves); if (bad.length) return id + ': ' + bad.join('; '); }
      /* the home as 24-content-pipeline.md section 4 reads it (content-coherence CC-6 holds the kinds): a monster that exists */
      if (s.home.kind !== 'monster' || !M.MON.MONSTERS[s.home.id]) return id + ': its home ' + JSON.stringify(s.home);
      if (s.move !== undefined && !moves.includes(s.move)) return id + ': move ' + s.move + ' is not a live move';
      if (!M.RO.HUNT_ROLES[s.best.seat]) return id + ': seat ' + s.best.seat;
      if (!M.DG.DANGER_GROUNDS[s.best.ground]) return id + ': sized on ' + s.best.ground + ', off the Danger scale';
      if (typeof s.tip !== 'string' || /[;—]/.test(s.tip)) return id + ': its tip';
    }
    if (M.SG.SIGNATURE_RULES.perHero !== 1) return 'more than one Signature a hero';
    if (M.TD.reactProblems({ kind: 'react', id: 'x', on: 'hp_below', do: 'shield', pm: 250 }).length === 0) return 'CONTROL: a line-less hp_below passed the check';
    return null;
  },
  'low-health-shield': (M) => {
    const k = H(M, 1, 12, 3, 'tank', { hp: 1000, maxHp: 1000 }), o = H(M, 2, 13, 3, 'mage', { hp: 1000, maxHp: 1000 }), m = E(M, 10, 0, 13, 4, 1);
    const inst = fight(M, [k, o, m]);
    wear(M, k, 'cairn_belt');
    const sc = sc2(M, 31);
    blowAt(M, inst, sc, m, k, 600, 'over'); M.RX.drainReactions(inst, sc);
    if (k.shield) return 'a blow that left the wearer at 40% shielded it';
    blowAt(M, inst, sc, m, o, 800, 'other'); M.RX.drainReactions(inst, sc);
    if (o.shield || k.shield) return 'another hero under the line set the wearer\'s Signature off';
    blowAt(M, inst, sc, m, k, 150, 'under'); M.RX.drainReactions(inst, sc);
    if (k.shield !== 250) return 'under 30%: a shield of ' + k.shield + ' (want 25% of 1000)';
    k.shield = 0;
    sc.atMs = 59900;
    blowAt(M, inst, sc, m, k, 10, 'again'); M.RX.drainReactions(inst, sc);
    if (k.shield) return 'the shield came back inside its 60 s clock';
    sc.atMs = 60000;
    blowAt(M, inst, sc, m, k, 10, 'after'); M.RX.drainReactions(inst, sc);
    if (k.shield !== 250) return 'the shield did not come back after its clock: ' + k.shield;
    return null;
  },
  'reset-per-kill': (M) => {
    const u = H(M, 1, 12, 3, 'melee_dps');
    const ms = [0, 1, 2, 3, 4, 5].map((i) => E(M, 10 + i, 0, 13, 3 + i, 1, { hp: 1, maxHp: 1 }));
    const inst = fight(M, [u, ...ms]);
    wear(M, u, 'barrow_knights_blade');
    const sc = sc2(M, 32);
    const want = Math.floor((u.maxHp * 60) / 1000);
    if (!(want > 0)) return 'CONTROL: the hero\'s 6% is ' + want;
    blowAt(M, inst, sc, u, ms[0], 5, 'power_strike'); M.RX.drainReactions(inst, sc);
    if (u.shield) return 'another move\'s hit gave the Blade\'s shield: ' + u.shield;
    for (const m of ms.slice(1)) blowAt(M, inst, sc, u, m, 5, 'turning_cut');
    M.RX.drainReactions(inst, sc);
    if (u.shield !== want) return 'five Turning Cut hits left a shield of ' + u.shield + ' (want one 6% shell, ' + want + ', never added up)';
    /* the reset piece the Blade used to carry stays the Roads' (Ready Mark, talents.js mark_reset): a planted row, capped a cast */
    u.reacts = [{ kind: 'react', id: 'reset_test', on: 'kill', of: 'turning_cut', do: 'reset', move: 'turning_cut', ms: 1000, capMs: 4000 }];
    u.cds = { turning_cut: 8000 };
    const more = [0, 1, 2, 3, 4].map((i) => E(M, 20 + i, 0, 11, 3 + i, 1, { hp: 1, maxHp: 1 }));
    inst.world.units.push(...more);
    for (const m of more) blowAt(M, inst, sc, u, m, 5, 'turning_cut');
    M.RX.drainReactions(inst, sc);
    if (u.cds.turning_cut !== 4000) return 'five Turning Cut kills left its cooldown at ' + u.cds.turning_cut + ' (want 8000 less the 4 s cap)';
    return null;
  },
  'pass-on-death': (M) => {
    const r = H(M, 1, 10, 3, 'ranger'), k = H(M, 2, 12, 3, 'tank');
    const dead = E(M, 10, 0, 13, 3, 2, { hp: 5, maxHp: 50 }), near = E(M, 11, 0, 15, 3, 2), far = E(M, 12, 0, 18, 3, 2), marked = E(M, 13, 0, 13, 4, 2);
    const inst = fight(M, [r, k, dead, near, far, marked]);
    wear(M, r, 'lurchers_collar');
    const sc = sc2(M, 33, 1000);
    dead.markPm = 250; dead.markUntil = 7000; marked.markPm = 250; marked.markUntil = 9000;
    /* the TANK's blow fells it: a death, whoever's blow */
    blowAt(M, inst, sc, k, dead, 50, 'basic'); M.RX.drainReactions(inst, sc);
    if (near.markPm !== 250 || near.markUntil !== 7000) return 'the Mark did not move to the nearest unmarked monster with its time left: ' + JSON.stringify([near.markPm, near.markUntil]);
    if (far.markUntil || marked.markUntil !== 9000) return 'the Mark moved past the nearest, or onto a marked one';
    if (!sc.events.some((e) => e.type === 'mark' && e.u === 1 && e.t === 11)) return 'a moved Mark said nothing';
    const plain = E(M, 14, 0, 15, 3, 2, { hp: 1, maxHp: 1 });
    inst.world.units.push(plain);
    blowAt(M, inst, sc, k, plain, 5, 'basic'); M.RX.drainReactions(inst, sc);
    if (far.markUntil) return 'an unmarked death moved a Mark';
    /* the general piece: a status the wearer laid moves with its scale and time (a planted row: 15 #28's shape) */
    const b = H(M, 3, 10, 4, 'melee_dps'), d2 = E(M, 20, 0, 13, 6, 3, { hp: 1, maxHp: 1 }), n2 = E(M, 21, 0, 14, 6, 3);
    const i2 = fight(M, [b, d2, n2]);
    b.reacts = [{ kind: 'react', id: 'spread_test', on: 'death', do: 'pass', what: 'bleed' }];
    d2.statuses = [{ s: 'bleed', src: 3, left: 2500, next: 500, scale: 1234 }, { s: 'bleed', src: 99, left: 4000, next: 1000, scale: 1000 }];
    const s2 = sc2(M, 34);
    blowAt(M, i2, s2, b, d2, 5, 'basic'); M.RX.drainReactions(i2, s2);
    const got = (n2.statuses || []).filter((s) => s.s === 'bleed');
    if (got.length !== 1 || got[0].src !== 3 || got[0].left !== 2500 || got[0].scale !== 1234) return 'a passed Bleed: ' + JSON.stringify(n2.statuses);
    return null;
  },
  'reset-from-move': (M) => {
    const u = H(M, 1, 10, 3, 'mage'), cold = E(M, 10, 0, 13, 3, 1, { hp: 900, maxHp: 900 }), warm = E(M, 11, 0, 13, 4, 1, { hp: 900, maxHp: 900 });
    const inst = fight(M, [u, cold, warm]);
    wear(M, u, 'the_wood_book');
    u.cds = { hoarfrost: 9000 };
    const sc = sc2(M, 35, 1000);
    blowAt(M, inst, sc, u, warm, 10, 'fireball'); M.RX.drainReactions(inst, sc);
    if (u.cds.hoarfrost !== 9000) return 'another move\'s hit readied Hoarfrost';
    blowAt(M, inst, sc, u, warm, 10, 'frost_lance'); M.RX.drainReactions(inst, sc);
    if (u.cds.hoarfrost !== 1000) return 'a Frost Lance hit left Hoarfrost at ' + u.cds.hoarfrost + ' (want now, 1000: any target, chilled or not)';
    /* the general piece's `has` filter (a planted row: 15 #3 and #5's shape), read as the hit lands */
    u.reacts = [{ kind: 'react', id: 'has_test', on: 'hit', of: 'frost_lance', has: 'chill', do: 'ready', move: 'hoarfrost' }];
    cold.statuses = [{ s: 'chill', src: 1, left: 3000, next: 0, scale: 1000 }];
    u.cds = { hoarfrost: 9000 };
    blowAt(M, inst, sc, u, warm, 10, 'frost_lance'); M.RX.drainReactions(inst, sc);
    if (u.cds.hoarfrost !== 9000) return 'a has-chill row readied Hoarfrost on an unchilled target';
    blowAt(M, inst, sc, u, cold, 10, 'frost_lance');
    cold.statuses = [];
    M.RX.drainReactions(inst, sc);
    if (u.cds.hoarfrost !== 1000) return 'a has-chill row on a target chilled as the hit landed left Hoarfrost at ' + u.cds.hoarfrost;
    return null;
  },
  'heal-boon': (M) => {
    const g = H(M, 1, 10, 3, 'healer', { mana: 999, maxMana: 999 }), a = H(M, 2, 11, 3, 'tank', { hp: 100 }), b = H(M, 3, 12, 3, 'mage', { hp: 200 });
    const inst = fight(M, [g, a, b]);
    wear(M, g, 'brewers_apron');
    const sc = sc2(M, 36);
    const circle = M.AD.ABILITIES.circle_of_renewal, mend = M.AD.ABILITIES.greater_mend;
    M.HR.landHeal(g, a, 20, sc, false, mend, false, { inst, fx: null }); M.RX.drainReactions(inst, sc);
    if ((a.statuses || []).length) return 'another heal gave a boon';
    for (const t of [a, b]) M.HR.landHeal(g, t, 20, sc, false, circle, false, { inst, fx: null });
    M.RX.drainReactions(inst, sc);
    for (const t of [a, b]) {
      const st = (t.statuses || []).filter((s) => s.s === 'emboldened');
      if (st.length !== 1 || st[0].left !== 4000 || st[0].src !== 1) return 'hero ' + t.id + ' after the Circle: ' + JSON.stringify(t.statuses);
    }
    if (M.SE.effectPm(a, 'dealtPm') !== 100) return 'Emboldened raises what the hero deals by ' + M.SE.effectPm(a, 'dealtPm') + ' permille, not 100';
    return null;
  },
  'real-settle': async (M) => {
    const { loadPlay } = await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
    const P = await loadPlay(M.root);
    const four = ['tank', 'ranger', 'mage', 'healer'];
    const SIG = ['cairn_belt', 'lurchers_collar', 'the_wood_book', 'brewers_apron'];
    const go = (sig, windowMs) => {
      const seen = { boon: 0, mark: 0, markCast: 0 };
      const r = P.run('muster_barrows', 60, four, { spanMs: 900000, windowMs, secret: '-4611686018427387904', options: () => ({ risk: 'steady', danger: 570 }),
        equipment: (role, i, L) => ({ ...P.kitFor(L, role), ...(role === 'ranger' ? { ammo: 'steel_arrows' } : {}) }),
        bag: (role) => (role === 'ranger' ? { steel_arrows: { loaded: 400 } } : {}),
        ...(sig ? { signature: (role, i) => sig[i] } : {}),
        /* (the healer opens on Circle of Renewal: the reference bar heals with Greater Mend alone) */
        bar: () => [{ action: { type: 'ability', id: 'circle_of_renewal' }, conditions: [], join: 'and' }, ...P.refBar('muster_barrows')],
        onWindow: (out) => { for (const e of out.events || []) {
          if (e.type === 'status_on' && e.status === 'emboldened') seen.boon++;
          if (e.type === 'mark') seen.mark++;
          if (e.type === 'cast' && e.ability === 'hunters_mark') seen.markCast++;
        } } });
      return { sig: JSON.stringify({ t: r.totals, x: r.heroXp, seen }), seen };
    };
    const plain = go(null, 600000), closed = go(SIG, 600000), viewed = go(SIG, 100000);
    if (plain.seen.boon) return 'a four with no Signature was Emboldened';
    if (!closed.seen.boon) return 'Brewer\'s Apron never gave its boon on the real settle';
    if (!(closed.seen.mark > closed.seen.markCast)) return 'Lurcher\'s Collar never moved a Mark on the real settle: ' + JSON.stringify(closed.seen);
    if (plain.sig === closed.sig) return 'the four with Signatures played exactly the hunt of the four with none';
    if (closed.sig !== viewed.sig) return 'the same Signatures settled in 10-minute and 100-second windows played two hunts';
    return null;
  },
  dark: (M) => {
    if (M.SG.SIGNATURE_RULES.live !== false) return 'SIGNATURE_RULES.live is ' + M.SG.SIGNATURE_RULES.live + ': Signatures are dark until wave 4';
    const allowed = new Set(['src/core/hunt/signature-rules.js', 'src/core/hunt-spawn.js', 'src/core/member.js']);
    const strip = (x) => x.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const walk = (abs, rel, out) => {
      if (!existsSync(abs)) return out;
      for (const e of readdirSync(abs)) {
        const a = join(abs, e), r = rel + '/' + e;
        if (statSync(a).isDirectory()) walk(a, r, out); else if (/\.(m?js|ts)$/.test(e)) out.push([r, readFileSync(a, 'utf8')]);
      }
      return out;
    };
    const files = [...walk(join(M.root, 'src'), 'src', []), ...walk(join(M.root, 'supabase', 'functions'), 'supabase/functions', [])];
    if (files.length < 50) return 'CONTROL: ' + files.length + ' files read';
    for (const [rel, text] of files) if (!allowed.has(rel) && /\bwornSignature\b/.test(strip(text))) return rel + ' names wornSignature: it hands a hero a Signature while Signatures are dark';
    const u = H(M, 1, 12, 3, 'tank');
    M.SR.syncSignature(u, {});
    if (u.signature !== undefined || u.reacts !== undefined) return 'a hero with no Signature got a field';
    return null;
  },
};

const SR = 'src/core/hunt/signature-rules.js', RX = 'src/core/hunt/reactions.js', RQ = 'src/core/hunt/react-queue.js', DM = 'src/core/hunt/damage.js';
const mutants = [
  { name: 'a list plays its last Signature', case: 'worn-signature', edits: [[SR, '.filter((id) => own(SIGNATURES, id)).slice(0, SIGNATURE_RULES.perHero);', '.filter((id) => own(SIGNATURES, id)).reverse();']] },
  { name: 'no Signature plays at all', case: 'worn-signature', edits: [['src/data/signatures.js', '  perHero: 1,', '  perHero: 0,']] },
  { name: 'heroSetup drops the Signature', case: 'worn-signature', edits: [['src/core/hunt-spawn.js', '    ...(sg ? { wornSignature: sg } : {}),\n', '']] },
  { name: 'a boundary adds the rows again', case: 'worn-signature', edits: [[SR, '.filter((r) => r.sig !== true)', '.filter(() => true)']] },
  { name: 'the Roads\' rows go with the Signature', case: 'worn-signature', edits: [[SR, '    u.reacts = rest && rest.length ? rest.concat(signatureReacts(id)) : signatureReacts(id);', '    u.reacts = signatureReacts(id);']] },
  { name: 'a line-less hp_below passes the check', case: 'rows', edits: [['src/data/talents.js', "  if (e.on === 'hp_below' && e.belowPm === undefined) out.push('hp_below names its line (belowPm)');\n", '']] },
  { name: 'the line is read when the queue drains, not as the blow lands', case: 'low-health-shield', edits: [[RQ, ' && holdsNow(row, ctx)) (inst.reactQ', ') (inst.reactQ']] },
  { name: 'the hero\'s own health is never queued', case: 'low-health-shield', edits: [[DM, "  if (target.alive) queueOn(inst, target, 'hp_below', { t: target });\n", '']] },
  { name: 'a death is the killer\'s only', case: 'pass-on-death', edits: [[DM, "for (const h of rs) queueOn(inst, h, 'death',", "for (const h of rs) if (h === source) queueOn(inst, h, 'death',"]] },
  { name: 'a Mark moves onto a marked monster', case: 'pass-on-death', edits: [[RX, '(o) => !(int(o.markUntil) > sc.atMs)', '() => true']] },
  { name: 'a passed Mark starts its time again', case: 'pass-on-death', edits: [[RX, 'm.markPm = ctx.markPm; m.markUntil = ctx.markUntil;', 'm.markPm = ctx.markPm; m.markUntil = ctx.markUntil + 1000;']] },
  { name: 'a passed status loses its scale', case: 'pass-on-death', edits: [[RX, 'st.left = was.left; st.scale = was.scale;', 'st.left = was.left;']] },
  { name: 'has is never read', case: 'reset-from-move', edits: [[RQ, "(row.has === undefined || carries(ctx.t, row.has))", 'true']] },
  { name: 'ready waits out the cooldown', case: 'reset-from-move', edits: [[RX, '  u.cds = Object.assign({}, u.cds, { [move]: atMs });', '  u.cds = Object.assign({}, u.cds, { [move]: readyAt(u.cds, move) });']] },
  { name: 'a cast heal queues no moment', case: 'heal-boon', edits: [['src/core/hunt/heal-rules.js', "  if (inst && row) queueOn(inst, u, 'heal', { t, ability: row.id });\n", '']] },
  { name: 'a boon keeps the row\'s own time', case: 'heal-boon', edits: [[RX, '    if (row.ms) for (const s of t.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.left = row.ms;\n    return true;\n  },\n});', '    return true;\n  },\n});']] },
  { name: 'the settle never syncs the Signature', case: 'real-settle', edits: [['src/core/combat-sim.js', '  syncSignature(u, m.hero);', '  void syncSignature;']] },
  { name: 'the member drops the Signature', case: 'real-settle', edits: [['src/core/member.js', "        ...(typeof h.wornSignature === 'string' && h.wornSignature ? { wornSignature: h.wornSignature } : {}),\n", '']] },
  { name: 'Signatures switched on', case: 'dark', edits: [['src/data/signatures.js', '  live: false,', '  live: true,']] },
  { name: 'the settle hands a hero its Signature', case: 'dark', edits: [['src/core/combat-sim.js', '  syncSignature(u, m.hero);', '  syncSignature(u, { wornSignature: m.hero.wornSignature });']] },
];

const R = makeReport('signature-rules');
const M0 = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = await fn(M0); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
if (!process.argv.includes('--no-mutants')) for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, ['src/render', 'supabase/functions/hr-accrue', 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { why = await cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
