# Run NeuroNarrator on your own Supabase project

The committed `.env` points the app at a teammate's Supabase project. This guide moves the backend (the three edge functions and their API keys) onto a free Supabase project that you own. The app uses no Supabase database tables or auth, so there is nothing to migrate besides the functions and their secrets.

## Quick start

```bash
./scripts/setup-own-backend.sh
```

The wizard runs in 11 stages. You do the signups and paste values. The script runs each command only after you confirm it. You can quit with Ctrl-C and re-run it at any point.

You need Node.js with npm, git, and curl. You don't need the Supabase CLI installed, because `npx supabase ...` fetches it on demand. You don't need Docker either, because functions are deployed with `--use-api`.

## Terms

- **Edge function**: a small server-side program that Supabase runs on demand. This app has three: `analyze-image`, `text-to-speech` and `speech-to-text`. They exist so that API keys stay on the server.
- **Secret**: a value stored in Supabase that only your edge functions can read. The browser never sees it.
- **Project ref**: your project's unique 20-letter ID. It appears in the dashboard URL and in Settings → General.
- **Project URL**: `https://<ref>.supabase.co`, the address of your backend.
- **Publishable key** (older name: **anon key**): a public key that identifies your project to Supabase. It is safe to put in browser code. Never use the `secret` / `service_role` key in the frontend.

## What the stages do

| # | Stage | You | Script |
|---|---|---|---|
| 1 | Tools & vocabulary | read | checks for node, npx, git and curl |
| 2 | Create Supabase project | sign up, create a free project, paste the ref | derives the Project URL and blocks the teammate's ref |
| 3 | Publishable key | copy it from Settings → API Keys | validates the prefix and rejects `sb_secret_` keys |
| 4 | Groq key (required) | console.groq.com/keys → Create API Key | captures it with hidden input |
| 5 | Sarvam / Anthropic (optional) | paste them or skip | captures them with hidden input |
| 6 | Login & link | approve login in the browser | `npx supabase login`, `npx supabase link --project-ref <ref>` |
| 7 | Secrets | confirm | `npx supabase secrets set --env-file <tmp> --project-ref <ref>` |
| 8 | Deploy | confirm | `npx supabase functions deploy <fn> --project-ref <ref> --no-verify-jwt --use-api` for each function |
| 9 | `.env` | confirm | backs up `.env` to `.env.teammate.bak`, offers skip-worktree, writes the 3 `VITE_SUPABASE_*` values |
| 10 | Smoke test | confirm | curls `analyze-image` with a built-in 32x32 PNG |
| 11 | Run & rollback | `npm run dev`, then open `/vision` | prints the rollback steps |

| Secret | Used by | Needed? |
|---|---|---|
| `GROQ_API_KEY` | analyze-image | yes |
| `SARVAM_API_KEY` | text-to-speech, speech-to-text | optional; without it the app uses browser speech |
| `ANTHROPIC_API_KEY` | analyze-image fallback | optional; Anthropic requires billing |
| `LOVABLE_API_KEY` | analyze-image fallback | skip it, because it only works on Lovable Cloud |

## How your keys are protected

- Keys are read with `read -s`, so they are hidden as you type. They are never typed on a command line, so they never reach shell history.
- Keys are never written to any file in the repo. To pass them to the CLI, the script writes them to a temp file in `$TMPDIR` with mode 600, runs `secrets set --env-file`, and deletes the file straight away. A `trap` also deletes it if the script exits early.
- The script clears the key variables from memory after stage 7. `secrets list` shows only hashes, never the values.

## About `supabase/config.toml`

`project_id = "yvqujhdozlzogusxrwgi"` is the teammate's project. That field only names the local Docker dev stack. It does not decide where deploys go. The linked ref decides that, and the wizard also passes `--project-ref` explicitly on every command. Leave `config.toml` unchanged so it causes no diff. The `[functions.*] verify_jwt = false` blocks are why the wizard deploys with `--no-verify-jwt`. The app has no user login, so the functions must accept calls that carry only the publishable key.

## Git safety

`.env` is **tracked** in git: it was committed even though `.gitignore` lists it. `.gitignore` has no effect on files that are already tracked, so your edits to `.env` will appear in `git status` and could get committed. The wizard does three things about this:

- It offers `git update-index --skip-worktree .env`. This tells your local git to ignore changes to `.env`. To undo it, run `git update-index --no-skip-worktree .env`. Undo it before pulling if a teammate changes `.env`.
- It adds `.env.teammate.bak` and `supabase/.temp/` to `.git/info/exclude`. That is a local ignore list that is never committed, so `.gitignore` doesn't change.
- If you decline skip-worktree, check `git status` before every commit and do not commit `.env`.

## Manual smoke test

```bash
REF=<your-ref>; KEY=<your-publishable-key>
curl -sS -X POST "https://$REF.supabase.co/functions/v1/analyze-image" \
  -H "Content-Type: application/json" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -d '{"imageBase64":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR42u3NsQkAAAzDsBzW/+lZvaJDQODZys68FgAAAABUAM//BQAAAEAFcNLfAExt+YfPAAAAAElFTkSuQmCC","mode":"general"}'
```

| Response | Meaning |
|---|---|
| 200 with a `description` | everything works |
| 404 | the function isn't deployed |
| 401 | wrong key, or the function was deployed without `--no-verify-jwt` |
| 500 "API key not configured" | the secrets aren't set |
| 503 | every vision model failed; check the Groq key |

Then run `npm run dev` and open http://localhost:8080/vision in Chrome. If the dev server was already running, restart it, because Vite only reads `.env` at startup.

## Rollback

```bash
cp .env.teammate.bak .env                   # restore the teammate's values
git update-index --no-skip-worktree .env    # only if you enabled it
# or: git checkout -- .env                  # restore the committed version
```

Rolling back leaves your Supabase project as it is. To remove it, delete it from Settings → General.
