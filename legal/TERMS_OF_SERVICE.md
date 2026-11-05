# Terms of Service — Hearthrise

**Last updated:** November 4, 2026

**In effect:** from November 4, 2026, for the invite-only test of Hearthrise on the web. A new date goes here when the Steam release opens.

These Terms of Service ("Terms") govern your access to and use of Hearthrise, a video game made and run by its developer ("the Developer", "we", "us"). By creating an account or playing Hearthrise, you agree to these Terms and to our Privacy Policy. If you do not agree, do not play.

> **Draft:** This page describes how Hearthrise works today. It was written by the developer and has not been reviewed by a lawyer. A lawyer should read it before Steam Early Access, with an eye to your jurisdiction's contract and consumer-protection law and the terms of any store the game is sold through (for example the Steam Subscriber Agreement).

<!-- OWNER AND LAWYER NOTES (not shown to players). Facts below were checked against the repo on 2026-11-04. Nothing was checked against production. Items that are business or legal decisions are marked DECISION. -->

## 1. Eligibility

You must be at least 13 years old (or 16 where the law sets that age) to play Hearthrise. If you are younger than the age of majority where you live, a parent or guardian must agree to these Terms for you.

<!-- DECISION / LAWYER: the minimum age is the old draft's. The sign-up asks for no age. -->

## 2. Your account and characters

You sign in with an email address and a password. You are responsible for keeping them secure. Do not share, sell or transfer your account. We may suspend or end accounts that break these Terms or that we reasonably believe are being used fraudulently.

Every account has two character slots. You can buy more with in-game gold, up to five characters in all. Up to four characters on an account can play at once (hunt, gather, craft), and the game also limits how many can play at once from one network.

<!-- Verified: two owned slots per account, more bought with gold up to five (src/session, CHANGELOG v0.2.86 prices), maxConcurrentCharacters 4 and the per-network cap (supabase/migrations/2027-01-19-play-cap.sql). The old draft said "five characters per account" unlocked by milestones, a "Hearth Hall Premium pack" or an in-app purchase: none of those exist. -->

## 3. License

Subject to these Terms, we give you a personal, non-exclusive, non-transferable, revocable license to play Hearthrise on devices you own or control, for your own entertainment. You may not:

* Copy, redistribute, resell or rent the game or its art, text or sound.
* Reverse-engineer, decompile or take apart the game, except where the law allows it.
* Change the game, or use anything that talks to our servers other than the game itself, in a way that interferes with online play or gives you an unfair advantage (cheating, bots, exploits).
* Use the game to harass, abuse or harm other players.
* Scrape or extract the game's assets for commercial use.
* Get around the limits we set (the sign-in rules, the rate limits, the limit on heroes playing at once).

## 4. Gold, items and purchases

Hearthrise has no real-money purchases today. If we add any, we will update these Terms and tell you before anything is charged.

Gold, items, characters and everything else in the game exist only inside the game. They have no cash value, you do not own them, and they cannot be exchanged for real money. Do not buy, sell or trade accounts, gold or items for real money or anything else of value outside the game.

During testing, Premium features are switched on for every character at no charge. That may change.

We may add, change or remove items, currencies and features at any time, without compensation. If we shut Hearthrise down, we will use reasonable efforts to give at least 30 days' notice.

<!-- Verified: no checkout or payment code in src or the Content Security Policy; the premium flag beta_premium (supabase/migrations/2026-12-17-beta-premium.sql) and Tyler's 2026-10-23 ruling. The old draft sold "gems" and a premium pack for real money and promised offline-only operation after a shutdown. The game is online only, so that sentence was removed. DECISION: wording for real-money items once the Steam store has any. -->

## 5. What you post

Some things you write are seen by other players: character names, chat lines, whispers and Market listings. You keep ownership of them, and you give us a worldwide, royalty-free, non-exclusive license to store, show and send them as needed to run the game.

You are responsible for what you post. Do not post anything that:

* Infringes someone else's intellectual property.
* Contains other people's personal information.
* Breaks the law.
* Is hateful, harassing, threatening, defamatory or sexually explicit.
* Promotes violence, terrorism or self-harm.
* Pretends to be a real person or our staff.

We may remove content and suspend accounts that break these rules, with or without notice. You can block a player so you no longer see their chat.

## 6. The Market

The Weighhouse is the game's player market. Listings are between players. We are not a party to trades between players and do not promise the value, availability or fitness of anything listed. It runs on in-game gold only.

The Weighhouse charges a listing fee when you list something and takes a cut of each sale. Both are shown before you confirm, are paid in gold, and may change. Some items cannot be sold to other players, for example starter items, gifts, trophies and Premium rewards. The Market window says why when you try.

We may close the Market, reset it, cancel listings, or reverse trades that came from bugs, exploits or fraud.

<!-- Verified: the market is on (Tyler's memory, 2026-10-31) and fees are server data shown before a press (src/shell/market-model.js, hr_market_rules). The old draft said "a flat tax (currently 1.5%)" and "Bind-on-Pickup items cannot be listed". The repo's migrations set a 1% listing fee (minimum 1 gold) and a 4% cut (supabase/migrations/2027-01-12-market-account.sql sets house_tax_bp 400), not 1.5%. The text states no number, so it cannot go stale. DECISION: publish the numbers? Confirm the live values first. The not-listable reasons are in src/shell/market-words.js; only 8 raid and boss rewards still carry the old "bop" flag. -->

## 7. Online play

Hearthrise is online only. It needs an internet connection and a free Hearthrise account. Your characters live on our servers, and the server decides what happens in the game. Your heroes keep hunting and working after you close the game, until they run out of stamina, supplies or gold, die, or something else stops them. A hero can die while you are away.

We aim for high availability but do not promise uninterrupted service. Outages, maintenance, and problems at the services we rely on (such as Supabase, our database and sign-in provider, and Resend, our email provider) can keep you from playing.

If a bug on our side costs you progress, we will try to restore it from a recent backup, but we cannot promise that we can.

<!-- Verified against CLAUDE.md sections 1 and 6 (server-authoritative; hunts run on after the browser closes; death while away). The old draft named "cloud save", "clans" and "OAuth providers": there is no cloud save (all progress is the server's), no clan window, and sign-in is by email and password. -->

## 8. Fair play

We may detect, block, suspend and roll back accounts that:

* Use bots, scripts or memory editors.
* Exploit bugs to gain something unintended (for example, duplicating items).
* Share an exploit instead of reporting it.
* Run several accounts to get around the limit on heroes playing at once, or trade between their own accounts to move gold or items.
* Boost, sell or trade accounts.

A suspension can be short or permanent, and we do not owe you anything for lost progress, gold or items.

## 9. Testing and wipes

Hearthrise is in testing. Your characters, and everything they own and have done, may be erased at any time during testing, and **will be erased before Hearthrise opens on Steam Early Access**. When that happens, everyone starts over, and nothing you earned carries across. We will say so in our Discord server first when we can. Please do not play expecting your progress to last.

<!-- Verified: CLAUDE.md section 1 (progress is wiped at the Steam Early Access launch) and section 2 (every test phase is wiped). The wipe schedule itself is in Tyler's rulings, not in the repo. DECISION: whether accounts, friends lists or anything else survive a wipe; the text says only what is certain. -->

## 10. Disclaimers

The game is provided "as is" and "as available", without warranties of any kind, express, implied or statutory, including warranties of merchantability, fitness for a particular purpose and non-infringement. We do not promise that the game will be uninterrupted or error-free.

Some places do not allow the exclusion of certain warranties, so this may not apply to you, and you may have other rights under local consumer-protection law.

## 11. Limit of liability

To the fullest extent the law allows, our total liability to you for any claim about these Terms or your use of Hearthrise will not be more than the greater of (a) what you paid us in the 12 months before the claim, or (b) twenty US dollars (USD 20.00).

We are not liable for indirect, incidental, special, consequential or punitive damages, including lost profits, lost data or lost goodwill, even if we were told they might happen.

Some places do not allow these limits for certain damages, so this may not apply to you.

## 12. Indemnity

You agree to defend and protect the Developer against claims, losses, damages and costs (including reasonable lawyers' fees) that come from your breaking these Terms, what you post, or your misuse of the game.

## 13. Ending your account

You can stop playing at any time. To have your account deleted, ask us (see the Privacy Policy). We may suspend or end your account or your access to online services for any reason, including breaking these Terms, with or without notice. When your account ends, your license ends and we may delete your account's characters and data.

## 14. Changes to these Terms

We may update these Terms. When a change matters, we will post it in our Discord server and update the date at the top of this page, at least 14 days before it takes effect where we can. A change we need to make quickly for safety, the law or a fix can take effect sooner. If you keep playing after a change takes effect, you accept it.

<!-- DECISION: the old draft promised 14 days' notice in the game. There is no such notice panel and test releases ship daily, so this says "where we can". -->

## 15. Governing law and disputes

The governing law and courts for these Terms will be named here before Steam Early Access. <!-- OWNER: no legal name, address, mailbox or governing law yet (Tyler 2026-11-04). Fill these before Steam Early Access, with the lawyer. -->

If you are a consumer in the EU, the UK or another place with mandatory consumer-protection rights, this does not take those rights away, and you may bring a claim in your local courts under your local laws.

We ask you to message a moderator on Discord first to try to settle a dispute informally.

<!-- DECISION: governing law and venue are Tyler's and the lawyer's. -->

## 16. Contact

* **Support and legal notices:** message a moderator on Discord.
* **Our Discord server:** [https://discord.gg/eJrUSUJM3M](https://discord.gg/eJrUSUJM3M)
