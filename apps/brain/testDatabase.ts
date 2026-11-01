import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'

import { PrismaClient } from './src/generated/prisma/client'

// Every integration test file gets its own database, cloned from one migrated template, so no file sees another's rows: the
// wallet row, queued reads, the people index marks and the jobs that claim work across all owners stay per file.

const SAFE_NAME = /^[a-z0-9_]+$/

const urlOf = (base: string, database: string) => {
   const url = new URL(base)

   url.pathname = `/${database}`

   return url.toString()
}

// The configured database's name starts every test database's name, so a run never touches another project's; `run` keeps two
// runs at once apart.
export const testDatabases = (base: string, run: string) => {
   const name = new URL(base).pathname.slice(1).toLowerCase()

   if (!SAFE_NAME.test(name) || !SAFE_NAME.test(run)) {
      throw new Error('DATABASE_URL must name a database of letters, digits and underscores for integration tests.')
   }

   const prefix = `${name}_it_${run}`

   return {
      prefix,
      template: `${prefix}_template`,
      urlOf: (database: string) => urlOf(base, database),
      // The server's maintenance database, so creating or dropping a test database never holds a connection to it.
      admin: () => new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(base, 'postgres') }) }),
   }
}

export const dropTestDatabases = async (client: PrismaClient, prefix: string) => {
   const rows = await client.$queryRaw<Array<{ datname: string }>>`
      SELECT datname FROM pg_database WHERE datname LIKE ${`${prefix}\\_%`}`

   for (const { datname } of rows) {
      if (SAFE_NAME.test(datname)) {
         await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`)
      }
   }
}

// A run is named by the second it started; one older than this was killed before its teardown, and its databases go.
const STALE_S = 60 * 60

export const newRun = () => `${Math.floor(Date.now() / 1000)}_${randomUUID().slice(0, 4)}`

export const dropStaleRuns = async (client: PrismaClient, base: string) => {
   const name = new URL(base).pathname.slice(1).toLowerCase()
   const rows = await client.$queryRaw<Array<{ datname: string }>>`
      SELECT datname FROM pg_database WHERE datname LIKE ${`${name}\\_it\\_%`}`
   const now = Math.floor(Date.now() / 1000)

   for (const { datname } of rows) {
      const started = Number(new RegExp(`^${name}_it_(\\d+)_`).exec(datname)?.[1])

      if (SAFE_NAME.test(datname) && started > 0 && now - started > STALE_S) {
         await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`)
      }
   }
}
