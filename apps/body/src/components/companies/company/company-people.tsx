import { Section } from '@/components/people/person-sections'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { timeAgo } from '@/lib/time-ago'
import { useState } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { trpc } from '../../../trpc'
import { StatusChip } from '../../my-network/status-chip'
import { ContactAvatar } from '../../unibox/account-avatar'
import { PersonCard } from '../../unibox/person-card'

const ALL = 'all'

const networkLink = (name: string) =>
   `/network?tab=everyone&filters=${encodeURIComponent(JSON.stringify({ companies: [name] }))}`

// The My network people who work at the company (.plan/company-network-people.md): a short look on hover, the My network drawer
// on click. All clients unless the owner picks one.
export const CompanyPeople = ({
   slug,
   name,
   onPerson,
}: {
   slug: string
   name: string
   onPerson: (slug: string) => void
}) => {
   const [clientId, setClientId] = useState(ALL)
   const clients = trpc.people.clients.useQuery(undefined, { retry: false })
   const found = trpc.companyPage.people.useQuery(
      {
         slug,
         ...(clientId !== ALL && { clientId }),
      },
      { retry: false }
   )
   const total = found.data?.total ?? 0
   const people = found.data?.people ?? []

   return (
      <Section title={found.data ? `Your people there (${total})` : 'Your people there'}>
         {(clients.data?.length ?? 0) > 1 ? (
            <Select value={clientId} onValueChange={setClientId}>
               <SelectTrigger size="sm" className="w-48" aria-label="Client">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value={ALL}>All clients</SelectItem>
                  {clients.data?.map(client => (
                     <SelectItem key={client.id} value={client.id}>
                        {client.name}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         ) : null}
         {found.isPending ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
         ) : found.error ? (
            <p className="text-destructive text-sm">{found.error.message}</p>
         ) : people.length === 0 ? (
            <p className="text-muted-foreground text-sm">
               Nobody on My network works here yet. People show here once their profile is read or their company name
               matches.
            </p>
         ) : (
            <ul className="grid gap-1">
               {people.map(person => (
                  <li
                     key={person.slug}
                     className={cn(
                        'flex items-start gap-3 rounded-md px-2 py-1.5',
                        person.doNotContact && 'opacity-60'
                     )}
                  >
                     <PersonCard slug={person.slug} onOpen={onPerson}>
                        <ContactAvatar
                           name={person.name ?? person.slug}
                           {...(person.photoUrl && { imageUrl: person.photoUrl })}
                        />
                        <span className="grid min-w-0">
                           <span className="truncate text-sm font-medium">{person.name ?? person.slug}</span>
                           <span className="text-muted-foreground truncate text-xs">
                              {person.title ?? person.headline}
                           </span>
                           {person.reasonText ? (
                              <span className="text-muted-foreground truncate text-xs">
                                 {person.reasonText}
                                 {person.reasonAt ? ` · ${timeAgo(person.reasonAt)}` : ''}
                              </span>
                           ) : null}
                        </span>
                     </PersonCard>
                     <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
                        {person.doNotContact ? <Badge variant="destructive">Do not contact</Badge> : null}
                        <StatusChip status={person.status} />
                        {person.clients.map(client => (
                           <Badge key={client} variant="secondary" className="font-normal">
                              {client}
                           </Badge>
                        ))}
                        {person.matchedBy === 'NAME' ? (
                           <span
                              className="text-muted-foreground text-xs"
                              title="Same company name; their profile has not been read yet"
                           >
                              matched by name
                           </span>
                        ) : null}
                     </span>
                  </li>
               ))}
            </ul>
         )}
         {total > people.length ? (
            <Link className="text-primary text-sm underline-offset-4 hover:underline" to={networkLink(name)}>
               Show all {total} on My network
            </Link>
         ) : null}
      </Section>
   )
}
