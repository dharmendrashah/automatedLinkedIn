import { describe, expect, it } from 'vitest'

import { campaignOfReply, slugOfProfileUrl } from './positiveReplyRules'

describe('campaignOfReply', () => {
   it('takes the campaign of the newest invite first', () => {
      expect(
         campaignOfReply({
            inviteCampaignId: 'a',
            labelCampaignIds: ['b'],
         })
      ).toBe('a')
   })

   it('takes the one campaign whose label the person carries when there is no invite', () => {
      expect(
         campaignOfReply({
            inviteCampaignId: null,
            labelCampaignIds: ['b', 'b'],
         })
      ).toBe('b')
   })

   it('is none when it is unclear or there is nothing, so nothing is counted for the wrong campaign', () => {
      expect(
         campaignOfReply({
            inviteCampaignId: null,
            labelCampaignIds: ['a', 'b'],
         })
      ).toBeNull()
      expect(
         campaignOfReply({
            inviteCampaignId: null,
            labelCampaignIds: [],
         })
      ).toBeNull()
   })
})

describe('slugOfProfileUrl', () => {
   it('reads the slug after /in/ and nothing from other addresses', () => {
      expect(slugOfProfileUrl('https://www.linkedin.com/in/ada-l/')).toBe('ada-l')
      expect(slugOfProfileUrl('https://www.linkedin.com/in/ada-l?x=1')).toBe('ada-l')
      expect(slugOfProfileUrl(null)).toBeNull()
      expect(slugOfProfileUrl('https://example.com/ada')).toBeNull()
   })
})
