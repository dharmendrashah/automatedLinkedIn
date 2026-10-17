import { DataClient } from 'core/dataClient'

import { MINDCASE_API_KEY, MINDCASE_RPM } from 'env'

// One data client for the API process's on-demand reads, made on the first read, so its pacing covers all of them.
let reader: DataClient | null = null

export const readerOf = () => {
   reader ??= new DataClient({
      key: MINDCASE_API_KEY,
      requestsPerMinute: MINDCASE_RPM,
   })

   return reader
}
