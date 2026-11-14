import { CampaignListItem } from '@/components/campaigns/campaign-list-item'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { trpc } from '../trpc'

// The campaigns of the owner (.plan/lead-pipeline-p5-campaign-page.md): a name, the workflows in it, and the page of each.
export const Campaigns = () => {
   const list = trpc.campaign.list.useQuery(undefined, { retry: false })
   const campaigns = list.data ?? []
   const pipeline = trpc.positiveReply.pipeline.useQuery(undefined, { retry: false })
   const pipelineOf = new Map((pipeline.data?.campaigns ?? []).map(row => [row.id, row]))

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Campaigns</h2>
               <p className="text-muted-foreground text-sm">
                  Group the workflows that work one goal together and see what they did in one place.
               </p>
            </div>
            <div className="flex flex-wrap gap-2">
               <Button asChild>
                  <Link to="/campaigns/new">
                     <Plus />
                     Create campaign
                  </Link>
               </Button>
            </div>
         </div>

         {list.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
         {list.error ? <p className="text-destructive text-sm">{list.error.message}</p> : null}
         {list.data && campaigns.length === 0 ? (
            <p className="text-muted-foreground text-sm">
               No campaign yet. Make one, then put workflows in it from their settings.
            </p>
         ) : null}

         {campaigns.length > 0 ? (
            <>
               <p className="text-muted-foreground text-xs">
                  Qualified, invited, accepted and replied cover the last 14 complete days. Pipeline is every positive
                  reply so far times its monthly worth times 12. Next 30 days is a projection and shows once a campaign
                  has enough history.
               </p>
               <div className="overflow-x-auto rounded-lg border">
                  <Table>
                     <TableHeader className="bg-muted/50">
                        <TableRow>
                           <TableHead>Campaign</TableHead>
                           <TableHead>State</TableHead>
                           <TableHead>Qualified</TableHead>
                           <TableHead>Invited</TableHead>
                           <TableHead>Accepted</TableHead>
                           <TableHead>Replied</TableHead>
                           <TableHead>Pipeline</TableHead>
                           <TableHead>Next 30 days</TableHead>
                           <TableHead>Made</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {campaigns.map(campaign => (
                           <CampaignListItem
                              key={campaign.id}
                              campaign={campaign}
                              pipeline={pipelineOf.get(campaign.id)}
                           />
                        ))}
                     </TableBody>
                  </Table>
               </div>
            </>
         ) : null}
      </div>
   )
}
