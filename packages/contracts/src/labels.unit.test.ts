import { describe, expect, it } from 'vitest'

import { labelsError, labelsOf, parseLabel } from './labels'

describe('parseLabel', () => {
   it('should read a name and a meaning, and lower-case the name', () => {
      expect(parseLabel('Asking: Asks for a tool or advice')).toEqual({
         name: 'asking',
         meaning: 'Asks for a tool or advice',
      })
   })

   it('should refuse a line without a meaning, a bad name or a long one', () => {
      expect(parseLabel('asking')).toBeNull()
      expect(parseLabel('asking:')).toBeNull()
      expect(parseLabel('not a name: x')).toBeNull()
      expect(parseLabel(`${'a'.repeat(25)}: x`)).toBeNull()
      expect(parseLabel(`a: ${'x'.repeat(121)}`)).toBeNull()
   })
})

describe('labelsError', () => {
   it('should want 2 to 8 distinct, well-formed labels', () => {
      expect(labelsError(['a: one'])).toContain('add 2 to 8')
      expect(labelsError(Array.from({ length: 9 }, (_, index) => `l${index}: x`))).toContain('add 2 to 8')
      expect(labelsError(['a: one', 'oops'])).toContain('name: what it means')
      expect(labelsError(['a: one', 'A: two'])).toBe('each label name must be different.')
      expect(labelsError(['a: one', 'b: two'])).toBeNull()
   })
})

describe('labelsOf', () => {
   it('should keep the readable lines', () => {
      expect(labelsOf(['a: one', 'oops']).map(({ name }) => name)).toEqual(['a'])
   })
})
