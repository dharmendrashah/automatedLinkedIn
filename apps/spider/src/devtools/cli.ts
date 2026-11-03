import { Command, InvalidArgumentError, Option } from 'commander'

// What the command line asks for. `menu` is the questions as before; `run` is a task named on the command line, whose other
// choices are asked only when they were not given. Nothing here runs anything.
export type Plan =
   | { kind: 'menu'; name: string; keep: boolean }
   | {
        kind: 'run'
        task: string
        // The task's input as `key=value` words, and as one JSON object; the words win.
        fields: string[]
        input?: string
        env: 'local' | 'staging'
        // A saved proxy, by the email of its account (or `none`), and an account by its email.
        proxy?: string
        account?: string
        runs?: number
        yes: boolean
        keep: boolean
     }
   | { kind: 'help'; text: string }

const MAX_RUNS = 10

const wholeNumber = (text: string) => {
   const count = Number(text)

   if (!Number.isInteger(count) || count < 1 || count > MAX_RUNS) {
      throw new InvalidArgumentError(`Use a whole number from 1 to ${MAX_RUNS}.`)
   }

   return count
}

const jsonObject = (text: string) => {
   try {
      const parsed: unknown = JSON.parse(text)

      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
         return text
      }
   } catch {
      // Falls through to the message below.
   }

   throw new InvalidArgumentError('Give one JSON object, such as \'{"text":"Hello"}\'.')
}

const collectField = (word: string, previous: string[]) => {
   if (word.indexOf('=') < 1) {
      throw new InvalidArgumentError('Write each input as key=value.')
   }

   return [...previous, word]
}

// Reads the words after `pnpm record`. Throws the parser's own message for anything it cannot take, and hands back the help text
// for --help, so the caller decides what to print and when to stop.
export const parseCommandLine = (argv: string[]): Plan => {
   let plan: Plan | undefined
   let help = ''
   let failure = ''
   const program = new Command()
      .name('pnpm record')
      .description('Record a LinkedIn session by hand, or run a spider task and show its result.')
      .enablePositionalOptions()
      .exitOverride()
      .configureOutput({
         writeOut: text => {
            help += text
         },
         writeErr: () => undefined,
         outputError: text => {
            failure = text.trim().replace(/^error: /, '')
         },
      })

   program
      .argument('[name]', 'a name for the recording')
      .option('--clean', 'remove the files pulled from staging when the tool ends')
      .action((name: string | undefined, options: { clean?: boolean }) => {
         plan = {
            kind: 'menu',
            name: name ?? '',
            keep: options.clean !== true,
         }
      })

   program
      .command('run')
      .description('run one task, asking only for what is not given')
      .argument('<task>', 'the name of the task, such as linkedin-inmail')
      .argument('[fields...]', "the task's input as key=value words", collectField, [])
      .option('-i, --input <json>', "the task's whole input as a JSON object; key=value words win", jsonObject)
      .addOption(
         new Option('-e, --env <env>', 'where the account comes from').choices(['local', 'staging']).default('local')
      )
      .option('-p, --proxy <email>', 'a saved proxy, by the email of its account, or none')
      .option('-a, --account <email>', 'the account to sign in as, by its email')
      .option('-n, --runs <count>', `how many times to run it (1 to ${MAX_RUNS})`, wholeNumber)
      .option('-y, --yes', 'do not ask before signing in to live LinkedIn')
      .option('--clean', 'remove the files pulled from staging when the tool ends')
      .action(
         (
            task: string,
            fields: string[],
            options: {
               input?: string
               env: 'local' | 'staging'
               proxy?: string
               account?: string
               runs?: number
               yes?: boolean
               clean?: boolean
            }
         ) => {
            plan = {
               kind: 'run',
               task,
               fields,
               env: options.env,
               yes: options.yes === true,
               keep: options.clean !== true && program.opts<{ clean?: boolean }>().clean !== true,
               ...(options.input !== undefined && { input: options.input }),
               ...(options.proxy !== undefined && { proxy: options.proxy }),
               ...(options.account !== undefined && { account: options.account }),
               ...(options.runs !== undefined && { runs: options.runs }),
            }
         }
      )

   try {
      program.parse(argv, { from: 'user' })
   } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'commander.helpDisplayed') {
         return {
            kind: 'help',
            text: help,
         }
      }

      throw new Error(failure || (error instanceof Error ? error.message : String(error)), { cause: error })
   }

   return (
      plan ?? {
         kind: 'help',
         text: help,
      }
   )
}
