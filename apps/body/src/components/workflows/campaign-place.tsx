import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { CAMPAIGN_LIMITS, CAMPAIGN_STAGES, type CampaignStage, STAGE_LABELS } from '@automatedLinkedIn/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'

const NONE = 'none'

// Where a workflow sits: its campaign and its stage. Saved at once, so it needs no Save button.
export const CampaignPlace = ({
   workflowId,
   campaignId,
   stage,
}: {
   workflowId: string
   campaignId: string | null
   stage: CampaignStage
}) => {
   const utils = trpc.useUtils()
   const campaigns = trpc.campaign.list.useQuery(undefined, { retry: false })
   const [name, setName] = useState('')
   const [making, setMaking] = useState(false)
   const refresh = async () => {
      await Promise.all([utils.workflow.get.invalidate({ id: workflowId }), utils.campaign.list.invalidate()])
   }
   const place = trpc.campaign.place.useMutation({
      onSuccess: refresh,
      onError: error => toast.error(readableError(error)),
   })
   const create = trpc.campaign.create.useMutation({
      onSuccess: async made => {
         setMaking(false)
         setName('')
         place.mutate({
            workflowId,
            campaignId: made.id,
            stage,
         })
      },
      onError: error => toast.error(readableError(error)),
   })

   return (
      <div className="grid gap-3 sm:grid-cols-2">
         <div className="grid gap-2">
            <Label htmlFor="workflow-campaign">Campaign</Label>
            <Select
               value={campaignId ?? NONE}
               onValueChange={next =>
                  place.mutate({
                     workflowId,
                     campaignId: next === NONE ? null : next,
                     stage,
                  })
               }
            >
               <SelectTrigger id="workflow-campaign" className="w-full">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {(campaigns.data ?? []).map(each => (
                     <SelectItem key={each.id} value={each.id}>
                        {each.name}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">Group workflows to see them together.</p>
            {making ? (
               <div className="flex items-center gap-2">
                  <Input
                     aria-label="New campaign name"
                     maxLength={CAMPAIGN_LIMITS.nameMax}
                     value={name}
                     onChange={event => setName(event.target.value)}
                  />
                  <Button
                     type="button"
                     size="sm"
                     disabled={name.trim() === '' || create.isPending}
                     onClick={() => create.mutate({ name })}
                  >
                     Create
                  </Button>
               </div>
            ) : (
               <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setMaking(true)}>
                  + New campaign
               </Button>
            )}
         </div>
         <div className="grid gap-2">
            <Label htmlFor="workflow-stage">Stage</Label>
            <Select
               value={stage}
               onValueChange={next =>
                  place.mutate({
                     workflowId,
                     campaignId,
                     stage: next as CampaignStage,
                  })
               }
            >
               <SelectTrigger id="workflow-stage" className="w-full">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {CAMPAIGN_STAGES.map(each => (
                     <SelectItem key={each} value={each}>
                        {STAGE_LABELS[each]}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">Where this workflow sits in the campaign.</p>
         </div>
      </div>
   )
}
