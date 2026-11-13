import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

import { rateOf } from '@automatedLinkedIn/contracts'

import { type FunnelStage, conversionRates } from './campaign-insights'

type Stage = 'found' | 'qualified' | 'invited' | 'accepted' | 'messaged' | 'replied' | 'silent' | 'handedOver'

const STAGES: { key: Stage; label: string }[] = [
   { key: 'messaged', label: 'Messaged' },
   { key: 'replied', label: 'Replied' },
   { key: 'silent', label: 'Silent' },
   { key: 'handedOver', label: 'Handed over' },
]

const STAGE_NAMES: Record<FunnelStage, string> = {
   found: 'Found',
   qualified: 'Qualified',
   invited: 'Invited',
   accepted: 'Accepted',
}

const rateText = (rate: number | null) => (rate === null ? 'no data' : `${Math.round(rate * 100)} %`)

// Found, Qualified, Invited and Accepted are in the header tiles. Each stage here is measured against Found.
export const CampaignFunnel = ({ funnel }: { funnel: Record<Stage, number> }) => (
   <div className="grid gap-3">
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
         {conversionRates(funnel).map(({ from, to, rate }) => (
            <li key={from} className="tabular-nums">
               {`${STAGE_NAMES[from]} to ${STAGE_NAMES[to]}: ${rateText(rate)}`}
            </li>
         ))}
      </ul>
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
   </div>
)
