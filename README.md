# Pixel Mockup

Device mockup composer — arrange phones, tablets, and more on an artboard, then export a polished mockup.

## What it does

- Place and arrange device frames on a shared artboard
- Apply layout presets and snap guides while composing
- Drop images onto device screens, or (locally) load a public website onto devices
- Switch theme, inspect selection, and export the result
- Show a live “N online” presence pill when the presence API is available

## Try it

| Environment | URL | Branch |
| --- | --- | --- |
| Production | [pixelmockup.vercel.app](https://pixelmockup.vercel.app/) | `stable` |
| Preview | [pixelmockup-preview.vercel.app](https://pixelmockup-preview.vercel.app/) | `dev` |

## Tech stack

| Layer | Technology | Role |
| --- | --- | --- |
| UI | React 19 (`.tsx`) | Studio interface: artboard, panels, menus, top bar |
| Language | TypeScript (`.ts` / `.tsx`) | App source for UI, shared logic, Vite plugins, and serverless API |
| Runtime | JavaScript (build output) | What the browser runs after Vite/`tsc` compile — not a separate hand-written app layer |
| Styling | CSS | Layout and theme |
| Icons | lucide-react | UI icons |
| Build / dev | Vite 8 + `@vitejs/plugin-react` | Local `npm run dev`, HMR, production bundle |
| Local sidecars | Vite middleware plugins | Website capture and presence during `dev` / `preview` / Docker |
| Production API | Vercel serverless (`api/presence.ts`) | `/api/presence` heartbeats on Vercel deploys |
| Hosting | Vercel (static) + optional Docker | Vercel: preview/`dev`, prod/`stable`. Docker: UI + live capture |
| Unit / component tests | Vitest, Testing Library, jsdom | Logic and React component tests |
| E2E / a11y | Playwright, axe | Browser flows and accessibility checks |
| Lint / perf | oxlint, Lighthouse CI | Lint gate and optional performance runs |
| CI | GitHub Actions | Automated checks on pull requests |

## Develop / make changes

### Prerequisites

- [Node.js](https://nodejs.org/) (with npm)
- [Git](https://git-scm.com/)

### Clone and run

Fork the repo on GitHub if you plan to open a PR, then clone your fork (or clone the upstream repo if you have push access):

```bash
git clone git@github.com:YOUR_USER/PixelMockup.git
cd PixelMockup
npm install
npm run dev
```

Open the local URL Vite prints (typically `http://127.0.0.1:5173`).

GitHub’s **default branch should be `dev`**, so a normal clone lands on everyday work — not production. If you land on `stable`, switch:

```bash
git checkout dev
git pull origin dev
```

When forking: if the dialog says “Copy the `stable` branch only,” either ask the owner to set the default branch to `dev`, or **uncheck** that box, clone, then `git checkout dev`.

### Make a change

```bash
git checkout dev
git pull origin dev
git checkout -b fix/your-change   # or feat/your-change

# edit, then:
npm run lint
npm run test:all

git add -A
git commit -m "fix: describe your change"
git push -u origin HEAD
```

Open a pull request **into `dev`** (not `stable`). Preview deploys update from `dev`; production updates only when `dev` is promoted to `stable`.

Full PR, release, Vercel, and GitHub ruleset details: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Branches

| Branch | Role | Live URL |
| --- | --- | --- |
| `dev` | Everyday work. Open bug-fix and feature PRs here. | [pixelmockup-preview.vercel.app](https://pixelmockup-preview.vercel.app/) |
| `stable` | Final release / production. Do not push day-to-day work here. | [pixelmockup.vercel.app](https://pixelmockup.vercel.app/) |

Flow: `fix/...` or `feat/...` → PR into **`dev`** (updates the preview site) → when ready, release PR **`dev` → `stable`** (updates production).

### Required checks before promoting to `stable`

Do not merge into `stable` until **all** of these are green on `dev` (and on the release PR):

1. **CI / unit** — Vitest unit, component, and coverage
2. **CI / e2e** — Playwright end-to-end tests
3. **Vercel** — Deployment has completed
4. **Vercel Preview Comments** — no unresolved feedback

If any check fails, fix it on `dev` first. Never experiment on `stable` or production.

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
npm run test:e2e:ci     # e2e exactly like GitHub Actions (CI=true)
npm run test:e2e:ui     # Playwright interactive UI
npm run test:e2e:trace  # open trace of the last failed shortcuts run
```

First-time Playwright setup:

```bash
npx playwright install chromium
```

## Website capture

“Show on devices” screenshots run through a capture server (Playwright + Chrome) that exists when you start the app with Vite or Docker:

| How you run | Live URL capture? |
| --- | --- |
| `npm run dev` / `npm run preview` | Yes |
| `docker compose up` | Yes |
| Vercel preview / production | No — upload a screenshot instead |

```bash
npm run dev
# or
npm run preview
# or (built app + Chromium in one container)
docker compose up --build
```

Open `http://localhost:4173` when using Docker Compose.

Tips:

- Test with a simple public site such as `https://example.com`.
- Some hosts (including some Vercel deployments) may time out under headless Chrome even when they open fine in a normal browser — try another URL.
- Multiple device sizes are captured a few at a time and wait in line (you may see “Loading site…” longer); they should not fail with “too many captures.”
- The static Vercel site does **not** run the capture API for visitors.

### Deploy the Docker image

The image is **Node 22 + system Chromium** (not the full Playwright browser image). Build and run on any container host (Fly.io, Railway, a VPS, etc.):

```bash
docker build -t pixel-mockup .
docker run --rm -p 4173:4173 \
  -e HOST=0.0.0.0 \
  -e PORT=4173 \
  -e PIXEL_MOCKUP_DISABLE_SANDBOX=1 \
  -e PIXEL_MOCKUP_CHROME=/usr/bin/chromium \
  pixel-mockup
```

Publish port **4173** (or map it behind your platform’s HTTPS proxy). Capture and presence both run inside this process — no separate Vercel serverless function is required for Docker deploys.
