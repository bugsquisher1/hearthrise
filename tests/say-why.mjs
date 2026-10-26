#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/say-why.mjs — IF THE PLAYER TRIES SOMETHING AND CAN'T, THE GAME SAYS WHY.
//
// Tyler 10-25: "clicking 'cook all' when I don't have the skill doesn't tell me
// why it's not cooking it. This needs to be a theme across the game." The item
// menu's Cook all was greyed with no words (the bag's own pre-check knew the
// reason and only the main button said it). The class has two halves:
//
//   SW-1 EVERY INTENT SITE SPEAKS (static). Every call in src/shell/** and
//        src/app/** to an intent (a CharacterSession method that asks the server,
//        or an export of src/session/*-intents.js) has a speaker beside it
//        (runIntent, refusalText, refusalWords, or a same-file wrapper of one), or
//        hands its answer up to a function whose callers do. A site that drops the
//        refusal is red BY NAME.
//   SW-2 EVERY CONTROL THAT IS OFF FOR A RULE SAYS SO (static). Every `disabled`
//        whose condition is more than "a press is in flight" is listed in REASONS
//        with the visible words that say why (not a title: phones have no hover),
//        and those words must still be in its file. A new rule-disabled control
//        with no entry is red; deleting its words is red.
//   SW-3 THE WORDS ARE THE SERVER'S NUMBERS (pure). A bench above the skill says
//        "You need Cooking 40 to cook Raw Bear Meat. You have 11." from the
//        catalogue and the server's level, both from the client's pre-check and
//        from the engine's activity_locked; a hunt's activity_locked says the
//        floor and the hero's Level from the refusal itself.
//   SW-4 ON SCREEN (play.html, stubbed server): the item menu's Cook all is off
//        WITH its visible line; a Shop buy short of gold says how much more; a
//        locked hunt's Enter answer names the Level. `--shots <dir>` saves each at
//        1440×900 and 844×390.
//
//   node tests/say-why.mjs                   the rules
//   node tests/say-why.mjs --shots <dir>     the rules + screenshots
//   node tests/say-why.mjs --mutate          every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/shop.js src/shell/windows/inventory/actions.js src/shell/town-work.js src/session/refusal.js src/shell/intent-words.js src/shell/windows/services.js src/styles/windows.css
// ════════════════════════════════════════════════════════════════════════
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const ARGS = process.argv.slice(2);
const SHOTS = ARGS.includes('--shots') ? ARGS[ARGS.indexOf('--shots') + 1] : null;
const clone = (o) => JSON.parse(JSON.stringify(o));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Every file the guard reads, as text (a mutant replaces one). */
async function sources(over) {
  const files = {};
  for (const f of [...await walk('src/shell'), ...await walk('src/app'), ...await walk('src/session')]) {
    files[f] = over && over[f] !== undefined ? over[f] : (await readFile(join(ROOT, f), 'utf8')).replace(/\r\n/g, '\n');
  }
  return files;
}

/* ── SW-1 ─────────────────────────────────────────────────────────────── */
const SPEAK = ['runIntent', 'refusalText', 'refusalWords'];
/* Calls that are not a player's action (nothing to refuse to a press), each with why. */
const QUIET = Object.freeze({
  settleTownActivity: 'a best-effort collect before a start; the start itself is the intent that answers',
  "edgeIntent('sheet'": 'the Character window asks for its sheet on opening; a read, never a press',
  'stopWork(cs, send)).then': 'the armed stop (town-work.js) answers through the `send` its start was given: the window\'s runIntent',
});
const RESERVED = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return']);

/** The CharacterSession methods that ask the server, and every export of src/session/*-intents.js. */
function intentNames(files) {
  const names = new Set();
  const cs = files['src/session/character-session.js'];
  const heads = [...cs.matchAll(/^ {2}(?:async )?([a-zA-Z]\w*)\([^)]*\) \{/gm)];
  heads.forEach((m, i) => {
    const body = cs.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : cs.length);
    if (!RESERVED.has(m[1]) && /this\._ask\(|this\.intents\.track\(|this\._server\.rpc\(/.test(body)) names.add(m[1]);
  });
  names.add('edgeIntent');
  for (const [f, t] of Object.entries(files)) {
    if (!/^src\/session\/[\w-]+-intents\.js$/.test(f)) continue;
    for (const m of t.matchAll(/^export (?:async )?function (\w+)/gm)) names.add(m[1]);
  }
  for (const q of ['load', 'hello', 'connect', 'flushResidue']) names.delete(q);
  return names;
}

/* The top-level declaration a line belongs to: its name, or null. */
function ownerOf(lines, i) {
  for (let j = i; j >= 0; j--) {
    const m = /^(?:export )?(?:async )?function (\w+)|^(?:export )?const (\w+) = |^([\w.]+) = (?:async )?function/.exec(lines[j]);
    if (m) return m[1] || m[2] || m[3];
  }
  return null;
}

/** SW-1: [{ at, why }] for every intent call whose refusal reaches no words. */
export function silentSites(files) {
  const names = intentNames(files);
  const out = [];
  const callers = Object.entries(files).filter(([f]) => f.startsWith('src/shell/') || f.startsWith('src/app/'));
  /* Same-file wrappers of a speaker speak too (actions.js send, alerts.js settle), to a fixed point. */
  const speakersOf = (t) => {
    const lines = t.split('\n');
    const sp = new Set(SPEAK);
    for (let grew = true; grew;) {
      grew = false;
      lines.forEach((l, i) => {
        const re = new RegExp('\\b(' + [...sp].join('|') + ')\\(');
        if (!re.test(l) || /^\s*(\/\/|\/\*|\*)/.test(l)) return;
        const o = ownerOf(lines, i);
        if (o && !o.includes('.') && !sp.has(o)) { sp.add(o); grew = true; }
        /* a local wrapper: `const send = (fn, busy, done) => runIntent(sc, repaint, fn, busy, done);` */
        const local = /\bconst (\w+) = (?:async )?\([^)]*\) => /.exec(l);
        if (local && !sp.has(local[1])) { sp.add(local[1]); grew = true; }
      });
    }
    return sp;
  };
  const passed = new Set(names);
  const work = [...names];
  const seen = new Set();
  while (work.length) {
    const name = work.shift();
    for (const [f, t] of callers) {
      const lines = t.split('\n');
      const sp = speakersOf(t);
      /* a speaker called, or handed in as the call's own sender (`stopWork(cs, send)`) */
      const speakRe = new RegExp('\\b(' + [...sp].join('|') + ')(\\(|\\s*[,)])');
      const callRe = new RegExp('(?:\\.|\\b)' + name + '\\(', 'g');
      lines.forEach((l, i) => {
        if (/^\s*(\/\/|\/\*|\*)/.test(l) || /^(?:export )?(?:async )?function /.test(l) || /^import /.test(l)) return;
        for (const m of l.matchAll(callRe)) {
          const pre = l.slice(0, m.index).replace(/[\w$.]+$/, '');   // without the receiver (`cs`, `st.cs`, `target`)
          if (name !== 'edgeIntent' && !names.has(name) && /function\s*$/.test(pre)) continue;
          const key = f + ':' + (i + 1) + ':' + name;
          if (seen.has(key)) continue;
          seen.add(key);
          if (Object.entries(QUIET).some(([k]) => (k === name) || l.includes(k))) continue;
          const near = lines.slice(Math.max(0, i - 2), i + 7).join('\n');
          if (speakRe.test(near)) continue;
          /* The answer handed up: its owner is an intent for ITS callers. */
          /* handed up = returned itself (`return cs.x(…)`, `=> cs.x(…)`), or held in a name that is returned
             (`const a = await cs.x(…); if (!a.ok) return a;`) */
          const after = lines.slice(i, i + 4).join('\n');
          const held = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?$/.exec(pre);
          const owner = ownerOf(lines, i);
          if (/\breturn\s+(?:await\s+)?$/.test(pre) || /=>\s*(?:await\s+)?$/.test(pre)
            || (held && new RegExp('\\breturn\\b[^;\\n]*\\b' + held[1] + '\\b').test(after))) {
            if (owner && !owner.includes('.') && !passed.has(owner)) { passed.add(owner); work.push(owner); continue; }
            if (owner && passed.has(owner)) continue;
          }
          out.push({ at: f + ':' + (i + 1), why: name + '() answers a refusal nobody shows (no runIntent/refusalText/refusalWords beside it)' });
        }
      });
    }
  }
  /* Never blind: the shell sends ~50 intents from ~25 files (2026-10-25). */
  if (seen.size < 40) out.push({ at: 'src/shell', why: 'only ' + seen.size + ' intent call sites found: the scan is blind' });
  /* A function the answer was handed up to must have a caller that speaks or hands it on (else it is dropped there). */
  for (const name of passed) {
    if (names.has(name)) continue;
    const called = callers.some(([, t]) => new RegExp('(?:\\.|\\b)' + name + '\\((?!.*\\{\\s*$)').test(t.replace(new RegExp('function ' + name + '\\(', 'g'), '')));
    if (!called) out.push({ at: name, why: 'hands a refusal up but nothing calls it' });
  }
  return out;
}

/* ── SW-2 ─────────────────────────────────────────────────────────────── */
/* A condition that only says "a press is in flight" (its own busy line says so). */
const BUSY = /!?\(?\b(?:st\.|sc\.|s\.|o\.|a\.|party\.|st\.sc\.)*(?:pending|sending|confirm|leaving|over)\b\)?|\b\w+\([\w.]*\)\.pending\b|PENDING\.has\(\w+\)|RENAMING\.has\(\w+\)|\bv\.off\b|\boff\b(?!\()/g;

/**
 * Every control that is off for a RULE, by file: the condition's text (a substring) and the words on screen that say
 * why, which must be in the file. `where` names where they show. The report's table is this list.
 */
export const REASONS = Object.freeze({
  'src/shell/windows/inventory/actions.js': [
    { cond: 'on && !sc.pending', words: "'<small class=\"hw-mi-why\" data-why=\"'", where: 'every item-menu entry that is off: its own line under it (Cook all, Equip, Sell, Lock, Put on the bar, Link in chat)' },
  ],
  'src/shell/windows/inventory/grid.js': [
    { cond: '!prim || !!wearWhy', words: 'wearWhy || buryWhy', where: 'the picked stack\'s line (.hw-pick-why): Equip\'s and Cook all\'s reason' },
    { cond: '!st.shop', words: "'Reading the shop prices…'", where: 'Sell selected / Sell all: off only before the shop section loads; the tools row value line says so' },
    { cond: 'sc.pending || !!dWhy', words: "whyLine(root.querySelector('.hw-dispatch-why'), onBag ? dWhy : '', false);", where: 'Dispatch loot: its own line under the tools row (out hunting, nothing planned, reading the bag)' },
    { cond: '!!why', words: "(offWhy ? ' · ' + offWhy : '')", where: 'the This hunt row: a plan the server refuses for the item (starting kit, no shop price) is said on the row line' },
    { cond: 'sc.confirm.empty', words: 'hw-confirm-note', where: 'the confirmation lists what is kept' },
    { cond: '!st.rules', words: "'Loot plans switch on when the server starts keeping them.'", where: 'the This hunt tab: the plan select is off before bag_rules loads and the tab note says so' },
    { cond: '!cur', words: "cls(pick, 'is-on', !!cur)", where: 'More sits on the picked line, which shows only with a stack picked' },
  ],
  'src/shell/windows/inventory/doll.js': [
    { cond: '!worn || locked', words: 'GEAR_HUNT_WORDS.one', where: 'the slot line says a hunt is running' },
    { cond: 'locked || short', words: "text(li.querySelector('.hw-fit-need'), short ? need.text : '')", where: 'the fit row\'s need line ("Needs Level 30 — you\'re 28")' },
  ],
  'src/shell/windows/shop.js': [
    { cond: 'short > 0', words: "' · You need ' + gold(short) + ' more.'", where: 'the offer row: "You need 40 gp more."' },
    { cond: 'isLocked', words: "isLocked ? 'Locked'", where: 'the button reads Locked and the row says locked' },
    { cond: '!plan.lines.length', words: "'Sell all loot'", where: 'the label carries the total only when there is loot' },
  ],
  'src/shell/windows/storage.js': [
    { cond: 'sc.pending || !!dWhy', words: "text(root.querySelector('.hw-store-do .hw-why'), away ? '' : dWhy);", where: 'Dispatch loot in Storage: its own line (the store note says a hunt)' },
  ],
  'src/shell/windows/services.js': [
    { cond: '!canStam', words: "' You need ' + gold(q.price - purse) + ' more.'", where: 'the stamina quote line: full, all bought today, or how much more gold' },
    { cond: 't.held || !next', words: "' · You need ' + gold(short) + ' more.'", where: 'each blessing row: Owned, Needs I, or how much more gold' },
  ],
  'src/shell/widgets/stamina-buy.js': [
    { cond: '!!why', words: ".hb-buy-why'), why", where: 'the bar\'s refill panel line' },
  ],
  'src/shell/widgets/upgrade-line.js': [
    { cond: '!show || !!opt.locked', words: 'GEAR_HUNT_WORDS.upgrades', where: 'the upgrade line\'s why' },
  ],
  'src/shell/windows/hunts.js': [
    { cond: 'follower', words: "'Your party leader picks the hunt and starts it.", where: 'the page lead for a party member' },
    { cond: 'dn.now <= DENSITY_PICK.min', words: "'Up to ' + dn.max + ' a pull'", where: 'the density note states the bounds' },
    { cond: '!!now', words: 'carriedWords(carried)', where: 'a running hunt: the page says what it carries; the top bar has Leave' },
  ],
  'src/shell/windows/hunt-detail.js': [
    { cond: 'v.partyBlock.full', words: 'v.partyBlock.why', where: 'the party block says the party\'s size' },
  ],
  'src/shell/windows/hunt-summary.js': [
    { cond: 'huntOpen || !again', words: "'Hunt again is off: a hunt is already running.'", where: 'the summary\'s line under its buttons' },
  ],
  'src/shell/windows/hunt-prep.js': [
    { cond: '!presets || full || hunting', words: "' setup slots are used. Delete one to save a new setup.'", where: 'the window line (full), the town-only note (hunting), the none line (no presets)' },
    { cond: 'sc.pending || hunting', words: "Setups change in town.", where: 'the town-only note' },
  ],
  'src/shell/windows/characters.js': [
    { cond: "x.slot === ctx.character.slot || !ctx.goTo", words: "'On screen'", where: 'the button reads On screen' },
    { cond: '!can', words: "' You have ' + gold(purse) + '.'", where: 'the rename quote: price, why not available, or the gold you have' },
  ],
  'src/shell/windows/character/outfit.js': [
    { cond: '!owned || !changed', words: "'Premium · not owned'", where: 'the outfit tile says not owned; Save needs a change' },
  ],
  'src/shell/windows/house.js': [
    { cond: '!on', words: "(you have '", where: 'each step\'s cost lines mark what is short, with your counts' },
  ],
  'src/shell/windows/tally.js': [
    { cond: '!!why || st.sc.pending || st.hunting', words: "': take tasks when you are back in town.'", where: 'the button reads Held / Full; hunting says the board is in town' },
    { cond: 'order.indexOf(s) === 0', words: '(the first cannot move up)', where: 'the first slot has nothing to move above (its button reads Earlier)' },
    { cond: '!t', words: "'Loading her board…'", where: 'the board says it is loading' },
  ],
  'src/shell/windows/work.js': [
    { cond: '(!running && !!why)', words: ".hw-work-why'), why", where: 'the row\'s own line (workBlock: "You need Smithing 3 to make Bronze Axe. You have 1.")' },
    { cond: 'running', words: "'Working on it now · '", where: 'the row says it is running' },
  ],
  'src/shell/windows/party-finder.js': [
    { cond: 'inParty', words: "'You are in a party. Leave it to join another.'", where: 'the finder line' },
  ],
  'src/shell/windows/party.js': [],
  'src/shell/windows/chat.js': [
    { cond: '!can', words: "placeholder", where: 'the field\'s placeholder says what the tab is for (a read-only tab has no send)' },
  ],
  'src/shell/windows/report.js': [
    { cond: "!box.value.trim() || !ctx.account", words: 'placeholder', where: 'the empty box asks for words' },
  ],
  'src/shell/windows/friends.js': [
    { cond: '!e || !!e.off', words: 'e.label', where: 'an off entry reads its reason as its label' },
  ],
  'src/shell/widgets/party-hold.js': [],
  'src/shell/widgets/party-leave.js': [
    { cond: '!own', words: "prop(label, 'hidden', !own)", where: 'hidden, not off, for anyone but its own seat' },
  ],
  'src/shell/widgets/hunt-topbar.js': [],
  'src/shell/context-menu.js': [
    { cond: 'e.off', words: "typeof off === 'string' && off ? off", where: 'an off entry reads its reason as its label ("Party full")' },
  ],
  'src/shell/hud.js': [
    { cond: 'row.removable', words: 'hs-hudset-show', where: 'a fixed widget\'s box (cannot be hidden by design; the row is labelled)' },
  ],
  'src/app/slot-offer.js': [
    { cond: 'short > 0', words: "You need ' + whole(short) + ' more gold.", where: 'the offer block' },
  ],
  /* Other lanes own these files right now (lane/a-v0246-followups); listed as they stand, see the report. */
  'src/shell/windows/farm.js': [
    { cond: '!r.why', words: 'r.why', where: 'the crop row\'s own why' },
    { cond: '!verb', words: 'verb', where: 'the plot says what it needs' },
    { cond: 'st.farming < up.farming || !afford', words: "', at Farming '", where: 'the tier line names the price and Farming level (OPEN: does not say which is short)' },
  ],
  'src/shell/windows/configure-action.js': [
    { cond: 'off', words: "'Your weapon can’t shoot this'", where: 'a locked supply: title only (OPEN: other lane)' },
    { cond: 'MAX_CONDITIONS', words: 'MAX_CONDITIONS', where: 'the conditions list (OPEN: no words at the cap)' },
    { cond: 'd.action.id', words: 'd.action.id', where: 'Save needs an action picked' },
    { cond: 's.open', words: 's.open', where: 'move up/down at the ends' },
  ],
  'src/shell/widgets/settings-intent.js': [
    { cond: 'v === null', words: 'v === null', where: 'an option the server has not sent' },
  ],
  'src/shell/widgets/alerts.js': [
    { cond: '!a.session', words: 'refusalWords', where: 'a restart with no session' },
  ],
  'src/shell/widgets/action-bar.js': [
    { cond: '!s', words: '!s', where: 'the rename box before the settings load' },
  ],
});

/** The condition of each `disabled` site: [{ at, file, cond }]. */
function disabledSites(files) {
  const out = [];
  for (const [f, t] of Object.entries(files)) {
    if (!(f.startsWith('src/shell/') || f.startsWith('src/app/'))) continue;
    t.split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(l)) return;
      for (const m of l.matchAll(/prop\(([^,]+), 'disabled', (.+?)\);/g)) out.push({ at: f + ':' + (i + 1), file: f, cond: m[2] });
      for (const m of l.matchAll(/\(([^()]*(?:\([^()]*\)[^()]*)*) \? ' disabled' : ''\)/g)) out.push({ at: f + ':' + (i + 1), file: f, cond: m[1] });
      if (/' disabled'/.test(l) && !/\? ' disabled' : ''/.test(l) && !/\(on && !sc\.pending \? '' : ' disabled'\)/.test(l)) out.push({ at: f + ':' + (i + 1), file: f, cond: l.trim() });
      if (/\(on && !sc\.pending \? '' : ' disabled'\)/.test(l)) out.push({ at: f + ':' + (i + 1), file: f, cond: 'on && !sc.pending' });
    });
  }
  return out;
}

/** SW-2: [{ at, why }]. */
export function unsaidOff(files) {
  const out = [];
  for (const s of disabledSites(files)) {
    const rest = s.cond.replace(BUSY, '').replace(/[\s|&!()]+/g, '').replace(/^true$|^false$/, '');
    if (!rest) continue;
    const reg = (REASONS[s.file] || []).find((r) => s.cond.includes(r.cond));
    if (!reg) { out.push({ at: s.at, why: 'off for a rule (' + s.cond.slice(0, 80) + ') with no visible reason listed in REASONS' }); continue; }
  }
  for (const [f, regs] of Object.entries(REASONS)) {
    const t = files[f];
    if (t === undefined) { out.push({ at: f, why: 'REASONS names a file that is gone' }); continue; }
    for (const r of regs) if (!t.includes(r.words)) out.push({ at: f, why: 'the words that say why "' + r.cond + '" is off are gone (' + r.where + ')' });
  }
  return out;
}

/* ── SW-3 ─────────────────────────────────────────────────────────────── */
async function pure(base = ROOT) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const { buryRecipeOf, buryBlock } = await imp('src/shell/windows/inventory/bury.js');
  const { startWork, workRow, workBlock } = await imp('src/shell/town-work.js');
  const { runIntent, refusalText } = await imp('src/shell/intent-words.js');
  const { refusalOf } = await imp('src/session/refusal.js');
  const read = (lv, inv) => (k) => (k === 'skills' ? { cooking: { xp: 0, level: lv }, smithing: { xp: 0, level: lv } } : k === 'inventory' ? inv : k === 'state' ? { active_kind: 'idle', active_id: null } : null);
  const bear = buryBlock({ read: read(11, { raw_bear_meat: 2 }) }, buryRecipeOf('raw_bear_meat'));
  if (bear !== 'You need Cooking 40 to cook Raw Bear Meat. You have 11.') fails.push('SW-3 Cook all above the level reads ' + JSON.stringify(bear));
  const axe = workBlock({ read: read(1, {}) }, workRow('artisan', 'forge_bronze_axe'), false);
  if (axe !== 'You need Smithing 3 to make Bronze Axe. You have 1.') fails.push('SW-3 a bench row above the level reads ' + JSON.stringify(axe));
  /* The engine's own refusal of the same press (activity_locked), driven through the one start path. */
  const sc = { pending: false, msg: '' };
  const cs = { read: read(11, { raw_bear_meat: 2 }), edgeIntent: async () => refusalOf({ ok: false, body: { ok: false, error: 'activity_locked', kind: 'artisan', id: 'cook_bear_meat' } }) };
  await startWork(cs, workRow('artisan', buryRecipeOf('raw_bear_meat').recipe.id), (fn, busy, done) => runIntent(sc, () => {}, fn, busy, done, cs), () => {});
  if (sc.msg !== 'You need Cooking 40 to cook Raw Bear Meat. You have 11.') fails.push('SW-3 the engine\'s activity_locked on Cook all reads ' + JSON.stringify(sc.msg));
  const hunt = refusalText(refusalOf({ ok: false, body: { ok: false, error: 'activity_locked', id: 'mosslight_glade', combat_level: 3, band_min: 16, refuse_under: 5 } }));
  if (hunt !== 'You need Level 12 to enter Mosslight Glade. You are Level 3.') fails.push('SW-3 a locked hunt reads ' + JSON.stringify(hunt));
  const gate = refusalText(refusalOf({ ok: false, body: { ok: false, error: 'activity_locked', id: 'mosslight_glade', spawn_gate: true } }));
  if (!gate || /did not go through/.test(gate)) fails.push('SW-3 a spawn-gated hunt reads the fallback: ' + JSON.stringify(gate));
  return fails;
}

/* ── SW-4 ─────────────────────────────────────────────────────────────── */
async function screens(overrides) {
  const { chromium } = await import('playwright');
  const { leaseBrowser } = await import('./_chrome.mjs');
  const BASE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
  const town = (e) => {
    for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
    e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, gold: 50, level_xp: 0 });
    e.stamina = { ms: 1800000, at: e.now, max_ms: 28800000, hunting: false };
    e.inventory = Object.assign({}, e.inventory, { raw_bear_meat: 2 });
    e.shop = Object.assign({}, e.shop, { offers: [...e.shop.offers, { offer: 'gear.iron_helm', item: 'iron_helm', kind: 'gear', price: 400 }] });
    return e;
  };
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  if (SHOTS) await mkdir(join(ROOT, SHOTS), { recursive: true });
  try {
    for (const [w, h] of SHOTS ? [[1440, 900], [844, 390]] : [[1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(6000);
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      const s = { env: town(clone(BASE)), version: 1, enter: 0 };
      const hard = Object.values((await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href)).HUNT_INDEX).sort((a, b) => b.band[0] - a.band[0])[0];
      await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
      await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
      await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
        const name = r.request().url().split('?')[0].split('/').pop();
        const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
        if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
        /* the server's own refusal, as hr_hunt_enter sends it (hr_reject's detail merged into the body) */
        if (name === 'hr_hunt_enter') { s.enter++; return json({ ok: false, error: 'activity_locked', id: hard.id, combat_level: 1, band_min: hard.band[0], refuse_under: 5 }); }
        return json({ ok: true });
      });
      const shot = async (n) => { if (SHOTS) await page.screenshot({ path: join(ROOT, SHOTS, n + '-' + w + 'x' + h + '.png') }); };
      await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load', timeout: 30000 });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.click('[data-app="play"][data-slot="0"]');
      if (!(await wait(page, () => document.querySelector('.hs-launchers')))) { fails.push('SW-4 the game did not open'); await ctx.close(); continue; }
      const openWin = async (key, id) => {
        for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
          await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(160);
        }
        await page.keyboard.press(key);
        return wait(page, (x) => document.querySelector('[data-hs-win="' + x + '"] [data-hs-built]'), id, 3000);
      };
      /* (a) Cook all in the item menu, above the server's Cooking: off, with its own visible line. */
      if (!(await openWin('b', 'inventory'))) fails.push('SW-4 the bag did not open');
      else {
        const pocket = '[data-hs-win="inventory"] .hw-pocket[data-item="raw_bear_meat"]';
        if (!(await wait(page, (q) => document.querySelector(q), pocket, 3000))) fails.push('SW-4 the raw bear meat is not in the bag');
        else {
          await page.click(pocket, { button: 'right' });
          await page.waitForTimeout(250);
          const m = await page.evaluate(() => {
            const b = document.querySelector('.hw-menu.is-on [data-hs-act="m-bury"]');
            const why = document.querySelector('.hw-menu.is-on .hw-mi-why[data-why="m-bury"]');
            return { label: b && b.textContent, off: !!b && b.disabled, why: why && why.textContent, shown: !!why && why.getBoundingClientRect().height > 0 };
          });
          if (!m.label || !m.off || m.why !== 'You need Cooking 40 to cook Raw Bear Meat. You have 11.' || !m.shown) fails.push('SW-4 the item menu\'s Cook all reads ' + JSON.stringify(m));
          await shot('cook-all');
          await page.keyboard.press('Escape');
        }
        /* (a2) the loot plan on a starting-kit item: Sell off, its reason on its own visible line under it. */
        const kit = '[data-hs-win="inventory"] .hw-pocket[data-item="cooked_shrimp"]';
        if (!(await wait(page, (q) => document.querySelector(q), kit, 3000))) fails.push('SW-4 the cooked shrimp (starting kit) is not in the bag');
        else {
          await page.waitForTimeout(200);
          await page.click(kit, { button: 'right' });
          await page.waitForTimeout(250);
          const p = await page.evaluate(() => {
            const b = document.querySelector('.hw-menu.is-on [data-hs-act="m-rule"][data-rule="sell"]');
            const why = b && b.nextElementSibling && b.nextElementSibling.matches('.hw-mi-why') ? b.nextElementSibling : null;
            return { off: !!b && b.disabled, why: why && why.textContent, shown: !!why && why.getBoundingClientRect().height > 0 };
          });
          if (!p.off || p.why !== 'The shop does not buy back your starting kit.' || !p.shown) fails.push('SW-4 the loot plan\'s Sell on a starting-kit item reads ' + JSON.stringify(p));
          await shot('plan-kit-sell');
          await page.keyboard.press('Escape');
        }
      }
      /* (b) a Shop buy short of the server's gold: off, and the row says how much more. */
      if (!(await openWin('v', 'shop'))) fails.push('SW-4 the Shop did not open');
      else {
        await page.waitForTimeout(250);
        const row = await page.evaluate(() => {
          const b = document.querySelector('[data-hs-win="shop"] [data-hs-act="buy"][data-offer="gear.iron_helm"]')
            || [...document.querySelectorAll('[data-hs-win="shop"] [data-hs-act="buy"]')].find((x) => /400/.test(x.textContent));
          const li = b && b.closest('li');
          if (li) li.scrollIntoView({ block: 'center' });
          return b ? { off: b.disabled, small: li.querySelector('small').textContent } : null;
        });
        if (!row || !row.off || !/You need 350 gp more\./.test(row.small)) fails.push('SW-4 a Shop buy short of gold reads ' + JSON.stringify(row));
        await shot('shop-short');
      }
      /* (c) a hunt the server refuses for the Level: the Enter answer names both Levels. */
      if (!(await openWin('h', 'hunts'))) fails.push('SW-4 the Hunts window did not open');
      else {
        const pick = '[data-hs-win="hunts"] .hw-hunt[data-hunt="' + hard.id + '"]';
        if (await page.$(pick)) { await page.click(pick); await page.waitForTimeout(200); }
        const enter = '[data-hs-win="hunts"] .hw-hunt-enter';
        const on = await page.evaluate((q) => { const b = document.querySelector(q); return !!b && !b.disabled && b.getAttribute('data-hunt'); }, enter);
        if (on !== hard.id) fails.push('SW-4 Enter on ' + hard.name + ' is not on (' + JSON.stringify(on) + ')');
        else {
          await page.click(enter);
          const said = await wait(page, () => /You need Level/.test((document.querySelector('[data-hs-win="hunts"] .hh-intent-msg') || {}).textContent || ''), null, 4000);
          const msg = await page.evaluate(() => document.querySelector('[data-hs-win="hunts"] .hh-intent-msg').textContent);
          const want = 'You need Level ' + (hard.band[0] - 4) + ' to enter ' + hard.name + '. You are Level 1.';
          if (!said || msg !== want || s.enter !== 1) fails.push('SW-4 a locked hunt\'s Enter said ' + JSON.stringify(msg) + ' (want ' + JSON.stringify(want) + ', ' + s.enter + ' enter(s) sent)');
          await shot('hunt-locked');
        }
      }
      if (errors.length) fails.push('SW-4 console errors at ' + w + '×' + h + ': ' + errors.slice(0, 3).join(' | ').slice(0, 300));
      await ctx.close();
    }
  } catch (e) {
    /* A step that threw (a load timeout under a busy machine) is HARNESS, never a rule, and never a caught mutant. */
    fails.push('HARNESS a page step threw: ' + String(e && e.message).split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

async function staticFails(over) {
  const files = await sources(over);
  return [...silentSites(files).map((x) => 'SW-1 ' + x.at + ': ' + x.why), ...unsaidOff(files).map((x) => 'SW-2 ' + x.at + ': ' + x.why)];
}

async function checks(over, withScreens) {
  const fails = [...await staticFails(over)];
  if (!over || !withScreens) fails.push(...await pure());
  if (withScreens) fails.push(...await screens(over));
  return fails;
}

/* [name, file, from, to, browser?] */
const MUTANTS = [
  ['a Shop buy drops its refusal (runIntent swapped for a bare call)', 'src/shell/windows/shop.js',
    "runIntent(sc, repaint, () => cs.edgeIntent('shop_buy'", "void ((...a) => a[2]())(sc, repaint, () => cs.edgeIntent('shop_buy'"],
  ['the item menu greys Cook all with no words (the 10-25 bug)', 'src/shell/windows/inventory/actions.js',
    "    + (!on && why ? '<small class=\"hw-mi-why\" data-why=\"' + act + '\">' + esc(why) + '</small>' : '');", "    + '';", true],
  ['the loot plan greys Sell on a starting-kit item with a hover title only', 'src/shell/windows/inventory/actions.js',
    "' data-rule=\"' + v + '\" aria-pressed=\"' + (rule === v) + '\"', why);", "' data-rule=\"' + v + '\" aria-pressed=\"' + (rule === v) + '\" title=\"' + esc(why) + '\"');", true],
  ['a Shop buy short of gold is greyed with no words', 'src/shell/windows/shop.js',
    "          + (short ? ' · You need ' + gold(short) + ' more.' : ''));", "          + '');", true],
  ['a new rule-disabled control with no reason', 'src/shell/windows/services.js',
    "  prop(yes, 'disabled', sc.pending);\n  /* BLESSINGS */", "  prop(yes, 'disabled', sc.pending || purse === 0);\n  /* BLESSINGS */"],
  ['the engine\'s activity_locked on a bench reads as a hunt\'s', 'src/shell/town-work.js',
    "cs.edgeIntent('set_activity', { activity }).then(skillRefusal(cs, w))", "cs.edgeIntent('set_activity', { activity })"],
  ['a locked hunt drops the server\'s Levels', 'src/session/refusal.js',
    '    floor: floorOf([b, d, d.detail]),\n', '    floor: null,\n', true],
  ['the menu\'s reason line is hidden (a title-only reason, on screen)', 'src/styles/windows.css',
    '.hw-mi-why { max-width: 280px;', '.hw-mi-why { display: none; max-width: 280px;', true],
  ['the town-work stop drops its refusal', 'src/shell/town-work.js',
    "  return send(() => cs.edgeIntent('set_activity', { activity: { kind: 'idle' } }), 'Finishing…', () => {",
    "  cs.edgeIntent('set_activity', { activity: { kind: 'idle' } }); return send(() => Promise.resolve({ ok: true }), 'Finishing…', () => {"],
];

async function main() {
  if (ARGS.includes('--static')) {
    const fails = [...await staticFails(null), ...await pure()];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log('say-why --static: ' + (fails.length ? fails.length + ' RED' : 'green'));
    process.exit(fails.length ? 1 : 0);
  }
  if (!ARGS.includes('--mutate')) {
    const fails = await checks(null, true);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'say-why: ' + fails.length + ' rule(s) RED'
      : 'say-why: every intent site speaks; every rule-disabled control says why on screen; the words carry the server\'s numbers; Cook all, a starting-kit Sell plan, a short Shop buy and a locked hunt say why in play.html');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null, true);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  let bad = 0;
  for (const [name, file, from, to, browser] of MUTANTS) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const over = { [file]: text.replace(from, to) };
    let fails = await staticFails(over);
    if (!fails.length) fails = await pureWith(over);
    if (!fails.length && browser) fails = await screens(over);
    if (fails.length && fails.every((f) => f.startsWith('HARNESS'))) { console.log('  ✗ ' + name + ' — HARNESS, not a verdict: ' + fails[0]); bad++; continue; }
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'say-why --mutate: ' + bad + ' escaped' : 'say-why --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

/* The pure rules against a planted file: src/ is copied to a temp dir (the tree is never written), the mutant planted
   there, and the rules import from the copy. */
async function pureWith(over) {
  const { cp, writeFile, rm, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(join(tmpdir(), 'say-why-'));
  try {
    await cp(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
    for (const [file, text] of Object.entries(over)) await writeFile(join(dir, file), text);
    return await pure(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

main();
