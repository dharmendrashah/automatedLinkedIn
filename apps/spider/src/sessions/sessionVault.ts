import { z } from 'zod'

import { sealedSchema } from '@automatedLinkedIn/contracts'

import { type StorageState } from '../scraping/driver'
import { ObjectNotFoundError, type ObjectStore, sessionVaultKey } from '../storage/store'
import { decryptSealed, sealText } from '../tasks/credentials'

// What Playwright's storageState() returns, with every field it needs to put the state back into a new browser.
const savedStateSchema = z.object({
   cookies: z.array(
      z.object({
         name: z.string(),
         value: z.string(),
         domain: z.string(),
         path: z.string(),
         expires: z.number(),
         httpOnly: z.boolean(),
         secure: z.boolean(),
         sameSite: z.enum(['Strict', 'Lax', 'None']),
      })
   ),
   origins: z.array(
      z.object({
         origin: z.string(),
         localStorage: z.array(
            z.object({
               name: z.string(),
               value: z.string(),
            })
         ),
      })
   ),
})

export type SavedState = z.infer<typeof savedStateSchema>

// A login session is a few hundred cookies at most; more is a page storing junk, not something to keep.
const MAX_BYTES = 1_000_000

type Store = Pick<ObjectStore, 'get' | 'put'>

// An account's browser session (cookies and local storage) between runs, sealed with the credentials key: the bucket's
// own encryption does not keep a login token from anyone who can read the bucket.
export class SessionVault {
   public constructor(
      private readonly store: Store,
      private readonly keyBase64: string
   ) {}

   // Nothing when there is no saved session or it cannot be opened (another key, a changed file): the run then signs in
   // from the credentials. A bucket that cannot be read is an error, so the run is retried instead of starting cold.
   public async load(accountId: string): Promise<SavedState | undefined> {
      let body: string

      try {
         body = await this.store.get(sessionVaultKey(accountId))
      } catch (error) {
         if (error instanceof ObjectNotFoundError) {
            return undefined
         }

         throw error
      }

      try {
         const sealed = sealedSchema.parse(JSON.parse(body))
         const parsed = savedStateSchema.safeParse(JSON.parse(decryptSealed(sealed, this.keyBase64)))

         return parsed.success ? parsed.data : undefined
      } catch {
         return undefined
      }
   }

   public async save(accountId: string, state: StorageState): Promise<void> {
      const text = JSON.stringify(state)

      if (Buffer.byteLength(text) > MAX_BYTES) {
         throw new Error('The browser session is too large to keep')
      }

      await this.store.put(
         sessionVaultKey(accountId),
         JSON.stringify(sealText(text, this.keyBase64)),
         'application/json'
      )
   }
}
