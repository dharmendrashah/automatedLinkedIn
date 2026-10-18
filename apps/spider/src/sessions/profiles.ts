import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Readable, Transform, type Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { ObjectNotFoundError, profileKey } from '../storage/store'
import { sealStream, unsealStream } from './sealStream'

// An account's browser profile for one run: the folder the browser uses, whether it came back from an earlier run, and
// what to do with it afterwards (.plan/account-browser-profile.md).
export type ProfileCheckout = {
   dir: string
   restored: boolean
   // Keeps the folder for the next run. Called only after a run that passed its own check, with the browser closed.
   keep: () => Promise<void>
   // Called after every run.
   release: () => Promise<void>
}

export interface Profiles {
   checkout: (accountId: string) => Promise<ProfileCheckout>
}

export type StreamStore = {
   readStream: (key: string) => Readable
   writeStream: (key: string, contentType: string) => Writable
}

const MAX_PACKED_BYTES = 1024 ** 3
// Firefox's own locks and crash reports, never part of a profile to carry over.
const LEFT_OUT = ['./lock', './.parentlock', './parent.lock', './crashes', './minidumps']
// The HTTP cache: kept while the profile fits, left out first when it does not.
const CACHE = './cache2'

class ProfileTooLargeError extends Error {}

const isNotFound = (error: unknown) =>
   error instanceof ObjectNotFoundError || (error as { code?: number } | null)?.code === 404

// Resolves when tar ends well, and rejects with its exit code otherwise.
const finished = (tar: ReturnType<typeof spawn>) =>
   new Promise<void>((resolve, reject) => {
      tar.once('error', reject)
      tar.once('close', code => (code === 0 ? resolve() : reject(new Error(`tar ended with code ${code}`))))
   })

const atMost = (maxBytes: number) => {
   let bytes = 0

   return new Transform({
      transform(chunk: Buffer, _encoding, done) {
         bytes += chunk.length
         done(bytes > maxBytes ? new ProfileTooLargeError() : null, chunk)
      },
   })
}

// The worker's profiles: kept sealed in the bucket, unpacked into a temporary folder for one run.
export class BucketProfiles implements Profiles {
   public constructor(
      private readonly store: StreamStore,
      private readonly keyBase64: string,
      private readonly options: { root?: string; maxBytes?: number; warn?: (message: string) => void } = {}
   ) {}

   public async checkout(accountId: string): Promise<ProfileCheckout> {
      const dir = await mkdtemp(join(this.options.root ?? tmpdir(), 'profile-'))
      const restored = await this.unpack(accountId, dir)

      return {
         dir,
         restored,
         keep: () => this.keep(accountId, dir),
         release: () =>
            rm(dir, {
               recursive: true,
               force: true,
            }),
      }
   }

   // A profile that is missing, changed or cannot be unpacked is started afresh: the run then begins from the saved
   // session instead, and a bad profile is never kept over.
   private async unpack(accountId: string, dir: string) {
      const tar = spawn('tar', ['-xzf', '-', '-C', dir], { stdio: ['pipe', 'ignore', 'ignore'] })

      try {
         await Promise.all([
            pipeline(this.store.readStream(profileKey(accountId)), unsealStream(this.keyBase64), tar.stdin),
            finished(tar),
         ])

         return true
      } catch (error) {
         tar.kill()

         if (!isNotFound(error)) {
            this.warn('The saved browser profile could not be opened; this run starts a new one')
         }

         await rm(dir, {
            recursive: true,
            force: true,
         })
         await mkdir(dir, { recursive: true })

         return false
      }
   }

   private async keep(accountId: string, dir: string) {
      for (const leftOut of [LEFT_OUT, [...LEFT_OUT, CACHE]]) {
         try {
            await this.pack(accountId, dir, leftOut)

            return
         } catch (error) {
            if (!(error instanceof ProfileTooLargeError)) {
               throw error
            }
         }
      }

      this.warn('The browser profile is too large to keep, even without its cache')
   }

   private async pack(accountId: string, dir: string, leftOut: string[]) {
      const args = ['-czf', '-', '-C', dir, ...leftOut.map(path => `--exclude=${path}`), '.']
      const tar = spawn('tar', args, { stdio: ['ignore', 'pipe', 'ignore'] })

      try {
         await Promise.all([
            pipeline(
               tar.stdout,
               atMost(this.options.maxBytes ?? MAX_PACKED_BYTES),
               sealStream(this.keyBase64),
               this.store.writeStream(profileKey(accountId), 'application/octet-stream')
            ),
            finished(tar),
         ])
      } catch (error) {
         tar.kill()

         throw error
      }
   }

   private warn(message: string) {
      const warn = this.options.warn ?? console.warn

      warn(message)
   }
}

// The local tool's profiles: one folder per account on this computer, used in place, never uploaded.
export class DiskProfiles implements Profiles {
   public constructor(private readonly root: string) {}

   public async checkout(accountId: string): Promise<ProfileCheckout> {
      const dir = join(this.root, accountId)

      await mkdir(dir, { recursive: true })

      return {
         dir,
         restored: (await readdir(dir)).length > 0,
         keep: async () => undefined,
         release: async () => undefined,
      }
   }
}
