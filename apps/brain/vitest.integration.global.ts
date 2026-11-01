import { config } from 'dotenv'
import { execFileSync } from 'node:child_process'
import { type TestProject } from 'vitest/node'

import { dropStaleRuns, dropTestDatabases, newRun, testDatabases } from './testDatabase'

declare module 'vitest' {
   export interface ProvidedContext {
      testDatabaseRun: string
   }
}

// Once per integration run: a fresh template database with every migration, and on teardown every test database of the run
// dropped.
export default async (project: TestProject) => {
   config({
      path: '.env.test',
      quiet: true,
   })

   const base = process.env.DATABASE_URL

   if (!base) {
      throw new Error('Integration tests need DATABASE_URL (apps/brain/.env.test or the environment).')
   }

   const run = newRun()
   const databases = testDatabases(base, run)
   const admin = databases.admin()

   project.provide('testDatabaseRun', run)
   await dropStaleRuns(admin, base)
   await admin.$executeRawUnsafe(`CREATE DATABASE "${databases.template}"`)
   await admin.$disconnect()

   execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: {
         ...process.env,
         DATABASE_URL: databases.urlOf(databases.template),
      },
      stdio: 'pipe',
   })

   return async () => {
      const cleaner = databases.admin()

      await dropTestDatabases(cleaner, databases.prefix)
      await cleaner.$disconnect()
   }
}
