// A spreadsheet runs a cell that starts with one of these as a formula.
const FORMULA_START = /^[=+\-@\t\r]/

const cell = (value: string | null) => {
   const text = value ?? ''
   const safe = FORMULA_START.test(text) ? `'${text}` : text

   return `"${safe.replaceAll('"', '""')}"`
}

export const toCsv = (header: string[], rows: (string | null)[][]) =>
   [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
