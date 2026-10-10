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
| 4 | Groq and Gemini keys (free) | console.groq.com/keys and aistudio.google.com/apikey | captures them with hidden input |
| 5 | Anthropic / Sarvam (optional) | paste them or skip | captures them with hidden input, and stops if no vision key was given |
| 6 | Login & link | approve login in the browser | `npx supabase login`, `npx supabase link --project-ref <ref>` |
| 7 | Secrets | confirm | `npx supabase secrets set --env-file <tmp> --project-ref <ref>` |
| 8 | Deploy | confirm | `npx supabase functions deploy <fn> --project-ref <ref> --no-verify-jwt --use-api` for each function |
| 9 | `.env` | confirm | backs up `.env` to `.env.teammate.bak`, offers skip-worktree, writes the 3 `VITE_SUPABASE_*` values |
| 10 | Smoke test | confirm | curls `analyze-image` with a built-in 32x32 PNG |
| 11 | Run & rollback | `npm run dev`, then open `/vision` | prints the rollback steps |

You need **at least one** of `GROQ_API_KEY`, `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`. Groq plus Gemini, both free, is the recommended setup.

| Secret | Used by | Needed? |
|---|---|---|
| `GROQ_API_KEY` | analyze-image (1st choice), speech-to-text (Whisper) | recommended; free tier, from console.groq.com/keys |
| `GEMINI_API_KEY` | analyze-image (2nd choice) | recommended; free tier, from aistudio.google.com/apikey. Google may use free-tier requests to improve its products |
| `ANTHROPIC_API_KEY` | analyze-image (3rd choice, Claude) | optional; Anthropic requires billing |
| `SARVAM_API_KEY` | text-to-speech; speech-to-text when there is no Groq key or Groq fails | optional; without it the app uses browser speech |
| `LOVABLE_API_KEY` | analyze-image (last, legacy) | skip it, because it only works on Lovable Cloud |

Optional overrides, not set by the wizard: `GEMINI_MODEL` (default `gemini-3.5-flash`; 3.8 was overloaded and 3.7 timed out in a 9 Oct 2026 test) and `STT_MODEL` (default `whisper-large-v3-turbo`). Set them with `npx supabase secrets set NAME=value --project-ref <ref>`.

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
| 503 | every vision provider failed; check your keys and the function logs |

Then run `npm run dev` and open http://localhost:8080/vision in Chrome. If the dev server was already running, restart it, because Vite only reads `.env` at startup.

## Looking after it

- **Logs and invocations.** Dashboard → your project → Edge Functions → pick a function. The **Invocations** tab lists each call with its status code and duration. The **Logs** tab shows the function's `console` output, including which provider answered (`Vision response received from model: ...`, `STT via groq ...`) and why a provider failed. Transcripts and descriptions are never logged.
- **Provider usage and limits.**
  - Groq: console.groq.com → Dashboard → Usage, and Settings → Limits for your free-tier rate limits.
  - Gemini: aistudio.google.com → Dashboard → Usage (and Rate limits). Free-tier Flash models cost nothing; when you hit the limit, requests fail with 429 and the function moves on to the next provider.
  - Anthropic: console.anthropic.com → Usage and Cost. You can set a monthly spend limit under Limits.
- **Rotating a key.** Create a new key in the provider's console, then set it again. Re-run the wizard, or run `npx supabase secrets set --env-file <file> --project-ref <ref>` with a `chmod 600` file outside the repo, then delete the file. Functions read secrets on each run, so you don't need to redeploy. Afterwards, delete the old key in the provider's console.
- **Free projects pause.** Supabase pauses free projects after 7 days without activity. A paused project's functions don't answer. Restore it from the dashboard (the project page shows a Restore button); it takes a few minutes.

## Rollback

```bash
cp .env.teammate.bak .env                   # restore the teammate's values
git update-index --no-skip-worktree .env    # only if you enabled it
# or: git checkout -- .env                  # restore the committed version
```

Rolling back leaves your Supabase project as it is. To remove it, delete it from Settings → General.
