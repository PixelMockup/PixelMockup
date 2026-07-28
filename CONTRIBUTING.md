# Contributing to Pixel Mockup

This guide explains the Git and Vercel workflow for the project. It is designed for first-time contributors.

## Branches

| Branch | Purpose | Live URL | Who pushes here |
| --- | --- | --- | --- |
| `dev` | Shared integration branch. Forks and clones land here. | [pixelmockup-preview.vercel.app](https://pixelmockup-preview.vercel.app/) | Pull requests only |
| `stable` | Final release / production. | [pixelmockup.vercel.app](https://pixelmockup.vercel.app/) | Pull requests only (from `dev`) |
| `fix/...`, `feat/...`, `chore/...` | Short-lived work branches | PR preview URLs | Individual contributors |

**Do not push day-to-day work to `stable`.** It is the final release branch and must not be experimented on.

## Branching cheat sheet

```bash
# Clone (lands on dev because dev is the default branch)
git clone git@github.com:PixelMockup/PixelMockup.git
cd PixelMockup
npm install

# Make a feature or bug fix branch from dev
git checkout dev
git pull origin dev
git checkout -b fix/shortcuts-dialog

# Work, commit, push
git add -A
git commit -m "fix: keep shortcuts Close button in viewport"
git push -u origin HEAD

# Open a Pull Request into dev (never into stable for everyday work)
gh pr create --base dev --title "fix: shortcuts Close button viewport" --body "..."
```

## Before opening a PR into `dev`

Run the test gate locally:

```bash
npm run lint
npm run test:all
```

Both must pass before the PR is ready.

## Website capture (local only)

Screenshot capture for “Show on devices” uses Vite middleware + Playwright Chrome. It only works with:

```bash
npm run dev
# or
npm run preview
```

- Prefer testing with `https://example.com`.
- Capturing your own Vercel URL (e.g. `pixelmockup.vercel.app`) may time out under headless Chrome even when other sites work.
- The static Vercel deployment does not expose `/__capture_website` to end users.

## Required checks before promoting `dev` → `stable`

`stable` is the final release branch. Every check below must be **green on `dev`** (and on the release PR) before you merge into `stable`:

| Check | What it means |
| --- | --- |
| **CI / unit** | Vitest unit, component, and coverage passed |
| **CI / e2e** | Playwright end-to-end suite passed |
| **Vercel** | Deployment has completed |
| **Vercel Preview Comments** | No unresolved preview feedback |

If any check fails, fix it on `dev` first. Do not merge broken work into `stable`.

## Releasing to production (`stable`)

When `dev` is healthy and all required checks are green:

```bash
gh pr create --base stable --head dev \
  --title "Release: promote dev to production" \
  --body "Summarize what is shipping. Confirm unit, e2e, and Vercel checks are green."
```

After review and all checks pass, merge the PR. Vercel updates production at [pixelmockup.vercel.app](https://pixelmockup.vercel.app/) from `stable`. The preview site at [pixelmockup-preview.vercel.app](https://pixelmockup-preview.vercel.app/) continues to track `dev`.

## Vercel setup (project owner)

Configure one Vercel project for this repo:

1. Open [vercel.com](https://vercel.com) → project for `PixelMockup/PixelMockup` (or import it if new).
2. Framework preset: **Vite**.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Install command: `npm ci` (or leave the default).
6. **Settings → Git → Production Branch: `stable`.**
7. Keep **Preview Deployments** enabled for Pull Requests.
8. **Settings → Domains** — assign domains by Git branch:
   - `pixelmockup.vercel.app` → **Production** (tracks `stable`)
   - `pixelmockup-preview.vercel.app` → Git branch **`dev`**
9. If [pixelmockup-preview.vercel.app](https://pixelmockup-preview.vercel.app/) shows a Vercel **login** page, open **Settings → Deployment Protection** and disable protection for that preview domain (or allow public access). The preview app should be viewable without logging into Vercel.

After this:

- Pushes/merges to **`dev`** update [pixelmockup-preview.vercel.app](https://pixelmockup-preview.vercel.app/).
- Merges to **`stable`** update [pixelmockup.vercel.app](https://pixelmockup.vercel.app/).
- Feature PRs still get their own temporary Preview URLs.

## GitHub settings (project owner)

### Default branch

1. [Settings → General → Default branch](https://github.com/PixelMockup/PixelMockup/settings) → **`dev`** → Update.  
   This makes forks and clones land on `dev`. The fork UI checkbox will then say **“Copy the `dev` branch only”** (it always follows the default branch).
2. Do **not** set the default branch to `stable`, or new forks will land on production and the checkbox will say “Copy the `stable` branch only.”
3. Vercel Production Branch stays **`stable`** — Git default and Vercel production are independent.
4. Delete old `main` if it still exists (only after default is `dev`): Settings → Branches, or `git push origin --delete main`.

**Fork tip:** Until default is `dev`, forkers should **uncheck** “Copy the `stable` branch only” to get all branches, then `git checkout dev`.

### Organization (optional)

Recommended org name: **`pixelmockup`** (URL: `https://github.com/pixelmockup`). Fallbacks if taken: `pixel-mockup`, `pixelmockup-hq`, `pixelmockup-org`.

**Enforcement note:** GitHub may show that rulesets are not enforced on a **private** repo until the owner is a **GitHub Team** organization. A **Free** org alone does not unlock that for private repos. Options:

1. Keep the repo private and follow this workflow by policy (no paid plan).
2. Make the repo **public** so Free rulesets enforce.
3. Upgrade the org to **Team** later if you need hard enforcement while staying private.

After an org exists, transfer the repo into it, then create the rulesets below under the org repo settings.

### Branch rulesets (`protect-dev` and `protect-stable`)

Use **Settings → Rules → Rulesets → New ruleset → New branch ruleset**. Create **two** rulesets.

#### Ruleset 1 — `protect-dev`

1. **Ruleset Name:** `protect-dev`
2. **Enforcement status:** `Active`
3. **Bypass list:** leave empty (or add yourself temporarily while testing)
4. **Target branches → Add target → Include by name:** `dev`
5. Enable these **Branch rules** only:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging** (approvals: `0` solo, or `1` with reviewers)
   - **Require status checks to pass**, then add:
     - `CI / unit` (or `unit` as listed)
     - `CI / e2e` (or `e2e`)
     - `Vercel` (after it has run at least once)
     - `Vercel Preview Comments` (after it has run at least once)
6. Leave unchecked for now: Restrict creations/updates, linear history, signed commits, deployments, code scanning/quality/coverage, Copilot review
7. Click **Create**

Status checks appear in the search box only after they have run once on the repo. Trigger CI first if a name is missing, then edit the ruleset and add it.

#### Ruleset 2 — `protect-stable`

Same as `protect-dev`, except:

1. **Ruleset Name:** `protect-stable`
2. **Target branches → Include by name:** `stable`
3. Same checkboxes and the same four status checks

#### Release-only process for `stable`

Rulesets cannot natively require “PR head must be `dev`”. Enforce by process:

- Everyday work: PR base = `dev`
- Releases only: PR base = `stable`, head = `dev`
- Never open `fix/...` / `feat/...` PRs into `stable`

### Verify rulesets

1. Confirm both rulesets are **Active** under Settings → Rules → Rulesets.
2. Try a direct push to `dev` — should be rejected when enforcement applies.
3. Open a PR into `dev` — merge should wait on the required checks.

## Questions?

Ask the maintainer or open a discussion. Do not push directly to `stable` or `dev`.
