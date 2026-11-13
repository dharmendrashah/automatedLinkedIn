import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ListChecks } from 'lucide-react'
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
   <Card>
      <CardHeader>
         <CardTitle className="flex items-center gap-2">
            <ListChecks aria-hidden className="size-4" />
            Lists for this campaign
         </CardTitle>
         <CardDescription>All time.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
         {listStripCounts(lists, campaignLabel).map(item => (
            <div key={item.label} className="bg-muted/40 grid gap-2 rounded-lg border p-4">
               <span className="text-muted-foreground text-sm">{item.label}</span>
               <span className="text-2xl font-semibold tabular-nums">{item.value}</span>
               <Button asChild size="sm" variant="outline" className="justify-self-start">
                  <Link to={item.to}>{`Open ${item.label.toLowerCase()}`}</Link>
               </Button>
            </div>
         ))}
      </CardContent>
   </Card>
)
