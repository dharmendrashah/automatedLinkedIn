import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Gauge, Settings2, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'

import type { CampaignInsights } from '@automatedLinkedIn/contracts'

import { missingSetupItems, projectionNote } from './campaign-insights'

const Capacity = ({ value, label }: { value: number; label: string }) => (
   <div className="grid gap-1 rounded-lg border p-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
   </div>
)

export const CampaignCapacity = ({ insights }: { insights: CampaignInsights }) => {
   const { capacity, projection, gate } = insights
   const setup = missingSetupItems(capacity.missing)
   const reason = projection.status === 'hidden' ? projectionNote(projection, gate) : null
   return (
      <Card>
         <CardHeader>
            <CardTitle>What your accounts can reach</CardTitle>
            <CardDescription>
               Capacity from your accounts and limits. This is what the campaign can do once it runs.
            </CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            <div className="grid grid-cols-3 gap-3">
               <Capacity value={capacity.perDay} label="Invites a day" />
               <Capacity value={capacity.perWeek} label="Invites a week" />
               <Capacity value={capacity.usableAccounts} label="Usable accounts" />
            </div>
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
               <Gauge aria-hidden className="size-4" />
               This campaign's share: {capacity.share.perDay} a day, {capacity.share.perWeek} a week.
            </p>
            {reason && (
               <Alert>
                  <TriangleAlert aria-hidden />
                  <AlertTitle>Nothing is sent yet</AlertTitle>
                  <AlertDescription>{reason}</AlertDescription>
               </Alert>
            )}
            {setup.length > 0 && (
               <div className="grid gap-2">
                  <h3 className="text-sm font-medium">Finish setup</h3>
                  <ul className="grid gap-2">
                     {setup.map(item => (
                        <li key={item.label}>
                           <Button variant="outline" className="w-full justify-start" asChild>
                              <Link to={item.to}>
                                 <Settings2 aria-hidden />
                                 {item.label}
                              </Link>
                           </Button>
                        </li>
                     ))}
                  </ul>
               </div>
            )}
         </CardContent>
      </Card>
   )
}
