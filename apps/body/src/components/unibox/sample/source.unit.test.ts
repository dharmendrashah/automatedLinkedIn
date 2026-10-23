import { describe, expect, it } from 'vitest'

import { createSampleSource } from './source'

const now = new Date(2026, 9, 23, 12, 0).getTime()
const instant = async () => undefined

const real = {
   conversations: [
      {
         id: '2-abc',
         title: 'Ada Example',
         kind: 'DIRECT' as const,
         participants: [{ name: 'Ada Example', profileUrl: 'https://www.linkedin.com/in/ada/' }],
         unread: false,
         complete: true,
         messages: [
            {
               id: 'm1',
               sender: { name: 'Ada Example' },
               direction: 'THEM' as const,
               date: '2024-01-25',
               time: '17:18',
               when: '',
               text: 'Hello',
               attachments: [],
            },
         ],
      },
   ],
}

describe('createSampleSource.load', () => {
   it('should give invented accounts and conversations when there is no real file', async () => {
      const data = await createSampleSource({
         now: () => now,
         loadReal: async () => undefined,
         wait: instant,
         size: 50,
      }).load()

      expect(data.accounts).toHaveLength(12)
      expect(data.conversations).toHaveLength(50)
      expect(data.sample).toBe(true)
   })

   it('should show only the conversations of a real file, as recorded', async () => {
      const data = await createSampleSource({
         now: () => now,
         loadReal: async () => real,
         wait: instant,
         size: 50,
      }).load()

      expect(data.conversations).toHaveLength(1)
      expect(data.conversations[0]?.contact.name).toBe('Ada Example')
      expect(data.accounts).toHaveLength(1)
      expect(data.conversations[0]?.accountId).toBe(data.accounts[0]?.id)
   })

   it('should fall back to the invented ones when the real file cannot be read', async () => {
      const data = await createSampleSource({
         now: () => now,
         loadReal: async () => {
            throw new Error('missing')
         },
         wait: instant,
         size: 20,
      }).load()

      expect(data.conversations).toHaveLength(20)
   })
})

describe('createSampleSource.send', () => {
   const source = createSampleSource({ now: () => now, loadReal: async () => undefined, wait: instant, size: 5 })
   const account = { id: 'a', name: 'A', handle: 'a@x.test', headline: '', state: 'ACTIVE' as const }

   it('should say a reply went', async () => {
      await expect(source.send(account, 'Thanks', [], 'c1')).resolves.toEqual({ ok: true })
   })

   it('should fail on purpose when the text holds /fail, so the failed state can be seen', async () => {
      await expect(source.send(account, 'please /fail now', [], 'c1')).resolves.toEqual({
         ok: false,
         reason: 'The sample reply failed on purpose: its text holds /fail.',
      })
   })

   it('should not send from an account that is not signed in, and say why', async () => {
      await expect(source.send({ ...account, state: 'PAUSED' }, 'x', [], 'c1')).resolves.toEqual({
         ok: false,
         reason: 'This account is paused, so nothing can be sent from it.',
      })
      await expect(source.send({ ...account, state: 'DISCONNECTED' }, 'x', [], 'c1')).resolves.toMatchObject({
         ok: false,
      })
      await expect(source.send({ ...account, state: 'RESTRICTED' }, 'x', [], 'c1')).resolves.toMatchObject({
         ok: false,
      })
   })
})
