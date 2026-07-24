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
npm run test:a11y     # accessibility unit tests only
npm run test:perf     # Lighthouse CI (optional)
```

First-time Playwright setup:

```bash
npx playwright install chromium
```
