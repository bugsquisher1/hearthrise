// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/report.mjs — THE COVERAGE REPORT: WHAT PLAY REACHED, WHERE IT STALLED, HOW FAST.
//
// verdicts() is PURE: it joins the map (map.mjs, from data) with the journal (journal.mjs, from play) and
// the bestiary's kill counts. buildReport() adds the two read-only server reads (hr_bestiary_of, and each
// hero's last envelope for "what the next step would cost"). reportText() words it for Tyler and the
// designer: plain English, short lines, the evidence beside each verdict.
// ════════════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { LEVEL_PACE } from '../../../src/data/core-model.js';
import { contractXpPerH, BALANCE_SHEET } from '../../../src/data/balance-sheet.js';

const r1 = (n) => Math.round(n * 10) / 10;
const commit = () => { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return null; } };

/** The first in-game hour each value of `key(sample)` reached `at`, per hero. */
function firstAt(samples, hero, key, levels) {
  const out = [];
  const mine = samples.filter((s) => s.hero === hero);
  for (const L of levels) {
    const s = mine.find((x) => key(x) >= L);
    if (s) out.push({ level: L, hour: s.hour, huntH: s.huntH === undefined ? null : s.huntH });
  }
  return out;
}

/** The ids of everything that trains `skill` (its nodes, recipes and crops), as the journal keys them. */
function trainingKeys(map, skill) {
  const keys = new Set();
  for (const n of map.nodes) if (n.skill === skill) keys.add(n.kind === 'crop' ? 'plant:' + n.id : 'work:' + n.id);
  for (const r of map.recipes) if (r.skill === skill) keys.add('work:' + r.id);
  return keys;
}

/** The report, from the map, the run and the kill counts. Pure. */
export function verdicts({ map, run, kills = {}, finals = {} }) {
  const j = run.journal;
  const last = (hero) => j.samples.filter((s) => s.hero === hero).slice(-1)[0] || null;
  const heroes = run.crew.map((c) => {
    const s = last(c.name);
    return { name: c.name, way: c.way, focus: c.focus || 'combat', level: s && s.level, gold: s && s.gold, skills: s && s.skills, huntHours: s && s.huntH !== null && s.huntH !== undefined ? r1(s.huntH) : null, next: finals[c.name] || null };
  });

  /* SKILLS: the best level any hero reached, the hours to each mark */
  const skills = map.skills.map((sk) => {
    let best = null;
    for (const h of heroes) {
      const lv = (h.skills && h.skills[sk.id]) || 1;
      if (!best || lv > best.level) best = { level: lv, hero: h.name };
    }
    const marks = best ? firstAt(j.samples, best.hero, (x) => (x.skills && x.skills[sk.id]) || 1, [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 99]) : [];
    return { id: sk.id, name: sk.name, cap: sk.cap, level: best ? best.level : 1, hero: best && best.hero, trained: !!best && best.level > 1, marks,
      ofCap: sk.cap ? r1((100 * (best ? best.level : 1)) / sk.cap) : null };
  });

  /* GROUNDS AND TIERS: reached, survived, Level XP an hour against the pace contract at the stretch's middle Level */
  const row = (o, t) => {
    if (!o) return null;
    const mid = Math.round((o.level + (o.lastLevel || o.level)) / 2);
    return { tier: t, reached: true, size: o.size || 1, firstHour: o.first, level: o.level, lastLevel: o.lastLevel || o.level, hours: r1(o.minutes / 60), deaths: o.deaths, ends: o.ends,
      xpPerH: o.xpPerH || null, contract: Math.round(contractXpPerH(mid)), netPerH: o.netPerH, kills: o.kills };
  };
  /* a tier is reached when a lone hero or the party hunted it; both rows are kept (a party's rates are per head) */
  const grounds = map.grounds.map((g) => ({ id: g.id, name: g.name, band: g.band, party: g.party,
    tiers: g.tiers.map((t) => {
      const solo = row(j.grounds[g.id + ':' + t], t), four = row(j.grounds[g.id + ':' + t + ':party'], t);
      return solo || four ? { ...(solo || four), party: four } : { tier: t, reached: false };
    }) }));

  /* ITEMS: reached (a count rose while play ran) and used (a count fell, or worn) */
  const items = map.items.map((it) => {
    const got = j.obtained[it.id], use = j.used[it.id];
    const status = got && use ? 'reached and used' : got ? 'reached, never used' : use ? 'used (from the start kit)' : it.paper ? 'never reached' : 'no door on paper';
    return { id: it.id, name: it.name, status, firstHour: got ? got.first : null, via: got ? got.via : [], usedVia: use ? use.via : [], paperDoor: it.paper, fate: it.fate, sources: it.sources };
  });

  const recipes = map.recipes.map((r) => { const c = j.crafted[r.id]; return { id: r.id, skill: r.skill, req: r.req, made: !!c, firstHour: c ? c.first : null, times: c ? c.times : 0 }; });
  const nodes = map.nodes.map((n) => {
    const g = j.gathered[n.id];
    const grown = n.kind === 'crop' && j.obtained[n.prod] && j.obtained[n.prod].via.includes('harvested');
    return { id: n.id, skill: n.skill, req: n.req, kind: n.kind, worked: !!g || !!grown, firstHour: g ? g.first : grown ? j.obtained[n.prod].first : null };
  });
  const monsters = map.monsters.map((m) => ({ id: m.id, name: m.name, boss: m.boss, grounds: m.grounds, kills: kills[m.id] || 0 }));
  const sinks = map.sinks.map((s) => {
    const took = j.sinks[s.id];
    const no = j.refusals.filter((x) => x.action.endsWith(':' + s.id)).map((x) => x.error);
    return { id: s.id, table: s.table, name: s.name, gold: s.gold, bought: !!took, firstHour: took ? took.first : null, refused: [...new Set(no)] };
  });

  /* HOW THE SKILLS FED EACH OTHER, as played: an item one skill made (or a ground dropped) that another skill spent or a fight wore or ate */
  const skillOfLabel = (l) => { const m = /^(?:made by (\w+)|gathered \((\w+)\)|(\w+) input|drop on (\w+)|harvested)/.exec(l); if (!m) return null;
    if (m[1]) return m[1]; if (m[2]) { const n = map.nodes.find((x) => x.id === m[2]); return n ? n.skill : null; } if (m[3]) return m[3]; if (m[4]) return 'hunting'; return 'farming'; };
  const links = new Map();
  for (const [id, got] of Object.entries(j.obtained)) {
    const use = j.used[id];
    if (!use) continue;
    for (const a of got.via) for (const b of use.via) {
      const from = skillOfLabel(a), to = /^worn$|used on a hunt/.test(b) ? 'combat' : skillOfLabel(b);
      if (!from || !to || from === to) continue;
      const k = from + ' -> ' + to;
      if (!links.has(k)) links.set(k, []);
      if (links.get(k).length < 4 && !links.get(k).includes(id)) links.get(k).push(id);
    }
  }
  const chains = [...links.entries()].map(([k, ids]) => ({ link: k, via: ids }));

  /* STALLS: the brain's own (nothing sensible to do), plus every skill whose every try the server refused (a dead end) */
  const stalls = j.stalls.map((s) => ({ kind: 'nothing to do', ...s }));
  for (const sk of skills) {
    if (sk.trained) continue;
    const keys = trainingKeys(map, sk.id);
    const no = j.refusals.filter((r) => keys.has(String(r.action).split(' ').slice(1).join(' ')));
    if (no.length) stalls.push({ kind: 'blocked', skill: sk.id, hour: no[0].hour, hero: no[0].hero, why: 'no way to train ' + sk.name + ': every try was refused ("' + [...new Set(no.map((r) => r.error))].join('", "') + '")' });
  }

  /* PACE: hours to each Level against LEVEL_PACE (its targets are hunting hours of a hero hunting where the game recommends) */
  const target = (L) => (L === LEVEL_PACE.early.level ? LEVEL_PACE.early.hours : (LEVEL_PACE.targets.find((t) => t[0] === L) || [])[1] || null);
  const pace = heroes.filter((h) => h.focus !== 'crafter').map((h) => ({ hero: h.name,
    levels: firstAt(j.samples, h.name, (x) => x.level, [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 25, 30, 40, 50]).map((x) => ({ ...x, target: target(x.level) })) }));

  const counts = (list, pred) => ({ done: list.filter(pred).length, of: list.length });
  return {
    commit: commit(), when: new Date().toISOString(), gameHours: r1(run.gameHours), wallSeconds: Math.round(run.wallMs / 1000), bootSeconds: Math.round((run.bootMs || 0) / 1000),
    heroes,
    summary: {
      skills: counts(skills, (s) => s.trained), grounds: counts(grounds.flatMap((g) => g.tiers), (t) => t.reached),
      items: counts(items.filter((i) => i.paperDoor), (i) => i.status === 'reached and used'),
      itemsReached: counts(items.filter((i) => i.paperDoor), (i) => i.status !== 'never reached'),
      recipes: counts(recipes, (r) => r.made), nodes: counts(nodes, (n) => n.worked), monsters: counts(monsters, (m) => m.kills > 0), sinks: counts(sinks, (s) => s.bought),
    },
    skills, grounds, items, recipes, nodes, monsters, sinks, pace, stalls, chains,
    refusals: groupRefusals(j.refusals), pages: j.notes, actions: j.actions.length, route: j.actions,
    targets: { levelPace: LEVEL_PACE.targets.slice(0, 3), early: LEVEL_PACE.early, xpVsContract: BALANCE_SHEET.normal.xpVsContract },
  };
}

/** The report, with the server's kill counts and each hero's next costs (read-only reads). */
export async function buildReport({ world, map, run, finals }) {
  const kills = {};
  for (const c of run.crew) {
    for (const r of (await world.db.query('select monster_id, kills::int as kills from public.hr_bestiary_of($1, 0)', [c.uid])).rows) kills[r.monster_id] = (kills[r.monster_id] || 0) + r.kills;
  }
  return verdicts({ map, run, kills, finals });
}

/** What the server says the hero's next steps cost (its own envelope: depot.next, the home's rooms, the land's upgrade, a hero slot). */
export function nextCostsOf(env) {
  const out = [];
  const words = (o) => (o.gold ? o.gold + ' gold' : '') + (o.items ? Object.entries(o.items).map(([id, n]) => ', ' + n + ' ' + id).join('') : '');
  if (env && env.depot && env.depot.next) out.push({ what: 'storage chest ' + env.depot.next.name, cost: words(env.depot.next), can: env.depot.next.can_build === true, why: env.depot.next.why || null });
  if (env && env.home && Array.isArray(env.home.rooms)) for (const r of env.home.rooms) if (r && r.next) out.push({ what: r.name + ': ' + r.next.name, cost: words(r.next), can: null });
  if (env && env.farm_land && env.farm_land.upgrade) out.push({ what: 'farm plot level ' + env.farm_land.upgrade.level, cost: env.farm_land.upgrade.gold + ' gold, ' + env.farm_land.upgrade.deeds + ' deed(s), Farming ' + env.farm_land.upgrade.farming, can: null });
  if (env && env.account && env.account.hero_slot_offer) out.push({ what: 'hero slot ' + (env.account.hero_slot_offer.slot_id + 1), cost: env.account.hero_slot_offer.cost_gold + ' gold', can: null });
  return out;
}

function groupRefusals(list) {
  const by = new Map();
  for (const r of list) {
    const k = r.action + ' -> ' + r.error;
    const row = by.get(k) || { what: r.action, error: r.error, times: 0, first: r.hour, hero: r.hero, body: r.body };
    row.times++;
    by.set(k, row);
  }
  return [...by.values()].sort((a, b) => b.times - a.times || a.first - b.first);
}

/** The plain-English summary (coverage.md). */
export function reportText(R) {
  const L = [];
  const pct = (c) => c.done + ' of ' + c.of;
  L.push('# Coverage bot: ' + R.gameHours + ' in-game hours, ' + R.heroes.length + ' hero(es), build ' + R.commit);
  L.push('');
  L.push('Wall clock ' + R.wallSeconds + ' s of play (' + R.bootSeconds + ' s to open the world). ' + R.actions + ' actions.');
  for (const h of R.heroes) L.push('- ' + h.name + ' (' + h.way + (h.focus === 'crafter' ? ', crafter' : '') + '): Level ' + h.level + ', ' + h.gold + ' gold, ' + h.huntHours + ' h hunting.');
  L.push('');
  L.push('## 1. Coverage');
  const S = R.summary;
  L.push('Skills trained ' + pct(S.skills) + '. Grounds and tiers reached ' + pct(S.grounds) + '. Items reached ' + pct(S.itemsReached) + ', reached and used ' + pct(S.items) + ' (of the items the data gives a door).');
  L.push('Recipes made ' + pct(S.recipes) + '. Gathering nodes and crops worked ' + pct(S.nodes) + '. Bestiary entries met ' + pct(S.monsters) + '. Sinks and purchases bought ' + pct(S.sinks) + '.');
  L.push('');
  L.push('### Skills');
  for (const s of R.skills) L.push('- ' + s.name + ': level ' + s.level + (s.cap ? ' of ' + s.cap : '') + (s.marks.length ? ' (' + s.marks.map((m) => m.level + ' at ' + m.hour + ' h').join(', ') + ')' : '') + (s.trained ? '' : '. NEVER TRAINED'));
  L.push('');
  L.push('### Grounds');
  const words = (t) => (t.size > 1 ? 'a party of ' + t.size + ' ' : '') + 'first at ' + t.firstHour + ' h at Level ' + t.level + ', ' + t.hours + ' h to Level ' + t.lastLevel + ', ' + t.deaths + ' death(s)'
    + (t.xpPerH ? ', ' + t.xpPerH + ' Level XP/h a head (pace contract ' + t.contract + ')' : '') + (t.netPerH !== null && t.netPerH !== undefined ? ', coin less store bill ' + t.netPerH + ' g/h a head' : '');
  for (const g of R.grounds) {
    L.push('- ' + g.name + ' (Levels ' + g.band.join('-') + (g.party ? ', a party ground' : '') + '): ' + g.tiers.map((t) => !t.reached ? t.tier + ' never reached'
      : t.tier + ' ' + words(t) + (t.party && t.party !== t && t.size === 1 ? '; and ' + words(t.party) : '')).join('; '));
  }
  L.push('');
  const never = R.items.filter((i) => i.status === 'never reached');
  const unused = R.items.filter((i) => i.status === 'reached, never used');
  L.push('### Items');
  L.push('Reached and used: ' + R.items.filter((i) => i.status === 'reached and used').length + '. Reached, never used: ' + unused.length + '. Never reached (the data has a door): ' + never.length + '. No door on paper: ' + R.items.filter((i) => i.status === 'no door on paper').length + '.');
  if (unused.length) L.push('Reached, never used: ' + unused.slice(0, 40).map((i) => i.id + ' (' + i.via[0] + ')').join(', ') + (unused.length > 40 ? ' and ' + (unused.length - 40) + ' more' : ''));
  L.push('');
  L.push('### Recipes, nodes, bestiary, sinks');
  L.push('Made: ' + (R.recipes.filter((r) => r.made).map((r) => r.id).join(', ') || 'none'));
  L.push('Worked: ' + (R.nodes.filter((n) => n.worked).map((n) => n.id).join(', ') || 'none'));
  L.push('Met: ' + (R.monsters.filter((m) => m.kills).map((m) => m.id + ' ' + m.kills).join(', ') || 'none'));
  L.push('Bought: ' + (R.sinks.filter((s) => s.bought).map((s) => s.id).join(', ') || 'none'));
  L.push('');
  L.push('### How the skills fed each other (as played)');
  for (const c of R.chains) L.push('- ' + c.link + ': ' + c.via.join(', '));
  if (!R.chains.length) L.push('No item made by one skill was spent by another.');
  L.push('');
  L.push('## 2. Stalls and refusals');
  if (!R.stalls.length) L.push('No stall: the brain always had a sensible next step.');
  for (const s of R.stalls.slice(0, 20)) L.push('- ' + (s.kind === 'blocked' ? 'BLOCKED ' : '') + s.hour + ' h, ' + s.hero + ': ' + s.why + (s.state ? ' (Level ' + s.state.level + ', ' + s.state.gold + ' gold, ' + s.state.staminaMin + ' min stamina)' : ''));
  for (const r of R.refusals.slice(0, 25)) L.push('- refused ' + r.times + 'x, first at ' + r.first + ' h: ' + r.what + ': "' + r.error + '"');
  for (const h of R.heroes) for (const n of (h.next || []).slice(0, 8)) L.push('- next for ' + h.name + ': ' + n.what + ' costs ' + n.cost + (n.can === false ? ' (not yet: ' + (n.why || 'short') + ')' : ''));
  L.push('');
  L.push('## 3. Pace');
  L.push('Hours are in-game; in brackets the hunting hours, which is what LEVEL_PACE\'s targets count (src/data/core-model.js).');
  for (const p of R.pace) L.push('- ' + p.hero + ': ' + p.levels.map((x) => 'L' + x.level + ' at ' + x.hour + ' h' + (x.huntH !== null && x.huntH !== undefined ? ' (' + x.huntH + ' h hunting)' : '')
    + (x.target ? ' target ' + (Array.isArray(x.target) ? x.target.join('-') : x.target) + ' h' : '')).join(', '));
  L.push('');
  L.push('## Page checks (the browser against the server)');
  for (const n of R.pages) L.push('- ' + r1(n.hour) + ' h ' + n.hero + ' ' + n.page + ': ' + (n.failed ? 'FAILED ' + n.failed : 'Level ' + (n.levelShown ? 'shown' : 'NOT SHOWN') + ', gold ' + (n.goldShown ? 'shown' : 'NOT SHOWN')
    + ', ' + n.stacks + ' stacks' + (n.off && n.off.length ? ', COUNTS DIFFER: ' + n.off.slice(0, 3).join('; ') : '') + (n.missing && n.missing.length ? ', MISSING: ' + n.missing.slice(0, 5).join(', ') : '') + (n.errors && n.errors.length ? ', console: ' + n.errors.slice(0, 2).join(' | ') : '')));
  return L.join('\n') + '\n';
}
