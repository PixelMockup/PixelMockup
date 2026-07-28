# Contributing to Pixel Mockup

This guide explains the Git and Vercel workflow for the project. It is designed for first-time contributors.

## Branches

| Branch | Purpose | Who pushes here |
| --- | --- | --- |
| `dev` | Shared integration branch. Forks and clones land here. | Pull requests only |
| `stable` | Final release / production. Vercel deploys the live site from here only. | Pull requests only (from `dev`) |
| `fix/...`, `feat/...`, `chore/...` | Short-lived work branches | Individual contributors |

**Do not push day-to-day work to `stable`.** It is the final release branch and must not be experimented on.

## Branching cheat sheet

```bash
# Clone (lands on dev because dev is the default branch)
git clone git@github.com:ravijaanthony/PixelMockup.git
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

After review and all checks pass, merge the PR. Vercel deploys the live site from `stable`.

## Vercel setup (project owner)

Import the repo in the Vercel dashboard once:

1. Go to [vercel.com/new](https://vercel.com/new) and import `ravijaanthony/PixelMockup`.
2. Framework preset: **Vite**.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Install command: `npm ci` (or leave the default).
6. Project Settings → Git → **Production Branch: `stable`** (not `main`, not `dev`).
7. Keep **Preview Deployments** enabled for Pull Requests.

After this:

- Every PR gets a Preview URL (and the Vercel / Preview Comments checks).
- Only merges into **`stable`** update the live production domain.

## GitHub settings (project owner)

1. **Default branch:** Settings → General → Default branch → **`dev`** → Update.  
   This makes forks and clones land on `dev`.
2. **Delete old `main` (if it still exists):** After default is `dev`, delete the `main` branch (Settings → Branches, or `git push origin --delete main`).
3. **Protect `dev`:** Require a pull request; require status checks `CI / unit`, `CI / e2e`, and Vercel checks when listed; disallow force pushes and deletions.
4. **Protect `stable`:** Same required checks; require a pull request; disallow force pushes and deletions; merge only from `dev` via release PRs.

## Questions?

Ask the maintainer or open a discussion. Do not push directly to `stable` or `dev`.
