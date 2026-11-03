// The devtools menu, run through `pnpm --filter @automatedLinkedIn/spider dev:record` (builds, then plain `node`): tsx's
// dynamic-import loader mishandles Camoufox's optional `maxmind` dependency (its geoip lookup), turning `maxmind.Reader`
// into undefined; plain Node resolves the same module correctly.
import { join } from 'node:path'

import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { browserExecutablePath } from '../scraping/browserPath'
import { clearWebsiteFilter } from '../scraping/websiteFilter'
import { type Plan, parseCommandLine } from './cli'
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

// The saved proxy named by the email of its account on the command line, `none` for no proxy, or one asked for when nothing was named.
const pickProxy = async (proxies: SavedProxy[], named: string | undefined) => {
   if (named?.toLowerCase() === 'none') {
      return undefined
   }

   if (named !== undefined) {
      const found = proxies.find(proxy => proxy.accountEmail.toLowerCase() === named.toLowerCase())

      if (!found) {
         throw new Error(
            `No saved proxy belongs to ${named}. They belong to: ${proxies.map(proxy => proxy.accountEmail).join(', ') || 'nobody'}.`
         )
      }

      return found
   }

   return choose<SavedProxy | undefined>('Which proxy?', [
      {
         label: 'No proxy \u2014 connect directly',
         value: undefined,
      },
      ...proxies.map(proxy => ({
         label: `${proxy.accountEmail} \u2014 ${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port} (${proxy.status})`,
         value: proxy,
      })),
   ])
}

const localContext = async (named: string | undefined): Promise<Context> => {
   const { databaseUrl, encryptionKey } = loadLocalDbConfig()
   const picked = await pickProxy(await listSavedProxies(databaseUrl), named)

   return {
      ...(picked && {
         picked,
         proxy: toProxyConfig(picked, encryptionKey),
      }),
      listAccounts: () => listSavedAccounts(databaseUrl),
      encryptionKey,
   }
}

const main = async (plan: Exclude<Plan, { kind: 'help' }>) => {
   // The pulled files stay in their temporary folder unless `--clean` is given.
   const { keep } = plan
   const name = plan.kind === 'menu' ? plan.name : ''

   // A worker started from this install may have left its allowlist filter in the browser's policies; here every address is
   // allowed.
   await clearWebsiteFilter(await browserExecutablePath()).catch(() => undefined)

   const environment =
      plan.kind === 'run'
         ? plan.env
         : await choose('Which environment?', [
              {
                 label: 'Local \u2014 the accounts and proxies of this computer',
                 value: 'local',
              },
              {
                 label: 'Staging \u2014 take one staging account (proxy, device, browser profile, session) and use it here',
                 value: 'staging',
              },
           ])

   if (plan.kind === 'run' && environment === 'staging' && plan.proxy !== undefined) {
      console.warn('\nStaging brings its own proxy, so --proxy is ignored.')
   }

   const staging = environment === 'staging' ? await prepareStaging(keep) : undefined
   const context: Context = staging ?? (await localContext(plan.kind === 'run' ? plan.proxy : undefined))

   const mode =
      plan.kind === 'run'
         ? 'run'
         : await choose('What do you want to do?', [
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
         ...(plan.kind === 'run' && {
            request: {
               task: plan.task,
               input: {
                  fields: plan.fields,
                  ...(plan.input !== undefined && { json: plan.input }),
               },
               yes: plan.yes,
               ...(plan.account !== undefined && { account: plan.account }),
               ...(plan.runs !== undefined && { runs: plan.runs }),
            },
         }),
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

const start = async () => {
   const plan = parseCommandLine(process.argv.slice(2))

   if (plan.kind === 'help') {
      console.log(plan.text)

      return
   }

   await main(plan)
}

start()
   .catch(error => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
   })
   .finally(() => {
      prompt().close()
      process.exit(process.exitCode ?? 0)
   })
