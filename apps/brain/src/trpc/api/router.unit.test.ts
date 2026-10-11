import { describe, expect, it, vi } from 'vitest'

import { type Context } from './context'

const mocks = vi.hoisted(() => ({ provisionUser: vi.fn() }))

vi.mock('./identity', () => ({ provisionUser: mocks.provisionUser }))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   AUTHENTIK_INTERNAL_URL: '',
   DATABASE_URL: 'postgresql://localhost:5432/test',
   CORS_ORIGINS: 'http://localhost:3000',
   GIT_SHA: 'test',
   BUILD_TIME: 'test',
   PORT: 3001,
   isProd: false,
   isDev: true,
}))

const anonymous: Partial<Context> = {
   auth: null,
   user: null,
}

// Every procedure registered on the public router must reject an anonymous caller.
// A new procedure that forgets the guard fails here, not in production.
describe('appRouter authentication', () => {
   it('should reject an anonymous caller on every procedure', async () => {
      const { appRouter } = await import('./router')
      const procedures = Object.entries(
         (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures
      )

      expect(procedures.length).toBeGreaterThan(0)

      for (const [name] of procedures) {
         const caller = appRouter.createCaller(anonymous as Context) as unknown as Record<
            string,
            () => Promise<unknown>
         >
         await expect(caller[name]()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      }
   })
})
