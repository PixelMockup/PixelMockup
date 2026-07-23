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

1. Filter the device library by category chips or search.
2. Click a device to place it on the canvas. Devices use realistic relative sizes (watches smaller than phones, then tablets, computers, displays).
3. Drag to position; use **Bring Forward** / **Push Backward** for layer order; **Delete** removes the selection.
4. Choose **Format** (PNG or JPG) and **Resolution** (Best / 1440p / 1080p / 720p), then **Download Mockup**.
   - Export is cropped to the devices on the canvas (plus a little padding), not the full tall panel.
   - **Best** uses native asset resolution (longest edge capped at 8192px). Lower presets fit the longest edge to 2560 / 1920 / 1280 and never upscale past Best.
   - PNG keeps transparency; JPG uses a white background.

## Other scripts

| Command | Description |
| --- | --- |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run Oxlint |
