import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import type { CampaignInsights, CampaignProjection } from '@automatedLinkedIn/contracts'

import { projectionBasis, projectionNote } from './campaign-insights'
import { rangeLabel } from './campaign-list-format'

const Dash = () => <span className="text-muted-foreground">—</span>

export const ProjectionValue = ({
   projection,
   gate,
}: {
   projection: CampaignProjection | null
   gate: CampaignInsights['gate']
}) => {
   if (!projection) return <Dash />
   if (projection.status === 'hidden') {
      return <span className="text-muted-foreground text-xs">{projectionNote(projection, gate)}</span>
   }
   return (
      <Tooltip>
         <TooltipTrigger className="cursor-help font-medium tabular-nums underline decoration-dotted underline-offset-4">
            {rangeLabel(projection.next30)} invites
         </TooltipTrigger>
         <TooltipContent className="max-w-xs">{projectionBasis(projection.basis)}</TooltipContent>
      </Tooltip>
   )
}
