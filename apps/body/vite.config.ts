import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  build: {
    rolldownOptions: {
      output: {
        // Keeps every chunk under the size warning and lets the browser cache the libraries apart from the app.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            { name: 'radix', test: /node_modules[\\/](radix-ui|@radix-ui|@floating-ui|vaul)[\\/]/ },
            { name: 'icons', test: /node_modules[\\/](lucide-react|@tabler)[\\/]/ },
            { name: 'data', test: /node_modules[\\/](@tanstack|@trpc|oidc-client-ts|react-oidc-context|zod)[\\/]/ }
          ]
        }
      }
    }
  }
})
