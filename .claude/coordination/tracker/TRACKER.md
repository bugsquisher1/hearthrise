# Hearthrise Tracker

The single tracker (Tyler 2026-10-20: "store it somewhere else rather than an artifact"). Replaces the claude.ai artifact 81VCt3YuFkKbrtke5u9jqK, whose database is unreachable from the second account. Both Claude sessions (PC Coordinator and cloud) read it at session start and update it in the SAME commit as the event (lane starts/ships, release live, ruling, bug, question). Tyler answers by editing this file, or in chat (Claude writes the answer here).

**Status:** Live v0.2.13 · updated 2026-10-20 03:40 UTC by the PC Coordinator (second account).

Statuses: `contradicted` contradicts a ruling · `not_built` · `partial` · `core` core rebuild · `lane` being fixed · `built` built correctly · `nc` not code-checkable.

---

## Needs your answer (open)

_None open._ Add new questions at the top of this list as `- **Qnn** (date) question — context. → Answer:`

## Answered (newest first; all folded into memory rulings-of-record)

- **Cooldown ember** on a cooling slot, like the sim? → yes
- **Party camera keys** 1–4 + P, like the sim? → yes
- **HP bars between server updates**: live or on update? → live
- **Spell cooldown groups**: attack, support, separate healing? → yes
- **Character creation**: name + outfit step before entering the world? → yes
- **Death cost on the slower curve**: 2% of TOTAL XP or of current level? → total XP, reduced by Blessings
- **Slower Level curve** (L10 ≈ 1 h, L50 ≈ 78 h, L100 ≈ 540 h, L200 ≈ 4,000 h) → yes
- **Screenshot checks**: desktop + phone? → desktop is priority 1, mobile when there is spare usage
- **Hunt Level bands** (Mill Cellar 1–8, Meadowbrook 5–15, Sewer 8–25, Coppercap 32–50; gap 25–32) → we'll build another next week
- **HP/mana on Level** → HP 150 + 10/Level, mana 100 + 10/Level; Prayer regen to be tested
- **Level curve v1** (L200 ≈ 910 h) → too fast; slow it down (superseded by the slower curve above)
- **Death**: −2% total Level XP (never de-levels), skills −2% of progress, Blessings reduce, back in town at full HP/mana → approve
- **Closed-page wording** → "A new game in development" is fine
- **Food cooldown** (food fired every second) → 2 s global cooldown, food and drink share it
- **Premium buys power?** → "What power?" (premium perks are not power)
- **Party Start**: wait for everyone → yes (default)
- **Stamina gold refills daily cap** → yes, 6 per day
- **Party seat on logout** → keep 10 minutes
- **Andy's email** → given; on the allowlist since 17:07 UTC 10-19
- **Own characters join party without accept** → yes
- **Farming at EA** → yes, Early Access
- **Walk time to a hunt** → none until there are town destinations to walk to
- **Party: one member dies** → everyone returns to town and resumes their last non-combat activity
- **Bestiary relic boost** ×1.05 / 1.12 / 1.18 / 1.25 → yes
- **Bestiary stages** → 1,250 / 2,500 / 5,000 / 10,000 kills; relic up to +25%, gold fee; no XP/damage bonus
- **Food always fires when its condition matches** (new slow half replaces the old) → yes, but food keeps a global cooldown
- **Millrace Sewer rename** → "The Sewer"

---

## In progress (lanes)

Integration order and details: `.claude/coordination/HANDOFFS.md` top entry.

| Lane | Owner | Status | Scope | Next |
|---|---|---|---|---|
| Food/drink 2 s cooldown, "The Sewer", no walk time (`lane/c-consume-cd-travel`) | PC | building | one shared food/drink cooldown, rename, travel 0, hunt never opens behind stamina | merging main (apply-order conflict) → apply 3 files, deploy engine, ship |
| Real names everywhere + no auto-walk (`lane/a-names-nowalk`) | PC | waiting | heroes' own names in chat/nameplates/social; hero never walks on its own | pin restated 10-20 (live body comment-stripped); apply after consume, then ship client |
| Invite on right-click + town activities (`lane/a-party-invite-menu`) | PC | building | Invite to party in menus; a hunt/party start stops town activities; no default fishing; burying ends server-side | finish + push; regenerate catalogue on top of consume |
| Reopen RPC sweep (`lane/c-reopen-rpc-sweep`) | cloud | ready | drop dormant claim RPCs (reopen blocker), revoke old market, RPC-surface guard | apply after party-invite |
| Live engine, option B (`lane/b-live-hunt`) | cloud | building | browser runs the shared engine for the viewed hero, server confirms; whole party drawn; visual fixes | edge hash + play gate |
| Action bar (`lane/b-vitals-hub`) | cloud | building | vitals hub, Swap/Insert, struck-slot reasons, settings into the bar | desktop visual gate |
| Bestiary (`lane/c-bestiary`) | cloud | building | account-wide stages, relic multipliers, gold fee, window | needs live engine's relicMult |
| Content names (`lane/d-content-names`) | cloud | final checks | filler-word renames | regenerate on top of main |
| New ground Levels 25–32 (`lane/d-ground-25-32`) | cloud | building | new hunt for the 25–32 gap | walk-through in report |
| SQL test reds (`lane/c-sql-tests-green`) | cloud | building | the 14 static failures | — |
| Name registry (`lane/c-name-registry`) | cloud | building | display vs character name collisions | — |
| Old server cleanup (`lane/c-server-cleanup`) | cloud | building | drop dead clans/raids/market/quests; keep hero-slot buying | after S1; edge redeploy |
| Windows float over the world (`lane/a-windows-float`) | — | paused | old unfinished WIP | needs a lane |
| Death popup | — | not started | centred popup per the 10-19 ruling | needs a lane |
| Shipped: core rebuild v0.2.7, food fix v0.2.9, UI fixes v0.2.10, party system v0.2.11, caster vfx + monster art v0.2.12, own characters in town v0.2.13 | | shipped | | |

**Known open bugs:** heroes stuck "busy" on a hidden activity (fix in party-invite-menu; workaround Inventory → Stop) · windows push the world · no death popup.

---

## Every ruling — status · owner · Tyler's verdict

No row has verdict "change". `A` = approved, `—` = no verdict yet.

### Accounts & characters
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| A1 | One account per player; no multi-account, multi-login, per-tab sessions | partial | later lane #38 (authStore tab) | A |
| A2 | 2 starting slots; slots 3–5 cost escalating gold | lane | Bury & characters lane | A |
| A3 | Up to 4 characters play at once, free; 4-per-hashed-IP cap | partial | server lane + Security gate | A |
| A4 | Character-session client; character strip; only the viewed character streams | partial | client (minor) | A |
| A5 | Premium per character, server column premium_until | built | | A |
| A6 | Premium daily training weapon (1 h tier, pick style; tiers 1/6/12/24/48 h; own name) | not_built | designer + Systems | A |
| A7 | Daily login reward premium-only, per character; streaks never reset | built | | A |
| A8 | Classless: Melee/Ranged/Magic/Defense, switch freely; no vocations | core | Core rebuild | A |
| A9 | Roles Melee/Ranger/Mage/Healer; Tank a function; banned role names | partial | art/content copy fix | A |
| A10 | Role from weapon (shield tank; axes/club DPS; bow Ranger; wand+spellbook Mage; staff Healer) | built | | A |
| A11 | Outfits cosmetic: base model, 4 recolour regions + fancy outfits | partial | art + character window | A |
| A12 | Home and Bestiary shared by all characters on an account | contradicted | server lane (account-scope bestiary/depot) | A |

### Hunts & density
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| H1 | Hunting instanced (solo or party) | built | | A |
| H2 | Hunts idle: no manual casts/keybinds | built | | A |
| H3 | Hunts keep running server-side after the browser closes | built | | A |
| H4 | Density = spawn population on the hunt picker, per ground, stepped | lane | Action bar lane | A |
| H5 | Max density ≥ 8 (full box) | partial | density + content | A |
| H6 | Uneven spawn mixes; card and bestiary show commonness | partial | UI + designer | A |
| H7 | Level floor is a warning; hard block at ≥ 15 below | built | | A |
| H8 | "Waste hunt" economics | nc | Tyler | A |
| H9 | Every hunt +25–35% profit in range | nc | Tyler | A |
| H10 | One monster family per hunt, 2–3 variants, one rare carrier | contradicted | designer + content | A |
| H11 | Start flow Mill Cellar → Sewer → Meadowbrook; EA = Greenhaven's 6 grounds | partial | content/designer | A |
| H12 | Heroes pass through each other; 1-tile footprint; 3.2 tiles/s | built | | A |
| H13 | Leash and pack reset | built | | A |
| H14 | Tank auto-casts Challenge; monsters switch targets | built | | A |
| H15 | Kiting rules | built | | A |
| H16 | Party up to 4, any mix; finder by weapon type | built | | A |
| H17 | Solo healer clears the first area with 0 falls | core | Core rebuild | A |
| H18a | Mining/Woodcutting passive during hunts | not_built | Systems (gather engine) | A |
| H18b | First tiers gatherable at the town edge at any level | contradicted | designer + data | A |
| H18c | Gathering slider hidden until the gather engine ships | lane | Action bar lane | A |
| H19 | Auto end → town + resume last non-hunt activity; training dummy | partial | Systems (training lane) | A |
| H20 | Hunt cards show personal-best XP/h and gp/h, Solo and Party | not_built | server + UI | A |
| H21 | Hunt routes through real space; walk time in cycle budget | built | | A |

### Action bar & conditions
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| C1 | 2×10 slots, slot visuals, Configure action modal | lane | Action bar lane | A |
| C2 | One deterministic conditional engine, ≤ 3 conditions, slot order = priority | lane | Action bar lane | A |
| C3 | Action bar visible in town, configurable anywhere | contradicted | action bar / UI | A |
| C4 | Action sets with real save/rename/delete/switch; tutorial teaches the builder | partial | action bar + tutorial | A |
| C5 | Target/stance/chase/distance on the bar; density not | lane | Action bar lane | A |
| C6 | "Potion" means food or drink | built | | A |
| C7 | Unknown reference elements: ask Tyler | nc | | A |
| C8 | References give function only; look is Hearthrise's own | nc | | A |

### Supplies & store
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| S1 | Food HP, drink mana; 50% instant + 50% over 6 s; no potions | built | | A |
| S2 | Own stock first, then store; never stops for stock; end-on-empty opt-in | built | | A |
| S3 | Gold can't pay → hunt ends (gold_out), end card says why | partial | action bar (out-of-gold) | A |
| S4 | Analyzer: own vs store supplies; income even, costs personal | built | | A |
| S5 | Runes/ammo carried first, then store; arrows per-shot cost | built | | A |
| S6 | NPC basics gold per use; crafted better; bronze tools buyable | partial | designer | A |
| S7 | Restock = one-tap refill after showing the total | built | | — |
| S8 | Stamina 1:1 drain/refill; cap 8 h free / 12 h premium | built | | A |
| S9 | Stamina refill purchase (≤ 4 h, pro rata, escalating, gold only, 6/day) | built | | A |
| LT1 | No pre-purchase: pick supplies from the bar "+", NPC price per use | lane | Action bar lane | A |
| LT2 | Store supplies auto-deducted; "When I run out of gold" Leave/sell loot | lane | Action bar lane | A |

### Combat & skills & Prayer
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| K1 | Melee/Ranged/Magic/Defense uncapped + Prayer; gather/craft cap 99 | core | Core rebuild | A |
| K2 | Basic attack 2.0 s for everyone | core | Core rebuild | A |
| K3 | Staff/wand basics cost mana, train Magic (mana × 1.5 × mult) | core | Core rebuild | A |
| K4 | Mana; HP/mana grow with Level; armour weight bonuses | core | Core rebuild | A |
| K5 | Prayer raises regen rates only, diminishing; buried bones | core | Core rebuild | A |
| K6 | Defense trains from hits in armour; scales with attacker level | core | Core rebuild | A |
| K7 | Armour weights Heavy/Medium/Light; blend; damage order; mitigation cap | not_built | designer + Systems | A |
| K8 | Melee styles anchor/bleed/crush; Bleed rules; Rend uses Life rune | partial | core + Systems | A |
| K9 | Bleed badge on bosses by default; two settings | built | | A |
| K10 | Elemental weaknesses/resistances; one multiplier | built | | A |
| K11 | Death ends the hunt, back to town, −2% XP, never de-levels | core | Core rebuild | A |
| K12 | Blessings: 3 levels, protect XP + skills, free under 30, per character | built | | A |
| K13 | XP per hero, server-credited; "+XP" popups grouped per 1 s | built | | A |
| K14 | Slower curve (L100 ≈ 540 h, L200 ≈ 4,000 h) | built | | A |
| K15 | One server engine; 10 s settle cadence; 100 ms combat steps | built | | — |
| K16 | Basic analyzer for free, full for premium | lane | UI lane | A |
| K17 | Bosses get attack/special animations; regulars walk + corpse | nc | art | A |

### Loot & gear & economy
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| L1 | Every monster: gold + junk + imbuement item + equipment; one rare carrier per hunt | contradicted | designer + Systems (drop tables) | A |
| L2 | Bones their own drop, buried for Prayer | lane | Bury & characters lane | A |
| L3 | Auto-sell opt-in; imbuement items Take/Depot; rare/relic never auto-sold | partial | Systems | A |
| L4 | Fixed gear stats; enhancement/imbuement rules | not_built | designer + Systems | A |
| L5 | Rare ~1 per 10–20 h; extremely rare ~1 per 100–150 h | nc | Tyler | A |
| L6 | Bestiary stages 1,250/2,500/5,000/10,000; relic ×1.05/1.12/1.18/1.25; gold fee; account-wide | contradicted → lane | Bestiary lane (cloud) | A |
| L7 | Party loot even split; custom rules only if all agree | partial | Systems | A |
| L8 | Party rare roll 1–100, no repeat winner until all have one | not_built | Systems | A |
| L9 | Loot rules Keep/Depot/Sell/Supply + pickup filter | partial | action bar / Systems | A |
| L10 | Bag is a real inventory | built | | A |
| L11 | No paid XP boosts | nc | | A |
| L12 | Crowns never earned in game; Crowns-for-gold with caps | contradicted | designer + Security gate | A |
| L13 | Discord gift = in-game cosmetic, never currency | contradicted | server + designer | A |
| L14 | Premium time with Crowns; crypto no | not_built | Tyler (money) | A |
| L15 | Housing at EA scope; dungeons paused; bounty hunter on hold | partial | later lane #36 | A |
| L16 | Tyler runs economy modelling; no synthetic sims this week | nc | | — |

### World & art
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| W1 | Style 1, high top-down, no diagonal lean | nc | art | — |
| W2 | Never mix old-style art with style-1 | nc | art | — |
| W3 | Cut-corner walls standard | nc | art | — |
| W4 | No uniform straight terrain lines | nc | art | — |
| W5 | Knight v3 south walk is the gold standard | nc | art | — |
| W6 | World art through tools/world-art, side by side with live town | built | | — |
| W7 | Creatures gritty 128 px painterly-pixel, muted | nc | art | — |
| W8 | Charcoal & Gold only; no brown; text ≥ 12 px | partial | UI / cleanup | — |
| W9 | World-first shell; windows in game; HUD widgets | partial | UI (panels) | — |
| W10 | Each floating-number type has a Settings toggle | built | | — |
| W11 | Combat log is a chat tab, filterable | built | | A |
| W12 | Hunt panels build once, patch in place | built | | A |
| W13 | Desktop/Steam first, built for mobile | built | | A |
| W14 | Town textured; 5 high-end homes unique sites | nc | art | A |
| W15 | PixelLab AI disclosure; Tiled import priority 2 | not_built | Tyler/marketing | A |
| W16 | Windows float OVER the world; never move the view (10-19) | lane → paused | windows-float lane (needs owner) | — |
| W17 | Hero never walks on its own (10-19) | lane | names-nowalk | — |

### Social
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| SO1 | Right-click menu: Trade, Inspect, Message, Friend, Invite to party, Block | lane | party-invite-menu (invite), UI lane | A |
| SO2 | Player Trade separate lane, hidden until built | built | | A |
| SO3 | Chat tabs, time, name[level role]; guild chat at EA | partial | Systems | — |
| SO4 | Game modes after launch | nc | | A |

### Closed alpha & access
| Id | Ruling | Status | Owner | V |
|---|---|---|---|---|
| CA1 | Closed: Tyler + QA + Andy; one full Security review before anyone else | built | | — |
| CA2 | While closed, no per-change Security review | nc | | A |
| CA3 | Brand-new-game wording only | contradicted | UI / Tyler for copy | A |
| CA4 | Nothing ported from legacy.js; no back-compat; wipe at EA | partial | later lanes #31/#32/#36 | A |
| CA5 | Semver; bNNN retired | built | | A |
| CA6 | Steam EA early Dec 2026 (June 2027 OK); page review Nov 3–4 | nc | Tyler | A |
| CA7 | Discord cleanup closer to beta | nc | Tyler | A |
