import { describe, expect, it } from 'vitest'

import { EXAMPLE_CSV, IMPORT_ROWS, linksOf, peopleOf, readImportCsv } from './import-csv'

const rowsOf = (raw: string) => {
   const read = readImportCsv(raw)

   return 'rows' in read ? read.rows : read.error
}

describe('readImportCsv', () => {
   it('reads the example: the link, the labels split on ";" and the notes', () => {
      expect(readImportCsv(EXAMPLE_CSV)).toEqual({
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
      expect(readImportCsv('')).toEqual({ error: 'The file is empty.' })
      expect(readImportCsv('name,labels\nAda,x\n')).toEqual({ error: 'The file has no profile_url column.' })
      expect(readImportCsv(`profile_url\n${'https://www.linkedin.com/in/a/\n'.repeat(IMPORT_ROWS + 1)}`)).toEqual({
         error: `Import at most ${IMPORT_ROWS.toLocaleString('en')} profiles at once.`,
      })
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

describe('peopleOf', () => {
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
         peopleOf(rows, [
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
