import { type PersonFacts, type Signal, templateValues } from 'core'

import { MessageValuesService } from 'database'

import { renderTemplate } from '@automatedLinkedIn/contracts'

// The words for each person of a writing block (.plan/message-composer.md): what the database knows, with what the run carries on top,
// put into the text. Spintax is picked at random each time.

export type Who = {
   slug: string
   name?: string | null
   headline?: string | null
   location?: string | null
   company?: string | null
   title?: string | null
   connectedOn?: string | null
   note?: string | null
   signals?: Signal[]
}

export const wordsWriter = async (userId: string, text: string, who: Who[], accountIds: string[]) => {
   const [stored, accountNames] = await Promise.all([
      MessageValuesService.factsFor(
         userId,
         who.map(({ slug }) => slug)
      ),
      MessageValuesService.accountFirstNames(userId, accountIds),
   ])

   return (person: Who, accountId?: string) => {
      const base: PersonFacts = stored.get(person.slug) ?? {}

      return renderTemplate(
         text,
         templateValues(
            {
               ...base,
               name: person.name ?? base.name,
               headline: person.headline ?? base.headline,
               location: person.location ?? base.location,
               company: person.company ?? base.company,
               title: person.title ?? base.title,
               connectedAt: person.connectedOn ?? base.connectedAt,
               theirNote: person.note ?? base.theirNote,
               signals: [...(person.signals ?? []), ...(base.signals ?? [])],
            },
            {
               slug: person.slug,
               accountFirstName: accountId ? accountNames.get(accountId) : undefined,
            }
         )
      )
   }
}
