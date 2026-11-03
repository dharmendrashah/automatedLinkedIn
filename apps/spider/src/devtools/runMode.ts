import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { type TaskDefinition } from '../tasks/defineTask'
import { TASK_NAME as BROWSE_TASK } from '../tasks/linkedinBrowse'
import { TASK_NAME as LOGIN_TASK } from '../tasks/linkedinLogin'
import { type InputRequest, askInput, presetInput } from './inputPrompt'
import { type SavedAccount } from './localDb'
import { ask, choose, confirm, handleInterrupt } from './prompt'
import { type RunSeed, createRunEnvironment } from './runEnvironment'
import { type RunRecord, summarise } from './summary'

const MAX_RUNS = 10
// A sign-in to a real account is what gets it locked, so it is not repeated often.
const MAX_ACCOUNT_RUNS = 3

// A task named on the command line, with what else was given; whatever is missing is asked as before.
export type RunRequest = {
   task: string
   input: InputRequest
   // An account by its email, how many runs, and whether to skip the question before signing in to live LinkedIn.
   account?: string
   runs?: number
   yes: boolean
}

export type RunModeOptions = {
   proxy?: ProxyConfig
   listAccounts: () => Promise<SavedAccount[]>
   encryptionKey: string
   outputRoot: string
   // An account already chosen (the one taken from staging) and where its device, session and profile are.
   account?: SavedAccount
   seed?: RunSeed
   // One task and its input to run once, instead of asking for them (a staging run repeated with its own input).
   rerun?: { task: string; input: Record<string, unknown> }
   request?: RunRequest
}

const describeNeeds = ({ needs }: TaskDefinition) =>
   [needs.proxy === 'required' ? 'needs a proxy' : '', needs.account ? 'needs an account' : '']
      .filter(Boolean)
      .join(', ')

const chooseAccount = async (
   listAccounts: RunModeOptions['listAccounts'],
   { email, yes }: { email?: string; yes: boolean }
): Promise<SavedAccount> => {
   const accounts = await listAccounts()

   if (accounts.length === 0) {
      throw new Error('There is no LinkedIn account in the local database.')
   }

   const named =
      email === undefined ? undefined : accounts.find(found => found.email.toLowerCase() === email.toLowerCase())

   if (email !== undefined && !named) {
      throw new Error(`No account has the email ${email}. They are: ${accounts.map(found => found.email).join(', ')}.`)
   }

   const account =
      named ??
      (await choose(
         'Which account should the task use?',
         accounts.map(found => ({
            label: `${found.email} (${found.status})`,
            value: found,
         }))
      ))

   const proceed =
      yes ||
      (await confirm(
         `\nThis signs in to live LinkedIn as ${account.email}, without the 5 minute wait the app keeps between sign-ins. Continue?`
      ))

   if (!proceed) {
      throw new Error('Cancelled.')
   }

   return account
}

const maxRuns = (needsAccount: boolean) => (needsAccount ? MAX_ACCOUNT_RUNS : MAX_RUNS)

const countRuns = async (needsAccount: boolean) => {
   const max = maxRuns(needsAccount)

   for (;;) {
      const count = Number.parseInt(await ask(`How many times should it run (1 to ${max})`, '1'), 10)

      if (Number.isInteger(count) && count >= 1 && count <= max) {
         return count
      }
   }
}

export const runTasks = async ({
   proxy,
   listAccounts,
   encryptionKey,
   outputRoot,
   account: chosen,
   seed,
   rerun,
   request,
}: RunModeOptions) => {
   const { tasks, profiles, runOnce } = createRunEnvironment({
      proxy,
      encryptionKey,
      outputRoot,
      seed,
   })

   console.log(
      '\nTasks run with no allowlist, no robots.txt check and no delay between pages. The worker applies all three.'
   )

   const wanted = rerun?.task ?? request?.task
   const task =
      wanted === undefined
         ? await choose(
              'Which task?',
              tasks.map(found => ({
                 label: `${found.title} (${found.name})${describeNeeds(found) ? ` \u2014 ${describeNeeds(found)}` : ''}`,
                 value: found,
              }))
           )
         : tasks.find(found => found.name === wanted)

   if (!task) {
      throw new Error('This worker does not have that task.')
   }

   if (task.needs.proxy === 'required' && !proxy) {
      throw new Error('This task only runs through a proxy. Start again and pick one.')
   }

   const given = request && (request.input.fields.length > 0 || request.input.json !== undefined)
   const input = rerun?.input ?? (request && given ? presetInput(task, request.input) : await askInput(task))
   const account = task.needs.account
      ? (chosen ??
        (await chooseAccount(listAccounts, {
           ...(request?.account !== undefined && { email: request.account }),
           yes: request?.yes === true,
        })))
      : undefined
   const max = maxRuns(Boolean(account))

   if (request?.runs !== undefined && request.runs > max) {
      throw new Error(`This task may run at most ${max} times in one go.`)
   }

   const runs = rerun ? 1 : (request?.runs ?? (await countRuns(Boolean(account))))
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
      // computer yet signs in first, so the visit has a session. An account taken from staging always signs in first: its
      // pulled session was not accepted from this computer (2026-10-26).
      const hasProfile = account ? (await profiles.checkout(account.id)).restored : false
      const needsSignIn =
         task.name !== LOGIN_TASK && (seed ? Boolean(account) : task.name === BROWSE_TASK && !hasProfile)
      const signIn = needsSignIn ? tasks.find(found => found.name === LOGIN_TASK) : undefined

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
