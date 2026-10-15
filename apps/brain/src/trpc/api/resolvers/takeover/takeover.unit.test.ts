import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { takeover } from './takeover'

const mocks = vi.hoisted(() => {
   class TakeoverNotFoundError extends Error {}
   class TakeoverRateError extends Error {}

   return {
      TakeoverNotFoundError,
      TakeoverRateError,
      listForUser: vi.fn(),
      frameForUser: vi.fn(),
      sendForUser: vi.fn(),
   }
})

vi.mock('database', () => ({
   TakeoverNotFoundError: mocks.TakeoverNotFoundError,
   TakeoverService: {
      listForUser: mocks.listForUser,
      frameForUser: mocks.frameForUser,
      sendForUser: mocks.sendForUser,
   },
}))

vi.mock('core', () => ({ TakeoverRateError: mocks.TakeoverRateError }))

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

const ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

const user = {
   id: 'user-1',
   email: 'ada@example.com',
   name: 'Ada',
   role: 'USER',
   authentikId: 'sub-1',
   createdAt: new Date(),
   updatedAt: new Date(),
}

const caller = (authenticated = true) =>
   router({ takeover }).createCaller(
      (authenticated
         ? {
              auth: {
                 token: 'tok',
                 sub: 'sub-1',
              },
              user,
           }
         : {}) as unknown as Context
   ).takeover

describe('takeover router', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   it('should refuse a caller who is not signed in', async () => {
      await expect(caller(false).list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(mocks.listForUser).not.toHaveBeenCalled()
   })

   it("should list the runs waiting for the signed-in user, scoped to the user's id", async () => {
      mocks.listForUser.mockResolvedValue([{ id: ID }])

      await expect(caller().list()).resolves.toEqual([{ id: ID }])
      expect(mocks.listForUser).toHaveBeenCalledWith('user-1')
   })

   it('should give the newest picture of a run', async () => {
      mocks.frameForUser.mockResolvedValue({ seq: 4 })

      await expect(caller().frame({ id: ID })).resolves.toEqual({ seq: 4 })
      expect(mocks.frameForUser).toHaveBeenCalledWith('user-1', ID)
   })

   it('should answer NOT_FOUND for a run that is not waiting for the user', async () => {
      mocks.frameForUser.mockRejectedValue(new mocks.TakeoverNotFoundError())

      await expect(caller().frame({ id: ID })).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should pass an input of the contract on, and nothing else', async () => {
      mocks.sendForUser.mockResolvedValue(undefined)

      await caller().send({
         id: ID,
         input: {
            kind: 'click',
            x: 0.5,
            y: 0.5,
         },
      })

      expect(mocks.sendForUser).toHaveBeenCalledWith('user-1', ID, {
         kind: 'click',
         x: 0.5,
         y: 0.5,
      })

      await expect(
         caller().send({
            id: ID,
            input: {
               kind: 'evaluate',
               code: 'x',
            } as never,
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.sendForUser).toHaveBeenCalledTimes(1)
   })

   it('should answer TOO_MANY_REQUESTS when inputs come faster than a person can make them', async () => {
      mocks.sendForUser.mockRejectedValue(new mocks.TakeoverRateError())

      await expect(
         caller().send({
            id: ID,
            input: { kind: 'done' },
         })
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
   })

   it('should not leak what went wrong inside', async () => {
      mocks.sendForUser.mockRejectedValue(new Error('amqp://user:secret@rabbit refused'))

      const error = await caller()
         .send({
            id: ID,
            input: { kind: 'done' },
         })
         .catch((caught: Error) => caught)

      expect(error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
      expect(String((error as Error).message)).not.toContain('secret')
   })
})
