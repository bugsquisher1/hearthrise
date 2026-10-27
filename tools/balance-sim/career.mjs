// tools/balance-sim/career.mjs — A HERO'S LIFE ON THE REAL ENGINE: from a Level to a Level, hour by hour.
//
// The cells measure a hero dropped in at Level L with every combat skill at L. A career measures what a player
// actually lives: the hero starts at `startLevel` with the skills that Level's XP brought, hunts one chunk at a time
// where THE GAME ITSELF recommends (src/shell/hunt-list.js recommendedHunt, the Hunts window's default pick: never a
// party ground for a lone hero while a solo one exists), wears the best gear its Level may wear and a player can get
// (gear.mjs), and carries its Level XP and skill XP from chunk to chunk, less what each death took back
// (src/core/action-rules.js deathXpLoss, priced by the engine). The answer is hours to every Level, the skills the
// hero really has at each Level, and the ground it stood on: the ruling's §2 table measured, not modelled.
// The `policy` 'best' variant instead picks, per chunk, the ground in `grounds` whose last chunk paid the most XP.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const COMBAT = ['melee', 'ranged', 'magic', 'defense', 'prayer'];

/**
 * job = { id, party: [style], startLevel (1), targetLevel, maxHours, chunkH (1), density (null = as built),
 *         seed (0), root (the repo, for the recommendation module) } -> the career's trace and milestones.
 * `chunkByLevel` [[fromLevel, hours], ...] (ascending) overrides chunkH by the party's lowest Level: short chunks
 * while Levels come in minutes (the first hour), so each Level's XP an hour is read on the ground it was earned on.
 */
export function runCareer(R, job) {
  const XP = R.XP;
  const rec = job.recommend;   // injected by careerRunner below (the shell module loads once per process)
  const n = job.party.length;
  const seats = job.party.map(() => ({ levelXp: XP.charXpForLevel(job.startLevel || 1), skills: {} }));
  const trace = [];
  const milestones = {};
  let hours = 0, chunk = 0;
  const lv = (s) => XP.charLevelFromXp(s.levelXp);
  const chunkOf = (L) => {
    let h = job.chunkH || 1;
    for (const [from, ch] of job.chunkByLevel || []) if (L >= from) h = ch;
    return h;
  };
  while (hours < job.maxHours && Math.min(...seats.map(lv)) < job.targetLevel) {
    const levels = seats.map(lv);
    const chunkH = chunkOf(Math.min(...levels));
    const ground = job.ground || rec(levels, n);
    const cell = { id: job.id + ':' + chunk, ground, party: job.party, startBySeat: seats.map((s) => ({ levelXp: s.levelXp, skills: { ...s.skills } })),
      hours: chunkH, seeds: 1, seedBase: (job.seed || 0) * 100000 + chunk, segmentH: chunkH, windowMs: 600000,
      ...(Number.isInteger(job.density) ? { density: job.density } : {}), ...(job.gear ? { gear: job.gear } : {}) };
    const m = R.runCell(cell);
    const h = m.party.hours;
    const before = seats.map((s) => s.levelXp);
    m.heroes.forEach((x, i) => {
      const s = seats[i];
      s.levelXp = Math.max(XP.charXpForLevel(lv(s)), s.levelXp + x.raw.levelXp - x.raw.xpLostLevel);
      for (const k of Object.keys({ ...x.raw.skillXp, ...x.raw.xpLostSkill })) {
        s.skills[k] = Math.max(0, (s.skills[k] || 0) + (x.raw.skillXp[k] || 0) - (x.raw.xpLostSkill[k] || 0));
      }
    });
    /* a Level crossed inside the chunk is dated by linear interpolation of the chunk's XP */
    seats.forEach((s, i) => {
      for (let L = XP.charLevelFromXp(before[i]) + 1; L <= lv(s); L++) {
        const need = XP.charXpForLevel(L);
        const f = s.levelXp > before[i] ? (need - before[i]) / (s.levelXp - before[i]) : 1;
        const key = i + ':' + L;
        if (milestones[key] === undefined) milestones[key] = Math.round((hours + f * h) * 100) / 100;
      }
    });
    hours += h;
    trace.push({ chunk, hours: Math.round(hours * 100) / 100, ground, levels, deaths: m.heroes.map((x) => x.deaths),
      xpPerH: m.heroes.map((x) => x.levelXpPerH), profitPerH: m.heroes.map((x) => x.profitPerH),
      skills: seats.map((s) => Object.fromEntries(COMBAT.map((k) => [k, XP.skillLevelFromXp(k, s.skills[k] || 0)]))) });
    chunk++;
  }
  return { id: job.id, kind: 'career', party: job.party, ...(Number.isInteger(job.density) ? { density: job.density } : {}), startLevel: job.startLevel || 1, targetLevel: job.targetLevel, hours: Math.round(hours * 100) / 100,
    reached: seats.map(lv), milestones, trace };
}
