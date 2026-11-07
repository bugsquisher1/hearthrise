#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/run.mjs — THE CONTENT COVERAGE BOT: PLAY EVERY SKILL AND EVERY PIECE OF CONTENT, AND SAY
// WHERE A PLAYER GETS STUCK (Tyler 2026-11-07).
//
//   node tools/qa/coverage/run.mjs                   every way to fight (src/data/start-kit.js STARTER_SETS), a crafter and a
//                                                    party of four, 20 in-game hours, one world (a long local run)
//   node tools/qa/coverage/run.mjs --shard 2/4       the nightly form: the 2nd quarter of that crew (a party never splits);
//                                                    run 1/4..4/4 in parallel, then --merge reads every run-*.json in --out
//   node tools/qa/coverage/run.mjs --merge [--out DIR]
//   node tools/qa/coverage/run.mjs --quick           the tank and the crafter, 2 in-game hours (a look before a long run)
//     options: --hours N  --ways tank,mage|all|none  --no-crafter  --party / --no-party  --no-page  --out DIR (default out/)
//   node tools/qa/coverage/run.mjs --selftest        its parts on fixtures, no world, under a second (smoke.yml registers it)
//   node tools/qa/coverage/run.mjs --mutate          three planted faults in their own worlds, each must show (mutate.mjs)
//
// On tools/qa/local-world.mjs: the real play.html, the real hr-accrue engine, the replayed migration chain in
// PGlite, nothing leaves the machine. Each hero is a FRESH account and plays from its first screen. Every
// reward is EARNED: the bot sends only the client's own intents (hands.mjs: edgeBody's verbs and the RPCs the
// client calls), and time passes through world.wait (hunts AND town: rest, crops, benches). No SQL here
// writes anything; the report's reads are read-only.
//
// THE LOOP: one world clock for every hero. A free hero asks the brain (brain.mjs) for its next step; instant
// steps (sell, buy, wear, plant) run at once, a hunt or a town job takes the minutes it names. The world then
// waits until the next hero is free (a hunt is looked at every 30 minutes, so a death or a Level that moves
// the game's advice ends its stretch early). At each milestone (a hunt's end, every 4 in-game hours) the bot
// reloads the real page and reads its text, so the browser and the server are seen to agree (CLAUDE.md §6).
//
// THE REPORT (tools/qa/coverage/out/, gitignored): coverage.json (machine) and coverage.md (plain English):
// coverage of every skill, ground and tier, item, recipe, bestiary entry and sink; the stalls; the pace
// against src/data/core-model.js LEVEL_PACE and src/data/balance-sheet.js.
// --selftest plants its twins into fixtures, --mutate its faults into its own worlds' memory; the bot's own files are what it proves:
// mutant-anchors: tools/qa/coverage/
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STARTER_SETS } from '../../../src/data/start-kit.js';
import { ITEMS } from '../../../src/data/items.js';
import { coverageMap } from './map.mjs';
import { nextAction, keepHunting, partyHunt, newMemory, PACE } from './brain.mjs';
import { randomUUID } from 'node:crypto';
import { viewOf, packOf, roleOfSet, sameFamily } from './view.mjs';
import { newJournal, holdingsOf, record, stall, sample, huntOutcome, mergeJournals } from './journal.mjs';
import { buildReport, verdicts, reportText, nextCostsOf } from './report.mjs';
import { whole, short } from '../../../src/render/format.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const has = (n) => args.includes(n);
const LOOK_MIN = 15;           // a running hunt is looked at this often (the Cellar's Level 5 comes in about a quarter hour)
const PAGE_EVERY_H = 4;        // the page check's cadence, besides every hunt's end

/** The ways to fight, from data: one hero per STARTER_SETS row (src/data/start-kit.js). */
export function waysFromData() {
  return Object.entries(STARTER_SETS).map(([id, set]) => ({ id, set: set.slice() }));
}

/**
 * Play `heroes` (each { name, way }) for `hours` of in-game time on one world clock.
 * @returns {Promise<{journal, wallMs, gameHours}>}
 */
export async function play({ world, map, heroes, hours, log = console.log, pageCheck = true, openAccount }) {
  const j = newJournal();
  const t0 = Date.now();
  const crew = [];
  for (const h of heroes) {
    const acct = await openAccount(world, h.name.toLowerCase(), () => {});
    const hero = acct.hero(0);
    const made = await hero.create(h.name);
    if (!made.ok) throw new Error('coverage: ' + h.name + ' was not created: ' + made.error);
    crew.push({ name: h.name, way: h.way, focus: h.focus || 'combat', party: h.party || null, lead: !!h.lead, acct, hero,
      mem: newMemory(h.way, h.party ? 'party' : h.focus || 'combat'), busyUntil: 0, doing: null, lastPage: -1 });
  }
  let clock = 0;   // in-game minutes
  /* a hero's hunting minutes so far (LEVEL_PACE's targets are hunting hours), the running stretch included */
  const hunted = (c) => (c.huntMin || 0) + (c.doing && c.doing.type === 'hunt' ? clock - c.doing.at : 0);
  const budget = hours * 60;
  const look = async (c) => {
    const r = await c.hero.load();
    if (!r.ok) throw new Error('coverage: hr_load refused ' + c.name + ': ' + r.error);
    const v = viewOf(r.body, clock);
    c.level = v.level;
    return v;
  };
  /* THE FIRST CHOICE a player makes: wear the way's starter set (the practice kit is in every new bag). */
  for (const c of crew) {
    const v = await look(c);
    const map0 = {};
    /* one weapon (the ranger's set holds a bow and a crossbow: the first is worn), its off-hand if the set has one, else none */
    for (const id of c.way.set) if (!map0[slotOfStarter(id)]) map0[slotOfStarter(id)] = id;
    if (!map0.shield && v.worn.shield) map0.shield = null;
    const ans = await c.hero.equip(map0);
    record(j, { hour: 0, hero: c.name, action: { type: 'equip', rule: 'start', map: map0, why: 'the ' + c.way.id + ' starter set' }, answer: ans, before: holdingsOf(v), after: holdingsOf(await look(c)), wornAfter: (await look(c)).worn });
  }

  /* THE PARTIES: the leader invites each member by the name players see; each member reads its invite from its own
     envelope (party_invites) and accepts (character-session.js inviteByName / answerInvite). */
  const parties = new Map();
  for (const c of crew) if (c.party) { if (!parties.has(c.party)) parties.set(c.party, []); parties.get(c.party)[c.lead ? 'unshift' : 'push'](c); }
  for (const [id, members] of parties) {
    const lead = members[0];
    for (const m of members.slice(1)) {
      const inv = await lead.acct.rpc('hr_hunt_party_invite', { p_slot: 0, p_name: m.name, p_idem: randomUUID() });
      const env = (await m.hero.load()).body;
      const invite = Array.isArray(env.party_invites) ? env.party_invites[0] : null;
      const acc = invite ? await m.acct.rpc('hr_hunt_party_accept', { p_slot: 0, p_invite: invite.id, p_idem: randomUUID() }) : inv;
      record(j, { hour: 0, hero: m.name, action: { type: 'party', rule: 'start', key: 'party:' + id, why: 'join ' + lead.name + '\'s party' }, answer: acc.ok ? acc : { ...acc, ok: false }, before: {}, after: {} });
      if (!inv.ok || !acc.ok) throw new Error('coverage: ' + m.name + ' could not join ' + lead.name + '\'s party: ' + (inv.ok ? acc.error : inv.error));
    }
  }

  while (clock < budget) {
    for (const c of crew) {
      if (c.busyUntil > clock) continue;
      if (c.doing) await finish(c);
      /* instant steps first, until the hero starts something that takes time */
      for (let guard = 0; guard < 40; guard++) {
        const v = await look(c);
        c.mem.hour = clock / 60;
        if (guard === 0) sample(j, { hour: clock / 60, hero: c.name, v, huntH: hunted(c) / 60 });
        const a = nextAction({ v, map, mem: c.mem });
        if (!a) {
          /* a party member with nothing to do in town is waiting for its party's next hunt, not stuck */
          if (!c.party) stall(j, { hour: clock / 60, hero: c.name, why: 'the brain found nothing sensible to do', v });
          c.doing = { type: 'rest', minutes: c.party ? 5 : PACE.restMin };
          c.busyUntil = clock + c.doing.minutes;
          break;
        }
        const started = await start(c, a, v);
        if (started) break;
      }
    }
    for (const [, members] of parties) await partyGo(members);
    const next = Math.min(...crew.map((c) => c.busyUntil));
    /* the first Levels come minutes apart (LEVEL_PACE.early): look closer while a hunting hero is under Level 6 */
    const every = crew.some((c) => c.doing && c.doing.type === 'hunt' && c.level < 6) ? 5 : LOOK_MIN;
    const step = Math.max(1, Math.min(next - clock, every, budget - clock));
    await world.wait(step);
    clock += step;
    for (const c of crew) if (c.doing && c.doing.type === 'hunt') await watchHunt(c);
    if (log) log('  ' + (clock / 60).toFixed(2) + ' h  ' + crew.map((c) => c.name + ': ' + (c.doing ? c.doing.type + ' ' + (c.doing.ground || c.doing.id || '') : 'idle')).join(' | ') + '  (' + Math.round((Date.now() - t0) / 1000) + ' s wall)');
  }
  for (const c of crew) if (c.doing) await finish(c);
  const finals = {};
  for (const c of crew) {
    const env = (await c.hero.load()).body;
    sample(j, { hour: clock / 60, hero: c.name, v: viewOf(env, clock), huntH: hunted(c) / 60 });
    finals[c.name] = nextCostsOf(env);
    if (pageCheck) await pageLook(c, 'at the end');
  }
  for (const c of crew) if (c.page) await c.page.close().catch(() => {});
  return { journal: j, wallMs: Date.now() - t0, gameHours: clock / 60, finals,
    crew: crew.map((c) => ({ name: c.name, way: c.way.id, focus: c.focus, uid: c.acct.uid })) };

  /** A party whose members are all free in town goes hunting together: the leader picks (the party's advice), sets the tier, starts. */
  async function partyGo(members) {
    /* a member resting is waiting for the party (no bench job running, nobody hunting) */
    if (!members.every((m) => !m.doing || m.doing.type === 'rest')) return;
    const vs = [];
    for (const m of members) vs.push(await look(m));
    const lead = members[0];
    if (Math.min(...vs.map((v) => v.staminaMin)) < PACE.minStaminaToHuntMin) {
      for (const m of members) { m.doing = { type: 'rest', minutes: PACE.restMin }; m.busyUntil = clock + PACE.restMin; }
      return;
    }
    const a = partyHunt({ vs, map, mem: lead.mem });
    if (!a) {
      stall(j, { hour: clock / 60, hero: lead.name, why: 'the party found no ground to hunt (Levels ' + vs.map((v) => v.level).join(', ') + ')', v: vs[0] });
      for (const m of members) { m.doing = { type: 'rest', minutes: PACE.restMin }; m.busyUntil = clock + PACE.restMin; }
      return;
    }
    if (a.tier !== 'normal' || (lead.mem.tierOn && lead.mem.tierOn[a.hunt] && lead.mem.tierOn[a.hunt] !== 'normal')) {
      const t = await lead.hero.setTier(a.hunt, a.tier);
      if (!t.ok) { refuse(lead, a, t, clock / 60, holdingsOf(vs[0])); return; }
    }
    /* four players at their screens: each open page polls (the server's "online", hr_party_away reads it) */
    for (const m of members) await m.hero.poll();
    const ans = await lead.acct.rpc('hr_hunt_party_start', { p_slot: 0, p_hunt: a.hunt, p_idem: randomUUID() });
    if (!ans.ok) { refuse(lead, a, ans, clock / 60, holdingsOf(vs[0])); return; }
    lead.mem.tierOn = { ...(lead.mem.tierOn || {}), [a.hunt]: a.tier };
    lead.mem.visited.add(a.ground + ':' + a.tier);
    members.forEach((m, k) => {
      m.mem.visitMin = 0;
      m.doing = { ...a, at: clock, before: holdingsOf(vs[k]), level0: vs[k].level, partyLead: k === 0 };
      m.busyUntil = clock + a.minutes;
    });
  }

  /** Start `a`. True when it takes time (the hero is busy), false for an instant step. */
  async function start(c, a, v) {
    const before = holdingsOf(v);
    const hour = clock / 60;
    let ans = null;
    switch (a.type) {
      case 'equip': ans = await c.hero.equip(a.map); break;
      case 'sell': ans = await c.hero.sell(a.lines); break;
      case 'buy': ans = await c.hero.buy(a.offer, a.qty); if (ans.ok) c.mem.bought.add(a.offer); break;
      case 'unlock': ans = await c.hero.unlock(a.offer); if (ans.ok) c.mem.bought.add(a.offer); break;
      case 'plant': ans = await c.hero.plant(a.plot, a.crop); break;
      case 'harvest': ans = await c.hero.harvest(a.plot); break;
      case 'burn': ans = await c.hero.burn(a.item); break;
      /* the server's own next buys, quoted at the server's price (home-intents.js, account-session.js, farm-intents.js) */
      case 'chest': ans = await c.hero.chest(a.chest, a.price); if (ans.ok) c.mem.bought.add('chest.' + a.chest); a.offer = 'chest.' + a.chest; break;
      case 'slot': ans = await c.acct.buySlot(a.slotId, 0); a.offer = 'character_slot.' + a.slotId; break;
      case 'land': ans = await c.acct.rpc('hr_farm_upgrade_plot', { p_slot: 0, p_idem: randomUUID(), p_expect_level: a.level }); a.offer = 'land.' + a.level; break;
      case 'hunt': {
        if (a.tier !== 'normal') {
          const t = await c.hero.setTier(a.hunt, a.tier);
          if (!t.ok) { refuse(c, a, t, hour, before); return false; }
        } else if (c.mem.tierOn && c.mem.tierOn[a.hunt] && c.mem.tierOn[a.hunt] !== 'normal') {
          await c.hero.setTier(a.hunt, 'normal');
        }
        ans = await c.hero.enterHunt(a.hunt, packOf(v));
        if (!ans.ok) { refuse(c, a, ans, hour, before); return false; }
        c.mem.tierOn = { ...(c.mem.tierOn || {}), [a.hunt]: a.tier };
        c.mem.visitMin = 0;   // a new trip out: the next town visit has its bench time again
        c.mem.visited.add(a.ground + ':' + a.tier);
        c.doing = { ...a, at: clock, before, level0: v.level };
        c.busyUntil = clock + a.minutes;
        return true;
      }
      case 'work': {
        ans = await c.hero.activity({ kind: a.kind, id: a.id, ...(a.count ? { count: a.count } : {}) });
        if (!ans.ok) { refuse(c, a, ans, hour, before); return false; }
        c.doing = { ...a, at: clock, before };
        c.busyUntil = clock + a.minutes;
        return true;
      }
      default: throw new Error('coverage: the brain asked for an unknown step ' + a.type);
    }
    const after = await look(c);
    record(j, { hour, hero: c.name, action: a, answer: ans, before, after: holdingsOf(after), wornAfter: after.worn });
    if (!ans.ok) cool(c, a, ans);
    return false;
  }

  /** A refused start: journal it, and never ask the same thing again until something changes (an hour on). */
  function refuse(c, a, ans, hour, before) {
    record(j, { hour, hero: c.name, action: a, answer: ans, before, after: before });
    cool(c, a, ans);
  }
  function cool(c, a, ans) {
    if (!a.key) return;
    /* a refusal that names the hero's state (level, skill, stock, gold) may pass later: try again in 2 hours; any other is final */
    if (/level|skill|short|gold|afford|stock|input|stamina|busy|open|cooldown|rate/i.test(String(ans.error))) c.mem.cooldown.set(a.key, c.mem.hour + 2);
    else c.mem.refused.add(a.key);
  }

  /** A hunt in progress: did it end on its own (death, stamina, gold), or did the game's advice move on? */
  async function watchHunt(c) {
    const v = await look(c);
    sample(j, { hour: clock / 60, hero: c.name, v, huntH: hunted(c) / 60 });
    if (!v.hunting) { c.busyUntil = clock; return; }
    if (c.party) {
      /* the party walks on together: the leader judges by every member's Level; a member home early (a death) ends it for all */
      const members = crew.filter((m) => m.party === c.party);
      if (!c.lead) return;
      const levels = members.map((m) => m.level);
      const someoneHome = [];
      for (const m of members.slice(1)) if (!(await look(m)).hunting) someoneHome.push(m.name);
      if (someoneHome.length || !keepHunting({ v, map, levels, size: members.length }, c.doing)) for (const m of members) m.busyUntil = clock;
      return;
    }
    if (!keepHunting({ v, map }, c.doing)) c.busyUntil = clock;
  }

  /** End what the hero was doing and journal its evidence. */
  async function finish(c) {
    const d = c.doing;
    c.doing = null;
    if (!d || d.type === 'rest') return;
    let v = await look(c);
    if (d.type === 'hunt') {
      let tally = v.tally;
      if (v.hunting) {
        const left = await c.hero.leaveHunt();
        if (!left.ok) j.refusals.push({ hour: clock / 60, hero: c.name, action: 'leave ' + d.ground, error: left.error });
        /* a leave is pending until its leave_at (the walk out): let that minute pass */
        for (let i = 0; i < 5 && (v = await look(c)).hunting; i++) await world.wait(1);
      }
      const end = await endOf(c);
      c.huntMin = (c.huntMin || 0) + (end && end.minutes > 0 ? Math.min(clock - d.at, Math.round(end.minutes)) : clock - d.at);
      if (v.tally && tally && v.tally.session === tally.session) tally = v.tally;   // the ended session's final tally
      huntOutcome(j, { hour: d.at / 60, hero: c.name, ground: d.ground, tier: d.tier,
        minutes: end && end.minutes > 0 ? Math.min(clock - d.at, Math.round(end.minutes)) : clock - d.at, end: end && end.reason, level: d.level0, lastLevel: v.level, tally,
        party: c.party ? crew.filter((m) => m.party === c.party).length : 0, lead: c.lead });
      if (!end || end.reason !== 'died') c.mem.held.set(d.ground + ':' + d.tier, (c.mem.held.get(d.ground + ':' + d.tier) || 0) + 1);
      else c.mem.cooldown.set('hunt:' + d.ground + ':' + d.tier, c.mem.hour + 1);
      record(j, { hour: d.at / 60, hero: c.name, action: d, answer: { ok: true }, before: d.before, after: holdingsOf(v), wornAfter: v.worn });
      const row = j.grounds[d.ground + ':' + d.tier + (c.party ? ':party' : '')];
      if (pageCheck && (!c.party || c.lead) && row && row.stretches === 1) await pageLook(c, 'after the first hunt on ' + d.ground + ' (' + d.tier + (c.party ? ', party' : '') + ')');
    } else if (d.type === 'work') {
      if (d.kind === 'artisan') c.mem.visitMin += clock - d.at;
      const stop = await c.hero.activity({ kind: 'idle' });
      if (!stop.ok) j.refusals.push({ hour: clock / 60, hero: c.name, action: 'stop ' + d.id, error: stop.error });
      v = await look(c);
      record(j, { hour: d.at / 60, hero: c.name, action: d, answer: { ok: true }, before: d.before, after: holdingsOf(v), wornAfter: v.worn });
    }
    if (pageCheck && Math.floor(clock / 60 / PAGE_EVERY_H) > c.lastPage) await pageLook(c, 'every ' + PAGE_EVERY_H + ' hours');
  }

  /** The newest ended session's reason (read-only). */
  async function endOf(c) {
    const r = (await world.db.query(`select end_reason as reason, hunt_id, extract(epoch from ended_at - entered_at)::float8 / 60 as minutes
      from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is not null order by entered_at desc limit 1`, [c.acct.uid])).rows[0];
    return r || null;
  }

  /** THE PAGE CHECK (§6): reload the real page as this account, open the bag and read it. The Level, the purse and every
      stack the window shows must be the server's numbers (whole or short form, as src/render/format.js writes them). */
  async function pageLook(c, why) {
    c.lastPage = Math.floor(clock / 60 / PAGE_EVERY_H);
    const v = await look(c);
    const p = c.page || (c.page = await world.play({ account: c.acct.name }));
    try {
      await p.reload();
      if (await p.page.$('[data-app="play"]')) await p.page.click('[data-app="play"]');
      await p.page.waitForSelector('.hs-launchers', { timeout: 120000 });
      await p.page.click('[data-hs-open="inventory"]');
      await p.page.waitForSelector('.hw-pocket[data-item]', { timeout: 60000 }).catch(() => {});
      const text = await p.text();
      const stacks = await p.page.evaluate(() => Array.from(document.querySelectorAll('.hw-pocket[data-item]')).map((li) => [li.getAttribute('data-item'), li.innerText]));
      const forms = (n) => [whole(n), short(n), String(n)];
      const levelShown = new RegExp('\\b' + v.level + '\\b').test(text);
      const goldShown = forms(v.gold).some((f) => text.includes(f));
      /* a stack the window shows with a count that is not the server's (a missing count reads as 1) */
      const off = stacks.filter(([id, t]) => { const n = v.bag[id] || 0; const shown = (t.match(/[\d.,]+k*/g) || []); return n > 1 && !forms(n).some((f) => shown.includes(f)); })
        .map(([id, t]) => id + ' shows "' + t.replace(/\s+/g, ' ').trim() + '", server ' + (v.bag[id] || 0));
      const missing = Object.keys(v.bag).filter((id) => !stacks.some(([s]) => s === id));
      j.notes.push({ hour: clock / 60, hero: c.name, page: why, level: v.level, gold: v.gold, levelShown, goldShown, stacks: stacks.length, off, missing, errors: p.errors.splice(0) });
    } catch (e) {
      j.notes.push({ hour: clock / 60, hero: c.name, page: why, failed: String(e && e.message || e).slice(0, 200) });
    }
  }
}

function slotOfStarter(id) { return ITEMS[id] && ITEMS[id].slot === 'shield' ? 'shield' : 'weapon'; }

/**
 * THE CREW, from data: one hero per way to fight (STARTER_SETS), plus a crafter (the tank's kit, never hunts: a
 * player's second hero at the benches). `--shard i/n` takes every n-th hero from the i-th, so n processes share it.
 */
export function crewFromData({ ways = 'all', crafter = true, party = true, shard = null } = {}) {
  const all = waysFromData();
  const picked = ways === 'all' ? all : all.filter((w) => String(ways).split(',').includes(w.id));
  const hero = (w, focus, prefix = 'Cov') => ({ name: prefix + (focus === 'crafter' ? 'craft' : w.id.replace(/[^a-z]/g, '').slice(0, 10)), focus,
    way: { ...w, role: roleOfSet(w.set), keepsWeapon: (id) => w.set.includes(id) || sameFamily(w.set, id) } });
  /* units: each solo hero, the crafter, and the party as ONE unit (a party shares a world, so it never splits across shards) */
  const units = picked.map((w) => [hero(w, 'combat')]);
  if (crafter) units.push([hero(all[0], 'crafter')]);
  if (party) {
    /* one four of every role the data's starter sets play, leader first (the tank holds the pull) */
    const byRole = new Map();
    for (const w of all) { const r = roleOfSet(w.set); if (!byRole.has(r)) byRole.set(r, w); }
    const four = ['tank', 'healer', 'ranger', 'mage'].filter((r) => byRole.has(r)).map((r, k) => ({ ...hero(byRole.get(r), 'combat', 'Pty'), party: 'p1', lead: k === 0 }));
    if (four.length >= 2) units.push(four);
  }
  const mine = shard ? units.filter((_, k) => k % shard[1] === shard[0] - 1) : units;
  return mine.flat();
}

/** One process's run, written raw so shards merge into one report (`--merge`). */
function writeRun(out, tag, run, kills) {
  writeFileSync(join(out, 'run-' + tag + '.json'), JSON.stringify({ tag, run, kills }));
}

/** Merge the raw runs in `out` into one report: a skill trained in any shard is trained. */
function mergeRuns(out) {
  const runs = readdirSync(out).filter((f) => /^run-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(out, f), 'utf8')));
  if (!runs.length) throw new Error('coverage: no run-*.json in ' + out);
  const journal = mergeJournals(runs.map((r) => r.run.journal));
  const kills = {};
  for (const r of runs) for (const [m, n] of Object.entries(r.kills || {})) kills[m] = (kills[m] || 0) + n;
  const run = { journal, crew: runs.flatMap((r) => r.run.crew), gameHours: Math.max(...runs.map((r) => r.run.gameHours)),
    wallMs: Math.max(...runs.map((r) => r.run.wallMs)), bootMs: Math.max(...runs.map((r) => r.run.bootMs || 0)), finals: Object.assign({}, ...runs.map((r) => r.run.finals)) };
  return verdicts({ map: coverageMap(), run, kills, finals: run.finals });
}

// ── THE CLI ──────────────────────────────────────────────────────────────
const { isMain } = await import('../../../tests/_is-main.mjs');
if (isMain(import.meta.url)) {
  const out = opt('--out', join(HERE, 'out'));
  mkdirSync(out, { recursive: true });
  const say = (R) => { writeFileSync(join(out, 'coverage.json'), JSON.stringify(R, null, 1)); writeFileSync(join(out, 'coverage.md'), reportText(R)); };
  if (has('--selftest')) {
    const { selftest } = await import('./selftest.mjs');
    const fails = selftest();
    for (const f of fails) console.log('  RED  ' + f);
    console.log(fails.length ? 'coverage --selftest: RED (' + fails.length + ')' : 'coverage --selftest: green (the map is the data, every rule answers, the journal and the verdicts bite)');
    process.exit(fails.length ? 1 : 0);
  }
  if (has('--merge')) {
    const R = mergeRuns(out);
    say(R);
    console.log(reportText(R).split('\n').slice(0, 40).join('\n'));
    process.exit(0);
  }
  if (has('--mutate')) {
    const { mutate } = await import('./mutate.mjs');
    process.exit(await mutate({ out, opt, has }));
  }
  const { openWorld } = await import('../local-world.mjs');
  const { openAccount } = await import('./hands.mjs');
  const quick = has('--quick');
  const hours = Number(opt('--hours', quick ? 2 : 20));
  const shardArg = opt('--shard', null);
  const shard = shardArg ? shardArg.split('/').map(Number) : null;
  const ways = opt('--ways', quick ? 'tank' : 'all');
  const heroes = crewFromData({ ways, crafter: !has('--no-crafter'), party: !has('--no-party') && (has('--party') || ways === 'all'), shard });
  if (!heroes.length) { console.error('coverage: no hero in this pick (ways from data: ' + waysFromData().map((w) => w.id).join(', ') + ')'); process.exit(2); }
  const t0 = Date.now();
  /* the map is read BEFORE any plant (it keeps the paper doors a plant closes), the data plant before the engine loads */
  const map = coverageMap();
  const plantName = opt('--plant', null);
  const plants = plantName ? await import('./mutate.mjs') : null;
  if (plants) await plants.plant(plantName, map, 'data');
  const world = await openWorld({ tickMs: false });
  if (plants) console.log('coverage: planted ' + plantName + ' ' + JSON.stringify(await plants.plant(plantName, map, 'world', world), (k, v) => (k === 'items' || k === 'grants' ? undefined : v)));
  const bootMs = Date.now() - t0;
  console.log('coverage: world up in ' + Math.round(bootMs / 1000) + ' s; ' + heroes.map((h) => h.name).join(', ') + ' for ' + hours + ' in-game hours');
  let code = 0;
  try {
    const run = await play({ world, map, heroes, hours, openAccount, pageCheck: !has('--no-page') });
    run.bootMs = bootMs;
    const R = await buildReport({ world, map, run, finals: run.finals });
    if (shard) writeRun(out, shard.join('of'), run, Object.fromEntries(R.monsters.map((m) => [m.id, m.kills])));
    else say(R);
    console.log(reportText(R).split('\n').slice(0, 60).join('\n'));
    console.log('coverage: ' + (shard ? 'shard ' + shard.join('/') + ' written to ' + out + ' (merge with --merge)' : 'wrote ' + join(out, 'coverage.md'))
      + ' (' + Math.round((Date.now() - t0) / 1000) + ' s wall, ' + run.gameHours.toFixed(1) + ' in-game hours)');
  } catch (e) {
    console.error('coverage: HARNESS: ' + (e && e.stack || e));
    code = 2;
  } finally {
    await world.close();
  }
  process.exit(code);
}
