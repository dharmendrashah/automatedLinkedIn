import { describe, expect, it, vi } from 'vitest'

import { newCorrelationId } from './correlationId'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const realCrypto = globalThis.crypto

describe('newCorrelationId', () => {
   it('should make a UUID that the API accepts', () => {
      expect(newCorrelationId()).toMatch(UUID)
   })

   it('should make a valid ID without randomUUID, outside secure contexts', () => {
      vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array<ArrayBuffer>) => realCrypto.getRandomValues(array) })

      expect(newCorrelationId()).toMatch(UUID)

      vi.unstubAllGlobals()
   })
})
