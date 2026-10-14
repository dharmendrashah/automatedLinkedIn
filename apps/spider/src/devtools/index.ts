// The devtools menu, run through `pnpm --filter @automatedLinkedIn/spider dev:record` (builds, then plain `node`): tsx's
// dynamic-import loader mishandles Camoufox's optional `maxmind` dependency (its geoip lookup), turning `maxmind.Reader`
// into undefined; plain Node resolves the same module correctly.
import { join } from 'node:path'

import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { openProxyCredentials } from '../tasks/credentials'
import { type SavedProxy, listSavedProxies, loadLocalDbConfig } from './localDb'
import { choose, prompt } from './prompt'
import { recordSession } from './recordSession'
import { runTasks } from './runMode'

// Assumes the working directory is apps/spider, true for the documented `pnpm --filter ... dev:record` script.
const OUTPUT_ROOT = join(process.cwd(), '.devtools-recordings')

const toProxyConfig = (proxy: SavedProxy, keyBase64: string): ProxyConfig => {
   const credentials = openProxyCredentials(proxy.secret, keyBase64)

   return {
      server: `${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}`,
      ...(credentials.username ? { username: credentials.username } : {}),
      ...(credentials.password ? { password: credentials.password } : {}),
   }
}

const main = async () => {
   const { databaseUrl, encryptionKey } = loadLocalDbConfig()
   const proxies = await listSavedProxies(databaseUrl)

   const picked = await choose<SavedProxy | undefined>('Which proxy?', [
      {
         label: 'No proxy \u2014 connect directly',
         value: undefined,
      },
      ...proxies.map(proxy => ({
         label: `${proxy.accountEmail} \u2014 ${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port} (${proxy.status})`,
         value: proxy,
      })),
   ])
   const proxy = picked ? toProxyConfig(picked, encryptionKey) : undefined

   const mode = await choose('What do you want to do?', [
      {
         label: 'Record a session \u2014 browse by hand, the steps are saved',
         value: 'record',
      },
      {
         label: 'Run a task \u2014 ask for its inputs, run it, show the result',
         value: 'run',
      },
   ])

   if (mode === 'record') {
      await recordSession({
         proxy,
         picked,
         name: process.argv[2] ?? '',
         outputRoot: OUTPUT_ROOT,
      })

      return
   }

   await runTasks({
      proxy,
      databaseUrl,
      encryptionKey,
      outputRoot: OUTPUT_ROOT,
   })
}

main()
   .catch(error => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
   })
   .finally(() => {
      prompt().close()
      process.exit(process.exitCode ?? 0)
   })
