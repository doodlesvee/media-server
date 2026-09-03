import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Listen on all interfaces — required for the dev-mode Docker Compose
    // override (docker/docker-compose.dev.yml), where Vite runs inside a
    // container and needs to accept connections proxied from the host.
    host: true,
    proxy: {
      // PROXY_TARGET lets docker-compose.dev.yml point this at the app
      // service by container name (http://app:3000) instead of localhost,
      // since "localhost" inside a container means the container itself.
      '/api': process.env.PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
})
