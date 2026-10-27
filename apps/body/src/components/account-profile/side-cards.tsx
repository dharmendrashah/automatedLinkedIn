import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { EntityRow } from './entity-row'
import { ExpandableList } from './expandable-list'
import { Section } from './section'

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
