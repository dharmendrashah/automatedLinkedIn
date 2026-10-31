import { DetailLoading, DetailMissing, PersonRow, Picture, ReadButton } from '@/components/details/detail-parts'
import { NotesField } from '@/components/details/notes-field'
import { pollWhile } from '@/components/details/read-status'
import { About, Section } from '@/components/people/person-sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { BadgeCheck, BriefcaseBusiness, ExternalLink, Globe, MousePointerClick, Users } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link } from 'react-router'

import { type RouterOutputs, trpc } from '../../trpc'
import { isLinkStatus, linkStatuses } from '../links/link-statuses'
import { Breakdowns } from './company/breakdowns'
import { domainOf, factsOf } from './company/facts'
import { KeyFacts, Offices } from './company/key-facts'

type CompanyDetail = RouterOutputs['companyPage']['detail']

const LinkButton = ({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) => (
   <Button asChild size="sm" variant="outline">
      <a href={href} target="_blank" rel="noreferrer noopener">
         {icon}
         {children}
      </a>
   </Button>
)

const Header = ({ detail }: { detail: CompanyDetail }) => {
   const utils = trpc.useUtils()
   const read = trpc.companyPage.readFull.useMutation({
      onSuccess: data => utils.companyPage.detail.setData({ slug: detail.slug }, data),
   })
   const { company, snapshot } = detail
   const name = snapshot?.name ?? company.name ?? detail.slug
   const website = snapshot?.website ?? (company.website?.startsWith('https://') ? company.website : null)

   return (
      <div className="grid gap-3 rounded-xl border p-4">
         <div className="flex items-start gap-4">
            <Picture name={name} image={snapshot?.logo ?? null} square className="size-20 border" />
            <div className="grid min-w-0 gap-1">
               <DrawerTitle className="flex flex-wrap items-center gap-1.5 text-xl">
                  {name}
                  {snapshot?.verified ? <BadgeCheck className="text-primary size-5" aria-label="Verified" /> : null}
                  {snapshot?.showcase ? <Badge variant="secondary">Showcase page</Badge> : null}
                  {snapshot?.active === false ? <Badge variant="outline">Inactive</Badge> : null}
               </DrawerTitle>
               {snapshot?.tagline ? (
                  <DrawerDescription className="text-foreground text-sm">{snapshot.tagline}</DrawerDescription>
               ) : null}
               {snapshot?.industry ? <p className="text-muted-foreground text-xs">{snapshot.industry}</p> : null}
            </div>
         </div>
         <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
               <a href={detail.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Open on LinkedIn
               </a>
            </Button>
            {website ? (
               <LinkButton href={website} icon={<Globe />}>
                  {domainOf(website)}
               </LinkButton>
            ) : null}
            {snapshot?.jobsUrl ? (
               <LinkButton href={snapshot.jobsUrl} icon={<BriefcaseBusiness />}>
                  Jobs
               </LinkButton>
            ) : null}
            {snapshot?.ctaUrl && snapshot.ctaUrl !== website ? (
               <LinkButton href={snapshot.ctaUrl} icon={<MousePointerClick />}>
                  {domainOf(snapshot.ctaUrl)}
               </LinkButton>
            ) : null}
            {company.archivedAt ? null : (
               <ReadButton
                  what="company page"
                  readAt={snapshot?.fetchedAt ?? null}
                  read={detail.read}
                  pending={read.isPending}
                  error={read.error}
                  onRead={() => read.mutate({ slug: detail.slug })}
               />
            )}
         </div>
      </div>
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

   return (
      <div className="grid gap-3">
         <Header detail={data} />
         {snapshot && !snapshot.detailed && !data.company.archivedAt ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-3 text-xs">
               Read again to see the full address, skills, schools and more.
            </p>
         ) : null}
         <KeyFacts facts={factsOf(snapshot, data.company)} />
         {snapshot?.about ? <About text={snapshot.about} /> : null}
         {snapshot && snapshot.specialities.length > 0 ? (
            <Section title="Specialities">
               <div className="flex flex-wrap gap-1.5">
                  {snapshot.specialities.map(item => (
                     <Badge key={item} variant="secondary">
                        {item}
                     </Badge>
                  ))}
               </div>
            </Section>
         ) : null}
         {snapshot ? <Offices snapshot={snapshot} /> : null}
         {snapshot ? <Breakdowns snapshot={snapshot} /> : null}
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
