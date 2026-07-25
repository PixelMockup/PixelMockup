import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { websiteCapturePlugin } from './scripts/websiteCapturePlugin.js';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), websiteCapturePlugin()],
});
