import { GIT_SHA } from 'env'

import { type GenerateOptions } from '@automatedLinkedIn/trpc-openapi'

import { resolverComments } from 'trpc/resolverComments'

// Shared by the build-time generator (generateOpenApi.ts) and the runtime fallback in openApiDocs.ts, so the two
// can never disagree on what the document looks like.

// The one route outside the tRPC router, the workflow-trigger REST endpoint, merged in by hand; a new non-tRPC
// REST route belongs here too.
const WORKFLOW_RUN_PATH = {
   post: {
      operationId: 'workflows.run',
      tags: ['workflows'],
      summary: 'Starts a workflow switched on to run by API, using its own token.',
      security: [{ workflowToken: [] }],
      parameters: [
         {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
         },
         {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            description: 'A repeated call with the same key within 24 hours answers with the run it already started.',
            schema: { type: 'string' },
         },
      ],
      requestBody: {
         required: false,
         content: {
            'application/json': {
               schema: {
                  type: 'object',
                  additionalProperties: true,
               },
            },
         },
      },
      responses: {
         '202': { description: 'The run was started (or, with a repeated Idempotency-Key, already running).' },
         '401': { description: "Missing or invalid Authorization header (that workflow's own token)." },
         '409': { description: 'The workflow is switched off or not started by API.' },
         '429': { description: 'Too many calls this hour.' },
      },
   },
}

export const openApiOptions = (): GenerateOptions => {
   const { operations, modules } = resolverComments()

   return {
      title: 'automatedLinkedIn API',
      version: GIT_SHA,
      basePath: '/trpc',
      extraPaths: { '/api/workflows/{id}/run': WORKFLOW_RUN_PATH },
      operationSummaries: operations,
      moduleDescriptions: modules,
   }
}
