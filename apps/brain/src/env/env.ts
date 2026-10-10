import { cleanEnv, port, str as string, url } from 'envalid'

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
      })
   }
}
