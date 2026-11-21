/* DECLARED REMOVALS for 1032-approved-cuts.sql (lane/c-approved-cuts, 2026-11-20: the approved cuts, Tyler's rulings 22-10,
   24-5 and 27-7, build plan L10).

   HR_STATE_OF: that file restates hr_state_of WHOLE from the LIVE image (its §0 pins md5 e0a71bfe, the
   2027-01-18-dead-surfaces-cut.sql body: replay chain = production) and removes exactly six keys, nothing else:
     · `dungeon_cooldowns` (hr_dungeon_cooldowns is dropped with the old dungeons) and its comment block;
     · `state.dungeon_scrip` (player_state.dungeon_scrip is dropped with the scrip) and its comment block;
     · `state.hearth_tokens` (account_wallet.hearth_tokens is dropped with the bond); the comment above it stops naming tokens;
     · `gem_unlocks` (hr_gem_unlocks_of is dropped with the gem rows) and its comment block;
     · `state.rested_xp` / `state.rested_at` and their comment block (the rested bank is cut, Tyler 2026-11-21 S-9 c; the
       columns go in 1040-rested-bank-cut.sql, added by lane/c-formula-steps).
   HR_ASSERT_GRANT_HYGIENE: link 25 of HR_GRANT_HYGIENE_CHAIN replaces ONE block of link 24's c_engine_allow, the entries of
   hr_quartermaster_buy and hr_dungeon_settle with their claim comments (both functions are dropped in the same file), by a
   two-line note (tools/derive-grant-hygiene.mjs patch old_dungeons_cut).
   tests/run-sql-tests.mjs PART 1f-ii diffs each body against its predecessor's text and fails on any removed line not listed
   here. GENERATED from that same diff (run-sql-tests' applyBody, the multiset line walk).

   FROZEN: regenerate only together with the migration, and re-read every line. */
export const HR_STATE_OF = Object.freeze([
  "    -- dungeon re-entry cooldown (2026-09-12): the ACTIVE windows only, PER DUNGEON",
  "    -- and PER MODE — { dungeon_id: { auto: ISO, manual: ISO, scavenger: ISO } },",
  "    -- each mode waiting cooldown_s / its divisor (Designer ruling: scavenger is a",
  "    -- quarter window, not an exemption). Derived by hr_dungeon_cooldowns from the",
  "    -- append-only ledger + the catalogue — THE SAME function hr_dungeon_settle's",
  "    -- gate (c) refuses on, so the countdown shown and the window enforced are one",
  "    -- number. Was a client-clock `G.dungeons.lastRun` in the residue, which the",
  "    -- armed path had stopped stamping at all. An expired mode is omitted, a dungeon",
  "    -- with no active mode is omitted, a fresh character gets {}; an absent key on",
  "    -- the client means READY, which is safe because the SERVER refuses — the worst",
  "    -- case is one refused intent. The client reads map[dungeon_id][mode].",
  "    -- ── dungeon_cooldowns — the ACTIVE windows, per dungeon and per mode ──",
  "    --    introduced by 2026-09-12-dungeon-cooldown.sql",
  "    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),",
  "      -- dungeon-scrip: the server-owned Dungeon Scrip currency, credited by",
  "      -- hr_dungeon_settle. Flat scalar beside marks so src/net/record.js reads it",
  "      -- the SAME way it reads gold/marks — a moved-but-UNKNOWN scrip balance",
  "      -- renders a pending glyph, never a forgeable local number. Never an",
  "      -- inventory item, never a residue mirror (dungeon-settlement.md §1).",
  "      -- ── state.dungeon_scrip — the Dungeon Scrip currency ──",
  "      --    introduced by 2026-09-10-dungeon-scrip.sql",
  "      'dungeon_scrip', v_st.dungeon_scrip,",
  "      -- ── state — tokens, hit points, the bank cap and the activity pointer ──",
  "      'hearth_tokens', coalesce(v_w.hearth_tokens, 0),",
  "    -- gem-unlock-buy (2026-09-14): the themes and cosmetics this ACCOUNT owns,",
  "    -- as a flat array of '<namespace>:<id>'. Written only by hr_buy_gem_unlock",
  "    -- (there is no client write policy and no client write grant on",
  "    -- player_progress), read by src/legacy.js ownsGemUnlock so ownership stops",
  "    -- living in the residue a cloud restore can rewind — the half of the b371",
  "    -- gem dupe that made a free theme STICK. Always contains the FREE rows",
  "    -- (theme:default), so the starting theme stays equippable the moment the",
  "    -- client reads this set server-first. Never truncated: an entitlement must",
  "    -- not be able to read as \"you own nothing\".",
  "    -- ── gem_unlocks — the ACCOUNT’s entitlements. NEVER truncated ──",
  "    --    introduced by 2026-09-14-gem-unlock-buy.sql",
  "    'gem_unlocks', public.hr_gem_unlocks_of(p_user, v_st.slot),",
  /* the rested bank (Tyler 2026-11-21, S-9 c): its two scalars and their comment block, taken out here so a second apply of
     this file never installs a body that reads the columns 1040-rested-bank-cut.sql drops (lane/c-formula-steps). */
  "      -- rested-record (b437): the bank charge count + its wall-clock watermark,",
  "      -- flat like the other watermarks so a nested bag cannot hide a missing",
  "      -- column behind a default. The accrual shell reads them as st.rested_xp /",
  "      -- st.rested_at and settles [rested_at, now()] alongside the pointer.",
  "      -- ── state.rested_xp / rested_at — the rested bank and its watermark ──",
  "      --    introduced by 2026-08-22-rested-record.sql",
  "      'rested_xp', v_st.rested_xp,",
  "      'rested_at', v_st.rested_at,",
]);

export const HR_ASSERT_GRANT_HYGIENE = Object.freeze([
  "    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────",
  "    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it",
  "    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its",
  "    -- whole caller-supplied surface is: a character slot, a version, an",
  "    -- idempotency uuid, and an OFFER ID (a primary key in the generated,",
  "    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip",
  "    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip",
  "    -- balance is the character's OWN player_state row read under the SAME advisory",
  "    -- lock hr_apply takes; the debit is bounded by that balance",
  "    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine",
  "    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:",
  "    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be",
  "    -- one server transaction with the item grant, or the b372 half-undo returns —",
  "    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only",
  "    -- writer of the spend is the client.",
  "    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',",
  "    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────",
  "    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it",
  "    -- removes nothing, so PART 1f-ii grades this link with an EMPTY",
  "    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its",
  "    -- whole caller-supplied surface is: a character slot, a version, an",
  "    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,",
  "    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a",
  "    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and",
  "    -- touches NO loot. No item, no qty, no chance, no price and no timestamp",
  "    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or",
  "    -- the character's OWN row read under the SAME advisory lock hr_apply takes;",
  "    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry",
  "    -- KEY is debited from the caller's own player_inventory (the load-bearing",
  "    -- gate); the cooldown and the per-day scrip cap read now() and the",
  "    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine",
  "    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:",
  "    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md",
  "    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this",
  "    -- the only writer of the currency is the client.",
  "    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',",
  "    -- removes nothing, so PART 1f-ii grades this link with an EMPTY",
  "    -- declared-removals list. Position carries no meaning — check (7) tests",
  "    -- membership with `<> all (...)`.",
  "    -- declared-removals list. Position carries no meaning — check (7) tests",
  "    -- membership with `<> all (...)`.",
  "    --",
  "    --",
]);
