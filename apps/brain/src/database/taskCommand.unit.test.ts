import { describe, expect, it } from 'vitest'

import { type CommandParts, buildTaskCommand } from './taskCommand'

const account = {
   id: 'acc1',
   email: 'ada@work.com',
   secret: 'Y2lwaGVy',
   secretIv: 'aXY=',
   secretTag: 'dGFn',
   keyVersion: 1,
}

const parts = (overrides: Partial<CommandParts> = {}): CommandParts => ({
   id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   userId: 'u1',
   task: 'browser-detection',
   taskVersion: 1,
   requestedAt: new Date('2026-10-16T10:00:00.123Z'),
   trigger: 'manual',
   input: {},
   needs: {
      proxy: 'required',
      account: false,
   },
   proxy: { server: 'http://proxy.example.net:8080' },
   account,
   ...overrides,
})

describe('buildTaskCommand', () => {
   it('should make the command the spider reads, with the time of the session to the millisecond', () => {
      expect(buildTaskCommand(parts())).toEqual({
         contract: 1,
         task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
         user_id: 'u1',
         task: 'browser-detection',
         task_version: 1,
         requested_at: '2026-10-16T10:00:00.123Z',
         trigger: 'manual',
         proxy: { server: 'http://proxy.example.net:8080' },
         input: {},
      })
   })

   it('should add the account and its sealed credentials only for a task that needs them', () => {
      const withAccount = buildTaskCommand(
         parts({
            needs: {
               proxy: 'required',
               account: true,
            },
         })
      )

      expect(withAccount).toMatchObject({
         account_id: 'acc1',
         account_email: 'ada@work.com',
         credentials: {
            ciphertext: 'Y2lwaGVy',
            iv: 'aXY=',
            tag: 'dGFn',
            key_version: 1,
         },
      })
      expect(buildTaskCommand(parts())).not.toHaveProperty('credentials')
   })

   it('should leave the proxy out when there is none', () => {
      expect(buildTaskCommand(parts({ proxy: undefined }))).not.toHaveProperty('proxy')
   })

   it('should throw for a command that can never be published', () => {
      expect(() => buildTaskCommand(parts({ input: { big: 'x'.repeat(9000) } }))).toThrow()
      expect(() => buildTaskCommand(parts({ userId: '../x' }))).toThrow()
   })
})
