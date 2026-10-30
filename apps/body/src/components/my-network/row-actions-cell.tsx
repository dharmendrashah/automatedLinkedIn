import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Building2, FileSearch, Mail, MessageSquare, MessagesSquare, PanelRight, Phone, UserPlus } from 'lucide-react'
import { type ReactNode } from 'react'

import { type PersonRow } from './types'

import { chatsLink, messageAction, readCompanyReason } from './row-actions'
import { nameOf } from './words'

type Props = {
   row: PersonRow
   invitesLive: boolean
   onInvite: (row: PersonRow) => void
   onReadProfile: (row: PersonRow) => void
   onReadCompany: (row: PersonRow) => void
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
export const RowActions = ({ row, invitesLive, onInvite, onReadProfile, onReadCompany, onPreview }: Props) => {
   const message = messageAction(row, invitesLive)
   const chats = chatsLink(row)
   const name = nameOf(row)

   return (
      <span
         className="flex justify-end gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100"
         onClick={event => event.stopPropagation()}
      >
         {message.kind === 'INVITE' ? (
            <Action label={`Invite ${name}`} icon={<UserPlus />} onClick={() => onInvite(row)} />
         ) : (
            <Action
               label={`Message ${name}`}
               icon={<MessageSquare />}
               {...(message.kind === 'NONE' ? { disabled: message.reason } : { href: message.href })}
            />
         )}
         <Action
            label="Read profile"
            icon={<FileSearch />}
            {...(row.doNotContact ? { disabled: 'On Do not contact' } : { onClick: () => onReadProfile(row) })}
         />
         <Action
            label="Read company"
            icon={<Building2 />}
            {...(readCompanyReason(row) === null
               ? { onClick: () => onReadCompany(row) }
               : { disabled: readCompanyReason(row) ?? undefined })}
         />
         <Action
            label="Show chats"
            icon={<MessagesSquare />}
            {...(chats ? { href: chats } : { disabled: 'No conversation yet' })}
         />
         <Action label="Quick preview" icon={<PanelRight />} onClick={() => onPreview(row)} />
         <Action label="Email" icon={<Mail />} disabled="Coming soon" />
         <Action label="Phone" icon={<Phone />} disabled="Coming soon" />
      </span>
   )
}
