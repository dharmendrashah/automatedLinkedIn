import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { type Plugin, defineConfig } from 'vite'

// `public/messages.json` is real people's messages that the owner drops in to try the Unibox. It is served by the dev server and must
// never reach a build, whose files anyone who opens the site can read.
const withoutMessagesFile = (): Plugin => {
   let outDir = 'dist'

   return {
      name: 'without-messages-file',
      apply: 'build',
      configResolved: config => {
         outDir = path.resolve(config.root, config.build.outDir)
      },
      closeBundle: () => rmSync(path.join(outDir, 'messages.json'), { force: true }),
   }
}

// https://vite.dev/config/
export default defineConfig({
   plugins: [react(), tailwindcss(), withoutMessagesFile()],
   resolve: {
      alias: {
         '@': path.resolve(import.meta.dirname, 'src'),
      },
   },
   server: {
      port: 3000,
      host: '0.0.0.0',
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
                  { name: 'data', test: /node_modules[\\/](@tanstack|@trpc|oidc-client-ts|react-oidc-context)[\\/]/ },
                  { name: 'schemas', test: /node_modules[\\/]zod[\\/]/ },
                  { name: 'dates', test: /node_modules[\\/](date-fns|react-day-picker)[\\/]/ },
               ],
            },
         },
      },
   },
})
