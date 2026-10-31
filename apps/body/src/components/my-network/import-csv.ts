// Reading an import file in the browser (.plan/network-import-people.md): profile_url (required), labels and notes. Cells are
// only ever text here, so a cell that looks like a formula stays a string and is checked by brain like any link.
import { LABEL_MAX, cleanLabel } from '../labels/labels'

export const IMPORT_ROWS = 1_000
export const IMPORT_BYTES = 2 * 1024 * 1024

export const EXAMPLE_CSV = [
   'profile_url,labels,notes',
   'https://www.linkedin.com/in/example-one/,founder;saas,Met at SaaStr',
   'https://www.linkedin.com/in/example-two/,,',
   '',
].join('\n')

export type ImportRow = {
   url: string
   labels: string[]
   notes: string
}

type Read = { rows: ImportRow[] } | { error: string }

// Rows of cells, RFC 4180: quoted cells may hold the delimiter, new lines and doubled quotes.
const cellsOf = (text: string, delimiter: string) => {
   const rows: string[][] = []
   let row: string[] = []
   let cell = ''
   let quoted = false

   for (let at = 0; at < text.length; at += 1) {
      const char = text.charAt(at)

      if (quoted) {
         if (char === '"' && text.charAt(at + 1) === '"') {
            cell += '"'
            at += 1
         } else if (char === '"') {
            quoted = false
         } else {
            cell += char
         }
      } else if (char === '"' && cell === '') {
         quoted = true
      } else if (char === delimiter) {
         row.push(cell)
         cell = ''
      } else if (char === '\n' || char === '\r') {
         if (char === '\r' && text.charAt(at + 1) === '\n') {
            at += 1
         }

         row.push(cell)
         rows.push(row)
         row = []
         cell = ''
      } else {
         cell += char
      }
   }

   if (cell !== '' || row.length > 0) {
      row.push(cell)
      rows.push(row)
   }

   return rows.map(cells => cells.map(value => value.trim())).filter(cells => cells.some(Boolean))
}

const labelsOf = (value: string) => value.split(';').map(cleanLabel).filter(Boolean)

export const readImportCsv = (raw: string): Read => {
   const text = raw.replace(/^\uFEFF/, '')
   const [firstLine = ''] = text.split(/\r?\n/, 1)
   const delimiter = firstLine.includes(',') || !firstLine.includes(';') ? ',' : ';'
   const rows = cellsOf(text, delimiter)
   const [header = []] = rows

   if (rows.length === 0) {
      return { error: 'The file is empty.' }
   }

   const names = header.map(name => name.toLowerCase())
   const named = names.includes('profile_url')

   if (!named && names.some(name => name === 'labels' || name === 'notes' || name === 'name')) {
      return { error: 'The file has no profile_url column.' }
   }

   const body = named ? rows.slice(1) : rows

   if (body.length > IMPORT_ROWS) {
      return { error: `Import at most ${IMPORT_ROWS.toLocaleString('en')} profiles at once.` }
   }

   const column = (name: string) => (named ? names.indexOf(name) : name === 'profile_url' ? 0 : -1)
   const [url, labels, notes] = ['profile_url', 'labels', 'notes'].map(column)

   return {
      rows: body.flatMap(cells => {
         const link = cells[url ?? 0] ?? ''

         return link
            ? [
                 {
                    url: link,
                    labels: labels !== undefined && labels >= 0 ? labelsOf(cells[labels] ?? '') : [],
                    notes: notes !== undefined && notes >= 0 ? (cells[notes] ?? '') : '',
                 },
              ]
            : []
      }),
   }
}

// Pasted links, split on spaces, commas, semicolons and new lines.
export const linksOf = (text: string) => text.split(/[\s,;]+/).filter(Boolean)

const NOTES_MAX = 1_000

// One entry per chosen profile, with the labels and notes of every row that named it.
export const peopleOf = (rows: ImportRow[], profiles: Array<{ url: string; inputs: string[] }>) => {
   const byUrl = new Map<string, ImportRow[]>()

   for (const row of rows) {
      byUrl.set(row.url, [...(byUrl.get(row.url) ?? []), row])
   }

   return profiles.map(({ url, inputs }) => {
      const mine = [...new Set(inputs)].flatMap(input => byUrl.get(input) ?? [])

      return {
         url,
         labels: [...new Set(mine.flatMap(({ labels }) => labels))].slice(0, LABEL_MAX),
         notes: [...new Set(mine.map(({ notes }) => notes).filter(Boolean))].join('\n').slice(0, NOTES_MAX),
      }
   })
}
