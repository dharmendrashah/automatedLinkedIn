import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { EntityRow } from './entity-row'
import { ExpandableList } from './expandable-list'
import { Section } from './section'

const TABS = [
   {
      key: 'topVoices',
      label: 'Top voices',
      shape: 'round',
   },
   {
      key: 'companies',
      label: 'Companies',
      shape: 'square',
   },
   {
      key: 'groups',
      label: 'Groups',
      shape: 'square',
   },
   {
      key: 'newsletters',
      label: 'Newsletters',
      shape: 'square',
   },
   {
      key: 'schools',
      label: 'Schools',
      shape: 'square',
   },
] as const

// What the account follows, by kind; only the kinds it follows get a tab.
export const InterestsCard = ({ interests }: Pick<AccountProfile, 'interests'>) => {
   const tabs = TABS.filter(({ key }) => interests[key].length > 0)
   const [first] = tabs

   if (!first) {
      return null
   }

   return (
      <Section title="Interests">
         <Tabs defaultValue={first.key}>
            <TabsList className="h-auto flex-wrap justify-start">
               {tabs.map(({ key, label }) => (
                  <TabsTrigger key={key} value={key} className="flex-none">
                     {label}
                  </TabsTrigger>
               ))}
            </TabsList>
            {tabs.map(({ key, shape }) => (
               <TabsContent key={key} value={key}>
                  <ExpandableList
                     items={interests[key]}
                     shown={4}
                     className="sm:grid-cols-2"
                     render={entity => <EntityRow entity={entity} shape={shape} />}
                  />
               </TabsContent>
            ))}
         </Tabs>
      </Section>
   )
}
