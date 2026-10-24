import { Photo } from '@/components/photo'
import { Card } from '@/components/ui/card'
import { BadgeCheck, ExternalLink } from 'lucide-react'
import { type ReactNode } from 'react'

import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { fullCount } from './counts'
import { Mark } from './mark'
import { linkedInHref } from './safe-link'

type Props = {
   profile: AccountProfile
   // What the app can do with this account (its status, and the buttons), shown under the profile's own details.
   strip: ReactNode
}

// The top of the profile: cover, photo, name, headline, where, and how many follow and are connected.
export const ProfileHeader = ({ profile, strip }: Props) => {
   const { name, verified, pronouns, headline, location, followers, connections } = profile
   const address = linkedInHref(profile.profileUrl)
   const counts = [
      followers === undefined ? undefined : `${fullCount(followers)} followers`,
      connections === undefined ? undefined : `${connections} connections`,
   ].filter(Boolean)

   return (
      <Card className="gap-0 overflow-hidden py-0">
         <div className="from-primary/25 to-info/15 relative h-32 bg-gradient-to-r sm:h-44">
            <Photo url={profile.coverUrl} className="rounded-none" />
         </div>
         <div className="grid gap-3 px-6 pb-5">
            <Mark
               name={name}
               imageUrl={profile.imageUrl}
               className="ring-card -mt-12 size-24 text-3xl ring-4 sm:-mt-16 sm:size-32"
            />
            <div className="grid gap-1">
               <h1 className="flex flex-wrap items-center gap-x-2 text-2xl font-semibold" dir="auto">
                  {name}
                  {verified ? <BadgeCheck className="text-info size-5" aria-label="Verified" role="img" /> : null}
                  {pronouns ? <span className="text-muted-foreground text-sm font-normal">{pronouns}</span> : null}
               </h1>
               {headline ? (
                  <p className="text-base" dir="auto">
                     {headline}
                  </p>
               ) : null}
               <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
                  {location ? <span dir="auto">{location}</span> : null}
                  {address ? (
                     <a
                        href={address}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
                     >
                        View on LinkedIn
                        <ExternalLink className="size-3" aria-hidden />
                     </a>
                  ) : null}
               </p>
               {counts.length > 0 ? <p className="text-primary text-sm font-medium">{counts.join(' · ')}</p> : null}
            </div>
         </div>
         <div className="border-t px-6 py-3">{strip}</div>
      </Card>
   )
}
