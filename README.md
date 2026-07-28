# Pixel Mockup

Device mockup composer — arrange phones, tablets, and more on an artboard, then export.

```bash
npm install
npm run dev
```

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
