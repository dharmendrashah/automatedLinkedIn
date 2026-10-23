import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { unibox } from './unibox'

const mocks = vi.hoisted(() => ({
   accounts: vi.fn(),
   list: vi.fn(),
   get: vi.fn(),
   setUnread: vi.fn(),
   setDone: vi.fn(),
   fileLink: vi.fn(),
   request: vi.fn(),
   send: vi.fn(),
   reply: vi.fn(),
   TaskRefusedError: class TaskRefusedError extends Error {},
}))

vi.mock('database', () => ({
   MAX_IDS: 500,
   LinkedInConversationService: {
      accounts: mocks.accounts,
      list: mocks.list,
      get: mocks.get,
      setUnread: mocks.setUnread,
      setDone: mocks.setDone,
      fileLink: mocks.fileLink,
   },
   MessagesRefresh: { request: mocks.request },
   LinkedInReplyService: {
      send: mocks.send,
      get: mocks.reply,
   },
   REPLY_LIMITS: { maxChars: 4000 },
   TaskRefusedError: mocks.TaskRefusedError,
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

const user = {
   id: 'u1',
   email: 'ada@elitale.com',
   name: 'Ada',
   role: 'USER',
   authentikId: 'sub-1',
   createdAt: new Date(),
   updatedAt: new Date(),
}

const authed = (): Partial<Context> => ({
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: user as never,
})

const caller = () => router({ unibox }).createCaller(authed() as Context).unibox

describe('unibox router', () => {
   beforeEach(() => vi.resetAllMocks())

   it('should refuse a caller who is not signed in', async () => {
      await expect(
         router({ unibox })
            .createCaller({} as Context)
            .unibox.accounts()
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
   })

   it('should list the signed-in owner only, and pass the accounts asked for', async () => {
      mocks.list.mockResolvedValue([])
      mocks.accounts.mockResolvedValue([])

      await caller().conversations({ accountIds: ['a1'] })
      await caller().conversations({})
      await caller().accounts()

      expect(mocks.list).toHaveBeenNthCalledWith(1, 'u1', ['a1'])
      expect(mocks.list).toHaveBeenNthCalledWith(2, 'u1', undefined)
      expect(mocks.accounts).toHaveBeenCalledWith('u1')
   })

   it('should answer a conversation that is not the owner as not found', async () => {
      mocks.get.mockResolvedValueOnce(null)
      mocks.get.mockResolvedValueOnce({ id: 'c1' })

      await expect(caller().conversation({ id: 'c9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(caller().conversation({ id: 'c1' })).resolves.toEqual({ id: 'c1' })
      expect(mocks.get).toHaveBeenCalledWith('u1', 'c1')
   })

   it('should mark read, unread and done for the owner, and say how many changed', async () => {
      mocks.setUnread.mockResolvedValue(2)
      mocks.setDone.mockResolvedValue(1)

      await expect(
         caller().setUnread({
            ids: ['c1', 'c2'],
            unread: false,
         })
      ).resolves.toEqual({ changed: 2 })
      await expect(
         caller().setDone({
            ids: ['c1'],
            done: true,
         })
      ).resolves.toEqual({ changed: 1 })

      expect(mocks.setUnread).toHaveBeenCalledWith('u1', ['c1', 'c2'], false)
      expect(mocks.setDone).toHaveBeenCalledWith('u1', ['c1'], true)
   })

   it('should refuse no ids, too many ids and an empty id', async () => {
      await expect(
         caller().setUnread({
            ids: [],
            unread: true,
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
         caller().setDone({
            ids: Array.from({ length: 501 }, (_, index) => `c${index}`),
            done: true,
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
         caller().setDone({
            ids: [''],
            done: true,
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.setDone).not.toHaveBeenCalled()
   })

   it('should start a read for the owner and report the accounts left out, and say when there is no account', async () => {
      mocks.request.mockResolvedValueOnce({
         started: 1,
         skipped: [
            {
               accountId: 'a2',
               reason: 'A task is running.',
            },
         ],
      })
      mocks.request.mockResolvedValueOnce({
         started: 0,
         skipped: [],
      })

      await expect(caller().refresh({ accountIds: ['a1', 'a2'] })).resolves.toEqual({
         started: 1,
         skipped: [
            {
               accountId: 'a2',
               reason: 'A task is running.',
            },
         ],
      })
      expect(mocks.request).toHaveBeenCalledWith('u1', ['a1', 'a2'])
      await expect(caller().refresh({})).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should send a trimmed reply for the owner and answer with its id', async () => {
      mocks.send.mockResolvedValue({ id: 'r1' })

      await expect(
         caller().send({
            conversationId: 'c1',
            text: '  Tomorrow works.  ',
         })
      ).resolves.toEqual({ id: 'r1' })
      expect(mocks.send).toHaveBeenCalledWith('u1', 'c1', 'Tomorrow works.', undefined)
   })

   it('should send files with no words, and pass the upload on', async () => {
      mocks.send.mockResolvedValue({ id: 'r2' })

      await expect(
         caller().send({
            conversationId: 'c1',
            text: '',
            uploadId: '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34',
         })
      ).resolves.toEqual({ id: 'r2' })
      expect(mocks.send).toHaveBeenCalledWith('u1', 'c1', '', '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34')
   })

   it('should refuse an upload id that is not valid, and a reply with neither words nor files', async () => {
      await expect(
         caller().send({
            conversationId: 'c1',
            text: 'Hi',
            uploadId: '../x',
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
         caller().send({
            conversationId: 'c1',
            text: '',
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.send).not.toHaveBeenCalled()
   })

   it('should refuse an empty or too long reply before anything starts', async () => {
      await expect(
         caller().send({
            conversationId: 'c1',
            text: '   ',
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
         caller().send({
            conversationId: 'c1',
            text: 'x'.repeat(4001),
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.send).not.toHaveBeenCalled()
   })

   it('should say not found for a conversation that is not the owner, and the reason for a reply that is not allowed now', async () => {
      mocks.send.mockResolvedValueOnce(null)
      mocks.send.mockRejectedValueOnce(
         new mocks.TaskRefusedError('Wait 20 seconds before the next reply from this account.')
      )

      await expect(
         caller().send({
            conversationId: 'c9',
            text: 'Hi',
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
         caller().send({
            conversationId: 'c1',
            text: 'Hi',
         })
      ).rejects.toMatchObject({
         code: 'PRECONDITION_FAILED',
         message: 'Wait 20 seconds before the next reply from this account.',
      })
   })

   it('should answer where a reply of the owner is, and not found for another one', async () => {
      mocks.reply.mockResolvedValueOnce({
         id: 'r1',
         state: 'SENT',
      })
      mocks.reply.mockResolvedValueOnce(null)

      await expect(caller().reply({ id: 'r1' })).resolves.toEqual({
         id: 'r1',
         state: 'SENT',
      })
      await expect(caller().reply({ id: 'r9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(mocks.reply).toHaveBeenCalledWith('u1', 'r1')
   })

   it('should give a short link to a kept file of the owner, and not found for a file that is not theirs or not kept', async () => {
      mocks.fileLink.mockResolvedValueOnce('https://signed.example/file')
      mocks.fileLink.mockResolvedValueOnce(null)

      await expect(
         caller().fileLink({
            messageId: 'm1',
            index: 1,
         })
      ).resolves.toEqual({ url: 'https://signed.example/file' })
      await expect(
         caller().fileLink({
            messageId: 'm9',
            index: 0,
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(mocks.fileLink).toHaveBeenCalledWith('u1', 'm1', 1)
      await expect(
         caller().fileLink({
            messageId: 'm1',
            index: -1,
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
   })
})
