import { type Interface, createInterface } from 'node:readline/promises'

let rl: Interface | undefined
let onInterrupt: (() => void) | undefined

// Created on first use, so importing this module (a unit test, say) never takes hold of the terminal.
export const prompt = () => {
   if (!rl) {
      rl = createInterface({
         input: process.stdin,
         output: process.stdout,
      })

      // Ctrl+C quits at a prompt. While something is running, the handler decides (finish first, quit on the second press).
      rl.on('SIGINT', () => {
         if (onInterrupt) {
            onInterrupt()

            return
         }

         console.log('\nBye.')
         process.exit(130)
      })
   }

   return rl
}

// Returns the function that puts the default back.
export const handleInterrupt = (handler: () => void) => {
   onInterrupt = handler

   return () => {
      onInterrupt = undefined
   }
}

export const ask = async (question: string, fallback = '') => {
   const answer = (await prompt().question(fallback ? `${question} [${fallback}]: ` : `${question}: `)).trim()

   return answer || fallback
}

export const confirm = async (question: string) => /^y(es)?$/i.test(await ask(`${question} (y/N)`))

export const choose = async <T>(title: string, options: Array<{ label: string; value: T }>): Promise<T> => {
   console.log(`\n${title}`)
   options.forEach(({ label }, index) => console.log(`  ${index + 1}) ${label}`))

   for (;;) {
      const choice = Number.parseInt(await ask('Pick one by number'), 10)
      const picked = options[choice - 1]

      if (picked) {
         return picked.value
      }

      console.log(`Enter a number from 1 to ${options.length}.`)
   }
}
