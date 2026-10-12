import { CryptoService, IpInfoError, IpInfoService } from 'core'

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
     }
   | { status: 'UNREACHABLE'; statusMessage: string }

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
      }
   } catch (error) {
      const message = error instanceof IpInfoError ? error.message : 'could not reach the proxy'

      return {
         status: 'UNREACHABLE',
         statusMessage: message,
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

      return PrismaService.client.proxyServer.create({
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

      return PrismaService.client.proxyServer.update({
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
   }

   // Manual re-test button: whatever the result is, it updates the stored status.
   public static test(userId: string, id: string) {
      return ProxyServerService.update(userId, id, {})
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
   // otherwise the most recently tested healthy one, otherwise none.
   public static async pickForAccount(linkedInAccountId: string) {
      const candidate = await PrismaService.client.proxyServer.findFirst({
         where: {
            linkedInAccountId,
            status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
         },
         orderBy: [{ isPrimary: 'desc' }, { lastTestedAt: 'desc' }],
      })

      if (!candidate) {
         return null
      }

      return toProxyConfig({
         ...candidate,
         ...open(candidate),
      })
   }
}
