import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { CdnFileService, STALE_PENDING_MS } from './cdnFile.service'
import { PrismaService } from './prisma.service'

// Needs PostgreSQL.

const hashes: string[] = []

const newFile = () => {
   const hash = randomUUID().replace(/-/g, '')

   hashes.push(hash)

   return {
      hash,
      path: `https://a.com/${hash}.jpg`,
   }
}

const saved = {
   bucketUrl: 'gs://cdn/cache/a.com/jpg/2026/10/30/h.jpg',
   contentType: 'image/jpeg',
   size: 3,
}

describe('CdnFileService (database)', () => {
   afterAll(async () => {
      await PrismaService.client.cdnFile.deleteMany({ where: { hash: { in: hashes } } })
   })

   it('should let only one of many calls claim a new file', async () => {
      const { hash, path } = newFile()

      const claims = await Promise.all(Array.from({ length: 5 }, () => CdnFileService.claim(hash, path)))

      expect(claims.filter(Boolean)).toHaveLength(1)
      expect(claims.find(Boolean)).toMatchObject({
         status: 'PENDING',
         bucketUrl: null,
      })
   })

   it('should not claim a saved file, nor a file of another address with the same hash', async () => {
      const { hash, path } = newFile()

      await CdnFileService.claim(hash, path)
      await CdnFileService.saved(hash, saved)

      expect(await CdnFileService.claim(hash, path)).toBeNull()
      expect(await CdnFileService.find(hash)).toMatchObject({
         status: 'SAVED',
         ...saved,
      })
   })

   it('should let one call take over a fetch that went stale', async () => {
      const { hash, path } = newFile()

      await CdnFileService.claim(hash, path)
      await PrismaService.client
         .$executeRaw`UPDATE "CdnFile" SET "updatedAt" = ${new Date(Date.now() - STALE_PENDING_MS - 1000)} WHERE hash = ${hash}`

      const claims = await Promise.all([CdnFileService.claim(hash, path), CdnFileService.claim(hash, path)])

      expect(claims.filter(Boolean)).toHaveLength(1)
   })

   it('should claim a deleted file again with its old key, and put it back when the fetch fails', async () => {
      const { hash, path } = newFile()

      await CdnFileService.claim(hash, path)
      await CdnFileService.saved(hash, saved)
      await PrismaService.client.cdnFile.update({
         where: { hash },
         data: { status: 'DELETED' },
      })

      expect(await CdnFileService.claim(hash, path)).toMatchObject({
         status: 'PENDING',
         bucketUrl: saved.bucketUrl,
      })

      await CdnFileService.release(hash)

      expect(await CdnFileService.find(hash)).toMatchObject({
         status: 'DELETED',
         bucketUrl: saved.bucketUrl,
      })
   })

   it('should drop a new row when its fetch fails, so the next call fetches again', async () => {
      const { hash, path } = newFile()

      await CdnFileService.claim(hash, path)
      await CdnFileService.release(hash)

      expect(await CdnFileService.find(hash)).toBeNull()
      expect(await CdnFileService.claim(hash, path)).not.toBeNull()
   })
})
