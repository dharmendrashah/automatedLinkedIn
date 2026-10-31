import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { RecordingLinks } from 'core'

import {
   LinkedInAccountPausedError,
   LinkedInAccountValidationService,
   LinkedInVerifyCooldownError,
   ProxyServerService,
   SESSION_HAS,
   SESSION_RESULTS,
   SESSION_RETRIES,
   SESSION_TOOK,
   SESSION_TRIGGERS,
   SessionRetryError,
   SpiderRecordingUnavailableError,
   SpiderSensitiveFileError,
   SpiderSessionNotFoundError,
   SpiderSessionService,
   retryRefusal,
} from 'database'

import { ownerProcedure, router } from 'trpc'

const byId = z.object({ id: z.string().min(1).max(100) })
const ids = z.array(z.string().min(1).max(100)).max(100).optional()
const words = z.array(z.string().min(1).max(120)).max(100).optional()

const filtersInput = z.object({
   search: z.string().trim().max(200).optional(),
   accountIds: ids,
   results: z.array(z.enum(SESSION_RESULTS)).max(SESSION_RESULTS.length).optional(),
   tasks: words,
   verdicts: words,
   triggers: z.array(z.enum(SESSION_TRIGGERS)).max(SESSION_TRIGGERS.length).optional(),
   startedFrom: z.coerce.date().optional(),
   startedTo: z.coerce.date().optional(),
   took: z.array(z.enum(SESSION_TOOK)).max(SESSION_TOOK.length).optional(),
   proxyIds: ids,
   proxyCountries: words,
   has: z.array(z.enum(SESSION_HAS)).max(SESSION_HAS.length).optional(),
   retries: z.enum(SESSION_RETRIES).optional(),
})

const listInput = filtersInput.extend({
   sort: z
      .object({
         by: z.enum(['startedAt', 'durationMs']),
         desc: z.boolean(),
      })
      .optional(),
   cursor: z.number().int().min(0).max(100_000).optional(),
})

const changesInput = filtersInput.extend({
   since: z.coerce.date(),
   watch: z.array(z.string().min(1).max(100)).max(100),
})

// An older session names its file; a task session names the id of one of its files, so no path or name comes from the browser.
const fileInput = byId
   .extend({
      file: z.string().max(100).optional(),
      artifactId: z.string().min(1).max(100).optional(),
      // Needed for a file that holds login tokens.
      reveal: z.boolean().optional(),
   })
   .refine(
      ({ file, artifactId }) => (file === undefined) !== (artifactId === undefined),
      'Name either a file or an artifact id'
   )

const retryInput = byId.extend({ proxyId: z.string().min(1).max(100) })

// What is safe to say to the browser. Anything unexpected is logged here and reported without its details.
const asTrpcError = (error: unknown) => {
   if (error instanceof SpiderSessionNotFoundError) {
      return new TRPCError({
         code: 'NOT_FOUND',
         message: error.message,
      })
   }

   if (error instanceof SessionRetryError) {
      return new TRPCError({
         code: error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'PRECONDITION_FAILED',
         message: error.message,
      })
   }

   if (
      error instanceof SpiderRecordingUnavailableError ||
      error instanceof SpiderSensitiveFileError ||
      error instanceof LinkedInAccountPausedError
   ) {
      return new TRPCError({
         code: 'PRECONDITION_FAILED',
         message: error.message,
      })
   }

   if (error instanceof LinkedInVerifyCooldownError) {
      return new TRPCError({
         code: 'TOO_MANY_REQUESTS',
         message: error.message,
      })
   }

   console.error(`Sessions: ${(error as Error).message}`)

   return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Try again in a moment.',
   })
}

// Every procedure is scoped to ctx.user.id, so one user can never see, play or retry another user's session by id.
export const session = router({
   list: ownerProcedure.input(listInput).query(async ({ ctx, input }) => {
      try {
         return await SpiderSessionService.listForUser(ctx.user.id, input)
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   // New runs and finished ones for an open Sessions page, every few seconds (.plan/sessions-page.md).
   changes: ownerProcedure.input(changesInput).query(async ({ ctx, input }) => {
      const { since, watch, ...filters } = input

      try {
         return await SpiderSessionService.changes(ctx.user.id, filters, since, watch)
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   // How many sessions each value of a filter would show, for the Filters drawer.
   facets: ownerProcedure.input(filtersInput).query(async ({ ctx, input }) => {
      try {
         return await SpiderSessionService.facets(ctx.user.id, input)
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   get: ownerProcedure.input(byId).query(async ({ ctx, input }) => {
      try {
         const found = await SpiderSessionService.getForUser(ctx.user.id, input.id)
         const reason = retryRefusal(found)
         const proxies = await ProxyServerService.listUsableForAccount(ctx.user.id, found.linkedInAccount.id)

         return {
            ...found,
            retry: {
               allowed: !reason,
               reason,
            },
            // Only what the dialog shows: no credentials.
            retryProxies: proxies.map(
               ({ id, protocol, host, port, status, latencyMs, detectedCountry, isPrimary }) => ({
                  id,
                  protocol,
                  host,
                  port,
                  status,
                  latencyMs,
                  detectedCountry,
                  isPrimary,
               })
            ),
            recordingsConfigured: RecordingLinks.configured(),
         }
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   // A short-lived link to one file of the recording, to load straight from the bucket. Page text in these files
   // comes from LinkedIn or a proxy, so the page shows it as plain text.
   fileUrl: ownerProcedure.input(fileInput).query(async ({ ctx, input }) => {
      if (!RecordingLinks.configured()) {
         throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Recordings are not set up here.',
         })
      }

      try {
         const key = input.artifactId
            ? await SpiderSessionService.artifactKey(ctx.user.id, input.id, input.artifactId, input.reveal ?? false)
            : await SpiderSessionService.fileKey(ctx.user.id, input.id, input.file as string)

         return { url: await RecordingLinks.urlFor(key) }
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   // Starts the same check again. Only the proxy can change, and only to another of the account's own.
   retry: ownerProcedure.input(retryInput).mutation(async ({ ctx, input }) => {
      try {
         return await LinkedInAccountValidationService.retryForUser(ctx.user.id, input.id, input.proxyId)
      } catch (error) {
         throw asTrpcError(error)
      }
   }),
})
