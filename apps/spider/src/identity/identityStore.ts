import { ObjectNotFoundError, type ObjectStore, identityKey } from '../storage/store'
import { type DeviceIdentity, deviceIdentitySchema } from './deviceIdentity'

type Store = Pick<ObjectStore, 'get' | 'create' | 'put'>

// Where an account's device lives: one object per account in the bucket, so no worker holds any state of its own.
// Callers hold the account lease, so only creating needs a guard against a second worker.
export class IdentityStore {
   public constructor(
      private readonly store: Store,
      private readonly make: () => DeviceIdentity
   ) {}

   // The account's device. The first call creates it. A read that fails is never answered with a new device: the
   // run is retried instead.
   public async forAccount(accountId: string): Promise<DeviceIdentity> {
      const key = identityKey(accountId)
      const found = await this.read(key)

      if (found) {
         return found
      }

      const created = this.make()
      const version = await this.store.create(key, JSON.stringify(created), 'application/json')

      if (version !== undefined) {
         return created
      }

      const winner = await this.read(key)

      if (!winner) {
         throw new Error('The device identity disappeared while it was being created')
      }

      return winner
   }

   // Keeps the device and sets the language, timezone and country the proxy's exit gave.
   public async pin(
      accountId: string,
      device: DeviceIdentity,
      region: { locale: string; timezone: string; country: string }
   ): Promise<DeviceIdentity> {
      const pinned = deviceIdentitySchema.parse({
         ...device,
         ...region,
      })

      await this.store.put(identityKey(accountId), JSON.stringify(pinned), 'application/json')

      return pinned
   }

   private async read(key: string) {
      let body: string

      try {
         body = await this.store.get(key)
      } catch (error) {
         if (error instanceof ObjectNotFoundError) {
            return undefined
         }

         throw error
      }

      return deviceIdentitySchema.parse(JSON.parse(body))
   }
}
