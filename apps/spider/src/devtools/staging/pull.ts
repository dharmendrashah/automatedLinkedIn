import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { identityKey, lockKey, profileKey, sessionVaultKey } from '../../storage/store'
import { type CommandResult, type RunCommand, runCommand } from './shell'

const NOT_FOUND = /No URLs matched|matched no objects|NotFound|404|does not exist/i

// What to do about a gcloud failure, in one line; never the whole output, which can carry names and addresses.
export const gcloudProblem = (stderr: string) => {
   if (/not installed/i.test(stderr)) {
      return 'Install the Google Cloud CLI (gcloud) and log in with: gcloud auth login'
   }

   if (/reauth|login|credentials/i.test(stderr)) {
      return 'The Google login has expired or is missing. Run: gcloud auth login'
   }

   return `gcloud failed: ${stderr.split('\n')[0] ?? ''}`.trim()
}

const failure = (result: CommandResult) => new Error(gcloudProblem(result.stderr))

const uri = (bucket: string, key: string) => `gs://${bucket}/${key}`

type PullOptions = {
   bucket: string
   accountId: string
   // The folder that receives the files, under the same keys as in the bucket.
   root: string
   run?: RunCommand
}

// Copies what one account needs from the bucket, read only. The device and the profile are required: without them the
// browser would not be the one LinkedIn knows. The session is not, since the profile carries the login too.
export const pullAccountFiles = async ({ bucket, accountId, root, run = runCommand }: PullOptions) => {
   const pieces = [
      {
         name: 'device',
         key: identityKey(accountId),
         required: true,
      },
      {
         name: 'session',
         key: sessionVaultKey(accountId),
         required: false,
      },
      {
         name: 'browser profile',
         key: profileKey(accountId),
         required: true,
      },
   ]
   let session = true

   for (const { name, key, required } of pieces) {
      const target = join(root, key)

      await mkdir(dirname(target), { recursive: true })

      const result = await run('gcloud', ['storage', 'cp', uri(bucket, key), target])

      if (result.code === 0) {
         continue
      }

      if (!NOT_FOUND.test(result.stderr)) {
         throw failure(result)
      }

      if (required) {
         throw new Error(
            `Staging has no ${name} for this account yet, so there is nothing to recreate. Nothing was run.`
         )
      }

      session = false
   }

   return { session }
}

type LeaseOptions = {
   bucket: string
   accountId: string
   run?: RunCommand
}

// The lease body, or nothing when the worker holds none. A bucket that cannot be read is an error: a lease is never
// assumed free.
export const readLease = async ({ bucket, accountId, run = runCommand }: LeaseOptions) => {
   const result = await run('gcloud', ['storage', 'cat', uri(bucket, lockKey(accountId))])

   if (result.code === 0) {
      return result.stdout
   }

   if (NOT_FOUND.test(result.stderr)) {
      return undefined
   }

   throw failure(result)
}

// The run's timeline, for the replay.
export const readObject = async ({
   bucket,
   key,
   run = runCommand,
}: {
   bucket: string
   key: string
   run?: RunCommand
}) => {
   const result = await run('gcloud', ['storage', 'cat', uri(bucket, key)])

   if (result.code !== 0) {
      throw failure(result)
   }

   return result.stdout
}

type PostFilesOptions = {
   bucket: string
   root: string
   // Each file by the id and safe name the task is told, and where it is in the bucket.
   files: Array<{ id: string; name: string; key: string }>
   run?: RunCommand
}

// The files of a post, into `<root>/uploads/<file id>/<name>`, where the devtools run reads them from.
export const pullPostFiles = async ({ bucket, root, files, run = runCommand }: PostFilesOptions) => {
   for (const { id, name, key } of files) {
      const target = join(root, 'uploads', id, name)

      await mkdir(dirname(target), { recursive: true })

      const result = await run('gcloud', ['storage', 'cp', uri(bucket, key), target])

      if (result.code === 0) {
         continue
      }

      throw NOT_FOUND.test(result.stderr)
         ? new Error('A file of the post is no longer in the bucket (files are deleted once a post went).')
         : failure(result)
   }
}
