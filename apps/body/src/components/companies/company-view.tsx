import { Cover, DetailLoading, DetailMissing, PersonRow, Picture, ReadButton } from '@/components/details/detail-parts'
import { NotesField } from '@/components/details/notes-field'
import { pollWhile } from '@/components/details/read-status'
import { About, Section } from '@/components/people/person-sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { BadgeCheck, ExternalLink, Globe, Users } from 'lucide-react'
import { Link } from 'react-router'

import { type RouterOutputs, trpc } from '../../trpc'
import { isLinkStatus, linkStatuses } from '../links/link-statuses'

type CompanyDetail = RouterOutputs['companyPage']['detail']
type Bar = { label: string; count: number }

// The top of one employee breakdown as bars, relative to the biggest.
const Bars = ({ title, bars }: { title: string; bars: Bar[] }) => {
   const most = Math.max(1, ...bars.map(({ count }) => count))

   return (
      <div className="grid gap-1.5">
         <span className="text-muted-foreground text-xs font-medium">{title}</span>
         {bars.map(bar => (
            <div key={bar.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-xs">
               <span className="truncate" title={bar.label}>
                  {bar.label}
               </span>
               <span className="bg-muted h-2 overflow-hidden rounded-full">
                  <span className="bg-primary block h-full" style={{ width: `${(bar.count / most) * 100}%` }} />
               </span>
               <span className="text-muted-foreground tabular-nums">{bar.count.toLocaleString()}</span>
            </div>
         ))}
      </div>
   )
}

const Header = ({ detail }: { detail: CompanyDetail }) => {
   const utils = trpc.useUtils()
   const read = trpc.companyPage.readFull.useMutation({
      onSuccess: data => utils.companyPage.detail.setData({ slug: detail.slug }, data),
   })
   const { company, snapshot } = detail
   const name = snapshot?.name ?? company.name ?? detail.slug
   const website = snapshot?.website ?? (company.website?.startsWith('https://') ? company.website : null)
   const facts = [
      snapshot?.industry ?? company.industry,
      snapshot?.employeeRange ? `${snapshot.employeeRange} employees` : company.size,
      snapshot?.headquarters ?? company.location,
      snapshot?.followers ? `${snapshot.followers.toLocaleString()} followers` : null,
   ].filter(Boolean)

   return (
      <Cover>
         <Picture name={name} image={snapshot?.logo ?? null} square />
         <div className="grid gap-1">
            <DrawerTitle className="flex items-center gap-1.5 text-xl">
               {name}
               {snapshot?.verified ? <BadgeCheck className="text-primary size-5" aria-label="Verified" /> : null}
            </DrawerTitle>
            {snapshot?.tagline ? (
               <DrawerDescription className="text-foreground text-sm">{snapshot.tagline}</DrawerDescription>
            ) : null}
            {facts.length > 0 ? <p className="text-muted-foreground text-xs">{facts.join(' · ')}</p> : null}
         </div>
         <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
               <a href={detail.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Open on LinkedIn
               </a>
            </Button>
            {website ? (
               <Button asChild size="sm" variant="outline">
                  <a href={website} target="_blank" rel="noreferrer noopener">
                     <Globe />
                     Website
                  </a>
               </Button>
            ) : null}
            {company.archivedAt ? null : (
               <ReadButton
                  what="company page"
                  priceMicros={detail.readPriceMicros}
                  readAt={snapshot?.fetchedAt ?? null}
                  read={detail.read}
                  pending={read.isPending}
                  error={read.error}
                  onRead={() => read.mutate({ slug: detail.slug })}
               />
            )}
         </div>
      </Cover>
   )
}

const Workspace = ({ detail }: { detail: CompanyDetail }) => {
   const utils = trpc.useUtils()
   const refresh = () => {
      void utils.companyPage.detail.invalidate({ slug: detail.slug })
      void utils.linkedInCompany.list.invalidate()
   }
   const update = trpc.linkedInCompany.update.useMutation({ onSuccess: refresh })
   const archive = trpc.linkedInCompany.archive.useMutation({ onSuccess: refresh })
   const restore = trpc.linkedInCompany.restore.useMutation({ onSuccess: refresh })
   const error = [update, archive, restore].find(action => action.error)?.error
   const { company } = detail

   return (
      <Section title="In your workspace">
         <div className="flex flex-wrap items-center gap-2">
            <Select
               value={company.status}
               onValueChange={status => (isLinkStatus(status) ? update.mutate({ id: company.id, status }) : undefined)}
            >
               <SelectTrigger className="w-40" aria-label="Company status">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {Object.entries(linkStatuses).map(([value, { label }]) => (
                     <SelectItem key={value} value={value}>
                        {label}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <Button
               variant="outline"
               size="sm"
               onClick={() =>
                  company.archivedAt ? restore.mutate({ id: company.id }) : archive.mutate({ id: company.id })
               }
            >
               {company.archivedAt ? 'Restore' : 'Archive'}
            </Button>
            <Button asChild variant="outline" size="sm">
               <Link to="/workflows/new?start=accounts">
                  <Users />
                  Find people here
               </Link>
            </Button>
            {company.tags.map(tag => (
               <Badge key={tag} variant="secondary">
                  {tag}
               </Badge>
            ))}
         </div>
         <NotesField
            key={company.id}
            id={`notes-company-${company.id}`}
            value={company.notes}
            placeholder="Why this account, who to reach, what they need"
            onSave={notes => update.mutate({ id: company.id, notes })}
         />
         {error ? <p className="text-destructive text-sm">{readableError(error)}</p> : null}
      </Section>
   )
}

// One company, like its LinkedIn page, with the people from the owner's lists who work there.
export const CompanyView = ({ slug, onPerson }: { slug: string; onPerson: (slug: string) => void }) => {
   const detail = trpc.companyPage.detail.useQuery(
      { slug },
      {
         retry: false,
         refetchInterval: query => pollWhile(query.state.data?.read),
      }
   )
   const data = detail.data

   if (!data) {
      return detail.error ? <DetailMissing error={detail.error} /> : <DetailLoading what="company" />
   }

   const { snapshot, people } = data
   const breakdowns = snapshot
      ? [
           ['Departments', snapshot.byFunction],
           ['Where they are', snapshot.byLocation],
           ['Skills', snapshot.bySkill],
        ].filter((entry): entry is [string, Bar[]] => Array.isArray(entry[1]) && entry[1].length > 0)
      : []

   return (
      <div className="grid gap-3">
         <Header detail={data} />
         {snapshot?.about ? <About text={snapshot.about} /> : null}
         {snapshot && (snapshot.founded || snapshot.specialities.length > 0) ? (
            <Section title="Overview">
               {snapshot.founded ? <p className="text-sm">Founded {snapshot.founded}</p> : null}
               <div className="flex flex-wrap gap-1.5">
                  {snapshot.specialities.map(item => (
                     <Badge key={item} variant="secondary">
                        {item}
                     </Badge>
                  ))}
               </div>
            </Section>
         ) : null}
         {breakdowns.length > 0 ? (
            <Section title="Their people">
               {breakdowns.map(([title, bars]) => (
                  <Bars key={title} title={title} bars={bars} />
               ))}
            </Section>
         ) : null}
         {snapshot ? null : (
            <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
               About, specialities and who works there show after Read company page.
            </p>
         )}
         <Section title={`Your people there (${people.length})`}>
            {people.length === 0 ? (
               <p className="text-muted-foreground text-sm">Nobody in your lists works here yet.</p>
            ) : (
               <ul className="grid gap-1">
                  {people.map(person => (
                     <PersonRow
                        key={person.slug}
                        name={person.name ?? person.slug}
                        lines={[
                           person.title ?? person.headline,
                           [person.list.name, person.score !== null ? `score ${person.score}` : null]
                              .filter(Boolean)
                              .join(' · '),
                        ]}
                        onOpen={() => onPerson(person.slug)}
                     />
                  ))}
               </ul>
            )}
         </Section>
         <Workspace detail={data} />
      </div>
   )
}
