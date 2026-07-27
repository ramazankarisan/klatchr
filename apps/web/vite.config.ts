import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Server URL is read from VITE_WS_URL by the socket transport (a later cycle);
// this cycle runs entirely on the in-browser mock engine.
export default defineConfig({
  plugins: [react()],
});
