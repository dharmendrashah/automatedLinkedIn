import { CampaignListItem } from '@/components/campaigns/campaign-list-item'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { readableError } from '@/lib/trpc-error'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { CAMPAIGN_LIMITS } from '@automatedLinkedIn/contracts'

import { trpc } from '../trpc'

// The campaigns of the owner (.plan/lead-pipeline-p5-campaign-page.md): a name, the workflows in it, and the page of each.
export const Campaigns = () => {
   const utils = trpc.useUtils()
   const navigate = useNavigate()
   const list = trpc.campaign.list.useQuery(undefined, { retry: false })
   const [name, setName] = useState<string | null>(null)
   const create = trpc.campaign.create.useMutation({
      onSuccess: async made => {
         await utils.campaign.list.invalidate()
         setName(null)
         void navigate(`/campaigns/${made.id}`)
      },
   })
   const campaigns = list.data ?? []

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
                     Outreach campaign
                  </Link>
               </Button>
               <Button variant="outline" onClick={() => setName('')}>
                  Empty campaign
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
                  Qualified, invited, accepted and replied cover the last 14 complete days. Next 30 days is a projection
                  and shows once a campaign has enough history.
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
                           <TableHead>Next 30 days</TableHead>
                           <TableHead>Made</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {campaigns.map(campaign => (
                           <CampaignListItem key={campaign.id} campaign={campaign} />
                        ))}
                     </TableBody>
                  </Table>
               </div>
            </>
         ) : null}

         <Dialog open={name !== null} onOpenChange={open => (open ? undefined : setName(null))}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>New campaign</DialogTitle>
                  <DialogDescription>
                     Its people get a label made from the name. Deleting the campaign later keeps the workflows and the
                     people.
                  </DialogDescription>
               </DialogHeader>
               <Input
                  aria-label="Campaign name"
                  maxLength={CAMPAIGN_LIMITS.nameMax}
                  value={name ?? ''}
                  onChange={event => setName(event.target.value)}
               />
               {create.error ? <p className="text-destructive text-sm">{readableError(create.error)}</p> : null}
               <DialogFooter>
                  <Button variant="outline" onClick={() => setName(null)}>
                     Cancel
                  </Button>
                  <Button
                     disabled={(name ?? '').trim() === '' || create.isPending}
                     onClick={() => create.mutate({ name: name ?? '' })}
                  >
                     Create
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   )
}
