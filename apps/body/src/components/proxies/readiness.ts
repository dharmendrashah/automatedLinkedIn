import { type Proxy } from './types'

import { type Tone } from '../../lib/tone'

export type Readiness = {
   tone: Tone
   label: string
   text: string
   // A gentle extra suggestion, never a warning.
   note?: string
}

// How one LinkedIn account is doing overall, from its proxies: can it run, through which proxy, and how safely.
export const readinessOf = (proxies: Proxy[]): Readiness => {
   if (proxies.length === 0) {
      return {
         tone: 'warning',
         label: 'No proxy yet',
         text: 'LinkedIn is only ever opened through a proxy, so this account cannot run until it has one.',
      }
   }

   const inUse = proxies.find(proxy => proxy.isBest)

   if (!inUse) {
      const checking = proxies.some(proxy => proxy.health.level === 'CHECKING')

      return checking
         ? {
              tone: 'info',
              label: 'Checking',
              text: 'We are testing its proxy now.',
           }
         : {
              tone: 'danger',
              label: 'No working proxy',
              text: 'None of its proxies respond, so this account cannot run. Test them again or add a new one.',
           }
   }

   const where = `${inUse.host}:${inUse.port}`

   switch (inUse.health.level) {
      case 'HEALTHY':
         return {
            tone: 'success',
            label: 'Ready',
            text: `LinkedIn will be opened through ${where}.`,
            ...(proxies.length === 1 && {
               note: 'Add a backup proxy, so the account has a fallback if this one fails.',
            }),
         }
      case 'RISK':
         return {
            tone: 'danger',
            label: 'At risk',
            text: `LinkedIn will be opened through ${where}, which has a serious problem.`,
         }
      case 'CHECKING':
         return {
            tone: 'info',
            label: 'Checking',
            text: `We are testing ${where} now.`,
         }
      default:
         return {
            tone: 'warning',
            label: 'Works, could be safer',
            text: `LinkedIn will be opened through ${where}. It works, but could be safer.`,
         }
   }
}
