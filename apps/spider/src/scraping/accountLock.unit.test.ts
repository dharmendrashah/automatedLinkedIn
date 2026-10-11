import { describe, expect, it, vi } from 'vitest'

import { ObjectNotFoundError, type ObjectStore } from '../storage/store'
import { AccountLock } from './accountLock'

// An in-memory store with the same version rules as GCS: every write makes a new version.
const memoryStore = () => {
   const objects = new Map<string, { body: string; version: number }>()
   let counter = 0

   const store: Pick<ObjectStore, 'create' | 'getVersioned' | 'delete'> = {
      create: vi.fn(async (key: string, body: string) => {
         if (objects.has(key)) {
            return undefined
         }

         counter += 1
         objects.set(key, {
            body,
            version: counter,
         })

         return String(counter)
      }),
      getVersioned: vi.fn(async (key: string) => {
         const found = objects.get(key)

         if (!found) {
            throw new ObjectNotFoundError(key)
         }

         return {
            body: found.body,
            version: String(found.version),
         }
      }),
      delete: vi.fn(async (key: string, version: string) => {
         if (objects.get(key)?.version === Number(version)) {
            objects.delete(key)
         }
      }),
   }

   return {
      store,
      objects,
   }
}

const TTL = 60_000

describe('AccountLock', () => {
   it('should give the lease to the first task and refuse a second task for the same account', async () => {
      const { store } = memoryStore()
      const lock = new AccountLock(store, TTL)

      const first = await lock.acquire('acc1', 'task-1')
      const second = await lock.acquire('acc1', 'task-2')

      expect(first).toBeDefined()
      expect(second).toBeUndefined()
   })

   it('should let different accounts run at the same time', async () => {
      const { store } = memoryStore()
      const lock = new AccountLock(store, TTL)

      await expect(lock.acquire('acc1', 'task-1')).resolves.toBeDefined()
      await expect(lock.acquire('acc2', 'task-2')).resolves.toBeDefined()
   })

   it('should free the account when the lease is released', async () => {
      const { store, objects } = memoryStore()
      const lock = new AccountLock(store, TTL)

      const lease = await lock.acquire('acc1', 'task-1')

      await lease?.release()

      expect(objects.size).toBe(0)
      await expect(lock.acquire('acc1', 'task-2')).resolves.toBeDefined()
   })

   it('should store the lease under locks/ with the task and its expiry', async () => {
      const { store, objects } = memoryStore()
      const lock = new AccountLock(store, TTL, () => Date.parse('2026-10-12T10:00:00.000Z'))

      await lock.acquire('acc1', 'task-1')

      expect(JSON.parse(objects.get('locks/acc1.json')?.body ?? '{}')).toEqual({
         task_id: 'task-1',
         expires_at: '2026-10-12T10:01:00.000Z',
      })
   })

   it('should not release a lease that another task took over after it expired', async () => {
      const { store, objects } = memoryStore()
      let time = Date.parse('2026-10-12T10:00:00.000Z')
      const lock = new AccountLock(store, TTL, () => time)

      const slow = await lock.acquire('acc1', 'task-1')

      time += TTL + 1

      const takeover = await lock.acquire('acc1', 'task-2')

      await slow?.release()

      expect(takeover).toBeDefined()
      expect(JSON.parse(objects.get('locks/acc1.json')?.body ?? '{}')).toMatchObject({ task_id: 'task-2' })
   })

   it('should take over a lease left by a crashed worker once it has expired', async () => {
      const { store } = memoryStore()
      let time = Date.parse('2026-10-12T10:00:00.000Z')
      const lock = new AccountLock(store, TTL, () => time)

      await lock.acquire('acc1', 'task-1')

      time += TTL - 1
      await expect(lock.acquire('acc1', 'task-2')).resolves.toBeUndefined()

      time += 2
      await expect(lock.acquire('acc1', 'task-2')).resolves.toBeDefined()
   })

   it('should treat a lease it cannot read as expired, so one bad object cannot block an account forever', async () => {
      const { store, objects } = memoryStore()
      const lock = new AccountLock(store, TTL)

      objects.set('locks/acc1.json', {
         body: 'not json',
         version: 99,
      })

      await expect(lock.acquire('acc1', 'task-1')).resolves.toBeDefined()
   })

   it('should only let one of two tasks that race for an expired lease win', async () => {
      const { store } = memoryStore()
      let time = Date.parse('2026-10-12T10:00:00.000Z')
      const lock = new AccountLock(store, TTL, () => time)

      await lock.acquire('acc1', 'task-1')
      time += TTL + 1

      const results = await Promise.all([lock.acquire('acc1', 'task-2'), lock.acquire('acc1', 'task-3')])

      expect(results.filter(Boolean)).toHaveLength(1)
   })

   it('should let a store failure through, so the task is retried', async () => {
      const { store } = memoryStore()

      vi.mocked(store.create).mockRejectedValue(new Error('bucket unavailable'))

      await expect(new AccountLock(store, TTL).acquire('acc1', 'task-1')).rejects.toThrow('bucket unavailable')
   })
})
