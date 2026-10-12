import { CryptoService, IpInfoError, IpInfoService, type ProxyExchange } from 'core'

import { type ProxyProtocol } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

export type ProxyCredentials = {
   username?: string
   password?: string
}

export type ProxyServerInput = {
   linkedInAccountId: string
   protocol: ProxyProtocol
   host: string
   port: number
} & ProxyCredentials

export class ProxyServerOwnershipError extends Error {
   public constructor() {
      super('That proxy does not belong to you, or the LinkedIn account it should link to does not.')
   }
}

// Fields safe to return over the API: the row without the sealed secret.
const metadataSelect = {
   id: true,
   linkedInAccountId: true,
   protocol: true,
   host: true,
   port: true,
   status: true,
   statusMessage: true,
   lastTestedAt: true,
   latencyMs: true,
   detectedCountryCode: true,
   detectedCountry: true,
   detectedIp: true,
   isPrimary: true,
   createdAt: true,
   updatedAt: true,
   linkedInAccount: {
      select: {
         id: true,
         email: true,
      },
   },
} as const

type SealedRow = {
   secret: string
   secretIv: string
   secretTag: string
}

const seal = (credentials: ProxyCredentials) => {
   const cleaned: ProxyCredentials = {
      ...(credentials.username ? { username: credentials.username } : {}),
      ...(credentials.password ? { password: credentials.password } : {}),
   }
   const sealed = CryptoService.seal(JSON.stringify(cleaned))

   return {
      secret: sealed.ciphertext,
      secretIv: sealed.iv,
      secretTag: sealed.tag,
      keyVersion: 1,
   }
}

const open = (row: SealedRow): ProxyCredentials =>
   JSON.parse(
      CryptoService.open({
         ciphertext: row.secret,
         iv: row.secretIv,
         tag: row.secretTag,
      })
   ) as ProxyCredentials

const scheme = (protocol: ProxyProtocol) => protocol.toLowerCase()

// The URL proxy-agent connects through: credentials embedded, as that library (and HTTP_PROXY convention)
// expects. Never logged.
const toConnectionUrl = (input: ProxyServerInput) => {
   const auth = input.username
      ? `${encodeURIComponent(input.username)}${input.password ? `:${encodeURIComponent(input.password)}` : ''}@`
      : ''

   return `${scheme(input.protocol)}://${auth}${input.host}:${input.port}`
}

// The shape spider expects (packages/contracts `proxySchema`): credentials as separate fields, matching
// Playwright's own `proxy` option.
export const toProxyConfig = (input: ProxyServerInput) => ({
   server: `${scheme(input.protocol)}://${input.host}:${input.port}`,
   ...(input.username ? { username: input.username } : {}),
   ...(input.password ? { password: input.password } : {}),
})

type TestOutcome =
   | {
        status: 'ACTIVE' | 'GEO_MISMATCH'
        statusMessage: string
        countryCode: string
        country: string
        ip: string
        latencyMs: number
        exchange: ProxyExchange
     }
   | { status: 'UNREACHABLE'; statusMessage: string; exchange: ProxyExchange }

// Used when a failure carries no recording of what was sent, so a test is still saved.
const NOT_RECORDED: ProxyExchange = {
   request: {
      method: 'GET',
      url: '',
      headers: {},
      body: null,
   },
   response: null,
   elapsedMs: 0,
}

const HISTORY_DAYS = 7
const historyCutoff = () => new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000)

// Keeps what was sent and what came back for HISTORY_DAYS. The ipinfo token is masked before it gets here and the
// proxy's own credentials are not part of the request. A history that cannot be saved never fails the test itself.
const saveTest = async (proxyServerId: string, outcome: TestOutcome) => {
   try {
      const { request, response, elapsedMs } = outcome.exchange

      await PrismaService.client.proxyTest.create({
         data: {
            proxyServerId,
            status: outcome.status,
            statusMessage: outcome.statusMessage,
            latencyMs: elapsedMs,
            requestMethod: request.method,
            requestUrl: request.url,
            requestHeaders: request.headers,
            requestBody: request.body,
            responseStatus: response?.status ?? null,
            responseHeaders: response?.headers,
            responseBody: response?.body ?? null,
            responseTruncated: response?.truncated ?? false,
            error: outcome.status === 'UNREACHABLE' ? outcome.statusMessage : null,
         },
      })
      await PrismaService.client.proxyTest.deleteMany({ where: { testedAt: { lt: historyCutoff() } } })
   } catch (error) {
      console.error(`Could not save the test history of proxy ${proxyServerId}: ${(error as Error).message}`)
   }
}

// Tests a candidate proxy by routing one request through it to ipinfo.io. `otherCountryCodes` are the
// account's other proxies' already-detected countries: a mismatch only warns, it never blocks the save.
const test = async (input: ProxyServerInput, otherCountryCodes: string[]): Promise<TestOutcome> => {
   try {
      const result = await IpInfoService.lookupThroughProxy(toConnectionUrl(input))
      const mismatch = otherCountryCodes.length > 0 && !otherCountryCodes.includes(result.countryCode)

      return {
         status: mismatch ? 'GEO_MISMATCH' : 'ACTIVE',
         statusMessage: mismatch
            ? `Reachable, but detected in ${result.country}, not ${otherCountryCodes[0]} like this account's other proxies`
            : `Reachable, detected in ${result.country}`,
         countryCode: result.countryCode,
         country: result.country,
         ip: result.ip,
         latencyMs: result.latencyMs,
         exchange: result.exchange,
      }
   } catch (error) {
      const message = error instanceof IpInfoError ? error.message : 'could not reach the proxy'

      return {
         status: 'UNREACHABLE',
         statusMessage: message,
         exchange: (error instanceof IpInfoError && error.exchange) || NOT_RECORDED,
      }
   }
}

export class ProxyServerService {
   // Every proxy the owner has, across every LinkedIn account, for the /proxies table.
   public static listForUser(userId: string) {
      return PrismaService.client.proxyServer.findMany({
         where: { linkedInAccount: { userId } },
         orderBy: { createdAt: 'asc' },
         select: metadataSelect,
      })
   }

   // The proxies of one of the owner's accounts that a check can use, for choosing another one when trying again.
   public static listUsableForAccount(userId: string, linkedInAccountId: string) {
      return PrismaService.client.proxyServer.findMany({
         where: {
            linkedInAccountId,
            linkedInAccount: { userId },
            status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
         },
         orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
         select: metadataSelect,
      })
   }

   public static async create(userId: string, input: ProxyServerInput) {
      const account = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id: input.linkedInAccountId,
            userId,
         },
      })

      if (!account) {
         throw new ProxyServerOwnershipError()
      }

      const siblings = await PrismaService.client.proxyServer.findMany({
         where: {
            linkedInAccountId: input.linkedInAccountId,
            detectedCountryCode: { not: null },
         },
         select: { detectedCountryCode: true },
      })
      const outcome = await test(
         input,
         siblings.map(sibling => sibling.detectedCountryCode).filter((code): code is string => Boolean(code))
      )

      const hasAnyActive = await PrismaService.client.proxyServer.count({
         where: {
            linkedInAccountId: input.linkedInAccountId,
            status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
         },
      })

      const created = await PrismaService.client.proxyServer.create({
         data: {
            linkedInAccountId: input.linkedInAccountId,
            protocol: input.protocol,
            host: input.host,
            port: input.port,
            ...seal(input),
            status: outcome.status,
            statusMessage: outcome.statusMessage,
            lastTestedAt: new Date(),
            ...('countryCode' in outcome
               ? {
                    detectedCountryCode: outcome.countryCode,
                    detectedCountry: outcome.country,
                    detectedIp: outcome.ip,
                    latencyMs: outcome.latencyMs,
                 }
               : {}),
            // The account's first healthy proxy becomes primary automatically; later ones are added as backups.
            isPrimary: hasAnyActive === 0 && outcome.status === 'ACTIVE',
         },
         select: metadataSelect,
      })

      await saveTest(created.id, outcome)

      return created
   }

   // Re-tests with whatever is stored today (no field changes) or with a patch, re-testing either way: every
   // field that can change here affects the connection. undefined leaves username/password unchanged; null clears
   // them; a string sets them.
   public static async update(
      userId: string,
      id: string,
      patch: Partial<{ protocol: ProxyProtocol; host: string; port: number }> & {
         username?: string | null
         password?: string | null
      }
   ) {
      const row = await PrismaService.client.proxyServer.findFirst({
         where: {
            id,
            linkedInAccount: { userId },
         },
      })

      if (!row) {
         throw new ProxyServerOwnershipError()
      }

      const current = open(row)
      const input: ProxyServerInput = {
         linkedInAccountId: row.linkedInAccountId,
         protocol: patch.protocol ?? row.protocol,
         host: patch.host ?? row.host,
         port: patch.port ?? row.port,
         username: patch.username === undefined ? current.username : (patch.username ?? undefined),
         password: patch.password === undefined ? current.password : (patch.password ?? undefined),
      }

      const siblings = await PrismaService.client.proxyServer.findMany({
         where: {
            linkedInAccountId: row.linkedInAccountId,
            id: { not: id },
            detectedCountryCode: { not: null },
         },
         select: { detectedCountryCode: true },
      })
      const outcome = await test(
         input,
         siblings.map(sibling => sibling.detectedCountryCode).filter((code): code is string => Boolean(code))
      )

      const updated = await PrismaService.client.proxyServer.update({
         where: { id: row.id },
         data: {
            protocol: input.protocol,
            host: input.host,
            port: input.port,
            ...seal(input),
            status: outcome.status,
            statusMessage: outcome.statusMessage,
            lastTestedAt: new Date(),
            ...('countryCode' in outcome
               ? {
                    detectedCountryCode: outcome.countryCode,
                    detectedCountry: outcome.country,
                    detectedIp: outcome.ip,
                    latencyMs: outcome.latencyMs,
                 }
               : {
                    detectedCountryCode: null,
                    detectedCountry: null,
                    detectedIp: null,
                    latencyMs: null,
                 }),
         },
         select: metadataSelect,
      })

      await saveTest(updated.id, outcome)

      return updated
   }

   // Manual re-test button: whatever the result is, it updates the stored status.
   public static test(userId: string, id: string) {
      return ProxyServerService.update(userId, id, {})
   }

   // The last 7 days of tests of a proxy the user owns, newest first, without the request and response data (those
   // are large; historyEntry returns them for the one test that is opened).
   public static async history(userId: string, proxyServerId: string) {
      const proxy = await PrismaService.client.proxyServer.findFirst({
         where: {
            id: proxyServerId,
            linkedInAccount: { userId },
         },
         select: { id: true },
      })

      if (!proxy) {
         throw new ProxyServerOwnershipError()
      }

      return PrismaService.client.proxyTest.findMany({
         where: {
            proxyServerId,
            testedAt: { gte: historyCutoff() },
         },
         orderBy: { testedAt: 'desc' },
         select: {
            id: true,
            testedAt: true,
            status: true,
            statusMessage: true,
            latencyMs: true,
            responseStatus: true,
            error: true,
         },
      })
   }

   // One test with everything that was sent and received, only if it belongs to one of the user's proxies.
   public static async historyEntry(userId: string, id: string) {
      const entry = await PrismaService.client.proxyTest.findFirst({
         where: {
            id,
            proxyServer: { linkedInAccount: { userId } },
            testedAt: { gte: historyCutoff() },
         },
      })

      if (!entry) {
         throw new ProxyServerOwnershipError()
      }

      // Prisma's Json type is recursive and makes the API's output type too deep for the web app to infer; these
      // columns only ever hold the plain header maps saved by saveTest.
      return {
         ...entry,
         requestHeaders: entry.requestHeaders as Record<string, string>,
         responseHeaders: entry.responseHeaders as Record<string, string> | null,
      }
   }

   public static async remove(userId: string, id: string) {
      const { count } = await PrismaService.client.proxyServer.deleteMany({
         where: {
            id,
            linkedInAccount: { userId },
         },
      })

      return count > 0
   }

   // The proxy the automation layer should use for this account right now: the primary if it is healthy,
   // otherwise the most recently tested healthy one, otherwise none. With `proxyId` only that one, and only when it
   // is one of this account's usable proxies. `config` carries the credentials for the worker; `summary` is what may
   // be shown and kept (never the credentials).
   public static async pickForAccount(linkedInAccountId: string, proxyId?: string) {
      const candidate = await PrismaService.client.proxyServer.findFirst({
         where: {
            ...(proxyId && { id: proxyId }),
            linkedInAccountId,
            status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
         },
         orderBy: [{ isPrimary: 'desc' }, { lastTestedAt: 'desc' }],
      })

      if (!candidate) {
         return null
      }

      return {
         config: toProxyConfig({
            ...candidate,
            ...open(candidate),
         }),
         summary: {
            id: candidate.id,
            protocol: candidate.protocol,
            host: candidate.host,
            port: candidate.port,
            country: candidate.detectedCountry,
         },
      }
   }
}
