import { Section } from '@/components/people/person-sections'
import { IconBrandLinkedin } from '@tabler/icons-react'
import {
   BadgeCheck,
   Building2,
   CalendarDays,
   Factory,
   FileText,
   Fingerprint,
   Globe,
   Layers,
   MapPin,
   MousePointerClick,
   Power,
   UserRound,
   Users,
} from 'lucide-react'
import { type ComponentType } from 'react'

import { type Fact, type FactKind, type Snapshot, addressText } from './facts'

const ICONS: Record<FactKind, ComponentType<{ className?: string }>> = {
   industry: Factory,
   category: Layers,
   founded: CalendarDays,
   size: Building2,
   employees: UserRound,
   followers: Users,
   website: Globe,
   cta: MousePointerClick,
   linkedin: IconBrandLinkedin,
   pageType: FileText,
   status: Power,
   verified: BadgeCheck,
   companyId: Fingerprint,
   headquarters: MapPin,
}

// The company at a glance: one row per fact, icon, label and value; the website opens in a new tab.
export const KeyFacts = ({ facts }: { facts: Fact[] }) =>
   facts.length === 0 ? null : (
      <Section title="Key facts">
         <dl className="grid gap-3 sm:grid-cols-2">
            {facts.map(fact => {
               const Icon = ICONS[fact.kind]

               return (
                  <div
                     key={fact.kind}
                     className={fact.kind === 'headquarters' ? 'flex gap-2.5 sm:col-span-2' : 'flex gap-2.5'}
                  >
                     <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                     <div className="grid min-w-0">
                        <dt className="text-muted-foreground text-xs">{fact.label}</dt>
                        <dd className="text-sm break-words">
                           {fact.href ? (
                              <a
                                 href={fact.href}
                                 target="_blank"
                                 rel="noreferrer noopener"
                                 className="text-primary underline-offset-4 hover:underline"
                              >
                                 {fact.value}
                              </a>
                           ) : (
                              fact.value
                           )}
                        </dd>
                     </div>
                  </div>
               )
            })}
         </dl>
      </Section>
   )

// Every office the page lists, shown only when there is more than the headquarters.
export const Offices = ({ snapshot }: { snapshot: Snapshot }) => {
   const headquarters = snapshot.address ? addressText(snapshot.address) : null
   const offices = snapshot.locations.map(addressText).filter(office => office && office !== headquarters)

   return offices.length === 0 ? null : (
      <Section title={`Offices (${snapshot.locations.length})`}>
         <ul className="grid gap-2">
            {snapshot.locations.map(office => (
               <li key={addressText(office)} className="flex gap-2.5 text-sm">
                  <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  {addressText(office)}
               </li>
            ))}
         </ul>
      </Section>
   )
}
