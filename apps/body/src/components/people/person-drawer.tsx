import { floatingDrawer } from '@/components/floating-drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { readableError } from '@/lib/trpc-error'
import { ChevronLeft, ChevronRight, ExternalLink, FileSearch, Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { About, Education, Experience, Fit, Skills, WhyFound } from './person-sections'
import { Workspace } from './person-workspace'
import { type PersonDetail } from './types'

import { trpc } from '../../trpc'

const money = (micros: number) => `$${(micros / 1_000_000).toFixed(3)}`

const initialsOf = (name: string) =>
   name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('')

const Avatar = ({ name, photo }: { name: string; photo: string | null }) => {
   const [broken, setBroken] = useState(false)

   return photo && !broken ? (
      <img
         src={photo}
         alt=""
         referrerPolicy="no-referrer"
         className="bg-muted size-24 rounded-full border-4 border-background object-cover"
         onError={() => setBroken(true)}
      />
   ) : (
      <span className="bg-muted text-muted-foreground grid size-24 place-items-center rounded-full border-4 border-background text-2xl font-semibold">
         {initialsOf(name)}
      </span>
   )
}

// The top card, laid out like a LinkedIn profile: photo, name, headline, role, place and reach.
const Header = ({ person }: { person: PersonDetail }) => {
   const utils = trpc.useUtils()
   const read = trpc.person.readFull.useMutation({ onSuccess: data => utils.person.detail.setData({ slug: person.slug }, data) })
   const { member, profile, snapshot } = person
   const name = snapshot?.name ?? member?.name ?? profile?.fullName ?? person.slug
   const headline = snapshot?.headline ?? member?.headline ?? profile?.headline
   const [current] = snapshot?.experience ?? []
   const title = current?.title ?? member?.title
   const company = current?.company ?? member?.company ?? profile?.company
   const location = snapshot?.location ?? member?.location ?? profile?.location
   const followers = snapshot?.followers ?? member?.followers
   const reach = [
      location,
      followers !== null && followers !== undefined ? `${followers.toLocaleString()} followers` : null,
      snapshot?.connections ? `${snapshot.connections.toLocaleString()} connections` : null,
   ].filter(Boolean)

   return (
      <div className="overflow-hidden rounded-xl border">
         <div className="from-primary/30 to-primary/5 h-20 bg-gradient-to-r" />
         <div className="-mt-12 grid gap-3 px-4 pb-4">
            <Avatar name={name} photo={snapshot?.photo ?? null} />
            <div className="grid gap-1">
               <DrawerTitle className="text-xl">{name}</DrawerTitle>
               {headline ? <DrawerDescription className="text-foreground text-sm">{headline}</DrawerDescription> : null}
               {title || company ? (
                  <p className="text-sm">{[title, company].filter(Boolean).join(' at ')}</p>
               ) : null}
               {reach.length > 0 ? <p className="text-muted-foreground text-xs">{reach.join(' · ')}</p> : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
               {snapshot?.openToWork ? <Badge className="bg-success/10 text-success border-transparent">Open to work</Badge> : null}
               {snapshot?.hiring ? <Badge className="bg-primary/10 text-primary border-transparent">Hiring</Badge> : null}
               {person.suppressed ? <Badge variant="destructive">Do not contact</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-2">
               <Button asChild size="sm">
                  <a href={person.url} target="_blank" rel="noreferrer noopener">
                     <ExternalLink />
                     Open on LinkedIn
                  </a>
               </Button>
               {person.suppressed ? null : (
                  <Button variant="outline" size="sm" disabled={read.isPending} onClick={() => read.mutate({ slug: person.slug })}>
                     {read.isPending ? <Loader2 className="animate-spin" /> : snapshot ? <RefreshCw /> : <FileSearch />}
                     {snapshot ? 'Read again' : 'Read full profile'} · about {money(person.readPriceMicros)}
                  </Button>
               )}
            </div>
            {snapshot ? (
               <p className="text-muted-foreground text-xs">Full profile read {new Date(snapshot.fetchedAt).toLocaleDateString()}.</p>
            ) : null}
            {read.error ? <p className="text-destructive text-sm">{readableError(read.error)}</p> : null}
         </div>
      </div>
   )
}

const Body = ({ person }: { person: PersonDetail }) => {
   const { member, snapshot } = person

   return (
      <div className="grid gap-3">
         <Header person={person} />
         {member && (member.score !== null || member.state !== 'UNSCORED' || member.matched.length > 0) ? <Fit member={member} /> : null}
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

type Props = {
   slug: string | null
   onClose: () => void
   // The people of the table the drawer was opened from, in order, for Previous and Next.
   order: string[]
   onOpen: (slug: string) => void
}

// One person in a drawer on the right, like their LinkedIn profile, so a lead can be judged without leaving the table.
export const PersonDrawer = ({ slug, onClose, order, onOpen }: Props) => {
   const detail = trpc.person.detail.useQuery({ slug: slug ?? '' }, { enabled: Boolean(slug), retry: false })
   const index = slug ? order.indexOf(slug) : -1
   const previous = index > 0 ? order[index - 1] : undefined
   const next = index >= 0 && index < order.length - 1 ? order[index + 1] : undefined

   return (
      <Drawer direction="right" open={Boolean(slug)} onOpenChange={open => (open ? undefined : onClose())}>
         <DrawerContent className={floatingDrawer('sm:max-w-xl')}>
            <div className="grid gap-3 overflow-y-auto p-4">
               {detail.data ? (
                  <Body person={detail.data} />
               ) : detail.error ? (
                  <DrawerHeader className="p-0">
                     <DrawerTitle>No longer here</DrawerTitle>
                     <DrawerDescription>{readableError(detail.error)}</DrawerDescription>
                  </DrawerHeader>
               ) : (
                  <div className="grid gap-3">
                     <DrawerTitle className="sr-only">Loading the person</DrawerTitle>
                     <Skeleton className="h-56 w-full rounded-xl" />
                     <Skeleton className="h-28 w-full rounded-xl" />
                     <Skeleton className="h-40 w-full rounded-xl" />
                  </div>
               )}
            </div>
            <DrawerFooter className="flex-row justify-between border-t">
               <Button variant="outline" size="sm" disabled={!previous} onClick={() => (previous ? onOpen(previous) : undefined)}>
                  <ChevronLeft />
                  Previous
               </Button>
               <span className="text-muted-foreground self-center text-xs">{index >= 0 ? `${index + 1} of ${order.length}` : ''}</span>
               <Button variant="outline" size="sm" disabled={!next} onClick={() => (next ? onOpen(next) : undefined)}>
                  Next
                  <ChevronRight />
               </Button>
            </DrawerFooter>
         </DrawerContent>
      </Drawer>
   )
}
