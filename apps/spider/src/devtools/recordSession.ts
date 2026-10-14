// Run through `pnpm --filter @automatedLinkedIn/spider dev:record` (builds, then plain `node`): tsx's dynamic-import
// loader mishandles Camoufox's optional `maxmind` dependency (its geoip lookup), turning `maxmind.Reader` into
// undefined; plain Node resolves the same module correctly.
import { Camoufox } from 'camoufox'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { type Browser, type BrowserContext, type Page } from 'playwright-core'

import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { type FingerprintOs, buildCamoufoxOptions, newFingerprint } from '../scraping/camoufoxDriver'
import { openProxyCredentials } from '../tasks/credentials'
import { type SavedProxy, listSavedProxies, loadLocalDbConfig } from './localDb'
import { type DevStepEntry, attachPageRecorder } from './pageRecorder'
import { renderSkeleton } from './skeleton'

// Assumes the working directory is apps/spider, true for the documented `pnpm --filter ... dev:record` script.
const OUTPUT_ROOT = join(process.cwd(), '.devtools-recordings')

const HOST_OS: Record<string, FingerprintOs> = {
   darwin: 'macos',
   win32: 'windows',
}

const rl = createInterface({
   input: process.stdin,
   output: process.stdout,
})

const toProxyConfig = (proxy: SavedProxy, keyBase64: string): ProxyConfig | undefined => {
   const credentials = openProxyCredentials(proxy.secret, keyBase64)

   return {
      server: `${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}`,
      ...(credentials.username ? { username: credentials.username } : {}),
      ...(credentials.password ? { password: credentials.password } : {}),
   }
}

const pickProxy = async (proxies: SavedProxy[]): Promise<SavedProxy | undefined> => {
   console.log('\nSaved proxies:')
   console.log('  0) No proxy \u2014 connect directly')

   proxies.forEach((proxy, index) => {
      console.log(
         `  ${index + 1}) ${proxy.accountEmail} \u2014 ${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port} (${proxy.status})`
      )
   })

   const answer = await rl.question('\nPick one by number: ')
   const choice = Number.parseInt(answer, 10)

   if (!Number.isInteger(choice) || choice < 0 || choice > proxies.length) {
      throw new Error(`Not a valid choice: ${answer}`)
   }

   return choice === 0 ? undefined : proxies[choice - 1]
}

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
      rl.once('line', stop)
      rl.on('SIGINT', () => {
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

const saveRecording = async (steps: DevStepEntry[], picked: SavedProxy | undefined, name: string) => {
   const dir = join(OUTPUT_ROOT, `${slugify(name)}-${new Date().toISOString().replace(/[:.]/g, '-')}`)

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

const main = async () => {
   const { databaseUrl, encryptionKey } = loadLocalDbConfig()
   const proxies = await listSavedProxies(databaseUrl)
   const picked = await pickProxy(proxies)
   const proxy = picked ? toProxyConfig(picked, encryptionKey) : undefined

   const browser = await Camoufox(
      buildCamoufoxOptions(false, proxy, newFingerprint([HOST_OS[process.platform] ?? 'linux']))
   )
   const steps: DevStepEntry[] = []

   try {
      const context = await browser.newContext(proxy ? { ignoreHTTPSErrors: true } : {})
      const page = await context.newPage()

      await attachPageRecorder(page, step => steps.push(step))
      await page.goto('about:blank')
      await waitForStop(browser, context)

      // Saved before the browser is closed, so a slow or stuck close can never lose the recording.
      const dir = await saveRecording(steps, picked, process.argv[2] ?? '')

      console.log(`\nSaved ${steps.length} step(s) to ${dir}`)
   } finally {
      await closeBrowser(browser)
   }
}

main()
   .catch(error => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
   })
   .finally(() => {
      rl.close()
      process.exit(process.exitCode ?? 0)
   })
