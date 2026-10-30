import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Mail, MessageSquare, PanelRight, Phone, UserPlus } from 'lucide-react'
import { type ReactNode } from 'react'

import { type PersonRow } from './types'

import { inviteBlock, messageAction } from './row-actions'
import { nameOf } from './words'

type Props = {
   row: PersonRow
   invitesLive: boolean
   onInvite: (row: PersonRow) => void
   onPreview: (row: PersonRow) => void
}

// One icon button with its words in a tooltip; a disabled one says why. Links open in a new tab.
const Action = ({
   label,
   icon,
   href,
   disabled,
   onClick,
}: {
   label: string
   icon: ReactNode
   href?: string
   disabled?: string
   onClick?: () => void
}) => (
   <Tooltip>
      <TooltipTrigger asChild>
         <span>
            {href && !disabled ? (
               <Button asChild variant="ghost" size="icon" className="size-8">
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                     {icon}
                  </a>
               </Button>
            ) : (
               <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={disabled ? `${label}: ${disabled}` : label}
                  disabled={Boolean(disabled)}
                  onClick={onClick}
               >
                  {icon}
               </Button>
            )}
         </span>
      </TooltipTrigger>
      <TooltipContent>{disabled ? `${label}: ${disabled}` : label}</TooltipContent>
   </Tooltip>
)

// The row's own actions, shown on hover, on keyboard focus and always on screens without hover. Clicks never open the drawer.
export const RowActions = ({ row, invitesLive, onInvite, onPreview }: Props) => {
   const message = messageAction(row)
   const blocked = inviteBlock(row, invitesLive)
   const name = nameOf(row)

   return (
      <span
         className="flex justify-end gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100"
         onClick={event => event.stopPropagation()}
      >
         <Action
            label={message.kind === 'OPEN_CHAT' ? `Open chat with ${name}` : `Message ${name}`}
            icon={<MessageSquare />}
            {...(message.kind === 'NONE' ? { disabled: message.reason } : { href: message.href })}
         />
         <Action
            label={`Invite ${name}`}
            icon={<UserPlus />}
            {...(blocked ? { disabled: blocked } : { onClick: () => onInvite(row) })}
         />
         <Action label="Quick preview" icon={<PanelRight />} onClick={() => onPreview(row)} />
         <Action label="Email" icon={<Mail />} disabled="Coming soon" />
         <Action label="Phone" icon={<Phone />} disabled="Coming soon" />
      </span>
   )
}
