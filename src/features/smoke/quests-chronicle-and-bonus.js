// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/quests-chronicle-and-bonus.js — quest navigation, the copy gate, the Chronicle and the bonus rebase.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 67 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampRecordLikeLoad, xpOf, predZero, goldOf, snapshotG, seedPlayStreak, restoreG, restoreGAndRecord, zeroRenownTerms, restoreRenownTerms, on, snapshot, closeOverlays, hrCharmDriver, phoneFrame, feedServerGoals, goalRow, serverBagFixture, armActivityTransport, drain, restoreAccrualSwitch } from './_harness.js?v=566';
import { THIS_WEEK, THIS_WEEK_QUIET } from '../../data/this-week.js?v=566';

export default [

  /* ══ b227 — quest navigation (audit finding #2) ═══════════════════════════
     "Take me to the area that the quest is asking me to complete." Before
     this, the Quests modal had no navigation at all and Home's quest buttons
     said View and opened a modal that did not contain the quest. These four
     tests hold the three things that can rot: the mapping's TOTALITY, the
     mapping's ANSWERS, ARRIVAL (right panel AND right thing on it), and the
     modal button actually being wired.                                      */

  () => tryRun('b227: the quest resolver is TOTAL over every live goal pool', () => {
    const QN = window.HearthriseQuestNav;
    assert(QN && typeof QN.destination === 'function', 'HearthriseQuestNav missing — quest rows cannot route');
    const live = QN.livePools();
    assert(live.length >= 20,
      'expected the daily + weekly + task pools + starter quests, got ' + live.length);
    // The fallback exists so a click is never dead. It must never be the
    // answer for shipped content — that is how "every card is a door" rots
    // into "every card is the skills grid".
    const orphans = QN.unmapped(live);
    assert(orphans.length === 0,
      'these live goals fall through to the skills-grid fallback: ' +
      JSON.stringify(orphans.map((g) => g.id || g.label || g.name)));
    // And the fallback is still reachable, so an unknown goal is safe.
    assert(QN.destination({ id: 'x', name: 'zzzz' }).via === 'fallback',
      'an unrecognisable goal must still resolve to the skills grid');
    assert(QN.destination(null).tab === 'skills', 'the resolver must be total for null too');
  }),

  () => tryRun('b227: the type -> destination table, as shipped', () => {
    const QN = window.HearthriseQuestNav;
    const at = (goal) => { const d = QN.destination(goal); return d.tab + (d.skillId ? '/' + d.skillId : ''); };
    const byId = (pool, id) => (window[pool] || []).find((g) => g.id === id);

    // Daily goals route on what they MEASURE (`source`).
    assert(at(byId('DAILY_GOAL_POOL', 'fish')) === 'skills/fishing', 'Catch 50 fish -> fishing');
    assert(at(byId('DAILY_GOAL_POOL', 'gather_logs')) === 'skills/woodcutting', 'Gather 60 logs -> woodcutting');
    assert(at(byId('DAILY_GOAL_POOL', 'mine_ore')) === 'skills/mining', 'Mine 60 ores -> mining');
    assert(at(byId('DAILY_GOAL_POOL', 'cook')) === 'skills/cooking', 'Cook 25 dishes -> cooking');
    assert(at(byId('DAILY_GOAL_POOL', 'kill_any')) === 'combat', 'Slay 10 monsters -> combat');
    assert(at(byId('DAILY_GOAL_POOL', 'plant')) === 'farming', 'Plant 3 crops -> the farm');
    /* b465: `gold_500` is WITHDRAWN from DAILY_GOAL_POOL (unpayable reward — see
       the ruling at the pool row). Its ROUTING is still asserted, off a literal,
       so the market arm of the table stays covered and the row can be restored
       without re-deriving it. */
    assert(at({ id: 'gold_500', name: 'Earn 500 gold', source: '_dailyGoldDelta' }) === 'market',
      'Earn 500 gold -> the market');
    assert(at(byId('DAILY_GOAL_POOL', 'level_up')) === 'skills', 'Gain a level -> the skills grid (any skill will do)');
    assert(at(byId('WEEKLY_GOAL_POOL', 'wk_logs')) === 'skills/woodcutting', 'Cut 250 logs -> woodcutting');
    assert(at(byId('WEEKLY_GOAL_POOL', 'wk_gather')) === 'skills/mining', 'Gather 250 ores -> mining (it reads stats.mined)');

    // Daily TASKS route on `type` — updateDaily()'s own action vocabulary.
    assert(at({ type: 'smithed', label: 'Smith 40 items' }) === 'skills/smithing', 'smithed -> smithing');
    assert(at({ type: 'crafted', label: 'Craft 40 items' }) === 'skills/crafting', 'crafted -> crafting');
    assert(at({ type: 'harvest', label: 'Harvest 24 crops' }) === 'farming', 'harvest -> the farm');
    assert(at({ type: 'gather', label: 'Gather 50 resources' }) === 'skills', 'a generic gather -> the grid, not a guess');

    // The gathering third of the source table is INVERTED from the map the
    // game writes those counters through — one list, not two.
    assert(window.SKILL_ACTION_STAT && window.SKILL_ACTION_STAT.fishing === 'fished',
      'SKILL_ACTION_STAT must be published — quest-nav inverts it');

    // A bounty is a goal too, and its "where" is the board.
    assert(at({ id: 'b1', type: 'cull', target: 'wolf', tier: 1, difficulty: 'easy', required: 8 }) === 'bounty',
      'a bounty contract -> the bounty board');

    // Copy honesty: a goal that names a thing gets a button that names it.
    assert(QN.destination(byId('DAILY_GOAL_POOL', 'fish')).verb === 'Go fish', 'the fish daily should say Go fish');
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    QN.livePools().forEach((g) => {
      const d = QN.destination(g);
      assert(!EMOJI.test(d.verb + d.label), 'destination copy must carry no emoji: ' + d.verb);
    });
  }),

  /* FIRST-30-1 — the first-day card's FIRST button ("Gather 15 resources") names its action.
     Drives the real card renderer on a fresh chain, reads the button, presses the door.
     Mutation: `gather: GRID` in quest-nav.js TYPE_DEST → red on the first assert. */
  () => tryRun('b562 FIRST-30-1: "Gather 15 resources" says Go gather and lands on the skills grid; "Gain a level" still says Go train', () => {
    const QN = window.HearthriseQuestNav, H = window.HearthriseHome, G = window.G;
    assert(QN && H && typeof H.__firstDayModel === 'function' && typeof H.__firstDayHtml === 'function',
      'CONTROL: the quest resolver or the first-day seams are unpublished — this would pass vacuously');
    const snap = snapshotG();
    const prior = (document.querySelector('.panel.active') || {}).id || 'panel-profile';
    try {
      G.quests = []; G.daily = { lastReset: window.hrGoalDayKey(), tasks: [] };
      window.ensureRetentionState();
      const m = H.__firstDayModel();
      assert(m && m.steps.length >= 5, 'CONTROL: a fresh character has no first-day chain: ' + JSON.stringify(m && m.steps.map((s) => s.id)));
      const i = m.steps.findIndex((s) => s.id === 'gatherer');
      assert(i >= 0, 'the first-day chain lost its gather step: ' + m.steps.map((s) => s.id).join(','));
      const doc = new DOMParser().parseFromString(H.__firstDayHtml(m), 'text/html');
      const cta = doc.querySelector('.hd-fl-row[data-i="' + i + '"] .hd-cta');
      assert(cta && cta.textContent === 'Go gather',
        'the gather step\'s button reads "' + (cta && cta.textContent) + '" — a new player is told to TRAIN when the row says GATHER');
      // No open first-day row may fall back to the generic verb: each names its action.
      doc.querySelectorAll('.hd-fl-row .hd-cta').forEach((b) => {
        assert(b.textContent !== 'Go train', 'a first-day row still offers the generic "Go train": ' + b.closest('.hd-fl-row').textContent.trim().slice(0, 60));
      });
      // The daily "Gather N resources" tasks share the door and the word.
      assert(QN.destination({ type: 'gather', label: 'Gather 120 resources' }).verb === 'Go gather', 'the gather daily task still says Go train');
      const lvl = (window.DAILY_GOAL_POOL || []).find((g) => g.id === 'level_up');
      assert(lvl && QN.destination(lvl).verb === 'Go train', '"Gain a level" is a TRAIN goal and must keep its verb: ' + (lvl && QN.destination(lvl).verb));
      // Press it: the door is still the skills grid (any gathering skill counts).
      const d = QN.go(m.steps[i].goalRow);
      assert(d && d.tab === 'skills' && !d.skillId, 'the gather door moved off the skills grid: ' + JSON.stringify(d));
      assert(document.getElementById('panel-skills').classList.contains('active'), 'pressing Go gather did not open the Skills panel');
    } finally {
      restoreG(snap);
      try { window.showTab(prior.replace(/^panel-/, '')); } catch (e) {}
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     VOICE — b465. THE COPY PASS, AS A GATE.
     Three defects, each of which shipped and each of which is invisible to
     every other guard in this suite, because the suite reads state and this
     class of bug is entirely in the WORDS:
       VOICE-1  the quests modal printed one filler sentence on every row
       VOICE-2  the topbar counted down to a feature the player cannot open
       VOICE-3  a price was allowed to be a literal instead of derived
     Each test names the exact defect it re-plants, so a future edit that
     reintroduces it fails here rather than in a store screenshot.
     ══════════════════════════════════════════════════════════════════════ */

  /* The modal's Daily/Weekly tab is MODULE state that outlives the overlay:
     clicking Weekly here and walking away left the next test (b227's Go-button
     guard) reading a weekly row out of the daily pool. Any test that switches
     tabs puts it back. */
  () => tryRun('VOICE-1 (b465): no quest row prints the generic filler line', () => {
    /* THE DEFECT: `g.desc || 'Complete this objective to claim your reward.'`
       with not one pool row carrying a `desc`, so all three rows of a 3-row
       modal printed the same content-free sentence. It is in our own store
       screenshots. */
    const FILLER = 'Complete this objective to claim your reward';

    // (a) EVERY authored row carries its own description. This is the fix; the
    //     fallback below is only the floor.
    const pools = [['DAILY_GOAL_POOL', window.DAILY_GOAL_POOL], ['WEEKLY_GOAL_POOL', window.WEEKLY_GOAL_POOL]];
    pools.forEach(([name, pool]) => {
      assert(Array.isArray(pool) && pool.length, name + ' must exist');
      pool.forEach((g) => {
        assert(typeof g.desc === 'string' && g.desc.trim().length >= 20,
          name + '/' + g.id + ' needs a real one-line description (got ' + JSON.stringify(g.desc) + ')');
        assert(g.desc.indexOf(FILLER) < 0, name + '/' + g.id + ' is printing the filler line');
        // A description earns its space by saying something the NAME does not.
        assert(g.desc.trim().toLowerCase() !== String(g.name || '').trim().toLowerCase(),
          name + '/' + g.id + ' description just repeats the name');
      });
    });

    // (b) THE RENDERED MODAL — what the player actually reads. Zero instances,
    //     on both tabs, not "the pool looks fine".
    const wasOpen = !!document.getElementById('quests-modal-overlay');
    try {
      window.openQuestsModal();
      const ov = document.getElementById('quests-modal-overlay');
      assert(ov, 'the quests modal must open');
      const readAll = () => (ov.innerText || ov.textContent || '');
      assert(readAll().indexOf(FILLER) < 0, 'the DAILY tab still renders the filler line');
      const wk = ov.querySelector('.qm-tab[data-tab="weekly"]');
      if (wk) { wk.click(); assert(readAll().indexOf(FILLER) < 0, 'the WEEKLY tab still renders the filler line'); }
      // And the rows really did render a description each (not an empty div).
      const descs = [...ov.querySelectorAll('.qm-q-desc')];
      assert(descs.length > 0, 'no quest rows rendered — the test proved nothing');
      descs.forEach((d) => assert((d.textContent || '').trim().length >= 20,
        'a quest row rendered an empty/stub description'));
    } finally {
      try { const d = document.querySelector('#quests-modal-overlay .qm-tab[data-tab="daily"]'); if (d) d.click(); } catch (e) {}
      if (!wasOpen && typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
    }
  }),

  () => tryRun('VOICE-1b (b465): the reward summary speaks names, never item ids', () => {
    /* THE DEFECT: rewardSummary pushed `qty + 'x ' + itemId`, so the "Earn 500
       gold" daily advertised "5x small_bones". The renderer is block-scoped, so
       this reads what it PRODUCES, through the modal. */
    const wasOpen = !!document.getElementById('quests-modal-overlay');
    try {
      window.openQuestsModal();
      const ov = document.getElementById('quests-modal-overlay');
      assert(ov, 'the quests modal must open');
      const scan = () => [...ov.querySelectorAll('.qm-r-val')].map((e) => (e.textContent || '').trim());
      const ID_SHAPED = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/;
      const bad = [];
      const sweep = () => scan().forEach((t) => { if (ID_SHAPED.test(t)) bad.push(t); });
      sweep();
      const wk = ov.querySelector('.qm-tab[data-tab="weekly"]');
      if (wk) { wk.click(); sweep(); }
      assert(!bad.length, 'a reward summary printed a raw id: ' + JSON.stringify(bad.slice(0, 3)));
      // The gem glyph was a pictogram standing in for a noun ("1💎").
      const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
      scan().forEach((t) => assert(!EMOJI.test(t), 'a reward summary is using an emoji as a word: ' + t));
    } finally {
      try { const d = document.querySelector('#quests-modal-overlay .qm-tab[data-tab="daily"]'); if (d) d.click(); } catch (e) {}
      if (!wasOpen && typeof window.closeQuestsModal === 'function') window.closeQuestsModal();
    }
  }),

  () => tryRun('VOICE-1c (b465): every offered goal has a payable reward', () => {
    /* THE DEFECT: `gold_500` was dealt to players with `{gold:0, item:
       'starter_bundle_token', items:{small_bones:5}}` — zero gold and two ids
       that exist nowhere in the game, so hr_claim_goal answered
       `reward_unavailable` and the Claim button could never succeed. It is
       withdrawn from the pool; this stops it (or a successor) coming back
       unnoticed. Items are checked against ITEMS, which is the same table the
       claim path pays out of. */
    const ITEMS = window.ITEMS || {};
    const check = (label, g, reward) => {
      assert(reward, label + ' has no reward table entry at all');
      const items = Object.keys(reward.items || {});
      items.forEach((id) => assert(ITEMS[id], label + ' promises item "' + id + '", which is not in ITEMS'));
      const pays = (reward.gold > 0) || (reward.gems > 0)
        || Object.keys(reward.xp || {}).length > 0 || items.length > 0;
      assert(pays, label + ' pays nothing a claim can actually grant');
    };
    (window.WEEKLY_GOAL_POOL || []).forEach((g) => check('WEEKLY_GOAL_POOL/' + g.id, g, g.reward));
    // The daily rewards table is block-scoped; reach it the way the modal does.
    const daily = (typeof window.getGoalsForToday === 'function') ? window.getGoalsForToday() : [];
    assert(daily.length, 'no daily goals were offered — the test proved nothing');
    /* b464 — gold_500 is BACK, because its withdrawal's premise closed: the
       reward is authored on both sides now ({gems:1, items:{bones:5}} here,
       the hr_goal_rewards row updated on production the same hour). The
       Designer's rule survives as the GENERAL clause above — every offered
       goal must be payable, items checked against ITEMS — which is what
       actually guards this, id by id, forever. Assert the specific row is
       payable rather than absent. */
    const g500 = (window.DAILY_GOAL_POOL || []).find((g) => g.id === 'gold_500');
    assert(g500, 'gold_500 must be dealt again — its reward pays now');
  }),

  () => tryRun('VOICE-2 (b465): no gated surface advertises a countdown or a lit door', () => {
    /* THE DEFECT: the Events screen honestly said the muster is "coming in Open
       Beta 1" while the TOPBAR ticked "Rally in 8:01:35" beside it, and the
       combat rail offered a lit "Join ▸" to a clan raid behind the same flag.
       The gate is one flag; every surface behind it must agree with it. */
    const CL = window.HearthriseClans;
    assert(CL && typeof CL.clanLaunched === 'function', 'the clan gate must be readable');
    if (CL.clanLaunched()) return;   // launched: nothing to hide, nothing to assert

    // (a) The topbar pill is not merely hidden — it is not in the DOM. A hidden
    //     countdown still ticks, and still reappears on the next repaint.
    assert(!document.getElementById('hr-muster-pill'),
      'the topbar is counting down to the muster while clans are gated');

    // (b) The topbar carries no countdown copy for it at all.
    const top = document.querySelector('.topbar');
    const topText = top ? (top.innerText || top.textContent || '') : '';
    assert(!/Rally in\s+\d/.test(topText), 'the topbar reads "' + topText.replace(/\s+/g, ' ').slice(0, 80) + '"');

    // (c) The combat rail's clan-raid card is stated as gated, using the same
    //     `locked` field the dungeon and boss cards already use.
    const CS = window.HearthriseCombatScreens;
    if (CS && typeof CS._destinations === 'function') {
      const raid = CS._destinations().find((d) => d.kick === 'Clan Hunt');
      if (raid) {
        assert(raid.locked, 'the Clan Hunt card offers a lit CTA to a gated feature');
        assert(!/^Join/.test(String(raid.locked)), 'a gated card must name the gate, not repeat the invitation');
      }
    }
  }),

  () => tryRun('VOICE-2b (b465): an unaffordable Buy is disabled and says what it needs', () => {
    /* THE DEFECT: `slotRows().canBuy` means "this is the NEXT slot", and both
       renderers read it as "you can afford this" — so a new account holding one
       gem got a lit Buy beside "200 gems". Every other shop row in the game
       disables an unaffordable Buy (render/shop.js); the hero rail did not.

       TWO balances now gate the button, and BOTH deliberately abstain when they
       are UNKNOWN (a player must never be told "not enough" when we simply have
       not been told the number):
         · the gem balance — SERVER-OF-RECORD; drives `afford`/`shortBy`, null
           when the server has not spoken.
         · which slots the account OWNS — the 2026-09-08 hr_buy_hero_slot rewire;
           `serverKnown` reads it from G._heroSlots. Until the envelope has told
           us the owned set, the Buy is disabled as "Checking…/Unavailable", NOT
           a shortfall (the click otherwise dead-ends: hr_buy_hero_slot is the
           only path that can complete a purchase and we don't yet know it is
           reachable). serverKnown is checked FIRST, so a signed-out harness
           lands on that branch, not the shortfall one under test.
       So this arranges the KNOWN state every signed-in player is in — a known
       gem balance AND a server-answered owned set (this account owns only the
       free slot 0, so every rung above it is a paid slot governed by `afford`).
       Then it asserts the shortfall path, and separately that the owned-set-
       unknown branch is ALSO a disabled button, never a live CTA. */
    const B = window.HearthriseBalance;
    const HP = window.HearthriseProfile;
    const G = window.G;
    if (!B || !HP || typeof HP.slotRows !== 'function') return;   // multi-character optional
    const realBalanceNum = B.balanceNum;
    const hadHeroSlots = !!(G && Object.prototype.hasOwnProperty.call(G, '_heroSlots'));
    const realHeroSlots = G ? G._heroSlots : undefined;
    const lockedBuyable = () =>
      HP.slotRows().filter((r) => r.kind === 'locked' && !r.free).find((r) => r.canBuy);
    /* HearthriseHome.render() no-ops unless #panel-profile is the ACTIVE tab
       (its own guard, home-dashboard.js). Mid-suite the home screen usually is
       NOT active, so a bare render() leaves a STALE rail and this would assert
       the wrong DOM. Force the Home screen active for the read — the state a
       player is in when they see the hero rail — and restore it in finally. */
    const panel = document.getElementById('panel-profile');
    const panelWasActive = !!(panel && panel.classList.contains('active'));
    const paintHome = () => {
      if (panel) panel.classList.add('active');
      window.HearthriseHome.render();
      return document.getElementById('panel-profile');
    };
    try {
      // The server has answered: owns ONLY the free slot 0.
      if (G) G._heroSlots = { owned: [0], at: Date.now() };
      B.balanceNum = (g, f) => (f === 'gems' ? 1 : realBalanceNum(g, f));

      const rows = HP.slotRows().filter((r) => r.kind === 'locked' && !r.free);
      assert(rows.length, 'no locked hero slots — the test proved nothing');
      const next = rows.find((r) => r.canBuy);
      assert(next, 'no next-buyable slot');
      // The new field the rewire added, asserted so the shortfall path below is
      // reached deliberately rather than by luck.
      assert(next.serverKnown === true,
        'with G._heroSlots set the next slot must read serverKnown:true (got ' + next.serverKnown + ')');
      assert(next.afford === false, 'a ' + next.cost + '-gem slot must not read as affordable on 1 gem');
      assert(next.shortBy === next.cost - 1,
        'shortBy must be the real gap (got ' + next.shortBy + ' of ' + next.cost + ')');

      // And the RENDERED rail must disable it and name the gap — no live Buy.
      if (window.HearthriseHome && typeof window.HearthriseHome.render === 'function') {
        const rail = paintHome();
        if (rail && /Hero slot/.test(rail.textContent || '')) {
          const live = [...rail.querySelectorAll('[data-herobuy]')];
          assert(!live.length, 'the Home rail still offers a live Buy for a slot the player cannot afford');
          assert(/Needs \d[\d,]* more gems/.test(rail.textContent || ''),
            'the disabled hero-slot button must name the shortfall');
        }
      }

      // THE 2026-09-08 GATE, exercised: with the OWNED set UNKNOWN (server not
      // heard from) the same 1-gem account must ALSO get a disabled button —
      // never a live CTA — because hr_buy_hero_slot cannot yet be asked. This is
      // the honest-button half of the same defect; it must not regress to a lit
      // Buy while the gem balance happens to be known.
      if (G && window.HearthriseHome && typeof window.HearthriseHome.render === 'function') {
        delete G._heroSlots;
        const unknown = lockedBuyable();
        assert(unknown && unknown.serverKnown === false,
          'clearing G._heroSlots must read serverKnown:false (got ' + (unknown && unknown.serverKnown) + ')');
        const rail2 = paintHome();
        if (rail2 && /Hero slot/.test(rail2.textContent || '')) {
          assert(![...rail2.querySelectorAll('[data-herobuy]')].length,
            'a Buy the server cannot yet be asked about must be disabled, not a live CTA');
        }
        G._heroSlots = { owned: [0], at: Date.now() };   // back to the known state
      }

      // AFFORDABLE stays buyable — the guard must not just disable everything.
      B.balanceNum = (g, f) => (f === 'gems' ? 999999 : realBalanceNum(g, f));
      const rich = lockedBuyable();
      assert(rich && rich.afford === true, 'a slot the player CAN afford must stay buyable');
    } finally {
      B.balanceNum = realBalanceNum;
      if (G) {
        if (hadHeroSlots) G._heroSlots = realHeroSlots;
        else delete G._heroSlots;
      }
      if (window.HearthriseHome && typeof window.HearthriseHome.render === 'function') {
        try { window.HearthriseHome.render(); } catch (e) {}
      }
      if (panel && !panelWasActive) panel.classList.remove('active');
    }
  }),

  () => tryRun('VOICE-3 (b465): a price is derived from the data, never a literal', () => {
    /* THE DEFECT CLASS: a price typed into a string drifts from the price the
       spend path charges, and the player is the one who finds out. Proven by
       MUTATION rather than by matching today's number — a literal "50" would
       pass a same-number check. */
    const C = window.COMPANIONS;
    const S = window.HearthriseCompanions;
    assert(C && C.owl, 'the Owl companion must exist');
    assert(S && typeof S.sourceLabel === 'function', 'HearthriseCompanions.sourceLabel must be published');
    const sourceLabel = S.sourceLabel;

    // The authored price, read off the ONE place that owns it.
    const priced = String(C.owl.source || '').split(':');
    assert(priced[0] === 'shop', 'the Owl must still be a shop companion');
    const price = Number(priced[1]);
    assert(Number.isFinite(price), 'the Owl price must be a number in its source');

    const label = sourceLabel(C.owl.source);
    assert(label.indexOf(price.toLocaleString()) >= 0,
      'the Owl label (' + label + ') does not state its authored price ' + price);
    assert(!/\bshop:|_\d|:prayer/.test(label), 'the Owl label is leaking its source key: ' + label);
    // It states the SKILL GATE by name, not by key.
    assert(/Prayer/.test(label), 'the Owl label must name the Prayer requirement: ' + label);

    // MUTATE THE OWNER — the label must follow it, which a literal cannot.
    const mutated = sourceLabel('shop:12345:prayer50');
    assert(mutated.indexOf((12345).toLocaleString()) >= 0,
      'the price is NOT derived — a changed source produced "' + mutated + '"');
    /* Scoped to the GOLD clause on purpose: the Owl's skill gate is "Prayer
       50", so a bare indexOf('50') would match the requirement and fail a
       correct implementation. */
    assert(mutated.indexOf(price.toLocaleString() + ' gold') < 0,
      'the old price survived a source change — it is baked in somewhere: ' + mutated);
  }),

  () => tryRun('b227: Go lands you ON the thing, not just on the right tab', () => {
    const QN = window.HearthriseQuestNav;
    const startTab = window.activeTab || 'profile';
    const prevCat = JSON.parse(JSON.stringify(window._artisanCat || {}));
    const prevViewed = window.__viewedSkillId;
    try {
      // 0 — the base openSkillDetail must publish __viewedSkillId SYNCHRONOUSLY.
      // It used to be set only by a setTimeout(...,600) enhancer, so a fight
      // between boot-timer scheduling and that parked timer made this flaky:
      // if openSkillDetail ran before the deferred install, __viewedSkillId was
      // never set. The field is now authoritative the instant the call returns —
      // no timer, no enhancer required.
      window.openSkillDetail('mining');
      assert(window.__viewedSkillId === 'mining',
        'openSkillDetail must set __viewedSkillId synchronously (got ' + window.__viewedSkillId + ')');
      // 1 — a gathering daily opens the SKILL's detail, not the grid.
      const fish = (window.DAILY_GOAL_POOL || []).find((g) => g.id === 'fish');
      QN.go(fish);
      // b232: Skills is a standalone Adventure screen again — a gathering goal
      // lands on #panel-skills (the activity screen), NOT the Character overview.
      assert(document.getElementById('panel-skills').classList.contains('active'),
        'Catch 50 fish must land on the standalone Skills activity screen');
      assert(window.__viewedSkillId === 'fishing',
        'it must OPEN fishing, not leave the player on the grid (got ' + window.__viewedSkillId + ')');
      // openSkillDetail defers its paint a tick; paint it to see what the
      // player sees.
      window.renderSkillDetail('fishing');
      assert(/Fishing/i.test(document.getElementById('skill-detail').textContent),
        'the fishing screen is not what rendered');

      // 2 — combat and farm goals leave the skills tab behind.
      QN.go({ type: 'kill_any', label: 'Kill 25 monsters' });
      assert(document.getElementById('panel-combat').classList.contains('active'), 'kill_any must land on combat');
      QN.go({ type: 'harvest', label: 'Harvest 24 crops' });
      assert(document.getElementById('panel-farming').classList.contains('active'), 'harvest must land on the farm');

      // 3 — an artisan goal that implies a LANE arrives with the lane picked.
      const d = QN.go({ type: 'smithed', label: 'Smith 8 platebodies' });
      assert(d.skillId === 'smithing' && d.detail === 'armour',
        'a goal naming armour should carry the armour lane, got ' + JSON.stringify([d.skillId, d.detail]));
      assert(window._artisanCat.smithing === 'armour', 'the lane was not selected before arrival');
      window.renderSkillDetail('smithing');
      const chip = document.querySelector('#skill-detail .act-cats .chip.active');
      assert(chip && chip.getAttribute('data-artcat') === 'armour',
        'the armour lane is not the one on screen: ' + (chip && chip.getAttribute('data-artcat')));

      // 4 — a lane is only ever one that EXISTS. A goal naming a lane the
      // skill does not have must not persist a dead key.
      const noLane = QN.destination({ type: 'cooked', label: 'Cook 12 platebodies' });
      assert(noLane.detail !== 'armour', 'cooking has no armour lane — it must not be selected');
    } finally {
      window._artisanCat = prevCat;
      window.__viewedSkillId = prevViewed;
      try { window.showTab(startTab); } catch (e) {}
    }
  }),

  () => tryRun('b227: the Quests modal row Go button navigates and closes', () => {
    const startTab = window.activeTab || 'profile';
    const prevViewed = window.__viewedSkillId;
    // Test isolation: earlier player-action tests inflate G's lifetime counters,
    // which can complete AND claim every one of today's three daily goals — a
    // finished/claimed row shows Claim, not Go, so the modal would offer no Go
    // button and this test would fail on cumulative state rather than on the Go
    // path it exists to prove. Force today's dailies to a fresh, unclaimed,
    // 0-progress baseline before opening the modal, then restore.
    const dg = window.G && window.G.dailyGoals;
    const prevStart = dg && dg.startValues ? JSON.parse(JSON.stringify(dg.startValues)) : null;
    const prevClaimed = dg && dg.claimed ? JSON.parse(JSON.stringify(dg.claimed)) : null;
    try {
      const today = window.getGoalsForToday() || [];
      if (dg) {
        dg.startValues = dg.startValues || {};
        dg.claimed = dg.claimed || {};
        // startValue >= current source ⇒ getProgress() clamps to 0 ⇒ unfinished.
        today.forEach((g) => { dg.startValues[g.id] = Number.MAX_SAFE_INTEGER; delete dg.claimed[g.id]; });
      }
      window.showTab('profile');
      window.openQuestsModal();
      const overlay = document.getElementById('quests-modal-overlay');
      assert(overlay, 'the quests modal did not open');
      const gos = overlay.querySelectorAll('.qm-q-go');
      assert(gos.length > 0,
        'no Go button on any unfinished quest row — the modal is a dead end again');
      // Claim must stay the only action on a finished row.
      overlay.querySelectorAll('.qm-quest').forEach((row) => {
        if (row.querySelector('.qm-q-claim') || row.querySelector('.qm-q-claimed')) {
          assert(!row.querySelector('.qm-q-go'),
            'a claimable/claimed row must not also offer Go — one primary action per row');
        }
      });
      const btn = gos[0];
      const goal = (window.getGoalsForToday() || []).find((g) => g.id === btn.dataset.goto);
      assert(goal, 'the Go button points at a quest id the pool does not know: ' + btn.dataset.goto);
      const want = window.HearthriseQuestNav.destination(goal);
      btn.click();
      assert(!document.getElementById('quests-modal-overlay'),
        'the modal must close on Go — an overlay over the destination is the same dead end');
      // `activeTab` is a legacy `let`, so it is NOT on window — read the DOM,
      // which is what the player sees anyway. b232: a 'skills' destination
      // resolves to the standalone #panel-skills activity screen again.
      const wantPanel = want.tab;
      const landed = document.getElementById('panel-' + wantPanel);
      assert(landed && landed.classList.contains('active'),
        'Go did not land on the ' + wantPanel + ' panel for "' + goal.name + '"');
      if (want.skillId) {
        assert(window.__viewedSkillId === want.skillId,
          'Go landed on the ' + want.tab + ' tab but did not open ' + want.skillId);
      }
    } finally {
      try { window.closeQuestsModal(); } catch (e) {}
      if (dg) { dg.startValues = prevStart || {}; dg.claimed = prevClaimed || {}; }
      window.__viewedSkillId = prevViewed;
      try { window.showTab(startTab); } catch (e) {}
    }
  }),

  () => tryRun('b227: Home\'s milestone Train button opens the milestone\'s OWN skill', () => {
    // `var sid` in getNextMilestone's for-loop was function-scoped, so every
    // deepLink closure read the loop's final value — Train always opened
    // Bounty Hunter, whatever the milestone said.
    const LP = window.HearthriseLaunchpad;
    assert(LP && typeof LP.getNextMilestone === 'function', 'launchpad missing');
    const snap = snapshotG();
    const startTab = window.activeTab || 'profile';
    const prevViewed = window.__viewedSkillId;
    try {
      // Park one skill a hair from levelling so it is unambiguously closest.
      const G = window.G;
      G.quests = []; G.daily = { lastReset: null, tasks: [] };
      G.skills = Object.assign({}, G.skills, { mining: window.XP_TABLE[1] - 1 });
      const mile = LP.getNextMilestone();
      assert(mile && mile.kind === 'skill', 'expected a skill milestone, got ' + (mile && mile.kind));
      assert(/Mining/i.test(mile.label), 'expected the mining milestone, got ' + mile.label);
      mile.deepLink();
      assert(window.__viewedSkillId === 'mining',
        'Train opened ' + window.__viewedSkillId + ' instead of the milestone\'s own skill');
    } finally {
      window.__viewedSkillId = prevViewed;
      restoreG(snap);
      try { window.showTab(startTab); } catch (e) {}
    }
  }),

  // b229 (Tyler): "the bottom left corner of the game is showing 'offline'."
  // Root cause was legacy.js's updateNetStatus() reading NetClient.online(),
  // which is `navigator.onLine && !!ENDPOINT` with ENDPOINT hardcoded null —
  // a pre-Supabase mock-backend relic — so it reported "Offline" permanently
  // for every player, signed in and connected or not. Ownership of #net-status
  // moved to src/network-status.js, the module that actually tracks live
  // connectivity. Connected is the normal state for a signed-in, online-only
  // realm: it shows NOTHING. Only a real disconnect gets an honest, live
  // "Reconnecting…" badge that clears itself.
  () => tryRun('b229: sidebar connection indicator is hidden when connected, honest "Reconnecting…" when not', () => {
    const foot = document.getElementById('net-status');
    assert(foot, '#net-status missing from the sidebar foot');
    const NS = window.HearthriseNetStatus;
    assert(NS && typeof NS.setMode === 'function' && typeof NS.getMode === 'function',
      'network-status.js must expose the live seam');

    // The regression itself: calling the legacy update path must never
    // touch this element again.
    foot.classList.remove('hide');
    foot.querySelector('span:last-child').textContent = '__sentinel__';
    if (typeof window.updateNetStatus === 'function') window.updateNetStatus();
    assert(foot.querySelector('span:last-child').textContent === '__sentinel__',
      'legacy.js updateNetStatus() must not write to #net-status any more — that was the stale-Offline bug');

    const prevMode = NS.getMode();
    try {
      NS.setMode('ok');
      assert(foot.classList.contains('hide'), 'connected must hide the indicator — connected is the normal state, not a status');

      // A real disconnect: the browser 'offline' event is the live trigger.
      window.dispatchEvent(new Event('offline'));
      assert(!foot.classList.contains('hide'), 'a genuine disconnect must reveal the indicator');
      const dot = foot.querySelector('.dot');
      assert(dot && dot.classList.contains('warn') && !dot.classList.contains('off'),
        'the disconnected dot must be the amber "warn" state');
      assert(foot.querySelector('span:last-child').textContent === 'Reconnecting…',
        'the disconnected label must read "Reconnecting…", never the old "Offline"');
      assert(NS.getMode() === 'offline', 'setMode must actually flip to offline on a real disconnect event');

      // Recovery clears it live, the same way it appeared.
      NS.setMode('ok');
      assert(foot.classList.contains('hide'), 'recovery must hide the indicator again');
    } finally {
      NS.setMode(prevMode);
    }
  }),

  // b229 (Tyler): "clicking on the icon should give me the opportunity to
  // upload an avatar." The b221 upload affordance was a small text bar
  // pinned to the bottom of the Character-page portrait; the topbar avatar
  // had no upload affordance at all. The portrait itself is now the
  // affordance in both places, wired through identity.js's one existing
  // upload pipeline (never forked).
  () => tryRun('b229/b360: the avatar itself opens the picker — topbar and Character page', () => {
    const I = window.HearthriseIdentity;
    assert(I && typeof I.openAvatarPicker === 'function',
      'identity.js must expose one shared open-picker trigger for both surfaces to call');
    assert(typeof I.openUploadDialog === 'function',
      'the picker must expose the raw upload dialog it delegates to');

    // b360: clicking the portrait now opens the PREFAB PICKER, not the raw file
    // dialog. Force the lazily-created hidden <input type=file> into existence
    // via the real upload path, then spy on ITS .click() so the picker's
    // "Upload your own…" affordance can be proven to reach the SAME pipeline —
    // without popping an OS file dialog in headless CI.
    I.openUploadDialog();
    const input = [...document.querySelectorAll('input[type="file"]')]
      .find((el) => el.accept && /image\//.test(el.accept));
    assert(input, 'identity.js must have created the hidden file-picker input');
    const realClick = input.click.bind(input);
    let uploadClicks = 0;
    input.click = () => { uploadClicks++; };

    const scrim = () => document.querySelector('.hr-id-scrim');
    const closePicker = () => { const s = scrim(); if (s) s.remove(); };
    const tiles = () => { const s = scrim(); return s ? s.querySelectorAll('.hr-id-tile').length : 0; };
    const openVia = (el) => { closePicker(); el.click(); return tiles(); };
    const clickUpload = () => {
      const s = scrim(); if (!s) return false;
      const up = [...s.querySelectorAll('button')].find((b) => /upload your own/i.test(b.textContent || ''));
      if (up) up.click();
      return !!up;
    };

    const prevTab = window.activeTab;
    try {
      closePicker();
      // Topbar avatar — present on every screen, never re-rendered wholesale.
      const topAvatar = document.querySelector('.player-avatar');
      assert(topAvatar, 'topbar avatar missing');
      assert(topAvatar.getAttribute('role') === 'button', 'topbar avatar must be role="button"');
      assert(topAvatar.tabIndex === 0, 'topbar avatar must be keyboard-reachable (tabindex=0)');
      assert(openVia(topAvatar) === 10, 'clicking the topbar avatar must open the 10-portrait picker');

      // The picker's "Upload your own…" reaches the SAME upload pipeline.
      uploadClicks = 0;
      assert(clickUpload(), 'the picker must offer an "Upload your own…" affordance');
      assert(uploadClicks === 1, 'choosing "Upload your own…" must reach the file-upload pipeline exactly once');

      // Enter on the focused topbar avatar opens the picker too.
      closePicker();
      topAvatar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      assert(tiles() === 10, 'Enter on the focused topbar avatar must open the picker');

      // Character-page portrait — rebuilt wholesale on every render, so the
      // click wiring has to survive that (decorateCharacterPage re-attaches).
      // The identity portrait lives on the Hero sub-tab.
      closePicker();
      window.showTab('character');
      window._charPane = 'hero';
      if (typeof window.renderCharacter === 'function') window.renderCharacter();
      const portrait = document.querySelector('#panel-character .cr-hero-portrait');
      assert(portrait, 'character-page portrait missing');
      assert(portrait.getAttribute('role') === 'button', 'character portrait must be role="button"');
      assert(portrait.tabIndex === 0, 'character portrait must be keyboard-reachable (tabindex=0)');
      assert(openVia(portrait) === 10, 'clicking the character-page portrait must open the picker');

      closePicker();
      portrait.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      assert(tiles() === 10, 'Enter on the focused character portrait must open the picker');

      // The bottom-bar label button (nested inside the portrait) opens the
      // picker exactly once — its stopPropagation prevents a second open via
      // bubbling to the portrait handler, so there is one scrim, never two.
      closePicker();
      const btn = portrait.querySelector('.hr-id-upload');
      assert(btn, 'the existing label button must still be present');
      btn.click();
      assert(document.querySelectorAll('.hr-id-scrim').length === 1 && tiles() === 10,
        'the label button must open the picker exactly once, not twice via bubbling');
    } finally {
      input.click = realClick;
      closePicker();
      closeOverlays();   // closePicker() drops the picker's own latch; #char-select-overlay keeps `.open`
      window.showTab(prevTab);
    }
  }),

  // b227 (Tyler): "If I click fight target in the bounty board it will remove
  // me from combat when I'm already fighting the target." startCombat is a
  // toggle; the board's intent is GO-TO-FIGHT. Guard: fighting stays fighting.
  () => tryRun('b227: bounty Fight-target never stops an in-progress fight', () => {
    const snap = snapshotG();
    try {
      assert(typeof window.fightBountyTarget === 'function', 'fightBountyTarget missing');
      const mid = Object.keys(window.MONSTERS)[0];
      window.startCombat(mid);
      assert(window.G.activeMonster === mid, 'combat did not start');
      window.fightBountyTarget(mid);
      assert(window.G.activeMonster === mid,
        'Fight-target TOGGLED OFF an active fight against the same target');
      // activeTab is a legacy lexical (not on window) — assert the rendered panel.
      assert(document.getElementById('panel-combat') && document.getElementById('panel-combat').classList.contains('active'),
        'Fight-target must land on the combat tab');
    } finally {
      try { window.stopCombat(); } catch (e) {}
      restoreG(snap);
      try { window.showTab('profile'); } catch (e) {}
    }
  }),


  /* ══════════════════════════════════════════════════════════════════════
     b228 regression suite — THE CHRONICLE (audit finding #3, the dead bell)

     The bell had no handler, no listener anywhere in src/, and a `#nb-dot`
     badge hardcoded to 0 with no writer. These guard the four promises the
     replacement makes:
       1. the bell opens a panel and the panel shows what was recorded,
       2. the badge counts MILESTONES only and clears on open,
       3. a milestone is permanent — it survives save/load and compaction,
       4. nothing here is invented: an undated entry says so.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('b228: the topbar bell opens the Chronicle, in the Journal\'s Deeds tab', () => {
    const C = window.HearthriseChronicle;
    assert(C && typeof C.paint === 'function', 'HearthriseChronicle missing');
    const bell = document.getElementById('btn-notif');
    assert(bell, '#btn-notif is gone from the topbar');
    const snap = snapshotG();
    try {
      window.showTab('profile');
      bell.click();
      assert(document.querySelector('#panel-journal.active .jr-tab.active[data-jr-tab="deeds"]'), 'clicking the bell did not open the Journal on Deeds');
      const host = document.querySelector('#panel-journal .jr-chronicle');
      assert(host && /Milestones/.test(host.textContent) && /This session/.test(host.textContent), 'the bell opened a Journal without the Chronicle');
    } finally { window.showTab('profile'); restoreG(snap); try { window.saveLocal(); } catch {} }
  }),

  () => tryRun('b228: record → render round-trip (the entry reaches the panel, with its age)', () => {
    const C = window.HearthriseChronicle;
    const snap = snapshotG();
    try {
      window.G.chronicle = { v: 1, entries: [], seenAt: 0, seeded: Date.now() };
      const twoDays = Date.now() - 2 * 86400000;
      const r = C.record('skill', 'Reached Woodcutting 50', { id: 'skill:woodcutting:50', level: 50, ts: twoDays });
      assert(r.added, 'record() refused a fresh milestone');
      assert(r.entry.dated === 1 && r.entry.ts === twoDays, 'a recorded milestone must keep its timestamp');

      window.HearthriseJournal.open('deeds'); const modal = document.querySelector('#panel-journal .jr-chronicle');
      const txt = modal.textContent;
      assert(txt.indexOf('Reached Woodcutting 50') >= 0, 'the milestone is not rendered in the panel');
      assert(txt.indexOf('2 days ago') >= 0, 'the panel must render the age, got: ' + txt.slice(0, 200));
      assert(txt.indexOf('Milestones') >= 0 && txt.indexOf('This session') >= 0,
        'both sections must be labelled');
    } finally { window.showTab('profile'); restoreG(snap); try { window.saveLocal(); } catch {} }
  }),

  () => tryRun('b228: record() is idempotent on id — a hook and reconcile cannot double-log', () => {
    const C = window.HearthriseChronicle;
    const snap = snapshotG();
    try {
      window.G.chronicle = { v: 1, entries: [], seenAt: 0, seeded: Date.now() };
      assert(C.record('boss', 'First kill — Ancient Lich', { id: 'boss:lich' }).added, 'first record should add');
      assert(!C.record('boss', 'First kill — Ancient Lich', { id: 'boss:lich' }).added, 'second record must be refused');
      assert(!C.record('boss', 'Totally different wording', { id: 'boss:lich' }).added,
        'identity is the id, not the text — a reworded duplicate must still be refused');
      assert(C.entries().length === 1, 'expected exactly one entry, got ' + C.entries().length);
      // Empty text is not a milestone.
      assert(!C.record('rank', '   ', { id: 'rank:blank' }).added, 'an empty milestone must be refused');
    } finally { restoreG(snap); try { window.saveLocal(); } catch {} }
  }),

  () => tryRun('b228: the badge counts unseen milestones and clears on open', () => {
    const C = window.HearthriseChronicle;
    const dot = document.getElementById('nb-dot');
    assert(dot, '#nb-dot is gone from the topbar');
    const snap = snapshotG();
    try {
      window.G.chronicle = { v: 1, entries: [], seenAt: Date.now() - 60000, seeded: 1 };
      assert(C.unseen() === 0, 'an empty Chronicle must show no badge');
      C.record('rank', 'Rose to Baron', { id: 'rank:baron' });
      C.record('skill', 'Mastered Woodcutting — level 99', { id: 'skill:woodcutting:99', level: 99 });
      assert(C.unseen() === 2, 'two new milestones should read as 2, got ' + C.unseen());
      C.updateBadge();
      assert(!dot.classList.contains('hide'), 'the badge must be visible when something is unread');
      assert(dot.textContent === '2', 'the badge should read 2, got "' + dot.textContent + '"');

      window.HearthriseJournal.open('deeds');
      assert(C.unseen() === 0, 'opening the Chronicle must clear the unseen count');
      window.showTab('profile');
      C.updateBadge();
      assert(dot.classList.contains('hide'), 'the badge must hide again once read');
    } finally { window.showTab('profile'); restoreG(snap); try { window.saveLocal(); } catch {} window.HearthriseChronicle.updateBadge(); }
  }),

  () => tryRun('b228: the badge ignores toasts and undated history — it can never be permanent noise', () => {
    const C = window.HearthriseChronicle;
    const snap = snapshotG();
    try {
      window.G.chronicle = { v: 1, entries: [], seenAt: Date.now() - 60000, seeded: 1 };
      // 40 toasts — the shape of one minute of idle play.
      for (let i = 0; i < 40; i++) window.notify('b228 badge probe ' + i, 'loot');
      assert(C.unseen() === 0, 'toasts must never touch the badge, got ' + C.unseen());
      // Undated (seeded) history is not news either.
      C.record('rank', 'Rose to Serf', { id: 'rank:serf', dated: false });
      C.record('property', 'Homestead raised to Stonecross Manor', { id: 'property:3', dated: false });
      assert(C.unseen() === 0, 'undated seed entries must never light the badge, got ' + C.unseen());
      // …but a real one does.
      C.record('hunt', 'Cleared the Keep Hunt', { id: 'hunt:b228probe' });
      assert(C.unseen() === 1, 'a genuinely new milestone must light the badge');
    } finally {
      window.showTab('profile'); C.clearRecent();
      try { window.HearthriseToasts.clear(); } catch {}
      restoreG(snap); try { window.saveLocal(); } catch {} C.updateBadge();
    }
  }),

  () => tryRun('b228: a milestone is PERMANENT — it survives the round-trip that actually persists it', () => {
    /* b515 — THE ROUND-TRIP MOVED, THE PROPERTY DID NOT. This drove
       saveLocal→loadLocal with the blob pinned live. Both halves are deleted, so
       that trip is now a no-op and the assertion would report a milestone
       surviving a journey nothing took. `chronicle` is RESIDUE (client-state.js
       RESIDUE_FIELDS: "the permanent achievement log"), so the trip that keeps
       it permanent is `buildResiduePatch` → `hydrateInto` — the exact pair
       sync.js's `snapshotIfDue` and the load-path hydrate use. Same property,
       asserted where the bytes really travel. */
    const C = window.HearthriseChronicle;
    const CAP = window.HearthriseCapstone, CS = window.HearthriseClientState;
    assert(CAP && typeof CAP.buildResiduePatch === 'function'
      && CS && typeof CS.hydrateInto === 'function',
      'the capstone residue pair is not published — a milestone then has no durable home at all');
    const snap = snapshotG();
    try {
      window.G.chronicle = { v: 1, entries: [], seenAt: 0, seeded: Date.now() };
      C.record('rank', 'Rose to Viscount', { id: 'rank:b228roundtrip' });
      const patch = CAP.buildResiduePatch(window.G);
      assert(patch && patch.chronicle && Array.isArray(patch.chronicle.entries),
        'G.chronicle is not on the residue allowlist — every achievement would be gone on the next reload');
      window.G.chronicle = { v: 1, entries: [], seenAt: 0, seeded: Date.now() };   // memory only
      CS.hydrateInto(window.G, patch);
      const found = (window.G.chronicle.entries || []).filter((e) => e.id === 'rank:b228roundtrip');
      assert(found.length === 1, 'the milestone did not survive the residue round-trip');
      assert(found[0].keep === 1, 'a rank-up must be flagged protected on the way through the save');
      // …and it must reach the cloud too, or a restore hands back a blank history.
      const cloud = window.HearthriseEvents.snapshot(window.G);
      assert(cloud && cloud.chronicle && Array.isArray(cloud.chronicle.entries),
        'G.chronicle must be in the cloud snapshot allowlist (net/events.js)');
      assert(cloud.chronicle.entries.some((e) => e.id === 'rank:b228roundtrip'),
        'the cloud snapshot carries a chronicle without the milestone in it');
    } finally { restoreGAndRecord(snap); try { window.saveLocal(); } catch {} }
  }),

  () => tryRun('b228: compaction holds the cap and never drops a rank-up or a 99', () => {
    const C = window.HearthriseChronicle;
    const cap = C.MAX_MILESTONES;
    // The worst case: the two protected entries are the OLDEST in the list,
    // so a naive "drop from the front" would take them first.
    const list = [
      { id: 'rank:peasant', kind: 'rank', text: 'Rose to Serf', ts: 1, dated: 1, keep: 1 },
      { id: 'skill:woodcutting:99', kind: 'skill', text: 'Mastered Woodcutting — level 99', ts: 2, dated: 1, keep: 1 },
    ];
    for (let i = 0; i < cap + 120; i++) {
      list.push({ id: 'hunt:w' + i, kind: 'hunt', text: 'Cleared the Warband Hunt', ts: 100 + i, dated: 1 });
    }
    const before = list.length;
    C._compact(list, cap);
    assert(list.length === cap, 'compaction should land on the cap (' + cap + '), got ' + list.length);
    assert(list.some((e) => e.id === 'rank:peasant'), 'compaction dropped a rank-up');
    assert(list.some((e) => e.id === 'skill:woodcutting:99'), 'compaction dropped a 99');
    // It must drop the OLDEST droppable, not the newest.
    assert(!list.some((e) => e.id === 'hunt:w0'), 'compaction kept the oldest droppable entry');
    assert(list.some((e) => e.id === 'hunt:w' + (before - 3)), 'compaction dropped the newest entry');
    // A list under the cap is untouched.
    const small = [{ id: 'a', kind: 'hunt', text: 'x', ts: 1, dated: 1 }];
    C._compact(small, cap);
    assert(small.length === 1, 'compaction must not touch a list under the cap');
  }),

  () => tryRun('b228: the toast queue feeds the Recent ring at its choke-point', () => {
    const C = window.HearthriseChronicle;
    C.clearRecent();
    try {
      window.notify('b228 recent probe alpha', 'loot');
      const r1 = C.recent();
      assert(r1.length === 1 && r1[0].text.indexOf('b228 recent probe alpha') >= 0,
        'notify() did not reach the Recent ring, got ' + JSON.stringify(r1.slice(0, 2)));
      assert(r1[0].type === 'loot', 'the toast type must be carried through');
      // Identical repeats coalesce rather than filling the ring.
      window.notify('b228 recent probe alpha', 'loot');
      window.notify('b228 recent probe alpha', 'loot');
      const r2 = C.recent();
      assert(r2.length === 1, 'identical toasts must coalesce, got ' + r2.length + ' rows');
      assert(r2[0].count === 3, 'the coalesced row should read ×3, got ' + r2[0].count);
      // The ring is capped.
      for (let i = 0; i < C.MAX_RECENT + 25; i++) window.notify('b228 ring fill ' + i, 'info');
      assert(C.recent().length <= C.MAX_RECENT,
        'the Recent ring blew its cap: ' + C.recent().length + ' > ' + C.MAX_RECENT);
      // …and it is NOT in the save. This tier is deliberately session-only.
      assert(!('recent' in (window.G.chronicle || {})),
        'the Recent ring must never be persisted — it is session memory by design');
    } finally { C.clearRecent(); try { window.HearthriseToasts.clear(); } catch {} }
  }),

  () => tryRun('b228: reconcile SEEDS an existing save undated, then dates what it observes', () => {
    const C = window.HearthriseChronicle;
    const snap = snapshotG();
    try {
      // A save that plainly earned things before the Chronicle existed.
      window.G.chronicle = { v: 1, entries: [], seenAt: 0, seeded: 0 };
      window.G.skills = Object.assign({}, window.G.skills, { woodcutting: window.xpForLevel ? window.xpForLevel(55) : 200000 });
      const seed = C.reconcile();
      assert(seed.seeded === true, 'the first reconcile on a save must be the seed');
      const seeded = C.entries();
      assert(seeded.length > 0, 'the seed derived nothing from a save with real progress');
      assert(seeded.every((e) => e.dated === 0 && e.ts === 0),
        'every seeded entry must be undated — no timestamp may be invented');
      assert(seeded.some((e) => e.id === 'skill:woodcutting:50'),
        'the seed must derive the level marks a save has already passed');
      assert(window.G.chronicle.seeded > 0, 'the seed must stamp itself so it runs once');
      assert(C.unseen() === 0, 'a seed is history, not news — the badge must stay dark');

      // Now the same sweep OBSERVES a change, so it may honestly date it.
      // The seed stamped seenAt = now; this test then records the observation
      // inside the SAME millisecond, which no player can do. Nudge the
      // watermark back so the strict `ts > seenAt` comparison is exercised
      // rather than raced.
      window.G.chronicle.seenAt -= 50;
      const t0 = Date.now();
      window.G.skills.woodcutting = window.xpForLevel ? window.xpForLevel(76) : 1300000;
      const again = C.reconcile();
      assert(again.seeded === false, 'a second reconcile must not re-seed');
      const later = C.entries().filter((e) => e.id === 'skill:woodcutting:75');
      assert(later.length === 1, 'reconcile missed the newly-crossed mark');
      assert(later[0].dated === 1 && later[0].ts >= t0,
        'a change reconcile OBSERVED may be dated — it saw the lower value last sweep');
      assert(C.unseen() === 1, 'an observed milestone is news and must light the badge');
    } finally { window.showTab('profile'); restoreG(snap); try { window.saveLocal(); } catch {} C.updateBadge(); }
  }),

  () => tryRun('b228: the level-marks rule fires only on the published marks', () => {
    const C = window.HearthriseChronicle;
    assert(JSON.stringify(C.LEVEL_MARKS) === JSON.stringify([25, 50, 75, 92, 99]),
      'the published level marks changed: ' + JSON.stringify(C.LEVEL_MARKS));
    assert(C._marksCrossed(24, 26).join() === '25', '24 → 26 crosses 25 only');
    assert(C._marksCrossed(50, 50).length === 0, 'no movement crosses nothing');
    assert(C._marksCrossed(49, 51).join() === '50', 'the boundary is >=, not >');
    // A single huge grant (an admin jump, a quest payout) records every mark it passed.
    assert(C._marksCrossed(1, 99).join() === '25,50,75,92,99', 'one big grant must record every mark it passed');
    assert(C._marksCrossed(92, 99).join() === '99', 'the final mark stands alone');
  }),

  () => tryRun('b228: every milestone source is hooked at the source', () => {
    // Each of these is a wrapper chronicle.js installs onto an already
    // exported seam — no edit inside the system that owns the moment, so the
    // wrappers compose with collection-log/pets/companions/legacy's own.
    // Assert the module's own registry, NOT a marker on the live global:
    // companions.js is an ES module and re-wraps window.killMonster after
    // every classic script, so the marker moves off the outermost function
    // while our wrapper is still very much in the chain.
    const h = window.HearthriseChronicle._hooks();
    const missing = Object.keys(h).filter((k) => !h[k]);
    assert(missing.length === 0, 'unhooked milestone sources: ' + missing.join(', '));
  }),

  () => tryRun('b228: a boss first-kill is recorded once, by the kill itself', () => {
    const C = window.HearthriseChronicle;
    const snap = snapshotG();
    // G.bestiary and G.collection are NOT in the snapshotG allowlist (they are
    // lifetime discovery ledgers no other test writes), so this one restores
    // them itself rather than widening a shared allowlist for one test.
    const bestBefore = JSON.parse(JSON.stringify(window.G.bestiary || {}));
    const colBefore = JSON.parse(JSON.stringify(window.G.collection || {}));
    try {
      window.G.chronicle = { v: 1, entries: [], seenAt: 0, seeded: Date.now() };
      window.G.bestiary = window.G.bestiary || {};
      delete window.G.bestiary.lich;
      window.G.activeMonster = 'lich';
      const lich = window.MONSTERS.lich;
      assert(lich && lich.boss, 'the lich must still be a boss for this test to mean anything');
      const t0 = Date.now();
      window.killMonster(lich);
      const hit = C.entries().filter((e) => e.id === 'boss:lich');
      assert(hit.length === 1, 'the first kill of a boss was not recorded, got ' + hit.length);
      assert(hit[0].dated === 1 && hit[0].ts >= t0, 'a kill you were present for must carry a real timestamp');
      assert(hit[0].text.indexOf('Ancient Lich') >= 0, 'the entry must name the boss');
      // Killing it again is not a first kill.
      window.G.activeMonster = 'lich';
      window.killMonster(lich);
      assert(C.entries().filter((e) => e.id === 'boss:lich').length === 1,
        'the second kill of a boss must not add a second entry');
      // A non-boss never enters the Chronicle — that is the Collection Log's job.
      window.G.activeMonster = 'goblin';
      delete window.G.bestiary.goblin;
      window.killMonster(window.MONSTERS.goblin);
      assert(!C.entries().some((e) => e.id === 'boss:goblin'), 'an ordinary monster is not a milestone');
    } finally {
      try { window.stopCombat && window.stopCombat(); } catch {}
      window.G.bestiary = bestBefore;
      window.G.collection = colBefore;
      restoreG(snap); try { window.saveLocal(); } catch {}
    }
  }),

  () => tryRun('b228: the Chronicle is EVENTS — the Collection is its own Journal tab', () => {
    const C = window.HearthriseChronicle;
    const kinds = Object.keys(C.MILESTONE_KINDS);
    assert(kinds.indexOf('item') < 0 && kinds.indexOf('collection') < 0,
      'item discovery belongs to the Collection, not the Chronicle');
    try {
      window.HearthriseJournal.open('deeds');
      const tab = document.querySelector('#panel-journal .jr-tab[data-jr-tab="collection"]');
      assert(tab, 'the Journal holding the Chronicle offers no Collection tab beside it');
      tab.click();
      assert(document.querySelector('#panel-journal .hr-cl-top'), 'the Collection tab did not open the collection');
    } finally { window.showTab('profile'); }
  }),

  () => tryRun('b228: the Chronicle panel renders no emoji and nothing under the reading floor', () => {
    const C = window.HearthriseChronicle;
    const snap = snapshotG();
    try {
      window.G.chronicle = {
        v: 1, seenAt: 0, seeded: Date.now(),
        entries: [
          { id: 'rank:baron', kind: 'rank', text: 'Rose to Baron', ts: Date.now() - 3600000, dated: 1, keep: 1 },
          { id: 'property:2', kind: 'property', text: 'Homestead raised to Fieldworth Farmstead', ts: 0, dated: 0 },
        ],
      };
      window.notify('b228 render probe', 'info');
      window.HearthriseJournal.open('deeds'); const modal = document.querySelector('#panel-journal .jr-chronicle');
      const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{231A}-\u{23FF}]/u;
      const hit = EMOJI.exec(modal.textContent || '');
      assert(!hit, 'the Chronicle renders an emoji: "' + (hit && hit[0]) + '" (Final Directive)');

      const FLOOR = 14.5;
      const small = [];
      for (const el of modal.querySelectorAll('*')) {
        if (el.ownerSVGElement || el.tagName.toLowerCase() === 'svg') continue;
        let own = '';
        for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
        if (!own.trim()) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < FLOOR) small.push(el.className + ' @ ' + px + 'px');
      }
      assert(small.length === 0, 'Chronicle text under the ' + FLOOR + 'px floor: ' + small.slice(0, 5).join(' | '));

      // The undated entry must SAY it is undated rather than wear a fake date.
      assert(modal.textContent.indexOf('Before the Chronicle') >= 0,
        'undated history needs its own honest heading');
      assert(modal.textContent.indexOf('undated') >= 0, 'an undated entry must be labelled undated');
    } finally { window.showTab('profile'); C.clearRecent(); try { window.HearthriseToasts.clear(); } catch {} restoreG(snap); try { window.saveLocal(); } catch {} }
  }),

  () => tryRun('b228: a brand-new player opening the bell gets an honest empty state', () => {
    // The first thing a fresh account can do is click the bell. Nothing is
    // derivable yet, so both sections must be empty AND say why — the
    // art-direction rule is that an empty state describes the state, never
    // the roadmap ("coming soon" / dashed borders are wireframe language).
    const C = window.HearthriseChronicle;
    const snap = snapshotG();
    const bestBefore = JSON.parse(JSON.stringify(window.G.bestiary || {}));
    const colBefore = JSON.parse(JSON.stringify(window.G.collection || {}));
    let termsBefore2 = null;
    try {
      const G = window.G;
      termsBefore2 = zeroRenownTerms(G);
      G.homestead = { tier: 0 };
      G.companions = Object.assign({}, G.companions, { ownedIds: ['fox'] });
      G.playerName = 'Adventurer';
      G.renown = { claimed: [], seenRank: 0 }; G.renownHigh = 0;
      G.stats = { kills: 0, gathered: 0, harvested: 0, rareDrops: 0 };
      G.gold = 0;
      G.chronicle = { v: 1, entries: [], seenAt: Date.now(), seeded: Date.now() };
      C.clearRecent();
      try { window.HearthriseToasts.clear(); } catch {}

      window.HearthriseJournal.open('deeds'); const modal = document.querySelector('#panel-journal .jr-chronicle');
      const txt = modal.textContent;
      assert(C.entries().length === 0,
        'a fresh account derives nothing, got: ' + C.entries().map((e) => e.id).join(', '));
      const SP = window.HearthriseSignposts;
      const none = SP && SP.fill('chronicle.milestonesNone'), recent = SP && SP.fill('chronicle.recentEmpty');
      assert(none && txt.indexOf(none) >= 0, 'the Milestones section needs an empty state');
      assert(recent && txt.indexOf(recent) >= 0, 'the Recent section needs an empty state');
      assert(!/coming soon|coming in|not yet available|todo/i.test(txt),
        'an empty state describes the state, never the roadmap');
      assert(txt.indexOf('Before the Chronicle') < 0,
        'a player with no history must not be shown the undated heading');
      assert(C.unseen() === 0, 'a fresh account has nothing unread');
    } finally {
      window.showTab('profile'); C.clearRecent();
      window.G.bestiary = bestBefore;
      window.G.collection = colBefore;
      restoreRenownTerms(window.G, termsBefore2);
      restoreG(snap); try { window.saveLocal(); } catch {} C.updateBadge();
    }
  }),

  () => tryRun('b228: relative time is honest at every step, and undated says so', () => {
    const C = window.HearthriseChronicle;
    const now = 1700000000000;
    const ago = (ms) => C._relTime(now - ms, now);
    assert(C._relTime(0, now) === 'before the Chronicle', 'ts 0 means undated');
    assert(ago(5000) === 'just now', 'under a minute is "just now", got ' + ago(5000));
    assert(ago(60000) === '1 minute ago', 'singular minute, got ' + ago(60000));
    assert(ago(3 * 60000) === '3 minutes ago', 'plural minutes, got ' + ago(3 * 60000));
    assert(ago(3600000) === '1 hour ago', 'singular hour, got ' + ago(3600000));
    assert(ago(2 * 86400000) === '2 days ago', 'Tyler\'s example, got ' + ago(2 * 86400000));
    assert(ago(9 * 86400000) === '1 week ago', 'weeks, got ' + ago(9 * 86400000));
    assert(!/NaN|Invalid/.test(ago(400 * 86400000)), 'a year-old entry must still format, got ' + ago(400 * 86400000));
  }),

  () => tryRun('b228: the save migration reserves the Chronicle without inventing history', () => {
    // b228 merge: homestead's room clamp took v9, so the Chronicle is v9 → v10.
    const M = (window.HEARTHRISE_MIGRATIONS || []).find((m) => m.from === 9 && m.to === 10);
    assert(M, 'the v9 → v10 Chronicle migration is missing');
    assert(window.HEARTHRISE_SCHEMA_VERSION >= 10, 'CURRENT_SCHEMA_VERSION was not bumped to 10');
    const save = { v: 9, skills: { woodcutting: 999999 } };
    M.apply(save);
    assert(save.chronicle && Array.isArray(save.chronicle.entries), 'the migration must reserve the shape');
    assert(save.chronicle.entries.length === 0,
      'the migration must NOT write entries — the runtime seeds them with the live tables in front of it');
    assert(save.chronicle.seeded === 0, 'seeded must stay 0 so chronicle.js knows to seed');
    // Idempotent, and it repairs a half-written record rather than clobbering it.
    const kept = { v: 8, chronicle: { v: 1, entries: [{ id: 'rank:baron', kind: 'rank', text: 'Rose to Baron', ts: 5, dated: 1 }] } };
    M.apply(kept); M.apply(kept);
    assert(kept.chronicle.entries.length === 1, 're-running the migration must never drop recorded history');
    assert(kept.chronicle.seenAt === 0 && kept.chronicle.seeded === 0, 'missing fields must be repaired, not ignored');
  }),

  // b228 (Tyler): "Need an indication that I have chosen a bounty" — accept
  // repainted combat, never the board. And renderBountyTab lived in another
  // IIFE, unexported, so the repaint helper silently no-opped (the same
  // cross-block typeof trap as the b224 quest strip).
  () => tryRun('b228: accepting a bounty repaints the board immediately', () => {
    const snap = snapshotG();
    const prevTab = window.activeTab;
    try {
      assert(typeof window.renderBountyTab === 'function', 'renderBountyTab must be window-exported');
      window.G.bountyHunter.active = null;
      window.G.bountyHunter.board = window.generateBountyBoard();
      window.showTab('bounty');
      const before = document.querySelectorAll('#panel-bounty .bb-notice').length;
      window.acceptBounty(0);
      const board = document.getElementById('panel-bounty');
      assert(window.G.bountyHunter.active, 'accept did not take the bounty');
      const after = board.querySelectorAll('.bb-notice').length;
      assert(after !== before || /CLAIMED|Fight target|Go to fight/i.test(board.textContent),
        'the board did not visibly change on accept (still ' + after + ' notices, no active banner)');
    } finally {
      restoreG(snap);
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // b228 (Tyler): "when I switch from a gathering/artisan activity to combat,
  // it still shows Active on the old tile." stopSkill now strips the stale
  // active class, the Active chip, and zeroes the fill.
  () => tryRun('b228: starting combat clears the old activity tile Active state', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const snap = snapshotG(), bag = serverBagFixture();
    const prevTab = window.activeTab, realNotify = window.notify, said = [];
    try {
      window.notify = function (m) { said.push(String(m)); return realNotify.apply(this, arguments); };
      /* Stock BOTH sides: the factory literal is gone and the gate reads the mirror. */
      window.G.inventory.shrimp = (window.G.inventory.shrimp || 0) + 5;
      bag.agree(Object.assign({}, window.G._serverBag, { shrimp: window.G.inventory.shrimp }));   // restored in finally: it leaked into every later test
      window.showTab('skills');
      if (typeof window.openSkillDetail === 'function') window.openSkillDetail('cooking');
      window.startArtisan('cooking', 'cook_shrimp');
      assert(document.querySelector('.act-tile.active'), 'setup: cook tile not active (pointer ' + window.G.activeSkill + '/' + window.G.skillTargetId
        + ', server shrimp ' + (window.G._serverBag && window.G._serverBag.shrimp) + ', said ' + JSON.stringify(said) + ')');
      const mid = Object.keys(window.MONSTERS)[0];
      window.startCombat(mid);
      assert(!document.querySelector('.act-tile.active'),
        'a tile still says Active after switching to combat');
      assert(!document.querySelector('.act-tile .at-stop'),
        'a stale Active chip survived the switch');
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      window.notify = realNotify;
      try { window.stopCombat(); } catch (e) {}
      bag.restore(); restoreG(snap);
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // b228 (Tyler): "I ran out of iron ore but the game is still showing me as
  // smithing." Exhausting inputs killed the timers but left activeSkill, the
  // Active tile and the topbar claiming work. Guard ALL THREE artisan skills:
  // running out stops the activity fully, clears the tile, and says why.
  () => tryRun('b228: running out of materials stops the activity honestly (all artisan skills)', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const snap = snapshotG(), bag = serverBagFixture();
    const realNotify = window.notify;
    try {
      // Feed is DERIVED from each recipe's real input (cook_shrimp's input is
      // 'shrimp', not 'raw_shrimp' — hardcoding it is how you test nothing).
      const pick = (skill) => (window.ARTISAN_RECIPES[skill] || []).find((r) => r.req <= 1 && (r.input || (r.inputs && Object.keys(r.inputs).length >= 1)));
      const cases = ['cooking', 'smithing', 'crafting'].map((skill) => {
        const r = pick(skill);
        assert(r, 'no simple ' + skill + ' recipe for the probe');
        const feed = {};
        if (r.inputs) Object.keys(r.inputs).forEach((k) => { feed[k] = r.inputs[k]; });
        else feed[r.input] = 1;
        return { skill, recipe: r.id, feed };
      });
      /* The rooms are granted for their SPEED rungs only — no bench gates a
         recipe any more — and the grant still has to reach the RECORD, because
         `rooms` is server-of-record and a raw assignment no reader can see. */
      window.G.rooms = Object.assign({}, window.G.rooms, { kitchen: 1, forge: 1, workshop: 1, shrine: 1 });
      stampRecordLikeLoad(window.G);
      for (const c of cases) {
        let toast = '';
        window.notify = (m) => { toast += ' ' + m; };
        window.G.inventory = Object.assign({}, window.G.inventory);
        for (const k in c.feed) window.G.inventory[k] = c.feed[k];
        bag.agree();   // the server holds the one action's feed: exhaustion is the subject
        window.G.skills[c.skill] = Math.max(window.G.skills[c.skill] || 0, 100000);
        window.showTab('skills');
        if (typeof window.openSkillDetail === 'function') window.openSkillDetail(c.skill);
        window.startArtisan(c.skill, c.recipe);
        assert(window.G.activeSkill === c.skill, c.skill + ': did not start');
        /* Two actions made this RNG-dependent: craftSave refunds the inputs on
           a 1% `workshop: 1` proc, crafting-only (core/artisan.js:202). */
        let ticks = 0;
        while (window.G.activeSkill !== null && ticks < 40) {
          window.doArtisanAction(c.skill, c.recipe);
          ticks += 1;
        }
        assert(window.G.activeSkill === null,
          c.skill + ': activeSkill still "' + window.G.activeSkill + '" after ' + ticks
          + ' actions on one action\'s worth of inputs — the bench never stopped'
         );
        assert(!document.querySelector('.act-tile.active'),
          c.skill + ': a tile still claims Active after exhaustion');
        assert(/Out of /.test(toast) && /stopped/.test(toast),
          c.skill + ': no honest exhaustion toast, got"' + toast + '"');
      }
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      window.notify = realNotify;
      bag.restore(); restoreG(snap);
      try { window.showTab('profile'); } catch (e) {}
    }
  }),

  /* LIVE ×2 (QA account, 2026-09-09 16:36 and 16:40 UTC): a smithing run was
     accepted server-side, the client's local loop predicted the bag would run
     out 37 s later, and the run paid NOTHING. The server half of that defect is
     `caller: 'collect'` in supabase/functions/hr-accrue/accrual.js — a collect has no
     next call, so ACCRUE_MIN_MS may not apply to it.

     THIS is the client half of the same contract, and no server fix can rescue
     it: the ONLY thing that makes the server collect the run at all is that the
     exhaustion stop DECLARES. The honest-stop test above asserts the pointer,
     the tile and the toast and says nothing about the wire — so a future "just
     kill the timers" simplification (`window._stopArtisan()`, which clears
     intervals and declares nothing) would pass it while confiscating the window
     again, from the client side, for a completely different reason.

     The declaration must also be `idle` — a stop that re-declares the bench it
     just stopped would collect and then immediately restart a run with no
     inputs, which is the residue-ahead shape (the client gating the server on a
     bag figure only the client believes). */
  () => tryRun('b531: an artisan run that runs out of inputs DECLARES idle — the server collect is what pays it', () => {
    if (typeof window.startArtisan !== 'function') { skip('no startArtisan'); return; }
    const snap = snapshotG(), bag = serverBagFixture();
    const realNotify = window.notify, realDeclare = window.declareActivity;
    const stopBench = () => {
      try { if (typeof window._stopArtisan === 'function') window._stopArtisan(); } catch (e) {}
      window.G.activeSkill = null; window.G.skillTargetId = null;
    };
    try {
      const G = window.G;
      const declares = [];
      window.notify = () => {};
      window.declareActivity = (kind, id) => { declares.push({ kind, id }); return null; };
      /* DERIVED from the catalogue, never restated: the recipe's own inputs,
         seeded for EXACTLY ONE action, so the second tick is the exhaustion. */
      const r = (window.ARTISAN_RECIPES.smithing || []).find((x) => x.req <= 1
        && (x.input || (x.inputs && Object.keys(x.inputs).length)));
      assert(r, 'no level-1 smithing recipe for the probe');
      const feed = {};
      if (r.inputs) Object.keys(r.inputs).forEach((k) => { feed[k] = r.inputs[k]; });
      else feed[r.input] = 1;
      G.rooms = Object.assign({}, G.rooms, { forge: 1 });
      G.inventory = Object.assign({}, G.inventory, feed); bag.agree();   // the server holds the feed: the exhaustion DECLARE is the subject
      G.skills = Object.assign({}, G.skills, { smithing: 100000 });
      stampRecordLikeLoad(G);
      window.startArtisan('smithing', r.id);
      assert(declares.some((d) => d.kind === 'artisan' && d.id === r.id),
        'the run did not declare at all — nothing server-side knows it happened');
      declares.length = 0;
      window.doArtisanAction('smithing', r.id);   // spends the only feed
      window.doArtisanAction('smithing', r.id);   // and now the inputs are gone
      assert(G.activeSkill === null,
        'the run did not stop on exhaustion (b228 regression), activeSkill=' + G.activeSkill);
      assert(declares.length > 0,
        'THE EXHAUSTION STOP DECLARED NOTHING. The server never hears the run ended, so no collect '
        + 'runs, and the window the player just worked is paid by nobody. A stop that only clears '
        + 'timers is the client half of the b531 confiscation.');
      assert(declares.every((d) => d.kind === 'idle'),
        'the exhaustion stop declared ' + JSON.stringify(declares) + ' — it must declare idle. '
        + 'Re-declaring the bench restarts a run the client already believes has no inputs, which '
        + 'gates a server capability on a client-held bag figure.');
    } finally {
      window.notify = realNotify; window.declareActivity = realDeclare;
      stopBench(); bag.restore(); restoreGAndRecord(snap);
    }
  }),

  /* regression suite — SETTLE-THEN-GATE AT THE BENCH (§6, both directions). The
     last stated server bag lags the open window that set_activity collects before
     it switches; pre-refusing on it refused every gather→smelt inside a cadence.
     MUTATION: make bench-count.js countFirst refuse ("Need:") on a short last bag
     instead of sending the switch, and (a) goes red by name. */
  () => tryRunAsync('CRAFT-SRV-BAG: a craft the last server bag cannot fund is settled by the switch\'s own collect — funded arms, display-only stops and is named, never a pre-refusal', async () => {
    if (typeof window.startArtisan !== 'function') { skip('no artisan bench'); return; }
    const G = window.G, M = window.HearthriseActivity, A = window.HearthriseAccrual, inputsOf = window.HearthriseCore.artisan.recipeInputs;
    const snap = snapshotG(), bag = serverBagFixture(), realFetch = window.fetch, realNotify = window.notify;
    const wasOn = A.isServerAccrualEnabled(), wasAck = A.isReplacementAcknowledged();
    const said = [], sent = []; let answerBag = {};
    const list = window.ARTISAN_RECIPES.smithing || [];
    const r = list.find((x) => x.req <= 1 && !x.gated && Object.keys(inputsOf(x)).length);
    const settle = async () => { for (let i = 0; i < 4; i++) await drain(); };
    const stop = async () => { try { window.stopSkill(); } catch (e) {} await settle(); };
    try {
      assert(r, 'no ungated level-1 smithing recipe that takes inputs, for the probe');
      const feed = Object.assign({}, inputsOf(r));
      window.notify = (m) => { said.push(String(m)); };
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        let b = null; try { b = JSON.parse(init && init.body); } catch (e) {}
        if (!b || b.verb !== 'set_activity') return Promise.resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 }));
        const act = b.activity || { kind: 'idle', id: null }; sent.push(act);
        /* THE COLLECT'S BAG: what the server holds once the open window is paid. */
        return Promise.resolve(new Response(JSON.stringify({ ok: true, verb: 'set_activity', version: A.getAppliedFrame() + 1000 + sent.length, now: null,
          activity: act, state: { active_kind: act.kind, active_id: act.id },
          skills: Object.keys(G.skills || {}).reduce((o, k) => { o[k] = { xp: G.skills[k] }; return o; }, {}),
          inventory: Object.assign({}, answerBag) }), { status: 200 }));
      };
      armActivityTransport(); A.acknowledgeReplacement(true);
      G.skills = Object.assign({}, G.skills, { smithing: 100000 });
      G.inventory = Object.assign({}, G.inventory, feed);
      stampRecordLikeLoad(G);
      const attempt = async (lastBag, collected) => {
        await stop(); said.length = 0; sent.length = 0; bag.agree(lastBag); answerBag = collected;
        window.startArtisan('smithing', r.id);
        const pending = G.skillTargetId === r.id && !window._artisanInterval && window.HearthriseBenchCount.isCounting('smithing', r.id);
        await settle(); return pending;
      };

      // (a) THE REPORT: the feed was gathered since the last envelope — the last bag is empty, the collect holds it.
      const pa = await attempt({}, feed);
      assert(!said.some((m) => /^Need: /.test(m)), '(a) THE BUG: pre-refused a craft the switch\'s collect funds: ' + JSON.stringify(said));
      assert(pa, '(a) a short last bag must paint the pending "Counting…" state with no bench armed (pointer ' + G.skillTargetId + ')');
      assert(sent.some((a) => a.kind === 'artisan' && a.id === r.id), '(a) the switch (the settle) was never sent: ' + JSON.stringify(sent));
      assert(G.skillTargetId === r.id && !!window._artisanInterval, '(a) the bench did not arm on the funded envelope (pointer ' + G.skillTargetId + ', said ' + JSON.stringify(said) + ')');

      // (b) display-only feed: the collect's bag still lacks it — stopped, idle declared, named.
      const pb = await attempt({}, {});
      assert(pb, '(b) setup: the pending state never painted');
      assert(!window._artisanInterval && G.skillTargetId !== r.id, '(b) the bench runs on inputs the server says it lacks (pointer ' + G.skillTargetId + ')');
      assert(sent.some((a) => a.kind === 'idle'), '(b) the server pointer was left on a recipe it cannot fund: ' + JSON.stringify(sent));
      assert(said.some((m) => /^Need: .*the realm counts 0/.test(m)), '(b) the stop did not name the shortfall: ' + JSON.stringify(said));

      // (c) CONTROL: the last bag funds it — the bench arms at the tap, no count asked.
      await stop(); said.length = 0; bag.agree(feed);
      window.startArtisan('smithing', r.id);
      assert(G.skillTargetId === r.id && !!window._artisanInterval && !window.HearthriseBenchCount.isCounting('smithing', r.id),
        '(c) CONTROL: the server holds the feed and the bench did not arm at once: ' + JSON.stringify(said));
    } finally {
      window.notify = realNotify;
      try { window.stopSkill(); } catch (e) {}
      window._benchCounting = null; await settle();   // the stop's idle envelope lands while the stub and the ack still stand
      window.fetch = realFetch; A.acknowledgeReplacement(wasAck);
      restoreAccrualSwitch(wasOn); M.resetActivity(); M.configureActivity(null);
      bag.restore(); restoreGAndRecord(snap); closeOverlays();
    }
  }),

  /* regression suite — §6: THE CLIENT NEVER REFUSES WHAT THE SERVER WOULD ACCEPT.
     A short-bag switch answered by anything but "switched, and still short" is the
     server deciding or not having decided: the bench must not stop (stopSkill
     declares idle over a switch that may have landed). Three reproduced cases:
     (a) the switch was COALESCED behind an in-flight gather, (b) unreachable,
     (c) 429. MUTATION: restore finish()'s "everything else stops" → all three red. */
  () => tryRunAsync('CRAFT-SRV-BAG-2: a short-bag bench switch that is queued, unanswered or rate-limited waits for the server — never a client stop to idle', async () => {
    if (typeof window.startArtisan !== 'function') { skip('no artisan bench'); return; }
    const G = window.G, M = window.HearthriseActivity, A = window.HearthriseAccrual, inputsOf = window.HearthriseCore.artisan.recipeInputs;
    const snap = snapshotG(), bag = serverBagFixture(), realFetch = window.fetch, realNotify = window.notify;
    const wasOn = A.isServerAccrualEnabled(), wasAck = A.isReplacementAcknowledged();
    const said = [], sent = []; let mode = 'ok', answerBag = {}, hold = null;
    const r = (window.ARTISAN_RECIPES.smithing || []).find((x) => x.req <= 1 && !x.gated && Object.keys(inputsOf(x)).length);
    const tree = (window.TREES || []).find((t) => t.id === 'normal_tree') || (window.TREES || [])[0];
    const settle = async () => { for (let i = 0; i < 6; i++) await drain(); };
    const stop = async () => { try { window.stopSkill(); } catch (e) {} await settle(); };
    const reply = (act) => new Response(JSON.stringify({ ok: true, verb: 'set_activity', version: A.getAppliedFrame() + 1000 + sent.length, now: null,
      activity: act, state: { active_kind: act.kind, active_id: act.id },
      skills: Object.keys(G.skills || {}).reduce((o, k) => { o[k] = { xp: G.skills[k] }; return o; }, {}),
      inventory: Object.assign({}, answerBag) }), { status: 200 });
    const stopped = () => sent.some((a) => a.kind === 'idle') || said.some((m) => /still being counted|^Need: /.test(m));
    try {
      assert(r && tree, 'setup: no ungated level-1 smithing recipe / tree for the probe');
      const feed = Object.assign({}, inputsOf(r));
      window.notify = (m) => { said.push(String(m)); };
      window.fetch = function (u, init) {
        if (!/hr-accrue/.test(String(u))) return realFetch.apply(this, arguments);
        let b = null; try { b = JSON.parse(init && init.body); } catch (e) {}
        if (!b || b.verb !== 'set_activity') return Promise.resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 }));
        const act = b.activity || { kind: 'idle', id: null }; sent.push(act);
        if (mode === 'unreachable' && act.kind === 'artisan') return Promise.reject(new TypeError('Failed to fetch'));
        if (mode === 'limited' && act.kind === 'artisan') return Promise.resolve(new Response('{"ok":false,"error":"rate_limited"}', { status: 429 }));
        if (mode === 'held' && act.kind === 'gather') return new Promise((res) => { hold = () => res(reply(act)); });
        return Promise.resolve(reply(act));
      };
      armActivityTransport(); A.acknowledgeReplacement(true);
      G.skills = Object.assign({}, G.skills, { smithing: 100000 });
      G.inventory = Object.assign({}, G.inventory, feed);
      stampRecordLikeLoad(G);
      const begin = async (m) => { await stop(); mode = m; said.length = 0; sent.length = 0; hold = null; bag.agree({}); answerBag = feed; };

      // (a) QUEUED: the gather's switch is still in flight when the smelt is tapped.
      await begin('held');
      window.declareActivity('gather', tree.id); await drain();
      assert(typeof hold === 'function', '(a) setup: the gather switch was not held in flight: ' + JSON.stringify(sent));
      G.inventory = Object.assign({}, G.inventory, feed);
      window.startArtisan('smithing', r.id);
      assert(window.HearthriseBenchCount.isCounting('smithing', r.id), '(a) setup: the short last bag did not paint Counting…');
      await settle();
      assert(!stopped(), '(a) THE BUG: a QUEUED switch was read as a shortfall — stopped/declared idle: sent ' + JSON.stringify(sent) + ', said ' + JSON.stringify(said));
      hold(); await settle();
      assert(sent.some((a) => a.kind === 'artisan' && a.id === r.id), '(a) the queued smelt switch was never sent: ' + JSON.stringify(sent));
      assert(!stopped(), '(a) stopped after the queued switch went out: sent ' + JSON.stringify(sent) + ', said ' + JSON.stringify(said));
      assert(G.skillTargetId === r.id && !!window._artisanInterval && !window.HearthriseBenchCount.isCounting('smithing', r.id),
        '(a) the bench did not arm on the queued switch\'s funded envelope (pointer ' + G.activeSkill + '/' + G.skillTargetId + ')');

      // (b) UNREACHABLE (both tries): the switch may have landed — the run stands, nothing evicted.
      await begin('unreachable');
      window.startArtisan('smithing', r.id); await settle();
      assert(!stopped(), '(b) an UNANSWERED switch stopped the run / declared idle: sent ' + JSON.stringify(sent) + ', said ' + JSON.stringify(said));
      assert(G.skillTargetId === r.id && !!window._artisanInterval, '(b) the run did not stand on an unanswered switch (pointer ' + G.skillTargetId + ')');

      // (c) 429 on a session the server has never told a pointer: a rate limit is not the server saying "short".
      await begin('limited'); M.resetActivity();
      window.startArtisan('smithing', r.id); await settle();
      assert(!stopped(), '(c) a RATE-LIMITED switch stopped the run / declared idle: sent ' + JSON.stringify(sent) + ', said ' + JSON.stringify(said));
      assert(G.skillTargetId === r.id && !!window._artisanInterval, '(c) the run did not stand on a 429 (pointer ' + G.skillTargetId + ')');

      // (d) 429 when the server's last word was idle: activity.js reconciles to THAT word — the bench adds no stop of its own.
      await begin('limited');
      window.startArtisan('smithing', r.id); await settle();
      assert(!stopped(), '(d) the bench declared its own idle over a 429: sent ' + JSON.stringify(sent) + ', said ' + JSON.stringify(said));
      assert(!window.HearthriseBenchCount.isCounting('smithing', r.id) && G.skillTargetId === null && !window._artisanInterval,
        '(d) the pointer did not follow the server\'s last word (idle) after a 429 (pointer ' + G.activeSkill + '/' + G.skillTargetId + ')');
    } finally {
      mode = 'ok'; if (typeof hold === 'function') hold();
      window.notify = realNotify;
      try { window.stopSkill(); } catch (e) {}
      window._benchCounting = null; await settle();
      window.fetch = realFetch; A.acknowledgeReplacement(wasAck);
      restoreAccrualSwitch(wasOn); M.resetActivity(); M.configureActivity(null);
      bag.restore(); restoreGAndRecord(snap); closeOverlays();
    }
  }),

  /* regression suite — stopSkill strips `.active` in place; the render key kept
     naming the stopped run, so restarting the SAME recipe took lightUpdate and no
     tile read Active. MUTATION: drop the activeKey reset in stopSkill → red. */
  () => tryRun('B562-STALE-TILE: stopping a bench and restarting the SAME recipe paints its tile Active again', () => {
    if (typeof window.startArtisan !== 'function' || !window.HearthriseArtisanCat) { skip('no artisan bench'); return; }
    const G = window.G, inputsOf = window.HearthriseCore.artisan.recipeInputs;
    const snap = snapshotG(), bag = serverBagFixture(), realDeclare = window.declareActivity, prevTab = window.activeTab, prevViewed = window.__viewedSkillId;
    try {
      window.declareActivity = () => null;   // the paint is the subject, not the wire
      const r = window.HearthriseArtisanCat.recipesFor('smithing').find((x) => x.req <= 1 && !x.gated && Object.keys(inputsOf(x)).length);
      assert(r, 'no visible level-1 smithing recipe to start');
      G.skills = Object.assign({}, G.skills, { smithing: 100000 });
      G.inventory = Object.assign({}, G.inventory, inputsOf(r)); bag.agree(); stampRecordLikeLoad(G);
      /* OPENED THE WAY A PLAYER OPENS IT: the running-out-of-materials test leaves
         __viewedSkillId on another skill, and a bare renderSkillDetail then skips
         the active-skill repaint — red in suite order, green alone. */
      window.showTab('skills'); window.openSkillDetail('smithing');
      const active = () => document.querySelector('#skill-detail .act-tile.active');
      window.startArtisan('smithing', r.id);
      assert(active(), 'setup: the first start painted no Active tile');
      window.stopSkill();
      assert(!active(), 'setup: the stop left a tile Active');
      window.startArtisan('smithing', r.id);
      assert(active(), 'the SAME recipe restarted after a stop paints no Active tile — the render key still named the stopped run');
    } finally {
      window.declareActivity = realDeclare;
      try { window.stopSkill(); } catch (e) {}
      bag.restore(); restoreGAndRecord(snap);
      window.__viewedSkillId = prevViewed;
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  // b228 (Tyler / spun-off task, folded in): the offline catch-up summary only
  // reached the player as a transient toast — its numbers were also written into
  // the display:none #dash-active panel. It now has a visible home: a "While you
  // were away" card at the top of Home's status rail, shown for 30 min after
  // return. Guard: a fresh summary renders the card; a stale one does not.
  () => tryRun('b228: a recent offline summary shows the While-you-were-away card on Home', () => {
    const snap = snapshotG();
    try {
      window.G.lastOfflineSummary = { hrs: 3.0, gainedItems: 2250, gainedXp: 14208, gainedGold: 6750, gainedKills: 0, burnt: 0, budgetHrs: 18, remainingHrs: 15.0, at: Date.now(), blessed: false };
      window.HearthriseHome.render();
      const panel = document.getElementById('panel-profile');
      const fresh = Array.from(panel.querySelectorAll('.hd-h h3')).some((h) => /while you were away/i.test(h.textContent));
      assert(fresh, 'a recent offline summary did not render the card');
      // stale (> 30 min) must NOT render it
      window.G.lastOfflineSummary.at = Date.now() - 31 * 60000;
      window.HearthriseHome.render();
      const stale = Array.from(document.getElementById('panel-profile').querySelectorAll('.hd-h h3')).some((h) => /while you were away/i.test(h.textContent));
      assert(!stale, 'a stale (>30min) summary still shows the card — it must step aside');
    } finally {
      restoreG(snap);
      try { window.HearthriseHome.render(); } catch (e) {}
    }
  }),


  // ══════════════════════════════════════════════════════════════════════
  // b228 — THE BONUS REBASE (docs/design/bonus-rebase.md)
  //
  // Tyler, binding: "the % boosts across the board are way too high. 50%
  // smithing? it should be like increments of 2%."
  //
  // The first test below is the one that matters. Everything else in this
  // block pins a number; the grammar test pins the SHAPE, and a shape is what
  // survives the next feature. There was nothing like it in the suite before,
  // which is precisely how forty-two bonus sources drifted from 0.1% to 50%
  // with no rule anybody could state.
  // ══════════════════════════════════════════════════════════════════════

  () => tryRun('b228 GRAMMAR: every percentage magnitude in the game is a whole percent', () => {
    /* Walks every table that grants a getBonus-class percentage and asserts
       `v × 100` is an integer. A rung at 0.075 would pass every ceiling test in
       this suite and still be exactly what the directive exists to stop.

       The allow-list is EXPLICIT rather than a default, because "everything not
       named" is how an exemption quietly becomes a loophole. Four classes are
       outside the percent grammar and each is outside it for a stated reason
       (bonus-rebase.md §2.5): counts, reliability, duration, and flat XP. */
    const FLAT = { farmYield: 1, hpRegen: 1, strB: 1, atkB: 1, defB: 1, rested: 1, restedCap: 1 };
    const EXEMPT = { noBurn: 1, buffDuration: 1 };
    const bad = [];
    const check = (where, key, v) => {
      if (FLAT[key] || EXEMPT[key] || typeof v !== 'number' || v === 0) return;
      const pts = v * 100;
      if (Math.abs(pts - Math.round(pts)) > 1e-9) bad.push(where + ' ' + key + ' = ' + pts + ' points');
    };

    // 1 — homestead rooms (bk/bv + the secondary bx map)
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((r, i) => {
      const at = 'ROOMS.' + id + ' L' + (i + 1);
      if (r.bk) check(at, r.bk, r.bv);
      if (r.bx) Object.keys(r.bx).forEach((k) => check(at, k, r.bx[k]));
    }));

    // 2 — renown rank perks
    window.HearthriseRenown.RANKS.forEach((r) => {
      if (!r.perk) return;
      Object.keys(r.perk).forEach((k) => {
        if (k === 'bankSlots') return;
        check('RANKS.' + r.id, k, r.perk[k]);
      });
    });

    // 3 — the castle: the perk rungs and the Great Hall
    const UI = window.HearthriseClanSeatUI;
    for (let lv = 0; lv <= 10; lv++) check('castle rung L' + lv, 'perk', UI.perkAtLevel(lv));
    for (let t = 1; t <= 5; t++) check('Great Hall T' + t, 'allXP', UI.greatHallAllXp(t));

    // 4 — the feast ladder, at every Tavern level, and at Last Call
    const CS = window.HearthriseClanSeat;
    for (let lv = 1; lv <= 10; lv++) {
      ['allXP', 'yield', 'artisan'].forEach((k) => {
        check('feast T' + lv, k, CS.feastEffect(lv)[k]);
        check('lastCall T' + lv, k, CS.feastEffectAt(lv, 60000)[k]);
      });
    }
    check('hearthScale magnitude', 'x', CS.hearthScale(10).magnitude - 1);

    // 5 — both blessing pools: b560, they carry no magnitude at all (BLESSING-HONESTY)
    const E = window.HearthriseWorldEvents;
    E.DAILY.concat(E.WEEKLY).forEach((ev) => assert(ev.bonus === undefined, 'blessing ' + ev.id + ' carries a bonus table'));

    // 6 — the muster aura
    check('muster', 'allXP', window.HearthriseMuster.LIVE_XP_AURA);

    // 7 — companions, base values AND the level-30 proc chances
    Object.keys(window.COMPANIONS).forEach((id) => {
      const def = window.COMPANIONS[id];
      Object.keys(def.bonus || {}).forEach((k) => check('COMPANIONS.' + id, k, def.bonus[k]));
      if (def.proc) check('COMPANIONS.' + id + ' proc', 'chance', def.proc.chance);
    });

    // 8 — every food and draught buff (stored as integer percentage points)
    Object.keys(window.ITEMS).forEach((id) => {
      const b = window.ITEMS[id].buff;
      if (!b) return;
      const def = window.BUFFS_DEF[b.type];
      const key = def ? def.bonusKey : b.type;
      if (FLAT[key] || EXEMPT[key]) return;
      if (Math.abs(b.magnitude - Math.round(b.magnitude)) > 1e-9) {
        bad.push('ITEMS.' + id + ' buff ' + b.type + ' = ' + b.magnitude + ' points');
      }
    });

    assert(bad.length === 0, bad.length + ' magnitude(s) are not whole percentages:\n  ' + bad.join('\n  '));

    // The step itself: nothing anywhere grants more than the absolute peak.
    const PEAK = window.HearthrisePowerBudget.TOTAL_CAP;
    Object.keys(window.ROOMS).forEach((id) => window.ROOMS[id].levels.forEach((r, i) => {
      if (!r.bk || FLAT[r.bk] || EXEMPT[r.bk]) return;
      assert(r.bv <= PEAK + 1e-9, 'ROOMS.' + id + ' L' + (i + 1) + ' grants more than the absolute peak');
    }));
  }),

  () => tryRun('b228 FUSE: every permanent source at max, and NO key passes +20%', () => {
    /* The census found no aggregate ceiling test for any non-allXP key. That
       gap is how smithSpeed reached +90% unnoticed: the only fuse in the game
       policed allXP, from the middle of a seven-layer chain, and everything
       added above it escaped. This maxes out every permanent source at once —
       every room at L5, High King, a tier-5 castle with all five wings at 10, a
       level-30 companion, both plot buildings — and asks the question of EVERY
       governed key. */
    const PB = window.HearthrisePowerBudget;
    const UI = window.HearthriseClanSeatUI;
    const R = window.HearthriseRenown, H = window.HearthriseHomestead;
    const E = window.HearthriseWorldEvents;
    const savedR = R.getPerks, savedH = H && H.isCastle;
    const snap = snapshotG();
    try {
      E._force({ daily: E.QUIET, weekly: E.QUIET });     // no calendar in a PERMANENT test
      window.G.buffs = [];
      window.G.rooms = {};
      Object.keys(window.ROOMS).forEach((id) => { window.G.rooms[id] = window.ROOMS[id].levels.length; });
      /* b456: the ROOM half of "every permanent source at max" only exists if the
         rungs arrive on the record — `rooms` is server-of-record and getBonus reads
         it through roomsOf, so an unstamped `G.rooms = {...all at 5}` contributes
         NOTHING and the fuse test measures a house with no rooms in it. */
      stampRecordLikeLoad(window.G);
      window.G.plotBuildings = [{ id: 'toolshed' }, { id: 'watchtower' }, { id: 'scarecrow' }];
      R.getPerks = () => ({ allXP: 0.04 });
      /* b349 — THE CAPSTONE IS DRIVEN BY REAL STATE NOW, not by a stub of
         isCastle(). getBonus's layer 0 delegates to src/core/perks.js and hands
         it `propertyTier` (an INT), because the server has a tier and not a
         boolean; `isCastle()` is a derived predicate the perk state no longer
         consults. Setting the tier is strictly stronger than stubbing the
         predicate — it drives HearthriseHomestead's real accessor — and the
         stub is kept because other readers in this suite still call it.
         CASTLE_TIER is read from core rather than typed as 5, so a sixth
         property tier moves one constant and this test follows it. */
      window.G.homestead = { tier: window.HearthriseCore.perks.CASTLE_TIER };
      if (H) H.isCastle = () => true;
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 10, treasury: 0, myRole: 'leader' });
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: { treasury: 10, tavern: 10, sawmill: 10, smeltery: 10, war_room: 10 },
                    stores: {}, orders: [] }, 'test-hold');
      // The strongest pet for each key, at level 30 (×2.45).
      const worst = {};
      Object.keys(window.COMPANIONS).forEach((id) => {
        Object.keys(window.COMPANIONS[id].bonus || {}).forEach((k) => {
          if (!PB.governed(k)) return;
          if (!worst[k] || window.COMPANIONS[id].bonus[k] > window.COMPANIONS[worst[k]].bonus[k]) worst[k] = id;
        });
      });
      Object.keys(PB.GOVERNED).forEach((k) => {
        const pet = worst[k];
        window.G.companions = pet
          ? { ownedIds: [pet], xp: { [pet]: 50000 }, equipped: pet }
          : { ownedIds: [], xp: {}, equipped: null };
        const v = window.getBonus(k);
        assert(v <= PB.PERMANENT_CAP + 1e-9,
          'the permanent fuse leaked on ' + k + ': ' + v + ' (pet ' + (pet || 'none') + ')');
      });
      // And the DESIGN ceiling — what the pillars are meant to sum to — is not
      // wildly under the fuse either, or the fuse is theatre.
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      assert(Math.abs(window.getBonus('allXP') - 0.15) < 1e-9,
        'a fully decorated allXP stack should land on the +15% design ceiling, got ' + window.getBonus('allXP'));
    } finally {
      E._force(null);
      R.getPerks = savedR;
      if (H && savedH) H.isCastle = savedH;
      UI._reset();
      restoreGAndRecord(snap);
    }
  }),

  () => tryRun('b228 CEREMONY: the temporary budget is ≤15%, and the absolute peak is 30%', () => {
    /* "The realm can never hand you more than you have earned." The maximal
       conjunction — a Last Call feast and a Pumpkin Pie in hand (b560: the
       blessings pay nothing, so they are out of it) — is deliberately ABOVE the clamp, so
       the ceiling is a thing players can reach and chase rather than a bound
       nothing ever touches. */
    const PB = window.HearthrisePowerBudget;
    const UI = window.HearthriseClanSeatUI;
    const E = window.HearthriseWorldEvents;
    const snap = snapshotG();
    try {
      window.G.rooms = {}; window.G.plotBuildings = []; window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      UI._reset();
      UI._setClan({ id: 'test-hold', name: 'Testhold', level: 10, treasury: 0, myRole: 'leader' });
      UI._setSeat({ castle_tier: 5, standing: 0, treasury: 0, upkeep_state: 'active',
                    upgrades: { tavern: 10 }, stores: {}, orders: [],
                    feast_until: new Date(Date.now() + 10 * 60000).toISOString() }, 'test-hold');
      E._force({ daily: E.DAILY.find((d) => d.id === 'scholars_day'),
                 weekly: E.WEEKLY.find((w) => w.id === 'grand_fair') });
      // A Pumpkin Pie (+10% all XP, legacy.js ITEMS) on top of Last Call's +8%.
      window.G.buffs = [{ type: 'all_xp', magnitude: 10, remainingMs: 600000 }];

      const raw = PB.rawFor('allXP');
      const paid = window.getBonus('allXP');
      assert(PB.temporaryFor('allXP') > PB.TEMPORARY_CAP,
        'the maximal conjunction must actually exceed the ceremony budget, or this test proves nothing');
      assert(paid <= PB.TOTAL_CAP + 1e-9, 'the absolute peak leaked: ' + paid);
      assert(paid < raw, 'the clamp must actually bite here');
      assert(PB.atLimit('allXP') === true, 'and the game must be able to SAY it is at the limit');
      // …and it really does say it, on the activity the player is watching.
      window.G.activeSkill = 'woodcutting'; window.G.skillTargetId = 'normal_tree';
      assert(/at its limit/.test(window.HearthriseBlessingLimitNote()),
        'a clamp the player cannot see reads as a bug — the note must appear');

      // Every governed key, under the same conjunction.
      Object.keys(PB.GOVERNED).forEach((k) => {
        assert(window.getBonus(k) <= PB.TOTAL_CAP + 1e-9, 'the peak leaked on ' + k);
      });

      // The exempt classes are NOT clamped — a 25% noBurn blessing on a 25%
      // Kitchen is reliability, not throughput, and clamping it to 30% would be
      // the grammar eating a mechanic it was told to leave alone.
      assert(PB.applyBudget('noBurn', 0.5) === 0.5, 'noBurn must pass the budget untouched');
      assert(PB.applyBudget('farmYield', 12) === 12, 'farmYield is a crop count, not a percentage');
      assert(PB.applyBudget('buffDuration', 1.4) === 1.4, 'duration is exempt');
      // A debuff is never turned into a blessing by a ceiling.
      assert(PB.applyBudget('allXP', -0.5) === -0.5, 'a negative total must pass through');
    } finally { E._force(null); UI._reset(); restoreG(snap); }
  }),

  () => tryRun('b228 FUSE: the power budget is the OUTERMOST getBonus wrapper', () => {
    /* The architectural claim, asserted rather than assumed. If any module ever
       wraps getBonus after this one, its contribution is added outside the clamp
       and the budget silently becomes advice. */
    assert(window.getBonus.__hrPowerBudget === true,
      'something wrapped getBonus after the power budget — the clamp is escapable again');
    // And it heals: wrap it, and the watchdog puts the budget back on top.
    const saved = window.getBonus;
    try {
      window.getBonus = function (k) { return saved(k) + 5; };
      assert(window.getBonus.__hrPowerBudget !== true, 'setup: the intruder must be outermost');
      window.HearthrisePowerBudget.ensureOutermost();
      assert(window.getBonus.__hrPowerBudget === true, 'ensureOutermost must re-take the outermost position');
      assert(window.getBonus('allXP') <= window.HearthrisePowerBudget.TOTAL_CAP + 1e-9,
        'and the re-taken clamp must actually clamp the intruder');
    } finally { window.getBonus = saved; }
  }),

  () => tryRun('b228: renown rank perks, pinned literally', () => {
    /* The +22% allXP figure existed nowhere except a stub and two comments —
       the suite only ever asserted `perks.allXP > 0`. Pinned now, rank by rank;
       the offline hours, the Count slot and the King task were retired (the server pays none). */
    const R = window.HearthriseRenown;
    const byId = (id) => R.RANKS.find((r) => r.id === id);
    assert(byId('squire').perk.allXP === 0.01, 'Squire is +1% XP');
    assert(byId('baron').perk.allXP === 0.01, 'Baron is +1% XP');
    assert(byId('duke').perk.allXP === 0.01, 'Duke is +1% XP');
    assert(byId('highking').perk.allXP === 0.01, 'High King is +1% XP');
    assert(byId('count').perk === null && byId('king').perk === null, 'Count and King carry no perk');
    // The aggregate, at the top of the ladder.
    const snap = snapshotG();
    try {
      window.G.renownHigh = 10000000;
      const p = R.getPerks(window.G);
      assert(Math.abs(p.allXP - 0.04) < 1e-9, 'the whole ladder is +4% allXP, got ' + p.allXP);
      ['offlineHours', 'marketSlots', 'dailyTasks'].forEach((k) => assert(!(k in p),
        'the ladder carries no ' + k + ' key — the server pays none of it: ' + JSON.stringify(p)));
    } finally { restoreG(snap); }
  }),

  () => tryRun('DAILY-HEAL-1 (b461): a stale pre-eligibility slate is healed in place — impossible tasks swapped, progress on kept tasks preserved', () => {
    /* The b459 eligibility filter applies at GENERATION only, so a slate rolled
       before the fix carried its impossible tasks all day (found live on beta
       morning: Craft 8 + Smith 8 against zero craftable recipes). The heal in
       generateDailyTasks rebuilds today's slate from the filtered deterministic
       set when an UN-done stored task is ineligible now. */
    const snap = snapshotG();
    const GCat = window.HearthriseCore && window.HearthriseCore.goalCatalogue;
    assert(GCat && typeof GCat.dailyTaskEligible === 'function', 'goalCatalogue bridge must be up');
    const savedCaps = window.dailyTaskCaps;
    const savedDayKey = window.hrGoalDayKey;
    try {
      // A fresh account: no rooms, no artisan XP — craft/smith are ineligible.
      window.dailyTaskCaps = () => ({ rooms: {}, skillXp: {} });
      const caps = window.dailyTaskCaps();
      /* THE AUTHORED GOAL OF EVERY POOL ROW. A genuine pre-fix slate carries the
         POOL's own numbers, so the stale slate must be seeded with them — and the
         seeded progress must be a value that slate could really hold.
         (2026-09-06: this test seeded every stale task `goal: 50, progress: 37`
         and went red the first day the roll's first eligible id was "Kill 25
         monsters". Nothing was wrong with the heal: the b497 repair below it
         clamps `progress = min(goal, progress)`, and 37 kills against a goal of
         25 is a state the game cannot produce. 13 of the next 60 day keys were
         red the same way — a fabricated fixture, not a heal bug.) */
      const authoredGoal = {};
      window.DAILY_TASK_POOL.forEach((f) => { const t = f(); authoredGoal[t.id] = t.goal; });

      /* One day's heal, DERIVED from that day's real raw roll — a hand-picked
         slate is only "the pre-fix roll" on days whose seed deals those ids,
         which is the date-flake this test originally shipped with. */
      const healDay = (dayKey) => {
        window.hrGoalDayKey = () => dayKey;
        const rawIds = GCat.dailyTaskIndexes(dayKey).slice(0, 3).map((i) => GCat.DAILY_TASK_POOL_ORDER[i]);
        const eligibleOld = rawIds.filter((id) => GCat.dailyTaskEligible(id, caps));
        const keptId = eligibleOld[0];
        const seeded = keptId ? Math.max(1, Math.floor(authoredGoal[keptId] / 2)) : 0;
        window.G.daily = { lastReset: dayKey, tasks: rawIds.map((id) => ({
          id, type: id, label: id, goal: authoredGoal[id],
          progress: (id === keptId) ? seeded : 0, reward: 400, done: false,
        })) };
        window.generateDailyTasks(false);
        const tasks = window.G.daily.tasks;
        const ids = tasks.map((t) => t.id);
        assert(tasks.length === 3, dayKey + ': the healed slate keeps its size, got ' + ids.length);
        assert(ids.every((id) => GCat.dailyTaskEligible(id, caps)),
          'THE BUG: ' + dayKey + ' healed slate still offers an impossible task: ' + ids.join(','));
        const swapped = eligibleOld.length < rawIds.length;
        if (swapped && keptId) {
          const kept = tasks.find((t) => t.id === keptId);
          assert(kept && kept.progress === seeded,
            dayKey + ': progress on a kept task must survive the heal (kept ' + keptId
            + ', ' + seeded + ' -> ' + (kept ? kept.progress : 'GONE') + ')');
        }
        return { ids: ids.join(','), swapped };
      };

      const today = savedDayKey();
      const first = healDay(today);
      // Idempotent: a second call with a clean slate changes nothing.
      window.generateDailyTasks(false);
      assert(window.G.daily.tasks.map((t) => t.id).join(',') === first.ids,
        'a clean slate must not be re-rolled');

      /* THE SWEEP. The heal's guarantee is for EVERY roll shape, not today's —
         and today's shape is exactly what hid the fixture defect above. 60
         consecutive UTC day keys; ~34 of them deal a gated task and therefore
         run the kept-progress assertion for real. */
      let swaps = 0;
      const t0 = Date.now();
      for (let n = 0; n < 60; n++) {
        const d = new Date(t0 + n * 86400000);
        if (healDay(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`).swapped) swaps++;
      }
      assert(swaps >= 10, 'the sweep must actually exercise the swap path, hit it ' + swaps + ' of 60 days');
    } finally {
      window.hrGoalDayKey = savedDayKey; window.dailyTaskCaps = savedCaps; restoreG(snap);
    }
  }),

  () => tryRun('b228 P1: combatXP pays RANGED and MAGIC, not four styles out of six', () => {
    /* Pre-existing, ~unknown lifetime: addXp listed attack/strength/defense/
       hitpoints and silently skipped ranged and magic, so the Trophy Room, the
       Watchtower, War Drums and Hunter's Moon paid nothing to two of the combat
       styles. A player who trained a bow got a worse return from the same
       300,000-gold room than a player who trained a sword. */
    const snap = snapshotG();
    const savedBonus = window.getBonus;
    try {
      assert(window.COMBAT_XP_SKILLS.indexOf('ranged') >= 0 && window.COMBAT_XP_SKILLS.indexOf('magic') >= 0,
        'ranged and magic must be in the combatXP list');
      window.G.restedXp = 0;
      window.getBonus = (k) => (k === 'combatXP' ? 1 : 0);   // +100%, so the delta is unmissable
      const measure = (sk) => {
        window.G.skills[sk] = 12000000;                      // 99, so no level-up fires
        predZero();                                          // b455: drop any standing prediction
        const before = xpOf(sk);
        window.addXp(sk, 1000, { authored: true });
        return xpOf(sk) - before;
      };
      const sword = measure('attack');
      ['ranged', 'magic'].forEach((sk) => {
        assert(measure(sk) === sword, sk + ' must earn the same combatXP bonus as attack');
      });
      // …and a non-combat skill must NOT pick it up.
      assert(measure('woodcutting') < sword, 'combatXP must not leak into gathering');
    } finally { window.getBonus = savedBonus; restoreG(snap); }
  }),

  () => tryRun('b228 P0: a companion bonus is counted EXACTLY ONCE, under its real key', () => {
    /* Found by the rebase, live for ~26 builds: a getBonus wrapper adding the
       companion bonus existed in BOTH legacy.js and features/companions.js, so
       every pet paid twice — a level-30 Forge Imp was +49% smithing, not the
       +24.5% the census budgeted. Neither wrapper was wrong on its own, which is
       why only a behavioural test can hold this. */
    const snap = snapshotG();
    const E = window.HearthriseWorldEvents;
    try {
      E._force({ daily: E.QUIET, weekly: E.QUIET });
      window.G.buffs = [];
      const delta = (id, key) => {
        window.G.companions = { ownedIds: [id], xp: { [id]: 0 }, equipped: id };
        const on = window.getBonus(key);
        window.G.companions = { ownedIds: [id], xp: { [id]: 0 }, equipped: null };
        return on - window.getBonus(key);
      };
      assert(Math.abs(delta('forge_imp', 'smithSpeed') - window.COMPANIONS.forge_imp.bonus.smithSpeed) < 1e-9,
        'the Forge Imp must move smithSpeed by its bonus exactly once');
      // The five pets whose keys were MISSPELLED and therefore paid nothing.
      assert(delta('fox', 'allXP') > 0, 'the Fox must finally pay allXP (was the misspelled xpB)');
      assert(delta('lichling', 'allXP') > 0, 'the Lichling must finally pay allXP');
      assert(delta('raccoon', 'goldFind') > 0, 'the Raccoon must finally pay goldFind (was goldBonus)');
      assert(delta('owl', 'prayerSpeed') > 0, 'the Owl must finally pay prayerSpeed (was prayerXp)');
      assert(delta('grave_wisp', 'prayerSpeed') > 0, 'the Grave Wisp must finally pay prayerSpeed');
      // The old names are gone from the data entirely, in both directions.
      Object.keys(window.COMPANIONS).forEach((id) => {
        const b = window.COMPANIONS[id].bonus || {};
        ['xpB', 'goldBonus', 'prayerXp'].forEach((ghost) => {
          assert(b[ghost] === undefined, id + ' still carries the ghost key ' + ghost);
        });
      });
      // Level 30 is ×2.45 and stays inside the budget's companion share.
      const capXp = window.companionXpToReach(30);
      window.G.companions = { ownedIds: ['forge_imp'], xp: { forge_imp: capXp }, equipped: 'forge_imp' };
      assert(window.companionLevelFromXp(capXp) === 30, 'setup: the XP cap must actually reach level 30');
      /* b228: the cap used to be a flat 50,000 against a curve that needs
         792,783, so every pet stopped at level 14 on a bar drawn as "/ 30". */
      assert(capXp > 50000, 'the companion XP cap must be derived from the curve, not a stale 50,000');
      /* ── b515 — THE CLAMP MOVED TO THE RECONCILE, so that is where it is
         driven. b456 drove it through `awardCompanionXp` with the capstone
         pinned OFF, on the premise that the client is the writer in that
         position. There is no such position: `companions.js blobRetired()` is
         the literal `true`, so the award no-ops for every caller and the pin
         selected nothing — the clamp would have been graded on dead code.

         The writer is `accrue.js reconcileCompanions`, and the property is the
         same one and matters more there: the number arrives from OUTSIDE, so a
         garbage or hostile total must be floored into the curve rather than
         rendered. What must never come back is the flat 50,000 cap against a
         792,783 curve — the bar drawn "/ 30" that stopped every pet at 14.
         MUTATION: have reconcileCompanions pass `xp` through unclamped → the
         level assertion below reads past 30. */
      const A = window.HearthriseAccrual;
      A.reconcileCompanions(window.G,
        { companions: { owned: ['forge_imp'], xp: { forge_imp: 1e12 }, equipped: 'forge_imp' } });
      const landed = window.G.companions.xp.forge_imp;
      assert(window.companionLevelFromXp(landed) <= 30,
        'a hostile companion-XP total from the wire produced level '
        + window.companionLevelFromXp(landed) + ' — the curve stops at 30, and a pet past it is a bonus '
        + 'nobody budgeted');
      /* …and a NEGATIVE or non-finite one reads as zero rather than as a level.
         The wire is not trusted; `reconcileCompanions` floors every cell. */
      A.reconcileCompanions(window.G,
        { companions: { owned: ['forge_imp'], xp: { forge_imp: -5 }, equipped: 'forge_imp' } });
      assert(window.G.companions.xp.forge_imp === 0,
        'a negative companion XP from the wire was kept: ' + window.G.companions.xp.forge_imp);
      window.G.companions.xp.forge_imp = capXp;
      const maxed = window.getCompanionBonus().smithSpeed;
      assert(Math.abs(maxed - 0.0245) < 1e-9, 'a level-30 pet is worth +2.45%, got ' + maxed);
    } finally { E._force(null); restoreG(snap); }
  }),

  /* b342, the same removal's other half: the companion ACQUISITION hooks (drop
     roll, dragon-egg hatch, bunny harvest counter) were duplicated between
     legacy.js block 35 and features/companions.js too. MEASURED before the fix:
     one harvest moved G.stats.cropsHarvested by 2 — so the Bunny's "harvest
     100 crops" completed at 50 and the weekly "Harvest 120 crops" at 60 — and
     one tap on a Dragon Egg asked the player to confirm TWICE. */
  () => tryRun('b342: one harvest counts once, and one Dragon Egg tap asks once', () => {
    const G = window.G;
    const snap = snapshotG();
    const savedConfirm = window.confirm;
    try {
      if (typeof window.harvestPlot === 'function') {
        G.stats = G.stats || {};
        const before = G.stats.cropsHarvested || 0;
        window.harvestPlot(0);
        const moved = (G.stats.cropsHarvested || 0) - before;
        assert(moved === 1,
          'one harvest moved cropsHarvested by ' + moved + ', expected exactly 1 '
          + '(2 = the duplicated bunny-quest hook is back, and every crop quest completes at half cost)');
      }
      if (typeof window.invItemTap === 'function') {
        G.inventory = G.inventory || {};
        G.inventory.dragon_egg = 1;
        G.companions = G.companions || { ownedIds: [], xp: {}, equipped: null };
        G.companions.ownedIds = (G.companions.ownedIds || []).filter((x) => x !== 'whelp');
        /* b373: the hatch asks with the IN-GAME modal now (window.confirm
           blocks the renderer). Counted through the service rather than the
           global, and the native global is stubbed alongside it so that a
           regression to `confirm()` reads as ZERO in-game asks AND is caught
           by tests/native-dialog.mjs. */
        const D = window.HearthriseDialog;
        const realDialogConfirm = D && D.confirm;
        let prompts = 0, native = 0;
        window.confirm = function () { native++; return false; };
        if (D) D.confirm = function () { prompts++; return Promise.resolve(false); };
        try {
          window.invItemTap('dragon_egg');
        } finally {
          if (D && realDialogConfirm) D.confirm = realDialogConfirm;
        }
        assert(native === 0,
          'the Dragon Egg tap raised a NATIVE confirm() — that blocks the renderer main thread (b371/b373)');
        assert(prompts === 1,
          'one Dragon Egg tap raised ' + prompts + ' in-game confirm dialogs, expected exactly 1');
      }
    } finally {
      window.confirm = savedConfirm;
      try { window.closeInvDetail && window.closeInvDetail(); } catch (e) {}
      restoreG(snap); try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRun('b228: a fractional flat bonus is ROLLED, not floored away', () => {
    /* harvestPlot spent `farmYield` through Math.floor(), so every fractional
       grant paid exactly zero: the Scarecrow (+0.1), the Bunny, the Squirrel,
       Carrot Stew and Roasted Pumpkin — five purchased perks that had paid
       nothing since launch. The whole part always pays; the fraction pays as its
       own probability, so the EXPECTED yield is exactly the bonus. */
    assert(typeof window.rollFlatBonus === 'function', 'the flat-bonus roller must be published');
    assert(window.rollFlatBonus(0) === 0 && window.rollFlatBonus(-1) === 0, 'nothing and debt both pay nothing');
    assert(window.rollFlatBonus(3, () => 0.99) === 3, 'a whole bonus always pays in full');
    // Both sides of the coin, deterministically — no flaking on a real draw.
    assert(window.rollFlatBonus(2.4, () => 0.39) === 3, 'a fraction that hits pays the extra unit');
    assert(window.rollFlatBonus(2.4, () => 0.41) === 2, 'a fraction that misses pays only the whole part');
    assert(window.rollFlatBonus(0.1, () => 0.05) === 1, 'the Scarecrow can finally pay');
    // And the expectation is the bonus itself, which is the whole point.
    let total = 0;
    for (let i = 0; i < 1000; i++) total += window.rollFlatBonus(0.25, () => i / 1000);
    assert(total === 250, 'the expected value must equal the bonus, got ' + (total / 1000));
    // The producers really are non-fractional or rollable now.
    const snap = snapshotG();
    try {
      window.G.rooms = {}; window.G.plotBuildings = [{ id: 'scarecrow' }];
      window.G.companions = { ownedIds: [], xp: {}, equipped: null };
      assert(window.getBonus('farmYield') >= 1, 'the Scarecrow must grant a whole crop, got ' + window.getBonus('farmYield'));
    } finally { restoreG(snap); }
  }),

  () => tryRun('b228: the Throne ladder EXPLAINS how renown is earned, from the live weights', () => {
    /* Tyler, 2026-08-09: "we need to explain how to gain renown, because I
       don't even know." The screen showed twelve thresholds and never said what
       moved the number. The explainer is GENERATED from `W` — the same object
       computeRenown scores against — so it cannot go stale the way a
       hand-written help text always does. This test proves that link. */
    const R = window.HearthriseRenown;
    const rows = R.earnRows();
    assert(/How|per|[0-9]/.test(rows) && rows.length > 100, 'the explainer must produce real rows');
    ['Every skill level', 'Each quest finished', 'Each monster slain'].forEach((phrase) => {
      assert(rows.indexOf(phrase) >= 0, 'the explainer must name "' + phrase + '"');
    });
    // It prints the LIVE weight, not a copy: move the weight, move the text.
    const saved = R.WEIGHTS.totalLevel;
    try {
      assert(R.earnRows().indexOf('>' + saved + '<') >= 0,
        'the live totalLevel weight must appear in the rows');
      R.WEIGHTS.totalLevel = 7;
      assert(R.earnRows().indexOf('>7<') >= 0, 'changing the weight must change the explanation');
    } finally { R.WEIGHTS.totalLevel = saved; }
    // Sub-1 weights are inverted into something a person can act on.
    assert(R.earnRows().indexOf('1 per 20') >= 0, 'a 0.05 weight must read as "1 per 20", not as "0.05"');
    // The ladder renders it, with the rank rows still intact.
    try {
      R.openLadder();
      const wrap = document.querySelector('#hr-rn-modal .hr-rn-wrap');
      assert(wrap, 'the ladder must open');
      assert(wrap.textContent.indexOf('How renown is earned') >= 0, 'the section must be on the screen');
      assert(wrap.querySelectorAll('.hr-rn-earn').length >= 8, 'every scoring term must be listed');
      assert(wrap.querySelectorAll('.hr-rn-rank').length === R.RANKS.length, 'the twelve ranks must still be there');
    } finally { const m = document.getElementById('hr-rn-modal'); if (m) m.remove(); }
  }),

  () => tryRun('b228: renown pace — a fresh account is a Peasant, and the ratchet still protects veterans', () => {
    /* Tyler: "It also seems to be going way too fast." At the b226 weights a
       brand-new account scored ~380 before taking a single action — Serf was
       almost free, and one full day of play reached Knight. The retune targets
       Serf day 1-2 / Squire week 1 / Knight week 3-4 / Baron month 2+. */
    const R = window.HearthriseRenown;
    const snap = snapshotG();
    let termsBefore3 = null;   // neither `streak` nor the mirror is in snapshotG
    try {
      const G = window.G;
      G.renownHigh = 0;
      termsBefore3 = zeroRenownTerms(G);
      Object.keys(window.SKILLS_DEF).forEach((k) => { G.skills[k] = 0; });
      G.gold = 0;
      stampRecordLikeLoad(G);   // b456: a genuinely-zero character, stated by the server
      const fresh = R.compute(G);
      assert(fresh < 400, 'a brand-new account must NOT start most of the way to Serf, scored ' + fresh);
      assert(R.rankIndexFor(fresh) === 0, 'a fresh account is a Peasant');

      /* Three modelled saves, each built from the pacing model's own numbers
         (~228K XP/day at PACE, spread across the skills a player is actually
         training). The assertions are BRACKETS, not points — the claim is the
         shape of the curve, and a point estimate would fail on any content
         change while telling us nothing. */
      const T = window.XP_TABLE;
      /* b456: every level change has to reach the record, because renown reads the
         AUTHORITY accessor. Without the stamp all three modelled saves score as a
         level-1 character and the whole curve reads "peasant". */
      const setLevels = (skills, lvl) => {
        skills.forEach((s) => { G.skills[s] = T[lvl - 1]; });
        stampRecordLikeLoad(G);
      };
      const rank = () => R.RANKS[R.rankIndexFor(R.compute(G))].id;

      // ~day 2 — three skills going, a first quest, a few log entries.
      setLevels(['woodcutting', 'mining', 'fishing'], 52);
      G.stats.kills = 600; G.quests = [{ done: true }];
      G.collection = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1, j: 1 };
      seedPlayStreak(2);
      assert(rank() === 'serf', 'about day 2 should be a Serf, got ' + rank() + ' at ' + R.compute(G));

      // ~week 1 — six skills, a real kill count, a handful of quests.
      setLevels(['woodcutting', 'mining', 'fishing', 'cooking', 'smithing', 'crafting'], 60);
      G.stats.kills = 3000;
      G.quests = [1, 2, 3, 4].map(() => ({ done: true }));
      G.collection = {}; for (let i = 0; i < 40; i++) G.collection['c' + i] = 1;
      seedPlayStreak(7);
      assert(rank() === 'squire', 'week 1 should be a Squire, got ' + rank() + ' at ' + R.compute(G));

      // ~week 3-4 — ten skills, the grind showing.
      setLevels(Object.keys(window.SKILLS_DEF).slice(0, 10), 68);
      G.stats.kills = 12000;
      G.quests = new Array(10).fill(0).map(() => ({ done: true }));
      G.collection = {}; for (let i = 0; i < 90; i++) G.collection['c' + i] = 1;
      seedPlayStreak(24); G.bountyHunter = { completed: 60 };
      assert(rank() === 'knight', 'week 3-4 should be a Knight, got ' + rank() + ' at ' + R.compute(G));

      // ~month 2 — and Baron is still ahead of, not behind, a month of play.
      setLevels(Object.keys(window.SKILLS_DEF).slice(0, 13), 75);
      G.stats.kills = 35000;
      G.quests = new Array(20).fill(0).map(() => ({ done: true }));
      G.collection = {}; for (let i = 0; i < 150; i++) G.collection['c' + i] = 1;
      seedPlayStreak(60); G.bountyHunter = { completed: 180 };
      const m2 = R.rankIndexFor(R.compute(G));
      assert(m2 >= R.rankIndexFor(4500) && m2 < R.rankIndexFor(13500),
        'month 2 should be a Baron or Viscount, got ' + R.RANKS[m2].id + ' at ' + R.compute(G));

      // The ratchet: a veteran scored under the OLD weights keeps their rank.
      G.skills = {}; Object.keys(window.SKILLS_DEF).forEach((s) => { G.skills[s] = 0; });
      G.stats = { kills: 0 }; G.collection = {}; G.quests = [];
      seedPlayStreak(0); G.bountyHunter = { completed: 0 };
      G.renownHigh = 3136;                     // a real Knight, pre-retune
      assert(R.compute(G) < 3136, 'setup: the live score really is lower after the retune');
      assert(R.rankIndexFor(R.effective(G)) === R.rankIndexFor(3136),
        'a pre-retune Knight must still be a Knight — the ratchet is the promise');
    } finally {
      restoreRenownTerms(window.G, termsBefore3);
      restoreG(snap);
    }
  }),

  // ── b229 · the combined Character screen (Skills · Equipment · Hero) ──────
  () => tryRun('b229: Character screen has Skills/Equipment/Hero sub-tabs, Skills default', () => {
    const prevPane = window._charPane;
    try {
      window._charPane = undefined;              // fresh entry defaults to Skills
      window.showTab('character');
      if (typeof window.renderCharacter === 'function') window.renderCharacter();
      const shell = document.getElementById('char-shell');
      assert(shell, 'the combined-screen shell (#char-shell) never built');
      const tabs = [...shell.querySelectorAll('.char-subtab')].map((b) => b.getAttribute('data-cpane'));
      assert(tabs.join(',') === 'skills,equip,hero', 'sub-tabs must be Skills · Equipment · Hero, got ' + tabs.join(','));
      assert((window._charPane || 'skills') === 'skills', 'Skills must be the default sub-tab, got ' + window._charPane);
      const active = shell.querySelector('.char-subtab.active');
      assert(active && active.getAttribute('data-cpane') === 'skills', 'the Skills sub-tab must be the one lit on entry');
      assert(document.getElementById('char-skills').style.display !== 'none', 'the Skills pane must be visible by default');
    } finally { window._charPane = prevPane; window.showTab('profile'); }
  }),

  () => tryRun('b229: showTab("skills") aliases to Character/Skills with the grid rendered', () => {
    const prevPane = window._charPane;
    try {
      window.showTab('skills');
      assert(document.getElementById('panel-skills').classList.contains('active'),
        'b232: showTab("skills") must activate the standalone #panel-skills activity screen');
      assert(!document.getElementById('panel-character').classList.contains('active'),
        'showTab("skills") must NOT land on the Character overview any more');
      // The activity ids live in the standalone panel (moved back out of Character).
      assert(document.querySelector('#panel-skills #skills-list'), '#skills-list must live inside #panel-skills');
      assert(document.querySelector('#panel-skills #skill-detail'), '#skill-detail must live inside #panel-skills');
      assert(!document.querySelector('#panel-character #skill-detail'), '#skill-detail must NOT be inside the Character overview');
      assert(document.querySelectorAll('#skills-list .skill-tile').length > 0, 'the activity skill list rendered no tiles');
    } finally { window._charPane = prevPane; window.showTab('profile'); }
  }),

  () => tryRun('b232: live progress bar not frozen — isSkillsVisible() true on the activity screen', () => {
    const prevTab = window.activeTab;
    try {
      assert(typeof window.isSkillsVisible === 'function', 'isSkillsVisible() seam missing (guards would freeze the bar)');
      window.showTab('skills');                  // → standalone activity screen
      assert(window.isSkillsVisible() === true, 'isSkillsVisible() must be true on the Skills activity screen');
      window.showTab('character');               // the overview has no live bar
      assert(window.isSkillsVisible() === false, 'isSkillsVisible() must be false on the Character overview (no bar there)');
    } finally { window.showTab(prevTab || 'profile'); }
  }),

  () => tryRun('b229: sub-tab survives an auto-refresh re-render (b218 snap-back guard)', () => {
    const prevPane = window._charPane;
    try {
      window.showTab('character');
      window._charPane = 'hero';
      window.renderCharacter();
      assert(document.getElementById('char-hero').style.display !== 'none', 'Hero pane must show after selecting it');
      // Simulate the 2s auto-refresh tick — the pane must NOT snap back to Skills.
      window.renderCharacter();
      assert((window._charPane || 'skills') === 'hero', '_charPane must persist across a re-render');
      assert(document.getElementById('char-hero').style.display !== 'none', 'Hero pane must survive the auto-refresh (snap-back regression)');
      assert(document.getElementById('char-skills').style.display === 'none', 'Skills pane must stay hidden while Hero is selected');
    } finally { window._charPane = prevPane; window.showTab('profile'); }
  }),

  () => tryRun('b232: the Character skills grid is a door — a tile routes OUT to its activity', () => {
    const prevPane = window._charPane;
    try {
      // The overview grid lives on the Character screen; each tile routes via hrOpenActivity.
      window.showTab('character');
      window._charPane = 'skills';
      window.renderCharacter();
      const tiles = document.querySelectorAll('#panel-character .csk-grid .csk-tile');
      assert(tiles.length >= 10, 'the Character overview must render a grid of every skill, got ' + tiles.length);
      const oc = tiles[0].getAttribute('onclick') || '';
      assert(/hrOpenActivity\(/.test(oc), 'a skill tile must route through window.hrOpenActivity, got: ' + oc);
      assert(typeof window.hrOpenActivity === 'function', 'window.hrOpenActivity router must exist');
      // A gathering skill routes to the standalone activity screen and paints its tiles there.
      window.hrOpenActivity('mining');
      window.renderSkillDetail('mining');
      assert(document.getElementById('panel-skills').classList.contains('active'),
        'a gathering tile must route to the standalone Skills activity screen');
      const grid = document.querySelector('#panel-skills #skill-detail .act-grid');
      assert(grid && grid.querySelectorAll('.act-tile').length > 0, 'the mining activity grid did not render on the activity screen');
      // A combat skill routes to Combat instead.
      window.hrOpenActivity('attack');
      assert(document.getElementById('panel-combat').classList.contains('active'), 'a combat tile must route to Combat');
    } finally { window._charPane = prevPane; window.showTab('profile'); }
  }),

  () => tryRun('b229: Equipment sub-tab hosts the paper-doll with its internal tabs', () => {
    if (typeof window.buildTibiaDoll !== 'function') return;   // doll unavailable in this build
    const prevPane = window._charPane;
    try {
      window.showTab('character');
      window._charPane = 'equip';
      window.renderCharacter();
      const host = document.getElementById('char-equip');
      assert(host && host.querySelector('.td-wrap'), 'the paper-doll (.td-wrap) is not mounted in the Equipment sub-tab');
      const paneTabs = [...host.querySelectorAll('.td-tab')].map((b) => b.getAttribute('data-td-pane'));
      assert(paneTabs.indexOf('gear') >= 0 && paneTabs.indexOf('stats') >= 0 && paneTabs.indexOf('pet') >= 0,
        'the doll must keep its Equipment/Stats/Companion internal tabs, got ' + paneTabs.join(','));
    } finally { window._charPane = prevPane; window.showTab('profile'); }
  }),

  () => tryRun('b229: Hero Account stat grid reads real sources (no fakes)', () => {
    const prevPane = window._charPane;
    try {
      window.showTab('character');
      window._charPane = 'hero';
      window.renderCharacter();
      const grid = document.querySelector('#char-hero .cr-acct-grid');
      assert(grid, 'the Account stat grid did not render on the Hero sub-tab');
      const cells = [...grid.querySelectorAll('.cr-acct-cell')];
      assert(cells.length >= 9, 'expected the full Account panel (CL, TL, XP, Quests, Achievements, Bounties, Collections, Renown, Days running), got ' + cells.length);
      const byLabel = (needle) => cells.find((c) => (c.querySelector(':scope > span').textContent || '').toLowerCase().indexOf(needle) === 0);
      const cl = byLabel('combat'); const tl = byLabel('total');
      assert(cl && cl.querySelector('b').textContent === String(window.getCombatLevel()),
        'Combat Lv cell must equal getCombatLevel()');
      assert(tl && tl.querySelector('b').textContent === String(window.getTotalLevel()),
        'Total Lv cell must equal getTotalLevel()');
      const ach = byLabel('achievements');
      assert(ach && ach.querySelector('b').textContent.indexOf('/ ' + (window.ACHIEVEMENTS || []).length) >= 0,
        'Achievements cell must count against the real ACHIEVEMENTS catalogue');
      /* Deeds are graded on the realm's counts: with the tally unstated, the
         done-count is the pending dash, never a client-kept 0. */
      const was = window.HearthriseLifetime.__swapView(null);
      try {
        window.renderCharacter();
        const pend = [...document.querySelectorAll('#char-hero .cr-acct-cell')].find((c) => /^achievements/i.test(c.querySelector(':scope > span').textContent));
        assert(pend && pend.querySelector('.bal-pending'), 'Achievements must be the pending dash while the tally is unknown, got ' + (pend && pend.innerHTML));
      } finally { window.HearthriseLifetime.__swapView(was); }
      assert(byLabel('days running'), 'a Days running cell must exist (the server play streak)');
      assert(!byLabel('time played'), 'the device-timed Time played cell is back');
      ['quests', 'bounties'].forEach((k) => { const c = byLabel(k);
        assert(c && (/\d/.test(c.querySelector('b').textContent) || c.querySelector('.bal-pending')),
          k + ' cell must be the realm\'s figure or the pending dash, got ' + (c && c.innerHTML)); });
    } finally { window._charPane = prevPane; window.showTab('profile'); }
  }),

  () => tryRun('b229: the device-timed Time Played counter is gone (no seam, no tick)', () => {
    assert(!('HearthrisePlayTime' in window) && !('tickPlayMs' in window),
      'a device play-time counter is published again; play is counted by the realm (Days running)');
  }),

  () => tryRun('b229: the fake "Your Heroes" paywall mockup is gone from the Character screen', () => {
    const prevPane = window._charPane;
    try {
      window.showTab('character');
      window._charPane = 'skills'; window.renderCharacter();
      window._charPane = 'hero'; window.renderCharacter();
      assert(!document.querySelector('#panel-character .cr-slots'), 'the fake cr-slots paywall must be cut from the Character screen');
      assert(!document.querySelector('#panel-character .cr-paywall-hint'), 'the fake paywall hint must be gone too');
    } finally { window._charPane = prevPane; window.showTab('profile'); }
  }),

  () => tryRun('b229: "Your Heroes" is the REAL selector, shared with the drawer', () => {
    const HP = window.HearthriseProfile;
    assert(HP && typeof HP.slotRows === 'function' && typeof HP.selectSlot === 'function',
      'HearthriseProfile must expose the shared slotRows()/selectSlot() helpers');
    if (!HP.profile) return;   // signed out — the block renders nothing (tested by absence)
    const rows = HP.slotRows();
    assert(Array.isArray(rows) && rows.length > 0, 'slotRows() must describe the account\'s slots');
    assert(rows.some((r) => r.kind === 'char'), 'slotRows() must include at least the active character');
    // Home paints it from the same model.
    window.showTab('profile');
    if (window.HearthriseHome && window.HearthriseHome.render) window.HearthriseHome.render();
    const root = document.getElementById('hd-root');
    if (root) assert(/your heroes/i.test(root.textContent), 'Home must render a real "Your heroes" block from HearthriseProfile');
  }),

  /* ── b371 — THE HERO-SLOT SURFACE ──────────────────────────────────────
     Three defects from one live session, all on the "Your heroes" path:
       P0  clicking Play on a second slot HARD-FROZE the tab for 60+ seconds
           with no self-recovery — `window.confirm()` blocks the renderer's main
           thread until answered, and an unanswered one blocks it forever.
       P2  buying a slot spent premium currency with NO confirmation.
       P2  the header gem chip kept painting the pre-purchase balance until a
           reload (chip 1006, G.gems 806).
     These three are the synchronous half. The half no in-page test can reach —
     "the main thread kept running while the server did not answer" — is
     tests/slot-switch.mjs, which measures it from OUT of the process. */
  () => tryRun('b371: switching character never raises a native dialog (the tab-freeze class)', () => {
    const HP = window.HearthriseProfile;
    if (!HP || !HP.profile) return;                 // signed out: nothing to switch
    const realConfirm = window.confirm;
    let native = 0;
    window.confirm = function () { native++; return false; };
    let p = null;
    try {
      const target = HP.profile.activeSlot === 0 ? 1 : 0;
      p = HP.selectSlot(target);
      assert(p && typeof p.then === 'function',
        'selectSlot must return a Promise — a synchronous switch is a synchronous BLOCK, which is the b371 freeze');
      assert(native === 0,
        'selectSlot called window.confirm — a native dialog stops every timer, paint and input handler in the '
        + 'game until it is answered, and forever if it never is. That is the b371 P0.');
      const ov = document.getElementById('hr-confirm-overlay');
      assert(!!ov, 'the in-game confirm modal must be shown in its place');
      assert(!!ov.querySelector('[data-hrc="yes"]') && !!ov.querySelector('[data-hrc="no"]'),
        'the modal needs both a confirm and a cancel — a modal with no way out is the freeze wearing CSS');
      ov.querySelector('[data-hrc="no"]').click();
      assert(!document.getElementById('hr-confirm-overlay'), 'cancelling must remove the modal');
    } finally {
      window.confirm = realConfirm;
      if (p && p.catch) p.catch(() => {});
    }
  }),

  /* ── b373 — THE LAST NATIVE DIALOG, AND THE STRIP THAT LIED ────────────
     Two defects from the b372 FTUE run on a fresh character:
       P1  the rename pencil opened window.prompt() and HARD-FROZE the renderer
           ("all CDP evaluate/screenshot timed out until the tab was closed").
           Same class as the b371 slot-switch confirm(); this was the last one.
       P2  the activity strip said "Idle — pick an activity" for ~20s while
           chopping was demonstrably running, then corrected itself.
     The total ban on native dialogs under src/ is tests/native-dialog.mjs (a
     static scan — an in-page test can only see the dialogs it thinks to
     trigger, and nothing ever clicked this pencil). These are the behavioural
     halves. */
  () => tryRun('B373-1: the rename pencil opens the in-game name modal, never window.prompt()', () => {
    const D = window.HearthriseDialog;
    assert(D && typeof D.confirm === 'function' && typeof D.prompt === 'function'
      && typeof D.alert === 'function',
      'window.HearthriseDialog is missing — every converted call site silently degrades to "do nothing"');

    const LP = window.HearthriseLaunchpad;
    assert(LP && typeof LP.openRename === 'function',
      'HearthriseLaunchpad.openRename() is gone — the rename has no non-blocking entry point');

    const realPrompt = window.prompt;
    let native = 0;
    window.prompt = function () { native++; return null; };
    try {
      LP.openRename();
      assert(native === 0,
        'the rename raised a NATIVE prompt() — it blocks the renderer main thread until answered, and forever '
        + 'if it never is. That is the b373 P1 freeze, and the b371 freeze before it.');
      /* It must route through identity.js's name modal — the one path that
         validates the name and claims it server-side. A bespoke text box here
         would bypass the charset/reserved/profanity rules AND uniqueness. */
      const scrim = document.querySelector('.hr-id-scrim');
      assert(!!scrim, 'no in-game name modal appeared — the pencil asks with nothing at all');
      assert(!!scrim.querySelector('input'), 'the name modal has no input to type a name into');
      const buttons = [...scrim.querySelectorAll('button')].map((b) => b.textContent);
      assert(buttons.some((t) => /cancel|not now/i.test(t)),
        'the name modal has no way out — a modal you cannot dismiss is the freeze wearing CSS');
    } finally {
      window.prompt = realPrompt;
      try { window.HearthriseIdentity && window.HearthriseIdentity.closeModal
        ? window.HearthriseIdentity.closeModal() : document.querySelectorAll('.hr-id-scrim').forEach((s) => s.remove()); } catch (e) {}
    }
  }),

  () => tryRun('B373-1b: the Profile rename pencil is wired to openRename, not to a prompt()', () => {
    if (typeof window.renderProfile !== 'function') return;
    try { window.renderProfile(); } catch (e) {}
    const body = document.getElementById('dash-user-body');
    if (!body) return;
    const pencil = body.querySelector('button[title="Rename"]');
    assert(pencil != null, 'expected the rename pencil in dash-user-body, none found');
    const onclick = pencil.getAttribute('onclick') || '';
    assert(!/prompt\s*\(/.test(onclick),
      'the pencil markup still calls prompt() inline — that is the exact b373 freeze, shipped in an attribute');
    assert(/openRename/.test(onclick),
      'the pencil no longer calls HearthriseLaunchpad.openRename() — it asks by some other means: ' + onclick);
  }),

  /* The sweep sells through vendor_sell_many, and asks first with the modal. */
  () => tryRunAsync('B373-2: sell-junk asks with the in-game modal, and cancelling pays nothing', async () => {
    const G = window.G;
    const CM = window.HearthriseInvCtx;
    if (!CM || typeof CM.sellJunk !== 'function') return;
    const snap = snapshotG(), bag = serverBagFixture(); const save = { confirm: window.confirm };
    let native = 0;
    window.confirm = function () { native++; return true; };
    try {
      const raw = Object.keys(window.ITEMS).find((id) => window.ITEMS[id].raw && Number(window.ITEMS[id].v) >= 10);
      if (!raw) return;
      G.lockedItems = {}; G.inventory = {}; G.inventory[raw] = 40; G.gold = 0;
      bag.agree();   // the sweep quotes the SERVER's bag
      const q = CM.quoteJunk(1e9);
      const p = CM.sellJunk(1e9);
      assert(p && typeof p.then === 'function',
        'sellJunk must return a Promise — a synchronous sweep is one that asked with a blocking dialog');
      await new Promise((r) => setTimeout(r, 0));
      assert(native === 0, 'the sweep raised a native confirm()');
      const ov = document.getElementById('hr-confirm-overlay');
      assert(!!ov, 'no in-game confirmation appeared before a bulk sale of the player\'s bag');
      assert(ov.textContent.replace(/,/g, '').includes(String(q.totalGold)),
        'the modal does not state the gold it will pay (' + q.totalGold + '): ' + ov.textContent.slice(0, 120));
      assert(G.gold === 0, 'the sweep paid BEFORE the player answered');
      ov.querySelector('[data-hrc="no"]').click();
      const paid = await p;
      assert(paid === 0 && G.gold === 0, 'declining the sweep still paid ' + G.gold + ' gold');
      assert(G.inventory[raw] === 40, 'declining the sweep still took the items');
    } finally {
      window.confirm = save.confirm;
      try { window.HearthriseDialog.close(); } catch (e) {}
      restoreG(snap); bag.restore();
    }
  }),

  () => tryRun('B373-3: starting an activity repaints the strip in the SAME tick — it is not polled for', () => {
    /* THE BUG: refreshActivityBar() had one unconditional caller, a
       setInterval(…,100). A hidden or occluded tab has that timer throttled to
       1/s — and to 1/MINUTE under Chrome's intensive throttling — so the strip
       kept saying "Idle" over a running activity for ~20s on a fresh character.
       Combat was the exception because start/stopCombat repaint synchronously,
       which is exactly why the live report names woodcutting and cooking.

       ASSERTED SYNCHRONOUSLY, IN THE SAME TASK as the start: the 100ms poll
       cannot have run, so a pass can only mean the start path itself painted. */
    const bar = document.getElementById('activity-bar');
    const nameEl = document.getElementById('ab-name');
    if (!bar || !nameEl || typeof window.startSkill !== 'function') return;
    if (!window.TREES || !window.TREES.length) return;
    const G = window.G;
    const snap = { skill: G.activeSkill, target: G.skillTargetId, monster: G.activeMonster };
    try {
      const node = window.TREES[0];
      if (typeof window.stopSkill === 'function') window.stopSkill();
      /* The fight pointer cleared, because the strip renders it before the skill:
         a fight left running by an earlier test would make the "back to Idle"
         assertion below fail for a reason that is not this bug. (The strip reads no
         other pointer: activeAction / activeArtisanRecipe have no writer.) */
      G.activeMonster = null;
      window.startSkill('woodcutting', node.id, 3000);
      const text = nameEl.textContent || '';
      assert(!/^Idle/i.test(text),
        'the strip still said "' + text + '" in the same tick the activity started. It only learns what is '
        + 'running from a 100ms timer, and a backgrounded tab has that timer throttled to as little as once a '
        + 'minute — which is the ~20s of "Idle" over a running fresh-character chop reported in the b372 FTUE run.');
      assert(/wood/i.test(text) || text.toLowerCase().includes(String(node.name || '').toLowerCase()),
        'the strip repainted but does not name the activity that was started: ' + text);
      assert(!bar.classList.contains('idle'), 'the strip repainted its text but is still styled idle');
      if (typeof window.stopSkill === 'function') window.stopSkill();
      assert(/^Idle/i.test(document.getElementById('ab-name').textContent || ''),
        'stopping the activity did not put the strip back to Idle in the same tick');
    } finally {
      G.activeSkill = snap.skill; G.skillTargetId = snap.target; G.activeMonster = snap.monster;
      try { window.stopSkill && !snap.skill && window.stopSkill(); } catch (e) {}
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRun('b562: the activity strip names the node/recipe, not its id', () => {
    /* The strip printed `skillTargetId.replace(/_/g,' ')` ("Woodcutting — normal
       tree"). One lookup, hrActivityTargetName, feeds both live surfaces and each
       is read here: the bar and the Character panel's progress strip
       (refreshPanelProgress). legacy.js buildActivityCard routes through it too,
       but nothing paints that card (its renderCharacter wrapper is overwritten
       later in the file), so no player surface can witness it. */
    const nameEl = document.getElementById('ab-name');
    assert(nameEl && typeof window.hrActivityTargetName === 'function', 'activity strip or name helper missing');
    assert(typeof window.refreshActivityBar === 'function', 'the bar painter is missing');
    const G = window.G, tree = window.TREES[0], recipe = (window.ARTISAN_RECIPES.cooking || [])[0];
    assert(tree && recipe && recipe.input, 'no woodcutting node or cooking recipe to start');
    /* The id-as-words form must differ from the name, or no arm below can go red. */
    [tree, recipe].forEach((t) => assert(!t.id.replace(/_/g, ' ').includes(t.name),
      t.id + ' reads as its own name, so this test cannot tell the name from the id'));
    const ppLabel = () => {
      const el = document.querySelector('#panel-character > .panel-progress [data-pp="label"]');
      return el ? String(el.textContent || '') : '(no Character progress strip)';
    };
    const prevTab = (document.querySelector('.panel.active') || { id: '' }).id.replace(/^panel-/, '');
    const snap = { skill: G.activeSkill, target: G.skillTargetId, monster: G.activeMonster, inv: G.inventory[recipe.input] };
    try {
      if (typeof window.stopSkill === 'function') window.stopSkill();
      G.activeMonster = null;
      window.showTab('character');
      window.startSkill('woodcutting', tree.id, 3000);
      window.refreshActivityBar();
      let text = nameEl.textContent || '';
      assert(text.includes(tree.name), 'gathering strip reads "' + text + '", expected the node name "' + tree.name + '"');
      text = ppLabel();
      assert(text.includes(tree.name), 'Character progress strip reads "' + text + '", expected "' + tree.name + '"');
      G.inventory[recipe.input] = 5;
      window.startArtisan('cooking', recipe.id);
      window.refreshActivityBar();
      text = nameEl.textContent || '';
      assert(text.includes(recipe.name), 'cooking strip reads "' + text + '", expected the recipe name "' + recipe.name + '"');
      text = ppLabel();
      assert(text.includes(recipe.name), 'Character progress strip reads "' + text + '", expected "' + recipe.name + '"');
      assert(window.hrActivityTargetName('no_such_node') === 'no such node', 'an unknown id must still read as words');
    } finally {
      try { window.stopSkill && window.stopSkill(); } catch (e) {}
      G.activeSkill = snap.skill; G.skillTargetId = snap.target; G.activeMonster = snap.monster;
      if (snap.inv === undefined) delete G.inventory[recipe.input]; else G.inventory[recipe.input] = snap.inv;
      if (prevTab && typeof window.showTab === 'function') { try { window.showTab(prevTab); } catch (e) {} }
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRun('b371: buying a hero slot asks before it spends premium currency', () => {
    const HP = window.HearthriseProfile;
    if (!HP || !HP.profile) return;
    assert(typeof HP.buySlot === 'function',
      'HearthriseProfile.buySlot must be the ONE shared buy action — two copies of a confirmation is one that drifts');
    const next = HP.canUnlockNext();
    if (!next) return;                              // every slot already owned
    const G = window.G;
    const prevGems = G.gems, prevUnlocked = HP.profile.unlockedSlots;
    const realConfirm = window.confirm;
    let native = 0;
    window.confirm = function () { native++; return true; };
    let p = null;
    try {
      G.gems = (next.cost || 0) + 100;
      p = HP.buySlot(next.slotId);
      assert(native === 0, 'buySlot used a native dialog — see b371');
      const ov = document.getElementById('hr-confirm-overlay');
      assert(!!ov, 'a premium-currency purchase was made with NO confirmation step (b371 P2)');
      assert(next.free || /gem/i.test(ov.textContent), 'the confirmation must state what it costs');
      assert(G.gems === (next.cost || 0) + 100, 'gems were spent BEFORE the player confirmed');
      assert(HP.profile.unlockedSlots === prevUnlocked, 'the slot was unlocked BEFORE the player confirmed');
      ov.querySelector('[data-hrc="no"]').click();
      assert(G.gems === (next.cost || 0) + 100, 'declining the purchase still spent the gems');
    } finally {
      window.confirm = realConfirm;
      G.gems = prevGems;
      if (p && p.catch) p.catch(() => {});
    }
  }),

  () => tryRun('DAILY-SHEET-2 (b465): the SERVER\'s login-claim row closes the sheet — the marker that survives tab/save races', () => {
    /* Second costume of the every-refresh bug: the residue marker lost a
       tab/save race and the sheet re-opened on a reward the server had paid.
       Every envelope carries the progress rows; both appliers hand them to
       markServerClaim, which closes the question locally for TODAY only. */
    const D = window.HearthriseDaily, G = window.G;
    assert(D && typeof D.markServerClaim === 'function', 'markServerClaim must be exported');
    const snap = snapshotG();
    try {
      const d = new Date();
      const today = d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
      G.dailyReward = { lastClaimDay: 0 };
      // yesterday's claim row must NOT close today
      assert(D.markServerClaim([{ kind: 'daily', key: 'login', state: 'claimed', period: '2020-1-1' }]) === false,
        'an old claim row must not mark today claimed');
      assert(D.isClaimable(G) === true, 'still claimable after an old row');
      // an open sheet + today's claimed row → marked + folded away
      const fake = document.createElement('div'); fake.id = 'hr-dl-modal'; document.body.appendChild(fake);
      assert(D.markServerClaim([{ kind: 'daily', key: 'login', state: 'claimed', period: today }]) === true,
        'THE BUG: today\'s server claim row must close the local question');
      assert(D.isClaimable(G) === false, 'the sheet must read claimed after the server row');
      assert(!document.getElementById('hr-dl-modal'), 'an open sheet on a paid reward must fold away');
    } finally {
      const el = document.getElementById('hr-dl-modal'); if (el) el.remove();
      restoreG(snap);
    }
  }),

  /* ══ FIELDNOTES-1..3 — the bestiary hunter's notes (content pack 5) ═══════
     108 lines in src/data/monster-notes.js, one per MONSTERS id. FIELDNOTES-1
     is the data contract: every id covered exactly once, charset-clean,
     unique, and mechanically silent about the monster's own elementWeak (the
     Bestiary Charms rank-1 reward) and about any item it does not drop.
     FIELDNOTES-2/3 play the two surfaces that actually render a name: the
     Collection Log's ATTENDED/residue detail and the Bestiary modal's
     AWAY/server list — TROPHY-1's own reviewer finding was that only the
     second reads the server's kill count, so both get their own test. */
  () => tryRun('FIELDNOTES-1: every MONSTERS id has exactly one hunter\'s note, charset-clean, unique, and silent about its own weakness and undropped items', () => {
    const NOTES = window.HearthriseMonsterNotes;
    const MON = window.MONSTERS || {};
    const ITEMS = window.ITEMS || {};
    assert(NOTES && typeof NOTES === 'object', 'window.HearthriseMonsterNotes is unpublished');
    assert(Object.isFrozen(NOTES), 'MONSTER_NOTES must be frozen');
    const monIds = Object.keys(MON).sort();
    const noteIds = Object.keys(NOTES).sort();
    const missing = monIds.filter((id) => noteIds.indexOf(id) === -1);
    const orphan = noteIds.filter((id) => monIds.indexOf(id) === -1);
    assert(missing.length === 0 && orphan.length === 0,
      'missing notes: ' + JSON.stringify(missing) + ' — orphan notes: ' + JSON.stringify(orphan));
    const CHARSET = /^[A-Za-z ,.;:'’!?—-]+$/u;
    const SYN = {
      ember: /\b(ember\w*|fire\w*|flame\w*|burn\w*|blaz\w*|scorch\w*|smoulder\w*|heat|torch\w*|kindl\w*|candle\w*|lantern\w*)\b/i,
      frost: /\b(frost\w*|ice|icy|cold\w*|freez\w*|snow\w*|chill\w*|winter\w*|rime)\b/i,
      poison: /\b(poison\w*|venom\w*|toxi\w*|blight\w*)\b/i,
    };
    const multiItemIds = Object.keys(ITEMS).filter((id) => ITEMS[id] && ITEMS[id].n && ITEMS[id].n.indexOf(' ') >= 0);
    const seen = new Map();
    for (const id of noteIds) {
      const note = NOTES[id];
      assert(typeof note === 'string', id + ': note is not a string');
      assert(note.length >= 60 && note.length <= 160, id + ': note length ' + note.length + ' out of [60,160]: "' + note + '"');
      assert(CHARSET.test(note), id + ': note fails the charset whitelist: "' + note + '"');
      assert(!seen.has(note), id + ': note duplicates ' + seen.get(note));
      seen.set(note, id);
      const m = MON[id];
      if (!m) continue;
      if (m.hiddenElement) {
        for (const el of Object.keys(SYN)) {
          assert(!SYN[el].test(note), id + ' (hiddenElement) note leaks the ' + el + ' element: "' + note + '"');
        }
      } else if (m.elementWeak && SYN[m.elementWeak]) {
        assert(!SYN[m.elementWeak].test(note), id + ' note leaks its own elementWeak (' + m.elementWeak + '): "' + note + '"');
      }
      const dropIds = new Set((m.drops || []).map((d) => d.id));
      const lower = note.toLowerCase();
      for (const itemId of multiItemIds) {
        const n = ITEMS[itemId].n.toLowerCase();
        assert(lower.indexOf(n) === -1 || dropIds.has(itemId),
          id + ' note names "' + ITEMS[itemId].n + '" which it does not drop: "' + note + '"');
      }
    }
  }),

  () => tryRunAsync('FIELDNOTES-2: the Journal plays a found monster\'s note in its drop table, and leaks nothing to an undiscovered row', async () => {
    const G = window.G;
    const NOTES = window.HearthriseMonsterNotes || {};
    assert(window.HearthriseJournal, 'the Journal is unpublished');
    const snap = snapshotG();
    try {
      G.bestiary = { kobold: { kills: 1 } };
      window.HearthriseJournal.open('bestiary');
      const row = document.querySelector('#panel-journal [data-jr-mon="kobold"]');
      assert(row, 'no tappable kobold row in the Bestiary');
      row.click();
      const body = document.querySelector('#panel-journal .hr-cl-detail');
      assert(body && body.innerHTML.indexOf(NOTES.kobold) >= 0,
        'the drop table does not contain the kobold note: ' + (body && body.innerHTML.slice(0, 200)));
      const back = document.querySelector('#panel-journal [data-jr-back]');
      assert(back, 'no Back control in the drop table');
      back.click();
      assert(!document.querySelector('#panel-journal [data-jr-mon="slime"]'), 'an undiscovered slime row is tappable');
      const panel = document.getElementById('panel-journal');
      assert(panel && panel.innerHTML.indexOf(NOTES.slime) === -1,
        'the slime note leaked into the Bestiary while slime is undiscovered');
    } finally {
      window.showTab('profile');
      restoreG(snap);
      try { window.saveLocal(); } catch (e) {}
    }
  }),

  () => tryRunAsync('FIELDNOTES-3: the Bestiary modal plays an away-only goblin\'s note under the same predicate that un-???s its name, and fails safe with the namespace gone', async () => {
    const G = window.G;
    const NOTES = window.HearthriseMonsterNotes;
    assert(NOTES, 'window.HearthriseMonsterNotes is unpublished');
    const snap = snapshotG();
    const prev = G._bestiaryTrophies;
    const rig = hrCharmDriver();
    const listHtml = () => (document.getElementById('best-list') || {}).innerHTML || '';
    try {
      G.bestiary = {};
      await rig.drive({ kills_by_class: {}, kills_by_monster: { goblin: 12 }, trophies: [] });
      window.HearthriseJournal.open('bestiary');
      assert(listHtml().indexOf(NOTES.goblin) >= 0,
        'an away-only goblin kill count did not paint the goblin note in the Bestiary: ' + listHtml().slice(0, 300));
      assert(listHtml().indexOf(NOTES.slime) === -1, 'the undiscovered slime note leaked into the Bestiary list');
      // FAIL-SAFE ARM: the namespace disappears — the name must still render and no row may print "undefined".
      const stashed = window.HearthriseMonsterNotes;
      delete window.HearthriseMonsterNotes;
      window.HearthriseJournal.open('bestiary');
      assert(/Goblin/.test(listHtml()), 'the goblin name stopped rendering once HearthriseMonsterNotes was removed');
      assert(!/undefined/.test(listHtml()), 'a missing note namespace printed the literal string "undefined": ' + listHtml().slice(0, 300));
      window.HearthriseMonsterNotes = stashed;
    } finally {
      rig.restore();
      try { window.showTab('profile'); } catch (e) {}
      if (prev === undefined) delete G._bestiaryTrophies; else G._bestiaryTrophies = prev;
      restoreG(snap);
    }
  }),
  /* FIELDNOTES-4: the note sat INSIDE .br-info after an inline
     <small>, so it glued to the stats ("8 HPIt eats…") and wrapped one word per
     line in the ~76px info column, stretching a found card to ~330px. It is now
     a full-width, two-line-clamped line under the row; the full text rides title. */
  () => tryRun('FIELDNOTES-4: a Bestiary note sits below the stats line, full width, and keeps the found card near an undiscovered card\'s height', () => {
    const G = window.G;
    const NOTES = window.HearthriseMonsterNotes || {};
    const snap = snapshotG();
    try {
      G.bestiary = { slime: { kills: 12 } };
      window.HearthriseJournal.open('bestiary');
      const rows = Array.from(document.querySelectorAll('#best-list .bestiary-row'));
      const found = rows.find((r) => r.classList.contains('discovered'));
      assert(found, 'no discovered bestiary row painted for slime');
      const note = found.querySelector('.br-note');
      const stats = found.querySelector('.br-info small:not(.br-note)');
      assert(note && stats, 'discovered slime row lacks .br-note or its stats line');
      const nb = note.getBoundingClientRect(), sb = stats.getBoundingClientRect();
      assert(nb.top >= sb.bottom - 0.5, 'the note runs into the stats line: note top ' + nb.top + ' < stats bottom ' + sb.bottom);
      const undisc = rows.filter((r) => r.classList.contains('undiscovered')).map((r) => r.getBoundingClientRect().height);
      assert(undisc.length, 'no undiscovered row to compare against');
      const base = Math.min.apply(null, undisc), h = found.getBoundingClientRect().height;
      assert(base > 0 && h <= base * 2.25, 'discovered card ' + h.toFixed(0) + 'px vs undiscovered ' + base.toFixed(0) + 'px (> 2.25x; the glued note made it ~5x): the note stretches the card');
      assert(note.getAttribute('title') === NOTES.slime, 'the full note is not reachable via title: ' + note.getAttribute('title'));
    } finally {
      try { window.showTab('profile'); } catch (e) {}
      restoreG(snap);
    }
  }),

  /* ══ ROAD-1..5 — Journeyman's Road (content pack 7) ═══════════════════════
     Six chain:'road' QUEST_DEFS rows, each MIRRORED onto a dedicated `ev*`
     projection of the server's lifetime counter (accrue.js
     EVENT_COUNTER_PROJECTION) and paid by hr_claim_quest
     (2026-09-28-journeymans-road.sql). The client never decides a claim: it
     shows the server's number, fires on it, and banks what the RPC reports.
     Every claim here is STUBBED — the suite runs on a live signed-in account
     during the play gate and must never pay a real quest out of a test. */
  () => tryRunAsync('ROAD-1 (away): a complete statement with ev:smithed=60 shows road_forge 60/60 and fires its claim; the grant banks exactly what the RPC reports, no mint', async () => {
    const G = window.G;
    const A = window.HearthriseAccrual;
    const snap = snapshotG();
    const origClaim = window.HearthriseGoalClaim;
    const fired = [];
    try {
      assert(A && typeof A.reconcileEventCounters === 'function', 'HearthriseAccrual.reconcileEventCounters is unpublished');
      assert(typeof window.hrApplyQuestClaimGrant === 'function', 'hrApplyQuestClaimGrant is unpublished');
      const def = (window.QUEST_DEFS || []).find((q) => q.id === 'road_forge');
      assert(def && def.chain === 'road' && def.mirror === 'stats.evSmithed' && def.goal === 60,
        'road_forge must be a chain:road row mirroring stats.evSmithed at 60: ' + JSON.stringify(def));
      window.HearthriseGoalClaim = {
        isSignedIn: () => false,
        claimQuest: (id) => {
          fired.push(id);
          return Promise.resolve(id === 'road_forge'
            ? { ok: true, credited: true, quest: id, gold: 700, items: { iron_pickaxe: 1 }, skipped_items: {} }
            : { ok: false, error: 'test_stub' });
        },
      };
      G.stats = {};
      G.quests = [];
      G.inventory = Object.assign({}, G.inventory);
      delete G.inventory.iron_pickaxe;
      window.ensureRetentionState();
      A.reconcileEventCounters(G, { progress_truncated: false,
        progress: [{ kind: 'stat', key: 'ev:smithed', period: '', value: 60, state: 'active' }] });
      assert(G.stats.evSmithed === 60, 'the away statement did not project ev:smithed onto stats.evSmithed: ' + G.stats.evSmithed);
      window.ensureRetentionState();
      const q = () => G.quests.find((x) => x.id === 'road_forge');
      assert(q() && q().progress === 60, 'road_forge must read 60/60 off the projection, got ' + (q() && q().progress));
      /* The next quest tick is what completes a mirrored row (the sync never grants). */
      window.updateQuest('smithed', 0);
      assert(q().done === true, 'road_forge at the server\'s 60 did not complete');
      assert(fired.indexOf('road_forge') !== -1, 'completing road_forge did not fire hr_claim_quest: ' + JSON.stringify(fired));
      assert(!(G.inventory.iron_pickaxe > 0),
        'THE CLIENT MINTED the pickaxe before the server answered — completeQuest must mirror the RPC, not addItem');
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      assert(q().claimed === true, 'an ok claim must mark the row claimed so the sweep stops asking');
      assert(G.inventory.iron_pickaxe === 1,
        'hrApplyQuestClaimGrant must bank EXACTLY the reported {iron_pickaxe:1}, got ' + G.inventory.iron_pickaxe);
      /* A replay answer (credited false) banks nothing. */
      const again = window.hrApplyQuestClaimGrant({ ok: false, error: 'already_claimed' });
      assert(again === null && G.inventory.iron_pickaxe === 1, 'a refused/replayed claim banked an item');
    } finally {
      window.HearthriseGoalClaim = origClaim;
      restoreG(snap);
    }
  }),

  () => tryRun('ROAD-2 (attended): updateQuest(\'smithed\',999) and a live smithing tick leave road_forge at the server figure', () => {
    const G = window.G;
    const snap = snapshotG();
    const origClaim = window.HearthriseGoalClaim;
    const realNotify = window.notify, realDeclare = window.declareActivity;
    const fired = [];
    try {
      window.HearthriseGoalClaim = { isSignedIn: () => false, claimQuest: (id) => { fired.push(id); return Promise.resolve({ ok: false, error: 'test_stub' }); } };
      window.notify = () => {};
      window.declareActivity = () => null;
      G.stats = { evSmithed: 12, smithed: 0 };
      G.quests = [];
      window.ensureRetentionState();
      const q = () => G.quests.find((x) => x.id === 'road_forge');
      assert(q().progress === 12, 'CONTROL: road_forge must start at the projected 12, got ' + q().progress);
      window.updateQuest('smithed', 999);
      assert(q().progress === 12 && !q().done,
        'a client updateQuest(\'smithed\',999) moved road_forge to ' + q().progress + ' — the row must READ the server figure, never count');
      /* A LIVE bench tick: the client's own counters move, the road row does not. */
      const r = (window.ARTISAN_RECIPES.smithing || []).find((x) => x.req <= 1
        && (x.input || (x.inputs && Object.keys(x.inputs).length)));
      assert(r, 'no level-1 smithing recipe for the probe');
      const feed = {};
      if (r.inputs) Object.keys(r.inputs).forEach((k) => { feed[k] = r.inputs[k] * 3; });
      else feed[r.input] = 3;
      G.rooms = Object.assign({}, G.rooms, { forge: 1 });
      G.inventory = Object.assign({}, G.inventory, feed);
      G.skills = Object.assign({}, G.skills, { smithing: 100000 });
      const before = Number(G.stats.smithed) || 0;
      window.doArtisanAction('smithing', r.id);
      assert((Number(G.stats.smithed) || 0) > before,
        'CONTROL: the live tick did not run (stats.smithed did not move) — the assertion below would be vacuous');
      assert(q().progress === 12 && !q().done,
        'a live smithing tick moved road_forge to ' + q().progress + ' — only the server\'s ev:smithed may');
      assert(fired.indexOf('road_forge') === -1, 'road_forge fired a claim below its server goal');
    } finally {
      try { if (typeof window._stopArtisan === 'function') window._stopArtisan(); } catch (e) {}
      window.HearthriseGoalClaim = origClaim; window.notify = realNotify; window.declareActivity = realDeclare;
      restoreG(snap);
    }
  }),

  /* THE P1 THIS LANE CLOSES: stats.kills is a client-only residue counter that
     runs up to 368 ahead of the server's ev:kill_any on live characters. A
     mirror of it shows 500/500, fires a claim the server refuses, and the
     sweep re-fires it every minute. MUTATION: point road_hunt (or
     hundred_kills) back at 'stats.kills' and this test goes red. */
  () => tryRun('ROAD-2b: stats.kills=500 with a projected ev:kill_any of 132 — road_hunt and hundred_kills show 132, stay open, and fire no claim', () => {
    const G = window.G;
    const A = window.HearthriseAccrual;
    const snap = snapshotG();
    const origClaim = window.HearthriseGoalClaim;
    const fired = [];
    try {
      window.HearthriseGoalClaim = { isSignedIn: () => false, claimQuest: (id) => { fired.push(id); return Promise.resolve({ ok: false, error: 'test_stub' }); } };
      G.stats = { kills: 500 };
      G.quests = [];
      window.ensureRetentionState();
      A.reconcileEventCounters(G, { progress_truncated: false,
        progress: [{ kind: 'stat', key: 'ev:kill_any', period: '', value: 132, state: 'active' }] });
      assert(G.stats.kills === 500, 'CONTROL: the client tally must stay ahead (500), got ' + G.stats.kills);
      window.updateQuest('kill_any', 1);
      const hunt = G.quests.find((x) => x.id === 'road_hunt');
      const hk = G.quests.find((x) => x.id === 'hundred_kills');
      assert(hunt && hunt.progress === 132 && !hunt.done,
        'road_hunt must show the server\'s 132 and stay open, got ' + JSON.stringify(hunt && { p: hunt.progress, d: hunt.done }));
      assert(hk && hk.progress === 100 && hk.done === true,
        'CONTROL: hundred_kills at the server\'s 132 >= 100 completes — got ' + JSON.stringify(hk && { p: hk.progress, d: hk.done }));
      assert(fired.indexOf('road_hunt') === -1, 'road_hunt fired a claim the server would refuse: ' + JSON.stringify(fired));
      /* And below 100 the XP milestone is not handed out on the client's say-so. */
      G.quests = [];
      window.ensureRetentionState();
      A.reconcileEventCounters(G, { progress_truncated: false,
        progress: [{ kind: 'stat', key: 'ev:kill_any', period: '', value: 60, state: 'active' }] });
      window.updateQuest('kill_any', 1);
      const hk2 = G.quests.find((x) => x.id === 'hundred_kills');
      assert(hk2.progress === 60 && !hk2.done,
        'hundred_kills paid on the client tally (500) while the server says 60: ' + JSON.stringify({ p: hk2.progress, d: hk2.done }));
    } finally {
      window.HearthriseGoalClaim = origClaim;
      restoreG(snap);
    }
  }),

  () => tryRun('ROAD-3: questDestination resolves every Journeyman\'s Road row without the fallback', () => {
    const QN = window.HearthriseQuestNav;
    assert(QN && typeof QN.destination === 'function', 'the quest-nav resolver is not loaded');
    const road = (window.QUEST_DEFS || []).filter((d) => d.chain === 'road');
    assert(road.length === 6, 'expected the six road rows, got ' + road.map((d) => d.id).join(','));
    road.forEach((d) => {
      const dest = QN.destination(Object.assign({}, d));
      assert(dest && dest.tab && dest.via !== 'fallback', d.id + ' reaches no destination (via ' + (dest && dest.via) + ')');
    });
  }),

  () => tryRun('ROAD-4: "Your first day" draws only the rows with no chain; the Road card is hidden while a first-day step is open and shown after', () => {
    const G = window.G;
    const H = window.HearthriseHome;
    const snap = snapshotG();
    const panel = document.getElementById('panel-profile');
    const hadActive = !!(panel && panel.classList.contains('active'));
    try {
      assert(H && typeof H.__roadModel === 'function' && typeof H.__firstDayModel === 'function', 'the chain-card seams are unpublished');
      G.stats = { kills: 0, gathered: 0, harvested: 0, cropsHarvested: 0, rareDrops: 0 };
      G.quests = [];
      G.daily = { lastReset: window.hrGoalDayKey(), tasks: [] };
      window.ensureRetentionState();
      const dayDefs = window.QUEST_DEFS.filter((d) => !d.chain);
      const m0 = H.__firstDayModel();
      assert(m0 && m0.total === dayDefs.length,
        'the first-day card must draw exactly the ' + dayDefs.length + ' rows with no chain, drew ' + (m0 && m0.total));
      assert(m0.steps.every((s) => !/^road_/.test(s.id)), 'a road row leaked into "Your first day"');
      assert(H.__roadModel() === null, 'the Road card must be hidden while a first-day step is open');
      const lead = window.HearthriseLaunchpad && window.HearthriseLaunchpad.getNextMilestone();
      assert(!(lead && lead.kind === 'quest' && lead.goal && lead.goal.chain),
        '"Next up" offered a road row (' + (lead && lead.label) + ') while the first day is still open');

      // The first day, finished and paid.
      G.quests.forEach((q) => { if (!q.chain) { q.done = true; q.claimed = true; q.progress = q.goal; } });
      assert(H.__firstDayModel() === null, 'CONTROL: a finished first day yields no model');
      const road = H.__roadModel();
      assert(road && road.chain === 'road' && road.total === 6 && road.currentIndex === 0,
        'the Road card must draw its six rows once the first day is done: ' + JSON.stringify(road && { t: road.total, c: road.currentIndex }));
      const html = H.__firstDayHtml(road);
      assert(/Journeyman(&#39;|&#039;|')s Road/.test(html) && !/Your first day/.test(html), 'the Road card is mistitled: ' + html.slice(0, 200));
      assert(/hd-fl-row/.test(html) && new RegExp('Step 1 of 6').test(html),
        'the Road card must reuse the First Light rows (hd-fl-row tap targets) and count its own steps');
      if (panel) {
        panel.classList.add('active');
        H.render();
        const root = document.getElementById('hd-root');
        assert(root && root.querySelector('.hd-firstlight.hd-chain-road .hd-fl-row'), 'the rendered Home has no Road card');
        assert(root.querySelectorAll('.hd-firstlight').length === 1, 'two chain cards drew at once');
      }
      // The road finished too: nothing left to draw.
      G.quests.forEach((q) => { q.done = true; q.claimed = true; q.progress = q.goal; });
      assert(H.__roadModel() === null, 'a finished road must leave the screen');
    } finally {
      if (panel && !hadActive) panel.classList.remove('active');
      restoreG(snap);
      try { H.render(); } catch (e) {}
    }
  }),

  () => tryRun('ROAD-5: a complete statement with no ev rows zeroes the ev* road fields and leaves stats.gathered, cooked and kills untouched', () => {
    const A = window.HearthriseAccrual;
    const g = { stats: { evGather: 90, evCooked: 7, evSmithed: 5, evCrafted: 4, evKillAny: 300,
      gathered: 1234, cooked: 56, kills: 789, smithed: 11, crafted: 12 } };
    A.reconcileEventCounters(g, { progress_truncated: false, progress: [] });
    ['evGather', 'evCooked', 'evSmithed', 'evCrafted', 'evKillAny'].forEach((k) => {
      assert(g.stats[k] === 0, 'a complete empty statement must zero ' + k + ', got ' + g.stats[k]);
    });
    assert(g.stats.gathered === 1234 && g.stats.cooked === 56 && g.stats.kills === 789
      && g.stats.smithed === 11 && g.stats.crafted === 12,
      'the projection touched a shared client counter (goal board / weeklies / cook_100 read these): ' + JSON.stringify(g.stats));
    const rows = (A.EVENT_COUNTER_PROJECTION || []).map((r) => r.stat);
    ['gathered', 'cooked', 'smithed', 'crafted', 'kills'].forEach((k) => {
      assert(rows.indexOf(k) === -1, 'EVENT_COUNTER_PROJECTION maps onto the shared stats.' + k);
    });
  }),
  /* WEEK-A..D — Home's "Your week" card and the hearth band's realm cells read
     the server's goal-state cache only; unknown is the pending dash (§6). */
  () => tryRun('WEEK-A: an unknown week and unknown realm cells render the pending dash, never 0', () => {
    const TW = window.HearthriseThisWeek;
    if (!TW) return skip('no this-week module');
    const v = TW.view(null);
    assert(v.known === false, 'view(null) must be unknown');
    const html = TW.cardHtml(v);
    assert(/bal-pending/.test(html), 'the unknown card has no pending dash');
    assert(!/[0-9]/.test(html.replace(/<[^>]*>/g, '')), 'the unknown card prints a digit: ' + html);
    const cells = TW.todayCells(null);
    assert(cells.length === 2 && cells.every((c) => /bal-pending/.test(c.html)), 'an unknown realm cell is not pending');
  }),
  () => tryRun('WEEK-B: the card leads with the week the server counted, and QUIET when nothing leads', () => {
    const TW = window.HearthriseThisWeek;
    if (!TW) return skip('no this-week module');
    const m = { 'w:wk_logs': { have: 180, target: 250 }, 'w:wk_kills': { have: 30, target: 100 },
      'd:kill_any': { have: 12, target: 10 }, 'd:gold_500': { have: 1520, target: 500 } };
    const v = TW.view(m);
    assert(v.lead === THIS_WEEK.find((r) => r.goal === 'wk_logs').lead, 'lead: ' + v.lead);
    assert(v.rows.map((r) => r.goal).join() === 'wk_logs,wk_kills', 'rows: ' + v.rows.map((r) => r.goal));
    const c = TW.todayCells(m);
    assert(c[0].html === (12).toLocaleString() && c[1].html === (1520).toLocaleString(), 'cells: ' + JSON.stringify(c));
    assert(TW.view({ 'w:wk_rare': { have: 1, target: 5 } }).lead === THIS_WEEK_QUIET, 'a 20% week must read QUIET');
  }),
  () => tryRun('WEEK-C: the hearth band shows the realm\'s Kills today, pending when unknown, and no residue Harvest', () => {
    const H = window.HearthriseHome, was = window.HearthriseGoalState;
    if (!H || typeof window.showTab !== 'function') return skip('no Home');
    const leds = () => Array.from(document.querySelectorAll('#panel-profile .hd-ledger .hd-led'));
    const cell = () => leds().find((n) => /Kills today/.test(n.textContent)) || null;
    try {
      window.HearthriseGoalState = { peek: () => null };
      window.showTab('profile'); H.render();
      assert(cell() && cell().querySelector('.bal-pending'), 'an unknown Kills today must be the pending dash');
      assert(!leds().some((n) => /Harvest/.test(n.textContent)), 'the residue Harvest cell is back');
      window.HearthriseGoalState = { peek: () => ({ 'd:kill_any': { have: 12, target: 10 } }) };
      H.render();
      assert(cell().querySelector('b').textContent === (12).toLocaleString(), 'Kills today: ' + cell().textContent);
    } finally { window.HearthriseGoalState = was; try { H.render(); } catch (e) {} }
  }),
  /* HOME-BAND-922 — the b560 visual gate: on a 922x423 landscape phone the
     hearth band collapses to a 56px strip, and its content (name + 44px rename
     tap floor + a wrapped status line + two-line realm labels) was ~93px, so
     the name hid under the activity bar and the figures were cut top and
     bottom. Renders the real #app at each size and measures the band. */
  () => tryRun('HOME-BAND-922: the hearth band holds its name and every realm cell at 922x423 and 1280x800', () => {
    const H = window.HearthriseHome, was = window.HearthriseGoalState;
    if (!H || typeof window.showTab !== 'function') return skip('no Home');
    const prevTab = window.activeTab, bad = [];
    try {
      window.HearthriseGoalState = { peek: () => ({ 'd:kill_any': { have: 12, target: 10 } }) };
      window.showTab('profile'); H.render();
      const app = document.getElementById('app').outerHTML;
      for (const [w, h] of [[922, 423], [1280, 800]]) {
        phoneFrame(w, h, app, (doc) => {
          const at = w + 'x' + h + ': ', q = (s) => doc.querySelector('#panel-profile ' + s);
          const inner = q('.hd-hearth-in'), name = q('.hd-name'), bar = doc.querySelector('.activity-bar');
          assert(inner && name && bar, at + 'the frame drew no hearth band or activity bar');
          const box = inner.getBoundingClientRect(), n = name.getBoundingClientRect(), a = bar.getBoundingClientRect();
          const leds = [...doc.querySelectorAll('#panel-profile .hd-ledger .hd-led')];
          assert(leds.length === 3 && leds.some((l) => l.querySelector('.bal-pending')) && leds.some((l) => /^12$/.test(l.querySelector(':scope > b').textContent.trim())),
            at + 'the band must draw XP today plus one known and one pending realm cell: ' + leds.map((l) => l.textContent).join(' | '));
          for (const el of leds.flatMap((l) => [...l.querySelectorAll(':scope > b, :scope > span')])) {
            const r = el.getBoundingClientRect();
            if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5) {
              bad.push(at + '"' + el.textContent.trim() + '" at y ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' outside the band ' + Math.round(box.top) + '..' + Math.round(box.bottom));
            }
            if (el.tagName === 'SPAN') {
              const lh = parseFloat(doc.defaultView.getComputedStyle(el).lineHeight) || parseFloat(doc.defaultView.getComputedStyle(el).fontSize) * 1.4;
              if (r.height > lh + 1) bad.push(at + '"' + el.textContent.trim() + '" wraps (' + Math.round(r.height) + 'px for a ' + Math.round(lh) + 'px line)');
            }
          }
          if (n.top < a.bottom && n.bottom > a.top && n.left < a.right && n.right > a.left) {
            bad.push(at + 'the name (y ' + Math.round(n.top) + '..' + Math.round(n.bottom) + ') sits under the activity bar (y ' + Math.round(a.top) + '..' + Math.round(a.bottom) + ')');
          }
          if (n.top < box.top - 0.5) bad.push(at + 'the name starts ' + Math.round(box.top - n.top) + 'px above the band');
        });
      }
    } finally {
      window.HearthriseGoalState = was;
      try { window.showTab(prevTab || 'profile'); H.render(); } catch (e) {}
    }
    assert(bad.length === 0, 'THE b560 BAND BUG: ' + bad.join('; '));
  }),
  /* COMEBACK-1..3 + RENDER — Home's 'Come back for' reads only the server's
     clocks: the farm tile's predicates, the mirrored dungeon windows, the
     server-stated bag and the core Boss rotation. Fixtures are local objects. */
  () => tryRun('COMEBACK-1: the return clocks come from the server\'s clocks', () => {
    const CB = window.HearthriseComeBack;
    assert(CB && typeof CB.model === 'function', 'window.HearthriseComeBack is missing');
    const now = Date.UTC(2026, 8, 28, 12, 0, 0);
    const rows = CB.model({ now, combatLv: null, bossDays: null, msToMidnight: 18120000, fighting: false,
      crops: [{ name: 'Turnip', ready: false, waterable: false, inMs: 8040000 }, { name: 'Carrot', ready: true, waterable: false, inMs: 0 }],
      windows: [{ name: 'X', untilMs: now + 11520000, keyName: 'K', keys: null }] });
    assert(rows[0].when === 'Now', 'the ready crop must lead: ' + JSON.stringify(rows[0]));
    assert(rows.some((r) => r.when === 'in about 2h 14m'), 'no ripens row at 2h 14m: ' + rows.map((r) => r.when).join(' | '));
    const d = rows.find((r) => r.kind === 'dungeon');
    assert(d && d.when === 'in 3h 12m', 'dungeon row: ' + JSON.stringify(d));
    assert(/bal-pending/.test(d.sHtml) && !/>0</.test(d.sHtml), 'an unstated key count must be the pending dash: ' + d.sHtml);
    assert(rows.length <= 4 && rows[rows.length - 1].kind === 'newday', 'rows: ' + rows.map((r) => r.kind).join(','));
  }),
  () => tryRun('COMEBACK-2: the Boss row agrees with the rotation and the engine', () => {
    const CB = window.HearthriseComeBack, B = window.HearthriseBossOfDay, M = window.MONSTERS || {};
    assert(CB && typeof CB.inputs === 'function', 'window.HearthriseComeBack is missing');
    const now = Date.now(), days = CB.inputs({}, now).bossDays;
    assert(days && days.length === 7, 'bossDays must be exactly 7 days: ' + (days && days.length));
    days.forEach((d, k) => assert(d.id === B.botdFor(now + k * 86400000).dailyId, 'day ' + k + ' disagrees with botdFor'));
    let t = null;
    for (let k = 0; k < 1100 && t == null; k++) { const b = B.botdFor(now + k * 86400000); if (b.dailyId === b.weeklyId) t = now + k * 86400000; }
    assert(t != null, 'no day in 1100 where the daily boss is also the weekly one');
    const boss = (lv, at) => CB.model(Object.assign(CB.inputs({}, at), { combatLv: lv, fighting: false })).find((r) => r.kind === 'boss');
    const id = B.botdFor(t).dailyId, kb = B.killBonusesFor(id, t), a = boss(999, t);
    assert(kb.dropMult === 2 && kb.xpMult === 1.5, 'the weekly lift moved: ' + JSON.stringify(kb));
    assert(a && a.sHtml.includes('+100% drop odds') && a.sHtml.includes('+50% kill XP'), 'form (a) must quote killBonusesFor: ' + (a && a.sHtml));
    const min = Math.min(...days.map((d) => (M[d.id].tier - 1) * 15)), c = boss(0, now);
    assert(c && c.t === 'At Combat ' + min + ' the Boss of the Day opens to you', 'form (c): ' + (c && c.t));
    assert(!/^The The/.test(c.sHtml), 'form (c) doubled the article: ' + c.sHtml);
  }),
  () => tryRun('COMEBACK-3: the key count and the windows are the server\'s', () => {
    const CB = window.HearthriseComeBack, D = window.DUNGEONS || {};
    assert(CB && typeof CB.inputs === 'function', 'window.HearthriseComeBack is missing');
    const ids = Object.keys(D).filter((id) => D[id].cost && D[id].cost.key);
    assert(ids.length >= 2, 'need two keyed dungeons');
    const [id, id2] = ids, key = D[id].cost.key, now = Date.now(), iso = (ms) => new Date(ms).toISOString();
    const fx = { inventory: { [key]: 3 }, _dungeonCooldowns: { [id]: { auto: iso(now + 3600e3) }, [id2]: { auto: iso(now - 1000) } } };
    const w = CB.inputs(fx, now).windows;
    assert(w.length === 1 && w[0].name === D[id].name, 'only the open-later window may stay: ' + JSON.stringify(w));
    assert(w[0].keys === null, 'an unstated bag must read null, never the display inventory: ' + w[0].keys);
    fx._serverBag = { [key]: 2 };
    assert(CB.inputs(fx, now).windows[0].keys === 2, 'the server bag must be the count');
  }),
  () => tryRun('COMEBACK-RENDER: Home draws Come back for with 1..4 rows, the new day last', () => {
    const H = window.HearthriseHome, prevTab = window.activeTab;
    assert(window.HearthriseComeBack && H, 'window.HearthriseComeBack or Home is missing');
    try {
      window.showTab('profile'); H.render();
      const h = document.querySelector('#panel-profile [data-cbk-section] h3');
      assert(h && h.textContent === 'Come back for', 'no Come back for heading');
      const rows = [...document.querySelectorAll('#panel-profile [data-cbk-row]')];
      assert(rows.length >= 1 && rows.length <= 4, 'rows: ' + rows.length);
      assert(rows[rows.length - 1].getAttribute('data-cbk-row') === 'newday', 'the new-day row must be last');
      const bad = [...document.querySelectorAll('#panel-profile [data-cbk-row] .when')].map((n) => n.textContent)
        .filter((s) => /-\d|NaN|undefined|Infinity/.test(s));
      assert(!bad.length, 'broken clocks: ' + bad.join(' | '));
    } finally { try { window.showTab(prevTab || 'profile'); H.render(); } catch (e) {} }
  }),
  () => tryRunAsync('WEEK-D: the goal-state cache is deep-frozen and peek() expires at 120 s', async () => {
    const S = window.__hrSyncServerGoals, GS = window.HearthriseGoalState;
    if (!S || !GS) return skip('no goal-state seam');
    const may = window.clientMayWriteRecordField, gc = window.HearthriseGoalClaim, now = Date.now;
    try {
      window.clientMayWriteRecordField = (f) => f !== 'gold' && f !== 'gems';
      window.HearthriseGoalClaim = { isSignedIn: () => true, goalState: () => Promise.resolve({ ok: true, goals: [
        { goal_id: 'wk_logs', weekly: true, target: 250, have: 180, complete: false, claimed: false }] }) };
      S.reset();
      await new Promise((r) => S((fresh) => r(fresh)));
      const m = GS.peek();
      assert(m && Object.isFrozen(m) && Object.isFrozen(m['w:wk_logs']), 'the cache or its entry is not frozen');
      const t = now.call(Date); Date.now = () => t + 121000;
      assert(GS.peek() === null, 'a 121 s old cache must read unknown');
      Date.now = now; S.reset();
      assert(GS.peek() === null, 'a reset cache must read unknown');
    } finally { Date.now = now; window.clientMayWriteRecordField = may; window.HearthriseGoalClaim = gc; S.reset(); }
  }),
  /* QUEST-PENDING — the strip draws the pending dash, never "0 / N", while
     neither hr_goal_state nor a measured baseline has spoken (CLAUDE.md §6). */
  () => tryRunAsync('QUEST-PENDING: an unmeasured quest reads pending on the strip; the server goal state turns it into a number', async () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof window.renderQuestStrip !== 'function' || !window.__hrSyncServerGoals) return skip('no quest strip');
    const snap = snapshotG(); const knownWas = window.G._eventCountersKnown;
    const prog = () => { window.renderQuestStrip(); const el = document.querySelector('#global-quests-strip .gq-quest .gq-prog'); return el || { textContent: '', querySelector: () => null }; };
    let unfeed = null;
    try {
      window.__hrSyncServerGoals.reset();
      window.getGoalsForToday();
      window.G.stats = Object.assign({}, window.G.stats); delete window.G.stats.planted; delete window.G._eventCountersKnown;
      window.G.dailyGoals = { dayKey: window.G.dailyGoals.dayKey, picks: ['plant'], startValues: {}, claimed: {} };
      let p = prog();
      assert(p.querySelector('.bal-pending') && !/\b0 \/ \d/.test(p.textContent), 'an unmeasured quest rendered ' + p.textContent);
      A.reconcileEventCounters(window.G, { progress_truncated: false, progress: [{ kind: 'stat', key: 'ev:planted', period: '', value: 40, state: 'active' }] });
      p = prog();
      assert(p.querySelector('.bal-pending'), 'a local baseline alone is not the server count (CLAIM-FROM-SERVER): ' + p.textContent);
      unfeed = await feedServerGoals([goalRow('plant', 0, (window.getGoalsForToday()[0] || {}).target || 1)]);
      p = prog();
      assert(!p.querySelector('.bal-pending') && /^0 \/ \d+$/.test(p.textContent.trim()), 'a server-counted quest rendered ' + p.textContent);
    } finally {
      if (unfeed) unfeed();
      if (knownWas === undefined) delete window.G._eventCountersKnown; else window.G._eventCountersKnown = knownWas;
      restoreG(snap); try { window.renderQuestStrip(); } catch (e) {}
    }
  }),
];
