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
//        from the engine's activity_locked.
//   SW-4 ON SCREEN (play.html, stubbed server): the item menu's Cook all is off
//        WITH its visible line; a Shop buy short of gold says how much more.
//        `--shots <dir>` saves each at
//        1440×900 and 844×390.
//
//   node tests/say-why.mjs                   the rules
//   node tests/say-why.mjs --shots <dir>     the rules + screenshots
//   node tests/say-why.mjs --mutate          every planted defect must turn a NAMED rule RED; a throw, a plant that does not parse or a
//                                            line with no SW id is HARNESS, never a catch (tests/_mutant-verdict.mjs)
//
// mutant-anchors: src/shell/windows/shop.js src/shell/windows/inventory/actions.js src/shell/town-work.js src/session/refusal.js src/shell/intent-words.js src/shell/windows/services.js src/styles/windows.css
// ════════════════════════════════════════════════════════════════════════
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { withServerLevel } from './_server-level.mjs';
import { harnessFail, judge, judgePlanted, report, exitOf, cleanControl } from './_mutant-verdict.mjs';

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
  'r = await marketMine(cs); } catch': 'the sale notices\' background read (market-watch.js); a refusal leaves nothing new to tell, and the next read tries again',
  'r = await readWorks(ctx.account, cs); } catch': 'the closed Market\'s Works read (market/state.js readBuilding), never a press; a refusal leaves sc.works null and blockWords says the closed line instead',
  'stopWork(cs, send)).then': 'the armed stop (town-work.js) answers through the `send` its start was given: the window\'s runIntent',
  'r = await carryOnPlan(ctx.account, cs, null); } catch': 'the return card\'s plan read (carry-on.js readPlan), never a press: a refused read offers no Carry on, each hero keeps its own press, and the next hunt start or end reads it again',
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
  'src/shell/windows/training.js': [
    { cond: '!!block', words: "text(root.querySelector('.tw-off-why'), block)", where: 'Start training: the line above it says why (out hunting, in a party, no quote, a purse under the first hour, the dummy in use), and data-off-why says it on a press' },
    /* 2027-05-20-yard-stop.sql, post-140 audit C10: a Stop pending to the server's close */
    { cond: '!!stopping', words: "text(root.querySelector('.tw-stop-why'), stopping)", where: 'Stop training while its Stop pends: the line beside it says the hunt bar\'s words ("Leaving in 3s", "Leaving now…"), and data-off-why says it on a press' },
  ],
  /* Carry on (1024-carry-on.sql): off while the server's plan has no hero to send; the block is hidden then, except right after a press */
  'src/shell/carry-on.js': [
    { cond: 's.pending || !live', words: "text(el.querySelector('.haway-carry-msg'), s.msg)", where: 'Carry on: hidden while no hero would go; shown off only after a press, when the line under it says who went or why the server refused (a hero that stays reads its own reason in the list above)' },
    /* the company's plan lines (1051-company-start.sql): off until the server's section has come, and while a press is out */
    { cond: '!co || s.pending || s.line', words: "t('away.line_reading')", where: 'Wear upgrades and If one falls: the note under them says the plan is being read, or Sending… while a press is out' },
  ],
  /* the plan's ground on a ground's page (1051-company-start.sql): hidden until the server's section has come; off only while its own press is
     out, when the page's line says Sending… (runIntent's busy words) */
  'src/shell/windows/company-pane.js': [
    { cond: '!co || o.pending', words: "t('heroes.sending')", where: 'Go here at the next Start: hidden until the company section has come; off while a press is out, the page\'s line says Sending…' },
    /* the Risk pick (R1 / R7, 12-targets 3.1): off for a member (its leader's Risk) and until the server's `danger` section has come */
    { cond: '!d || o.pending || o.follower', words: "o.follower ? t('hunts.stance_leader') : !d ? t('hunts.stance_reading')", where: 'Careful / Steady / Bold: the line under the pick says a member\'s Risk is set by the party leader, or that the Risk is being read; Sending… on the page\'s line while a press is out' },
  ],
  /* the recruit press (1053-recruits.sql, Tyler RD-Q6 a): off until the first hero reaches the press's Level, when the line above it says when they come */
  'src/shell/windows/recruits-pane.js': [
    { cond: 'sc.pending || !o.ready', words: "t('heroes.recruits_wait', { count, name, at: o.at })", where: 'a recruit\'s name field: off with the press, the line above the rows says the recruits come when the first hero reaches Level 5 (or Recruiting… while a press is out)' },
    { cond: 'sc.pending || !o || !o.ready', words: "t('heroes.recruits_wait', { count, name, at: o.at })", where: 'Recruit 3 heroes: the line above the rows says the recruits come when the first hero reaches Level 5; with no offer the press is hidden; Recruiting… while a press is out' },
  ],
  'src/shell/windows/house-dummy.js': [
    { cond: '!canBuy', words: "text(box.querySelector('.hd-why'), block)", where: 'Unlock on the dummy: the line under the ladder says why (no Homestead, short of the next price); every skill held reads "Every skill is unlocked" and hides the buttons' },
  ],
  /* a scaled hunt's Buy (audit F26): off with the bank full, the day's hours bought, or the purse short of the total */
  'src/shell/windows/scale-pane.js': [
    { cond: 'pending || !!s.why', words: "s.why === 'bank' ? t('hunts.scale_bank_full', { max: s.bankMaxH })", where: 'Buy hours: the line above it says why (the bank full, the day\'s limit bought, not enough gold); a full bank or day hides the slider too' },
  ],
  'src/shell/windows/boss-call-pane.js': [
    { cond: '!open', words: 'BOSS_CALL_WORDS.noQuote', where: 'Call out: the line above the press reads the server\'s why (party of two, leader only, 3 a day), the hunt under way, or no answer yet' },
  ],
  /* a keyed hall's press (lane/b-barrow-boss-room): off while hunting, for a party member who is not its leader, with no key, and while the door opens */
  'src/shell/windows/boss-hall-pane.js': [
    { cond: '!open', words: "text(box.querySelector('.hw-call-line'), hallWords(said, hall))", where: 'Open the hall: the line above the press says why (out hunting, only the party leader can open it, no key in the bag), or how many keys the hero has' },
  ],
  /* the Talents tab (lane/roads-sample, 1064-roads-sample.sql): Spend as suggested is off with no point to spend, and its line says so */
  'src/shell/windows/character/talents.js': [
    { cond: 'noPoints || sc.pending', words: "t('talents.no_points')", where: 'Spend as suggested: the line beside it says No points while the server\'s section holds none to spend (the busy line says Spending… for a press)' },
  ],
  /* the Roads map (lane/r-ui-roads, src/shell/windows/talents/): Spend as suggested in its band and a stone's Take, each off with its line beside it */
  'src/shell/windows/talents/index.js': [
    { cond: 'noPoints || sc.pending', words: "t('talents.no_points')", where: 'Spend as suggested (the map band): the line beside it says No points while the server section holds none to spend' },
  ],
  'src/shell/windows/talents/card.js': [
    { cond: '!can || pending', words: "plain ? (can ? '' : why(problem))", where: 'Take (the node card): shown for the stone the next point could buy, its line says why it is off in the server words (No points, Requires the node before it, No free vow slot)' },
  ],
  /* Share plan (lane/wn-sh SH): Copy is off with no plan to share, Use this plan when the pasted code changes nothing */
  'src/shell/windows/plan-share.js': [
    { cond: '!code', words: "t('share.none')", where: 'Copy: the line where the code stands says Nothing to share yet while the server holds no plan for this hero' },
    { cond: '!sends || sc.pending', words: "t('share.nothing')", where: 'Use this plan: hidden until a code is read; then the line beside it says Already your plan when the code changes nothing on this hero (Saving… for a press)' },
  ],
  /* the Faction tab (lane/b-faction-ui): each press that waits on the server's clock or standing has its line beside it */
  'src/shell/windows/character/faction.js': [
    { cond: '!swapReady(f, now)', words: 'nextSwapWords(f, now)', where: 'Swap to the other side: the swap line above it says when the cooldown ends ("next swap in 3 days"), from the server\'s swap_ready_at' },
    { cond: '!(f && f.swap && f.swap.ms >= f.swap.needMs)', words: 'swapLeftWords(f)', where: 'Finish the swap: the swap line above it says the hunting time still owed ("4 h 10 m left"), from the server\'s credited swap time' },
    { cond: '!claimable(f, p)', words: "t('factions.piece_needs'", where: 'Claim a piece: its row says the hours of that side\'s standing it needs' },
  ],
  /* the Burning Tower (lane/b-tower-window): Enter and Use each have the line above them that says why they're off */
  'src/shell/windows/tower.js': [
    { cond: 'pending || !tw.checkpoints.length', words: "t('tower.off_no_start')", where: 'Start Floor: off while a press is out (the busy line says so) or when the server lists no checkpoint, which the line above Enter says (No start floor available)' },
    { cond: '!!block', words: "text(root.querySelector('.tt-off-why'), block)", where: 'Enter: the line above it says why (out hunting, already climbing, a party seat that does not lead, no checkpoint the server lists), and data-off-why says it on a press' },
  ],
  /* the Unmarked Catacombs (lane/b-catacombs-client): Enter has the line above it, the Start Room says the server listed none, a door past
     the record is dim under the wing's own Deepest Room */
  'src/shell/windows/tower-catacombs.js': [
    { cond: 'pending || !listed', words: "t('catacomb.wing_best', { room: whole(w.best) })", where: 'A vault door: a press only for a door the record reaches; one past it is dimmed, and the picked wing says how deep the hero has been ("Deepest Room: 10"), the first door past it tagged Next key' },
    { cond: '!w || !w.checkpoints.length', words: "t('catacomb.off_no_start')", where: 'Start Room: off while a press is out (the busy line says so) or when the server lists no door for the wing, which the line above Enter says (No start room available)' },
    { cond: '!!block', words: "text(pane.querySelector('.tk-off-why'), block)", where: 'Enter: the line above it says why (out hunting, already descending, a seat that does not lead, the door\'s Level with each seat under it, no door the server lists), and data-off-why says it on a press' },
  ],
  'src/shell/windows/tower-chest.js': [
    { cond: '!!block', words: "text(pane.querySelector('.tc-off-why'), k ? block : '')", where: 'Use: the line above it says why (out on a hunt, no key, its weapons not built, the key family\'s week of chests used); with no key held the press is hidden and the pane says how to earn one' },
    { cond: '!!block || all < 2', words: "t('tower.opens_left')", where: 'Use all: off for Use\'s reasons (the line above), or when the key family\'s week leaves one chest, which its "Opens left 1 / 6" line says; hidden with fewer than two keys held' },
    { cond: 'pending || !held', words: "t('tower.count', { count: whole(k.heldAll) })", where: 'A key slot (direction A): off for a key not held, which its own count says on it ("x0"), dimmed' },
  ],
  'src/shell/windows/hallmark-pane.js': [
    { cond: '!!why || sc.pending || !!sc.hallmark', words: "text(li.querySelector('.hw-hallmark-need'), why ||", where: 'Hallmark: the line beside it says the first thing missing (the Crafting level, the day\'s limit, the gem and where to get one, the gold short); while the confirm is open it asks in the window' },
  ],
  'src/shell/windows/havora/works.js': [
    { cond: 'off', words: 'Daily limit reached: ', where: 'Give: off while a gift is in flight, before the first read, and when today\'s allowance is spent; the line under them says so in the designer\'s words' },
    { cond: 'short > 0', words: "'Need ' + gold(short) + ' more'", where: 'a gift over the envelope\'s purse: data-off-why says how much more on a press, and the line under the buttons says what the purse holds' },
    { cond: 'poor', words: "'Not enough gold'", where: 'a purse under the smallest gift: the last button is hidden, Give is off, and the line under the buttons says why' },
  ],
  'src/shell/windows/market/browse.js': [
    { cond: '!plan.qty', words: "'Need ' + goldWords(-left) + ' more'", where: 'Buy: the line under it says what the purse is short of, and data-off-why says it on a press; with nothing to buy the page says none are for sale' },
    { cond: 'v.off || !!g', words: "No answer, safe to press again", where: 'while a lost answer is out, only Try again and Cancel stay on; the window\'s line says why' },
  ],
  'src/shell/windows/market/sell.js': [
    { cond: 'sug === null', words: "!s ? '…'", where: 'Suggested: off only until the server has said the item\'s floor and ceiling; the facts read … until then' },
    { cond: '!s || !!why || !!shortFee', words: "text(foot.querySelector('.hw-mk-why'), why || shortFee || f.msg);", where: 'List: its own line says the reason (locked, how many, under the shop, over the most, short of the fee)' },
    { cond: 'v.off || !!g', words: "No answer, safe to press again", where: 'while a lost answer is out, only Try again and Cancel stay on; the window\'s line says why' },
  ],
  'src/shell/windows/inventory/actions.js': [
    { cond: 'on && !sc.pending', words: "'<small class=\"hw-mi-why\" data-why=\"'", where: 'every item-menu entry that is off: its own line under it (Cook all, Equip, Sell, Lock, Put on the bar, Link in chat)' },
  ],
  'src/shell/windows/inventory/grid.js': [
    { cond: '!prim || !!wearWhy', words: 'wearWhy || buryWhy', where: 'the picked stack\'s line (.hw-pick-why): Equip\'s and Cook all\'s reason' },
    { cond: '!st.shop', words: "'Loading shop prices…'", where: 'Sell selected / Sell all: off only before the shop section loads; the tools row value line says so' },
    { cond: 'sc.pending || !!dWhy', words: "whyLine(root.querySelector('.hw-dispatch-why'), onBag ? dWhy : '', false);", where: 'Dispatch loot: its own line under the tools row (out hunting, nothing planned, reading the bag)' },
    { cond: '!!why', words: "(offWhy ? '. ' + offWhy : '')", where: 'the This hunt row: a plan the server refuses for the item (starting kit, no shop price) is said on the row line' },
    { cond: 'sc.confirm.empty', words: 'hw-confirm-note', where: 'the confirmation lists what is kept' },
    { cond: '!st.rules', words: "'Loading loot plans…'", where: 'the This hunt tab: the plan select is off before bag_rules loads and the tab note says so' },
    { cond: '!cur', words: "cls(pick, 'is-on', !!cur)", where: 'More sits on the picked line, which shows only with a stack picked' },
  ],
  'src/shell/windows/inventory/doll.js': [
    { cond: '!worn || locked', words: 'GEAR_HUNT_WORDS.one', where: 'the slot line says a hunt is running' },
    { cond: 'locked || short', words: "text(li.querySelector('.hw-fit-need'), short ? need.text : '')", where: 'the fit row\'s need line ("Needs Level 30 — you\'re 28")' },
  ],
  'src/shell/windows/shop.js': [
    { cond: 'short > 0', words: "', need ' + gold(short) + ' more'", where: 'the offer row: "You need 40 gp more."' },
    { cond: 'isLocked', words: "isLocked ? 'Locked'", where: 'the button reads Locked and the row says locked' },
    { cond: '!plan.lines.length', words: "t('shop.sell_junk')", where: 'the label carries the total only when there is junk' },
  ],
  'src/shell/windows/storage.js': [
    { cond: 'sc.pending || !!gWhy', words: "text(root.querySelector('.hw-store-grow .hw-why'), gWhy);", where: 'Expand in Storage: the line under it says the bag is being read, at its top, the gold is being read, or how much more gold (expandBlock)' },
    { cond: 'sc.pending || !!dWhy', words: "text(root.querySelector('.hw-store-do .hw-why'), away ? '' : dWhy);", where: 'Dispatch loot in Storage: its own line (the store note says a hunt)' },
    { cond: 'sc.pending || off', words: "text(root.querySelector('.hw-store-note'), away ? storeAwayWords(cs)", where: 'Deposit all materials (audit 2026-11-18 A8): off only while a hunt runs or Storage loads, which the store note says; with no material in the bag it is not drawn' },
  ],
  'src/shell/windows/services.js': [
    /* a bought hunting block (1058-hunting-blocks.sql): the quote line's words live in the text home (shop.block_full, block_used, block_quote_short) */
    { cond: '!canStam', words: "q.why === 'stamina_full' ? t('shop.block_full') : t('shop.block_used', { max: whole(q.perDay) })", where: 'the stamina quote line: a full day banked, all of today\'s blocks bought, or how much more gold (shop.block_quote_short), else no price yet' },
    { cond: '!canStam', words: "t(purse !== null && purse < q.price ? 'shop.block_quote_short' : 'shop.block_quote'", where: 'the stamina quote line: how much more gold the next block needs' },
    { cond: 'r.held || !next', words: "', need ' + gold(short) + ' more'", where: 'each blessing row: Owned, Needs I, or how much more gold' },
    { cond: 'missing < 2 || sc.pending || allShort', words: "!missing ? t('shop.bless_all_on', { count: b.tiers.length }) : missing < 2 ? '' : sc.pending ? t('shop.bless_all_busy') : allShort ? t('shop.bless_all_short')", where: 'Bless all: the line under it says all are on, a purchase is under way, or the gold is short for the next one; with one missing it is hidden and that row\'s own button says why' },
  ],
  'src/shell/windows/time-rule-pane.js': [
    /* a bought block of town work (1071-work-blocks.sql): the quote line's words live in the text home (work.block_day_ending, block_used, block_quote_short) */
    { cond: '!can || !!sc.wblockConfirm', words: "q.why === 'day_ending' ? t('work.block_day_ending') : t('work.block_used', { max: whole(q.perDay) })", where: 'the work block quote line: not enough of today left, all of today\'s blocks bought, or how much more gold (work.block_quote_short); off while its own confirmation is open' },
    { cond: '!can || !!sc.wblockConfirm', words: "t(purse !== null && purse < q.price ? 'work.block_quote_short' : 'work.block_quote'", where: 'the work block quote line: how much more gold the next block needs' },
  ],
  'src/shell/widgets/stamina-buy.js': [
    { cond: '!!why', words: ".hb-buy-why'), why", where: 'the bar\'s refill panel line' },
  ],
  'src/shell/widgets/upgrade-line.js': [
    { cond: '!show || !!opt.locked', words: 'GEAR_HUNT_WORDS.upgrades', where: 'the upgrade line\'s why' },
  ],
  'src/shell/windows/hunts.js': [
    { cond: 'follower', words: "t('hunts.lead_follower')", where: 'the page lead for a party member' },
    { cond: '!tiersOf(groundOf(hunt).id).includes(want)', words: 'tierWords(r, tier, size, level)', where: 'a ground offers its tiers as buttons, and the note says what each does' },
    { cond: '!!now', words: 'carriedWords(carried)', where: 'a running hunt: the page says what it carries; the top bar has Leave' },
  ],
  'src/shell/windows/hunt-after-pane.js': [
    { cond: '!!v.now', words: "t('away.after_hunting')", where: 'When the hunt ends: while a hunt runs the control is off, and the line under it says that hunt\'s own plan and that it can be changed once the hunt is over' },
  ],
  'src/shell/windows/hunt-detail.js': [
    { cond: 'v.partyBlock.full', words: 'v.partyBlock.why', where: 'the party block says the party\'s size' },
  ],
  'src/shell/windows/hunt-summary.js': [
    { cond: 'huntOpen || !again', words: "'Hunt again off: a hunt is already running'", where: 'the summary\'s line under its buttons' },
  ],
  /* THE HUNT PREP BUILDER (lane/b-hunt-prep-builder, 2026-11-11): the setups column and the builder's copy of one setup. */
  'src/shell/windows/hunt-prep/setups.js': [
    { cond: 'hunting && !swap.ok', words: "(swap && swap.why ? ', ' + swap.why : '')", where: 'Use in a hunt (Tyler 2026-11-17, bar only): a setup of another weapon type says "Town only: needs ..." on its own line; the setup in use reads In use' },
    { cond: 'noNew', words: "setupFullWords(count)", where: 'New and its Save: the window line (full: delete one, nothing is for sale), the town-only note (hunting), the none line (no presets)' },
    { cond: 'sc.pending || hunting || !pickedRow', words: "t('prep.town_only')", where: 'Use equipped: the town-only note; with no setup picked there is nothing to replace (the none line)' },
  ],
  'src/shell/windows/hunt-prep/builder.js': [
    { cond: 'off || !d || d.stance === null', words: "t('prep.reading_setup')", where: 'stance: off until the copy of the setup is read (the read line says so, or the refusal); the server never sent a value' },
    { cond: 'off || !d || d.targetMode === null', words: "t('prep.reading_setup')", where: 'target: the same' },
    { cond: 'off || !d || d.chase === null', words: "t('prep.reading_setup')", where: 'chase: the same' },
    { cond: 'off || !d || d.distance === null', words: "t('prep.reading_setup')", where: 'distance: the same, and at the ends of HERO_DISTANCE' },
    { cond: 'off || !d || d.goldFloor === null', words: "t('prep.reading_setup')", where: 'the gold to keep: the same' },
    { cond: 'off || !sc.draft', words: "t('prep.reading_setup')", where: 'Sort and Clear: off until the copy is read' },
    { cond: 'off || bp.off', words: "t('prep.basic_none')", where: 'Basic setup: its own words say the weapon type is unknown; with no copy yet the read line says the setup is being read (and data-off-why on a press)' },
    { cond: 'off || !sc.draft || sc.stale', words: "t('prep.changed')", where: 'Save: the state line says the setup changed on the bar, load it again' },
    { cond: 'off || !sc.draft || sc.stale || hunting', words: "t('prep.changed')", where: 'Save and use: the same, and the town-only note while hunting (setups.js)' },
  ],
  'src/shell/windows/character/titles.js': [
    { cond: 'w.off', words: "'. Need ' + gold(short) + ' more'", where: 'the row\'s own line says how much more gold; a row short of its kills has no button, its line says the count' },
  ],
  'src/shell/windows/chat-crier.js': [
    { cond: '!q || q.price === null', words: "q && q.price === null ? CRIER.done", where: 'Cry it and Again: past the day\'s last line the button itself reads the Crier\'s day is done; before the first quote the line under them reads Asking the Crier…' },
    { cond: 'muted', words: "muted ? refusalWords('muted', 'crier')", where: 'Cry it and Again while the server\'s quote says a mute stands (2027-03-16-crier-muted.sql): the line under them says the Game Master muted you' },
  ],
  'src/shell/windows/havora/index.js': [
    { cond: 'pPrice === null', words: "s && pPrice === null ? 'No more powders today'", where: 'the powder button says it; until the first read answers it has no price, and the window\'s line says any refusal' },
    { cond: 'rPrice === null', words: "s && rPrice === null ? 'No more rounds today'", where: 'the round button says it; until the first read answers it has no price, and the window\'s line says any refusal' },
    { cond: 'pShort > 0', words: "text(root.querySelector('.hv-why[data-of=\"hearth\"]'), needWords(pShort))", where: 'a powder the purse can\'t pay: the line under the button says how much more, and data-off-why on a press' },
    { cond: 'rShort > 0', words: "text(root.querySelector('.hv-why[data-of=\"round\"]'), needWords(rShort))", where: 'a round the purse can\'t pay: the line under the button says how much more, and data-off-why on a press' },
  ],
  'src/shell/windows/characters.js': [
    { cond: "x.slot === ctx.character.slot || !ctx.goTo", words: "t('heroes.on_screen')", where: 'the button reads On screen' },
    { cond: '!can', words: "t('heroes.rename_short', { gold: gold(purse) })", where: 'the rename quote: price, why not available, or the gold you have' },
    { cond: 'can.entry.off', words: 'text(inv, can ? can.entry.label', where: 'the phone\'s Invite: an off entry reads its reason as its label ("Party full")' },
  ],
  'src/shell/windows/character/outfit.js': [
    { cond: '!owned || (o.worn || null) === d.outfit', words: "(o && !owned ? ', not owned' : '')", where: 'the picked outfit\'s name under the preview says not owned (a tile not owned is dimmed and says so on the pointer); Equip needs another outfit' },
    { cond: '!offer', words: "cls(save, 'is-on', offer)", where: 'with nothing to pay for the button isn\'t shown at all, and the line above the picker says what this outfit shows or why it has no colors' },
    { cond: 'short > 0', words: "text(root.querySelector('.hw-of-why'), short ? 'Need ' + gold(short) + ' more' : '')", where: 'Save colors over the envelope\'s purse: the line under it says how much more, and data-off-why on a press' },
    { cond: '!c.owned', words: "text(b.querySelector('small'), c.need)", where: 'a faction add-on not owned (the designer 2026-11-18) carries its requirement on the button itself, "Requires First Flame standing: 100 h", the server\'s number' },
  ],
  'src/shell/windows/house.js': [
    { cond: '!on', words: "t('house.cost_gold_short'", where: 'each step\'s cost lines mark what is short, with your counts' },
  ],
  'src/shell/windows/tally.js': [
    { cond: 'r.held || full || st.sc.pending || st.hunting', words: "t('tally.board_hunting')", where: 'the gold line under her board head says why every Take is off (hunting, three held, no weight yet), and data-off-why on the press' },
    { cond: 'order.indexOf(s) === 0', words: "t('tally.slot_first_why')", where: 'the first slot chip has nothing to go before; a press on it says so (data-off-why)' },
    { cond: '!tally', words: "t('tally.board_loading')", where: 'with no tally from the server the board says it is loading and every control stays off' },
  ],
  'src/shell/windows/work.js': [
    { cond: '(!running && !!why)', words: ": [why || (running ? 'Working on it now'", where: 'the row\'s own line, a short input\'s places linked (workBlock: "You need Smithing 3 to make Bronze Axe. You have 1.")' },
    { cond: 'running', words: "'Working on it now'", where: 'the row says it is running' },
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
    /* lane/c-social (GR-72, MM-20); the reasons added on lane/a-ci-reds-social */
    { cond: '!st.link', words: "t(st.linkFailed ? 'clan.link_none' : 'clan.link_wait')", where: 'Copy link: until the server\'s code is in, the empty link field reads "Getting your link…", or "No link right now. Open this window again later." when the ask was refused' },
    { cond: 'st.pending || !p', words: "t('clan.quiet_wait')", where: 'Quiet presence: until the server\'s presence section has come, the line under the switch reads "Waiting for the server."' },
  ],
  'src/shell/windows/clan.js': [
    { cond: 'st.pending || full', words: "text(b, full ? t('clan.full')", where: 'Join on a full clan: the press reads "Clan full", beside its row\'s "12 of 12 members"' },
    { cond: '!quoted', words: "t('clan.found_wait')", where: 'Found a clan before the server quotes the price: the press reads "Waiting for the price"' },
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
  /* src/app/slot-offer.js left the list with the slot offer (all four hero slots free, 1036-four-starter-slots.sql): it has no button now */
  /* Other lanes own these files right now (lane/a-v0246-followups); listed as they stand, see the report. */
  'src/shell/windows/farm.js': [
    { cond: '!r.why', words: 'r.why', where: 'the crop row\'s own why' },
    { cond: '!verb', words: 'verb', where: 'the plot says what it needs' },
    { cond: 'st.farming < up.farming || !afford', words: "t('farm.tier_next", where: 'the tier line names the price and Farming level (OPEN: does not say which is short)' },
  ],
  /* Tend the field (1017-tend-the-field.sql): off only when the server's bill has nothing to do, and the bill's first line says so */
  'src/shell/windows/farm-tend.js': [
    { cond: '!b.work', words: "if (!b.work) out.push(t('farm.tend_nothing'));", where: 'Tend the field: the bill above it reads "Nothing to tend right now", and every plot it leaves empty says why' },
  ],
  'src/shell/windows/configure-action.js': [
    { cond: 'off', words: "text(el.querySelector('.ca-need-t'), r.locked ? r.need || '' : '')", where: 'a locked row names what it needs under its name, whole in its title (rowNeed; UI audit 2026-11-18, phone-touch PH-1)' },
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
  'src/shell/widgets/first-target.js': [
    { cond: 'v === null', words: "t('bar.first_target_unknown')", where: 'the First target before the server sends the hunt_target_kind section: the line under the select reads "Waiting for server"' },
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
  if (bear !== 'Requires Cooking 40, now 11') fails.push('SW-3 Cook all above the level reads ' + JSON.stringify(bear));
  const axe = workBlock({ read: read(1, {}) }, workRow('artisan', 'forge_bronze_axe'), false);
  if (axe !== 'Requires Smithing 3, now 1') fails.push('SW-3 a bench row above the level reads ' + JSON.stringify(axe));
  /* A reforge spends the bag's piece: a hero wearing it hears why, once the rest of the row is there (lane/c-klappa-club) */
  const wearing = (inv) => ({ read: (k) => (k === 'equipment' ? { weapon: 'practice_club' } : read(1, inv)(k)) });
  const club = workRow('artisan', 'reforge_klappas_club');
  const ready = workBlock(wearing({ bronze_bar: 6, small_fang: 3 }), club, false);
  if (ready !== 'Equipped: Practice Club. Unequip it first.') fails.push('SW-3 a reforge of the worn weapon reads ' + JSON.stringify(ready));
  const early = workBlock(wearing({ small_fang: 3 }), club, false);
  if (!/^No Bronze Bar /.test(early)) fails.push('SW-3 the row tells a hero to take the weapon off before the bars are there: ' + JSON.stringify(early));
  /* The engine's own refusal of the same press (activity_locked), driven through the one start path. */
  const sc = { pending: false, msg: '' };
  const cs = { read: read(11, { raw_bear_meat: 2 }), edgeIntent: async () => refusalOf({ ok: false, body: { ok: false, error: 'activity_locked', kind: 'artisan', id: 'cook_bear_meat' } }) };
  await startWork(cs, workRow('artisan', buryRecipeOf('raw_bear_meat').recipe.id), (fn, busy, done) => runIntent(sc, () => {}, fn, busy, done, cs), () => {});
  if (sc.msg !== 'Requires Cooking 40, now 11') fails.push('SW-3 the engine\'s activity_locked on Cook all reads ' + JSON.stringify(sc.msg));
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
      await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
      await pinFonts(page);
      await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
        const name = r.request().url().split('?')[0].split('/').pop();
        const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
        if (name === 'hr_load' || name === 'hr-accrue') return json(withServerLevel(Object.assign(clone(s.env), { version: ++s.version, ok: true })));
        return json({ ok: true });
      });
      const shot = async (n) => { if (SHOTS) await page.screenshot({ path: join(ROOT, SHOTS, n + '-' + w + 'x' + h + '.png') }); };
      await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.click('[data-app="play"][data-slot="0"]');
      if (!(await wait(page, () => document.querySelector('.hs-launchers')))) { fails.push('SW-4 the game did not open'); await ctx.close(); continue; }
      const openWin = async (key, id) => {
        for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving):not([data-hs-win="chat"])').length > 0); i++) {
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
          if (!m.label || !m.off || m.why !== 'Requires Cooking 40, now 11' || !m.shown) fails.push('SW-4 the item menu\'s Cook all reads ' + JSON.stringify(m));
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
          if (!p.off || p.why !== 'Shop doesn\'t buy starting kit' || !p.shown) fails.push('SW-4 the loot plan\'s Sell on a starting-kit item reads ' + JSON.stringify(p));
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
        if (!row || !row.off || !/need 350 gp more$/.test(row.small)) fails.push('SW-4 a Shop buy short of gold reads ' + JSON.stringify(row));
        await shot('shop-short');
      }
      if (errors.length) fails.push('SW-4 console errors at ' + w + '×' + h + ': ' + errors.slice(0, 3).join(' | ').slice(0, 300));
      await ctx.close();
    }
  } catch (e) {
    /* A step that threw (a load timeout under a busy machine) is HARNESS, never a rule, and never a caught mutant. */
    fails.push(harnessFail('a page step', e));
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
    "          + (short ? ', need ' + gold(short) + ' more' : ''));", "          + '');", true],
  ['a new rule-disabled control with no reason', 'src/shell/windows/services.js',
    "  prop(yes, 'disabled', sc.pending);\n  /* BLESSINGS */", "  prop(yes, 'disabled', sc.pending || purse === 0);\n  /* BLESSINGS */"],
  ['the engine\'s activity_locked on a bench reads as a hunt\'s', 'src/shell/town-work.js',
    "cs.edgeIntent('set_activity', { activity }).then(skillRefusal(cs, w))", "cs.edgeIntent('set_activity', { activity })"],
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
  const clean = await cleanControl(() => checks(null, true));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  /* A mutant is caught only by a NAMED rule (SW-n); a plant that does not parse, a run that throws, or a line with no rule id is
     HARNESS, never a catch (tests/_mutant-verdict.mjs; lane/c-hollow-proofs-browser 2026-11-20: a HARNESS line beside an unnamed one
     still scored as the catch). The arms run in order, the next only while nothing has judged: static, pure, then the page. */
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to, browser] of MUTANTS) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    const over = { [file]: text.replace(from, to) };
    let v = await judgePlanted(over, () => staticFails(over));
    if (v.kind === 'escaped') v = await judge(() => pureWith(over));
    if (v.kind === 'escaped' && browser) v = await judge(() => screens(over));
    console.log(report(name, v, counts));
  }
  console.log(exitOf(counts) ? 'say-why --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)'
    : 'say-why --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
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
