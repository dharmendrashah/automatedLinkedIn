import { launchOptions } from 'camoufox'

import { buildCamoufoxOptions, newFingerprint } from '../scraping/camoufoxDriver'

type Resolved = { env?: Record<string, string | undefined> }
type Resolve = (options: Record<string, unknown>) => Promise<Resolved>

const resolveLaunch: Resolve = probe => launchOptions(probe as Parameters<typeof launchOptions>[0])

// The config Camoufox hands the browser, split over numbered variables.
const claimedFonts = ({ env = {} }: Resolved) => {
   const text = Object.entries(env)
      .filter(([key]) => key.startsWith('CAMOU_CONFIG_'))
      .map(([key, value]) => [Number.parseInt(key.slice(key.lastIndexOf('_') + 1), 10), value ?? ''] as const)
      .sort(([first], [second]) => first - second)
      .map(([, value]) => value)
      .join('')
   const { fonts } = JSON.parse(text || '{}') as { fonts?: unknown }

   return Array.isArray(fonts) ? fonts.filter((font): font is string => typeof font === 'string') : []
}

// The fonts the identity claims, plus `extra`. Once a list is given Camoufox does not draw its own, so the claimed list is
// drawn first (without the proxy lookup, which would only repeat the network call) and given back with the additions.
export const withUiFonts = async <T extends object>(
   options: T,
   extra: string[],
   resolve: Resolve = resolveLaunch
): Promise<T> => {
   if (extra.length === 0) {
      return options
   }

   const { proxy: _proxy, geoip: _geoip, ...probe } = options as Record<string, unknown>
   const claimed = claimedFonts(await resolve(probe))

   return {
      ...options,
      fonts: [...new Set([...claimed, ...extra])],
   }
}

// The fonts a browser claiming this machine's own OS lists, which include the ones its window bars and menus are drawn with
// (the system font among them). Camoufox lists only the fonts of the claimed device, so a Windows device on a Mac loses them
// and the bars turn into broken glyphs. Nothing on other systems.
export const hostFontsFor = async (platform: string, resolve: Resolve = resolveLaunch) =>
   platform === 'darwin'
      ? claimedFonts(await resolve(buildCamoufoxOptions(false, undefined, newFingerprint(['macos']))))
      : []

let hostFonts: Promise<string[]> | undefined

export const withHostUiFonts = async <T extends object>(options: T) => {
   hostFonts ??= hostFontsFor(process.platform)

   return withUiFonts(options, await hostFonts)
}
