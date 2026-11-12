import { defineConfig } from 'vite';

// Reachable from other devices and tunnels: listen on every network interface and accept any
// host name (your LAN IP, an ngrok address...), which Vite blocks by default.
const network = { host: true, allowedHosts: true as const };

export default defineConfig({
  server: { port: 5173, ...network },
  preview: { port: 4173, ...network },
  // One bundle (three.js + game) is fine for a local app; skip the size warning.
  build: { chunkSizeWarningLimit: 1500 },
});
