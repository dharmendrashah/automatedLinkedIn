import { type FingerprintOs, newFingerprint } from '../scraping/camoufoxDriver'
import { type DeviceIdentity } from './deviceIdentity'

// Windows on the worker, whose image bundles the Windows fonts so they match what the page is told. A desktop run asks for
// its own system instead, since it draws on the real fonts of the machine.
export const createDeviceIdentity = (os: FingerprintOs = 'windows', now: () => number = Date.now): DeviceIdentity => ({
   version: 1,
   os,
   fingerprint: newFingerprint([os]),
   createdAt: new Date(now()).toISOString(),
})
