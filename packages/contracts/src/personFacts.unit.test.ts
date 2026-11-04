import { describe, expect, it } from 'vitest'

import { type PersonFactValue, checkPerson, personConditionsOf, personFactOf, personReason } from './personFacts'

const facts: Record<string, PersonFactValue> = {
   connected: true,
   connectedDays: 12,
   inviteState: 'pending',
   label: ['hot', 'vip'],
   score: null,
}

describe('checkPerson', () => {
   it('should answer yes or no facts with is and is not', () => {
      expect(
         checkPerson(
            {
               fact: 'connected',
               op: 'is',
               value: 'yes',
            },
            facts
         )
      ).toBe('match')
      expect(
         checkPerson(
            {
               fact: 'connected',
               op: 'isNot',
               value: 'yes',
            },
            facts
         )
      ).toBe('no')
      expect(
         checkPerson(
            {
               fact: 'connected',
               op: 'isNot',
               value: 'no',
            },
            facts
         )
      ).toBe('match')
   })

   it('should compare numbers, and say no to a non-number', () => {
      expect(
         checkPerson(
            {
               fact: 'connectedDays',
               op: 'atLeast',
               value: '12',
            },
            facts
         )
      ).toBe('match')
      expect(
         checkPerson(
            {
               fact: 'connectedDays',
               op: 'atMost',
               value: '11',
            },
            facts
         )
      ).toBe('no')
      expect(
         checkPerson(
            {
               fact: 'connectedDays',
               op: 'atLeast',
               value: 'x',
            },
            facts
         )
      ).toBe('no')
   })

   it('should match a choice and a label held in a list', () => {
      expect(
         checkPerson(
            {
               fact: 'inviteState',
               op: 'is',
               value: 'pending',
            },
            facts
         )
      ).toBe('match')
      expect(
         checkPerson(
            {
               fact: 'label',
               op: 'has',
               value: 'vip',
            },
            facts
         )
      ).toBe('match')
      expect(
         checkPerson(
            {
               fact: 'label',
               op: 'hasNot',
               value: 'vip',
            },
            facts
         )
      ).toBe('no')
   })

   it('should match neither is nor is not for a fact that is not known, and find it with is not known', () => {
      expect(
         checkPerson(
            {
               fact: 'score',
               op: 'atLeast',
               value: '1',
            },
            facts
         )
      ).toBe('unknown')
      expect(
         checkPerson(
            {
               fact: 'score',
               op: 'isNot',
               value: '1',
            },
            facts
         )
      ).toBe('unknown')
      expect(
         checkPerson(
            {
               fact: 'score',
               op: 'unknown',
               value: '',
            },
            facts
         )
      ).toBe('match')
      expect(
         checkPerson(
            {
               fact: 'score',
               op: 'known',
               value: '',
            },
            facts
         )
      ).toBe('no')
      expect(
         checkPerson(
            {
               fact: 'missing',
               op: 'known',
               value: '',
            },
            facts
         )
      ).toBe('no')
   })
})

describe('personConditionsOf', () => {
   it('should read the rows that are set, and drop an operator the fact does not take', () => {
      expect(
         personConditionsOf({
            check: 'connected',
            op: 'is',
            value: 'yes',
            check2: 'label',
            op2: 'atLeast',
            value2: '3',
            check3: 'score',
            op3: 'atLeast',
            value3: '50',
         })
      ).toEqual([
         {
            fact: 'connected',
            op: 'is',
            value: 'yes',
         },
         {
            fact: 'score',
            op: 'atLeast',
            value: '50',
         },
      ])
   })

   it('should drop a fact that does not exist', () => {
      expect(
         personConditionsOf({
            check: 'nope',
            op: 'is',
            value: 'x',
         })
      ).toEqual([])
   })
})

describe('personReason', () => {
   it('should say which read to make for a fact that is not known, and name the check that failed', () => {
      expect(personReason(personFactOf('connected'), 'unknown')).toBe(
         "Not known: read the account's connections first."
      )
      expect(personReason(personFactOf('wroteTo'), 'unknown')).toBe(
         "Not known: read the account's conversations first."
      )
      expect(personReason(personFactOf('score'), 'unknown')).toBe('Not known.')
      expect(personReason(personFactOf('connected'), 'no')).toBe('Did not match: Connected to an account.')
   })
})
