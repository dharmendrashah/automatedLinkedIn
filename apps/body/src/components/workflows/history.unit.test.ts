import { describe, expect, it } from 'vitest'

import { record, redo, startHistory, undo } from './history'

describe('history', () => {
   it('should undo and redo, and drop the redo steps after a new change', () => {
      const edited = record(record(startHistory('a'), 'b'), 'c')

      expect(undo(edited).present).toBe('b')
      expect(redo(undo(edited)).present).toBe('c')
      expect(record(undo(edited), 'd')).toEqual({
         past: ['a', 'b'],
         present: 'd',
         future: [],
      })
      expect(undo(startHistory('a')).present).toBe('a')
   })
})
