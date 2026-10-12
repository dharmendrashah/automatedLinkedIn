import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { LinkedInAccountValidationService, ProxyServerOwnershipError, ProxyServerService } from 'database'

import { ownerProcedure, router } from 'trpc'

const byId = z.object({ id: z.string().min(1) })

const protocol = z.enum(['HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5'])
const host = z.string().min(1).max(255)
const port = z.number().int().min(1).max(65535)
const secret = z.string().min(1).max(256)

const createInput = z.object({
   linkedInAccountId: z.string().min(1),
   protocol,
   host,
   port,
   username: secret.optional(),
   password: secret.optional(),
})

const updateInput = z.object({
   id: z.string().min(1),
   protocol: protocol.optional(),
   host: host.optional(),
   port: port.optional(),
   username: secret.nullish(),
   password: secret.nullish(),
})

const asTrpcError = (error: unknown) => {
   if (error instanceof ProxyServerOwnershipError) {
      return new TRPCError({
         code: 'NOT_FOUND',
         message: error.message,
      })
   }

   return error
}

const notFound = () =>
   new TRPCError({
      code: 'NOT_FOUND',
      message: 'Proxy not found',
   })

// An account added before its first proxy is waiting for one. The proxy is already saved, so a validation that cannot
// be queued must not fail the request: the owner can still verify the account by hand.
const validateWaitingAccount = async (proxy: { linkedInAccountId: string; status: string }) => {
   if (proxy.status !== 'ACTIVE' && proxy.status !== 'GEO_MISMATCH') {
      return
   }

   try {
      await LinkedInAccountValidationService.requestIfWaiting(proxy.linkedInAccountId)
   } catch (error) {
      console.error(
         `Could not request the validation of account ${proxy.linkedInAccountId}: ${(error as Error).message}`
      )
   }
}

// Every procedure scopes to ctx.user.id through the proxy's LinkedIn account, so one user can never reach
// another's proxies by id.
export const proxyServer = router({
   list: ownerProcedure.query(({ ctx }) => ProxyServerService.listForUser(ctx.user.id)),

   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      try {
         const proxy = await ProxyServerService.create(ctx.user.id, input)

         await validateWaitingAccount(proxy)

         return proxy
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      try {
         const proxy = await ProxyServerService.update(ctx.user.id, input.id, {
            protocol: input.protocol,
            host: input.host,
            port: input.port,
            username: input.username,
            password: input.password,
         })

         await validateWaitingAccount(proxy)

         return proxy
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   // Manual re-test: whatever the result is, it updates the stored status.
   test: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      try {
         const proxy = await ProxyServerService.test(ctx.user.id, input.id)

         await validateWaitingAccount(proxy)

         return proxy
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   // The last 7 days of tests of one proxy, newest first, without the request and response data.
   history: ownerProcedure.input(byId).query(async ({ ctx, input }) => {
      try {
         return await ProxyServerService.history(ctx.user.id, input.id)
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   // One test with everything that was sent and received. The bodies are untrusted: show them as plain text.
   historyEntry: ownerProcedure.input(byId).query(async ({ ctx, input }) => {
      try {
         return await ProxyServerService.historyEntry(ctx.user.id, input.id)
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   delete: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      const deleted = await ProxyServerService.remove(ctx.user.id, input.id)

      if (!deleted) {
         throw notFound()
      }

      return { deleted }
   }),
})
