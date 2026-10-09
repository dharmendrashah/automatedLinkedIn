import 'dotenv/config'

import './aliases'

import { HttpServer } from 'core'

import { PrismaService } from 'database'

import { Middlewares } from 'middlewares'

const { app } = HttpServer.create()

Middlewares.config(app)

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.once(signal, () => PrismaService.disconnect().finally(() => process.exit(0)))
}
