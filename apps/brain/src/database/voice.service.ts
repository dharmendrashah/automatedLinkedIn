import { type VoiceInput, voiceSchema } from '@automatedLinkedIn/contracts'

import { ConflictError, isUniqueViolation } from './conflict'
import { PrismaService } from './prisma.service'

// How the owner's words sound (.plan/lead-pipeline-p4-ai-drafts.md), picked by Write words. Scoped to the owner.

// The most voices an owner keeps.
export const MAX_VOICES = 20

const select = {
   id: true,
   name: true,
   about: true,
   tone: true,
   language: true,
   avoid: true,
   rules: true,
} as const

export class VoiceService {
   public static list(userId: string) {
      return PrismaService.client.writingVoice.findMany({
         where: { userId },
         orderBy: { name: 'asc' },
         select,
      })
   }

   public static get(userId: string, id: string) {
      return PrismaService.client.writingVoice.findFirst({
         where: {
            id,
            userId,
         },
         select,
      })
   }

   // Makes a voice, or changes the owner's own (`id`). null when `id` is not the owner's.
   public static async save(userId: string, input: VoiceInput, id?: string) {
      const data = voiceSchema.parse(input)
      const db = PrismaService.client

      try {
         if (id) {
            const { count } = await db.writingVoice.updateMany({
               where: {
                  id,
                  userId,
               },
               data,
            })

            return count === 1 ? this.get(userId, id) : null
         }

         if ((await db.writingVoice.count({ where: { userId } })) >= MAX_VOICES) {
            throw new ConflictError(`You can keep up to ${MAX_VOICES} voices. Delete one first.`)
         }

         return await db.writingVoice.create({
            data: {
               ...data,
               userId,
            },
            select,
         })
      } catch (error) {
         if (isUniqueViolation(error)) {
            throw new ConflictError(`You already have a voice named "${data.name}".`)
         }

         throw error
      }
   }

   public static async remove(userId: string, id: string) {
      const { count } = await PrismaService.client.writingVoice.deleteMany({
         where: {
            id,
            userId,
         },
      })

      return count === 1
   }
}
