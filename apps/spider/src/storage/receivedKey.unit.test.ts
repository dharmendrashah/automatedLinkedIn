import { describe, expect, it } from 'vitest'

import { receivedKey } from './receivedKey'

describe('receivedKey', () => {
   it('should name a received file by its message and place, the same on every read, whatever the message id holds', () => {
      const key = receivedKey('u1', 'a1', 'urn:li:msg_message:(urn:li:fsd_profile:X,2-abc==)', 0, '../plan.png')

      expect(key).toMatch(/^kept\/u1\/a1\/received\/[0-9a-f]{32}\/0-plan\.png$/)
      expect(receivedKey('u1', 'a1', 'urn:li:msg_message:(urn:li:fsd_profile:X,2-abc==)', 0, '../plan.png')).toBe(key)
      expect(receivedKey('u1', 'a1', 'other', 0, 'plan.png')).not.toBe(key)
      expect(receivedKey('u1', 'a1', 'm', 1, '')).toMatch(/\/1-file$/)
   })
})
