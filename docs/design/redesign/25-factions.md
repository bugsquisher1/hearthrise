# 25. Factions: the First Flame and the Last Ember in the redesign

2026-11-22, `lane/factions-redesign`, game designer. Docs only. Tyler: "Don't forget about factions unless we are removing them." `02-architecture.md` had them at "Pause, no decision, no plug today". This file decides.

**Read on `origin/set/v0.2.144` at 9ee1cd2c2.** `src/data/factions.js`, `src/data/text/factions.js`, `src/data/text/people.js`, `src/data/grounds/shape.js` (`STANDING_SIDES`), the three Morrow Hills packs, `tests/faction-ground-balance.mjs`, the board's 2026-11-19 Morrow Hills section, `00` (WO-8, GR-71), `02` packages 6, 7 and 7b, `12`, `13-market`, `13-security-list`, `14`, `15`, `17` v3, `19`, `20`, `21`. The two mood references named in the brief (`art/reference/faction-*-mood-2026-11-14.webp`) are not on the set. The built outfits (`art/world-src/gen-2026-11-18/faction-outfits/preview.png`) were read instead: the Flamebearer in steel and Hearth gold, the Emberkeeper hooded in charcoal and crimson. `24-content-pipeline.md` is not on origin.

**Tags.** CODE (read from `src/`), BOARD (a dated board section), JUDGMENT (a design call).

---

## 0. Verdict: KEEP, as the company's side. No combat power

**How it plays:** once a hero of your company has killed Lord Krell, Holly and Quartermaster Venn both ask you up the road to Morrow. You pick a side for the whole company. Hunting your side's grounds in the Morrow Hills earns standing. Standing unlocks your side's outfit, a banner for your hall and a mark by your name. Every week the two sides are tallied on the Hills, and the side that turned out more hangs its banner over Havora's north gate. Your side has its own chat channel. Nothing about a side makes a hero hit harder.

**Purpose test (CLAUDE.md section 10).**

| Question | Answer |
|---|---|
| Which player problem does it solve? | In an idle game few people are online at the same minute, and a player with no clan has no one to belong to. Clans are small and opt-in. A side is a big team every company joins with one press, and it makes other players' hunting matter to you: their hours count with yours on the week's tally. It also gives the first region after Krell a story with a choice in it, instead of a list of grounds |
| What decision does it add? | Which side, once, for the company (story and looks, never stats). Each week, whether to put hours on your side's grounds or hunt where your build is best. Which side to swap to, at a real cost |
| What does it plug into? | The Morrow Hills grounds (`standingFor`, CODE), the hall (a banner on the trophy wall), outfits and mounts (looks), chat (a channel), the ladders (a Side column and the weekly front), the records (each week's result) |

**Why not cut.** A cut loses the only big-team layer for players outside clans, and the Morrow Hills were built around two sides: the grounds pay a side, Holly's Vigil is drawn on the Ox Road map, and both outfits, their add-ons and their icons exist (CODE). The art and the story are paid for. What failed the purpose test in `02` was the old shape: a per-hero tab with one outfit track and a faction skill each. That shape is cut. The job above is new.

**Why no power.** Two sides with different power is a meta pick dressed as a story pick: players would read a tier list, not Holly's and Venn's lines, and the weaker side would empty. `19-power-ledger.md` row 16 says a new source takes a slice or is refused. Factions take none. They sit in the ledger as row 17 at 0 steps, beside mounts and the hall.

## 1. The story, tied to what exists

Everything here is already in the data. (CODE: `chronicle.js`, `people.js`, `text/factions.js`, the pack headers.)

- In Greenhaven the dead only rest if they are burned at the Great Hearth. Krell's priests burned his soldiers on the Pyre Field with no rite, and Krell buried the company he betrayed at Hask's Ford. North of the March, Gault raises the drivers and oxen of the Ox Road, and his Coal Runners carry fire between his camps.
- **The First Flame** follows Holly, who learned the rite from Rowe, the Keeper at the Great Hearth. Rowe is too old for the road, so Holly carries the Hearth's fire north to put Gault's coal out and give Morrow's dead a proper rest. Motto: "Preserve what was". Her camp is Holly's Vigil on the Ox Road.
- **The Last Ember** follows Quartermaster Venn, whose company died at the Ford when the old way failed it. Venn wants Morrow for the living who dig its seams and fight for it. Harry drives the cart. Motto: "Forge what comes next".
- Neither side is evil, and Havora belongs to neither. Rowe and the Great Hearth stay neutral: both sides burn their dead there.

## 2. The rules

### 2.1 Who holds a side: the company

**One side for the company** (all the account's heroes). JUDGMENT, against GR-71's per-hero choice:

- Trades, the flame, the plan, the hall and the ladders are already the company's (`02` sections 5, 6, 7, 9). A per-hero side would be the one identity a company can't show as one.
- Four heroes asking the same question four times is the repetition the first principle calls a bug.
- Parties stay open: heroes of both sides hunt any ground and party together (CODE, `term_limits`). Only the standing credit reads the side.
- **Clans are sideless.** One clan an account (`02` section 7), and a clan of mixed sides is rivalry in its own chat, not a problem to stop. The castle has no faction building, so the clan slice never meets a side.

### 2.2 Joining and swapping

| Rule | Value | Lever |
|---|---|---|
| Joining opens | The first server-counted kill of `lord_krell` by any hero of the company | `joinAfter` (kept) |
| Joining costs | Nothing. Asked once with a confirm (QA 2026-11-19 #2) | |
| Changing sides | Start a swap, then hunt **40 hero-hours** on the new side's grounds. Those hours pay swap time, not standing. Then finish it | `swapHeroMinutes` 2400 |
| Swap lock | 7 days from joining or the last swap | `swapCooldownDays` 7 |
| Cancel | Allowed. The swap time is lost | |
| Standing on a swap | Kept for both sides, never lost. A company that swaps back finds its old standing waiting | |

40 hero-hours is one full day for a four and four days for a lone hero. It has to be a real choice and not a weekly flip to chase the tally.

### 2.3 Standing

- **Earned:** one point for each settled hero-minute on a ground whose `standingFor` is the company's side, credited by the server's settle and never by a browser. Bought hunting blocks count like any other minute. Nothing else pays standing.
- **Kept per side and never spent.** Standing is a record of what the company did for its side, like a bestiary page. It unlocks the side's stock at marks and feeds the week's tally. Spending it would make a company's rank fall each time it bought something, and the week's tally would have to read a second number.
- **Shown in hours**, as today: "Standing: 212 h".

### 2.4 The quartermaster

Holly keeps the First Flame's stock and Venn the Last Ember's. Each line unlocks once at a standing mark. Outfit pieces are free (an earned reward). Hall and mount pieces cost gold, priced in wage hours at the buying hero's Level, the way every sink in the redesign is priced (`20` section 1.1). All of it is looks.

| Mark (hero-hours) | First Flame | Last Ember | Cost |
|---|---|---|---|
| Joining | The side's mark by the company name | The same | Free |
| 40 | Flamebearer (outfit) | Emberkeeper (outfit) | Free |
| 120 | A side banner for the hall's trophy wall | The same | 20 wage hours |
| 200 | Hearth Shield (add-on) | Harry's Lantern (add-on) | Free |
| 400 | A side cloth for a mount (ships with mounts) | The same | 30 wage hours |
| 600 | Holly's Light (add-on) | Kept Coal (add-on) | Free |

**Pace (JUDGMENT, COMPUTED):** a four on its side's grounds earns 40 hero-hours a day. The outfit takes a day, the last add-on about 15 days. A lone hero takes four times as long, which is `02` package 4's "slower and fair". The old per-hero marks were 25 / 100 / 300 hours for each hero separately (CODE), so a four now reaches the top piece in a fifth of the real days for the whole company, not once per hero.

### 2.5 The week on the Hills (the rivalry)

- Each side's score for the week is the **mean** of its companies' standing that week, each company capped at **40 hero-hours**, over the companies of that side that earned any.
- The higher mean wins. Ties go to neither.
- **What the winner gets:** its banner hangs over Havora's north gate for the next week, and the week goes in the records with both scores. Looks only.
- **Why a capped mean:** a sum hands the week to the bigger side, and players would pile onto it. A mean of capped hours rewards turnout, not headcount or hours bought. The cap sits below a lone hero's own hunting week (70 h), so Premium and bought blocks can never move the tally.

### 2.6 Ladders and chat

- **Ladders:** every ladder gets a Side column and a Side filter. No ladder ranks standing, so a side's best player is never a race to buy hours (the same reason `02` package 7 ranks no raw Level).
- **Chat:** a channel for your side beside Global, Clan, Party and Whispers. It is where a side organises its week.

### 2.7 What was considered and refused

| Idea | Verdict | Reason |
|---|---|---|
| A faction skill each (Bulwark, Reap) | **Cut** | Power that differs by side splits the curve. The board already took it off the Hills' blockers (2026-11-19) |
| A faction vow on the Roads | **Cut** | A vow is a build trade-off for a ground. Tying one to a side turns the side pick into a build pick |
| Faction-only Trait pools or Signatures | **Cut** | Each Hills ground already has its own pool and Signatures (`14`, `15`), and they drop for anyone who hunts there. Gating a drop by side would also split the market |
| Standing as a spendable currency | **Refused** | See 2.3. Gold is the sink. Standing is the record |
| Side-only grounds | **Refused** | Parties of mixed sides are the point of a shared world |
| A bonus for the smaller side | **Refused** | The capped mean already makes headcount not matter. A bonus would be power or loot, and both are out |

## 3. Balance

- **Power: 0 steps.** Ledger row 17 (`19-power-ledger.md`). `validateFactions` gains a clause: a faction or stock row that names a stat, a step, a modifier key or a rule-table key is refused. The guard proves it with a planted row.
- **Ground pay stays even:** the FG-EVEN rule holds as built. Every region after Krell opens as many grounds for one side as for the other, so neither side's grounds pay more by count. The Hills' grounds are graded by the same depth pay as every ground (`12` C-10, C-11), so a side's grounds can't pay more per hour either.
- **Gold:** the two gold lines (banner, mount cloth) are once per company per side. The sink reader is read with them on and off. JUDGMENT: under 1% of minted coin either way, so they can't move the 85 to 90% sink target in `20` section 2.
- **No faucet:** nothing in the stock or the tally pays gold, items or XP.

## 4. What ships when

| Ships | What | Status |
|---|---|---|
| **v0.3.0** | Nothing a player sees. No ground pays a side until the Morrow Hills open, and they are staged (`20` section 1.2). Reserved now: ledger row 17 at 0 steps, `STANDING_SIDES` and `standingFor` kept on the staged packs, FG guard kept, the `factions` switch stays off and `2027-05-27-arm-factions.sql` stays held. The current per-hero faction screens stay dark | Reservation only. Nothing to build |
| **With the Morrow Hills** (the patch that opens Carter's Rest and the Ox Road with their art, BOARD 2026-11-19) | Join, swap, standing per company, the quartermaster (mark, outfit, banner, add-ons), standing on the Hunts page and the hunt summary. The server is re-cut from per hero to per company (section 6) | DESIGNED here. Built per hero today (CODE), re-cut owed |
| **With the social layer** (ladders, chat channels) | The side channel, the Side column and filter, the week on the Hills and the north gate banner | DESIGNED here |
| **With mounts** | The mount cloth | DESIGNED here |

**Owed before the Hills open past the first pair:** Wyvern Roost pays the Last Ember, so it needs a First Flame partner to open. The board names it: the Night Shift (First Flame, not drafted, BOARD 2026-11-19).

## 5. The data shape: a third faction is rows

`STANDING_SIDES` stays in `shape.js` (the ground shape's vocabulary, read by packs). Everything else lives in `src/data/factions.js`, which the engine never imports (FG-EDGE, kept).

```js
FACTION_RULES = { joinAfter: 'lord_krell', standingAfter: 'barrow_march',
  swapHeroMinutes: 2400, swapCooldownDays: 7, dayCapMinutes: 1440,
  frontCapHeroMinutes: 2400 }
FACTIONS = { first_flame: { face: 'holly',  color: '--side-first-flame', mark: 'first_flame' },
             last_ember:  { face: 'venn',   color: '--side-last-ember',  mark: 'last_ember' } }
FACTION_STOCK = { flamebearer:        { side: 'first_flame', mark: 2400,  kind: 'outfit' },
                  flame_banner:       { side: 'first_flame', mark: 7200,  kind: 'hall_banner', wageHours: 20 },
                  flamebearer_shield: { side: 'first_flame', mark: 12000, kind: 'outfit_addon' }, ... }
```

Marks are hero-minutes, so the server never converts. `face` names a `people.js` row. `color` is a token in `tokens.css`. **A third faction** is one id in `STANDING_SIDES`, one `FACTIONS` row, its stock rows, its text rows and its art. The validator demands a `FACTIONS` row and at least one stock row for every side. FG-EVEN already counts per side, so with three sides a region opens grounds in threes. The week's tally is a mean per side, so it works for any number.

## 6. Server verbs and journals

The applied per-hero files (`2027-04-22-faction-standing.sql` and the rest, CODE) are replaced, not migrated. The wipe deletes their rows. One new `NNNN-faction-company.sql` (`node tools/new-migration.mjs faction-company`) holds the company shape.

| Verb | Who calls | What it does | Journal |
|---|---|---|---|
| `hr_faction_join(p_side, p_idem)` | Client intent | Checks the company's Krell kill and that it has no side. Sets the side | `faction` row |
| Standing credit, inside the settle | Engine only | Adds hero-minutes to the company's side total from the settled window. Clamped per hero per server day (`dayCapMinutes`) | `faction_standing`, folded hourly like every detail row |
| `hr_faction_swap_start / _finish / _cancel(p_idem)` | Client intent | As today, on the company | `faction` row |
| `hr_faction_claim(p_piece, p_idem)` | Client intent | Checks the mark on the server's total. A free piece is granted. A gold piece re-prices on the server from the wage at the buying hero's Level and debits through `hr_apply`. Once per company per piece | `faction_claim`, and a gold row for a paid piece |
| `hr_faction_week_close()` | `pg_cron`, server clock | Computes each side's capped mean, writes the week's row and the gate banner | `faction_weeks` (append-only, read-only to clients) |

**For the pre-EA Security list** (`13-security-list.md` N-10): standing is rankable and contributable, so only the settle writes it. A forged side, piece, price or week is refused. A claim pressed twice grants once. The week can't be closed twice or from a client. The side channel carries player text to other players and is escaped like Global.

## 7. The UI, in genre labels

- **Faction window**, opened from the company sheet. Tabs: **Side** and **Quartermaster**.
- Side tab: "Side: First Flame", "Standing: 212 h", "Earned on: First Flame grounds", "Swap cost: 40 h on Last Ember grounds", "Next swap: in 3 days", "This week: First Flame 18 h, Last Ember 15 h".
- Quartermaster tab: one row per piece, "Unlocks at: 120 h standing", "Price: {gold} gold", a Claim or Buy press. The price is the server's.
- Hunts page: "Standing: Last Ember" on a Hills ground. Hunt summary: "Last Ember standing +3 h".
- Chat: a "First Flame" or "Last Ember" tab. Ladders: a "Side" column and filter.
- The join prompt keeps Holly's and Venn's own lines (`said_` rows). Every other line is a label.

## 8. Walk-through: a company from Krell to its first outfit

Every id below was grepped on the set (`src/data/*`).

| Step | Does | Holds from steps 1 to N-1 | Doable? |
|---|---|---|---|
| 1 | A hero of the company kills `lord_krell` in his hall at Krell's Hold | A party at Krell's band (85 to 110, BOARD) | Yes. Krell is a boss in the monster rows (FG-JOIN, CODE) |
| 2 | The Morrow Hills patch opens `carters_rest` (Last Ember) and `ox_road` (First Flame) | The kill on record | Once that patch ships (section 4) |
| 3 | Holly and Venn ask. The player picks one side for the company and confirms | Step 1's kill, step 2's grounds | Yes once re-cut: `hr_faction_join` |
| 4 | Hunts the side's ground: the Ox Road for the Flame, Carter's Rest for the Ember | A side (step 3). The grounds' bands are 112 to 128 and 110 to 125 | Yes. Both are open to any side, only the credit differs |
| 5 | The settle credits standing, viewed or closed | Step 4's hunting | Yes, built per hero today. Per company after the re-cut |
| 6 | At 40 hero-hours, claims the Flamebearer or the Emberkeeper and wears it | Step 5's standing | Yes. Both outfits exist (`FACTION_OUTFITS`, the factionwear atlas) |
| 7 | Swaps, if they want: 40 hero-hours on the other side's ground | Both sides have an open ground (step 2) | Yes, because the pair opens together (FG-EVEN) |

**Not verified.** Nothing was played: no ground pays a side on the set. The mark sizes and the 40 h swap are judgment, read against the old per-hero pace, not measured.

## 9. Built (lane/factions-morrow-hills, 2026-11-23)

**Data** (`src/data/factions.js`): `FACTION_RULES` (swap 2,400 company hero-minutes, 7-day lock, 1,440-minute hero day fuse, 2,400-minute week cap), `FACTIONS` (one row a side: `face`), `STOCK_KINDS`, `FACTION_STOCK` (ten rows, five a side, the table in 2.4), `FACTION_OUTFITS` (now derived: the stock's worn rows) and `stockPrice`. Sampled as the First Flame's five rows and checked (the validator refused the empty Last Ember side, prices rose with Level), then expanded.

**Server** (STAGED): `1065-faction-company-catalogue.generated.sql` (`tools/gen-factions.mjs` moved forward: `hr_faction_stock`, the rule's company swap and week cap, `hr_faction_piece_price` pinned to `stockPrice` at four Levels) and `1065-faction-company.sql` (the company tables, every faction body restated on the company, `hr_faction_buy` dark, `hr_outfit_owned` on the company's claims, the hero tables dropped).

**Design calls made in the build (JUDGMENT):**

| Call | Why |
|---|---|
| A paid piece is priced at the company's TOP Level, not the pressing hero's | It is bought once for every hero. Pricing at the presser would make "log in the low alt to shop" the right move, a chore the first principle calls a bug. The presser still pays |
| The banner and the mount cloth are CLOSED rows (`opensWith: 'hall_wall'` and `'mounts'`) | Neither the hall's wall nor mounts can show them yet, and every piece needs a use (CLAUDE.md 3.5). The catalogue carries and prices them, the verbs refuse them, the page never lists them. Opening one is deleting `opensWith` |
| The paid verb (`hr_faction_buy`) ships DARK | A money surface with nothing to buy yet. The §7 self-check and `FS-COMPANY` prove it on a probe that opens a row |
| Free pieces are Claimed, paid pieces are Bought (two verbs) | One genre word per press. A claim never takes a number; only the buy compares a price |
| `FACTIONS` carries `face` only | The `color` token in section 5 does not exist in `tokens.css`, and `mark` is the side's own id. The art lane adds the token with the Faction window |
| A row's keys are an allowlist | "No power" is enforced as shape: any key outside a side's or a piece's shape (a stat, a step, a modifier, a rule) is refused (`FG-STOCK`) |
| A piece id may not spell any person (Holly, Harry, Venn, Rowe) | Names live in `people.js` only, so renaming a person stays one edit |
| The week's close is not built | It ships with the social layer (section 4). Its cap is in the rule row now, so the close reads one number |

**Walk-through against the built data and the replayed server** (ids grepped on the lane's tree):

| Step | Does | Holds from steps 1 to N-1 | Doable? |
|---|---|---|---|
| 1 | Any hero of the company kills `lord_krell` (`src/data/grounds/krells_hold`, a boss: FG-JOIN) | A party at Krell's band | Yes |
| 2 | The Morrow Hills patch opens `carters_rest` (`standingFor: 'last_ember'`) and `ox_road` (`'first_flame'`) | Step 1's kill on record | Only once that patch ships (both packs are staged; FG-EVEN holds the pair) |
| 3 | Any hero presses Join for the company (`hr_faction_join`) | Step 1's kill, on ANY hero | Yes: §7(b) and FS-COMPANY join hero 0 on hero 1's kill |
| 4 | Heroes hunt their side's ground; every settle adds to the company | A side (step 3), a paying ground (step 2) | Yes: FS-BOTH (viewed and closed) and FS-COMPANY (two heroes sum, each on its own day row) |
| 5 | At 40 company hero-hours, Claim the Flamebearer or the Emberkeeper; every hero owns the look | Step 4's standing | Yes: `hr_outfit_owned` reads the company's claims (§7(d)); both outfits have sheets and icons (`flamebearer.png`, `emberkeeper.png`) |
| 6 | Optional swap: 40 company hero-hours on the other side's ground, then Finish | Both sides' grounds open (step 2), the week passed | Yes: §7(f), FS-WORDS |

**Not verified:** nothing was played in the browser (the `factions` switch is off and no open ground pays a side). The marks, the 40 h swap and the two prices are 2.4's starting values, not measured.
