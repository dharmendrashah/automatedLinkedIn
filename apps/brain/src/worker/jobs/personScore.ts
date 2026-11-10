import { PersonScoreService } from 'database'

import { defineJob } from './defineJob'

// Scores the people whose profile read came in after the owner asked for a rescore (.plan/rescore-person.md).
export const personScore = defineJob({
   name: 'person-score',
   title: 'Rescores waiting for a profile',
   purpose:
      'Scores a person against the ideal customer the owner picked, once the profile read they waited for has come in.',
   everyMs: 60 * 1000,
   startAfterMs: 30_000,
   timeoutMs: 2 * 60 * 1000,
   run: async () => {
      const scored = await PersonScoreService.scoreWaiting()

      return scored === 0 ? undefined : { counts: { scored } }
   },
})
