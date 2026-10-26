import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BUCKET, loadStagingConfig, parseStagingConfig } from './config'
import { type RunCommand } from './shell'

const KEY = Buffer.alloc(32, 7).toString('base64')
const URL = 'postgresql://app:pw@203.0.113.9:5432/automatelinkedin'

describe('parseStagingConfig', () => {
   it('reads the database, the key and the default bucket', () => {
      expect(parseStagingConfig(`DATABASE_URL=${URL}\nLINKEDIN_CRED_ENC_KEY=${KEY}\n`)).toEqual({
         databaseUrl: URL,
         encryptionKey: KEY,
         bucket: DEFAULT_BUCKET,
      })
   })

   it('takes the bucket the file names', () => {
      const text = `DATABASE_URL=${URL}\nLINKEDIN_CRED_ENC_KEY=${KEY}\nSPIDER_GCS_BUCKET=other-bucket\n`

      expect(parseStagingConfig(text).bucket).toBe('other-bucket')
   })

   it('names the key that is missing without printing any value', () => {
      expect(() => parseStagingConfig(`LINKEDIN_CRED_ENC_KEY=${KEY}`)).toThrow(/DATABASE_URL/)
      expect(() => parseStagingConfig(`DATABASE_URL=${URL}`)).toThrow(/LINKEDIN_CRED_ENC_KEY/)
   })

   it('refuses a database address that is not PostgreSQL', () => {
      expect(() => parseStagingConfig(`DATABASE_URL=http://example.com\nLINKEDIN_CRED_ENC_KEY=${KEY}`)).toThrow(
         /DATABASE_URL/
      )
   })

   it('refuses a key that is not 32 bytes of base64', () => {
      expect(() => parseStagingConfig(`DATABASE_URL=${URL}\nLINKEDIN_CRED_ENC_KEY=c2hvcnQ=`)).toThrow(
         /LINKEDIN_CRED_ENC_KEY/
      )
   })
})

describe('loadStagingConfig', () => {
   let dir: string
   let path: string

   const ignored: RunCommand = async () => ({
      code: 0,
      stdout: '',
      stderr: '',
   })
   const notIgnored: RunCommand = async () => ({
      code: 1,
      stdout: '',
      stderr: '',
   })

   beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'staging-config-'))
      path = join(dir, '.devtools-staging.env')
      writeFileSync(path, `DATABASE_URL=${URL}\nLINKEDIN_CRED_ENC_KEY=${KEY}\n`)
      chmodSync(path, 0o600)
   })

   afterEach(() =>
      rmSync(dir, {
         recursive: true,
         force: true,
      })
   )

   it('loads a private, git-ignored file', async () => {
      expect((await loadStagingConfig(path, ignored)).bucket).toBe(DEFAULT_BUCKET)
   })

   it('says where the file goes when it is missing', async () => {
      await expect(loadStagingConfig(join(dir, 'absent.env'), ignored)).rejects.toThrow(/\.devtools-staging\.env/)
   })

   it('refuses a file other users can read', async () => {
      chmodSync(path, 0o644)

      await expect(loadStagingConfig(path, ignored)).rejects.toThrow(/chmod 600/)
   })

   it('refuses a file git does not ignore', async () => {
      await expect(loadStagingConfig(path, notIgnored)).rejects.toThrow(/git/)
   })
})
