// Record mode of the devtools menu (index.ts): browse by hand and save the steps.
import { Camoufox } from 'camoufox'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { type Browser, type BrowserContext, type Page } from 'playwright-core'

import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { buildCamoufoxOptions, newFingerprint } from '../scraping/camoufoxDriver'
import { hostOs } from './hostOs'
import { type SavedProxy } from './localDb'
import { type DevStepEntry, attachPageRecorder } from './pageRecorder'
import { handleInterrupt, prompt } from './prompt'
import { renderSkeleton } from './skeleton'

// Stops on Enter, Ctrl+C, the last browser window closing, or the browser quitting. Firefox keeps running after its
// window closes on some platforms, so `disconnected` alone is not enough. A second Ctrl+C forces the exit.
const waitForStop = (browser: Browser, context: BrowserContext) =>
   new Promise<void>(resolve => {
      let stopped = false

      const stop = () => {
         stopped = true
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
      browser.on('disconnected', stop)
      prompt().once('line', stop)
      handleInterrupt(() => {
         if (stopped) {
            process.exit(1)
         }

         stop()
      })
      process.once('SIGTERM', stop)
      console.log('\nRecording. Press Enter here, press Ctrl+C, or close the browser window to stop and save.')
   })

const slugify = (name: string) =>
   name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'session'

const saveRecording = async (
   outputRoot: string,
   steps: DevStepEntry[],
   picked: SavedProxy | undefined,
   name: string
) => {
   const dir = join(outputRoot, `${slugify(name)}-${new Date().toISOString().replace(/[:.]/g, '-')}`)

   await mkdir(dir, { recursive: true })
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
            steps,
         },
         null,
         2
      )
   )
   await writeFile(join(dir, 'skeleton.md'), renderSkeleton(steps))

   return dir
}

// A browser that is already gone can leave close() pending forever, so it never holds up the exit.
const closeBrowser = (browser: Browser) =>
   Promise.race([browser.close().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 5000))])

export type RecordOptions = {
   proxy?: ProxyConfig
   picked?: SavedProxy
   name: string
   outputRoot: string
}

export const recordSession = async ({ proxy, picked, name, outputRoot }: RecordOptions) => {
   const browser = await Camoufox(buildCamoufoxOptions(false, proxy, newFingerprint([hostOs()])))
   const steps: DevStepEntry[] = []

   try {
      const context = await browser.newContext(proxy ? { ignoreHTTPSErrors: true } : {})
      const page = await context.newPage()

      await attachPageRecorder(page, step => steps.push(step))
      await page.goto('about:blank')
      await waitForStop(browser, context)

      // Saved before the browser is closed, so a slow or stuck close can never lose the recording.
      const dir = await saveRecording(outputRoot, steps, picked, name)

      console.log(`\nSaved ${steps.length} step(s) to ${dir}`)
   } finally {
      await closeBrowser(browser)
   }
}
