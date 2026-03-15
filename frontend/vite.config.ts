import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev-time proxy: forwards API calls to the local backend
    proxy: {
      '/users':    process.env.VITE_API_URL ?? 'http://localhost:3000',
      '/tasks':    process.env.VITE_API_URL ?? 'http://localhost:3000',
      '/statuses': process.env.VITE_API_URL ?? 'http://localhost:3000',
    }
  }
})
