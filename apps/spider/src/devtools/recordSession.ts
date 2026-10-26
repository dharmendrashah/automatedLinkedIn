// Record mode of the devtools menu (index.ts): browse by hand and save the steps, a video, the network calls and the pages seen.
import { Camoufox } from 'camoufox'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { type Browser, type BrowserContext, type Page } from 'playwright-core'

import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { type Keeper, snapshotPage } from '../browsing/snapshot'
import { type DeviceIdentity } from '../identity/deviceIdentity'
import { lookupExit } from '../identity/lookupExit'
import { regionToKeep } from '../identity/region'
import { Recorder } from '../recording/recorder'
import { buildCamoufoxOptions, nativeOf, newFingerprint } from '../scraping/camoufoxDriver'
import { openCredentials } from '../tasks/credentials'
import { TASK_NAME as LOGIN_TASK } from '../tasks/linkedinLogin'
import { hostOs } from './hostOs'
import { type SavedAccount, type SavedProxy, listSavedAccounts } from './localDb'
import { type NetworkEntry, networkEntry } from './networkLog'
import { type DevStepEntry, attachPageRecorder } from './pageRecorder'
import { handleInterrupt, prompt } from './prompt'
import { parseRecordCommand, snapshotName, stepSnapshotName } from './recordCommands'
import { createRunEnvironment } from './runEnvironment'
import { renderSkeleton } from './skeleton'

const FEED_URL = 'https://www.linkedin.com/feed/'
const MOST_REQUESTS = 5000
const MOST_AUTO_SNAPSHOTS = 60
const AFTER_STEP_MS = 2000

// What a recording needs of the browser it was started with, whichever way it was started.
type Opened = {
   context: BrowserContext
   page: Page
   keeper: Keeper['browser']
   // Calls back when the browser goes away by itself (a window closed, a crash).
   onGone: (callback: () => void) => void
   // A browser that is already gone can leave close() pending forever, so it never holds up the exit.
   close: () => Promise<void>
   // Saves the run files (video, timeline, logs, the full network) once the browser is closed.
   finish?: () => Promise<void>
   device?: Pick<DeviceIdentity, 'os' | 'locale' | 'timezone' | 'country'>
}

const withTimeout = (work: Promise<unknown>) =>
   Promise.race([work.catch(() => undefined), new Promise(resolve => setTimeout(resolve, 5000))]).then(() => undefined)

// No account: a fresh browser, as before; its video is kept in the recording folder.
const openAnonymous = async (proxy: ProxyConfig | undefined, videoDir: string): Promise<Opened> => {
   const browser: Browser = await Camoufox(buildCamoufoxOptions(false, proxy, newFingerprint([hostOs()])))
   const context = await browser.newContext({
      ...(proxy && { ignoreHTTPSErrors: true }),
      recordVideo: { dir: videoDir },
   })
   const page = await context.newPage()

   return {
      context,
      page,
      keeper: {
         pageHtml: () => page.content(),
         screenshot: () => page.screenshot(),
      },
      onGone: callback => browser.on('disconnected', callback),
      close: () => withTimeout(browser.close()),
   }
}

type AccountOptions = {
   proxy: ProxyConfig | undefined
   picked: SavedProxy
   databaseUrl: string
   encryptionKey: string
   outputRoot: string
   // The recording's folder name under outputRoot; the run files go in its `run` folder.
   folder: string
}

// The account behind the chosen proxy, in the browser profile its daily visits use: the same device, language, timezone and
// session, so what is recorded is what the worker will see. A profile that does not exist yet is made by the sign-in first.
const openAccount = async ({ proxy, picked, databaseUrl, encryptionKey, outputRoot, folder }: AccountOptions) => {
   const account = (await listSavedAccounts(databaseUrl)).find(found => found.id === picked.accountId)

   if (!account) {
      throw new Error('The account of this proxy is not in the local database.')
   }

   const env = createRunEnvironment({
      proxy,
      encryptionKey,
      outputRoot,
   })
   const profile = await env.profiles.checkout(account.id)

   if (!profile.restored) {
      const login = env.tasks.find(found => found.name === LOGIN_TASK)

      console.log(`\nThere is no browser profile of ${account.email} on this computer yet: signing in first.`)

      if (!login || (await env.runOnce(login, {}, account))?.status !== 'SUCCEEDED') {
         throw new Error('The sign-in did not work, so there is nothing to record. Try "Run a task" first.')
      }
   }

   let device = await env.identities.forAccount(account.id)
   const exit = await lookupExit(proxy)
   const kept = regionToKeep(device, exit)

   if (kept) {
      device = await env.identities.pin(account.id, device, kept)
   }

   // The same run files a task keeps (video, timeline, logs, the network with its bodies), under the recording's folder. A
   // recording that cannot start must not stop the session.
   const recorder = await Recorder.start({
      kind: 'devtools-record',
      id: randomUUID(),
      prefix: `${folder}/run`,
      mode: 'always',
      video: true,
      store: env.store,
   }).catch(() => undefined)
   const credentials = openCredentials(account.secret, encryptionKey)

   for (const secret of [
      proxy?.username,
      proxy?.password,
      credentials.password,
      credentials.totpSecret,
      credentials.session,
   ]) {
      if (secret) {
         recorder?.addSecret(secret)
      }
   }

   const session = await env.driver
      .open({
         ...(proxy && { proxy }),
         ...(recorder && { recorder }),
         identity: device,
         exitIp: exit.ip,
         profileDir: profile.dir,
      })
      .catch((error: unknown) => {
         throw new Error(
            `The browser could not start with the profile of ${account.email}. Is it open in another window or run? ${error instanceof Error ? error.message : ''}`
         )
      })
   const native = nativeOf(session)

   if (!native) {
      await session.close()

      throw new Error('The browser did not start.')
   }

   const opened: Opened = {
      ...native,
      keeper: session,
      onGone: callback => native.context.on('close', callback),
      close: () => withTimeout(session.close()),
      finish: async () => {
         await recorder?.finish({ failed: false })
      },
      device: {
         os: device.os,
         locale: device.locale,
         timezone: device.timezone,
         country: device.country,
      },
   }

   return {
      opened,
      account,
   }
}

// Opened after the recorder is attached: its script only reaches documents loaded from then on, so a page loaded before would
// record no click.
const visitFeed = async (page: Page, account: SavedAccount) => {
   await page.goto(FEED_URL, { waitUntil: 'domcontentloaded' }).catch(() => undefined)

   const { pathname } = new URL(page.url())

   console.log(
      pathname.startsWith('/feed')
         ? `\nSigned in as ${account.email}, with the device and profile its daily visits use.`
         : `\nLinkedIn showed ${pathname} instead of the feed: the session may need a sign-in by hand.`
   )
}

// Stops on Enter, Ctrl+C, the last browser window closing, or the browser quitting; `s` then Enter keeps the page as it is. A
// second Ctrl+C forces the exit.
const waitForStop = ({ context, onGone }: Opened, snapshot: () => Promise<void>) =>
   new Promise<void>(resolve => {
      let stopped = false

      const onLine = (line: string) => {
         const command = parseRecordCommand(line)

         if (command.kind === 'stop') {
            stop()
         } else if (command.kind === 'snapshot') {
            void snapshot()
         } else {
            console.log(`Unknown "${command.line}". Type s then Enter to keep the page, or just Enter to stop.`)
         }
      }
      const stop = () => {
         stopped = true
         prompt().off('line', onLine)
         resolve()
      }
      const watchClose = (page: Page) =>
         page.on('close', () => {
            if (context.pages().length === 0) {
               stop()
            }
         })

      context.pages().forEach(watchClose)
      context.on('page', watchClose)
      onGone(stop)
      prompt().on('line', onLine)
      handleInterrupt(() => {
         if (stopped) {
            process.exit(1)
         }

         stop()
      })
      process.once('SIGTERM', stop)
      console.log(
         '\nRecording, with a video. The page is kept after every click and page visit (up to 60); type s then Enter to keep it at any other moment. Press Enter alone, press Ctrl+C, or close the browser window to stop and save.'
      )
   })

const slugify = (name: string) =>
   name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'session'

type Saved = {
   dir: string
   steps: DevStepEntry[]
   network: NetworkEntry[]
   picked: SavedProxy | undefined
   account?: SavedAccount
   device?: Opened['device']
}

const saveRecording = async ({ dir, steps, network, picked, account, device }: Saved) => {
   await writeFile(
      join(dir, 'steps.json'),
      JSON.stringify(
         {
            proxy: picked
               ? {
                    id: picked.id,
                    host: picked.host,
                    port: picked.port,
                 }
               : null,
            account: account
               ? {
                    id: account.id,
                    email: account.email,
                 }
               : null,
            device: device ?? null,
            steps,
         },
         null,
         2
      )
   )
   await writeFile(join(dir, 'network.json'), JSON.stringify(network, null, 1))
   await writeFile(join(dir, 'skeleton.md'), renderSkeleton(steps))
}

export type RecordOptions = {
   proxy?: ProxyConfig
   picked?: SavedProxy
   name: string
   outputRoot: string
   databaseUrl: string
   encryptionKey: string
}

export const recordSession = async ({ proxy, picked, name, outputRoot, databaseUrl, encryptionKey }: RecordOptions) => {
   if (!picked) {
      console.log(
         '\nNo proxy, so no account: this opens a plain browser. Pick an account\u2019s proxy to record as that account.'
      )
   }

   const folder = `${slugify(name)}-${new Date().toISOString().replace(/[:.]/g, '-')}`
   const dir = join(outputRoot, folder)
   const found = picked
      ? await openAccount({
           proxy,
           picked,
           databaseUrl,
           encryptionKey,
           outputRoot,
           folder,
        })
      : undefined
   const opened = found?.opened ?? (await openAnonymous(proxy, join(dir, 'run')))
   const steps: DevStepEntry[] = []
   const network: NetworkEntry[] = []
   const pending: Array<Promise<void>> = []
   let manual = 0
   let kept = 0

   try {
      await mkdir(dir, { recursive: true })
      opened.context.on('response', response => {
         const request = response.request()
         const entry = networkEntry(request.method(), response.url(), response.status(), request.resourceType())

         if (entry && network.length < MOST_REQUESTS) {
            network.push(entry)
         }
      })

      // It holds other members' public text and stays in this folder on this computer.
      const snapshot = async (label: string) => {
         kept += 1
         await snapshotPage(
            {
               browser: opened.keeper,
               attach: (file, content) => writeFileSync(join(dir, file), content),
               screenshot: (file, png) => writeFile(join(dir, `${file}.png`), png),
               warn: console.warn,
            },
            label
         )
         console.log(`Kept ${label} in ${dir}`)
      }

      await attachPageRecorder(opened.page, step => {
         steps.push(step)

         // A moment after a click or a page visit, once the page has answered it.
         if ((step.call === 'click' || step.call === 'goto') && kept < MOST_AUTO_SNAPSHOTS) {
            const label = stepSnapshotName(step.n)

            step.snapshot = label
            pending.push(
               new Promise<void>(resolve => {
                  setTimeout(() => void snapshot(label).finally(resolve), AFTER_STEP_MS)
               })
            )
         }
      })

      if (found) {
         await visitFeed(opened.page, found.account)
      } else {
         await opened.page.goto('about:blank')
      }

      await waitForStop(opened, () => {
         manual += 1

         return snapshot(snapshotName(manual))
      })

      // The page after the last step is still being kept when Enter is pressed.
      await Promise.all(pending)

      // Saved before the browser is closed, so a slow or stuck close can never lose the recording.
      await saveRecording({
         dir,
         steps,
         network,
         picked,
         account: found?.account,
         device: opened.device,
      })
      console.log(
         `\nSaved ${steps.length} step(s), ${network.length} network call(s) and ${kept} snapshot(s) to ${dir}`
      )
   } finally {
      await opened.close()
      await opened.finish?.()
   }
}
