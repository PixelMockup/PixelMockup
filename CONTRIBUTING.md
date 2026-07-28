# Contributing to Pixel Mockup

This guide explains the Git and Vercel workflow for the project. It is designed for first-time contributors.

## Branches

| Branch | Purpose | Who pushes here |
| --- | --- | --- |
| `dev` | Shared integration branch. New clones land here. | Pull requests only |
| `main` | Production branch. Vercel deploys the live site from here. | Pull requests only (from `dev`) |
| `fix/...`, `feat/...`, `chore/...` | Short-lived work branches | Individual contributors |

## Branching cheat sheet

```bash
# Clone (lands on dev because dev is the default branch)
git clone git@github.com:ravijaanthony/PixelMockup.git
cd PixelMockup
npm install

# Make a feature or bug fix branch
git checkout dev
git pull origin dev
git checkout -b fix/shortcuts-dialog

# Work, commit, push
git add -A
git commit -m "fix: keep shortcuts Close button in viewport"
git push -u origin HEAD

# Open a Pull Request into dev
gh pr create --base dev --title "fix: shortcuts Close button viewport" --body "..."
```

## Before opening a PR

Run the test gate locally:

```bash
npm run lint
npm run test:all
```

Both must pass before the PR is ready.

## Releasing to production

When `dev` is stable and tested:

```bash
gh pr create --base main --head dev \
  --title "Release: promote dev to production" \
  --body "Summarize what is shipping."
```

After review and CI pass, merge the PR. Vercel will automatically deploy the production site from `main`.

## Vercel setup

If you are the project owner, import the repo in the Vercel dashboard once:

1. Go to [vercel.com](https://vercel.com) and import `ravijaanthony/PixelMockup`.
2. Set **Framework** to Vite.
3. Set **Build command** to `npm run build`.
4. Set **Output directory** to `dist`.
5. Set **Production Branch** to `main`.
6. Enable **Preview Deployments for Pull Requests**.

After this, every PR gets a preview URL, and only merges to `main` update the live production site.

## GitHub settings

In the GitHub repo settings, enable these protections (optional but recommended):

- `dev`: Require pull requests, require status checks `unit` and `e2e`, disallow force pushes and deletions.
- `main`: Same as `dev`, plus only allow merges from `dev` via the release PR workflow.

## Questions?

Ask the maintainer or open a discussion. Do not push directly to `main` or `dev`.
