import { PostFiles } from 'core'

import { type PostDraft } from 'generated/prisma/client'

import {
   POST_DRAFTS_MAX,
   type PostBlock,
   type PostDraftInput,
   postBlocksSchema,
   postFilesOf,
   postKey,
   safeFileName,
} from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { orNull } from './linkedInRecord'
import { PrismaService } from './prisma.service'

export type StoredPostDraft = {
   id: string
   accountId: string
   blocks: PostBlock[]
   plannedAt: string | null
   plannedZone: string | null
   createdAt: string
   updatedAt: string
}

// A row whose blocks no longer fit the contract is not served: the page would have to guess what it holds.
const readDraft = (row: PostDraft): StoredPostDraft | null => {
   const blocks = postBlocksSchema.safeParse(row.blocks)

   return blocks.success
      ? {
           id: row.id,
           accountId: row.accountId,
           blocks: blocks.data,
           plannedAt: row.plannedAt?.toISOString() ?? null,
           plannedZone: row.plannedZone,
           createdAt: row.createdAt.toISOString(),
           updatedAt: row.updatedAt.toISOString(),
        }
      : null
}

const keysOf = (blocks: PostBlock[]) => postFilesOf(blocks).flatMap(({ key }) => (key ? [key] : []))

// A key is only taken when it is exactly where this owner's upload of that file ends up, so a draft cannot point at anyone else's object.
const ownsKeys = (userId: string, blocks: PostBlock[]) =>
   postFilesOf(blocks).every(
      ({ id, name, key }) => key === undefined || key === postKey(userId, id, safeFileName(name))
   )

// Files nobody refers to any more are deleted after the draft changed; a failure is logged and never fails the save.
const dropFiles = async (keys: string[]) => {
   if (keys.length === 0) {
      return
   }

   const failed = await PostFiles.remove(keys).catch(() => keys.length)

   if (failed > 0) {
      console.error(`Post files: ${failed} of ${keys.length} could not be deleted`)
   }
}

// The posts an owner is writing (.plan/posting-page.md). Every call names the owner, so a foreign id is the same as a missing one.
export class PostDraftService {
   public static async list(userId: string) {
      const rows = await PrismaService.client.postDraft.findMany({
         where: { userId },
         orderBy: { updatedAt: 'desc' },
         take: POST_DRAFTS_MAX,
      })
      const items = rows.map(readDraft).filter((draft): draft is StoredPostDraft => draft !== null)

      return {
         items,
         unreadable: rows.length - items.length,
      }
   }

   public static async get(userId: string, id: string) {
      const row = await PrismaService.client.postDraft.findFirst({
         where: {
            id,
            userId,
         },
      })

      return row ? readDraft(row) : null
   }

   // Creates the draft when the input has no id, else changes the owner's own. Null when the account or the draft is not the owner's.
   // The files the draft no longer carries are deleted from the bucket afterwards.
   public static async save(userId: string, input: PostDraftInput) {
      const account = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id: input.accountId,
            userId,
         },
         select: { id: true },
      })

      if (!account) {
         return null
      }

      if (!ownsKeys(userId, input.blocks)) {
         throw new ConflictError('A file of this post is not yours. Attach it again.')
      }

      const data = {
         accountId: input.accountId,
         blocks: input.blocks,
         plannedAt: input.plannedAt === null ? null : new Date(input.plannedAt),
         plannedZone: input.plannedZone,
      }

      if (input.id === undefined) {
         if ((await PrismaService.client.postDraft.count({ where: { userId } })) >= POST_DRAFTS_MAX) {
            throw new ConflictError(`You have ${POST_DRAFTS_MAX} drafts. Delete one to start another.`)
         }

         const created = await PrismaService.client.postDraft.create({
            data: {
               userId,
               ...data,
            },
         })

         return readDraft(created)
      }

      const before = await PrismaService.client.postDraft.findFirst({
         where: {
            id: input.id,
            userId,
         },
      })

      if (!before) {
         return null
      }

      const updated = await orNull(
         PrismaService.client.postDraft.update({
            where: {
               id: input.id,
               userId,
            },
            data,
         })
      )

      if (!updated) {
         return null
      }

      const kept = new Set(keysOf(input.blocks))
      const old = postBlocksSchema.safeParse(before.blocks)

      await dropFiles(old.success ? keysOf(old.data).filter(key => !kept.has(key)) : [])

      return readDraft(updated)
   }

   public static async remove(userId: string, id: string) {
      const before = await PrismaService.client.postDraft.findFirst({
         where: {
            id,
            userId,
         },
      })
      const { count } = await PrismaService.client.postDraft.deleteMany({
         where: {
            id,
            userId,
         },
      })
      const old = postBlocksSchema.safeParse(before?.blocks)

      if (count > 0 && old.success) {
         await dropFiles(keysOf(old.data))
      }

      return count > 0
   }

   // Removing a LinkedIn account removes its drafts with it; their files go first, so that a failure leaves the account to try again.
   public static async removeFilesOfAccount(userId: string, accountId: string) {
      const rows = await PrismaService.client.postDraft.findMany({
         where: {
            userId,
            accountId,
         },
         select: { blocks: true },
      })
      const keys = rows.flatMap(({ blocks }) => {
         const parsed = postBlocksSchema.safeParse(blocks)

         return parsed.success ? keysOf(parsed.data) : []
      })

      if (keys.length > 0 && (await PostFiles.remove(keys)) > 0) {
         throw new Error('The files of the drafts could not be deleted.')
      }
   }
}
