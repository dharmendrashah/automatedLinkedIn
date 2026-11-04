import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { WAITING_DAYS } from './filters/model'

const ANY = 'any'

// On the Waiting tab: only people whose last message from you is at least this old.
export const WaitingDays = ({ value, onChange }: { value: number | undefined; onChange: (days: number | null) => void }) => (
   <Select value={value ? String(value) : ANY} onValueChange={next => onChange(next === ANY ? null : Number(next))}>
      <SelectTrigger size="sm" aria-label="Waiting for at least">
         <SelectValue />
      </SelectTrigger>
      <SelectContent>
         <SelectItem value={ANY}>Waiting: any time</SelectItem>
         {WAITING_DAYS.map(days => (
            <SelectItem key={days} value={String(days)}>
               {`Waiting at least ${days} days`}
            </SelectItem>
         ))}
      </SelectContent>
   </Select>
)
