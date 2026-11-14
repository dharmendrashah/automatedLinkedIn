import { describe, expect, it } from 'vitest'

import { positiveAction } from './positive-action'

const a = {
   id: 'a',
   name: 'A',
}
const b = {
   id: 'b',
   name: 'B',
}

describe('positiveAction', () => {
   it('should mark for the suggested campaign, or the only one, in one press', () => {
      expect(positiveAction({ campaigns: [a, b], counted: new Set(), suggestedCampaignId: 'b' })).toEqual({
         kind: 'mark',
         campaignId: 'b',
      })
      expect(positiveAction({ campaigns: [a], counted: new Set(), suggestedCampaignId: null })).toEqual({
         kind: 'mark',
         campaignId: 'a',
      })
   })

   it('should mark for no campaign when there is none, and ask when there are several and none is suggested', () => {
      expect(positiveAction({ campaigns: [], counted: new Set(), suggestedCampaignId: null })).toEqual({
         kind: 'mark',
         campaignId: null,
      })
      expect(positiveAction({ campaigns: [a, b], counted: new Set(), suggestedCampaignId: null })).toEqual({
         kind: 'choose',
      })
      expect(positiveAction({ campaigns: [a], counted: new Set(), suggestedCampaignId: 'gone' })).toEqual({
         kind: 'mark',
         campaignId: 'a',
      })
   })

   it('should remove the one it is counted in, and ask when it is counted in several', () => {
      expect(positiveAction({ campaigns: [a, b], counted: new Set(['a']), suggestedCampaignId: 'b' })).toEqual({
         kind: 'unmark',
         campaignId: 'a',
      })
      expect(positiveAction({ campaigns: [a], counted: new Set([null]), suggestedCampaignId: null })).toEqual({
         kind: 'unmark',
         campaignId: null,
      })
      expect(positiveAction({ campaigns: [a, b], counted: new Set(['a', 'b']), suggestedCampaignId: null })).toEqual({
         kind: 'choose',
      })
   })
})
