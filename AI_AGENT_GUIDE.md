# AI Agent Guide — Pixel Mockup

This file is the source of truth for any AI agent (human or automated) working on the Pixel Mockup project. Read it first before editing code, generating files, or proposing changes.

## Project scope

Pixel Mockup is a browser-based device mockup composer. Users arrange phones, tablets, watches, and other devices on a canvas/artboard, set website screenshots or images on the device screens, and export the final composition. It is a single-page React application built with Vite.

## Tech stack

- **Framework:** React 19 + TypeScript
- **Build tool:** Vite 8
- **Test runner:** Vitest (unit, component, integration, accessibility)
- **E2E testing:** Playwright
- **Linting:** oxlint
- **Styling:** Plain CSS with CSS variables (no CSS-in-JS framework)
- **Icons:** `lucide-react`

All runtime dependencies are in `package.json`. Do not introduce new dependencies unless the user explicitly asks for them.

## Directory layout

```text
mockup_studio/
├── src/                    # Application source
│   ├── App.css             # Global/component styles (ms-* class names)
│   ├── index.css           # CSS variables, theme tokens, base styles
│   ├── MockupStudio.tsx    # Main app shell and canvas state
│   ├── KeybindingsPanel.tsx # Native <dialog> shortcuts settings panel
│   ├── IconRail.tsx        # Studio tools rail (Devices, Shortcuts, etc.)
│   ├── LibraryPanel.tsx    # Device library popover
│   ├── ContextMenu.tsx     # Right-click context menu
│   ├── EmptyHero.tsx       # Empty-state landing view
│   ├── keybindings.ts      # OS-aware keybinding logic and persistence
│   ├── storage.ts          # localStorage helpers
│   └── ...
├── tests/
│   ├── e2e/                # Playwright end-to-end tests
│   ├── components/          # React component tests (Vitest + Testing Library)
│   ├── unit/                # Pure function / utility tests
│   ├── integration/         # Multi-step workflow tests
│   ├── accessibility/       # axe-core accessibility tests
│   ├── helpers/             # Test helpers and fixtures
│   ├── mocks/               # Browser/storage mocks
│   └── setupTests.ts        # Vitest test setup
├── playwright.config.ts     # Playwright configuration (Desktop Chrome, 1280x720)
├── package.json             # Scripts and dependencies
└── README.md                # Human-facing quick-start and test commands
```

## Code conventions

1. **CSS class names** use the `ms-` prefix (e.g. `ms-btn`, `ms-modal-backdrop`). Keep related styles in `App.css` or `index.css`.
2. **TypeScript** is strict. Prefer explicit types over `any`.
3. **Components** are function components. Prefer local state for UI-only state and prop callbacks for state that must be shared.
4. **No obvious comments.** Do not add comments that merely narrate the code. Comments should explain non-obvious intent, trade-offs, or constraints.
5. **No binary blobs.** Never generate fake images, non-textual code, or extremely long hashes.
6. **Lint after edits.** Run `npm run lint` before considering any change complete.
7. **File naming:** Components are PascalCase (`KeybindingsPanel.tsx`), utilities are camelCase (`keybindings.ts`), tests are `*.test.ts` or `*.test.tsx`, e2e tests are `*.spec.ts`.

## Test-before-ship workflow

Every code change must be verified before it is considered complete. Prefer to run the full suite when possible; otherwise run the relevant subset.

| Command | What it covers |
| --- | --- |
| `npm run lint` | Static linting with oxlint. Run this after any code edit. |
| `npm test` | All Vitest tests (unit, component, integration, accessibility). |
| `npm run test:unit` | Vitest tests scoped to `tests/unit`, `tests/components`, `tests/accessibility`, `tests/integration`. |
| `npm run test:e2e` | Playwright end-to-end tests. Builds and previews the app automatically. |
| `npm run test:all` | Runs unit tests first, then e2e tests in CI mode. Use this as the final gate. |
| `npm run test:e2e:focus` | Runs only the shortcuts-related e2e tests for fast feedback. |
| `npm run test:e2e:ci` | Runs the full e2e suite exactly like GitHub Actions (`CI=true`). |
| `npm run test:e2e:ui` | Opens the Playwright UI for interactive debugging. |
| `npm run test:e2e:trace` | Opens the trace of the last failed shortcuts-panel run. |
| `npm run test:coverage` | Unit tests with coverage thresholds. |
| `npm run test:a11y` | Accessibility tests only. |
| `npm run test:perf` | Lighthouse CI performance audit (optional). |

### Required gate for any change

At minimum, run:

```bash
npm run lint
npm run test:unit
```

Before marking a task complete, run:

```bash
npm run test:all
```

If `test:all` fails, the change is not done.

## Common pitfalls

1. **Native `<dialog>` and `showModal()`**. The shortcuts panel (`KeybindingsPanel.tsx`) uses a native HTML `<dialog>` rendered via `showModal()` in a `useEffect`. The dialog lives in the browser's top layer. CSS for `.ms-modal-backdrop` must not fight the browser's native centering:
   - Do not set `width: 100vw; height: 100vh;` on the `<dialog>` element.
   - Use `box-sizing: border-box`, reset `margin: 0` and `border: none`.
   - Put the dimmed overlay on `::backdrop`, not on the dialog element itself.
   - CI uses headless Chromium at 1280×720; layout bugs that are invisible locally may surface there.

2. **Playwright hit-testing.** Playwright requires the target element's hit point to be inside the viewport. A button can be "visible, enabled, and stable" yet fail to click if a parent is transformed or the element is off-screen. Use `boundingBox()` assertions if you need to verify viewport placement.

3. **localStorage persistence.** `keybindings.ts` and `storage.ts` persist data to `localStorage`. Always sanitize inputs before parsing, and never store secrets or user-generated raw HTML.

4. **Device images and URLs.** The app can load device images and website screenshots. Treat all external URLs and file inputs as untrusted. Validate URLs, constrain sizes, and do not execute downloaded content.

5. **Mobile viewport.** The responsive breakpoint at 720px removes the icon rail and switches to a mobile dock. Test mobile flows at 390×844 when adding UI features.

## Security reminders

- No secrets, API keys, or credentials in source code.
- Validate and sanitize user-provided URLs and file names.
- Sanitize localStorage values before parsing JSON.
- Do not run or eval user-provided content.
- Prefer `textContent` / `setAttribute` over `dangerouslySetInnerHTML` or `innerHTML`.
- When in doubt, add a test that verifies the fix and prevents regression.

## What to do when asked to make a change

1. Read the relevant source and test files first.
2. Add or update tests that exercise the change and prevent regression.
3. Run the lint and the relevant test commands.
4. Run `npm run test:all` as the final gate.
5. Summarize what changed and why, and list the commands you ran.
