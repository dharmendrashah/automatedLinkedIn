import { CampaignRollupService } from 'database'

import { defineJob } from './defineJob'

// Keeps what each campaign did in each of the last days (.plan/lead-pipeline-p5-campaign-page.md). Idle passes (no campaign) write nothing.
export const campaignRollup = defineJob({
   name: 'campaign-rollup',
   title: 'Campaign numbers',
   purpose:
      'Keeps the daily numbers of each campaign (found, invited, accepted, drafts) so the campaign page stays fast and keeps its history.',
   everyMs: 60 * 60 * 1000,
   startAfterMs: 120_000,
   timeoutMs: 10 * 60 * 1000,
   run: async () => {
      const { campaigns, written } = await CampaignRollupService.run()

      return campaigns === 0
         ? undefined
         : {
              counts: {
                 campaigns,
                 written,
              },
           }
   },
})
