import type { CampaignListState } from '@automatedLinkedIn/contracts'

export type BulkAction = 'pause' | 'resume'
export type BulkRow = { id: string; name: string; paused: boolean; state: CampaignListState }

// Rows already in the asked state and rows with no workflows are skipped. The calls run one after another; a call that
// resolves is a success, one that throws puts the row's name in `failed`.
export const runBulk = async (rows: BulkRow[], action: BulkAction, call: (id: string) => Promise<void>) => {
   const failed: string[] = []
   const failedIds: string[] = []
   let done = 0
   let skipped = 0

   for (const row of rows) {
      if (row.state === 'NO_WORKFLOWS' || row.paused === (action === 'pause')) {
         skipped += 1
         continue
      }

      try {
         await call(row.id)
         done += 1
      } catch {
         failed.push(row.name)
         failedIds.push(row.id)
      }
   }

   return {
      done,
      skipped,
      failed,
      failedIds,
   }
}

// Null for one row: a single Pause or Resume is not confirmed.
export const bulkConfirmText = (action: BulkAction, count: number) => {
   if (count <= 1) return null

   return action === 'pause'
      ? `Pause ${count} campaigns? Work already queued keeps going out; cancel it from a campaign's page.`
      : `Resume ${count} campaigns?`
}

// "Paused 3, skipped 1, failed 2: A, B"; a count of 0 is left out.
export const bulkToast = (action: BulkAction, result: { done: number; skipped: number; failed: string[] }) => {
   const parts = [
      result.done > 0 ? `${action === 'pause' ? 'Paused' : 'Resumed'} ${result.done}` : '',
      result.skipped > 0 ? `skipped ${result.skipped}` : '',
      result.failed.length > 0 ? `failed ${result.failed.length}: ${result.failed.join(', ')}` : '',
   ].filter(Boolean)
   const text = parts.join(', ')

   return {
      kind: result.failed.length > 0 ? ('error' as const) : ('success' as const),
      text: text === '' ? 'Nothing changed' : `${text.charAt(0).toUpperCase()}${text.slice(1)}`,
   }
}
