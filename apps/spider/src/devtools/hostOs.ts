import { type FingerprintOs } from '../scraping/camoufoxDriver'

const BY_PLATFORM: Record<string, FingerprintOs> = {
   darwin: 'macos',
   win32: 'windows',
}

// The OS this machine really is: Camoufox draws on the system fonts there, so the browser must claim the same one.
export const hostOs = (): FingerprintOs => BY_PLATFORM[process.platform] ?? 'linux'
