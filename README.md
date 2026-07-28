# Pixel Mockup

Device mockup composer — arrange phones, tablets, and more on an artboard, then export.

```bash
npm install
npm run dev
```

## Fork / clone (defaults to `dev`)

GitHub’s **Default branch must be `dev`** (not `stable`). That controls:

- What `git clone` checks out
- The fork dialog checkbox (“Copy the `dev` branch only”)

**Owner setup:** Settings → General → Default branch → **`dev`** → Update.  
Keep Vercel **Production Branch** as `stable` — that is separate from the Git default.

When forking:

- If the checkbox says “Copy the `stable` branch only”, the repo default is still wrong — ask the owner to switch default to `dev`, or **uncheck** the box to copy all branches, then `git checkout dev` after clone.
- After default is `dev`, leaving “Copy the `dev` branch only” checked is fine for everyday contributors.

```bash
git clone git@github.com:ravijaanthony/PixelMockup.git
cd PixelMockup
npm install
# You should be on `dev` — create a fix/feat branch from here
```

## Branches

| Branch | Role | Live URL |
| --- | --- | --- |
| `dev` | Everyday work. Open bug-fix and feature PRs here. | [pixelmockup-preview.vercel.app](https://pixelmockup-preview.vercel.app/) |
| `stable` | Final release / production. Do not push day-to-day work here. | [pixelmockup.vercel.app](https://pixelmockup.vercel.app/) |

Flow: `fix/...` or `feat/...` → PR into **`dev`** (updates the preview site) → when ready, release PR **`dev` → `stable`** (updates production).

## Required checks before promoting to `stable`

`stable` is the final release branch. Do not merge into it until **all** of these checks are green on `dev` (and on the release PR):

1. **CI / unit** — Vitest unit, component, and coverage
2. **CI / e2e** — Playwright end-to-end tests
3. **Vercel** — Deployment has completed
4. **Vercel Preview Comments** — no unresolved feedback

If any check fails, fix it on `dev` / the preview site first. Never “play with” `stable` or production.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full PR workflow and Vercel/GitHub setup.

## Tests

```bash
npm test              # unit + component + a11y (Vitest)
npm run test:watch    # Vitest watch mode
npm run test:unit     # same as npm test, scoped folders
npm run test:coverage # Vitest with coverage thresholds
npm run test:ui       # Vitest UI
npm run test:e2e      # Playwright (builds + previews the app)
npm run test:all      # unit + component + a11y, then e2e in CI mode
npm run test:a11y     # accessibility unit tests only
npm run test:perf     # Lighthouse CI (optional)

# E2E debugging helpers
npm run test:e2e:focus  # shortcuts-related e2e tests only
npm run test:e2e:ci    # e2e exactly like GitHub Actions (CI=true)
npm run test:e2e:ui    # Playwright interactive UI
npm run test:e2e:trace # open trace of the last failed shortcuts run
```

First-time Playwright setup:

```bash
npx playwright install chromium
```
