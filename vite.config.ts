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
      // Local API functions run under `npm run dev:vercel` on port 3000.
      '/api': 'http://localhost:3000',
    },
  },
})
