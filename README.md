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
4. **Download Mockup** exports a high-resolution PNG that matches the visible canvas layout and stacking order. Export draws from native asset pixels (not the on-screen preview size), capped at an 8192px longest edge.

## Other scripts

| Command | Description |
| --- | --- |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run Oxlint |
