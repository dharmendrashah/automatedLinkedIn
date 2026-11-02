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
   'Email',
   'Company',
   'Details',
   'Round',
   'Result',
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
   base[16] = String(round + 1)
   base[17] = item.result ? [item.result.status, item.result.reason].filter(Boolean).join(': ') : null

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
      base[10] = signal?.at ?? item.connectedOn ?? null
      base[13] = item.email ?? null
   } else if (item.kind === 'post') {
      base[0] = 'Post'
      base[11] = item.author ?? null
   } else if (item.kind === 'job') {
      base[0] = 'Job'
      base[1] = item.title
      base[3] = item.location
      base[10] = item.posted
      base[14] = item.company
      base[15] = [
         item.workplace,
         item.employment,
         item.salary,
         item.applicants === null ? null : `${item.applicants} applicants`,
      ]
         .filter(Boolean)
         .join(', ')
   } else if (item.kind === 'ad') {
      base[0] = 'Ad'
      base[1] = item.headline
      base[10] = item.started
      base[11] = item.advertiser
      base[15] = [item.format, item.body, item.clickUrl].filter(Boolean).join(' | ')
   } else if (item.kind === 'conversation') {
      base[0] = 'Conversation'
      base[1] = item.name
      base[2] = item.headline
      base[10] = item.lastAt
      base[15] = [
         item.lastFrom === 'ME' ? 'You wrote last' : item.lastFrom === 'THEM' ? 'They wrote last' : null,
         item.lastText,
      ]
         .filter(Boolean)
         .join(': ')
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
