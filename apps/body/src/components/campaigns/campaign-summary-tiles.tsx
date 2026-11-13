import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { CircleCheck, type LucideIcon, Send, Target, Users } from 'lucide-react'

type Funnel = { found: number; qualified: number; invited: number; accepted: number }

const TILES: { key: keyof Funnel; label: string; icon: LucideIcon }[] = [
   { key: 'found', label: 'Found', icon: Users },
   { key: 'qualified', label: 'Qualified', icon: Target },
   { key: 'invited', label: 'Invited', icon: Send },
   { key: 'accepted', label: 'Accepted', icon: CircleCheck },
]

export const CampaignSummaryTiles = ({ funnel }: { funnel: Funnel }) => (
   <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {TILES.map(({ key, label, icon: Icon }) => (
         <Card key={key}>
            <CardContent className="grid gap-1">
               <CardDescription className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4" />
                  {label}
               </CardDescription>
               <span className="text-3xl font-semibold tabular-nums">{funnel[key]}</span>
            </CardContent>
         </Card>
      ))}
   </div>
)
