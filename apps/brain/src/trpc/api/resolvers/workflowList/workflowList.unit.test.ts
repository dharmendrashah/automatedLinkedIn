import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { workflowList } from './workflowList'

const mocks = vi.hoisted(() => {
   class ConflictError extends Error {}

   return {
      ConflictError,
      addMember: vi.fn(),
      moveMember: vi.fn(),
      deleteList: vi.fn(),
      exportList: vi.fn(),
   }
})

vi.mock('database', () => ({
   ConflictError: mocks.ConflictError,
   WorkflowListService: {
      addMember: mocks.addMember,
      moveMember: mocks.moveMember,
      deleteList: mocks.deleteList,
      exportList: mocks.exportList,
   },
}))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   AUTHENTIK_INTERNAL_URL: '',
   DATABASE_URL: 'postgresql://localhost:5432/test',
   CORS_ORIGINS: 'http://localhost:3000',
   LINKEDIN_CRED_ENC_KEY: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
   GIT_SHA: 'test',
   BUILD_TIME: 'test',
   PORT: 3001,
}))

const ctx = {
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: { id: 'u1' },
} as unknown as Context

const caller = () => router({ workflowList }).createCaller(ctx).workflowList

describe('workflowList resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   describe('addMember', () => {
      it('should save the profile link with the typed fields', async () => {
         mocks.addMember.mockResolvedValueOnce({ id: 'm1' })

         await caller().addMember({
            listId: 'l1',
            url: 'linkedin.com/in/Ada-Lovelace/',
            headline: ' VP Growth ',
            location: '',
         })

         expect(mocks.addMember).toHaveBeenCalledWith('u1', 'l1', {
            slug: 'ada-lovelace',
            url: 'https://www.linkedin.com/in/ada-lovelace',
            name: null,
            headline: 'VP Growth',
            location: null,
            state: 'QUALIFIED',
         })
      })

      it('should refuse a link that is not a profile', async () => {
         await expect(
            caller().addMember({
               listId: 'l1',
               url: 'linkedin.com/company/acme',
            })
         ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         expect(mocks.addMember).not.toHaveBeenCalled()
      })

      it('should answer CONFLICT with the reason for a person already seen', async () => {
         mocks.addMember.mockRejectedValueOnce(new mocks.ConflictError('This person is on your do-not-contact list.'))

         await expect(
            caller().addMember({
               listId: 'l1',
               url: 'linkedin.com/in/ada',
            })
         ).rejects.toMatchObject({
            code: 'CONFLICT',
            message: 'This person is on your do-not-contact list.',
         })
      })

      it('should answer NOT_FOUND for a foreign list', async () => {
         mocks.addMember.mockResolvedValueOnce(null)

         await expect(
            caller().addMember({
               listId: 'l9',
               url: 'linkedin.com/in/ada',
            })
         ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
   })

   it('should answer NOT_FOUND when nothing was deleted or moved', async () => {
      mocks.deleteList.mockResolvedValueOnce(false)
      mocks.moveMember.mockResolvedValueOnce(null)

      await expect(caller().deleteList({ id: 'l9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
         caller().moveMember({
            id: 'm9',
            listId: 'l1',
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should export the list as CSV with a safe file name', async () => {
      mocks.exportList.mockResolvedValueOnce({
         name: 'Q4 / founders',
         members: [
            {
               name: 'Ada',
               headline: '=cmd',
               location: null,
               url: 'https://www.linkedin.com/in/ada',
               state: 'QUALIFIED',
               status: 'NEW',
               postUrl: null,
               createdAt: new Date('2026-10-17T00:00:00Z'),
            },
         ],
      })

      const { fileName, csv } = await caller().exportCsv({ id: 'l1' })

      expect(fileName).toBe('Q4-founders.csv')
      expect(csv.split('\r\n')[1]).toBe(
         '"Ada","\'=cmd","","https://www.linkedin.com/in/ada","QUALIFIED","NEW","","2026-10-17T00:00:00.000Z"'
      )
   })
})
