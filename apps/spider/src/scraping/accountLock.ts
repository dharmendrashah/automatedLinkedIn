import { ObjectNotFoundError, type ObjectStore, lockKey } from '../storage/store'

export type Lease = { release: () => Promise<void> }

type Store = Pick<ObjectStore, 'create' | 'getVersioned' | 'delete' | 'replace'>

type Options = {
   // How often a running task pushes its lease's expiry forward; a fifth of the expiry when not set.
   renewMs?: number
   warn?: (message: string) => void
}

const readLease = (body: string) => {
   try {
      return JSON.parse(body) as { task_id?: unknown; expires_at?: unknown }
   } catch {
      return {}
   }
}

// A lease nobody can read would block the account for ever, so it counts as expired.
const isExpired = (lease: { expires_at?: unknown }, now: number) =>
   typeof lease.expires_at !== 'string' || Date.parse(lease.expires_at) <= now

// One task per account at a time, across workers. The lease is an object in the store that only one task can
// create. While the task runs it is renewed, so its expiry can be short and a crashed worker frees the account soon.
// The broker hands a task to one worker at a time and again only once that worker is gone, so a lease held by the
// same task is one its earlier run left behind, and is taken over at once.
export class AccountLock {
   private readonly renewMs: number

   public constructor(
      private readonly store: Store,
      private readonly ttlMs: number,
      private readonly now: () => number = Date.now,
      private readonly options: Options = {}
   ) {
      this.renewMs = options.renewMs ?? Math.floor(ttlMs / 5)
   }

   private body(taskId: string) {
      return JSON.stringify({
         task_id: taskId,
         expires_at: new Date(this.now() + this.ttlMs).toISOString(),
      })
   }

   // Resolves to the lease, or undefined when another task holds the account.
   public async acquire(accountId: string, taskId: string): Promise<Lease | undefined> {
      const key = lockKey(accountId)

      // The second round is the one after taking over an expired lease or after the holder just released.
      for (let round = 0; round < 2; round += 1) {
         const version = await this.store.create(key, this.body(taskId), 'application/json')

         if (version !== undefined) {
            return this.hold(key, accountId, taskId, version)
         }

         let current: { body: string; version: string }

         try {
            current = await this.store.getVersioned(key)
         } catch (error) {
            if (error instanceof ObjectNotFoundError) {
               continue
            }

            throw error
         }

         const lease = readLease(current.body)

         if (lease.task_id !== taskId && !isExpired(lease, this.now())) {
            return undefined
         }

         // Deletes exactly the version read, so a lease taken in the meantime is left alone.
         await this.store.delete(key, current.version)
      }

      return undefined
   }

   // Renews the lease until it is released. A renewal that fails is tried again next time; a lease another task took
   // over is left to it.
   private hold(key: string, accountId: string, taskId: string, version: string): Lease {
      const warn = this.options.warn ?? (() => undefined)
      let current = version
      let lost = false
      let renewing: Promise<void> = Promise.resolve()

      const renew = async () => {
         if (lost) {
            return
         }

         try {
            const next = await this.store.replace(key, this.body(taskId), 'application/json', current)

            if (next === undefined) {
               lost = true
               warn(`The lease of account ${accountId} was taken over while task ${taskId} still ran`)
            } else {
               current = next
            }
         } catch (error) {
            warn(`The lease of account ${accountId} could not be renewed: ${(error as Error).message}`)
         }
      }

      const timer = setInterval(() => {
         renewing = renewing.then(renew)
      }, this.renewMs)

      timer.unref()

      return {
         release: async () => {
            clearInterval(timer)
            await renewing

            if (!lost) {
               await this.store.delete(key, current)
            }
         },
      }
   }
}
