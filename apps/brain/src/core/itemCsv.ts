import { toCsv } from './csv'
import { type Signal, type WorkflowItemData } from './workflowItem'

// What a block passed on, as one CSV: people, posts and companies share the columns that fit them.

const HEADER = [
   'Kind',
   'Name',
   'Headline',
   'Location',
   'Link',
   'Score',
   'Band',
   'Labels',
   'Reason',
   'Source link',
   'Date found',
   'Author',
   'Hiring roles',
   'Round',
]

const REASONS: Record<Signal['type'], string> = {
   commented: 'Commented',
   reacted: 'Reacted',
   employee: 'Works at the company',
   hiring: 'Company is hiring',
}

// The most rows one download holds; the file says when it was cut.
export const CSV_MAX_ROWS = 50_000

const rowOf = ({ round, item }: { round: number; item: WorkflowItemData }): (string | null)[] => {
   const base = Array<string | null>(HEADER.length).fill(null)

   base[4] = item.url
   base[13] = String(round + 1)

   if (item.kind === 'profile') {
      const [signal] = item.signals

      base[0] = 'Person'
      base[1] = item.name
      base[2] = item.headline
      base[3] = item.location
      base[5] = item.score === null ? null : String(item.score)
      base[6] = item.band
      base[7] = item.tags.join(', ')
      base[8] = signal ? REASONS[signal.type] : null
      base[9] = signal?.via ?? null
      base[10] = signal?.at ?? null
   } else if (item.kind === 'post') {
      base[0] = 'Post'
      base[11] = item.author ?? null
   } else {
      base[0] = 'Company'
      base[1] = item.name
      base[12] = item.hiring.join(', ')
   }

   return base
}

export const itemsCsv = (rows: { round: number; item: WorkflowItemData }[], total: number) => {
   const csv = toCsv(HEADER, rows.map(rowOf))

   return total > rows.length ? `${csv}\r\n"Cut at ${rows.length} of ${total} rows."` : csv
}
