import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Globe, Users } from 'lucide-react'

import type { PostVisibility } from '@automatedLinkedIn/contracts'

import { VISIBILITY_LABELS } from './visibility'

const CHOICES: PostVisibility[] = ['ANYONE', 'CONNECTIONS']

const isVisibility = (value: string): value is PostVisibility => CHOICES.some(choice => choice === value)

type Props = {
   audience: PostVisibility
   comments: PostVisibility
   onAudience: (value: PostVisibility) => void
   onComments: (value: PostVisibility) => void
}

// One small choice of who: Anyone or Connections only.
const Pick = ({
   label,
   value,
   onChange,
}: {
   label: string
   value: PostVisibility
   onChange: (value: PostVisibility) => void
}) => (
   <Select value={value} onValueChange={next => (isVisibility(next) ? onChange(next) : undefined)}>
      <SelectTrigger aria-label={label} className="text-muted-foreground h-7 w-auto gap-1 px-2 text-xs shadow-none">
         {label}: <SelectValue />
      </SelectTrigger>
      <SelectContent>
         {CHOICES.map(choice => (
            <SelectItem key={choice} value={choice}>
               {VISIBILITY_LABELS[choice]}
            </SelectItem>
         ))}
      </SelectContent>
   </Select>
)

// Who can see the post and who can comment on it, under the account name or the title of the writer.
export const VisibilityPicks = ({ audience, comments, onAudience, onComments }: Props) => (
   <div className="flex flex-wrap items-center gap-1">
      {audience === 'CONNECTIONS' ? (
         <Users className="text-muted-foreground size-3" aria-hidden />
      ) : (
         <Globe className="text-muted-foreground size-3" aria-hidden />
      )}
      <Pick label="Who can see" value={audience} onChange={onAudience} />
      <Pick label="Who can comment" value={comments} onChange={onComments} />
   </div>
)
