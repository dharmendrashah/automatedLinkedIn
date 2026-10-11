import { cleanEnv, makeValidator, port, str as string, url } from 'envalid'

// Base64-encoded 32-byte key for AES-256-GCM. Validated at boot so a bad key fails fast.
const encryptionKey = makeValidator<string>(value => {
   if (Buffer.from(value, 'base64').length !== 32) {
      throw new Error('must be a base64-encoded 32-byte key (generate with: openssl rand -base64 32)')
   }

   return value
})

export class Environment {
   public static config() {
      return cleanEnv(process.env, {
         PORT: port({
            desc: 'Port the Express server is running on',
            example: '3001',
            default: 3001,
            docs: 'https://expressjs.com/en/starter/hello-world.html',
         }),
         NODE_ENV: string({
            desc: 'The mode the Express is running in',
            example: 'development',
            choices: ['development', 'test', 'production'] as const,
            default: 'development',
            docs: 'https://nodejs.dev/en/learn/how-to-read-environment-variables-from-nodejs/',
         }),
         DATABASE_URL: url({
            desc: 'PostgreSQL connection string used by Prisma',
            example: 'postgresql://postgres:postgres@localhost:5432/automatedlinkedin',
            docs: 'https://www.prisma.io/docs/orm/reference/connection-urls',
         }),
         AUTHENTIK_ISSUER: url({
            desc: 'Issuer of authentik access tokens (browser-facing URL, with trailing slash)',
            example: 'http://localhost:9000/application/o/automatedlinkedin/',
            default: 'http://localhost:9000/application/o/automatedlinkedin/',
            docs: 'https://docs.goauthentik.io/add-secure-apps/providers/oauth2/',
         }),
         AUTHENTIK_CLIENT_ID: string({
            desc: 'OIDC client id of the authentik provider; access tokens must be issued for it',
            example: 'automatedlinkedin',
            default: 'automatedlinkedin',
         }),
         AUTHENTIK_INTERNAL_URL: string({
            desc: 'Base URL brain uses to reach authentik when it differs from the issuer (for example inside Docker)',
            example: 'http://authentik-server:9000',
            default: '',
         }),
         CORS_ORIGINS: string({
            desc: 'Comma-separated browser origins allowed to call the API',
            example: 'http://localhost:3000,http://localhost:5173',
            default: 'http://localhost:3000,http://localhost:5173',
         }),
         LINKEDIN_CRED_ENC_KEY: encryptionKey({
            desc: 'Base64-encoded 32-byte key (AES-256-GCM) that encrypts stored LinkedIn secrets at rest',
            example: 'openssl rand -base64 32',
            // Insecure throwaway key for local and test only; production has no default and must set a real one.
            devDefault: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
         }),
         GIT_SHA: string({
            desc: 'Git commit the image was built from, reported by GET /health',
            example: 'a1b2c3d',
            default: 'unknown',
         }),
         BUILD_TIME: string({
            desc: 'UTC time the image was built, reported by GET /health',
            example: '2026-10-11T10:00:00Z',
            default: 'unknown',
         }),
      })
   }
}
