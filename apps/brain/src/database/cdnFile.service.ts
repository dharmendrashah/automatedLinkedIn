import { PrismaService } from './prisma.service'

// A fetch that has not finished in this time is taken to have died with its pod.
export const STALE_PENDING_MS = 5 * 60 * 1000

// The rows of the public file cache (.plan/cdn-public-endpoint.md), one per remote URL hash.
export class CdnFileService {
   public static find(hash: string) {
      return PrismaService.client.cdnFile.findUnique({ where: { hash } })
   }

   // Takes the fetch of a file for this call: a new row, a deleted one, or one whose fetch went stale. Null when another call has it.
   public static async claim(hash: string, path: string) {
      const { client } = PrismaService
      const created = await client.cdnFile.createMany({
         data: [
            {
               hash,
               path,
               status: 'PENDING',
            },
         ],
         skipDuplicates: true,
      })

      if (created.count === 0) {
         // The row lock makes a second take-over re-read the row and find it fresh, so only one call wins.
         const taken = await client.cdnFile.updateMany({
            where: {
               hash,
               path,
               OR: [
                  { status: 'DELETED' },
                  {
                     status: 'PENDING',
                     updatedAt: { lt: new Date(Date.now() - STALE_PENDING_MS) },
                  },
               ],
            },
            data: { status: 'PENDING' },
         })

         if (taken.count === 0) {
            return null
         }
      }

      return client.cdnFile.findUnique({ where: { hash } })
   }

   public static saved(hash: string, file: { bucketUrl: string; contentType: string; size: number }) {
      return PrismaService.client.cdnFile.update({
         where: { hash },
         data: {
            status: 'SAVED',
            ...file,
         },
      })
   }

   // Gives a claim back after a failed fetch: a row never saved goes, one saved before is deleted again (its key is kept).
   public static async release(hash: string) {
      const { client } = PrismaService

      await client.cdnFile.deleteMany({
         where: {
            hash,
            status: 'PENDING',
            bucketUrl: null,
         },
      })
      await client.cdnFile.updateMany({
         where: {
            hash,
            status: 'PENDING',
         },
         data: { status: 'DELETED' },
      })
   }
}
