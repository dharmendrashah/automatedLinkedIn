import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { gcloudProblem, pullAccountFiles, pullPostFiles, readLease } from './pull'
import { type CommandResult, type RunCommand } from './shell'

const ok: CommandResult = {
   code: 0,
   stdout: '',
   stderr: '',
}
const notFound: CommandResult = {
   code: 1,
   stdout: '',
   stderr: 'ERROR: No URLs matched: gs://bucket/profiles/a1/profile.tar.gz.enc',
}

describe('gcloudProblem', () => {
   it('says what to do when gcloud is missing or logged out', () => {
      expect(gcloudProblem('gcloud is not installed')).toMatch(/Install the Google Cloud CLI/)
      expect(gcloudProblem('ERROR: Reauthentication failed. Please run: gcloud auth login')).toMatch(
         /gcloud auth login/
      )
   })

   it('keeps only the first line of any other error', () => {
      expect(gcloudProblem('403 forbidden\nstack line 2')).toBe('gcloud failed: 403 forbidden')
   })
})

describe('pullAccountFiles', () => {
   let root: string

   beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'pull-test-'))
   })

   afterEach(() =>
      rm(root, {
         recursive: true,
         force: true,
      })
   )

   it('copies the device, the session and the profile to the bucket keys under the root', async () => {
      const calls: string[][] = []
      const run: RunCommand = async (_command, args) => {
         calls.push(args)

         return ok
      }

      const pulled = await pullAccountFiles({
         bucket: 'bucket',
         accountId: 'a1',
         root,
         run,
      })

      expect(pulled).toEqual({ session: true })
      expect(calls).toEqual([
         ['storage', 'cp', 'gs://bucket/identities/a1/identity.json', join(root, 'identities/a1/identity.json')],
         ['storage', 'cp', 'gs://bucket/sessions/a1/state.enc.json', join(root, 'sessions/a1/state.enc.json')],
         ['storage', 'cp', 'gs://bucket/profiles/a1/profile.tar.gz.enc', join(root, 'profiles/a1/profile.tar.gz.enc')],
      ])
   })

   it('stops and names the piece when the device or the profile is not on staging', async () => {
      const run: RunCommand = async (_command, args) => (args.some(arg => arg.includes('profiles/')) ? notFound : ok)

      await expect(
         pullAccountFiles({
            bucket: 'bucket',
            accountId: 'a1',
            root,
            run,
         })
      ).rejects.toThrow(/browser profile/)
   })

   it('goes on without a session, which the profile already carries', async () => {
      const run: RunCommand = async (_command, args) => (args.some(arg => arg.includes('sessions/')) ? notFound : ok)

      expect(
         await pullAccountFiles({
            bucket: 'bucket',
            accountId: 'a1',
            root,
            run,
         })
      ).toEqual({ session: false })
   })

   it('reports a gcloud failure that is not a missing file', async () => {
      const run: RunCommand = async () => ({
         code: 1,
         stdout: '',
         stderr: 'ERROR: Reauthentication failed. gcloud auth login',
      })

      await expect(
         pullAccountFiles({
            bucket: 'bucket',
            accountId: 'a1',
            root,
            run,
         })
      ).rejects.toThrow(/gcloud auth login/)
   })
})

describe('readLease', () => {
   it('returns the lease body, or nothing when there is no lease', async () => {
      const noObject: CommandResult = {
         code: 1,
         stdout: '',
         stderr:
            'ERROR: (gcloud.storage.cat) The following URLs matched no objects or files:\n-gs://bucket/locks/a1.json',
      }

      expect(
         await readLease({
            bucket: 'bucket',
            accountId: 'a1',
            run: async () => ({
               ...ok,
               stdout: '{"a":1}',
            }),
         })
      ).toBe('{"a":1}')
      expect(
         await readLease({
            bucket: 'bucket',
            accountId: 'a1',
            run: async () => notFound,
         })
      ).toBeUndefined()
      expect(
         await readLease({
            bucket: 'bucket',
            accountId: 'a1',
            run: async () => noObject,
         })
      ).toBeUndefined()
   })

   it('fails when the bucket cannot be read at all, so a lease is never assumed free', async () => {
      const run: RunCommand = async () => ({
         code: 1,
         stdout: '',
         stderr: '403 forbidden',
      })

      await expect(
         readLease({
            bucket: 'bucket',
            accountId: 'a1',
            run,
         })
      ).rejects.toThrow(/forbidden/)
   })
})

describe('pullPostFiles', () => {
   const files = [
      {
         id: 'f1',
         name: 'a b.jpg',
         key: 'posts/u1/f1/a b.jpg',
      },
   ]
   const root = join(tmpdir(), 'pull-post-files-test')

   afterEach(() =>
      rm(root, {
         recursive: true,
         force: true,
      })
   )

   it('copies each file to uploads/<id>/<name>', async () => {
      const calls: string[][] = []
      const run: RunCommand = async (_command, args) => {
         calls.push(args)

         return ok
      }

      await pullPostFiles({
         bucket: 'bucket',
         root,
         files,
         run,
      })

      expect(calls).toEqual([['storage', 'cp', 'gs://bucket/posts/u1/f1/a b.jpg', join(root, 'uploads/f1/a b.jpg')]])
   })

   it('says a file is gone when the bucket no longer has it', async () => {
      await expect(
         pullPostFiles({
            bucket: 'bucket',
            root,
            files,
            run: async () => notFound,
         })
      ).rejects.toThrow(/no longer in the bucket/)
   })
})
