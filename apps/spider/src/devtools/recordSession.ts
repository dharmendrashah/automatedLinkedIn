// Run through `pnpm --filter @automatedLinkedIn/spider dev:record` (builds, then plain `node`): tsx's dynamic-import
// loader mishandles Camoufox's optional `maxmind` dependency (its geoip lookup), turning `maxmind.Reader` into
// undefined; plain Node resolves the same module correctly.
import { Camoufox } from 'camoufox'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { buildCamoufoxOptions } from '../scraping/camoufoxDriver'
import { openProxyCredentials } from '../tasks/credentials'
import { type SavedProxy, listSavedProxies, loadLocalDbConfig } from './localDb'
import { type DevStepEntry, attachPageRecorder } from './pageRecorder'
import { renderSkeleton } from './skeleton'

// Assumes the working directory is apps/spider, true for the documented `pnpm --filter ... dev:record` script.
const OUTPUT_ROOT = join(process.cwd(), '.devtools-recordings')

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

// `rl.once('line', ...)` rather than `rl.question()`: a `question()` left pending (closing the browser window
// instead of pressing Enter) would still be "active" on the interface, and a second question() afterwards (the name
// prompt) would break.
const waitForStop = (browser: { on: (event: 'disconnected', listener: () => void) => void }) =>
   new Promise<void>(resolve => {
      const finish = () => resolve()

      browser.on('disconnected', finish)
      console.log('\nRecording. Press Enter here, or close the browser window, to stop and save.')
      rl.once('line', finish)
   })

const slugify = (name: string) =>
   name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'session'

const main = async () => {
   const { databaseUrl, encryptionKey } = loadLocalDbConfig()
   const proxies = await listSavedProxies(databaseUrl)
   const picked = await pickProxy(proxies)
   const proxy = picked ? toProxyConfig(picked, encryptionKey) : undefined

   const browser = await Camoufox(buildCamoufoxOptions(false, proxy))
   const steps: DevStepEntry[] = []

   try {
      const context = await browser.newContext(proxy ? { ignoreHTTPSErrors: true } : {})
      const page = await context.newPage()

      await attachPageRecorder(page, step => steps.push(step))
      await page.goto('about:blank')

      await waitForStop(browser)
   } finally {
      await browser.close().catch(() => undefined)
   }

   const name = await rl.question('\nName this recording (used in the folder name): ')
   const slug = `${slugify(name)}-${new Date().toISOString().replace(/[:.]/g, '-')}`
   const dir = join(OUTPUT_ROOT, slug)

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

   console.log(`\nSaved ${steps.length} step(s) to ${dir}`)

   rl.close()
}

main()
   .catch(error => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
   })
   .finally(() => rl.close())
