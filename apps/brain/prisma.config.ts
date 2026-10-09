import { defineConfig } from 'prisma/config'

import 'dotenv/config'

export default defineConfig({
   schema: 'prisma/schema.prisma',
   migrations: { path: 'prisma/migrations' },
   // Not env(): `prisma generate` must work without a database URL.
   datasource: { url: process.env.DATABASE_URL ?? '' },
})
