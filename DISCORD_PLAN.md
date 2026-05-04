# Hearthrise Discord — Plan

Living doc for the Hearthrise Discord server's design and gamification vision.

---

## Server structure (current — built 2026-05-04)

```
📋 Info
  ├─ #announcements        (welcome, big news, build releases)
  ├─ #changelog            (build notes; auto-mirrored from CHANGELOG.md eventually)
  ├─ #rules-and-info       (server rules, beta etiquette, how to ask for help)
  └─ #hall-of-fame         (Major Milestone broadcasts — see Milestones section)

💬 Community
  ├─ #general              (default channel — chitchat)
  ├─ #game-discussion      (game-focused talk, strategy, theorycraft)
  └─ #screenshots          (post your homestead, builds, achievements)

🐛 Feedback
  ├─ #bug-reports          (auto-posted from in-game 🐛 button + screenshot)
  └─ #suggestions          (player feature ideas, balance feedback)

🎮 Play Together
  ├─ #lfg-bounties         (find groups for the daily bounty board)
  └─ #lfg-dungeons         (dungeon party formation)

⚔️ Clans
  ├─ #clan-recruitment     (post your clan, find recruits)
  └─ #clan-leaders         (private to clan leaders — set up later via roles)
```

---

## Roles & badges (vision — Tyler's request)

These do NOT exist yet. The server currently has just the auto-generated `@everyone` and `@Hearthrise` (server owner) roles. Setting them up comes next session.

### Status / membership tier

| Role | Color | How earned | Notes |
|---|---|---|---|
| 👑 **Founder** | gold `#f5c249` | Tyler manually | Just Tyler. Server owner. |
| 🛠 **Dev** | gold-orange `#e89e3a` | Tyler manually | Anyone he brings on as dev/contributor |
| 🐉 **Hearth Hall Premium** | royal purple `#9b6ddf` | Manual at first; later auto via Stripe webhook | The premium subscriber badge — gives them a distinct color in chat to recognize supporters |
| 💎 **Founder's Patron** | platinum `#cfd6e1` | Manual; for first 50 paid premium ever | One-time legacy badge. Free advertising for early supporters. |
| 🐛 **Bug Hunter** | crimson `#c44747` | Auto via bot when user submits 5+ bug reports | Recognition for active testers |
| 📜 **Beta Tester** | parchment `#e8d5a3` | Auto on server join during beta period | Default for everyone in early days |

### Level color tiers (from in-game character level)

The big ask: as players hit milestones in-game, their Discord name color changes. This requires either:

1. **Bot-driven approach (preferred):** A bot polls each member's Hearthrise account once an hour, reads their Total Level from Supabase, assigns the matching role.
2. **Self-report approach (MVP):** Player runs `/level` slash command in the server, bot fetches their level from Supabase using their Discord ID linked to their game account, assigns role.
3. **Manual approach (placeholder):** Tyler hands out roles. Doesn't scale, fine for first month.

Levels and tiers (matches the game's progression curve):

| Tier | Total Level | Role name | Color | Vibe |
|---|---|---|---|---|
| Wanderer | 1–24 | 🟢 **Wanderer** | sage green `#7d9e5c` | Default for new players |
| Settler | 25–49 | 🌾 **Settler** | wheat `#c9a35c` | First milestone — getting somewhere |
| Steward | 50–99 | ⚒ **Steward** | bronze `#a05a30` | Mid-game, mastered some skills |
| Warden | 100–199 | 🛡 **Warden** | iron blue `#5a7894` | Late-game, real specialist |
| Lord/Lady | 200–399 | 🏰 **Lord/Lady of the Hearth** | royal `#7e4cb0` | Top-tier veterans |
| Ascendant | 400+ | ✨ **Ascendant** | legendary gold `#f5c249` | Reserved for endgame max-level |

Hearth Hall Premium overrides Wanderer/Settler/Steward base color (premium purple wins). Warden+ keep their level color even with premium (level achievements override).

### Skill mastery sub-roles (later)

For each of the 9 skills, a "Mastery" role at level 99 (cap):
- 🪓 **Woodcutting Master** — green
- ⛏ **Mining Master** — gray-blue
- 🎣 **Fishing Master** — teal
- 🌾 **Farming Master** — amber
- 🍳 **Cooking Master** — orange
- 🪡 **Crafting Master** — earthen
- ⚒ **Smithing Master** — steel
- 🙏 **Prayer Master** — bone-white
- ✨ **Magic Master** — purple

These stack with level tier. Player at Total Lv 250 with Smithing 99 displays as `🏰 Lord/Lady` color, with `⚒ Smithing Master` listed below.

### Implementation order

1. Phase 1: Manual role assignment (Tyler hands them out).
2. Phase 2: `/link` slash command that ties Discord ID ↔ Hearthrise account_id (both stored in Supabase). Self-service: player runs it once.
3. Phase 3: Hourly bot job reads each linked account's Total Level + skill levels, assigns matching roles automatically.
4. Phase 4: Stripe webhook → grants Hearth Hall Premium role on subscription, removes on cancellation.

---

## #hall-of-fame — Major Milestones channel

Channel for first-ever broadcasts. The "first to do X" hook is what makes idle MMOs sticky early — players race for first-ever bragging rights. Post is a celebration + a reaction-collecting space (no chat).

### What gets posted (ordered by significance)

**First-ever milestones (one-time, server-wide):**
- 🥇 First player to reach Total Level 100
- 🥇 First player to reach Total Level 200
- 🥇 First player to max a skill (any skill at level 99)
- 🥇 First player to max ALL skills (Total Level 891)
- 🥇 First player to slay each tier-6 boss (Dragon, Lich, War King, Ancient Bear, Void Parasite)
- 🥇 First clan formed
- 🥇 First clan to hit 5/10/25 members
- 🥇 First million gold earned in a single session
- 🥇 First Hearth Hall Premium subscriber

**Player milestones (every player gets a post):**
- 🎉 New Total Level 50 / 100 / 200 / 400
- 🏆 Skill maxed at 99 (first time per player per skill)
- 🐉 Tier-6 boss kill (first time per player per boss)
- ⚔ Clan formed (player who founded it)
- 🏰 House fully built (all 8 rooms at max level)

**Format:** rich embed with the player's avatar, the achievement, a flavor line ("Slayed first dragon at 03:12 AM after 14 hours of playtime"), and a green "GG" reaction primed.

### Implementation

Same bot pipeline as level roles:
1. Bot subscribes to Supabase realtime on `game_events` table.
2. When a `level_up` or `boss_kill` event fires, bot checks if it's a milestone.
3. First-ever events: bot writes to a `firsts` table to mark "claimed" + posts to `#hall-of-fame`.
4. Player milestones: bot just posts.
5. Cosmetic: small chime/emoji ping in the channel.

---

## Bots to install (Tyler authorizes)

These give us the gamification infrastructure without writing a custom bot from scratch.

### Required for v1

**[MEE6](https://mee6.xyz/)** — The standard.
- XP & leveling for *Discord activity* (separate from in-game level — server engagement signal)
- Custom commands ("!website", "!download", "!rules")
- Welcome messages (auto-DM new joins)
- Reaction roles (for opt-in pings: "Patch notes", "LFG ping", "Clan announcements")

**Free tier covers everything we need.** Paid tier ($12/mo) unlocks role rewards, deeper customization. Skip until the server has 100+ members.

### Optional (nice-to-haves)

**[Carl-bot](https://carl.gg/)** — Better moderation + automod
- Reaction roles done better than MEE6
- Automod (block links, profanity, spam)
- If MEE6 feels limited, swap in Carl-bot

**[Dyno](https://dyno.gg/)** — Fallback moderator. Use if Carl-bot has limits.

**LFG bot** — Don't bother. Channels + a pinned format ("Looking for: 1 / Tier: 3 / Time: now") work fine for our scale. A real bot adds complexity for negligible gain at <500 players.

### Built later (custom)

The level-role + milestone-broadcast bot is custom. ~200 lines of Node.js polling Supabase and using Discord API. Build when:
- We hit 50+ active players
- The level-tier system is finalized in-game
- Tyler has ~half a day to wire it

Until then, manual role assignment for premium subscribers + occasional milestone posts is enough.

---

## Server polish checklist (next sessions)

**Branding:**
- [ ] Server icon — Hearthrise crest at 512×512 (use `assets/brand/hearthrise-logo.svg` rasterized)
- [ ] Server banner (Server Boost level 1+ required)
- [ ] Custom invite splash (Boost level 1+)
- [ ] Vanity URL `discord.gg/hearthrise` (Boost level 3 — far future)

**Channels needing topics + pinned content:**
- [ ] `#announcements` — pinned welcome (started, half-done due to rate limit)
- [ ] `#rules-and-info` — server rules + beta etiquette + how to use channels
- [ ] `#changelog` — paste latest CHANGELOG entry (mirror automatically later)
- [ ] `#game-discussion` — pinned "How to play Hearthrise" intro
- [ ] `#bug-reports` — already has topic ✓
- [ ] `#suggestions` — topic about format
- [ ] `#hall-of-fame` — explanation of milestones + that it's read-only
- [ ] `#lfg-bounties` — pinned format suggestion
- [ ] `#lfg-dungeons` — same
- [ ] `#clan-recruitment` — pinned format ("CLAN: name / size: 0/10 / focus: PvE / contact: @user")
- [ ] `#clan-leaders` — visible to Clan Leader role only (set up after roles)

**Permissions:**
- [ ] `#announcements` — read-only for @everyone, write for Founder/Dev
- [ ] `#changelog` — same
- [ ] `#hall-of-fame` — same
- [ ] `#clan-leaders` — visible only to Clan Leader + Founder/Dev

---

## Beta-tester onboarding flow

Final goal: friend clicks invite → joins server → understands what to do in 60 seconds.

1. Friend clicks invite link
2. Discord welcome screen (we configure):
   - "Welcome to Hearthrise, the idle homestead RPG you're helping us beta-test."
   - Show 3 channels first: `#rules-and-info`, `#announcements`, `#bug-reports`
3. MEE6 sends a DM:
   > Hey! Get Hearthrise running: https://bugsquisher1.github.io/hearthrise/ → Settings → Account → Sign Up. On phone? Add to Home Screen for fullscreen. Found a bug? 🐛 button bottom-right. Questions? Ping us in #general.
4. Auto-assigns @Beta Tester role
5. (Once `/link` exists) friend runs `/link <hearthrise-username>` to tie their Discord identity to game progress, unlocking the level-role auto-assignment.

---

## Open questions for Tyler

1. **Server name change?** Currently "Hearthrise". Want something more flavor-y like "The Hearthrise Tavern" / "Hearthrise — Beta Hall"?
2. **Who else gets Founder/Dev?** Only Tyler? Anyone helping?
3. **First-50-premium "Founder's Patron" badge — keep or skip?** Adds urgency to early monetization.
4. **Skill Mastery roles — separate role per skill (9 roles) or one combined "Master" role + bot lists which skills in profile?**
5. **#clan-leaders permissions:** does this become a private channel only Clan Leaders see, or is it visible-to-all but only writable by Clan Leaders?
