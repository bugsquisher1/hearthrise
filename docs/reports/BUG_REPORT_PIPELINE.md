# Bug Report Pipeline — how it works, and the one thing Tyler must set

> **Rewritten b322 (2026-08-11).** The previous version of this guide described a
> Cloudflare Worker and, in step 5, told you to paste a delivery URL into
> `src/bug-report.js`. That instruction is how a **live Discord webhook token
> ended up in the public bundle and in git history**. The worker and this
> instruction are both gone. **No credential ever goes into client source.**

---

## The flow

```
🐛 button  →  POST /functions/v1/bug-report-bridge   (Supabase Edge Function)
              ├─ requires a valid Supabase user JWT      (no anonymous path)
              ├─ bounds the payload                      (3 MB, field caps)
              ├─ RPC public.bug_report_submit            (the ONLY writer)
              │    · stamps the report with auth.uid()   (client identity ignored)
              │    · 6 reports/hour, 20/day, per account
              │    · idempotency key → a retry never double-posts
              └─ on relay:true → Discord #bug-reports    (webhook = server secret)
```

Fallbacks, in order, if the relay is unreachable: a direct insert into
`public.bug_reports` (RLS pins `user_id` to `auth.uid()`), then a localStorage
queue that is flushed on the next load.

| Piece | Lives in |
| --- | --- |
| Edge Function | `supabase/functions/bug-report-bridge/index.ts` |
| RPC + schema + grants | `supabase/migrations/2026-08-11-bug-report-relay.sql` |
| Client | `src/bug-report.js` |
| Repo-wide secret guard | `tests/run-smoke.mjs` → `secretGuard()` |

---

## The one manual step: set the webhook secret

The function is deployed and, until this is done, it **stores every report and
reports `relayed:false, reason:"not_configured"`** — no 500, nothing lost, just
no Discord message.

1. Discord → `#bug-reports` → **Edit Channel → Integrations → Webhooks**.
   Use the existing "Hearthrise Bug Bot" webhook, or create one and **Copy
   Webhook URL**.
2. Supabase dashboard → project **hearthrise-testing** → **Edge Functions** →
   **Secrets** → **Add new secret**.
3. Name: `DISCORD_WEBHOOK_URL`  ·  Value: paste the URL  ·  **Save**.
4. That is the only place it goes. Not into a file, not into a chat message, not
   into a prompt. If it is ever pasted anywhere else, regenerate it in Discord.

No redeploy is needed — the function reads the secret per request.

**Verify:** sign in to the game, hit 🐛, send a report. A message should appear
in `#bug-reports` within a second, and the response body should read
`{"ok":true,"status":"accepted","relayed":true}`.

---

## Rotating the webhook

Discord → channel → Integrations → Webhooks → the webhook → **Delete**, then
create a new one and repeat the four steps above. Nothing in the repo changes.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `relayed:false, reason:"not_configured"` | The secret is unset or malformed (it must be a real `https://discord.com/api/webhooks/<id>/<token>`). The report is still stored. |
| `503 not_provisioned` | `2026-08-11-bug-report-relay.sql` has not been applied. The relay refuses to forward without its rate limit; the client falls back to the direct table write. |
| `429 rate_limited` | 6/hour or 20/day for that account. `retry_after_s` says when. Working as intended. |
| Report arrives with no screenshot | Expected on phones — b316 made touch devices text-only because the capture froze iOS Safari. Desktop attaches a screenshot. |
| `401` | Not signed in. The game is online-only; there is no anonymous reporting path. |

Reports are also queryable directly: `select * from public.bug_reports order by
created_at desc;`
