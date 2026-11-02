import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ClientService } from './client.service'
import { ConnectionRemoveService } from './connectionRemove.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. What "Remove connection" finds: the connections still on the list of the owner's accounts, and where each removal stands.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let otherUserId: string
let first: string
let second: string
let theirs: string

const account = async (owner: string, name: string) =>
   (
      await db.linkedInAccount.create({
         data: {
            userId: owner,
            email: `${randomUUID()}@example.com`,
            secret: 'x',
            secretIv: 'x',
            secretTag: 'x',
            status: 'ACTIVE',
            clientId: (await ClientService.create(owner, name)).id,
         },
         select: { id: true },
      })
   ).id

const connection = async (
   owner: string,
   forAccount: string,
   slug: string,
   status: 'CONNECTED' | 'REMOVING' | 'REMOVED' | 'GONE' | 'UNKNOWN' | 'FAILED',
   failure?: string
) =>
   (
      await db.linkedInConnection.create({
         data: {
            userId: owner,
            accountId: forAccount,
            slug,
            name: slug.toUpperCase(),
            headline: '',
            status,
            failure,
         },
         select: { id: true },
      })
   ).id

describe('ConnectionRemoveService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      first = await account(userId, 'Acme')
      second = await account(userId, 'Acme two')
      theirs = await account(otherUserId, 'Theirs')
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should give each person the first chosen account they are still on the list of, and none who is gone or another owner’s', async () => {
      const ada = await connection(userId, first, 'ada', 'CONNECTED')
      const adaToo = await connection(userId, second, 'ada', 'CONNECTED')

      await connection(userId, second, 'bob', 'REMOVED')
      await connection(otherUserId, theirs, 'eve', 'CONNECTED')

      const found = await ConnectionRemoveService.connected(userId, [second, first], ['ada', 'bob', 'eve'])

      expect(found).toEqual(
         new Map([
            [
               'ada',
               {
                  id: adaToo,
                  accountId: second,
               },
            ],
         ])
      )
      expect((await ConnectionRemoveService.connected(userId, [first], ['ada'])).get('ada')?.id).toBe(ada)
      expect(await ConnectionRemoveService.connected(userId, [theirs], ['eve'])).toEqual(new Map())
   })

   it('should say where each removal stands: removed, gone already, unsure, failed, or still on its way', async () => {
      const removed = await connection(userId, first, 'r1', 'REMOVED')
      const gone = await connection(userId, first, 'r2', 'GONE')
      const unsure = await connection(userId, first, 'r3', 'UNKNOWN', 'No answer came from the browser.')
      const failed = await connection(userId, first, 'r4', 'FAILED', 'It could not start in time.')
      const going = await connection(userId, first, 'r5', 'REMOVING')
      const standing = await ConnectionRemoveService.standing(userId, [removed, gone, unsure, failed, going])

      expect(standing.get(removed)).toEqual({
         status: 'DONE',
         reason: null,
         label: 'REMOVED',
      })
      expect(standing.get(gone)).toMatchObject({
         status: 'DONE',
         label: 'GONE',
      })
      expect(standing.get(unsure)).toEqual({
         status: 'UNSURE',
         reason: 'No answer came from the browser.',
      })
      expect(standing.get(failed)).toEqual({
         status: 'FAILED',
         reason: 'It could not start in time.',
      })
      expect(standing.get(going)?.status).toBe('WAITING')
      expect(await ConnectionRemoveService.standing(otherUserId, [removed])).toEqual(new Map())
   })
})
