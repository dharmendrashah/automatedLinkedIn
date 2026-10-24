import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Briefcase } from 'lucide-react'

import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { ExpandableText } from './expandable-text'
import { Section } from './section'

// Whether the person says they are open to work, to whom, and for which roles.
export const OpenToWork = ({ openToWork }: Pick<AccountProfile, 'openToWork'>) =>
   openToWork ? (
      <Card className="bg-info/10 border-info/30 flex-row items-start gap-3 px-6 py-4">
         <Briefcase className="text-info mt-0.5 size-5 shrink-0" aria-hidden />
         <div className="grid gap-0.5">
            <h2 className="text-sm font-semibold">Open to work · {openToWork.audience}</h2>
            {openToWork.titles.length > 0 ? (
               <p className="text-muted-foreground text-sm">{openToWork.titles.join(', ')}</p>
            ) : null}
         </div>
      </Card>
   ) : null

// The about text, and the skills the person put first.
export const AboutCard = ({ about, topSkills }: Pick<AccountProfile, 'about' | 'topSkills'>) =>
   about || topSkills.length > 0 ? (
      <Section title="About">
         {about ? <ExpandableText text={about} /> : null}
         {topSkills.length > 0 ? (
            <div className="rounded-lg border p-3">
               <h3 className="text-sm font-semibold">Top skills</h3>
               <p className="text-muted-foreground text-sm">{topSkills.join(' · ')}</p>
            </div>
         ) : null}
      </Section>
   ) : null

// The contact info the account sees on its own page: emails and phones, then every other row with the label as LinkedIn wrote it.
export const ContactCard = ({ contact }: Pick<AccountProfile, 'contact'>) => {
   const rows: Array<{ label: string; value: string; type?: string }> = contact
      ? [
           ...contact.emails.map(value => ({ label: 'Email', value })),
           ...contact.phones.map(({ value, type }) => ({ label: 'Phone', value, type })),
           ...contact.other,
        ]
      : []

   return rows.length > 0 ? (
      <Section title="Contact info">
         <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
            {rows.map(({ label, value, type }) => (
               <div key={`${label}-${value}`} className="contents">
                  <dt className="text-muted-foreground" dir="auto">
                     {label}
                  </dt>
                  <dd className="break-words" dir="auto">
                     {value}
                     {type ? <span className="text-muted-foreground"> ({type})</span> : null}
                  </dd>
               </div>
            ))}
         </dl>
      </Section>
   ) : null
}

export const ServicesCard = ({ services }: Pick<AccountProfile, 'services'>) =>
   services.length > 0 ? (
      <Section title="Services">
         <ul className="flex flex-wrap gap-2">
            {services.map(service => (
               <li key={service}>
                  <Badge variant="secondary" className="font-normal">
                     {service}
                  </Badge>
               </li>
            ))}
         </ul>
      </Section>
   ) : null
