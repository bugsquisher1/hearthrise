# Hearthrise — Deployment Roadmap

Reference document captured from a planning conversation. Covers the path from current single-file HTML prototype to Steam + mobile launch.

## Current state (May 2026)

- One ~430KB HTML file (`hearthbound-phaseA.html`) with embedded CSS and JS
- All game state, rendering, combat, save/load in a single file
- localStorage for persistence
- No backend; "online play scaffolding" is mocked
- No build tooling

This is the right setup right now. Single-file HTML lets us iterate fast — every change is one edit, no build step, no deployment lag.

## Don't refactor yet

The moment we split into modules + bundler + TypeScript we slow down 3×, and we'd refactor again once the game's content is locked. Refactor when the design is stable, not before. The 430KB file can grow to 2–3MB before performance matters.

---

## Milestone arc

### Now to ~80% feature complete (current)

Stay single-file. Add features, balance, content. Keep iterating fast.

### ~80% to beta

Start extracting. Three steps in order:

1. Pull data tables (ITEMS, MONSTERS, SKILLS_DEF, CROPS, ROOMS, etc.) into JSON files. That's where most content iteration happens — clean separation between data and code.
2. Split CSS into its own file plus a per-theme stylesheet.
3. Move JS into ES modules with a Vite build. At that point we get TypeScript, dead-code elimination, hot reload.

Estimated effort: 2 days of focused work.

### Beta to Steam launch

Wrap in **Tauri** — Electron's modern replacement, ~5MB binary instead of 150MB. Tauri apps ship to Steam through Steamworks like any other native app. Add the Steamworks SDK for achievements, cloud saves, friends overlay.

Estimated effort: 1 week of focused work.

### Beta to mobile

Two paths:

**Cheap version — Capacitor.** Wraps the same web build into iOS and Android apps. Works, gets you on stores, UX feels webby.

**Real version — Godot port.** Shared data tables. ~3–4 weeks of work. Touch UX is native-grade.

Recommended approach: ship Capacitor first to soft-launch and gauge interest. Port to Godot only if mobile actually drives revenue.

---

## Backend (the "services" question)

Not needed for launch. Local saves work for single-player.

When cloud saves + leaderboards + clan features are needed:

- **Supabase** — Postgres + auth + realtime, generous free tier. Recommended.
- **Firebase** — Google, also free tier.

Setup work: schema, auth flow, save sync, leaderboard endpoints. ~2 days.

Online play / multiplayer is a separate larger project; cross that bridge when (if) it becomes a feature.

---

## Division of labor

### What I can do

- Entire refactor to modules
- Vite build setup
- TypeScript migration
- Tauri wrap
- Capacitor wrap
- Steamworks SDK integration code
- Backend schema and API
- Cloud-save sync logic
- Touch UX adjustments
- Most of a Godot port if we go that direction

### What you handle

- Money (Steamworks $100/game, Apple Developer $99/yr, Google Play $25 one-time, code signing cert ~$80/yr)
- Platform accounts and tax forms
- Store page assets (capsule art, screenshots, trailer — I can spec these)
- Marketing
- All decisions about what features to build

---

## Recommended sequencing

1. Finish content, mechanics, and visual polish (where we are now)
2. Focused beta sprint: refactor + Tauri wrap + basic backend (~2 weeks)
3. Steam early access with achievements + cloud saves
4. Mobile when (if) Steam validates the audience

Realistic full arc from current state to "shipped on Steam": 2–3 months of focused work. Most of it is code I write, most of the decisions are yours.

When the time comes, I'll generate a more concrete plan with specific tasks, time estimates, and order of operations. For now: stay heads-down on the game itself. The deployment problem is solved when we get there.

---

## Costs at a glance

| Item | Cost | Frequency |
|---|---|---|
| Steamworks Partner registration | $100 | Per game |
| Apple Developer account | $99 | Annual |
| Google Play account | $25 | One-time |
| Code signing certificate | ~$80 | Annual |
| Supabase / Firebase | $0 to start | Scales with usage |
| Tauri / Capacitor / Vite | $0 | Open source |

Total ballpark to launch on Steam: ~$180 first year. Add ~$125 if also launching mobile in year one.
