import { describe, expect, it } from 'vitest'

import { DEFAULT_COLUMNS, columnsFrom, columnsToText, toggleColumn } from './columns'

describe('columnsFrom', () => {
   it('should use the defaults when nothing usable was stored', () => {
      expect(columnsFrom(null)).toEqual(DEFAULT_COLUMNS)
      expect(columnsFrom('not json')).toEqual(DEFAULT_COLUMNS)
      expect(columnsFrom('{"a":1}')).toEqual(DEFAULT_COLUMNS)
   })

   it('should keep only known columns, in the table order, and allow none', () => {
      expect(columnsFrom('["added","bogus","browsing"]')).toEqual(['browsing', 'added'])
      expect(columnsFrom('[]')).toEqual([])
   })
})

describe('toggleColumn and columnsToText', () => {
   it('should add or remove one column and keep the table order', () => {
      expect(toggleColumn(['browsing', 'visit'], 'added')).toEqual(['browsing', 'visit', 'added'])
      expect(toggleColumn(['browsing', 'visit', 'added'], 'visit')).toEqual(['browsing', 'added'])
   })

   it('should write what columnsFrom reads back', () => {
      expect(columnsFrom(columnsToText(['verified', 'hours']))).toEqual(['verified', 'hours'])
   })
})
