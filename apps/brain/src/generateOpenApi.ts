import { writeFileSync } from 'fs'

import 'dotenv/config'

import './aliases'

import { log } from 'core/log'

import { type RawRouter, generateOpenApiDocument } from '@automatedLinkedIn/trpc-openapi'

import { appRouter } from 'trpc/api/router'
import { openApiOptions } from 'trpc/openApiOptions'

// Run at build time (apps/brain's own `build` script, after `tsc -b`), not on every server start: the spec never
// changes between requests, so there is nothing to gain from building it again every time the process boots, and a
// generator bug is caught by the build instead of the first real request (.plan/api-authentication-and-openapi-
// docs.md). Writes next to the compiled output, so it ships with `dist` into every later Docker stage with no
// separate COPY line. openApiDocs.ts reads this file at runtime and only falls back to generating it live when it
// is missing (a dev checkout that has not run `pnpm build` yet).
const OUTPUT_PATH = 'dist/openapi.json'

const document = generateOpenApiDocument(appRouter as unknown as RawRouter, openApiOptions())

writeFileSync(OUTPUT_PATH, JSON.stringify(document, null, 2))

log.info(`Wrote ${OUTPUT_PATH}`, { paths: Object.keys(document.paths).length })
