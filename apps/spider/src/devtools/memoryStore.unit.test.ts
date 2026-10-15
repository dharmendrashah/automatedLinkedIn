import { describe, expect, it } from 'vitest'

import { ObjectNotFoundError } from '../storage/store'
import { MemoryStore } from './memoryStore'

describe('MemoryStore', () => {
   it('should keep what it is given for the rest of the session, and say when there is nothing', async () => {
      const store = new MemoryStore()

      await expect(store.get('a')).rejects.toBeInstanceOf(ObjectNotFoundError)

      await store.put('a', '1')

      await expect(store.get('a')).resolves.toBe('1')
   })

   it('should create an object only when it does not exist yet', async () => {
      const store = new MemoryStore()

      await expect(store.create('a', '1')).resolves.toBeDefined()
      await expect(store.create('a', '2')).resolves.toBeUndefined()
      await expect(store.get('a')).resolves.toBe('1')
   })
})
