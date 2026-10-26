import { type PathLike } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { type ProxyConfig, RUNNER_VERDICTS, type TaskResult, runPrefix } from '@automatedLinkedIn/contracts'

import { createDeviceIdentity } from '../identity/createDeviceIdentity'
import { IdentityStore } from '../identity/identityStore'
import { lookupExit } from '../identity/lookupExit'
import { Recorder } from '../recording/recorder'
import { CamoufoxDriver } from '../scraping/camoufoxDriver'
import { DiskProfiles, type Profiles } from '../sessions/profiles'
import { SessionVault } from '../sessions/sessionVault'
import { openCredentials } from '../tasks/credentials'
import { type TaskDefinition } from '../tasks/defineTask'
import { AccountValidator } from '../tasks/linkedinLogin/accountValidator'
import { buildTasks } from '../tasks/registry'
import { type RunnerDeps, runTask } from '../tasks/runner'
import { buildCommand } from './command'
import { withHostUiFonts } from './hostFonts'
import { hostOs } from './hostOs'
import { type SavedAccount } from './localDb'
import { LocalStore } from './localStore'
import { MemoryStore } from './memoryStore'
import { confirm } from './prompt'
import { formatRun } from './summary'

const LINKEDIN_URL = 'https://www.linkedin.com'
const ACTION_TIMEOUT_MS = 30_000

// The task runs under no allowlist, no robots.txt check and no delay: a person is watching, and a new page has to be
// reachable before a task is written for it. The worker still applies all three.
const freeRules = {
   policy: {
      allowsUrl: () => true,
      allowsCookieDomain: () => true,
      exemptsRobots: () => true,
   },
   robots: { check: async () => ({ allowed: true }) },
   limiter: { wait: async () => undefined },
   accountLock: { acquire: async () => ({ release: async () => undefined }) },
}

export type RunSeed = {
   identities: ConstructorParameters<typeof IdentityStore>[0]
   sessions: ConstructorParameters<typeof SessionVault>[0]
   profiles: Profiles
   // Where the files of a reply or a post are read from, when not the working folder's `.devtools-uploads`.
   uploadsRoot?: string
}

export type RunEnvironmentOptions = {
   proxy?: ProxyConfig
   encryptionKey: string
   outputRoot: string
   // Where the device, the session and the profile of the account come from when they are not this computer's own (the
   // ones taken from staging).
   seed?: RunSeed
}

// What the devtools run a task with, on this computer: the tasks, a visible browser, and where the device, the browser profile
// and the files of an account stay. The device and the profile of an account stay on this computer between sessions, as on the
// worker they stay in the bucket (.plan/account-browser-profile.md). The signed-in session only lives for this session.
export const createRunEnvironment = ({ proxy, encryptionKey, outputRoot, seed }: RunEnvironmentOptions) => {
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
   const store = new LocalStore(outputRoot)
   const driver = new CamoufoxDriver({
      actionTimeoutMs: ACTION_TIMEOUT_MS,
      isAllowedNavigation: () => true,
      blocking: 'none',
      headless: false,
      operatingSystems: [hostOs()],
      adjustLaunch: withHostUiFonts,
   })
   const identities = new IdentityStore(seed?.identities ?? store, () => createDeviceIdentity(hostOs()))
   const sessions = new SessionVault(seed?.sessions ?? new MemoryStore(), encryptionKey)
   const profiles = seed?.profiles ?? new DiskProfiles(join(outputRoot, 'profiles'))

   // Runs one task once and prints its answer; undefined when the run ended without one.
   const runOnce = async (run: TaskDefinition, runInput: Record<string, unknown>, account?: SavedAccount) => {
      const command = buildCommand({
         task: run,
         input: runInput,
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
         profiles,
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
         // Files for a reply or a post are read from .devtools-uploads/<upload or file id>/<name> of this folder instead of the bucket.
         uploads: {
            download: (key: string, path: PathLike) =>
               copyFile(
                  join(
                     seed?.uploadsRoot ?? join(process.cwd(), '.devtools-uploads'),
                     key.replace(/^(?:uploads|posts)\/[^/]+\//, '')
                  ),
                  path
               ),
         },
         workerBuild: 'devtools',
      }

      try {
         await runTask(command, deps)
      } catch (error) {
         console.log(`The run stopped with an error: ${error instanceof Error ? error.message : 'unknown'}`)
      }

      if (result) {
         const label =
            run.verdicts[result.verdict]?.label ??
            RUNNER_VERDICTS[result.verdict as keyof typeof RUNNER_VERDICTS]?.label ??
            result.verdict

         formatRun(result, label).forEach(line => console.log(line))
         console.log(`Files: ${join(outputRoot, runPrefix(command))}`)
      }

      return result
   }

   return {
      tasks,
      store,
      driver,
      identities,
      profiles,
      sessions,
      runOnce,
   }
}

export type RunEnvironment = ReturnType<typeof createRunEnvironment>
