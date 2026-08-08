# Hearthrise — App Delivery Plan

How we go from "open the URL in mobile browser" to "tap an icon on a phone like any other app" — with realistic timelines.

There are three increasingly-serious tiers, and you don't have to commit to all three.

---

## Tier 1 — PWA (Progressive Web App). Already 90% there.

**What it gets you:**
- Players install the game by tapping "Add to Home Screen" on their phone
- Launches in fullscreen (no browser address bar, no tabs visible)
- Has a real app icon on the home screen
- Survives offline (service worker caches the game)
- Push notifications possible (when we want them)
- Updates automatically when you push to the website — no app-store review delays

**What it does NOT get you:**
- Apple App Store / Google Play presence (still browser-installed)
- Native features like haptics, contacts, camera (limited APIs)
- Players don't search "Hearthrise" in App Store — they need the URL

**Status:** the manifest + service worker are already in `src/legacy.js`'s `installPwa()`. Build 108 polished the icons + theme colors so the install splash actually looks like Hearthrise. The "Add to Home Screen" prompt is wired.

**What's left:**
- Test the install flow on iOS Safari (the manual "Share → Add to Home Screen" path)
- Test the install flow on Android Chrome (auto-prompts an install banner)
- Add an in-game "Install" button next to Settings → maybe nudge friends who haven't installed yet
- iOS splash-screen images for different device sizes (cosmetic, optional)

**Time investment:** half a day to test + add the install button. We could ship Tier 1 this week.

**Cost:** $0.

**Recommendation: do this immediately.** Highest impact-to-effort ratio in the entire project. Friends opening hearthrise.pages.dev on their phone, doing "Add to Home Screen," and having a real-feeling app on their home screen the next day — that's the difference between "Tyler's web project" and "the game I'm playing."

---

## Tier 2 — Native iOS + Android via Capacitor

**What it gets you:**
- Real App Store + Google Play listing
- Players search "Hearthrise" and install it like any other app
- App Store reviews + ratings
- Better access to native APIs (haptics, share, in-app purchase eventually)
- Looks 100% native — no browser chrome whatsoever

**What it costs you:**
- Apple Developer account: $99/year
- Google Play Developer account: $25 one-time
- Each store update goes through review (1-3 days for Apple, ~few hours for Google)
- You become responsible for app-store guidelines (privacy disclosures, age ratings, etc.)

**How it works:**
[Capacitor](https://capacitorjs.com) wraps the existing web build (the same `index.html` + `src/` files we already have) inside a native iOS / Android shell. We don't rewrite anything. The shell loads our web assets locally bundled, exposes native APIs to JS, and ships as a real `.ipa` / `.apk`.

The flow is:
1. `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
2. `npx cap init Hearthrise com.hearthrise.app --web-dir=.`
3. `npx cap add ios && npx cap add android`
4. `npx cap sync`
5. Open `ios/App.xcworkspace` in Xcode → build → upload to App Store Connect
6. Open `android/` in Android Studio → build → upload to Play Console

**What's hard:**
- iOS build requires a Mac (Xcode is Mac-only). If you don't have one, options: borrow a friend's Mac for a day; rent a Mac in the cloud (MacInCloud ~$30/mo); or build via GitHub Actions with a macOS runner (free for public repos, ~30 min per build).
- App Store screenshots, marketing copy, privacy policy URLs — these are content tasks, not code, but they take a few hours each.
- IAP (in-app purchase) for the gem store needs each platform's billing SDK wired in if/when we monetize. Not blocking for launch — can ship a "Premium Store" placeholder.

**Time investment:**
- First build to TestFlight (Apple's beta channel): 1-2 days of focused work on a Mac
- First Google Play internal-test build: 4-8 hours
- App Store + Play Store full submission with assets: another 2-3 days
- First review approval: ~1 week wall-clock

**Recommendation: do this AFTER Tier 1 is on phones for a week.** We need real player feedback first. App-store rejections are slow and embarrassing if the underlying game has rough edges. Shipping the PWA gets friends playing, surfaces the rough edges, and we fix them before going through Apple's review meat-grinder.

---

## Tier 3 — Steam (desktop)

**What it gets you:**
- Steam page + storefront
- Steam achievements / Steam Cloud / Steam Workshop (eventually)
- Steam Wallet payments
- Massive built-in audience for idle / RPG genre

**What it costs you:**
- Steam Direct fee: $100 one-time per app
- Steamworks SDK integration (achievement / cloud-save APIs)
- Marketing — Steam is a much bigger pond than mobile

**How it works:**
Wrap the web build in Electron or Tauri (both desktop-shell tools, similar to Capacitor). Submit to Steam Direct.

**Time investment:**
- Working Electron build: 1 day
- Steam page + assets + achievements wired: 1-2 weeks
- Steam Direct review: ~2 weeks
- Total to launch: month-and-a-half end-to-end

**Recommendation: only after the game has 50+ active beta players.** Steam users have higher expectations than friends-with-the-link. The game needs more content depth before going there.

---

## Recommended sequence

| Week | Action | Outcome |
|---|---|---|
| **Now** | Finish current beta polish (b108 just shipped) | Clean web experience |
| **This week** | Add in-game "Install on phone" button + test PWA install flow | 5-10 friends installable |
| **Next 2 weeks** | Get 5-10 friends actually playing daily; collect feedback | Real signal on what's good/bad |
| **Week 4-5** | Fix the top 5 issues from real-player feedback | Stable enough for app store |
| **Week 6** | Set up Apple + Google dev accounts, run Capacitor wrap | TestFlight build live |
| **Week 7-8** | App Store + Play Store assets, submit for review | First store reviews back |
| **Month 3** | Public soft-launch on App Store + Play Store | Real users, not just friends |
| **Month 4-6** | Polish + content depth + first 100 players | Foundation for Steam later |

Total time-to-real-app-store: about 6 weeks of focused work after we stop polishing the web build.

---

## What to do this week

1. **Push build 108** — the mobile feel pass + PWA polish
2. **Test PWA install on your own phone first**
   - Open the live URL in iOS Safari → tap Share button → "Add to Home Screen"
   - Open the home-screen icon — should launch fullscreen, no browser chrome
   - If it doesn't, ping me with what's broken
3. **Decide if you want the in-game "Install" button** — I can build it for build 109 (~30 min)
4. **Pick 1-2 friends to install on their phone first.** Tell them: "open the URL → Share → Add to Home Screen → tap the icon to launch." Have them play 30 minutes.
5. **Watch the Supabase `bug_reports` table** for what they hit

After that, we'll know if we should keep polishing the web build or start the Capacitor wrap.

---

## Deferred for later (don't worry about now)

- Apple Developer account setup
- Google Play Developer account setup
- App Store assets (screenshots, video preview, metadata)
- IAP integration
- Push notification UX
- Steam evaluation
- Actual marketing (TikTok / Reddit / IndieDB / etc.)
