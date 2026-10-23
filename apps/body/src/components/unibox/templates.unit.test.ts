import { describe, expect, it } from 'vitest'

import { fillTemplate, firstName } from './templates'

describe('firstName', () => {
   it('should take the first word of a name', () => {
      expect(firstName('Ruediger Niehoff')).toBe('Ruediger')
      expect(firstName('  Ada ')).toBe('Ada')
   })

   it('should give nothing for a name that is not a name', () => {
      expect(firstName('')).toBeUndefined()
      expect(firstName('Unknown member')).toBeUndefined()
      expect(firstName('LinkedIn Member')).toBeUndefined()
   })
})

describe('fillTemplate', () => {
   it('should put the values in, whatever the case or the spaces inside the braces', () => {
      expect(
         fillTemplate('Hi {First name}, it is { account }.', { 'first name': 'Ada', account: 'Acme Sales' })
      ).toEqual({
         text: 'Hi Ada, it is Acme Sales.',
         missing: [],
      })
   })

   it('should keep a variable it has no value for, and say which, once', () => {
      expect(fillTemplate('Hi {first name}, {first name}! {company}', { account: 'x' })).toEqual({
         text: 'Hi {first name}, {first name}! {company}',
         missing: ['first name', 'company'],
      })
   })

   it('should leave text without a variable as it is, and never run what is inside braces', () => {
      expect(fillTemplate('no variables', {})).toEqual({ text: 'no variables', missing: [] })
      expect(fillTemplate('{constructor}', {})).toEqual({ text: '{constructor}', missing: ['constructor'] })
   })
})
