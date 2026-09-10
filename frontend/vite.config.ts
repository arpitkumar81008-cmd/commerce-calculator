import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all network interfaces (needed for LAN/tunnel access)
    allowedHosts: true, // accept requests for any hostname (needed for tunnel URLs like *.trycloudflare.com)
    proxy: {
      // Forward /api/* to the backend so only one tunnel is needed to expose
      // the whole app. Backend routes already live under /api/*, so this is
      // passed through unchanged.
      '/api': 'http://localhost:3001',
    },
  },
})
