# Bug Report Pipeline — Setup Guide

How to wire up the **phone-friendly bug report → Discord + GitHub Issues** pipeline so testing from your phone via RDP doesn't require copy-pasting clipboards across devices.

**End-to-end flow once setup:**

1. Friend hits 🐛 button on phone, fills in summary, taps Send
2. Game POSTs to your Cloudflare Worker (one URL, no auth from client)
3. Worker fans out:
   - **Discord** channel with screenshot + state + errors (you see notification on phone)
   - **GitHub Issue** in `bugsquisher1/hearthrise` (Claude reads via WebFetch during co-pilot)
4. We triage in GitHub, close issues as we fix them

Total setup time: ~25 min. One-time only.

---

## 1. Discord channel + webhook (5 min)

1. Open Discord on desktop or phone
2. Pick a server you own (or create one — "Hearthrise Beta" is fine)
3. Create a new text channel: `#bug-reports`
4. Right-click the channel → **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**
5. Name it "Bug Bot" (or whatever). Copy the webhook URL — looks like:
   ```
   https://discord.com/api/webhooks/1234.../abcd...
   ```
6. Save it somewhere — you'll paste it into Cloudflare in step 4.

---

## 2. GitHub fine-grained PAT (5 min)

1. https://github.com/settings/personal-access-tokens/new (create new fine-grained token)
2. **Token name:** `hearthrise-bug-bridge`
3. **Expiration:** 90 days (or longer — your call)
4. **Repository access:** "Only select repositories" → pick `bugsquisher1/hearthrise`
5. **Permissions** → Repository permissions:
   - **Issues:** Read and write
   - Everything else: leave at "No access"
6. **Generate token.** Copy the `github_pat_...` string. You won't see it again — save somewhere safe until step 4.

---

## 3. Cloudflare Workers account (5 min)

1. https://workers.cloudflare.com — sign up free
2. You'll get a subdomain like `bugsquisher1.workers.dev`
3. Free tier includes 100,000 requests/day — way more than we'll need

---

## 4. Deploy the Worker (10 min)

On your RDP desktop terminal:

```powershell
# Install Wrangler (Cloudflare's CLI). One-time.
npm install -g wrangler

# Login (opens browser to authorize)
wrangler login

# Deploy from the cloudflare-workers/ folder
cd "R:\the game\the game\cloudflare-workers"
wrangler deploy bug-report-bridge.js
```

Wrangler will show a deployed URL like:
```
https://hearthrise-bug-bridge.bugsquisher1.workers.dev
```
Copy that URL — you'll paste it into the game in step 5.

Now set the three secrets:

```powershell
wrangler secret put DISCORD_WEBHOOK_URL
# (paste the webhook URL from step 1, hit Enter)

wrangler secret put GITHUB_REPO
# (type "bugsquisher1/hearthrise", hit Enter)

wrangler secret put GITHUB_PAT
# (paste the PAT from step 2, hit Enter)
```

Test the worker is alive:
```powershell
curl -X POST https://hearthrise-bug-bridge.bugsquisher1.workers.dev `
     -H "Content-Type: application/json" `
     -d '{"summary":"setup test","description":"verifying pipeline works","build":"setup-test","user":"tyler"}'
```

If everything's wired right you should:
- See a new message in your Discord `#bug-reports` channel
- See a new issue in `bugsquisher1/hearthrise` labeled `bug-report` and `beta`

If either branch fails, check:
- Cloudflare Workers dashboard → your worker → Logs (real-time error stream)
- The response body from curl will list which branch failed

---

## 5. Wire the worker URL into the game (1 min)

Open `src/bug-report.js` and update the constant near the top:

```js
const BRIDGE_URL = 'https://hearthrise-bug-bridge.bugsquisher1.workers.dev';
```

Bump the cache buster, commit, push. Done.

From this point on, every bug report sent from the game flows through the worker → Discord + GitHub. The legacy direct-Discord and Supabase paths are still there as redundant fallbacks.

---

## What Claude can do once this is wired

- Read latest bug reports on demand: "go check the GitHub issues" → I navigate to `https://github.com/bugsquisher1/hearthrise/issues?q=is%3Aissue+is%3Aopen+label%3Abug-report` via WebFetch and read everything.
- Comment on issues to track investigation status.
- Close issues as we fix the underlying bug ("fixed in b119, closing").
- Pull screenshots out of issues to verify what testers saw matches what I see in the iframe.

The GitHub Issues tab becomes the persistent shared source of truth for bugs across our co-pilot sessions.

---

## Troubleshooting

**"Discord embed shows up but no GitHub Issue"**
- GitHub PAT permissions wrong (needs `issues: write`)
- GITHUB_REPO env var wrong format (needs `owner/name`)
- Check Worker logs for exact error

**"GitHub Issue shows up but no Discord"**
- Discord webhook URL invalid or revoked
- Channel was deleted

**"Worker times out"**
- html2canvas screenshots can be 200-800KB; if Discord rate-limits, the Worker waits. 30s Cloudflare timeout. Should be rare.

**"Reports stop arriving"**
- Cloudflare Workers free tier: 100K requests/day. If you blow through that you'll get rate-limited until midnight UTC.
- Free Workers have no usage-based billing — they just stop until next day.

**"Want to test locally without deploying"**
```powershell
wrangler dev bug-report-bridge.js
```
Runs the worker on `localhost:8787` and you can curl it.

---

## Removing the pipeline

If you ever want to tear it all down: revoke the GitHub PAT (https://github.com/settings/personal-access-tokens), delete the Discord webhook (channel settings), and `wrangler delete hearthrise-bug-bridge`. Bug reports automatically fall back to the legacy direct paths in the game (Discord webhook constant or Supabase) if `BRIDGE_URL` is empty.
