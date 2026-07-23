# Mockup Studio

React + TypeScript + Vite app for creating device mockups.

## Requirements

- Node.js (v18+)
- npm

## Setup

```bash
cd mockup_studio
npm install
```

## Run

Start the development server:

```bash
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Usage

1. Filter the device library by **Category**, then **Brand**, then optional **Product** (use **More…** for extra products in a popover), or search. Drag the library’s resize grip to change width. On smaller screens, open the library from the **hamburger** menu.
2. Click a device to place it on the **16:9 artboard** (1280×720 logical). Devices are sized from real-world **width × height in mm**.
3. Drag to position (snaps to center / middle / bottom). Use **Align** and **Arrange** on the toolbar (or **Tools** on phones).
4. Use the stage-corner **View** control (Fit / − / +) to zoom the artboard preview. Export size is unchanged.
5. Open **Export** for Format/Resolution; click **Download** (defaults PNG / Best).
6. Toggle **Light** / **Dark** in the top bar (shows the active mode).

## Keyboard shortcuts

Shortcuts adapt to your OS (**⌘** on macOS, **Ctrl** on Windows/Linux). Remaps are stored **per operating system** in the browser.

| Action | Default |
| --- | --- |
| Delete selected | `Delete` / `Backspace` |
| Deselect | `Esc` |
| Bring forward / Push backward | `]` / `[` |
| Bring to front / Send to back | `Mod+]` / `Mod+[` |
| Nudge | Arrow keys (`Shift` = 10px) |
| Duplicate | `Mod+D` |
| Download mockup | `Mod+S` |
| Shortcuts settings | `Mod+/` |

Open **Shortcuts** in the toolbar (or press `Mod+/`) to rebind keys for the current OS, or reset that profile to defaults.

## Device dimensions

Real-world body **width × height in mm** for every library asset (used for artboard scaling):

- Human-readable tables: [`DEVICE_DIMENSIONS.md`](DEVICE_DIMENSIONS.md)
- JSON catalog: [`src/data/device_dimensions.json`](src/data/device_dimensions.json)

Scale: `PX_PER_MM = 480/350` (~1.37), so a ~350 mm-wide laptop is ~480 px wide on the artboard.

Regenerate with:

```bash
python3 scripts/build_device_catalog.py --catalog-only
```

(Use without `--catalog-only` only if you need to re-apply filename normalization.)

## Other scripts

| Command | Description |
| --- | --- |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run Oxlint |
