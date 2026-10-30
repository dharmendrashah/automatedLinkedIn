import premiumMark from '@/assets/linkedin-premium.png'
import { Cover, DetailLoading, DetailMissing, Picture, ReadButton } from '@/components/details/detail-parts'
import { pollWhile } from '@/components/details/read-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { flagOf } from '@/lib/country-flag'
import { BadgeCheck, ExternalLink, Sparkles } from 'lucide-react'

import { type PersonDetail } from './types'

import { trpc } from '../../trpc'
import { About, Education, Experience, Fit, Skills, WhyFound } from './person-sections'
import { Workspace } from './person-workspace'

// The top card, laid out like a LinkedIn profile: photo, name, headline, role, place and reach.
const Header = ({
   person,
   confirmRead,
   clientId,
}: {
   person: PersonDetail
   confirmRead: boolean
   clientId?: string
}) => {
   const utils = trpc.useUtils()
   const read = trpc.person.readFull.useMutation({
      onSuccess: data => utils.person.detail.setData({ slug: person.slug }, data),
   })
   const { member, profile, snapshot, connections } = person
   const [connection] = connections
   const name = snapshot?.name ?? member?.name ?? profile?.fullName ?? connection?.name ?? person.slug
   const headline = snapshot?.headline ?? member?.headline ?? profile?.headline ?? connection?.headline
   const [current] = snapshot?.experience ?? []
   const title = current?.title ?? member?.title
   const company = current?.company ?? member?.company ?? profile?.company
   const location = snapshot?.location ?? member?.location ?? profile?.location
   const followers = snapshot?.followers ?? member?.followers
   const country = snapshot?.country ?? null
   const flag = flagOf(country)
   const reach = [
      location,
      followers !== null && followers !== undefined ? `${followers.toLocaleString()} followers` : null,
      snapshot?.connections ? `${snapshot.connections.toLocaleString()} connections` : null,
   ].filter(Boolean)

   return (
      <Cover image={snapshot?.cover ?? null}>
         <Picture name={name} image={snapshot?.photo ?? connection?.photoUrl ?? null} />
         <div className="grid gap-1">
            <DrawerTitle className="text-xl">{name}</DrawerTitle>
            {headline ? <DrawerDescription className="text-foreground text-sm">{headline}</DrawerDescription> : null}
            {title || company ? <p className="text-sm">{[title, company].filter(Boolean).join(' at ')}</p> : null}
            {reach.length > 0 ? <p className="text-muted-foreground text-xs">{reach.join(' · ')}</p> : null}
         </div>
         <div className="flex flex-wrap gap-1.5">
            {snapshot?.premium ? (
               <Badge variant="outline">
                  <img src={premiumMark} alt="" className="size-3.5 rounded-[2px]" />
                  Premium
               </Badge>
            ) : null}
            {snapshot?.verified ? (
               <Badge variant="outline">
                  <BadgeCheck />
                  Verified
               </Badge>
            ) : null}
            {snapshot?.creator ? (
               <Badge variant="outline">
                  <Sparkles />
                  Creator
               </Badge>
            ) : null}
            {country ? (
               <Badge variant="outline">
                  {flag ? <span aria-hidden="true">{flag}</span> : null}
                  {country}
               </Badge>
            ) : null}
            {snapshot?.openToWork ? (
               <Badge className="bg-success/10 text-success border-transparent">Open to work</Badge>
            ) : null}
            {snapshot?.hiring ? <Badge className="bg-primary/10 text-primary border-transparent">Hiring</Badge> : null}
            {person.suppressed ? <Badge variant="destructive">Do not contact</Badge> : null}
         </div>
         <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
               <a href={person.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Open on LinkedIn
               </a>
            </Button>
            {person.suppressed ? null : (
               <ReadButton
                  what="full profile"
                  priceMicros={person.readPriceMicros}
                  readAt={snapshot?.fetchedAt ?? null}
                  read={person.read}
                  pending={read.isPending}
                  error={read.error}
                  onRead={() => read.mutate({ slug: person.slug, clientId })}
                  {...(confirmRead && {
                     confirm: `It adds ${firstNameOf(name)}'s about, experience, education and skills, and is paid from your wallet.`,
                  })}
               />
            )}
         </div>
      </Cover>
   )
}

const firstNameOf = (name: string) => name.split(/\s+/)[0] ?? name

// How the owner's accounts know the person: connected since when, and the conversations they have.
const Accounts = ({ person }: { person: PersonDetail }) =>
   person.connections.length > 0 || person.conversations.length > 0 ? (
      <section className="grid gap-1.5 rounded-xl border p-4 text-sm" aria-label="Your accounts">
         <h3 className="font-semibold">Your accounts</h3>
         <ul className="grid gap-1">
            {person.connections.map(item => (
               <li key={`c-${item.accountId}`}>
                  Connected to <span className="font-medium">{item.accountName}</span>
                  {item.connectedOn ? ` since ${new Date(item.connectedOn).toLocaleDateString()}` : ''}
               </li>
            ))}
            {person.conversations.map(item => (
               <li key={`m-${item.id}`}>
                  Talking from <span className="font-medium">{item.accountName}</span>
               </li>
            ))}
         </ul>
      </section>
   ) : null

// One person, like their LinkedIn profile, so a lead can be judged without leaving the table. `confirmRead` asks before the paid read;
// `clientId` charges it to that client (My network).
export const PersonView = ({
   slug,
   confirmRead = false,
   clientId,
}: {
   slug: string
   confirmRead?: boolean
   clientId?: string
}) => {
   const detail = trpc.person.detail.useQuery(
      { slug },
      {
         retry: false,
         refetchInterval: query => pollWhile(query.state.data?.read),
      }
   )
   const person = detail.data

   if (!person) {
      return detail.error ? <DetailMissing error={detail.error} /> : <DetailLoading what="person" />
   }

   const { member, snapshot } = person

   return (
      <div className="grid gap-3">
         <Header person={person} confirmRead={confirmRead} clientId={clientId} />
         <Accounts person={person} />
         {member && (member.score !== null || member.state !== 'UNSCORED' || member.matched.length > 0) ? (
            <Fit member={member} />
         ) : null}
         {member && member.signals.length > 0 ? <WhyFound signals={member.signals} /> : null}
         {snapshot?.about ? <About text={snapshot.about} /> : null}
         {snapshot && snapshot.experience.length > 0 ? <Experience roles={snapshot.experience} /> : null}
         {snapshot && snapshot.education.length > 0 ? <Education schools={snapshot.education} /> : null}
         {snapshot && snapshot.skills.length > 0 ? <Skills skills={snapshot.skills} /> : null}
         {snapshot ? null : (
            <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
               About, experience, education and skills show after Read full profile.
            </p>
         )}
         <Workspace key={person.slug} person={person} />
      </div>
   )
}
