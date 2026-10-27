import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FlaskConical, type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link } from 'react-router'

import { SCENARIOS, SCENARIO_LABELS, type Scenario } from './sample-source'

// Shown while the page runs on made-up people (the address asks for `?sample=`), so nobody takes a click here for an answer sent to
// LinkedIn. The picker switches the view, and the button goes back to the real requests.
export const SampleBanner = ({
   scenario,
   onScenario,
}: {
   scenario: Scenario
   onScenario: (next: Scenario | undefined) => void
}) => (
   <div className="bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed px-3 py-2 text-sm">
      <FlaskConical className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
         <span className="font-medium">Preview with sample people.</span>{' '}
         <span className="text-muted-foreground">Nothing you do here is sent to LinkedIn.</span>
      </p>
      <Select
         value={scenario}
         onValueChange={value => {
            const next = SCENARIOS.find(name => name === value)

            if (next) {
               onScenario(next)
            }
         }}
      >
         <SelectTrigger size="sm" className="w-56" aria-label="Preview view">
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            {SCENARIOS.map(name => (
               <SelectItem key={name} value={name}>
                  {SCENARIO_LABELS[name]}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={() => onScenario(undefined)}>
         Use my real requests
      </Button>
   </div>
)

type EmptyProps = {
   icon: LucideIcon
   title: string
   text: ReactNode
   action?: ReactNode
}

// An empty list, a missing account or a problem, said in the middle of the space the list would have filled.
export const EmptyState = ({ icon: Icon, title, text, action }: EmptyProps) => (
   <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
         <Icon className="size-6" aria-hidden />
      </span>
      <div className="grid gap-1">
         <p className="font-medium">{title}</p>
         <p className="text-muted-foreground max-w-md text-sm">{text}</p>
      </div>
      {action}
   </div>
)

export const ToAccounts = ({ label }: { label: string }) => (
   <Button asChild variant="outline" size="sm">
      <Link to="/accounts">{label}</Link>
   </Button>
)
