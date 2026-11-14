import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { timeAgo } from '@/lib/time-ago'
import { Megaphone, Plus } from 'lucide-react'
import { Link } from 'react-router'

import type { CampaignListRow } from '@automatedLinkedIn/contracts'

import { STATE_META, acceptLabel } from './campaign-list-format'
import { formatPipelineUsd } from './pipeline-format'
import { ProjectionValue } from './projection-value'

const Dash = () => <span className="text-muted-foreground">—</span>

type Pipeline = { replies: number; pipelineUsd: number | null }

export const CampaignListItem = ({ campaign, pipeline }: { campaign: CampaignListRow; pipeline?: Pipeline }) => {
   const meta = STATE_META[campaign.state]
   const StateIcon = meta.icon
   const numbers = campaign.numbers
   const workflows = `${campaign.workflows} workflow${campaign.workflows === 1 ? '' : 's'}`

   return (
      <TableRow>
         <TableCell>
            <div className="flex items-center gap-2">
               <Megaphone aria-hidden className="text-muted-foreground size-4 shrink-0" />
               <div className="grid min-w-0">
                  <Link
                     className="max-w-64 truncate font-medium underline-offset-4 hover:underline"
                     title={campaign.name}
                     to={`/campaigns/${campaign.id}`}
                  >
                     {campaign.name}
                  </Link>
                  <span className="text-muted-foreground text-xs">{workflows}</span>
               </div>
            </div>
         </TableCell>
         <TableCell>
            <span className={`inline-flex items-center gap-1.5 ${meta.className}`}>
               <StateIcon aria-hidden className="size-4" />
               {meta.label}
            </span>
         </TableCell>
         {campaign.state === 'NO_WORKFLOWS' ? (
            <TableCell colSpan={6}>
               <Button asChild size="sm" variant="outline">
                  <Link to="/workflows/new">
                     <Plus />
                     Add a workflow
                  </Link>
               </Button>
            </TableCell>
         ) : (
            <>
               <TableCell className="tabular-nums">{numbers ? numbers.qualified : <Dash />}</TableCell>
               <TableCell className="tabular-nums">{numbers ? numbers.invited : <Dash />}</TableCell>
               <TableCell className="tabular-nums">{numbers ? acceptLabel(numbers.acceptRate) : <Dash />}</TableCell>
               <TableCell className="tabular-nums">{numbers ? numbers.replied : <Dash />}</TableCell>
               <TableCell>
                  {pipeline && pipeline.replies > 0 ? (
                     <div className="grid">
                        {pipeline.pipelineUsd === null ? (
                           <span className="text-muted-foreground text-xs">Set a worth</span>
                        ) : (
                           <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                              {formatPipelineUsd(pipeline.pipelineUsd)}
                           </span>
                        )}
                        <span className="text-muted-foreground text-xs tabular-nums">{`${pipeline.replies} positive`}</span>
                     </div>
                  ) : (
                     <Dash />
                  )}
               </TableCell>
               <TableCell>
                  <ProjectionValue projection={campaign.projection} gate={campaign.gate} />
               </TableCell>
            </>
         )}
         <TableCell>{timeAgo(campaign.createdAt)}</TableCell>
      </TableRow>
   )
}
