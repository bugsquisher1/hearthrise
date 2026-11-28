#!/usr/bin/env node
// mutant-rule-functions: checks pure jobsRules
// mutant-runner-functions: main
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows-work.mjs — THE WORK WINDOW (THE JOBS LIST, THE WORK DAY, THE HEARTH, THE TRADES) AND THE SKILLS, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows-work.mjs                  the rules
//   node tests/alpha-windows-work.mjs --mutate         every planted defect must turn a rule RED
//   node tests/alpha-windows-work.mjs --pure           its pure rules only (no browser)
//   node tests/alpha-windows-work.mjs --mutate --only=<prefix>   just the mutants whose name starts so
//   node tests/alpha-windows-work.mjs --mutate --shard=K/N   the Kth of N shards, balanced by measured seconds (CI splits them)
//   node tests/alpha-windows-work.mjs --shard-plan   no browser: smoke.yml's shards cover every mutant once, each in budget
//   node tests/alpha-windows-work.mjs --shots <dir>  also write the visual-gate screenshots (1440x900 and 922x423)
//
// mutant-anchors: src/shell/windows/work.js src/shell/windows/work-jobs.js src/shell/windows/skills.js src/session/trade-sections.js src/session/job-quotes.js src/session/tutorial-sections.js src/shell/launcher-coach.js src/session/hearth-sections.js src/shell/windows/shop.js src/shell/windows/item-tip.js src/styles/shell.css src/data/text/shop.js src/data/shell-windows.js
// mutant-writes-tree: no — page mutants are served overrides (tests/_alpha-windows.mjs pageRun), pure ones planted into a temp copy of src (tickerMutant)
//
// One of the alpha windows' guards, split from tests/alpha-windows.mjs (2026-11-19, arch audit item 7): tests/_alpha-windows.mjs
// is the harness they share (play.html with supabase-js and the REST paths stubbed, the character's envelope
// tests/fixtures/alpha-envelope.json) and says which guard holds which window's rules.
//
// THE BENCH CUT (docs/design/redesign/09-crafting.md 4.17, lane/bench-cut-client): the Work window's Jobs list is the town work. The
// guard's old subjects left with the client's bench and are retired with it (CLAUDE.md 3.6): the gathering and bench rows (AW-22's rows,
// AW-22F, AW-22X), the station sort (AW-76), the bench rows' compare and ladder (AW-102), the town ticker (AW-24, TK-1 .. TK-10) and the
// tool lines (AW-60's). Their unique catches are re-aimed here at the Jobs list and the fuel run:
//   AW-J1 PURE   the Jobs section's reader keeps only well-formed recipes and the server's quote or refusal; the work day reads the server's
//                cap and what is left; a trade's unlock names the job its next Level opens; a trade's bar is drawn only while the server's
//                XP sits inside the server's Level; a fuel row is read by its id, a bench id is none, and a spent fuel run's instant is the
//                server's watermark plus what its bag and Storage still cover
//   AW-22 THE JOBS LIST (in the page): G opens the Work window on the work day, the Jobs list and the trades, every number the server's;
//         no gathering or bench row is drawn; Start is ONE hr_trade_job_start naming the quote's recipe, count and fee; the running job's
//         line and its Stop come from the server's next read and survive a reload; Stop is ONE hr_trade_job_end, early; a fuel run the
//         server's pointer holds shows the hearth line with its Stop, ONE set_activity idle
//   AW-60 the windows say what an item is for (the Shop's Sell all junk, the House's short material, a ground's materials, a stack no one buys)
//   AW-17 the skills are two ledgers (the combat one inside the Character window, tests/character-window.mjs); neither ledger scrolls at 922x423
//         (the trades are the Work window's Skills tab); a character that has never fought sees the pointer to Hunts
//   AW-73 ON A PHONE THE CARD'S CROSS IS DRAWN IN ITS BUTTON (door panel 2026-11-04): static, it lay over the words in the middle of every closable card
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tradeJobsFixture } from './_client-harness.mjs';
import { wait, reloadAndPlay, pushEnvelope, openWin, sent, pageRun, plain, mutate, shardPlan, tickerMutant } from './_alpha-windows.mjs';

/* AW-J1 PURE: the Work window's readers over the src at `base` (a temp copy of src a `jobs:` mutant was planted into, JUDGES below). */
async function jobsRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const TS = await imp('src/session/trade-sections.js');
  const JQ = await imp('src/session/job-quotes.js');
  const TU = await imp('src/session/tutorial-sections.js');
  const BU = await imp('src/shell/windows/inventory/bury.js');
  const LC = await imp('src/shell/launcher-coach.js');
  const SK = await imp('src/shell/windows/skills.js');
  const HS = await imp('src/session/hearth-sections.js');
  const TP = await imp('src/session/town-poll.js');
  const { tradeXpTable } = await imp('src/core/trades.js');
  const at = (sections) => ({ read: (k) => sections[k] });
  const now = '2026-11-01T12:00:00.000Z';
  /* the section: a recipe with no face or no id is dropped; an open quote and a refusal each read as the server sent them */
  const sec = tradeJobsFixture(now, { smithing: 5 });
  sec.recipes.push({ id: 'bar_b0', name: 'Smelt Bronze Bars', trade: 'smithing', face: 'bronze_bar', r_level: 1, inputs: { copper_ore: 1, tin_ore: 1 }, quote: { ok: false, error: 'short_inputs' } },
    { id: 'Bad Id', name: 'x', trade: 'smithing', face: 'bronze_bar', quote: { ok: true, count: 1, fee: 0 } }, { id: 'no_face', name: 'x', trade: 'smithing', quote: { ok: true, count: 1, fee: 0 } });
  const s = TS.tradeJobsOf(at({ trade_jobs: sec })), list = JQ.jobListOf(null, at({ trade_jobs: sec }));
  if (!s || s.trades.smithing.level !== 5 || list.loading || list.rows.map((r) => r.id).join() !== 'meal_b0,bar_b0') fails.push('AW-J1 the Jobs list reads ' + JSON.stringify([s && s.trades, list]));
  const [open, shut] = list.rows;
  if (!open || !open.quote.ok || open.quote.count !== 10 || open.quote.fee !== 0 || !Number.isFinite(open.quote.endsAt) || !shut || shut.quote.ok || shut.quote.error !== 'short_inputs')
    fails.push('AW-J1 the quotes read ' + JSON.stringify([open && open.quote, shut && shut.quote]));
  /* ONE READER, WITH A LOADING STATE (09 4.17: the quotes leave the envelope): with no list sent it is loading and shows no row, the section's
     Levels and job still read, and a row whose quote has not arrived has none (nothing here works one out) */
  const bare = { trades: sec.trades, job: null, last: null, stock: {} };
  const waiting = JQ.jobListOf(null, at({ trade_jobs: bare })), half = JQ.jobListOf(null, at({ trade_jobs: { ...bare, recipes: [{ ...sec.recipes[0], quote: undefined }] } }));
  if (!waiting.loading || waiting.rows.length || !TS.tradeJobsOf(at({ trade_jobs: bare })) || half.loading || half.rows.length !== 1 || half.rows[0].quote !== null)
    fails.push('AW-J1 with the quotes on their way the list reads ' + JSON.stringify([waiting, half]));
  if (TS.tradeJobsOf(at({})) !== null || TS.tradeJobsOf(at({ trade_jobs: null })) !== null) fails.push('AW-J1 a dark switch (no section) reads as a Jobs list');
  /* the coach: the company's trade XP and best Level are the section's, unknown while it is dark; a card's ring.job is the row's Start */
  const facts = (sections) => TU.tutorialFactsOf(at({ level: { level: 3, xp: 900, into: 0, need: 1 }, ...sections }));
  const f1 = facts({ trade_jobs: sec }), f0 = facts({});
  if (!f1 || !f1.tradeXp || f1.tradeXp.smithing !== 0 || f1.benchLevel !== 5 || !f0 || f0.tradeXp !== null || f0.benchLevel !== null) fails.push('AW-J1 the coach reads the trades as ' + JSON.stringify([f1 && f1.tradeXp, f1 && f1.benchLevel, f0 && f0.tradeXp]));
  const ring = LC.ringPlan({ anchor: 'crafting', ring: { job: 'meal_b0' } }, { open: (id) => id === 'skills-trade', configuring: null });
  if (!(ring[0] || '').includes('.hw-work-row[data-id="meal_b0"] [data-hs-act="work-go"]')) fails.push('AW-J1 ring.job rings ' + JSON.stringify(ring));
  /* A COUNTED FUEL RUN ("Burn" is a run of one) says its own count, never the stock behind it (live v0.2.135: "2,529 Bones left"), and is
     spent after it: the server's bench_run.left, which stays for the hearth */
  const one = { state: { active_kind: 'artisan', active_id: 'fuel_bones', accrued_to: now }, inventory: { bones: 2529 }, bench_run: { left: 1 } };
  if (!/· 1 to go$/.test(BU.buryLine(at(one)))) fails.push('AW-J1 one Bone fed reads ' + JSON.stringify(BU.buryLine(at(one))));
  if (HS.fuelSpentAtMs(at(one)) !== Date.parse(now) + HS.fuelEachMs(HS.fuelRowOf('fuel_bones')) + 2000) fails.push('AW-J1 a counted run is spent at ' + HS.fuelSpentAtMs(at(one)));
  if (!HS.fuelRunOver(at(one), Date.parse(now) + 60000)) fails.push('AW-J1 a counted run long done reads as burning on the roster');
  /* the work day: the server's cap and what is left, nothing worked out here */
  const day = TS.workDayOf(at({ work_day: { cap_ms: 36000000, today_ms: 7200000, left_ms: 28800000, premium: false } }));
  if (!day || day.capMs !== 36000000 || day.usedMs !== 7200000 || day.leftMs !== 28800000 || day.premium !== false || TS.workDayOf(at({})) !== null) fails.push('AW-J1 workDayOf reads ' + JSON.stringify(day));
  /* a trade's unlock line and its bar */
  const u = SK.tradeUnlockLine('smithing', 5), top = SK.tradeUnlockLine('smithing', 99);
  if (!/^Lv 11: /.test(u.one) || !/^\+\d+ more$/.test(u.more) || !u.all.startsWith(u.one) || top.one !== '') fails.push('AW-J1 the Smithing unlock reads ' + JSON.stringify([u, top]));
  const tbl = tradeXpTable();
  const mid = SK.tradeProgress({ xp: tbl[4] + 10, level: 5 });
  if (!mid || mid.into !== 10 || mid.need !== tbl[5] - tbl[4] || SK.tradeProgress({ xp: 0, level: 5 }) !== null || SK.tradeProgress({ xp: tbl[5], level: 5 }) !== null)
    fails.push('AW-J1 the trade bar reads ' + JSON.stringify([mid, SK.tradeProgress({ xp: 0, level: 5 })]));
  /* the hearth: a fuel row by its id, never a bench row; its spent instant; a gathering pointer is no town work */
  const bones = HS.fuelRowOf('fuel_bones');
  if (!bones || bones.item !== 'bones' || HS.fuelRowOf('smelt_bronze') !== null || HS.fuelRowOf('cook_shrimp') !== null) fails.push('AW-J1 the fuel rows read ' + JSON.stringify([bones, HS.fuelRowOf('smelt_bronze')]));
  const burning = at({ state: { active_kind: 'artisan', active_id: 'fuel_bones', accrued_to: now }, inventory: { bones: 10 } });
  const spent = HS.fuelSpentAtMs(burning);
  if (!bones || spent !== Date.parse(now) + 10 * HS.fuelEachMs(bones) + 2000) fails.push('AW-J1 the spent instant reads ' + spent);
  if (HS.fuelSpentAtMs(at({ state: { active_kind: 'gather', active_id: 'copper_rock', accrued_to: now }, inventory: {} })) !== null) fails.push('AW-J1 a gathering pointer has a spent instant');
  if (TP.townWorkRunning({ active_kind: 'gather', active_id: 'copper_rock' }, null) || !TP.townWorkRunning({ active_kind: 'artisan', active_id: 'fuel_bones' }, null)) fails.push('AW-J1 town work reads a gathering pointer, or not a fuel run');
  /* #10 (itemization audit 2026-11-18, re-aimed from the bench rows' AW-102): a drop no open ground gives names nothing on the card */
  const { MONSTERS } = await imp('src/data/monsters.js');
  const { ITEMS } = await imp('src/data/items.js');
  const G = await imp('src/shell/hunt-ground-facts.js');
  const L = await imp('src/shell/item-lore.js');
  const dropped = new Set(Object.values(MONSTERS).flatMap((m) => (m.drops || []).map((d) => d.id)));
  const closed = [...dropped].filter((id) => ITEMS[id] && !G.dropWhereWords(id));
  if (!closed.length) fails.push('AW-J1 no item drops only on a closed ground: the case proves nothing');
  const said = closed.filter((id) => L.sourcesOf(id).some((x) => /aren.t open|not open/i.test(x) || /^Dropped by/.test(x)));
  if (said.length) fails.push('AW-J1 the card names a closed ground for ' + said.slice(0, 3).join(', '));
  return fails;
}

async function pure() {
  return jobsRules(ROOT);
}

/* The page rules, in the monolith's order (a mutant is caught by the first rule that goes red: tests/_alpha-windows.mjs pageRun). */
async function checks(overrides, shots, opts) {
  return pageRun(overrides, shots, opts, pure, async ({ fails, open, shot }) => {
    /* mutant-rules-start */
    { // AW-60 THE WINDOWS SAY IT (blind crafting panel 2026-11-01): the rules above, read where the player reads them
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = {};
        e.inventory = { slime_gel: 12, rat_tail: 31, venom_sac: 3, chalked_fire_rune: 40, turnip_juice: 9, cooked_shrimp: 5, stone_maul: 1 };
        e.shop = Object.assign({}, e.shop, { bids: { slime_gel: 5, rat_tail: 6, venom_sac: 40, turnip_juice: 6, cooked_shrimp: 3, stone_maul: 20 } });
        /* the deed names Venom Sac, a Junk drop no recipe spends: only the House's own word keeps it from Sell all junk */
        e.home = { tier: 2, rooms: [], tiers: [{ offer: 'property.manor', name: 'Stonecross Manor', tier: 3, need: 2, owned: false, gold: 10000, items: { timber_beam: 6, silk_thread: 8, venom_sac: 2 } }] };
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      const say = (q) => page.evaluate((x) => { const el = document.querySelector(x); return el ? el.textContent : null; }, q);
      if (!up) fails.push('AW-60 the town did not mount');
      else {
        /* The Shop: Slime Gel is a Material (Timber Beam is made from it); Venom Sac is Junk the House's next deed names;
           Rat Tail is Junk nothing wants. Only the first two are kept, and the button's price is the Rat Tails alone. */
        await openWin(page, 'v', 'shop');
        await page.click('[data-hs-win="shop"] .hw-tab[data-tab="sell"]');
        await page.waitForTimeout(200);
        const gel = await say('[data-hs-win="shop"] .hw-sell-list .hw-line[data-item="slime_gel"] small');
        const tail = await say('[data-hs-win="shop"] .hw-sell-list .hw-line[data-item="rat_tail"] small');
        const sac = await say('[data-hs-win="shop"] .hw-sell-list .hw-line[data-item="venom_sac"] small');
        if (!/Kept by Sell all junk/.test(gel || '') || /Kept by Sell all junk/.test(tail || '')) fails.push('AW-60 the Shop: Slime Gel ' + gel + ' / Rat Tail ' + tail);
        if (!/Kept by Sell all junk/.test(sac || '')) fails.push('AW-60 the Shop forgets the deed that names Venom Sac: ' + sac);
        if (!/ for 186 gp$/.test(await say('[data-hs-win="shop"] [data-hs-act="sell-loot"]') || '')) fails.push('AW-60 Sell all junk is priced ' + await say('[data-hs-win="shop"] [data-hs-act="sell-loot"]'));
        /* AW-60n the note under the two sales reads aloud as sentences (audit 2026-11-18 A14: "Keeps worn, higher-tier and Rare pieces Keeps 8 Material
           stacks" ran on): an outgrown Stone Maul for Sell spare gear, the kept Materials for Sell all junk, each part closed by its own stop */
        const note = await say('[data-hs-win="shop"] .hw-sell-note');
        if (!/^Sell spare gear: keeps [^·]+ · Sell all junk: keeps \d+ Material stacks [^·.]*$/.test(note || '')) fails.push('AW-60n the Sell tab\'s note reads ' + JSON.stringify(note));
        /* (the gathering tools' warnings, on a sale and in Storage, left with the tools: 09-crafting 4.17) */
        /* The House: a short material's source sits under its cost. */
        await openWin(page, 'e', 'house');
        const house = await say('[data-hs-win="house"] .hw-deed');
        if (!/Timber Beam 6 \(none in bag or Storage\)/.test(house || '') || !/Silk Thread 8[^.]*Dropped by .* at Mill Cellar/.test(house || '')) fails.push('AW-60 the House reads ' + house);
        /* (a bench row's short input and no-buyer tag, and the tool line, left with the client's bench: 09-crafting 4.17) */
        /* The ground's page lists its materials, with the engine's chance. */
        await openWin(page, 'h', 'hunts');
        await page.click('.hw-hunt[data-hunt="meadowbrook_thicket"]');
        await page.waitForTimeout(250);
        if (!/Wolf Pelt\s*Briarcoat Wolf and Old Grayjaw\s*\d/.test(await page.evaluate(() => document.querySelector('[data-hs-win="hunts"] .hw-hd-mats')?.innerText || ''))) fails.push('AW-60 the Thicket\'s Materials read ' + await say('[data-hs-win="hunts"] .hw-hd-mats'));
        /* The tooltip: a stack with no bid says who won't buy it, in plain words. */
        await openWin(page, 'b', 'inventory');
        await page.hover('[data-hs-win="inventory"] .hw-pocket[data-item="chalked_fire_rune"]');
        const tip = await wait(page, () => document.querySelector('.hw-tip.is-on'), null, 1500) ? await say('.hw-tip') : '';
        if (!/Own use only, can't be sold/.test(tip) || /priced/.test(tip)) fails.push('AW-60 the rune\'s tooltip reads ' + tip);
        await page.mouse.move(2, 2);
      }
      if (errors.length) fails.push('AW-60 console errors: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }

    { // AW-22 THE JOBS LIST (09-crafting 4.17): the Work window is the town work; every number the server's; Start, the running line, Stop
      const W = '[data-hs-win="skills-trade"]';
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.inventory = Object.assign({}, e.inventory, { shrimp: 30, bones: 5 });
        e.work_day = { cap_ms: 36000000, today_ms: 7200000, left_ms: 28800000, premium: false };
        e.trade_jobs = tradeJobsFixture(e.now, { cooking: 3, smithing: 5 });
        /* a shut job the server lists FIRST (the imbuements lead its list): the page shows what the hero can start before it */
        e.trade_jobs.recipes.unshift({ id: 'imbuement_fire_ward', name: 'Make Fire Ward', trade: 'artificing', kind: 'imbuement', band: 0, face: 'fire_ward', r_level: 1,
          inputs: { bones: 4 }, quote: { ok: false, error: 'band_locked' } });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      /* the server takes the job: the next read holds it running (the stub moves its own record, as hr_trade_job_start does) */
      s.onCall = (name, b) => {
        const tj = s.env.trade_jobs;
        if (name === 'hr_trade_job_start') tj.job = { id: '11111111-1111-4111-8111-111111111111', recipe: b.p_recipe, name: 'Cook Shrimp', face: 'cooked_shrimp', trade: 'cooking', band: 0,
          count: b.p_count, fee: b.p_fee, started_at: s.env.now, ends_at: new Date(Date.parse(s.env.now) + 4 * 3600000).toISOString(), attempt_ms: 1440000, due: false };
        if (name === 'hr_trade_job_end') { tj.last = { recipe: tj.job.recipe, name: tj.job.name, face: tj.job.face, settled_at: s.env.now, result: { end: 'early', attempts: 2, plain: 2, fine: 0, master: 0, xp: 1440 } }; tj.job = null; }
        if (name === 'hr-accrue' && b.verb === 'set_activity' && b.activity && b.activity.kind === 'idle') Object.assign(s.env.state, { active_kind: 'idle', active_id: null });
      };
      const say = (q) => page.evaluate((x) => { const el = document.querySelector(x); return el ? el.textContent : null; }, q);
      const jobRow = () => page.evaluate((w) => { const li = document.querySelector(w + ' .hw-job[data-id="meal_b0"]'); const b = li && li.querySelector('[data-hs-act="work-go"]');
        return li ? { name: li.querySelector('.hw-job-name').textContent, inputs: li.querySelector('.hw-job-inputs').textContent, quote: li.querySelector('.hw-job-quote').textContent, off: !!b && b.disabled } : null; }, W);
      const jobLine = () => page.evaluate((w) => { const l = document.querySelector(w + ' .hw-jobs-now'); return l ? { on: l.classList.contains('is-on'), text: l.querySelector('.hw-burying-q').textContent,
        collect: l.querySelector('[data-hs-act="tjob-collect"]').disabled, stop: l.querySelector('[data-hs-act="tjob-stop"]').disabled } : null; }, W);
      if (!up) fails.push('AW-22 the town did not mount');
      else if (!(await openWin(page, 'g', 'skills-trade'))) fails.push('AW-22 G opened no Work window');
      else {
        await page.waitForTimeout(300);
        /* AW-22T (UI audit 2026-11-18) the band's name stands on ONE line */
        const titleLines = await page.evaluate((w) => { const h = document.querySelector(w + ' .hs-win-title'); return Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)); }, W);
        if (titleLines !== 1) fails.push('AW-22T the Work band takes ' + titleLines + ' lines');
        /* the window: the work day, the Jobs list, the trades; no gathering node and no bench row anywhere */
        const day = await say(W + ' .hw-work-day');
        if (!/^Town work left today: 8 h of 10 h$/.test(day || '')) fails.push('AW-22 the work day reads ' + JSON.stringify(day));
        const old = await page.evaluate((w) => document.querySelectorAll(w + ' .hw-work-row:not(.hw-job), ' + w + ' [data-hs-act="work-go"][data-kind], ' + w + ' [data-hs-act="open-skill"]').length, W);
        if (old) fails.push('AW-22 the Work window still draws ' + old + ' gathering or bench control(s)');
        await page.click(W + ' .hw-tab[data-tab="skills"]');
        const trades = await page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .hw-trades .hw-skill')).map((li) => li.getAttribute('data-key') + ':' + li.querySelector('.hw-skill-lv').textContent), W);
        if (trades.length !== 9 || !trades.includes('cooking:3') || !trades.includes('smithing:5')) fails.push('AW-22 the trades read ' + JSON.stringify(trades));
        await page.click(W + ' .hw-tab[data-tab="jobs"]');
        const row = await jobRow();
        if (!row || row.name !== 'Cook Shrimp' || row.inputs !== 'Uses 1 Raw Shrimp each' || !/^10 · \d+ h/.test(row.quote) || row.off) fails.push('AW-22 the job row reads ' + JSON.stringify(row));
        const order = await page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .hw-jobs-rows .hw-job')).map((li) => li.getAttribute('data-id') + (li.classList.contains('is-off') ? ':shut' : '')), W);
        if (order.join() !== 'meal_b0,imbuement_fire_ward:shut') fails.push('AW-22 the Jobs list reads ' + JSON.stringify(order) + ', want what the hero can start first');
        if (shots) await shot(page, 'work-1440x900-jobs');
        /* Start: ONE hr_trade_job_start naming the server's quote, never a number of the page's own */
        await page.click(W + ' .hw-job[data-id="meal_b0"] [data-hs-act="work-go"]');
        await page.waitForTimeout(900);
        const go = sent(s, 'hr_trade_job_start');
        if (go.length !== 1 || go[0].body.p_recipe !== 'meal_b0' || go[0].body.p_count !== 10 || go[0].body.p_fee !== 0 || go[0].body.p_slot !== 0 || !go[0].body.p_idem)
          fails.push('AW-22 Start sent ' + JSON.stringify(go.map((c) => c.body)));
        const running = await jobLine();
        if (!running || !running.on || !/^Cook Shrimp: 10 · \d+ h( \d+ m)? left$/.test(running.text) || !running.collect || running.stop) fails.push('AW-22 the running job reads ' + JSON.stringify(running));
        if (!(await jobRow()) || !(await jobRow()).off) fails.push('AW-22 a second Start is on while a job runs');
        if (!(await reloadAndPlay(page))) fails.push('AW-22 the reload did not come back');
        else {
          await openWin(page, 'g', 'skills-trade');
          await page.waitForTimeout(300);
          const back = await jobLine();
          if (!back || !back.on || !/^Cook Shrimp: 10 · /.test(back.text)) fails.push('AW-22 after a reload the job reads ' + JSON.stringify(back));
          /* Stop: ONE hr_trade_job_end, early; the server lands what is done and the line says the last job */
          await page.click(W + ' [data-hs-act="tjob-stop"]');
          await page.waitForTimeout(900);
          const end = sent(s, 'hr_trade_job_end');
          if (end.length !== 1 || end[0].body.p_early !== true || end[0].body.p_slot !== 0) fails.push('AW-22 Stop sent ' + JSON.stringify(end.map((c) => c.body)));
          const last = await say(W + ' .hw-jobs-last');
          if (!/^Last job: 2 Cooked Shrimp · \+1,440 Cooking XP$/.test(last || '')) fails.push('AW-22 after the Stop the last job reads ' + JSON.stringify(last));
          /* THE HEARTH: a fuel run the server's pointer holds shows its line and its Stop here too, and Stop is ONE set_activity idle */
          s.env.state = Object.assign({}, s.env.state, { active_kind: 'artisan', active_id: 'fuel_bones', active_since: s.env.now, accrued_to: s.env.now });
          await pushEnvelope(page, s);
          const hearth = await page.evaluate((w) => { const l = document.querySelector(w + ' .hw-work-now'); return l ? { on: l.classList.contains('is-on'), text: l.textContent, off: l.querySelector('button').disabled } : null; }, W);
          if (!hearth || !hearth.on || !/^Fueling the Great Hearth with Bones · 5 left/.test(hearth.text) || hearth.off) fails.push('AW-22 the hearth line reads ' + JSON.stringify(hearth));
          if (shots) await shot(page, 'work-1440x900-hearth');
          await page.click(W + ' .hw-work-now [data-hs-act="work-stop"]');
          await page.waitForTimeout(900);
          const idle = sent(s, 'hr-accrue', 'set_activity');
          if (idle.length !== 1 || JSON.stringify(idle[0].body.activity) !== '{"kind":"idle"}') fails.push('AW-22 the hearth Stop sent ' + JSON.stringify(idle.map((c) => c.body)));
        }
      }
      if (errors.length) fails.push('AW-22 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
      if (shots) { // the phone sheet
        const ph = await open({ viewport: { width: 922, height: 423 }, mutateEnv: town });
        if (ph.up && await openWin(ph.page, 'g', 'skills-trade')) {
          await ph.page.waitForTimeout(300);
          await shot(ph.page, 'work-922x423-jobs');
        }
        await ph.ctx.close();
      }
    }

    { // AW-17 the skills are two windows and neither scrolls, on the phone too; the first-minute pointer
      /* A character that has killed nothing: Level XP 0 (the core rebuild: Level comes from kills only). */
      const fresh = (e) => { for (const k of Object.keys(e.skills)) if (['melee', 'defense', 'inner_flame', 'magic', 'ranged'].includes(k)) e.skills[k] = { xp: 0, level: 1 }; for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 }); e.trade_jobs = tradeJobsFixture(e.now); };
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 }, mutateEnv: fresh });
      if (up) {
        const ptr = await page.evaluate(() => { const p = document.querySelector('.hs-pointer'); return p ? p.textContent : null; });
        if (!ptr || !/Hunts → Mill Cellar → Enter/.test(ptr)) fails.push('AW-17 a fresh character sees no pointer to Hunts: ' + JSON.stringify(ptr));
        if (shots) await shot(page, 'alpha-922x423-first-minute');
        /* AW-17b THE RING (designer playtest 2026-10-24: on a phone nothing said which of 16 icons is Hunts): the card's
           control wears the gold ring, and the card goes INTO the window it points at: the Hunts icon, then (the phone
           shows the list first) the Mill Cellar's line, with the card at the top of the sheet. */
        const ringed = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-coach-ring]')).map((e) => (e.getAttribute('data-hs-open') || e.getAttribute('data-hunt') || e.className) + (e.getClientRects().length ? '' : ':hidden')));
        const r0 = await ringed();
        if (r0.join() !== 'hunts') fails.push('AW-17b a fresh character\'s ring is on ' + JSON.stringify(r0) + ', wanted the Hunts icon');
        /* AW-73 ON A PHONE THE CARD'S CROSS IS DRAWN IN ITS BUTTON (door panel 2026-11-04): static, it lay over the words in the middle of every closable card. */
        const cross = await page.evaluate(() => {
          const p = document.createElement('p'); p.className = 'hs-pointer has-close';
          p.innerHTML = '<b>A card</b> <span class="hs-coach-text">words</span><button class="hs-coach-min"></button><button class="hs-coach-close"></button>';
          document.querySelector('.hs-launchers').append(p);
          const x = p.querySelector('.hs-coach-close'), out = { pos: getComputedStyle(x).position, width: x.getBoundingClientRect().width };
          p.remove();
          return out;
        });
        if (cross.pos === 'static' || cross.width !== 40) fails.push('AW-73 the phone card\'s cross: ' + JSON.stringify(cross));
        if (await openWin(page, 'h', 'hunts')) {
          await page.waitForTimeout(400);
          const r1 = await ringed();
          const inWin = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="hunts"] > .hs-win-coach .hs-pointer'); return p ? p.textContent : null; });
          if (r1.join() !== 'mill_cellar') fails.push('AW-17b with Hunts open on the phone the ring is on ' + JSON.stringify(r1) + ', wanted the Mill Cellar line');
          /* inside the window it says its words for there (board 2026-10-25 #20: never "Open Hunts" over the open Hunts), and the ringed line first (playtest 10-29) */
          if (!inWin || !/Press the Mill Cellar, then Enter/.test(inWin) || /Open Hunts/.test(inWin)) fails.push('AW-17b the card is not inside the Hunts sheet, in its words for there: ' + JSON.stringify(inWin));
          if (shots) await shot(page, 'alpha-922x423-first-minute-hunts');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        } else fails.push('AW-17b H did not open Hunts');
        for (const [key, id] of [['g', 'skills-trade']]) {
          if (!(await openWin(page, key, id))) { fails.push('AW-17 ' + id + ' did not open'); continue; }
          await page.waitForTimeout(300);
          await page.click('[data-hs-win="skills-trade"] .hw-tab[data-tab="skills"]');
          await page.waitForTimeout(150);
          const m = await page.evaluate((w) => { const b = document.querySelector('[data-hs-win="' + w + '"] .hs-win-body'); return { sh: b.scrollHeight, ch: b.clientHeight, n: b.querySelectorAll('.hw-trades .hw-skill').length }; }, id);
          if (m.sh > m.ch + 1 || m.n < 4) fails.push('AW-17 ' + id + ' at 922x423 scrolls (' + m.sh + ' > ' + m.ch + ') or lists ' + m.n + ' skills');
        }
      } else fails.push('AW-17 the phone did not mount');
      await ctx.close();
    }
  });
}

const MUTANTS = [
  ['AW-60 the Shop forgets the House', 'src/shell/windows/shop.js', 'const needs = upgradeNeeds(homeOf(st.cs), chestsOf(st.cs));', 'const needs = undefined;'],
  ['AW-60 the tooltip says nothing of a stack no one buys', 'src/shell/windows/item-tip.js', 'const sale = saleWords(id);', "const sale = '';"],
  ['AW-60n the Sell note runs on again (audit A14)', 'src/data/text/shop.js', "  spare_keeps: 'Sell spare gear: keeps worn, higher-tier and Rare pieces',", "  spare_keeps: 'Keeps worn, higher-tier and Rare pieces',"],
  ['AW-22T the band reads a long name again', 'src/data/shell-windows.js', "key: 'g', glyph: 'uiPickaxe', width: 380,", "title: 'Gathering and crafting', key: 'g', glyph: 'uiPickaxe', width: 380,"],
  ['AW-73 the phone card\'s cross lies on its words', 'src/styles/shell.css', '.hs-pointer:not(.is-min) > .hs-coach-close { position: relative; top: auto; right: auto;', '.hs-pointer:not(.is-min) > .hs-coach-close { position: static;'],
  /* AW-22 the Jobs list in the page */
  ['AW-22 Start sends a count of its own', 'src/shell/windows/work-jobs.js', 'startTradeJob(ctx.account, cs, r.id, r.quote.count, r.quote.fee)', 'startTradeJob(ctx.account, cs, r.id, r.quote.count + 1, r.quote.fee)'],
  ['AW-22 a second Start while a job runs', 'src/shell/windows/work-jobs.js', "prop(li.querySelector('[data-hs-act=\"work-go\"]'), 'disabled', !(q && q.ok) || !!job || sc.pending);", "prop(li.querySelector('[data-hs-act=\"work-go\"]'), 'disabled', !(q && q.ok) || sc.pending);"],
  ['AW-22 the shut jobs lead the list again', 'src/shell/windows/work-jobs.js', 'list.rows.slice().sort((a, b) => open(b) - open(a) || a.rLevel - b.rLevel);', 'list.rows.slice();'],
  ['AW-22 the running job has no line', 'src/shell/windows/work-jobs.js', "  cls(line, 'is-on', !!job);", "  cls(line, 'is-on', false);"],
  ['AW-22 Stop collects instead', 'src/shell/windows/work-jobs.js', "() => endTradeJob(ctx.account, cs, true)", "() => endTradeJob(ctx.account, cs, false)"],
  ['AW-22 the work day is not said', 'src/shell/windows/work.js', "  text(dayEl, !day ? '' : day.leftMs > 0", "  text(dayEl, true ? '' : day.leftMs > 0"],
  ['AW-22 the hearth line is never shown', 'src/shell/windows/work.js', "  cls(now, 'is-on', !!line);", "  cls(now, 'is-on', false);"],
  ['AW-22 the hearth Stop sends nothing', 'src/shell/windows/work.js', '    if (buryingOf(cs)) stopBury(cs, sc,', '    if (false) stopBury(cs, sc,'],
  ['AW-22 the trades read this build\'s Levels', 'src/shell/windows/skills.js', "        text(li.querySelector('.hw-skill-lv'), String(r.level));\n        const p = tradeProgress(r);", "        text(li.querySelector('.hw-skill-lv'), '1');\n        const p = tradeProgress(r);"],
  ['a watched fuel run is never re-read', 'src/shell/shell.js', "(wm.isOpen('skills-trade') || wm.isOpen('inventory'))) watchTown(ctx.character);", "false) watchTown(ctx.character);"],
  /* AW-J1 pure: `jobs:` mutants are judged by jobsRules on a temp copy of src (tickerMutant) */
  ['jobs: a recipe with no face is drawn', 'src/session/job-quotes.js', "    if (!isObj(r) || !id(r.id) || !id(r.face) || !id(r.trade)) continue;", "    if (!isObj(r) || !id(r.id) || !id(r.trade)) continue;"],
  ['jobs: a refusal reads as a quote', 'src/session/job-quotes.js', '  if (q.ok === true) {', '  if (q.ok !== undefined) {'],
  ['jobs: a list not sent reads as an empty one', 'src/session/job-quotes.js', '  if (!sent) return { loading: true, rows: [] };', '  if (!sent) return { loading: false, rows: [] };'],
  ['jobs: a row with no quote yet is quoted here', 'src/session/job-quotes.js', '  if (!isObj(q)) return null;', '  if (!isObj(q)) return { ok: true, count: 1, fee: 0, endsAt: null };'],
  ['jobs: a counted fuel run says the stock', 'src/session/hearth-sections.js', '  return isObj(b) && Number.isInteger(b.left) && b.left > 0 ? b.left : null;', '  return null;'],
  ['jobs: the coach reads no trade XP', 'src/session/tutorial-sections.js', '    tradeXp: tradeXpOf(cs),\n', ''],
  ['jobs: the coach rings no job', 'src/shell/launcher-coach.js', "typeof g.job !== 'string' ? [] : [inWin(", "true ? [] : [inWin("],
  ['jobs: the work day says what is used as left', 'src/session/trade-sections.js', 'leftMs: n(s.left_ms)', 'leftMs: n(s.today_ms)'],
  ['jobs: the unlock names the job the Level already opened', 'src/shell/windows/skills.js', '  const next = jobsOf(trade).filter((j) => j.R > level);', '  const next = jobsOf(trade).filter((j) => j.R >= level - 10);'],
  ['jobs: the trade bar is drawn outside the server\'s Level', 'src/shell/windows/skills.js', '  if (!Number.isSafeInteger(lo) || r.xp < lo || (hi !== null && r.xp >= hi)) return null;', '  if (!Number.isSafeInteger(lo)) return null;'],
  ['jobs: a bench row reads as a fuel', 'src/session/hearth-sections.js', '  if (!r || r.output || typeof r.input !== \'string\' || typeof r.id !== \'string\') continue;', '  if (!r || typeof r.id !== \'string\') continue;'],
  ['jobs: a gathering pointer is town work again', 'src/session/town-poll.js', "  if (state.active_kind !== 'artisan') return false;", "  if (state.active_kind !== 'artisan' && state.active_kind !== 'gather') return false;"],
  ['jobs: the card names a closed ground again', 'src/shell/item-lore.js', '  if (drop) out.push(drop);', '  if (r && r.drops.length) out.push(drop || "Dropped by creatures on grounds no one can reach yet");'],
];

const COMPANION = {};

const GUARD = 'tests/alpha-windows-work.mjs';
/* A mutant whose name starts so is judged by that pure rule function on a planted copy of src (tickerMutant), never the page. */
const JUDGES = {
  'jobs:': (over) => tickerMutant(over, jobsRules),
};

async function main() {
  const g = { guard: GUARD, green: 'the Work window is the Jobs list, the work day, the hearth and the trades, every number the server\'s; the windows say what an item is for; skills split', pure: pure, checks: checks, mutants: MUTANTS, companion: COMPANION, judges: JUDGES };
  if (process.argv.includes('--shard-plan')) return shardPlan(g);
  if (process.argv.includes('--mutate')) return mutate(g);
  return plain(g);
}

main().then((code) => process.exit(code));
