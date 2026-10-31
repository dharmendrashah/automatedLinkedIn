import premiumMark from '@/assets/linkedin-premium.png'
import { Cover, DetailLoading, DetailMissing, Picture, ReadButton } from '@/components/details/detail-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { flagOf } from '@/lib/country-flag'
import { BadgeCheck, ExternalLink, Sparkles } from 'lucide-react'
import { type ReactNode } from 'react'

import { type PersonDetail } from './types'

import { trpc } from '../../trpc'
import { About, Education, Experience, Fit, Skills, WhyFound } from './person-sections'
import { Workspace } from './person-workspace'
import { usePersonDetail } from './use-person-detail'

// What the paid profile read says about the person, each only when the read says so.
export const ProfileBadges = ({ snapshot }: { snapshot: PersonDetail['snapshot'] }) => {
   const country = snapshot?.country ?? null
   const flag = flagOf(country)

   return (
      <>
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
      </>
   )
}

// The top card, laid out like a LinkedIn profile: photo, name, badges, headline, role, place and reach. `children` follow the
// text (the drawer's reason) and `actions` follow Open on LinkedIn and the read.
export const ProfileCard = ({
   person,
   clientId,
   actions,
   known,
   children,
}: {
   person: PersonDetail
   clientId?: string
   actions?: ReactNode
   // What My network already shows for them, for what the detail does not have.
   known?: {
      name: string | null
      headline: string | null
      photoUrl: string | null
      company: string | null
   }
   children?: ReactNode
}) => {
   const utils = trpc.useUtils()
   const read = trpc.person.readFull.useMutation({
      onSuccess: data => utils.person.detail.setData({ slug: person.slug }, data),
   })
   const { member, profile, snapshot, connections } = person
   const [connection] = connections
   const name = snapshot?.name ?? member?.name ?? profile?.fullName ?? connection?.name ?? known?.name ?? person.slug
   const headline =
      snapshot?.headline ?? member?.headline ?? profile?.headline ?? connection?.headline ?? known?.headline
   const [current] = snapshot?.experience ?? []
   const title = current?.title ?? member?.title
   const company = current?.company ?? member?.company ?? profile?.company ?? known?.company
   const location = snapshot?.location ?? member?.location ?? profile?.location
   const followers = snapshot?.followers ?? member?.followers
   const reach = [
      location,
      followers !== null && followers !== undefined ? `${followers.toLocaleString()} followers` : null,
      snapshot?.connections ? `${snapshot.connections.toLocaleString()} connections` : null,
   ].filter(Boolean)

   return (
      <Cover image={snapshot?.cover ?? null}>
         <Picture name={name} image={snapshot?.photo ?? connection?.photoUrl ?? known?.photoUrl ?? null} />
         <div className="grid gap-1">
            <DrawerTitle className="text-xl">{name}</DrawerTitle>
            {headline ? <DrawerDescription className="text-foreground text-sm">{headline}</DrawerDescription> : null}
            {title || company ? <p className="text-sm">{[title, company].filter(Boolean).join(' at ')}</p> : null}
            {reach.length > 0 ? <p className="text-muted-foreground text-xs">{reach.join(' · ')}</p> : null}
            {children}
         </div>
         <div className="flex flex-wrap gap-1.5">
            <ProfileBadges snapshot={snapshot} />
            {person.suppressed ? <Badge variant="destructive">Do not contact</Badge> : null}
         </div>
         <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Button asChild size="sm" variant={actions ? 'outline' : 'default'}>
               <a href={person.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Open on LinkedIn
               </a>
            </Button>
            {person.suppressed ? null : (
               <ReadButton
                  what="full profile"
                  readAt={snapshot?.fetchedAt ?? null}
                  read={person.read}
                  pending={read.isPending}
                  error={read.error}
                  onRead={() => read.mutate({ slug: person.slug, clientId })}
               />
            )}
         </div>
      </Cover>
   )
}

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

// Everything under the top card: how the accounts know them, fit, why found, about, experience, education, skills, workspace.
export const ProfileDetails = ({ person }: { person: PersonDetail }) => {
   const { member, snapshot } = person

   return (
      <div className="grid gap-3">
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

// One person, like their LinkedIn profile, so a lead can be judged without leaving the table. `clientId` charges the read to that
// client.
export const PersonView = ({ slug, clientId }: { slug: string; clientId?: string }) => {
   const detail = usePersonDetail(slug)
   const person = detail.data

   if (!person) {
      return detail.error ? <DetailMissing error={detail.error} /> : <DetailLoading what="person" />
   }

   return (
      <div className="grid gap-3">
         <ProfileCard person={person} clientId={clientId} />
         <ProfileDetails person={person} />
      </div>
   )
}
