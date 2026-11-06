import { ENGAGE_CONTRACT_VERSION, ENGAGE_TASK, engageFileSchema, engageInputSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { runEngage } from './run'

export const TASK_NAME = ENGAGE_TASK

type Options = {
   baseUrl: string
}

// Reacts to posts and comments on them, from the account that is asked, as the member would, and says what became of each act in
// `engage.json`. The acts are planned and paced by brain (.plan/lead-pipeline-p3-engage.md); this task only makes them.
export const createLinkedinEngage = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn engage',
      description:
         'Opens each post of the list, reacts to it, comments on it or reposts it with thoughts, as the account would, and checks LinkedIn shows it. Up to 10 acts a run, at most 3 with words.',
      input: engageInputSchema,
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         DONE: {
            label: 'Done',
            tone: 'success',
         },
         PARTIAL: {
            label: 'Some acts not done',
            tone: 'neutral',
         },
         NONE_DONE: {
            label: 'Nothing done',
            tone: 'failure',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         LIMIT_REACHED: {
            label: 'Limit reached',
            tone: 'neutral',
         },
         RESTRICTED: {
            label: 'Restricted',
            tone: 'failure',
         },
         ERROR: {
            label: 'The acts could not be finished',
            tone: 'failure',
         },
      },
      // Estimate: about 50 s an act (the load, the checks and the gap before the next act). Replace it with the first real run.
      budget: {
         estimateS: 540,
         class: 'ACTION',
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      // Ten acts with a 20 to 45 s gap each, through a slow proxy.
      limits: { timeoutMs: 25 * 60 * 1000 },
      // The run is kept so the outcome of every act can be checked afterwards.
      recording: { always: true },
      run: async (context, input) => {
         // A failure is an answer, not a crash: a crash is run again, and an act must not be.
         try {
            const run = await runEngage(context, baseUrl, input)

            context.attach(
               'engage.json',
               JSON.stringify(
                  engageFileSchema.parse({
                     contract: ENGAGE_CONTRACT_VERSION,
                     captured_at: new Date().toISOString(),
                     acts: run.acts,
                  }),
                  null,
                  1
               ),
               'application/json'
            )

            return answerFor(run)
         } catch (error) {
            context.warn(describeError(error, 'The acts could not be finished'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The acts could not be finished.',
            }
         }
      },
   })
