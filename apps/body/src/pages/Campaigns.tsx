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
import { ArrowLeft, FolderPlus, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { CAMPAIGN_LIMITS } from '@automatedLinkedIn/contracts'

import { trpc } from '../trpc'

type CreateStep = 'choice' | 'name'

const CHOICE_CLASS =
   'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
const ICON_CHIP = 'flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-4'

// The campaigns of the owner (.plan/lead-pipeline-p5-campaign-page.md): a name, the workflows in it, and the page of each.
export const Campaigns = () => {
   const utils = trpc.useUtils()
   const navigate = useNavigate()
   const list = trpc.campaign.list.useQuery(undefined, { retry: false })
   const [step, setStep] = useState<CreateStep | null>(null)
   const [name, setName] = useState('')
   const closeDialog = () => {
      setStep(null)
      setName('')
   }
   const create = trpc.campaign.create.useMutation({
      onSuccess: async made => {
         await utils.campaign.list.invalidate()
         closeDialog()
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
               <Button onClick={() => setStep('choice')}>
                  <Plus />
                  Create campaign
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

         <Dialog open={step !== null} onOpenChange={open => (open ? undefined : closeDialog())}>
            <DialogContent>
               {step === 'choice' ? (
                  <>
                     <DialogHeader>
                        <DialogTitle>Create campaign</DialogTitle>
                        <DialogDescription>Choose how to start. You can change the workflows later.</DialogDescription>
                     </DialogHeader>
                     <div className="grid gap-3">
                        <Link
                           to="/campaigns/new"
                           onClick={closeDialog}
                           aria-describedby="campaign-outreach-desc"
                           className={CHOICE_CLASS}
                        >
                           <span className={`${ICON_CHIP} bg-blue-500/10 text-blue-600 dark:text-blue-400`}>
                              <Sparkles aria-hidden />
                           </span>
                           <span className="grid gap-1">
                              <span className="font-medium">Outreach campaign</span>
                              <span id="campaign-outreach-desc" className="text-muted-foreground text-sm">
                                 Answer a few questions. We build six workflows for you, all switched off.
                              </span>
                           </span>
                        </Link>
                        <button
                           type="button"
                           aria-describedby="campaign-empty-desc"
                           className={CHOICE_CLASS}
                           onClick={() => setStep('name')}
                        >
                           <span className={`${ICON_CHIP} bg-violet-500/10 text-violet-600 dark:text-violet-400`}>
                              <FolderPlus aria-hidden />
                           </span>
                           <span className="grid gap-1">
                              <span className="font-medium">Without campaign</span>
                              <span id="campaign-empty-desc" className="text-muted-foreground text-sm">
                                 An empty campaign. Add your own workflows to it later.
                              </span>
                           </span>
                        </button>
                     </div>
                  </>
               ) : null}
               {step === 'name' ? (
                  <>
                     <DialogHeader>
                        <DialogTitle>New campaign</DialogTitle>
                        <DialogDescription>
                           Its people get a label made from the name. Deleting the campaign later keeps the workflows and
                           the people.
                        </DialogDescription>
                     </DialogHeader>
                     <Input
                        aria-label="Campaign name"
                        maxLength={CAMPAIGN_LIMITS.nameMax}
                        value={name}
                        onChange={event => setName(event.target.value)}
                     />
                     {create.error ? <p className="text-destructive text-sm">{readableError(create.error)}</p> : null}
                     <DialogFooter>
                        <Button
                           variant="outline"
                           onClick={() => {
                              create.reset()
                              setStep('choice')
                           }}
                        >
                           <ArrowLeft />
                           Back
                        </Button>
                        <Button
                           disabled={name.trim() === '' || create.isPending}
                           onClick={() => create.mutate({ name })}
                        >
                           Create
                        </Button>
                     </DialogFooter>
                  </>
               ) : null}
            </DialogContent>
         </Dialog>
      </div>
   )
}
