import { type AnswerAsk, type AskOptions, type NetworkSnapshot } from './types'

// Why an ask was refused, in the owner's words. A `budget` refusal is the one the owner may go past with Start anyway.
export class NetworkRefusal extends Error {
   public readonly budget: boolean

   public constructor(message: string, budget = false) {
      super(message)
      this.name = 'NetworkRefusal'
      this.budget = budget
   }
}

// Where the page gets its requests and sends its answers. The page talks only to this, so the real endpoints (`trpc-source.ts`) and
// the made-up people of the preview (`sample-source.ts`) are two sources behind one page.
export type NetworkSource = {
   // Tells one source from another, so what the page remembers of one is never shown for another.
   key: string
   load: (accountId: string) => Promise<NetworkSnapshot>
   // How many requests wait for each account.
   waiting: (accountIds: string[]) => Promise<Record<string, number>>
   // Starts a read of LinkedIn; the snapshot says `reading` until it is over.
   refresh: (accountId: string, options: AskOptions) => Promise<void>
   // Asks for the answers; the snapshot shows them QUEUED and then settled.
   answer: (accountId: string, asks: AnswerAsk[], options: AskOptions) => Promise<void>
}
