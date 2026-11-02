import { templateValues } from 'core'

import {
   type MessageUse,
   TEMPLATE_EXAMPLE_VALUES,
   TEMPLATE_VARIABLES,
   type TemplateValues,
   countVariants,
   renderAll,
   renderTemplate,
   templateProblems,
} from '@automatedLinkedIn/contracts'

import { MessageValuesService } from './messageValues.service'
import { PrismaService } from './prisma.service'

// What the composer shows before anything is sent (.plan/message-composer.md): a few random versions of the text for one person, every
// version the options can make, and what is missing or wrong. Reads the database only; nothing is sent or paid for.

const LIMITS: Record<MessageUse, number> = {
   invite: 200,
   message: 4_000,
   reply: 4_000,
}

const SHOWN = 3
const LISTED = 60

export class MessagePreviewService {
   // A few of the owner's people to preview on, newest touched first; those with a full profile read first.
   public static people(userId: string, search: string) {
      const words = search.trim()

      return PrismaService.client.person.findMany({
         where: {
            userId,
            ...(words && {
               name: {
                  contains: words,
                  mode: 'insensitive' as const,
               },
            }),
            NOT: { name: null },
         },
         orderBy: [{ profileRead: 'desc' }, { lastTouchAt: 'desc' }],
         take: 8,
         select: {
            slug: true,
            name: true,
            headline: true,
            profileRead: true,
         },
      })
   }

   public static async preview(userId: string, input: { use: MessageUse; text: string; slug?: string }) {
      const limit = LIMITS[input.use]
      const problems = templateProblems(input.text, { maxChars: limit })
      const real = input.slug ? await MessageValuesService.factsFor(userId, [input.slug]) : null
      const facts = input.slug ? real?.get(input.slug) : undefined
      const values: TemplateValues = facts ? templateValues(facts, { slug: input.slug ?? '' }) : TEMPLATE_EXAMPLE_VALUES
      const texts = Array.from({ length: SHOWN }, () => renderTemplate(input.text, values))
      const variants = renderAll(input.text, values, LISTED)

      return {
         // Whether the values are a real person's or made up.
         forPerson: facts !== undefined,
         texts: texts.map(({ text }) => text),
         variants,
         total: countVariants(input.text),
         problems,
         longest: Math.max(0, ...variants.map(version => version.length)),
         limit,
         // The variables the text uses that this person has no value for and no fallback written: they come out empty.
         missing: [...new Set(texts.flatMap(({ missing }) => missing))],
         // Which variables have a value for this person, so the chips can show it.
         known: TEMPLATE_VARIABLES.filter(({ key }) => Boolean(values[key]?.trim())).map(({ key }) => key),
      }
   }
}
