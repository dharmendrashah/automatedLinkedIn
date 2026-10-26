import { Client } from 'pg'

import { selectAccounts, selectProxies } from '../localDb'
import { type StagingAccount, buildAccounts } from './accounts'
import { type StagingConfig } from './config'

export type StagingRun = {
   id: string
   task: string
   status: string
   verdict: string | undefined
   startedAt: Date
   // The bucket key of the run's timeline.
   timelineKey: string
}

const RUNS_SHOWN = 15

const unreadable = (cause: unknown) =>
   new Error(`Could not read the staging database: ${cause instanceof Error ? cause.message : 'unknown'}`, { cause })

// Encrypted when the server offers it. Staging's database does not offer TLS today (a recorded risk), so a refusal is
// answered with a plain connection and a warning, never silently.
const connect = async (databaseUrl: string, warn: (message: string) => void) => {
   const secure = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
   })

   try {
      await secure.connect()

      return secure
   } catch (error) {
      await secure.end().catch(() => undefined)

      if (!/does not support SSL/i.test(error instanceof Error ? error.message : '')) {
         throw unreadable(error)
      }
   }

   warn('The staging database does not offer TLS, so this connection is not encrypted.')

   const plain = new Client({
      connectionString: databaseUrl,
      ssl: false,
   })

   await plain.connect().catch((error: unknown) => {
      throw unreadable(error)
   })

   return plain
}

// Everything here runs in one read-only transaction, so nothing can change on staging.
const readOnly = async <T>(
   config: StagingConfig,
   warn: (message: string) => void,
   run: (client: Client) => Promise<T>
) => {
   const client = await connect(config.databaseUrl, warn)

   try {
      await client.query('begin read only')

      return await run(client)
   } finally {
      await client.query('rollback').catch(() => undefined)
      await client.end().catch(() => undefined)
   }
}

export const readStagingAccounts = (
   config: StagingConfig,
   warn: (message: string) => void
): Promise<StagingAccount[]> =>
   readOnly(config, warn, async client => {
      const accounts = await selectAccounts(client)
      const proxies = await selectProxies(client)
      const activity = await client.query<{ id: string; last: Date }>(
         `select "linkedInAccountId" as id, max(greatest("startedAt", coalesce("finishedAt", "startedAt"))) as last
            from "SpiderSession"
           group by "linkedInAccountId"`
      )

      return buildAccounts(accounts, proxies, new Map(activity.rows.map(row => [row.id, row.last])))
   })

// The account's latest runs that kept a timeline, newest first.
export const readStagingRuns = (config: StagingConfig, accountId: string, warn: (message: string) => void) =>
   readOnly(config, warn, async client => {
      const result = await client.query<{
         id: string
         task: string | null
         status: string
         verdict: string | null
         startedAt: Date
         path: string
      }>(
         `select s.id, s.task, s.status, s.verdict, s."startedAt", a.path
            from "SpiderSession" s
            join "SpiderSessionArtifact" a on a."sessionId" = s.id and a.kind = 'timeline'
           where s."linkedInAccountId" = $1
           order by s."startedAt" desc
           limit ${RUNS_SHOWN}`,
         [accountId]
      )

      return result.rows.map((row): StagingRun => ({
         id: row.id,
         task: row.task ?? 'unknown task',
         status: row.status,
         verdict: row.verdict ?? undefined,
         startedAt: row.startedAt,
         timelineKey: row.path,
      }))
   })

export type StagingPost = {
   state: string
   blocks: unknown
   audience: string
   comments: string
}

// The post a run made, found by the run's session id; nothing when the run was not a post sent from the app.
export const readStagingPost = (config: StagingConfig, sessionId: string, warn: (message: string) => void) =>
   readOnly(config, warn, async client => {
      const result = await client.query<StagingPost>(
         `select state, blocks, audience, comments
            from "PostPublication"
           where "sessionId" = $1`,
         [sessionId]
      )

      return result.rows[0]
   })
