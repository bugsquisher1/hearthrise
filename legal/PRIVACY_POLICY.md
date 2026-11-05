# Privacy Policy — Hearthrise

**Last updated:** November 4, 2026

**In effect:** from November 4, 2026, for the invite-only test of Hearthrise on the web. A new date goes here when the Steam release opens.

> **Draft:** This page describes what Hearthrise does today, in plain words. It was written by the developer and has not been reviewed by a lawyer. A lawyer should read it before Steam Early Access.

<!-- OWNER AND LAWYER NOTES (not shown to players). Every claim below was checked against the repo on 2026-11-04 unless a note beside it says otherwise. Nothing was checked against production. -->

## The short version

* Hearthrise is online only. Your characters, items and gold live on our servers, not on your device.
* You sign in with an email address and a password.
* While you play, we collect game analytics and a recording of your game screen. **The recording is on by default.** Typed text and chat are hidden in it. One switch in Settings turns it off.
* Your characters and progress will be wiped before Steam Early Access, and may be wiped between test phases. Do not play expecting progress to last.
* We do not sell your information. The game shows no ads and loads no advertising code.

## 1. Who we are

Hearthrise is an invite-only test, made and run by its developer ("we", "us"). We will name the person or company responsible, with a postal address, on this page before Steam Early Access. <!-- OWNER: no legal name, address, mailbox or governing law yet (Tyler 2026-11-04). Fill these before Steam Early Access, with the lawyer. -->

Privacy questions: message a moderator in [our Discord server](https://discord.gg/eJrUSUJM3M).

If you are in the European Economic Area, we are the data controller for the information described here. We have not appointed an EU representative; if you would rather talk to one, message a moderator and we will point your request to the right place.

<!-- LAWYER: the old draft's contact details were all placeholders (privacy@[DOMAIN].com). No real mailbox is named anywhere in the repo, so [CONTACT EMAIL] is a placeholder for Tyler to fill in. The EU-representative sentence came from the old draft and is unchecked. -->

## 2. What we collect, and why

**Your account.** When you create an account we receive your email address and your password. The password is handled by our sign-in service, Supabase, which keeps only a scrambled (hashed) form of it. We give your account a random ID. Your email address is used to sign you in, to send you the confirmation and password-reset messages you ask for, and to show you "Signed in as" on the characters screen. Other players never see it. The messages are sent through Resend, an email service, so Resend handles your email address and those messages. To keep you signed in, your browser stores a sign-in session on your device, along with a few small notes such as which heroes you had open in that tab; signing out removes them. The game does not set cookies.

<!-- Verified in the repo: email and password through Supabase Auth (src/net/auth.js); mail host smtp.resend.com (docs/archive/design/signup-door-config-gates.md and .claude/coordination/DISCOVERIES.md, read from the live auth config on 2026-11-04). The session is kept in the device store (SESSION_CONFIG.authStore 'device') and removed on sign-out (tests/client-boot.mjs B-5). No cookie is set by our code (tests/platform-seam.mjs PS-1 forbids document.cookie) and PostHog is set to persistence 'memory'; a live browser's cookie jar was not inspected. Not in the repo: that Supabase stores a bcrypt hash. That is Supabase's documented behavior. -->

**Your game.** The server holds your characters and everything they own and have done: names, levels, skills, items, gold, equipment, houses and farms, hunts, your hunt history (each character keeps about its last 20 hunts), and your display settings (such as how big windows are and where panels sit). It also holds your friends and friend requests, the players you have blocked, your chat lines and whispers, your Market listings and sales, and a ledger of every movement of gold and items, which we keep to catch cheating and fix mistakes. The server decides what happens in the game, including while you are away. Your browser keeps only your preferences and what is on the screen.

**What other players can see.** Your character's name, level and equipment (when someone inspects you), where your character is in the shared world, whether you are online (your friends), the chat lines you post, and your place on the leaderboards. Whispers go only to the player you send them to, but they are stored where our team can technically reach them, and we may read them to look into abuse or cheating.

**Your network address, in scrambled form.** Hearthrise limits how many heroes can play at once, per account and per network. To count that, the server keeps a salted SHA-256 hash of your IP address (of the network prefix, for IPv6), never the address itself. One value is kept for your account and one for each hero, and a new one replaces the old when you connect from somewhere else. The same value is used to keep trades between two accounts on one network out of the Market's price history. Before you sign in, the server also uses a scrambled form of your network address, briefly, to slow down automated abuse.

<!-- Verified: supabase/migrations/2027-01-19-play-cap.sql (hr_play_net_hash, account_play_net, hero_play_net; both tables delete with the account), 2027-01-21-market-same-network.sql. The "briefly, before you sign in" sentence is from 2026-08-13-anon-rate-gate.sql (the key is an md5-derived uuid); how long the rate log is kept was not checked. -->

**Problem reports.** If you press "Report a problem", we receive what you write, the game version, what we need to find the problem (your device and screen size, the windows you have open, your character's slot and name, its hunt and the state of the game), the most recent errors, and, if you leave "Include a picture of the game view" ticked, a picture of the game view. The report is saved in our database and posted to a channel on our Discord server that our team reads. The picture is posted to Discord with it and is not saved in our database.

<!-- Verified: src/shell/report-model.js, src/shell/windows/report.js (the checkbox, ticked by default), supabase/functions/bug-report-bridge/index.ts (stored by bug_report_submit, relayed to a Discord webhook, screenshot forwarded and not stored). Not checked: who can read that Discord channel. -->
**Errors and freezes (Sentry).** When the game hits an error, or the page freezes for several seconds, our error service, Sentry, receives the error message, where in the code it happened, the game version, your browser and device type, and your account ID. It does not receive your email address. The page address is sent without anything after a "?" or "#". For a freeze it also receives what the game was doing, such as the ID of your open hunt.

**Game analytics (PostHog).** Our analytics service, PostHog, receives named events tied to your account ID (not your email) and the game version: when a hunt starts and ends (which ground, how many in the party, how long, why it ended), when you leave a hunt, create a hero or buy a hero slot, milestones (your first visit to town, first hunt, first sale, first piece of gear equipped, steps of the tutorial, levels reached, and how many minutes you were away before you came back), and technical timings (how long the game took to load, and slow or frozen screens). It also receives "rage clicks" and "dead clicks": many fast clicks, or a click that did nothing. These are described by the button's type and style names, never by its words. Nothing is sent from the sign-in screens, and ordinary clicks are not sent. PostHog is set to keep nothing on your device.

<!-- Verified in src/net/observability.js (the event list, the account-id-only identity, persistence 'memory', no autocapture of ordinary clicks) and src/net/observability-config.js (US hosts). Not checked: PostHog's own project settings, for example whether it keeps the IP address it sees on each request. -->

## 3. Session recordings

This is the one thing we collect that many people would not expect, so here it is plainly.

**What it is.** While the game screen is showing, PostHog's recorder makes a recording that can be played back like a video: what is drawn on your screen, where your mouse goes, and what you click and scroll. We watch recordings to find out why something broke or where players get stuck.

**When it records.** Only on the game screen. Never on the sign-in, create-account, reset-password, closed-notice or characters screens (the characters screen shows your email address). It starts once your characters have loaded, and it stops when you leave the game screen or sign out.

**What is hidden.** Everything you type into a box is replaced with stars in the recording, including your hero's name, searches, and the problem-report form. The text of the chat window, which holds public chat, party chat and whispers, is hidden too.

**What is not hidden.** Everything else on the game screen: your hero's name and level, your items and gold, the windows you open, and other players' names where the game shows them, such as your party, your friends list, the Market and the leaderboards.

**What it does not include.** No sound, no camera, no microphone. The game does not ask your device for them.

**Where it goes and how long.** To PostHog, in the United States, tied to your account ID. We set PostHog to delete recordings after 30 days.

**It is on by default.** Everyone invited to the test is recorded unless they turn it off. To turn it off, open Settings (press Escape), go to Help, and untick **Share session recordings to help fix bugs**. It stops at once, and nothing is recorded after that. The choice is saved with your characters, so it follows you to other devices. Recordings already made are deleted on the schedule above, or sooner if you ask us.

**Turning off all analytics and error reports for one visit.** Add ?noanalytics=1 to the end of the game's web address, for example https://hearthrise.net/play.html?noanalytics=1. For that visit, nothing is sent to PostHog or Sentry. You need to do this each time you open the game.

<!-- Verified: src/net/observability.js (recording only while screen 'game', started only after the open heroes' residue is read, stopped at once by the Settings switch; maskAllInputs true; maskTextSelector '.ph-mask, input, textarea'; the chat window is the only .ph-mask element; no element uses .ph-no-capture today; ?noanalytics=1 is read on every load and nothing is loaded or sent), src/data/settings.js (the switch, default on, in Settings > Help), src/session/replay-pref.js (one pick for every hero, newest wins), src/net/observability-config.js. NOT VERIFIABLE FROM THE REPO: the 30-day retention (a PostHog project setting; Tyler's memory note says 30 days, set by the Coordinator on 2026-10-20). If it is not 30 days, change the sentence. "Delete sooner if you ask" needs Tyler to delete by hand in PostHog; confirm he can and will. DEFAULT: Tyler decided on 2026-11-04 that recording stays on for invitees (src/data/privacy.js defaultOn true), so the page says "on by default". LAWYER: default-on recording of an identified user, with an opt-out, is a decision to review before Early Access (EU/UK consent rules). -->

## 4. How we use it

* To run the game, keep your progress and decide what your heroes did while you were away.
* To limit cheating, abuse and the number of heroes playing at once, and to fix mistakes.
* To find and fix bugs and slow or frozen screens, and to see where new players get stuck.
* To answer you when you contact us.
* To follow the law and to enforce our Terms of Service.

We do not sell your information, we do not build advertising profiles, and we do not use your information to show ads.

## 5. Who else handles your information

These services work for us. Supabase, PostHog, Sentry, GitHub Pages and Google Fonts each see your IP address, as any website your browser connects to does.

* **Supabase** runs our database, our sign-in and our live connection to the game. Everything in section 2 that is about your account and your game lives there.
* **Resend** sends the confirmation and password-reset emails.
* **PostHog** (United States) receives analytics events and session recordings.
* **Sentry** (United States) receives error reports.
* **GitHub Pages** serves the game's files to your browser.
* **Google Fonts** supplies the game's letter shapes. Your browser asks Google for them when the page loads, so Google sees your IP address and your browser type.
* **Discord** receives problem reports (in a channel for our team). Our community server is also on Discord, under Discord's own policies.

We may share information if the law requires it, or to protect the safety of players or the public.

<!-- Verified: play.html's Content Security Policy allows exactly Supabase, the Sentry and PostHog ingest hosts, Google Fonts, and our own files. GitHub Pages: the repo's CNAME and deploy. Not checked: which region Supabase runs in. LAWYER: a data-processing agreement with each service, and whether a Google Fonts request needs a notice (the fonts could be hosted by us instead). -->

## 6. Where information is processed

Our providers may process information in the United States and other countries. Where the law requires it, we rely on standard contractual clauses or equivalent safeguards for transfers.

## 7. How long we keep it

* **Your account and characters:** until the account is deleted, or until a wipe (section 8).
* **Chat lines in public and party chat:** deleted after 60 days.
* **Whispers:** deleted after 30 days.
* **Hunt history:** each character keeps about its last 20 hunts.
* **The money ledger** (every movement of gold and items): the detailed rows are kept 90 days. After that they are folded into monthly totals for each hero, which we keep as long as needed for the game.
* **A log of requests the server refused:** 180 days.
* **Problem reports:** as long as needed to fix the problem.
* **Session recordings:** deleted after 30 days.
* **Error reports and analytics events:** kept by Sentry and PostHog under the limits we set with them.
* **Your network address in scrambled form:** as long as your account exists.
* **Emails you send us:** as long as needed to answer you.

<!-- Verified in supabase/migrations: trim-chat-messages 60 days (2026-08-11-chat-name-authority.sql), trim-chat-whispers 30 days (2026-10-25-social.sql), SESSIONS_KEPT 20 (src/data/hunt-sessions.js), player_ledger 90 days then player_ledger_rollup per hero per month, never pruned (2026-08-11-player-state.sql), hr_rejections_prune 180 days. These are the repo's schedules; production was not read, and a schedule retuned by hand there would not show. NOT VERIFIED: Sentry's retention (set by its plan), PostHog analytics-event retention (the 30 days is the recording setting), Resend's own retention, Supabase's backups. If a number is unknown to Tyler, "as long as needed for the game" is the honest fallback. -->

## 8. Wipes: your progress will be erased

Hearthrise is in testing. Your characters, and everything they own and have done, may be erased at any time during testing, and **will be erased before Hearthrise opens on Steam Early Access**. When a wipe happens, the stored progress for those characters is deleted and everyone starts over. We will say so in our Discord server first when we can. Please do not play expecting what you earn to last, and do not spend real money on anything because of it. The game has no real-money purchases today.

## 9. Your choices and rights

Depending on where you live, you may have the right to:

* **See** the information we hold about you.
* **Correct** it.
* **Delete** it.
* **Receive a copy** of it in a common file format.
* **Object** to some uses, or ask us to limit them.
* **Withdraw consent** for anything you agreed to, such as session recordings (use the switch in section 3).
* **Complain** to your local data-protection authority.

**To ask for any of this,** message a moderator on Discord. We may ask you to prove the account is yours. We will answer within 30 days.

**Deleting your account.** There is no Delete account button yet. Until there is, ask us and we will delete your account by hand. That removes your sign-in and the characters, items, gold, friends, whispers and settings tied to it. Three things do not go with it automatically today: the money ledger and its monthly totals, problem reports you sent (they stay, but are no longer linked to your account), and chat lines, which disappear on the 60-day schedule above. If you ask, we will also delete the session recordings we can find under your account ID.

California residents: we do not sell or share your personal information as those terms are used in California law.

<!-- Verified: account deletion by hand removes player_state and the tables that reference auth.users with on delete cascade (whispers, friend requests and links, presence, network hashes, hero data). Not tied by a foreign key: player_ledger and player_ledger_rollup (no user reference) and bug_reports (on delete set null). Whether chat_messages is tied to the account was not checked, so the text says only that chat lines go within 60 days. DECISION FOR TYLER: should the delete-account lane also delete or anonymize the ledger rows? The text above says today's truth and must change if it does. -->

## 10. Children

Hearthrise is not meant for children under 13 (or under 16 where the law sets that age). We do not knowingly collect information from children. If you are a parent or guardian and think your child has given us information, contact us and we will delete it.

<!-- LAWYER: the minimum age is the old draft's (13, or 16 where it applies). Not checked against any age screen: the sign-up asks for no age. -->

## 11. Security

The game and its servers talk over encrypted connections (HTTPS and secure WebSockets). Each account can read only its own data. The important decisions in the game, such as what a hunt earned, are made on our servers, not in your browser. No system is perfectly secure. If you think your account has been compromised, contact us right away.

## 12. Changes to this policy

When this policy changes in a way that matters, we will post it in our Discord server and update the date at the top of this page. Where we can, we will do that at least 14 days before the change takes effect.

<!-- DECISION FOR TYLER AND LAWYER: the old draft promised 14 days' notice in the game's settings panel. There is no such notice panel, and test releases ship daily, so the promise was softened to "where we can". -->

## 13. Contact

* **Privacy questions and requests:** message a moderator on Discord.
* **Our Discord server:** [https://discord.gg/eJrUSUJM3M](https://discord.gg/eJrUSUJM3M)
