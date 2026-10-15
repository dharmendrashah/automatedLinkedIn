import { ObjectNotFoundError, type ObjectStore } from '../storage/store'

// The part of the bucket the device identity needs, kept in memory for one devtools session: repeated runs of an account
// look like one device, and nothing is left on disk or in the bucket.
export class MemoryStore implements Pick<ObjectStore, 'get' | 'create' | 'put'> {
   private readonly objects = new Map<string, string>()

   public async get(key: string) {
      const body = this.objects.get(key)

      if (body === undefined) {
         throw new ObjectNotFoundError(key)
      }

      return body
   }

   public async create(key: string, body: string) {
      if (this.objects.has(key)) {
         return undefined
      }

      this.objects.set(key, body)

      return '1'
   }

   public async put(key: string, body: string) {
      this.objects.set(key, body)
   }
}
