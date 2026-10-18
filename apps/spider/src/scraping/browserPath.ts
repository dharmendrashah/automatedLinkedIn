import { launchOptions } from 'camoufox'

// The browser Camoufox starts, found the way it finds it itself (the active install, or the one named by its own settings).
export const browserExecutablePath = async () => {
   const { executablePath } = await launchOptions({ headless: true })

   return String(executablePath)
}
