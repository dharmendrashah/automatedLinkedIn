import { Button } from '@/components/ui/button'
import { Link } from 'react-router'

import type { CampaignInsights } from '@automatedLinkedIn/contracts'

import { listStripCounts } from './campaign-insights'

export const CampaignListsStrip = ({
   lists,
   campaignLabel,
}: {
   lists: CampaignInsights['lists']
   campaignLabel: string
}) => (
   <section className="grid gap-3 rounded-xl border px-4 py-3">
      <h3 className="text-sm font-medium">Lists for this campaign, all time</h3>
      <div className="grid grid-cols-3 gap-4">
         {listStripCounts(lists, campaignLabel).map(item => (
            <div key={item.label} className="grid justify-items-start gap-2">
               <span className="text-muted-foreground text-sm">{item.label}</span>
               <span className="text-2xl font-semibold tabular-nums">{item.value}</span>
               <Button asChild size="sm" variant="outline">
                  <Link to={item.to}>{`Open ${item.label.toLowerCase()}`}</Link>
               </Button>
            </div>
         ))}
      </div>
   </section>
)
