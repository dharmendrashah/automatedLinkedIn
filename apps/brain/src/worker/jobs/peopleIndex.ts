import { PeopleIndexService } from 'database'

import { defineJob } from './defineJob'

// Rebuilds the people of My network whose rows changed (.plan/network-hub.md). Database triggers mark the profiles; a pass takes
// one batch. Idle passes write no log line.
export const peopleIndex = defineJob({
   name: 'people-index',
   title: 'My network index',
   purpose:
      'Keeps the people on My network up to date with their requests, connections, conversations, lists and targets.',
   everyMs: 15_000,
   startAfterMs: 30_000,
   timeoutMs: 5 * 60 * 1000,
   run: async () => {
      const rebuilt = await PeopleIndexService.drain()

      return rebuilt > 0
         ? {
              summary: `${rebuilt} profiles rebuilt`,
              counts: { rebuilt },
           }
         : undefined
   },
})
