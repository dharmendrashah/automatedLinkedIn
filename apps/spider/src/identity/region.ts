import { type DeviceIdentity } from './deviceIdentity'

// Where a proxy's traffic leaves, as the exit address says.
export type ExitRegion = {
   ip: string
   country: string
   locale: string
   timezone: string
}

export type KeptRegion = Pick<ExitRegion, 'country' | 'locale' | 'timezone'>

// What the account's language, timezone and country must be for this run, or nothing when they already are. All three follow
// the exit address, since the address is where the machine appears to be. The language is the main one of the country
// (`lookupExit`), the same every time, so it needs no memory of its own; and a language stored from the days when it was drawn
// at random (German or Spanish for a US address) is corrected by the next run instead of living on for ever.
export const regionToKeep = (device: DeviceIdentity, exit: ExitRegion): KeptRegion | undefined => {
   const wanted = {
      country: exit.country,
      locale: exit.locale,
      timezone: exit.timezone,
   }

   const unchanged =
      device.country === wanted.country && device.locale === wanted.locale && device.timezone === wanted.timezone

   return unchanged ? undefined : wanted
}
