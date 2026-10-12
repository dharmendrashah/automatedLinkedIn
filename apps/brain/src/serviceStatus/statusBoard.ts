import { CHECK_TIMEOUT_MS, type CheckResult, type ModuleState, REASONS, type StatusModule, dead } from './types'

const DEFAULT_TTL_MS = 10_000

// A little longer than a check's own limit, so a check that is merely slow still gets to say so itself.
const HARD_LIMIT_MS = CHECK_TIMEOUT_MS + 500

export type ModuleStatus = {
   key: string
   group: string
   name: string
   description: string
   status: ModuleState
   reason?: string
}

export type StatusSnapshot = {
   checkedAt: string
   overall: ModuleState
   modules: ModuleStatus[]
}

type Entry = {
   result: CheckResult
   at: number
}

const runWithLimit = async (module: StatusModule): Promise<CheckResult> => {
   let timer: NodeJS.Timeout | undefined

   try {
      return await Promise.race([
         module.check(),
         new Promise<CheckResult>(resolve => {
            timer = setTimeout(() => resolve(dead(REASONS.timedOut)), HARD_LIMIT_MS)
         }),
      ])
   } catch {
      // The text of an error can hold an address or a secret, so only a fixed sentence is kept.
      return dead(REASONS.notAnswering)
   } finally {
      clearTimeout(timer)
   }
}

// Checks every module at the same time and keeps each answer for a short while, so any number of open pages causes one
// round of checks per ten seconds. Nothing is saved: a restart starts empty.
export class StatusBoard {
   private readonly modules: StatusModule[]

   private readonly entries = new Map<string, Entry>()

   private readonly running = new Map<string, Promise<Entry>>()

   public constructor(modules: StatusModule[]) {
      this.modules = modules
   }

   private current(module: StatusModule) {
      const entry = this.entries.get(module.key)

      if (entry && Date.now() - entry.at < (module.ttlMs ?? DEFAULT_TTL_MS)) {
         return entry
      }

      return undefined
   }

   private async refresh(module: StatusModule) {
      const fresh = this.current(module)

      if (fresh) {
         return fresh
      }

      let pending = this.running.get(module.key)

      if (!pending) {
         pending = runWithLimit(module)
            .then(result => {
               const entry = {
                  result,
                  at: Date.now(),
               }

               this.entries.set(module.key, entry)

               return entry
            })
            .finally(() => this.running.delete(module.key))
         this.running.set(module.key, pending)
      }

      return pending
   }

   public async snapshot(): Promise<StatusSnapshot> {
      const entries = await Promise.all(this.modules.map(module => this.refresh(module)))
      const states = entries.map(({ result }) => result.state)

      const overall: ModuleState = states.includes('dead') ? 'dead' : states.includes('unknown') ? 'unknown' : 'live'

      return {
         checkedAt: new Date(Math.max(0, ...entries.map(({ at }) => at))).toISOString(),
         overall,
         modules: this.modules.map((module, index) => {
            const { state, reason } = entries[index].result

            return {
               key: module.key,
               group: module.group,
               name: module.name,
               description: module.description,
               status: state,
               ...(state !== 'live' && reason && { reason }),
            }
         }),
      }
   }
}
