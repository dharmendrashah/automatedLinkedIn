import { type Proxy } from './types'

import { type HealthIssue, issueInfo } from './health'

// A button the card may offer. The first one is the suggested one; none of them is ever forced.
export type SuggestedAction =
   | { kind: 'use-instead'; target: Proxy }
   | { kind: 'replace' }
   | { kind: 'accept' }
   | { kind: 'undo-accept' }
   | { kind: 'test' }
   | { kind: 'edit' }

export type Suggestion = {
   text: string
   actions: SuggestedAction[]
}

const isUsable = (proxy: Proxy) => proxy.status === 'ACTIVE' || proxy.status === 'GEO_MISMATCH'

const list = (issues: HealthIssue[]) => issues.map(issue => issueInfo[issue].phrase).join(', ')

// The one line of advice under a proxy, and the buttons that go with it. It only suggests: a person can always keep
// using a proxy as it is.
export const suggest = (proxy: Proxy, siblings: Proxy[]): Suggestion => {
   const { level, open, issues } = proxy.health

   switch (level) {
      case 'HEALTHY':
         return {
            text: proxy.isBest ? 'Healthy and in use. Nothing to do.' : 'Healthy and ready as a backup. Nothing to do.',
            actions: [],
         }
      case 'CHECKING':
         return {
            text: 'Checking this proxy now. This takes a few seconds.',
            actions: [],
         }
      case 'PAUSED':
         return {
            text: 'Paused. It is not being used.',
            actions: [],
         }
      case 'ACCEPTED':
         return {
            text: `You chose to keep using it, even though ${list(issues)}. We will tell you if something new comes up.`,
            actions: [{ kind: 'undo-accept' }],
         }
      default:
   }

   if (open.includes('NOT_RESPONDING')) {
      const covered = siblings.some(sibling => sibling.isBest)

      return {
         text: `We cannot connect through it${covered ? ', so another proxy is being used instead' : ''}. Test it again. If it still does not answer, check its address, port and password, or replace it.`,
         actions: [{ kind: 'test' }, { kind: 'edit' }, { kind: 'replace' }],
      }
   }

   const better = siblings
      .filter(sibling => sibling.id !== proxy.id && isUsable(sibling) && sibling.health.level === 'HEALTHY')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
   const covered = !proxy.isBest && siblings.some(sibling => sibling.isBest)

   if (covered) {
      return {
         text:
            level === 'RISK'
               ? 'Not being used right now: a better proxy covers this account, so this is not urgent. Replace it when you can.'
               : 'Not being used right now: a better proxy covers this account. Nothing urgent.',
         actions: [{ kind: 'replace' }, { kind: 'accept' }],
      }
   }

   return {
      text:
         level === 'RISK'
            ? 'We suggest swapping it. You can still keep using it, at your own risk.'
            : 'You can keep using it. If you would like to be safer, swap it.',
      actions: better
         ? [{ kind: 'use-instead', target: better }, { kind: 'replace' }, { kind: 'accept' }]
         : [{ kind: 'replace' }, { kind: 'accept' }],
   }
}
