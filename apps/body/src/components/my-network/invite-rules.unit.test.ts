import { describe, expect, it } from 'vitest'

import * as contract from '@automatedLinkedIn/contracts'

import { NOTE_CHARS, NOTE_FIELDS, insertField } from './invite-rules'

describe('invite rules', () => {
   it("keeps the note's length equal to the contract's", () => {
      expect(NOTE_CHARS).toBe(contract.INVITE_LIMITS.noteChars)
   })

   it('puts a field where the caret was, and never past the limit', () => {
      expect(insertField('Hi , welcome', NOTE_FIELDS.firstName, 3)).toBe('Hi {first_name}, welcome')
      expect(insertField('x'.repeat(NOTE_CHARS - 2), NOTE_FIELDS.company, 0)).toBe('x'.repeat(NOTE_CHARS - 2))
   })
})
