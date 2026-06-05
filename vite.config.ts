import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true, // expose on LAN so a phone / Telegram can reach the dev server
    port: 5173,
    proxy: {
      // Local API functions run on port 3000 — use `npm run dev:api` (robust local
      // server, recommended on Windows) or `npm run dev:vercel`.
      '/api': 'http://localhost:3000',
    },
  },
})
