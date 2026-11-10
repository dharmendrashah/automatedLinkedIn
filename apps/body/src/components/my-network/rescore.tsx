import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { timeAgo } from '@/lib/time-ago'
import { readableError } from '@/lib/trpc-error'
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'

// What the page keeps of a person's score against an ideal customer (.plan/rescore-person.md).
export type ScoreView = {
   id: string
   icpScore: number | null
   icpScoreIcpName: string | null
   icpScoredAt: Date | string | null
   icpScoreWaitingFor: string | null
}

// Picks an ideal customer and scores the person against it. A scored person shows the score and a Rescore button.
export const RescoreControl = ({ person }: { person: ScoreView }) => {
   const icps = trpc.icp.list.useQuery(undefined, { retry: false })
   const utils = trpc.useUtils()
   const [icpId, setIcpId] = useState('')
   const rescore = trpc.people.rescore.useMutation({
      onSuccess: result => {
         void utils.people.get.invalidate({ id: person.id })
         void utils.people.list.invalidate()
         toast.success(
            result.state === 'READING'
               ? 'Reading the profile. The score comes when it is in.'
               : `Scored ${result.score} of 100 for ${result.icpName}.`
         )
      },
      onError: error => toast.error(readableError(error)),
   })
   const scored = person.icpScore !== null
   const scoredAt = person.icpScoredAt ? new Date(person.icpScoredAt) : null

   return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
         {person.icpScoreWaitingFor ? (
            <span className="text-muted-foreground">Reading the profile. The score comes when it is in.</span>
         ) : scored ? (
            <span>
               Score <span className="font-semibold tabular-nums">{person.icpScore}</span> of 100 for{' '}
               {person.icpScoreIcpName}
               {scoredAt ? <span className="text-muted-foreground"> · {timeAgo(scoredAt)}</span> : null}
            </span>
         ) : (
            <span className="text-muted-foreground">Not scored against an ideal customer yet.</span>
         )}
         <Select value={icpId} onValueChange={setIcpId}>
            <SelectTrigger size="sm" className="w-44" aria-label="Ideal customer">
               <SelectValue placeholder="Ideal customer" />
            </SelectTrigger>
            <SelectContent>
               {(icps.data ?? []).map(icp => (
                  <SelectItem key={icp.id} value={icp.id}>
                     {icp.name}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
         <Button
            size="sm"
            variant="outline"
            disabled={icpId === '' || rescore.isPending}
            onClick={() => rescore.mutate({ id: person.id, icpId })}
         >
            {scored ? 'Rescore' : 'Score'}
         </Button>
      </div>
   )
}
