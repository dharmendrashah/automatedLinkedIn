import { type MessageUse, TEMPLATE_RAW_MAX, templateProblems } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { PrismaService } from './prisma.service'

// The owner's own starting texts for a note, a message or a reply (.plan/message-composer.md).

export const MAX_TEMPLATES = 50

const NAME_CHARS = 60

const LIMITS: Record<MessageUse, { chars: number; raw: number }> = {
   invite: {
      chars: 200,
      raw: TEMPLATE_RAW_MAX.note,
   },
   message: {
      chars: 4_000,
      raw: TEMPLATE_RAW_MAX.text,
   },
   reply: {
      chars: 4_000,
      raw: TEMPLATE_RAW_MAX.text,
   },
}

const select = {
   id: true,
   use: true,
   name: true,
   text: true,
   updatedAt: true,
} as const

export class MessageTemplateService {
   public static list(userId: string) {
      return PrismaService.client.messageTemplate.findMany({
         where: { userId },
         orderBy: [{ use: 'asc' }, { name: 'asc' }],
         select,
      })
   }

   // Saves a text under a name; the same name for the same use is replaced. A text that does not read, or is too long once its longest
   // version is filled in, is refused with the reason.
   public static async save(userId: string, input: { use: MessageUse; name: string; text: string }) {
      const name = input.name.trim().slice(0, NAME_CHARS)
      const text = input.text.trim()
      const { chars, raw } = LIMITS[input.use]
      const [problem] = templateProblems(text, { maxChars: chars })

      if (name === '' || text === '') {
         throw new ConflictError('Give the template a name and some words.')
      }

      if (problem || text.length > raw) {
         throw new ConflictError(problem ?? 'The text is too long to save.')
      }

      const known = await PrismaService.client.messageTemplate.findUnique({
         where: {
            userId_use_name: {
               userId,
               use: input.use,
               name,
            },
         },
         select: { id: true },
      })

      if (!known && (await PrismaService.client.messageTemplate.count({ where: { userId } })) >= MAX_TEMPLATES) {
         throw new ConflictError(`You can keep ${MAX_TEMPLATES} templates. Delete one first.`)
      }

      return PrismaService.client.messageTemplate.upsert({
         where: {
            userId_use_name: {
               userId,
               use: input.use,
               name,
            },
         },
         create: {
            userId,
            use: input.use,
            name,
            text,
         },
         update: { text },
         select,
      })
   }

   // False when it is not the owner's.
   public static async remove(userId: string, id: string) {
      const { count } = await PrismaService.client.messageTemplate.deleteMany({
         where: {
            id,
            userId,
         },
      })

      return count === 1
   }
}
