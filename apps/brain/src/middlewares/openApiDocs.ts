import { type Application } from 'express'
import { existsSync, readFileSync } from 'fs'

import { type RawRouter, generateOpenApiDocument } from '@automatedLinkedIn/trpc-openapi'

import { appRouter } from 'trpc/api/router'
import { openApiOptions } from 'trpc/openApiOptions'

// The brain API as OpenAPI 3.1, grouped by resolver folder, with no manual step for a new procedure
// (.plan/api-authentication-and-openapi-docs.md). generateOpenApi.ts writes it once at build time; this just reads
// that file, cached in memory for the life of the process. A dev checkout that has not run `pnpm build` yet (the
// file does not exist) falls back to building it live, from the same options, so `pnpm dev` still works.
const FILE_PATH = 'dist/openapi.json'

let cached: ReturnType<typeof generateOpenApiDocument> | null = null

const documentOf = () => {
   if (cached) {
      return cached
   }

   cached = existsSync(FILE_PATH)
      ? (JSON.parse(readFileSync(FILE_PATH, 'utf8')) as ReturnType<typeof generateOpenApiDocument>)
      : // appRouter is a real, narrower tRPC type than this package's own minimal, runtime-focused RawRouter; the
        // package is generic over any tRPC router, so this cast is the documented boundary between the two (see
        // generate.ts).
        generateOpenApiDocument(appRouter as unknown as RawRouter, openApiOptions())

   return cached
}

const DOCS_PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>automatedLinkedIn API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => window.SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' })
    </script>
  </body>
</html>`

export class OpenApiDocs {
   public static config(app: Application) {
      app.get('/api/openapi.json', (_, response) => response.json(documentOf()))

      app.get('/api/docs', (_, response) => response.type('html').send(DOCS_PAGE))
   }
}
