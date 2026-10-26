// The devtools menu, run through `pnpm --filter @automatedLinkedIn/spider dev:record` (builds, then plain `node`): tsx's
// dynamic-import loader mishandles Camoufox's optional `maxmind` dependency (its geoip lookup), turning `maxmind.Reader`
// into undefined; plain Node resolves the same module correctly.
import { join } from 'node:path'

import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { browserExecutablePath } from '../scraping/browserPath'
import { clearWebsiteFilter } from '../scraping/websiteFilter'
import { type SavedAccount, type SavedProxy, listSavedAccounts, listSavedProxies, loadLocalDbConfig } from './localDb'
import { choose, prompt } from './prompt'
import { toProxyConfig } from './proxyConfig'
import { recordSession } from './recordSession'
import { type RunSeed } from './runEnvironment'
import { runTasks } from './runMode'
import { type ReplayChoice, prepareStaging } from './staging/start'

// Assumes the working directory is apps/spider, true for the documented `pnpm --filter ... dev:record` script.
const OUTPUT_ROOT = join(process.cwd(), '.devtools-recordings')

// What a session needs, wherever the account comes from: this computer's own database or a staging account.
type Context = {
   proxy?: ProxyConfig
   picked?: SavedProxy
   listAccounts: () => Promise<SavedAccount[]>
   encryptionKey: string
   seed?: RunSeed
   account?: SavedAccount
   chooseReplay?: () => Promise<ReplayChoice>
}

const localContext = async (): Promise<Context> => {
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

   return {
      ...(picked && {
         picked,
         proxy: toProxyConfig(picked, encryptionKey),
      }),
      listAccounts: () => listSavedAccounts(databaseUrl),
      encryptionKey,
   }
}

const main = async () => {
   const args = process.argv.slice(2)
   // The pulled files stay in their temporary folder unless `--clean` is given.
   const keep = !args.includes('--clean')
   const name = args.find(arg => !arg.startsWith('--')) ?? ''

   // A worker started from this install may have left its allowlist filter in the browser's policies; here every address is
   // allowed.
   await clearWebsiteFilter(await browserExecutablePath()).catch(() => undefined)

   const environment = await choose('Which environment?', [
      {
         label: 'Local \u2014 the accounts and proxies of this computer',
         value: 'local',
      },
      {
         label: 'Staging \u2014 take one staging account (proxy, device, browser profile, session) and use it here',
         value: 'staging',
      },
   ])
   const staging = environment === 'staging' ? await prepareStaging(keep) : undefined
   const context: Context = staging ?? (await localContext())

   const mode = await choose('What do you want to do?', [
      {
         label: 'Record a session \u2014 browse by hand, the steps are saved',
         value: 'record',
      },
      {
         label: 'Run a task \u2014 ask for its inputs, run it, show the result',
         value: 'run',
      },
      ...(context.chooseReplay
         ? [
              {
                 label: 'Replay a staging run \u2014 repeat its steps, then keep recording',
                 value: 'replay',
              },
           ]
         : []),
   ])
   const { proxy, picked, listAccounts, encryptionKey, seed, account, chooseReplay } = context

   const replay = mode === 'replay' && chooseReplay ? await chooseReplay() : undefined

   if (mode === 'run' || replay?.kind === 'task') {
      await runTasks({
         proxy,
         listAccounts,
         encryptionKey,
         outputRoot: OUTPUT_ROOT,
         account,
         seed,
         ...(replay?.kind === 'task' && {
            rerun: {
               task: replay.task,
               input: replay.input,
            },
         }),
      })

      return
   }

   await recordSession({
      proxy,
      picked,
      name,
      outputRoot: OUTPUT_ROOT,
      listAccounts,
      encryptionKey,
      seed,
      ...(replay?.kind === 'steps' && { replay: replay.steps }),
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
