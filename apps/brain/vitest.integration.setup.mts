import { randomUUID } from 'node:crypto'
import { inject } from 'vitest'

import { testDatabases } from './testDatabase'

// Before each integration test file: its own database, cloned from the migrated template, becomes DATABASE_URL.
const base = process.env.DATABASE_URL ?? ''
const databases = testDatabases(base, inject('testDatabaseRun'))
const name = `${databases.prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`
const admin = databases.admin()

// Two clones started at once can find the template busy for a moment.
for (let attempt = 1; ; attempt += 1) {
   try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${databases.template}"`)
      break
   } catch (error) {
      if (attempt >= 10) {
         throw error
      }

      await new Promise(resolve => setTimeout(resolve, 200 * attempt))
   }
}

await admin.$disconnect()

process.env.DATABASE_URL = databases.urlOf(name)
