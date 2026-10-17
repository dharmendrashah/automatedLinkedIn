import { describe, expect, it } from 'vitest'

import { toCsv } from './csv'

describe('toCsv', () => {
   it('should quote every cell, double inner quotes and leave nulls empty', () => {
      expect(
         toCsv(
            ['Name', 'Note'],
            [
               ['Ada, "the first"', null],
               ['Line\nbreak', 'ok'],
            ]
         )
      ).toBe('"Name","Note"\r\n"Ada, ""the first""",""\r\n"Line\nbreak","ok"')
   })

   it('should neutralise cells a spreadsheet would run as a formula', () => {
      expect(toCsv(['A'], [['=HYPERLINK("x")'], ['+1'], ['-1'], ['@x']])).toBe(
         '"A"\r\n"\'=HYPERLINK(""x"")"\r\n"\'+1"\r\n"\'-1"\r\n"\'@x"'
      )
   })
})
