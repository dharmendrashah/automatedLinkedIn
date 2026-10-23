import { type MessagesFileShape, parseMessagesFile } from './fromContract'

// The real messages file, `public/messages.json`, which the owner drops in to see the page with real conversations. It is read only by
// the development server (`import.meta.env.DEV` is false in a build, so the request is left out), and the build deletes the file from
// `dist` (vite.config.ts): the app's files are served to anyone who can open the site, so real people's messages must never ship.
export const loadRealSample = async (): Promise<MessagesFileShape | undefined> => {
   if (!import.meta.env.DEV) {
      return undefined
   }

   const response = await fetch('/messages.json')

   return response.ok ? parseMessagesFile(await response.json()) : undefined
}
