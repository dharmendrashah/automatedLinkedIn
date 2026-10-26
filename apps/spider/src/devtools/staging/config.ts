import { parse } from 'dotenv'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { type RunCommand, runCommand } from './shell'

export const DEFAULT_BUCKET = 'automate-linkedin-511215-spider'
export const STAGING_FILE = '.devtools-staging.env'

const KEY_BYTES = 32
const GROUP_AND_OTHER = 0o077

export type StagingConfig = {
   databaseUrl: string
   encryptionKey: string
   bucket: string
}

const isPostgresUrl = (value: string) => {
   try {
      return ['postgres:', 'postgresql:'].includes(new URL(value).protocol)
   } catch {
      return false
   }
}

// The file holds the staging database password and key, so a problem names the key, never its value.
export const parseStagingConfig = (text: string): StagingConfig => {
   const env = parse(text)
   const databaseUrl = env.DATABASE_URL
   const encryptionKey = env.LINKEDIN_CRED_ENC_KEY

   if (!databaseUrl || !isPostgresUrl(databaseUrl)) {
      throw new Error(`${STAGING_FILE} needs DATABASE_URL, the PostgreSQL address of the staging database.`)
   }

   if (!encryptionKey || Buffer.from(encryptionKey, 'base64').length !== KEY_BYTES) {
      throw new Error(`${STAGING_FILE} needs LINKEDIN_CRED_ENC_KEY, the staging key (32 bytes, base64).`)
   }

   return {
      databaseUrl,
      encryptionKey,
      bucket: env.SPIDER_GCS_BUCKET || DEFAULT_BUCKET,
   }
}

// Reads the staging file, and refuses one that other users can read or that git would commit.
export const loadStagingConfig = async (
   path = join(process.cwd(), STAGING_FILE),
   run: RunCommand = runCommand
): Promise<StagingConfig> => {
   let text: string
   let mode: number

   try {
      text = readFileSync(path, 'utf8')
      ;({ mode } = statSync(path))
   } catch {
      throw new Error(
         `Could not read ${path}. Create ${STAGING_FILE} there with DATABASE_URL, LINKEDIN_CRED_ENC_KEY and optionally SPIDER_GCS_BUCKET of staging.`
      )
   }

   if (mode & GROUP_AND_OTHER) {
      throw new Error(`${path} can be read by other users. Run: chmod 600 ${path}`)
   }

   if ((await run('git', ['check-ignore', '-q', path])).code !== 0) {
      throw new Error(`git does not ignore ${path}, so it could be committed. Add it to .gitignore first.`)
   }

   return parseStagingConfig(text)
}
