import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { type TaskDefinition } from '../tasks/defineTask'
import { TASK_NAME as BROWSE_TASK } from '../tasks/linkedinBrowse'
import { TASK_NAME as LOGIN_TASK } from '../tasks/linkedinLogin'
import { askInput } from './inputPrompt'
import { type SavedAccount, listSavedAccounts } from './localDb'
import { ask, choose, confirm, handleInterrupt } from './prompt'
import { createRunEnvironment } from './runEnvironment'
import { type RunRecord, summarise } from './summary'

const MAX_RUNS = 10
// A sign-in to a real account is what gets it locked, so it is not repeated often.
const MAX_ACCOUNT_RUNS = 3

export type RunModeOptions = {
   proxy?: ProxyConfig
   databaseUrl: string
   encryptionKey: string
   outputRoot: string
}

const describeNeeds = ({ needs }: TaskDefinition) =>
   [needs.proxy === 'required' ? 'needs a proxy' : '', needs.account ? 'needs an account' : '']
      .filter(Boolean)
      .join(', ')

const chooseAccount = async (databaseUrl: string): Promise<SavedAccount> => {
   const accounts = await listSavedAccounts(databaseUrl)

   if (accounts.length === 0) {
      throw new Error('There is no LinkedIn account in the local database.')
   }

   const account = await choose(
      'Which account should the task use?',
      accounts.map(found => ({
         label: `${found.email} (${found.status})`,
         value: found,
      }))
   )

   const proceed = await confirm(
      `\nThis signs in to live LinkedIn as ${account.email}, without the 5 minute wait the app keeps between sign-ins. Continue?`
   )

   if (!proceed) {
      throw new Error('Cancelled.')
   }

   return account
}

const countRuns = async (needsAccount: boolean) => {
   const max = needsAccount ? MAX_ACCOUNT_RUNS : MAX_RUNS

   for (;;) {
      const count = Number.parseInt(await ask(`How many times should it run (1 to ${max})`, '1'), 10)

      if (Number.isInteger(count) && count >= 1 && count <= max) {
         return count
      }
   }
}

export const runTasks = async ({ proxy, databaseUrl, encryptionKey, outputRoot }: RunModeOptions) => {
   const { tasks, profiles, runOnce } = createRunEnvironment({
      proxy,
      encryptionKey,
      outputRoot,
   })

   console.log(
      '\nTasks run with no allowlist, no robots.txt check and no delay between pages. The worker applies all three.'
   )

   const task = await choose(
      'Which task?',
      tasks.map(found => ({
         label: `${found.title} (${found.name})${describeNeeds(found) ? ` \u2014 ${describeNeeds(found)}` : ''}`,
         value: found,
      }))
   )

   if (task.needs.proxy === 'required' && !proxy) {
      throw new Error('This task only runs through a proxy. Start again and pick one.')
   }

   const input = await askInput(task)
   const account = task.needs.account ? await chooseAccount(databaseUrl) : undefined
   const runs = await countRuns(Boolean(account))
   const records: RunRecord[] = []
   let stopping = false

   const release = handleInterrupt(() => {
      if (stopping) {
         process.exit(1)
      }

      stopping = true
      console.log('\nFinishing this run and skipping the rest. Press Ctrl+C again to quit now.')
   })

   try {
      // On the worker the visit starts from the profile its daily sign-in kept. Here an account that has no profile on this
      // computer yet signs in first, so the visit has a session.
      const hasProfile = account ? (await profiles.checkout(account.id)).restored : false
      const signIn =
         task.name === BROWSE_TASK && !hasProfile ? tasks.find(found => found.name === LOGIN_TASK) : undefined

      if (signIn) {
         console.log('\n--- Sign-in first, so the visit has a session ---')

         const signedIn = await runOnce(signIn, {}, account)

         if (signedIn?.status !== 'SUCCEEDED') {
            console.log('The sign-in did not work, so the visit is not run.')

            return
         }
      }

      for (let index = 1; index <= runs && !stopping; index += 1) {
         console.log(`\n--- Run ${index} of ${runs} ---`)

         const result = await runOnce(task, input, account)

         records.push(
            result
               ? {
                    ok: result.status === 'SUCCEEDED',
                    verdict: result.verdict,
                    durationMs: Date.parse(result.finished_at) - Date.parse(result.started_at),
                 }
               : {
                    ok: false,
                    verdict: 'CRASHED',
                    durationMs: 0,
                 }
         )
      }
   } finally {
      release()
   }

   if (records.length > 0) {
      console.log('\n--- Summary ---')
      summarise(records).forEach(line => console.log(line))
   }
}
