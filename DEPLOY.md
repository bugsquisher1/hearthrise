# Hearthrise — Deploy + Share Guide

Get the project on GitHub + a live URL your friends can visit. ~15 minutes total once you're at your PC.

## Step 1 — Initialize git (RDP terminal, in `R:\the game\the game`)

```powershell
cd "R:\the game\the game"
git init
git add .
git commit -m "Hearthrise pre-beta: character-sheet UI + cloud backend + new icons"
git branch -M main
```

The `.gitignore` already excludes `icons2/`, `icons3/`, `icons4/` (the 6 GB of asset packs). The committed bundle should be ~3-5 MB.

## Step 2 — Create the GitHub repo

1. Go to https://github.com/new
2. Sign in if needed
3. Repository name: `hearthrise`
4. Set to **Private** (you can flip to public later)
5. Do NOT check "Add README" / "Add .gitignore" — we already have those locally
6. Click "Create repository"

## Step 3 — Push your code

GitHub will show two commands after creating the repo. Paste these into your RDP terminal:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/hearthrise.git
git push -u origin main
```

It'll prompt for GitHub credentials. Use a personal access token if asked (Settings → Developer settings → Personal access tokens → "Generate new token (classic)" → check `repo` scope → copy → paste as password).

## Step 4 — Deploy a live URL (Cloudflare Pages, free)

1. Go to https://pages.cloudflare.com
2. Sign up / sign in (free)
3. "Create a project" → "Connect to Git" → authorize GitHub → pick your `hearthrise` repo
4. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `/`
5. "Save and Deploy"
6. Wait ~30 seconds. Cloudflare gives you a URL like `https://hearthrise.pages.dev`

Share that URL with your friends. Done.

## Step 5 — Wire the URL into Supabase auth allowlist

So that sign-up email confirmation links work for friends:

1. Open your Supabase dashboard
2. Authentication → URL Configuration
3. Site URL: `https://hearthrise.pages.dev` (or your custom domain)
4. Additional Redirect URLs: paste the same URL
5. Save

## Step 6 — (Optional) Custom GoDaddy domain

1. Cloudflare Pages → your project → "Custom domains" → "Add custom domain" → enter `hearthrise.com` (or whichever)
2. Cloudflare gives you a CNAME target
3. GoDaddy → DNS → add a CNAME record pointing to that target
4. Wait 5-30 minutes for DNS to propagate
5. Update Supabase URL Configuration to use the custom domain

## Friend onboarding

Send them: `https://hearthrise.pages.dev` (or your custom domain) + a beta invite code from your Supabase `beta_invites` table (`FRIEND-001` through `FRIEND-010` already seeded).

They sign up via Settings → Account → "Create account", paste the code, and they're in.

## Updating the deploy

Every time you push to GitHub `main`, Cloudflare Pages auto-rebuilds and redeploys. Just:

```powershell
git add .
git commit -m "your message"
git push
```

URL updates within ~30 seconds.

## Build version

Current build: `v=89` (cache buster in `index.html`). Bump it whenever you change CSS/JS so testers don't see stale cached files.

## Troubleshooting

- **`git push` fails with auth error** → use a personal access token, not your password (GitHub disabled passwords years ago)
- **Pages build fails** → check the Framework preset is "None" (you don't have a build step)
- **Friends can't sign up** → check the Supabase URL Configuration includes your live domain
- **Page loads but is blank** → check the browser console for 404s (path issues from CSS rel-urls)
