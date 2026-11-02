import { describe, expect, it } from 'vitest'

import {
   type Graph,
   MESSAGE_MAX_CHARS,
   type NodeConfig,
   applyApiInput,
   blockOf,
   catalog,
   convertsTo,
   errorsOf,
   validateGraph,
} from './workflow'

const node = (id: string, type: Graph['nodes'][number]['type'], config: NodeConfig = {}) => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const problems = (...nodes: Graph['nodes']) =>
   errorsOf(
      validateGraph({
         nodes,
         edges: nodes.slice(1).map((next, index) => ({
            from: nodes[index]?.id ?? '',
            to: next.id,
         })),
      })
   ).map(({ message }) => message)

describe('the account settings of the Account Actions blocks', () => {
   it('should read a block saved before as the nearest Select accounts, with the wait it had', () => {
      expect(blockOf('account.visitProfile').config.parse({})).toMatchObject({
         accountMode: 'pool',
         account: '',
         timeLimitHours: 8,
      })
      expect(blockOf('account.writePost').config.parse({})).toMatchObject({
         accountMode: 'pool',
         timeLimitHours: 1,
      })
   })

   it('should need Select accounts only when the block takes its accounts from it', () => {
      expect(problems(node('visit', 'account.visitProfile'))).toEqual([
         'Visit profile needs "Select accounts" before it, or one account picked on the block.',
      ])
      expect(
         problems(
            node('visit', 'account.visitProfile', {
               accountMode: 'one',
               account: 'a1',
            })
         )
      ).toEqual([])
      expect(problems(node('visit', 'account.visitProfile', { accountMode: 'one' }))).toEqual([
         'Visit profile: pick the account it uses.',
      ])
   })

   it('should refuse a time limit outside 1 to 48 hours', () => {
      const schema = blockOf('account.visitCompany').config

      expect(schema.safeParse({ timeLimitHours: 0 }).success).toBe(false)
      expect(schema.safeParse({ timeLimitHours: 49 }).success).toBe(false)
      expect(schema.safeParse({ timeLimitHours: 48 }).success).toBe(true)
   })
})

describe('Get my connections', () => {
   it('should start a chain on its own, give people, and wait 2 hours by default', () => {
      expect(blockOf('account.getConnections')).toMatchObject({
         input: 'start',
         output: 'profile',
      })
      expect(blockOf('account.getConnections').config.parse({})).toMatchObject({
         howMany: 100,
         accountMode: 'pool',
         timeLimitHours: 2,
      })
   })

   it('should take the account a call names, and turn on One account with it', () => {
      expect(applyApiInput('account.getConnections', { howMany: 5 }, { account: 'a1' })).toEqual({
         howMany: 5,
         account: 'a1',
         accountMode: 'one',
      })
      expect(applyApiInput('account.getConnections', { howMany: 5 }, {})).toEqual({ howMany: 5 })
   })

   it('should carry a made-up sample out in the catalog, and none where a block has none', () => {
      const entry = catalog().find(({ type }) => type === 'account.getConnections')

      expect(entry?.sample?.out).toMatchObject({ name: 'Ada Lovelace' })
      expect(catalog().find(({ type }) => type === 'account.select')?.sample).toBeNull()
   })
})

describe('Answer connection requests', () => {
   it('should take people, give them back, start with Act for real off and a wait of 8 hours', () => {
      expect(blockOf('account.answerRequests')).toMatchObject({
         input: 'profile',
         output: 'profile',
      })
      expect(blockOf('account.answerRequests').config.parse({})).toMatchObject({
         action: 'accept',
         actForReal: false,
         accountMode: 'pool',
         timeLimitHours: 8,
      })
   })

   it('should say a run answers nothing while Act for real is off, and not once it is on', () => {
      const blocks = (actForReal: boolean) =>
         validateGraph({
            nodes: [
               node('read', 'account.getRequests', {
                  accountMode: 'one',
                  account: 'a1',
               }),
               node('answer', 'account.answerRequests', {
                  accountMode: 'one',
                  account: 'a1',
                  actForReal,
               }),
            ],
            edges: [
               {
                  from: 'read',
                  to: 'answer',
               },
            ],
         }).map(({ message }) => message)

      expect(blocks(false)).toContain(
         'Answer connection requests: "Act for real" is off, so a run answers nothing yet.'
      )
      expect(blocks(true)).not.toContain(
         'Answer connection requests: "Act for real" is off, so a run answers nothing yet.'
      )
   })

   it('should mark the settings that decide what goes out as ones that switch Act for real off', () => {
      const { fields } = blockOf('account.answerRequests')

      expect(fields.find(({ key }) => key === 'action')).toMatchObject({ disarms: true })
      expect(fields.find(({ key }) => key === 'actForReal')).toMatchObject({ kind: 'toggle' })
   })
})

describe('Send and Withdraw connection request', () => {
   it('should take people and give them back, start with Act for real off, and keep a note of at most 200 characters', () => {
      expect(blockOf('account.sendInvite')).toMatchObject({
         input: 'profile',
         output: 'profile',
      })
      expect(blockOf('account.sendInvite').config.parse({})).toMatchObject({
         note: '',
         actForReal: false,
         timeLimitHours: 1,
      })
      expect(blockOf('account.sendInvite').config.safeParse({ note: 'x'.repeat(201) }).success).toBe(false)
      expect(blockOf('account.sendInvite').fields.find(({ key }) => key === 'note')).toMatchObject({ disarms: true })
   })

   it('should say a run sends nothing while Act for real is off, and have no such setting on Withdraw', () => {
      const note = (type: 'account.sendInvite', actForReal: boolean) =>
         validateGraph({
            nodes: [
               node('one', type, {
                  accountMode: 'one',
                  account: 'a1',
                  actForReal,
               }),
            ],
            edges: [],
         }).map(({ message }) => message)

      expect(note('account.sendInvite', false)).toContain(
         'Send connection request: "Act for real" is off, so a run sends nothing yet.'
      )
      expect(note('account.sendInvite', true)).not.toContain(
         'Send connection request: "Act for real" is off, so a run sends nothing yet.'
      )
      expect(blockOf('account.withdrawInvite').fields.some(({ key }) => key === 'actForReal')).toBe(false)
   })
})

describe('Remove connection', () => {
   it('should take people and give them back, start with Act for real off, and say so while it is off', () => {
      expect(blockOf('account.removeConnection')).toMatchObject({
         input: 'profile',
         output: 'profile',
      })
      expect(blockOf('account.removeConnection').config.parse({})).toMatchObject({
         actForReal: false,
         timeLimitHours: 8,
      })

      const messages = validateGraph({
         nodes: [
            node('one', 'account.removeConnection', {
               accountMode: 'one',
               account: 'a1',
            }),
         ],
         edges: [],
      }).map(({ message }) => message)

      expect(messages).toContain('Remove connection: "Act for real" is off, so a run removes nothing yet.')
   })
})

describe('Write a post from a saved draft, now or after a wait', () => {
   it('should need a draft picked when it posts one, and not need words written then', () => {
      const messages = (config: NodeConfig) =>
         validateGraph({
            nodes: [
               node('post', 'account.writePost', {
                  accountMode: 'one',
                  account: 'a1',
                  ...config,
               }),
            ],
            edges: [],
         }).map(({ message }) => message)

      expect(messages({ source: 'draft' })).toContain('Write a post: pick the saved draft it posts.')
      expect(
         messages({
            source: 'draft',
            draft: 'd1',
         })
      ).not.toContain('Write the post: it needs words or a file.')
      expect(messages({})).toContain('Write the post: it needs words or a file.')
   })

   it('should start posting now from words written in the block, and take a wait of 1 to 168 hours', () => {
      const schema = blockOf('account.writePost').config

      expect(schema.parse({})).toMatchObject({
         source: 'write',
         when: 'now',
      })
      expect(schema.safeParse({ afterHours: 0 }).success).toBe(false)
      expect(schema.safeParse({ afterHours: 169 }).success).toBe(false)
      expect(schema.safeParse({ source: 'elsewhere' }).success).toBe(false)
   })
})

describe('Send message and Reply in a conversation', () => {
   it('should take people and conversations, start with Act for real off, and wait 8 hours', () => {
      expect(blockOf('account.sendMessage')).toMatchObject({
         input: 'profile',
         output: 'profile',
      })
      expect(blockOf('account.replyToConversation')).toMatchObject({
         input: 'conversation',
         output: 'conversation',
      })
      expect(blockOf('account.sendMessage').config.parse({})).toMatchObject({
         text: '',
         notAgainHours: 24,
         actForReal: false,
         timeLimitHours: 8,
      })
      expect(blockOf('account.replyToConversation').config.parse({})).toMatchObject({
         onlyIfTheyWroteLast: true,
         notAgainHours: 24,
         actForReal: false,
      })
   })

   it('should refuse a message longer than the queue takes, and mark what goes out as switching Act for real off', () => {
      expect(blockOf('account.sendMessage').config.safeParse({ text: 'x'.repeat(MESSAGE_MAX_CHARS + 1) }).success).toBe(
         false
      )
      expect(blockOf('account.sendMessage').fields.find(({ key }) => key === 'text')).toMatchObject({
         kind: 'textarea',
         disarms: true,
      })

      const { fields } = blockOf('account.replyToConversation')

      expect(fields.find(({ key }) => key === 'onlyIfTheyWroteLast')).toMatchObject({ disarms: true })
   })

   it('should ask for the words, and say a run sends nothing while Act for real is off', () => {
      const messages = (type: 'account.sendMessage' | 'account.replyToConversation', config: NodeConfig) =>
         validateGraph({
            nodes: [
               node('one', type, {
                  accountMode: 'one',
                  account: 'a1',
                  ...config,
               }),
            ],
            edges: [],
         })

      expect(messages('account.sendMessage', {}).map(({ message }) => message)).toEqual(
         expect.arrayContaining([
            'Send message: "Act for real" is off, so a run sends nothing yet.',
            'Send message: write the message.',
         ])
      )
      expect(
         messages('account.replyToConversation', {
            text: 'Thanks',
            actForReal: true,
         }).map(({ message }) => message)
      ).not.toEqual(expect.arrayContaining([expect.stringContaining('Act for real')]))
   })
})

describe('Get my connection requests and Get my conversations', () => {
   it('should give people and conversations, start a chain on their own, and wait 2 hours', () => {
      expect(blockOf('account.getRequests')).toMatchObject({
         input: 'start',
         output: 'profile',
      })
      expect(blockOf('account.getConversations')).toMatchObject({
         input: 'start',
         output: 'conversation',
      })
      expect(blockOf('account.getConversations').config.parse({})).toMatchObject({
         howMany: 50,
         timeLimitHours: 2,
      })
   })

   it('should turn the conversations a block gets into their people for a block that wants people, and say so', () => {
      expect(convertsTo('conversation', 'profile')).toBe(true)
      expect(convertsTo('conversation', 'company')).toBe(false)

      const notes = validateGraph({
         nodes: [
            node('read', 'account.getConversations', {
               accountMode: 'one',
               account: 'a1',
            }),
            node('visit', 'account.visitProfile', {
               accountMode: 'one',
               account: 'a1',
            }),
         ],
         edges: [
            {
               from: 'read',
               to: 'visit',
            },
         ],
      }).map(({ message }) => message)

      expect(notes).toContain('Visit profile gets conversations: it uses the people in them.')
   })
})
