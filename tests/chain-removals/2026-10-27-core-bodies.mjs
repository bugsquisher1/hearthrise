/* DECLARED REMOVALS for 2026-10-27-core-bodies.sql (lane core-rebuild, Tyler 2026-10-19: the game is
   closed and wiped; the old knockout/recovery, combat-style and Hitpoints model is deleted outright).

   That file restates hr_apply and hr_state_of from the CHAIN-END text (pg_get_functiondef after every
   file in tests/schema-apply-order/ before it) with the core model's edits. tests/run-sql-tests.mjs
   PART 1f-ii diffs it against the last STATIC link of each chain and fails on any removed line not
   listed here, and on any line listed here that is no longer removed. GENERATED from that same diff
   (the lane's scratch removals.mjs, run-sql-tests' own applyBody); read by Security as the exhaustive
   list of what the core rebuild takes out:

   hr_apply (vs 2026-10-25-settle-hooks.sql):
     · THE RECOVERY LINE — c_delta_keys 'recovering_until', v_recover / c_max_recover_ms, the whole
       (4a-v) validation incl. the Security F1 no-shortening floor, its SET write, and 'bad_recovering'
       leaving c_release_codes (the line is re-flowed);
     · the death row's recovery_ms / resume_hp fields and their range check, and c_max_death_rows 24
       (a death ends the hunt: one death row per window at most, bounded in the core body);
     · the stored max_hp clamp on hp (`least(max_hp, …)`), now hr_vitals_of's derived max HP;
     · the combat-skill list naming attack / strength / hitpoints (the skill list is melee, ranged,
       magic, defense, prayer);
     · the non-value key list, which gains level_xp (re-flowed), and the bare `else` / `end if;` /
       `--` / blank lines the restated blocks re-nested.
   hr_state_of (vs 2026-10-22-hunt-sessions-delete-away.sql):
     · state.recovering_until and its comment block; state.max_hp read off the dropped column (now
       derived: `least(v_st.hp, max_hp)` and 'max_hp' from hr_vitals_of); the deaths_* anchors' recovery
       comments; state.combat_style (CLOSED `state`; streak_day_key's terminator moves); the skills
       cell's capped hr_level_from_xp (now hr_skill_level, each skill on its own curve); the opening
       `return jsonb_build_object(` (the body now reads the vitals first).

   FROZEN: regenerate only together with the migration, and re-read every line. */
export const HR_APPLY = Object.freeze([
  "    -- First-Night Idle Rescue: THE RECOVERY LINE. An ABSOLUTE timestamptz, or an",
  "    -- explicit null VOID meaning \"back on your feet\". Engine output, never",
  "    -- client input; validated at (4a-v) below and written in the SET clause.",
  "    'recovering_until',",
  "    -- Recovery rev. 2 (N3): THE DEATH LEDGER. An ARRAY of server-derived death",
  "    -- records, fanned out to one player_ledger row each at (4z). Engine output.",
  "    'version_conflict', 'bad_recovering', 'bad_deaths',",
  "  -- First-Night Idle Rescue: the validated recovery line. NULL here means",
  "  -- either \"the key was absent\" or \"the key was an explicit void\"; the SET",
  "  -- clause distinguishes those with `p_delta ? 'recovering_until'`, never with",
  "  -- this variable. c_max_recover_ms is the blast radius on how far ahead a line",
  "  -- may be stamped: the ladder's own cap is 3,840,000 ms (64 minutes) and this",
  "  -- is 70 minutes - the cap plus commit slack, and nothing like a week.",
  "  v_recover timestamptz;",
  "  c_max_recover_ms constant int := 4200000;",
  "  -- Recovery rev. 2 (N3): the death-ledger fan-out's loop variable and its",
  "  -- ceiling. 24 is above the ~20 deaths the ladder's own 64-minute cap permits",
  "  -- in a twelve-hour night, so an honest span is never truncated and a",
  "  -- pathological one is bounded rather than able to write a row per tick.",
  "  c_max_death_rows constant int := 24;",
  "    --    introduced by 2026-09-06-recovering-until.sql",
  "    -- (4a-v) THE RECOVERY LINE (First-Night Idle Rescue). A death interrupts",
  "    -- a run; it does not terminate it. The character is Knocked Out until this",
  "    -- ABSOLUTE instant, and both callers - the away span (src/core/combat-sim.js",
  "    -- simulateSpan) and the live combat-start intent (set-activity.js) - simply",
  "    -- refuse to swing while it runs. One column, one rule, no second code path.",
  "    -- `null` is a legal and MEANINGFUL value: the explicit VOID that says \"this",
  "    -- character is up\". The engine sends it on every window that ended with",
  "    -- nobody face-down, exactly as it sends `fight = {}` for \"no fight in",
  "    -- flight\" - the honest statement, not merely the absence of one. Without it",
  "    -- a stale line would survive forever and a character could stay knocked out.",
  "    if p_delta ? 'recovering_until' then",
  "      if jsonb_typeof(p_delta->'recovering_until') = 'null' then",
  "        v_recover := null;",
  "      elsif jsonb_typeof(p_delta->'recovering_until') <> 'string' then",
  "        perform public.hr_reject('bad_recovering',",
  "          jsonb_build_object('type', jsonb_typeof(p_delta->'recovering_until')));",
  "        begin",
  "          v_recover := (p_delta->>'recovering_until')::timestamptz;",
  "        exception when others then",
  "          perform public.hr_reject('bad_recovering', jsonb_build_object('why', 'unparseable'));",
  "        end;",
  "        -- THE CEILING, against the SERVER CLOCK. now(), never a delta value.",
  "        if v_recover > now() + make_interval(secs => c_max_recover_ms / 1000.0) then",
  "          perform public.hr_reject('bad_recovering',",
  "            jsonb_build_object('why', 'too far ahead', 'until', p_delta->'recovering_until'));",
  "      -- SECURITY F1 - THE NO-SHORTENING FLOOR. The ceiling above answers \"is",
  "      -- this line too far ahead\"; nothing answered \"may this call SHORTEN or",
  "      -- CANCEL a knockout that is still running\", and the answer used to live",
  "      -- only in the engine (src/core/combat-sim.js:632/694 preserve-or-clear).",
  "      -- An invariant enforced solely in the Edge Function is an invariant a",
  "      -- forged or compromised caller does not have: one settle carrying",
  "      -- recovering_until = null while 60 minutes remained would void the column",
  "      -- that arms 1 and 2 of this very file are built on, and the Recovery Rule",
  "      -- with it.",
  "      --   REJECT when the STORED line is still in the future and the proposal",
  "      --   is NULL or EARLIER. Raise-forward stays legal (a later instant is a",
  "      --   NEW death, already bounded by the ceiling above) and so does equality",
  "      --   (the ordinary settle re-states the stored line). A line that has",
  "      --   ALREADY EXPIRED is freely clearable, which is the engine's honest",
  "      --   \"this character is up\" and needs no privilege.",
  "      --   THE SANCTIONED CURE DOES NOT COME THROUGH HERE: hr_rest takes the",
  "      --   same advisory key, charges real provisions and issues its OWN update",
  "      --   (recovering_until = null) at its step (f), so this floor needs no",
  "      --   exception and can be absolute.",
  "      --   v_st is the row this function already holds under \"for update\", and",
  "      --   now() is the server clock — no extra query, no client instant.",
  "      if v_st.recovering_until is not null",
  "         and v_st.recovering_until > now()",
  "         and (v_recover is null or v_recover < v_st.recovering_until) then",
  "          jsonb_build_object('why', 'would shorten an active knockout',",
  "                             'stored', v_st.recovering_until,",
  "                             'proposed', p_delta->'recovering_until'));",
  "    -- truncated: an over-long array means the engine proposed something the",
  "    -- ladder cannot produce, and quietly writing the first 24 of it would turn",
  "    -- an engine bug into a plausible-looking audit trail. Every FIELD is",
  "        -- The recovery a row CLAIMS may not exceed the same blast radius the",
  "        -- line itself is held to. One ceiling, two readers.",
  "        if coalesce((v_death->>'recovery_ms')::bigint, 0) < 0",
  "           or coalesce((v_death->>'recovery_ms')::bigint, 0) > c_max_recover_ms then",
  "          perform public.hr_reject('bad_deaths',",
  "            jsonb_build_object('why', 'recovery_ms out of range', 'ms', v_death->'recovery_ms'));",
  "                       then greatest(0, least(max_hp, coalesce((p_delta->>'hp')::int, hp)))",
  "                                where key = any(array['attack','strength','defense',",
  "                                                      'hitpoints','ranged','magic','prayer'])))",
  "           -- First-Night Idle Rescue: an ABSOLUTE, validated at (4a-v). Absent",
  "           -- key = untouched; present = set, INCLUDING to null (the explicit",
  "           -- void that means \"back on your feet\").",
  "           -- NOT voided by an `activity` key, unlike `fight` immediately below:",
  "           -- being knocked out is a property of the CHARACTER, so a player who",
  "           -- switches to fishing while face-down is still face-down. Clearing it",
  "           -- on a switch would make \"switch away, switch back\" a free cure.",
  "           recovering_until = case when p_delta ? 'recovering_until'",
  "                                   then v_recover else recovering_until end,",
  "              where dk <> all (array['gold','gems','items','xp','equip','journal']))",
  "             'recovery_ms',      coalesce((v_death->>'recovery_ms')::bigint, 0),",
  "             'resume_hp',        coalesce((v_death->>'resume_hp')::bigint, 0),",
  "      else",
  "        end if;",
  "    --",
  "",
]);
export const HR_STATE_OF = Object.freeze([
  "  return jsonb_build_object(",
  "    -- ── state — THE FLAT SCALAR BAG (opens here, closes at combat_style) ──",
  "      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,",
  "      -- First-Night Idle Rescue: THE RECOVERY LINE. An absolute server instant",
  "      -- before which the character is Knocked Out - no swing, no gather, no XP,",
  "      -- no loot, no food. Flat, like every other watermark, so a nested bag",
  "      -- cannot hide a missing column behind a default. NULL here means \"up\";",
  "      -- an ABSENT KEY means \"this database predates Recovery\", and the engine",
  "      -- distinguishes those two by presence, never by coalescing.",
  "      -- ── state.recovering_until — the Recovery line (a death is never a free heal) ──",
  "      'recovering_until', v_st.recovering_until,",
  "      -- Recovery rev. 2: THE LADDER'S TWO ANCHORS, projected as SCALARS.",
  "      -- has never died and get a free fall on every settle. A survival",
  "      -- mechanic must not depend on a truncatable read. The day key is",
  "      -- ── state.deaths_* — the ladder's two anchors, read DIRECTLY (never off the truncatable `progress` array) ──",
  "      --    introduced by 2026-09-06-recovering-until.sql",
  "      'streak_day_key', v_st.streak_day_key,",
  "      -- combat-style slice: the player's per-weapon-family style choice, e.g.",
  "      -- {\"sword\":\"defensive\"}. Written ONLY by hr_set_style. The accrual engine",
  "      -- reads it as `st.combat_style` and passes it through",
  "      -- normaliseStyleKeys -> resolveStyle, which is what makes an AWAY fight",
  "      -- train the skill the player actually picked. A PARTIAL map is normal;",
  "      -- `{}` means \"chosen nothing\" and every family falls to its default.",
  "      -- ── state.combat_style — the per-family style choice (CLOSES `state`) ──",
  "      --    introduced by 2026-08-24-combat-style.sql",
  "      'combat_style', coalesce(v_st.combat_style, '{}'::jsonb)),",
  "               'xp', xp, 'level', public.hr_level_from_xp(xp),",
]);
