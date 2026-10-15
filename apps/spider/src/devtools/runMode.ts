import { join } from 'node:path'

import { type ProxyConfig, RUNNER_VERDICTS, type TaskResult, runPrefix } from '@automatedLinkedIn/contracts'

import { createDeviceIdentity } from '../identity/createDeviceIdentity'
import { IdentityStore } from '../identity/identityStore'
import { lookupExit } from '../identity/lookupExit'
import { Recorder } from '../recording/recorder'
import { CamoufoxDriver } from '../scraping/camoufoxDriver'
import { SessionVault } from '../sessions/sessionVault'
import { openCredentials } from '../tasks/credentials'
import { type TaskDefinition } from '../tasks/defineTask'
import { AccountValidator } from '../tasks/linkedinLogin/accountValidator'
import { buildTasks } from '../tasks/registry'
import { type RunnerDeps, runTask } from '../tasks/runner'
import { buildCommand } from './command'
import { hostOs } from './hostOs'
import { askInput } from './inputPrompt'
import { type SavedAccount, listSavedAccounts } from './localDb'
import { LocalStore } from './localStore'
import { MemoryStore } from './memoryStore'
import { ask, choose, confirm, handleInterrupt } from './prompt'
import { type RunRecord, formatRun, summarise } from './summary'

const LINKEDIN_URL = 'https://www.linkedin.com'
const ACTION_TIMEOUT_MS = 30_000
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

// The task runs under no allowlist, no robots.txt check and no delay: a person is watching, and a new page has to be
// reachable before a task is written for it. The worker still applies all three.
const freeRules = {
   policy: {
      allowsUrl: () => true,
      allowsCookieDomain: () => true,
   },
   robots: { check: async () => ({ allowed: true }) },
   limiter: { wait: async () => undefined },
   accountLock: { acquire: async () => ({ release: async () => undefined }) },
}

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
   const tasks = buildTasks({
      linkedin: {
         validator: new AccountValidator({
            baseUrl: LINKEDIN_URL,
            mode: 'full',
            pause: async () => undefined,
            allowsCookieDomain: () => true,
         }),
         baseUrl: LINKEDIN_URL,
      },
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
   const store = new LocalStore(outputRoot)

   const driver = new CamoufoxDriver({
      actionTimeoutMs: ACTION_TIMEOUT_MS,
      isAllowedNavigation: () => true,
      headless: false,
      operatingSystems: [hostOs()],
   })

   const records: RunRecord[] = []
   let stopping = false
   // The same device, language and signed-in session for every run of an account in this session, as on the worker;
   // nothing is kept after it.
   const memory = new MemoryStore()
   const identities = new IdentityStore(memory, () => createDeviceIdentity(hostOs()))
   const sessions = new SessionVault(memory, encryptionKey)

   const release = handleInterrupt(() => {
      if (stopping) {
         process.exit(1)
      }

      stopping = true
      console.log('\nFinishing this run and skipping the rest. Press Ctrl+C again to quit now.')
   })

   try {
      for (let index = 1; index <= runs && !stopping; index += 1) {
         const command = buildCommand({
            task,
            input,
            proxy,
            ...(account && { account }),
         })
         let result: TaskResult | undefined
         const deps: RunnerDeps = {
            ...freeRules,
            tasks,
            driver,
            store,
            identities,
            sessions,
            exitGeo: lookupExit,
            // The browser window is open in front of the person running this, so they finish a check right there.
            handover: async () =>
               (await confirm('\nA security check needs you. Finish it in the browser window, then answer y here'))
                  ? 'done'
                  : 'gave_up',
            openCredentials: sealed => openCredentials(sealed, encryptionKey),
            startRecording: ({ task: kind, id, prefix, videoSize }) =>
               Recorder.start({
                  kind,
                  id,
                  prefix,
                  mode: 'always',
                  video: true,
                  ...(videoSize && { videoSize }),
                  store,
               }),
            publishResult: async found => {
               result = found
            },
            workerBuild: 'devtools',
         }

         console.log(`\n--- Run ${index} of ${runs} ---`)

         try {
            await runTask(command, deps)
         } catch (error) {
            console.log(`The run stopped with an error: ${error instanceof Error ? error.message : 'unknown'}`)
         }

         if (!result) {
            records.push({
               ok: false,
               verdict: 'CRASHED',
               durationMs: 0,
            })

            continue
         }

         const label =
            task.verdicts[result.verdict]?.label ??
            RUNNER_VERDICTS[result.verdict as keyof typeof RUNNER_VERDICTS]?.label ??
            result.verdict

         formatRun(result, label).forEach(line => console.log(line))
         console.log(`Files: ${join(outputRoot, runPrefix(command))}`)
         records.push({
            ok: result.status === 'SUCCEEDED',
            verdict: result.verdict,
            durationMs: Date.parse(result.finished_at) - Date.parse(result.started_at),
         })
      }
   } finally {
      release()
   }

   if (records.length > 0) {
      console.log('\n--- Summary ---')
      summarise(records).forEach(line => console.log(line))
   }
}
