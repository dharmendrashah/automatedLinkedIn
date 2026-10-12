import { ObjectNotFoundError, type ObjectStore, lockKey } from '../storage/store'

export type Lease = { release: () => Promise<void> }

type Store = Pick<ObjectStore, 'create' | 'getVersioned' | 'delete'>

const isExpired = (body: string, now: number) => {
   try {
      const { expires_at: expiresAt } = JSON.parse(body) as { expires_at?: unknown }

      return typeof expiresAt !== 'string' || Date.parse(expiresAt) <= now
   } catch {
      // A lease nobody can read would block the account forever.
      return true
   }
}

// One task per account at a time, across workers. The lease is an object in the store that only one task can
// create. It carries an expiry so a crashed worker cannot block its account for ever; there is no heartbeat, so
// the ttl must be longer than the longest task.
export class AccountLock {
   public constructor(
      private readonly store: Store,
      private readonly ttlMs: number,
      private readonly now: () => number = Date.now
   ) {}

   // Resolves to the lease, or undefined when another task holds the account.
   public async acquire(accountId: string, taskId: string): Promise<Lease | undefined> {
      const key = lockKey(accountId)

      // The second round is the one after taking over an expired lease or after the holder just released.
      for (let round = 0; round < 2; round += 1) {
         const body = JSON.stringify({
            task_id: taskId,
            expires_at: new Date(this.now() + this.ttlMs).toISOString(),
         })
         const version = await this.store.create(key, body, 'application/json')

         if (version !== undefined) {
            return { release: () => this.store.delete(key, version) }
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

         if (!isExpired(current.body, this.now())) {
            return undefined
         }

         // Deletes exactly the expired version, so a lease taken in the meantime is left alone.
         await this.store.delete(key, current.version)
      }

      return undefined
   }
}
