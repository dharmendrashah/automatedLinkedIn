import { parse } from 'dotenv'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'

import { type Sealed } from '@automatedLinkedIn/contracts'

// The same insecure throwaway key brain's env.ts falls back to for local/test (LINKEDIN_CRED_ENC_KEY's devDefault),
// used only when apps/brain/.env does not set its own.
const DEV_FALLBACK_KEY = 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ='

export type SavedProxy = {
   id: string
   accountId: string
   accountEmail: string
   protocol: string
   host: string
   port: number
   status: string
   secret: Sealed
}

// Reads brain's own .env rather than asking the developer to copy it, since this tool only ever runs next to a
// checked-out apps/brain.
const readBrainEnv = (repoRoot: string): Record<string, string> => {
   const path = join(repoRoot, 'apps/brain/.env')

   try {
      return parse(readFileSync(path, 'utf8'))
   } catch {
      throw new Error(`Could not read ${path}. Copy apps/brain/.env.example to apps/brain/.env first.`)
   }
}

// Refuses anything but a local database: this tool decrypts proxy credentials outside of brain's own access
// controls, so it must never be pointed at a shared database.
const assertLocalHost = (databaseUrl: string) => {
   const host = new URL(databaseUrl).hostname

   if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(
         'This tool only runs against a local database (DATABASE_URL host must be localhost or 127.0.0.1).'
      )
   }
}

export type LocalDbConfig = {
   databaseUrl: string
   encryptionKey: string
}

// repoRoot defaults to the package script's own working directory (apps/spider, set by the dev:record script) two
// levels up; a test can pass its own fixture folder.
export const loadLocalDbConfig = (repoRoot = join(process.cwd(), '../..')): LocalDbConfig => {
   const env = readBrainEnv(repoRoot)
   const databaseUrl = env.DATABASE_URL

   if (!databaseUrl) {
      throw new Error('apps/brain/.env has no DATABASE_URL')
   }

   assertLocalHost(databaseUrl)

   return {
      databaseUrl,
      encryptionKey: env.LINKEDIN_CRED_ENC_KEY || DEV_FALLBACK_KEY,
   }
}

const withClient = async <T>(databaseUrl: string, run: (client: Client) => Promise<T>) => {
   const client = new Client({ connectionString: databaseUrl })

   await client.connect()

   try {
      return await run(client)
   } finally {
      await client.end()
   }
}

// Every saved proxy across every account, newest account first. Credentials stay sealed; only the devtools decrypt the
// one the developer picks.
export const selectProxies = async (client: Client): Promise<SavedProxy[]> => {
   const result = await client.query<{
      id: string
      protocol: string
      host: string
      port: number
      status: string
      secret: string
      secretIv: string
      secretTag: string
      keyVersion: number
      accountId: string
      email: string
   }>(
      `select ps.id, ps."linkedInAccountId" as "accountId", ps.protocol, ps.host, ps.port, ps.status, ps.secret, ps."secretIv", ps."secretTag",
                 ps."keyVersion", la.email
            from "ProxyServer" ps
            join "LinkedInAccount" la on la.id = ps."linkedInAccountId"
           order by la.email, ps."createdAt"`
   )

   return result.rows.map(row => ({
      id: row.id,
      accountId: row.accountId,
      accountEmail: row.email,
      protocol: row.protocol,
      host: row.host,
      port: row.port,
      status: row.status,
      secret: {
         ciphertext: row.secret,
         iv: row.secretIv,
         tag: row.secretTag,
         key_version: row.keyVersion,
      },
   }))
}

export const listSavedProxies = (databaseUrl: string) => withClient(databaseUrl, selectProxies)

export type SavedAccount = {
   id: string
   email: string
   status: string
   secret: Sealed
}

// Every LinkedIn account, with its credentials still sealed: they are opened by the same code the worker uses.
export const selectAccounts = async (client: Client): Promise<SavedAccount[]> => {
   const result = await client.query<{
      id: string
      email: string
      status: string
      secret: string
      secretIv: string
      secretTag: string
      keyVersion: number
   }>(
      `select id, email, status, secret, "secretIv", "secretTag", "keyVersion"
            from "LinkedInAccount"
           order by email`
   )

   return result.rows.map(row => ({
      id: row.id,
      email: row.email,
      status: row.status,
      secret: {
         ciphertext: row.secret,
         iv: row.secretIv,
         tag: row.secretTag,
         key_version: row.keyVersion,
      },
   }))
}

export const listSavedAccounts = (databaseUrl: string) => withClient(databaseUrl, selectAccounts)
