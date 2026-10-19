import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The server URL is read from VITE_WS_URL by the socket transport;
// without VITE_WS_URL the app runs on the in-browser mock engine (pnpm dev).
export default defineConfig({
  plugins: [react()],
});
