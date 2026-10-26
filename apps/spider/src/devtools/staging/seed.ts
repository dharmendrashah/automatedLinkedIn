import { createReadStream, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'

import { BucketProfiles, type Profiles } from '../../sessions/profiles'
import { LocalStore } from '../localStore'
import { type RunSeed } from '../runEnvironment'

// The profile is unpacked fresh for each run and never packed again, so what the account had on staging is what every
// run starts from. After a run that changed the session (a sign-in), the next run takes that session instead, as it would
// from a profile that was kept.
export const readOnlyProfiles = (inner: Profiles): Profiles => {
   let refreshed = false

   return {
      checkout: async accountId => {
         const checkout = await inner.checkout(accountId)

         return {
            ...checkout,
            restored: checkout.restored && !refreshed,
            keep: async () => {
               refreshed = true
            },
         }
      },
   }
}

const discard = () => new Writable({ write: (_chunk, _encoding, done) => done() })

// The pulled files hold a live session, so they go when the tool ends, whichever way it ends (unless asked to keep them).
export const removePulled = (root: string, keep: boolean) => {
   if (!keep) {
      rmSync(root, {
         recursive: true,
         force: true,
      })
   }
}

export const removeOnExit = (root: string, keep: boolean) => {
   process.once('exit', () => removePulled(root, keep))
}

// Where the run finds the pulled device, session and profile: the files under `root`, which hold the bucket's keys. What
// the run changes (a pinned device, a refreshed session) goes to those local files only.
export const createSeed = ({ root, encryptionKey }: { root: string; encryptionKey: string }): RunSeed => {
   const files = new LocalStore(root)
   const work = join(root, 'work')

   mkdirSync(work, { recursive: true })

   const profiles = new BucketProfiles(
      {
         readStream: key => createReadStream(join(root, key)),
         writeStream: discard,
      },
      encryptionKey,
      { root: work }
   )

   return {
      identities: files,
      sessions: files,
      profiles: readOnlyProfiles(profiles),
      uploadsRoot: join(root, 'uploads'),
   }
}
