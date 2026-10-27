export type ColumnId = 'browsing' | 'visit' | 'verified' | 'added' | 'credentials' | 'hours'

// Account and Status are always shown; every other column is the owner's choice, kept in this browser.
export const COLUMNS: { id: ColumnId; label: string }[] = [
   { id: 'browsing', label: 'Browsing today' },
   { id: 'visit', label: 'Daily visit' },
   { id: 'verified', label: 'Last verified' },
   { id: 'added', label: 'Added' },
   { id: 'credentials', label: 'Credentials' },
   { id: 'hours', label: 'Working hours now' },
]

export const DEFAULT_COLUMNS: ColumnId[] = ['browsing', 'visit']

const known = (value: unknown): value is ColumnId => COLUMNS.some(({ id }) => id === value)

// What was stored, or the defaults when nothing usable was.
export const columnsFrom = (raw: string | null): ColumnId[] => {
   if (raw === null) {
      return DEFAULT_COLUMNS
   }

   try {
      const parsed: unknown = JSON.parse(raw)

      return Array.isArray(parsed) ? COLUMNS.map(({ id }) => id).filter(id => parsed.includes(id)) : DEFAULT_COLUMNS
   } catch {
      return DEFAULT_COLUMNS
   }
}

export const columnsToText = (columns: ColumnId[]) => JSON.stringify(columns.filter(known))

export const toggleColumn = (columns: ColumnId[], id: ColumnId) =>
   COLUMNS.map(item => item.id).filter(item => (item === id ? !columns.includes(id) : columns.includes(item)))
