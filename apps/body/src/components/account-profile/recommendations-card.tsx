import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { AccountProfile } from '@automatedLinkedIn/contracts'

import { ExpandableList } from './expandable-list'
import { ExpandableText } from './expandable-text'
import { totalOf } from './lists'
import { Mark } from './mark'
import { ProfileLink } from './profile-link'
import { Section } from './section'

type Recommendation = AccountProfile['recommendations']['received']['items'][number]

const RecommendationEntry = ({ recommendation }: { recommendation: Recommendation }) => (
   <article className="grid gap-2">
      <div className="flex items-start gap-3">
         <Mark name={recommendation.name} imageUrl={recommendation.imageUrl} className="size-12 text-base" />
         <div className="grid min-w-0 gap-0.5">
            <p className="text-sm font-semibold">
               <ProfileLink href={recommendation.url}>{recommendation.name}</ProfileLink>
               {recommendation.degree ? (
                  <span className="text-muted-foreground font-normal"> · {recommendation.degree}</span>
               ) : null}
            </p>
            {recommendation.headline ? (
               <p className="text-muted-foreground line-clamp-2 text-xs">{recommendation.headline}</p>
            ) : null}
            {recommendation.relationship ? (
               <p className="text-muted-foreground text-xs">{recommendation.relationship}</p>
            ) : null}
         </div>
      </div>
      <ExpandableText text={recommendation.text} lines={4} />
   </article>
)

const List = ({ list, empty }: { list: AccountProfile['recommendations']['received']; empty: string }) =>
   list.items.length === 0 ? (
      <p className="text-muted-foreground text-sm">{empty}</p>
   ) : (
      <ExpandableList
         items={list.items}
         shown={2}
         total={list.total}
         render={recommendation => <RecommendationEntry recommendation={recommendation} />}
      />
   )

// What others wrote about the account, and what the account wrote about others, each in its own tab.
export const RecommendationsCard = ({ recommendations }: Pick<AccountProfile, 'recommendations'>) => {
   const { received, given, pending } = recommendations

   if (received.items.length === 0 && given.items.length === 0) {
      return null
   }

   return (
      <Section title="Recommendations" action={pending ? <Badge variant="outline">{pending} pending</Badge> : null}>
         <Tabs defaultValue={received.items.length > 0 ? 'received' : 'given'}>
            <TabsList>
               <TabsTrigger value="received">Received ({totalOf(received)})</TabsTrigger>
               <TabsTrigger value="given">Given ({totalOf(given)})</TabsTrigger>
            </TabsList>
            <TabsContent value="received">
               <List list={received} empty="No recommendations received." />
            </TabsContent>
            <TabsContent value="given">
               <List list={given} empty="No recommendations given." />
            </TabsContent>
         </Tabs>
      </Section>
   )
}
