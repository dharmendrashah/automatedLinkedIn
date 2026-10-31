import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { TriangleAlert } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { trpc } from '../../trpc'
import { ContactAvatar } from './account-avatar'

type Props = {
   slug: string
   // The account of the conversation the card is opened from; the others that talk with the person are named. Outside a
   // conversation every account that talks with them is named.
   accountId?: string
   children: ReactNode
   onOpen: (slug: string) => void
}

// A short look at the person on hover or keyboard focus: picture, title, which accounts know them, and the way to their full profile.
// It only reads what the owner has; nothing in it costs money.
export const PersonCard = ({ slug, accountId, children, onOpen }: Props) => {
   const [open, setOpen] = useState(false)
   const detail = trpc.person.detail.useQuery({ slug }, { enabled: open, retry: false, staleTime: 60_000 })
   const person = detail.data
   const [connection] = person?.connections ?? []
   const name = person?.snapshot?.name ?? connection?.name ?? person?.member?.name ?? person?.profile?.fullName ?? slug
   const headline = person?.snapshot?.headline ?? connection?.headline ?? person?.member?.headline
   const others = [
      ...new Set(person?.conversations.filter(item => item.accountId !== accountId).map(item => item.accountName)),
   ]

   return (
      <HoverCard openDelay={400} closeDelay={100} open={open} onOpenChange={setOpen}>
         <HoverCardTrigger asChild>
            <button
               type="button"
               onClick={() => onOpen(slug)}
               className="flex min-w-0 items-center gap-2 rounded-md text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
               aria-label={`View the profile of ${name}`}
            >
               {children}
            </button>
         </HoverCardTrigger>
         <HoverCardContent align="start" className="w-72">
            {detail.isError ? (
               <p className="text-sm text-muted-foreground">Nothing more is known about this person yet.</p>
            ) : !person ? (
               <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
               <div className="grid gap-2 text-sm">
                  <div className="flex items-start gap-2">
                     <ContactAvatar
                        name={name}
                        size="lg"
                        {...((person.snapshot?.photo ?? connection?.photoUrl) && {
                           imageUrl: person.snapshot?.photo ?? connection?.photoUrl ?? undefined,
                        })}
                     />
                     <div className="min-w-0">
                        <p className="font-medium break-words">{name}</p>
                        {headline ? (
                           <p className="line-clamp-3 text-xs break-words text-muted-foreground">{headline}</p>
                        ) : null}
                     </div>
                  </div>
                  {person.connections.length > 0 ? (
                     <p className="text-xs">
                        Connected to {person.connections.map(item => item.accountName).join(', ')}
                     </p>
                  ) : null}
                  {others.length > 0 ? (
                     <p className="flex items-center gap-1 text-xs text-warning">
                        <TriangleAlert className="size-3 shrink-0" aria-hidden />
                        {accountId ? 'Also talking from' : 'Talking from'} {others.join(', ')}
                     </p>
                  ) : null}
                  {person.member ? <p className="text-xs">In the list {person.member.list.name}</p> : null}
                  {person.suppressed ? <p className="text-xs text-destructive">You chose not to message them</p> : null}
                  <Button size="sm" variant="outline" className="justify-self-start" onClick={() => onOpen(slug)}>
                     View profile
                  </Button>
               </div>
            )}
         </HoverCardContent>
      </HoverCard>
   )
}
