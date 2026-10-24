import { Eye, Search, Users } from 'lucide-react'
import { type ReactNode } from 'react'

import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { fullCount } from './counts'
import { EntityRow } from './entity-row'
import { ExpandableList } from './expandable-list'
import { Section } from './section'

const Figure = ({ icon, value, label }: { icon: ReactNode; value: number; label: string }) => (
   <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{icon}</span>
      <div>
         <p className="text-base leading-tight font-semibold">{fullCount(value)}</p>
         <p className="text-muted-foreground text-xs">{label}</p>
      </div>
   </div>
)

// Numbers LinkedIn shows only to the account itself.
export const AnalyticsCard = ({ analytics }: Pick<AccountProfile, 'analytics'>) =>
   analytics ? (
      <Section title="Analytics" action={<span className="text-muted-foreground text-xs">Private to the account</span>}>
         <Figure icon={<Users className="size-5" aria-hidden />} value={analytics.profileViews} label="Profile views" />
         <Figure
            icon={<Eye className="size-5" aria-hidden />}
            value={analytics.postImpressions}
            label="Post impressions"
         />
         <Figure
            icon={<Search className="size-5" aria-hidden />}
            value={analytics.searchAppearances}
            label="Search appearances"
         />
         {analytics.period ? <p className="text-muted-foreground text-xs">{analytics.period}</p> : null}
      </Section>
   ) : null

type SuggestionsProps = {
   title: string
   entities: AccountProfile['peopleYouMayKnow']
   shape?: 'round' | 'square'
}

// LinkedIn's own suggestions to the account: people it may know, or pages it may like.
export const SuggestionsCard = ({ title, entities, shape = 'round' }: SuggestionsProps) =>
   entities.length > 0 ? (
      <Section title={title}>
         <ExpandableList items={entities} shown={3} render={entity => <EntityRow entity={entity} shape={shape} />} />
      </Section>
   ) : null
