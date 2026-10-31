import { describe, expect, it } from 'vitest'

import {
   COMPANY_CSV,
   IMPORT_ROWS,
   PROFILE_CSV,
   entriesOf,
   linksOf,
   readImportCsv,
   skippedCsv,
} from './import-csv'

const rowsOf = (raw: string, kind = PROFILE_CSV) => {
   const read = readImportCsv(raw, kind)

   return 'rows' in read ? read.rows : read.error
}

describe('readImportCsv', () => {
   it('reads the example: the link, the labels split on ";" and the notes', () => {
      expect(readImportCsv(PROFILE_CSV.example, PROFILE_CSV)).toEqual({
         rows: [
            {
               url: 'https://www.linkedin.com/in/example-one/',
               labels: ['founder', 'saas'],
               notes: 'Met at SaaStr',
            },
            {
               url: 'https://www.linkedin.com/in/example-two/',
               labels: [],
               notes: '',
            },
         ],
      })
   })

   it('takes the header in any order, a BOM, quoted commas and new lines, and a ";" delimiter', () => {
      const csv =
         '\uFEFFnotes;Profile_URL;labels\r\n"Said ""hi"", twice\nthen left";https://www.linkedin.com/in/a/;"x;y"\r\n'

      expect(rowsOf(csv)).toEqual([
         {
            url: 'https://www.linkedin.com/in/a/',
            labels: ['x', 'y'],
            notes: 'Said "hi", twice\nthen left',
         },
      ])
   })

   it('reads a file of links with no header, skips blank rows, and keeps formula-looking cells as text', () => {
      expect(rowsOf('https://www.linkedin.com/in/a/\n\n=HYPERLINK("x")\n')).toEqual([
         {
            url: 'https://www.linkedin.com/in/a/',
            labels: [],
            notes: '',
         },
         {
            url: '=HYPERLINK("x")',
            labels: [],
            notes: '',
         },
      ])
   })

   it('says what is wrong with a file it cannot use', () => {
      expect(rowsOf('')).toBe('The file is empty.')
      expect(rowsOf('name,labels\nAda,x\n')).toBe('The file has no profile_url column.')
      expect(rowsOf('name,labels\nAcme,x\n', COMPANY_CSV)).toBe('The file has no company_url column.')
      expect(rowsOf(`profile_url\n${'https://www.linkedin.com/in/a/\n'.repeat(IMPORT_ROWS + 1)}`)).toBe(
         `Import at most ${IMPORT_ROWS.toLocaleString('en')} profiles at once.`
      )
   })

   it('finds the company link column under the names exports use', () => {
      expect(rowsOf('Name,LinkedIn URL,Labels\nAcme,https://www.linkedin.com/company/acme/,tier1\n', COMPANY_CSV)).toEqual([
         {
            url: 'https://www.linkedin.com/company/acme/',
            labels: ['tier1'],
            notes: '',
         },
      ])
      expect(rowsOf(COMPANY_CSV.example, COMPANY_CSV)).toHaveLength(2)
   })
})

describe('skippedCsv', () => {
   it('gives back the rows that were not links, safe to open in a spreadsheet', () => {
      const rows = [
         {
            url: 'https://www.linkedin.com/company/acme/',
            labels: [],
            notes: '',
         },
         {
            url: '=HYPERLINK("x")',
            labels: ['a', 'b'],
            notes: 'Hi, there',
         },
      ]

      expect(skippedCsv(rows, ['=HYPERLINK("x")'], COMPANY_CSV)).toBe(
         'company_url,labels,notes\r\n"\'=HYPERLINK(""x"")",a;b,"Hi, there"'
      )
   })
})

describe('linksOf', () => {
   it('splits pasted text on spaces, commas and new lines', () => {
      expect(linksOf(' https://www.linkedin.com/in/a/,https://www.linkedin.com/in/b/\n\n c ')).toEqual([
         'https://www.linkedin.com/in/a/',
         'https://www.linkedin.com/in/b/',
         'c',
      ])
   })
})

describe('entriesOf', () => {
   it('gives each chosen profile the labels and notes of every row that named it', () => {
      const rows = [
         {
            url: 'linkedin.com/in/a',
            labels: ['founder'],
            notes: 'Met at SaaStr',
         },
         {
            url: 'https://www.linkedin.com/in/a/',
            labels: ['founder', 'saas'],
            notes: '',
         },
         {
            url: 'https://www.linkedin.com/in/b/',
            labels: [],
            notes: 'Not chosen',
         },
      ]

      expect(
         entriesOf(rows, [
            {
               url: 'https://www.linkedin.com/in/a',
               inputs: ['linkedin.com/in/a', 'https://www.linkedin.com/in/a/'],
            },
         ])
      ).toEqual([
         {
            url: 'https://www.linkedin.com/in/a',
            labels: ['founder', 'saas'],
            notes: 'Met at SaaStr',
         },
      ])
   })
})
