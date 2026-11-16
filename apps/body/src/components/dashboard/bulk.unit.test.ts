import { describe, expect, it } from 'vitest'

import { type BulkRow, bulkConfirmText, bulkToast, runBulk } from './bulk'

const rowOf = (id: string, overrides: Partial<BulkRow> = {}): BulkRow => ({
   id,
   name: `Campaign ${id}`,
   paused: false,
   state: 'RUNNING',
   ...overrides,
})

describe('runBulk', () => {
   it('should call the rows one after another, in order, and count them done', async () => {
      const order: string[] = []
      const call = async (id: string) => {
         order.push(`start ${id}`)
         await Promise.resolve()
         order.push(`end ${id}`)
      }

      const result = await runBulk([rowOf('a'), rowOf('b')], 'pause', call)

      expect(order).toEqual(['start a', 'end a', 'start b', 'end b'])
      expect(result).toEqual({ done: 2, skipped: 0, failed: [], failedIds: [] })
   })

   it('should skip rows already in the asked state and rows with no workflows', async () => {
      const calls: string[] = []
      const rows = [
         rowOf('running'),
         rowOf('paused', { paused: true, state: 'PAUSED' }),
         rowOf('empty', { state: 'NO_WORKFLOWS' }),
      ]

      const paused = await runBulk(rows, 'pause', async id => void calls.push(id))
      const resumed = await runBulk(rows, 'resume', async id => void calls.push(id))

      expect(calls).toEqual(['running', 'paused'])
      expect(paused).toMatchObject({ done: 1, skipped: 2 })
      expect(resumed).toMatchObject({ done: 1, skipped: 2 })
   })

   it('should name a failed row, keep going and report its id', async () => {
      const call = async (id: string) => {
         if (id === 'b') throw new Error('CONFLICT')
      }

      const result = await runBulk([rowOf('a'), rowOf('b'), rowOf('c')], 'pause', call)

      expect(result).toEqual({
         done: 2,
         skipped: 0,
         failed: ['Campaign b'],
         failedIds: ['b'],
      })
   })

   it('should do nothing for no rows', async () => {
      const result = await runBulk([], 'resume', async () => {})

      expect(result).toEqual({ done: 0, skipped: 0, failed: [], failedIds: [] })
   })
})

describe('bulkConfirmText', () => {
   it('should not ask for one row', () => {
      expect(bulkConfirmText('pause', 1)).toBeNull()
      expect(bulkConfirmText('resume', 1)).toBeNull()
   })

   it('should say that queued work keeps going out when pausing several', () => {
      expect(bulkConfirmText('pause', 3)).toBe(
         "Pause 3 campaigns? Work already queued keeps going out; cancel it from a campaign's page."
      )
   })

   it('should ask plainly for a resume', () => {
      expect(bulkConfirmText('resume', 3)).toBe('Resume 3 campaigns?')
   })
})

describe('bulkToast', () => {
   it('should list every count and the failed names, as an error', () => {
      expect(bulkToast('pause', { done: 3, skipped: 1, failed: ['A', 'B'] })).toEqual({
         kind: 'error',
         text: 'Paused 3, skipped 1, failed 2: A, B',
      })
   })

   it('should leave a count of 0 out and be a success without failures', () => {
      expect(bulkToast('resume', { done: 2, skipped: 0, failed: [] })).toEqual({
         kind: 'success',
         text: 'Resumed 2',
      })
      expect(bulkToast('pause', { done: 0, skipped: 2, failed: [] })).toEqual({
         kind: 'success',
         text: 'Skipped 2',
      })
   })

   it('should say so when nothing happened', () => {
      expect(bulkToast('pause', { done: 0, skipped: 0, failed: [] })).toEqual({
         kind: 'success',
         text: 'Nothing changed',
      })
   })
})
