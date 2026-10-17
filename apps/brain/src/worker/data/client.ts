import { DataClient } from 'core/dataClient'

import { MINDCASE_API_KEY, MINDCASE_RPM } from 'env'

// The one data service client of the worker, so its pacing covers every request: workflow steps and on-demand reads.
export const dataClient = new DataClient({
   key: MINDCASE_API_KEY,
   requestsPerMinute: MINDCASE_RPM,
})
