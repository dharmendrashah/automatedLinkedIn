import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { TASK_NAME as POST_TASK } from '../../tasks/linkedinPost'
import { type SavedAccount, type SavedProxy } from '../localDb'
import { choose, confirm } from '../prompt'
import { toProxyConfig } from '../proxyConfig'
import { type RunSeed } from '../runEnvironment'
import { describeAccount, isLeaseHeld, refusalFor } from './accounts'
import { loadStagingConfig } from './config'
import { readStagingAccounts, readStagingPost, readStagingRuns } from './database'
import { describePost, postRerunOf, rerunRefusal } from './postRerun'
import { pullAccountFiles, pullPostFiles, readLease, readObject } from './pull'
import { type ReplayStep, parseTimeline } from './replay'
import { createSeed, removeOnExit } from './seed'

// How a picked staging run is repeated: its recorded steps, or its task again with its own input.
export type ReplayChoice =
   { kind: 'steps'; steps: ReplayStep[] } | { kind: 'task'; task: string; input: Record<string, unknown> }

export type StagingSession = {
   proxy: ProxyConfig
   picked: SavedProxy
   account: SavedAccount
   encryptionKey: string
   seed: RunSeed
   listAccounts: () => Promise<SavedAccount[]>
   // Asks which staging run to repeat, and how.
   chooseReplay: () => Promise<ReplayChoice>
}

const warn = (message: string) => console.warn(`\n${message}`)

// Takes one staging account's proxy, device, profile and session to this computer, read only, after the developer picks
// it. Nothing is sent back to staging, and the pulled files are removed when the tool ends unless `keep` is set.
export const prepareStaging = async (keep: boolean): Promise<StagingSession> => {
   const config = await loadStagingConfig()
   const accounts = await readStagingAccounts(config, warn)

   if (accounts.length === 0) {
      throw new Error('Staging has no LinkedIn account.')
   }

   const account = await choose(
      'Which staging account?',
      accounts.map(found => ({
         label: describeAccount(found, Date.now()),
         value: found,
      }))
   )
   const { proxy: picked } = account

   if (!picked) {
      throw new Error('This account has no proxy on staging, so the worker could not run it either.')
   }

   const proceed = await confirm(
      `\nThis opens live LinkedIn as ${account.email} from this computer, with its staging device, browser profile and session, through its own proxy. Nothing is written back to staging. Continue?`
   )

   if (!proceed) {
      throw new Error('Cancelled.')
   }

   const lease = await readLease({
      bucket: config.bucket,
      accountId: account.id,
   })
   const refusal = refusalFor({
      leaseHeld: lease !== undefined && isLeaseHeld(lease, Date.now()),
      ...(account.lastActivity && { lastActivity: account.lastActivity }),
      now: Date.now(),
   })

   if (refusal) {
      throw new Error(refusal)
   }

   const root = await mkdtemp(join(tmpdir(), 'devtools-staging-'))

   removeOnExit(root, keep)

   const pulled = await pullAccountFiles({
      bucket: config.bucket,
      accountId: account.id,
      root,
   })

   if (!pulled.session) {
      warn('Staging has no saved session for this account; the browser profile carries the login.')
   }

   console.log(keep ? `\nThe pulled files are kept in ${root}.` : '\nThe pulled files are removed when this ends.')

   return {
      proxy: toProxyConfig(picked, config.encryptionKey),
      picked,
      account,
      encryptionKey: config.encryptionKey,
      seed: createSeed({
         root,
         encryptionKey: config.encryptionKey,
      }),
      listAccounts: async () => [account],
      chooseReplay: async () => {
         const runs = await readStagingRuns(config, account.id, warn)

         if (runs.length === 0) {
            throw new Error('This account has no staging run with a timeline.')
         }

         const run = await choose(
            'Which run should be repeated?',
            runs.map(found => ({
               label: `${found.startedAt.toISOString()} \u2014 ${found.task} \u2014 ${found.verdict ?? found.status} \u2014 ${found.id}`,
               value: found,
            }))
         )

         const steps = async (): Promise<ReplayChoice> => ({
            kind: 'steps',
            steps: parseTimeline(
               await readObject({
                  bucket: config.bucket,
                  key: run.timelineKey,
               })
            ),
         })

         // Only a post keeps its input where it can be read again (the publication of the run); the other tasks repeat steps.
         if (run.task !== POST_TASK) {
            return steps()
         }

         const post = await readStagingPost(config, run.id, warn)

         if (!post) {
            console.log('\nThe input of this post was not found, so its recorded steps are repeated instead.')

            return steps()
         }

         const how = await choose('How should it be repeated?', [
            {
               label: 'Run the post task again with the same input, files included \u2014 it posts for real',
               value: 'task',
            },
            {
               label: 'Repeat the recorded steps only',
               value: 'steps',
            },
         ])

         if (how === 'steps') {
            return steps()
         }

         const refusal = rerunRefusal(post.state)

         if (refusal) {
            throw new Error(refusal)
         }

         const { input, keys } = postRerunOf(post)

         console.log('')
         describePost(input).forEach(line => console.log(line))

         if (!(await confirm(`\nThis posts it to LinkedIn as ${account.email}. Continue?`))) {
            throw new Error('Cancelled.')
         }

         await pullPostFiles({
            bucket: config.bucket,
            root,
            files: input.files.map(({ id, name }) => {
               const key = keys[id]

               if (!key) {
                  throw new Error('A file of the post was never stored, so it cannot be run again.')
               }

               return {
                  id,
                  name,
                  key,
               }
            }),
         })

         return {
            kind: 'task',
            task: POST_TASK,
            input,
         }
      },
   }
}
