import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

import { rateOf } from '@automatedLinkedIn/contracts'

type Stage = 'found' | 'qualified' | 'invited' | 'accepted' | 'messaged' | 'replied' | 'silent' | 'handedOver'

const STAGES: { key: Stage; label: string }[] = [
   { key: 'messaged', label: 'Messaged' },
   { key: 'replied', label: 'Replied' },
   { key: 'silent', label: 'Silent' },
   { key: 'handedOver', label: 'Handed over' },
]

// Found, Qualified, Invited and Accepted are in the header tiles. Each stage here is measured against Found.
export const CampaignFunnel = ({ funnel }: { funnel: Record<Stage, number> }) => (
   <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {STAGES.map(({ key, label }) => {
         const share = rateOf(funnel[key], funnel.found)
         const text = share === null ? 'no data' : `${Math.round(share * 100)} % of found`

         return (
            <Card key={key} className="gap-3 py-4">
               <CardContent className="grid gap-2">
                  <CardDescription>{label}</CardDescription>
                  <span className="text-2xl font-semibold tabular-nums">{funnel[key]}</span>
                  <Progress value={(share ?? 0) * 100} aria-label={`${label}: ${text}`} />
                  <span className="text-muted-foreground text-xs">{text}</span>
               </CardContent>
            </Card>
         )
      })}
   </div>
)
