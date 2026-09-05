# The sign-up door: what the tests prove, and the three gates they cannot

**Status:** the client-side half shipped on `fix/signup-door`. The three gates below are
**NOT closed** and cannot be closed from this repository. Do not mark the sign-up funnel fixed
on a green suite.

**Owner of gates 1 and 3: Tyler only** (Supabase dashboard access). Gate 2 needs one person with
a browser and the itch.io page.

---

## Why this file exists

The measured beta-2 funnel lost **11 of 49 sign-ups at the email wall**. The client's part of that
is now fixed and guarded:

| Guard | What it grades |
|---|---|
| `tests/signup-door.mjs` | the pure rules — return address, arrival classification, resend cooldown + honesty, invite link, refusal vocabulary. 21 planted defects, all caught (`--selftest`). |
| `DOOR-1..7` + `b46x OPEN-3` in `src/features/smoke-test.js` | the wiring, in a real page, through the shipped functions. |
| `tests/signup-door-page.mjs` | runs just those, alone, without a full suite. |

**Every one of those can be green while a real player's confirmation link lands nowhere.** The
reason is specific and worth stating plainly:

> GoTrue does **not** error on an `emailRedirectTo` that is not allow-listed. It **silently falls
> back to the project's Site URL.** The request succeeds, the mail sends, the link works — and it
> takes the player somewhere that is not this game. Nothing observable from the client
> distinguishes that from success.

So `assert(options.emailRedirectTo === …)` proves the client asked. It proves nothing about what
GoTrue did with it.

---

## Gate 1 — the Auth redirect allowlist and Site URL · **TYLER ONLY**

**Where:** Supabase dashboard → project `nezapsylztqbbwuwembx` → **Authentication → URL
Configuration**.

**What must be true**

1. **Site URL** is `https://hearthrise.net/` — not `http://localhost:3000` (the default on a fresh
   project, and the single most likely cause of the beta-2 signature).
2. **Redirect URLs** contains, exactly:
   - `https://hearthrise.net/`
   - `https://www.hearthrise.net/`
   - `https://bugsquisher1.github.io/hearthrise/`
   - `http://localhost:8123/` and `http://127.0.0.1:*/` *(dev only — remove before any security
     review; they are here so a developer's confirm link works locally)*

   The client sends `origin + pathname` with `index.html` normalised away, so **one** entry per
   origin covers both `/` and `/index.html`. If you add an entry, add the **trailing slash** form.

**How to verify it actually works** (this is the only real proof, and it takes four minutes):

1. Open `https://hearthrise.net/` in a private window.
2. Create an account with a real address you can read.
3. Open the mail. **Before clicking**, hover/copy the link and read the `redirect_to=` parameter
   inside it. It must be `https://hearthrise.net/`. *If it is anything else — especially
   `localhost:3000` — the allowlist is wrong and everything below is moot.*
4. Click it. You must land on `https://hearthrise.net/` **already in the game**, not on a sign-in
   form.

**Failure signature if this gate is open:** players report "I confirmed and nothing happened" /
"it took me to a page that wouldn't load". Sign-ups exist in `auth.users` with
`email_confirmed_at` set and never play.

---

## Gate 2 — the itch.io iframe is a different storage partition

**Where:** `https://fingerguns123.itch.io/hearthrise` — the wrapper a large share of players
actually use.

**The problem, and it is structural, not a bug:** the game runs in an `<iframe>` whose top-level
site is `itch.io`. Chrome (and Safari, and Firefox in strict mode) partition storage by top-level
site, so `hearthrise.net` **inside the itch frame** and `hearthrise.net` **in a normal tab** have
**different `localStorage` and different Supabase sessions**. A confirmation link opened from a
mail client always opens at the top level. So for an itch player the link can work perfectly and
the iframe still shows the wall.

**No redirect can fix this.** The client's answer is the **"I've confirmed"** button on the
check-your-email panel: it re-signs-in with the credentials still in the form, inside the frame,
where the session needs to exist. `DOOR-7` guards it.

**How to verify (one person, one browser, ~5 minutes):**

1. Open `https://fingerguns123.itch.io/hearthrise` and start the embedded game.
2. Create an account with a fresh address. Confirm the panel says **"Check your email"** and shows
   **Resend email** and **I've confirmed**.
3. Open the confirmation link in a **normal tab** (the way a mail app would). Note whether the
   iframe is still walled — expected: **yes**.
4. Return to the itch tab and press **I've confirmed**. Expected: you are in the game, inside the
   frame, with no second sign-in form.
5. Also confirm the itch frame is not `sandbox`ed in a way that blocks storage entirely. If step 4
   fails with a storage error, that is a different and much larger finding — escalate rather than
   patching the door.

**Failure signature if this gate is open:** itch.io players specifically report having to sign in
twice, or "it says my account exists but it won't let me in".

---

## Gate 3 — built-in SMTP throughput · **TYLER ONLY**

**Where:** Supabase dashboard → **Authentication → Emails / SMTP Settings** and **Rate Limits**.

Supabase's **built-in** email service is explicitly not for production volume. Its documented
default is a handful of emails per hour project-wide, and confirmation mail is silently dropped
once that budget is spent. A sign-up **wave** — a Reddit post, a Discord announcement — therefore
reproduces the exact "-11 at the email wall" signature **with no client bug at all**, and the
client cannot see it: `signUp()` returns success either way.

**What to check**

1. Is a **custom SMTP** provider configured (Resend / Postmark / SES / Mailgun)? If the toggle is
   off, the project is on the built-in service and this gate is **open**.
2. **Auth → Rate Limits → "Rate limit for sending emails"** — the per-hour ceiling. Compare it to
   the size of the next launch push. 49 sign-ups in a morning against a 4/hour ceiling is a
   guaranteed loss of most of them.
3. **Logs → Auth** filtered to the last launch window: count `signup` events against
   `email_confirmed_at` in `auth.users` over the same period. A large gap with no client errors
   is this gate, not the redirect.

**The client's mitigation, and its limit:** the resend button gives a player whose mail was
dropped a way to ask again, and it is honest about a 429 rather than claiming "Sent"
(`DOOR-4`). That converts a silent loss into a visible "try again in a minute". It does **not**
create throughput. **Custom SMTP before any launch push** is the fix.

---

## The additive server change this build is already written for (not applied)

`beta_invite_check` returns prose only:

- `'Invalid invite code.'` — used for **both** blank and unknown
- `'Code already used.'`
- `'Too many attempts. Try again in a minute.'`

The client now classifies those into distinct player-facing sentences, but it does so by matching
strings, which is brittle by construction. The durable fix is **additive and changes no validation
rule**: have `beta_invite_check` also return a machine `reason_code` using the vocabulary
`hr_beta_gate_reason()` already speaks (`invite_unknown`, `invite_used`, `invite_required`).

`src/net/signup-door.js classifyInviteRefusal()` **already prefers `reason_code` when present** and
falls back to the prose, so the day that lands the client reads it with no further change. Flagged
rather than written, because this branch applies no migration and makes no production write.

Note also: **`beta_invites` has no expiry column**, so no server answer can currently mean
"expired". The `expired` branch in the classifier is keyed off a machine code that nothing emits
yet and is documented as unreachable — it is not, and must not be presented as, a working state.

---

## The honest summary

| Claim | Proven by | Status |
|---|---|---|
| The client asks GoTrue to return the player to this game | `DOOR-1`, `signup-door.mjs` | **proven** |
| The client completes a session on arrival instead of showing a form | `DOOR-3`, runtime probe on a real `#access_token=` URL | **proven (client half)** |
| A failed resend never renders as success | `DOOR-4`, mutation `resend_failure_reads_sent` | **proven** |
| A refusal names unknown / used / unreachable | `DOOR-5`, `signup-door.mjs` | **proven** |
| An invite code can arrive as a link and is stripped from the URL | `DOOR-6` + runtime probe on a real `?invite=` URL | **proven** |
| **A real confirmation email returns a real player into the real game** | — | **NOT PROVEN. Gate 1.** |
| **An itch.io player gets in after confirming** | — | **NOT PROVEN. Gate 2.** |
| **A launch wave's confirmation emails are actually delivered** | — | **NOT PROVEN. Gate 3.** |

---

## MEASURED 2026-09-05 (Coordinator, Management API, read-only)

Two of the three gates were already satisfied. Do not re-raise them as blockers.

| Gate | Live value | Status |
|---|---|---|
| 1. Auth redirect allowlist | `uri_allow_list = https://bugsquisher1.github.io/hearthrise/**,https://hearthrise.net/**,https://www.hearthrise.net/**` · `site_url = https://hearthrise.net` | **CLOSED** — a redirect to `hearthrise.net` is allowlisted, so GoTrue will not silently substitute the Site URL. The failure mode that would have made every door test green-while-broken does not apply. |
| 3. SMTP throughput | `smtp_host = smtp.resend.com`, `smtp_sender_name = Hearthrise` | **CLOSED** — custom SMTP, not the built-in mailer. |
| 2. itch.io iframe storage partition | — | **STILL OPEN** — needs a manual confirm-link walk inside `fingerguns123.itch.io/hearthrise`. |

### The real constraints, which nobody had named

- **`rate_limit_email_sent = 60`.** Sixty confirmation emails per hour, project-wide. A beta-3 invite wave larger than that will reproduce the exact "−11 at the email wall" signature **with no client bug**. Stagger the keys, or raise the limit before the wave.
- **`mailer_otp_exp = 3600`.** Confirmation links expire after **one hour**. Anyone who opens their mail the next morning gets `otp_expired`. The door fix now handles that honestly (sign-in mode + a visible resend), but the window is short for an invite wave and is worth raising.
- `mailer_autoconfirm = false` — confirmation is genuinely required, as assumed.
