import { SignJWT, createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair } from 'jose'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthService } from './auth.service'

const issuer = 'http://localhost:9000/application/o/automatedlinkedin/'
const clientId = 'automatedlinkedin'

const state = vi.hoisted(() => ({ internalUrl: '' }))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   get AUTHENTIK_INTERNAL_URL() {
      return state.internalUrl
   },
}))

vi.mock('jose', async importOriginal => ({
   ...(await importOriginal<object>()),
   createRemoteJWKSet: vi.fn(),
}))

type SignOptions = {
   sub?: string
   iss?: string
   aud?: string
   exp?: string | number
   key?: CryptoKey
   alg?: string
}

let privateKey: CryptoKey
let otherKey: CryptoKey
let rs512Key: CryptoKey

const sign = ({ sub = 'sub-1', iss = issuer, aud = clientId, exp = '5m', key, alg = 'RS256' }: SignOptions = {}) =>
   new SignJWT({})
      .setProtectedHeader({
         alg,
         kid: 'k1',
      })
      .setIssuer(iss)
      .setAudience(aud)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(key ?? privateKey)

describe('AuthService', () => {
   beforeAll(async () => {
      const pair = await generateKeyPair('RS256', { extractable: true })

      const { privateKey: signingKey } = pair

      privateKey = signingKey

      otherKey = (await generateKeyPair('RS256')).privateKey

      rs512Key = (await generateKeyPair('RS512')).privateKey

      const jwk = {
         ...(await exportJWK(pair.publicKey)),
         kid: 'k1',
         alg: 'RS256',
         use: 'sig',
      }

      vi.mocked(createRemoteJWKSet).mockImplementation(() => createLocalJWKSet({ keys: [jwk] }) as never)
   })

   beforeEach(() => {
      state.internalUrl = ''

      vi.unstubAllGlobals()
   })

   describe('bearerToken', () => {
      it('should read a bearer token', () => {
         expect(AuthService.bearerToken('Bearer abc.def')).toBe('abc.def')
      })

      it('should accept any casing of the scheme', () => {
         expect(AuthService.bearerToken('bearer abc')).toBe('abc')
      })

      it.each([undefined, '', 'Bearer', 'Bearer ', 'Basic abc', 'abc'])('should ignore %j', header => {
         expect(AuthService.bearerToken(header)).toBeUndefined()
      })
   })

   describe('authenticate', () => {
      // Key sets are memoised per url, so the default-url case must be the first authenticate call.
      it('should fetch keys from the issuer host by default', async () => {
         await AuthService.authenticate(await sign())

         expect(createRemoteJWKSet).toHaveBeenCalledWith(
            new URL('http://localhost:9000/application/o/automatedlinkedin/jwks/')
         )
      })

      it('should accept a valid token', async () => {
         const token = await sign()

         await expect(AuthService.authenticate(token)).resolves.toEqual({
            token,
            sub: 'sub-1',
         })
      })

      it.each([
         ['expired', () => sign({ exp: Math.floor(Date.now() / 1000) - 60 })],
         ['issued by another issuer', () => sign({ iss: 'http://evil.example/application/o/x/' })],
         ['issued for another client', () => sign({ aud: 'someone-else' })],
         ['signed with another key', () => sign({ key: otherKey })],
         [
            'signed with a different algorithm',
            () =>
               sign({
                  alg: 'RS512',
                  key: rs512Key,
               }),
         ],
      ])('should reject a token that is %s', async (_, make) => {
         await expect(AuthService.authenticate(await make())).resolves.toBeNull()
      })

      it('should reject something that is not a JWT', async () => {
         await expect(AuthService.authenticate('not-a-jwt')).resolves.toBeNull()
      })

      it('should reject a token without a subject', async () => {
         const token = await new SignJWT({})
            .setProtectedHeader({
               alg: 'RS256',
               kid: 'k1',
            })
            .setIssuer(issuer)
            .setAudience(clientId)
            .setExpirationTime('5m')
            .sign(privateKey)

         await expect(AuthService.authenticate(token)).resolves.toBeNull()
      })

      it('should fetch keys from the internal url when configured', async () => {
         state.internalUrl = 'http://authentik-server:9000/'

         await AuthService.authenticate(await sign())

         expect(createRemoteJWKSet).toHaveBeenCalledWith(
            new URL('http://authentik-server:9000/application/o/automatedlinkedin/jwks/')
         )
      })
   })

   describe('fetchIdentity', () => {
      const auth = {
         token: 'tok',
         sub: 'sub-1',
      }

      const stubFetch = (response: Response) => {
         const fetchMock = vi.fn().mockResolvedValue(response)

         vi.stubGlobal('fetch', fetchMock)

         return fetchMock
      }

      it('should map userinfo claims to an identity', async () => {
         const fetchMock = stubFetch(
            Response.json({
               sub: 'sub-1',
               name: 'Ada Lovelace',
               preferred_username: 'ada',
               email: 'ada@example.com',
               email_verified: true,
               groups: ['staff'],
               extra: 'ignored',
            })
         )

         await expect(AuthService.fetchIdentity(auth)).resolves.toEqual({
            id: 'sub-1',
            name: 'Ada Lovelace',
            username: 'ada',
            email: 'ada@example.com',
            emailVerified: true,
            groups: ['staff'],
         })

         expect(fetchMock).toHaveBeenCalledWith('http://localhost:9000/application/o/userinfo/', {
            headers: { authorization: 'Bearer tok' },
            signal: expect.any(AbortSignal),
         })
      })

      it('should call the internal url when configured', async () => {
         state.internalUrl = 'http://authentik-server:9000'

         const fetchMock = stubFetch(Response.json({ sub: 'sub-1' }))

         await AuthService.fetchIdentity(auth)

         expect(fetchMock.mock.calls[0][0]).toBe('http://authentik-server:9000/application/o/userinfo/')
      })

      it('should default optional claims', async () => {
         stubFetch(Response.json({ sub: 'sub-1' }))

         await expect(AuthService.fetchIdentity(auth)).resolves.toEqual({
            id: 'sub-1',
            name: undefined,
            username: undefined,
            email: undefined,
            emailVerified: false,
            groups: [],
         })
      })

      it('should ignore a malformed groups claim', async () => {
         stubFetch(
            Response.json({
               sub: 'sub-1',
               groups: 'staff',
            })
         )

         await expect(AuthService.fetchIdentity(auth)).resolves.toMatchObject({ groups: [] })
      })

      it('should fail when authentik rejects the token', async () => {
         stubFetch(new Response('nope', { status: 401 }))

         await expect(AuthService.fetchIdentity(auth)).rejects.toThrow('userinfo request failed with status 401')
      })

      it('should fail when userinfo belongs to another subject', async () => {
         stubFetch(Response.json({ sub: 'someone-else' }))

         await expect(AuthService.fetchIdentity(auth)).rejects.toThrow('userinfo subject does not match the token')
      })

      it('should fail on an invalid userinfo body', async () => {
         stubFetch(Response.json({ name: 'no subject' }))

         await expect(AuthService.fetchIdentity(auth)).rejects.toThrow()
      })
   })
})
