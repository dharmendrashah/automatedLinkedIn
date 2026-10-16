import { bool, cleanEnv, makeValidator, num, port, str as string, url } from 'envalid'

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
         RABBITMQ_URL: url({
            desc: 'AMQP URL of the RabbitMQ broker, including the vhost in the path',
            example: 'amqp://user:password@rabbitmq:5672/automatedlinkedin',
            // Matches the docker compose broker; production has no default and must set it.
            devDefault: 'amqp://automatedlinkedin:automatedlinkedin@localhost:5672/automatedlinkedin',
            docs: 'https://www.rabbitmq.com/docs/uri-spec',
         }),
         LINKEDIN_CRED_ENC_KEY: encryptionKey({
            desc: 'Base64-encoded 32-byte key (AES-256-GCM) that encrypts stored LinkedIn secrets at rest',
            example: 'openssl rand -base64 32',
            // Insecure throwaway key for local and test only; production has no default and must set a real one.
            devDefault: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
         }),
         IPINFO_TOKEN: string({
            desc: "ipinfo.io Lite API token used to look up a proxy's country by routing a request through it",
            example: 'xxxxxxxxxxxxxx',
            // Local/test never reach the real API; a non-empty placeholder just satisfies validation.
            devDefault: 'dev-ipinfo-token',
         }),
         ABUSEIPDB_API_KEY: string({
            desc: "AbuseIPDB API key used to check a proxy's exit IP for abuse reports. Empty: proxies are scored on latency alone",
            example: 'xxxxxxxxxxxxxx',
            default: '',
            docs: 'https://docs.abuseipdb.com/#check-endpoint',
         }),
         SPIDER_GCS_BUCKET: string({
            desc: 'Google Cloud Storage bucket spider records sessions in. Brain only signs links to its recordings/ files. Empty: the Sessions page works without recordings',
            example: 'my-spider-bucket',
            default: '',
         }),
         SESSION_RECORDING_RETENTION_DAYS: num({
            desc: 'How many days a session recording stays available. Match the bucket lifecycle rule for recordings/',
            default: 7,
         }),
         STATUS_URL_WEBSITE: string({
            desc: 'Address the Service status page asks to see whether the website is up. Empty: the module is left out',
            example: 'http://body:80/health',
            default: 'http://body:80/health',
            devDefault: 'http://localhost:3000/health',
         }),
         STATUS_URL_SIGN_IN: string({
            desc: 'Address the Service status page asks to see whether sign-in (authentik) is ready. Empty: left out',
            example: 'http://authentik-server:9000/-/health/ready/',
            default: 'http://authentik-server:9000/-/health/ready/',
            devDefault: 'http://localhost:9000/-/health/ready/',
         }),
         STATUS_URL_SPIDER_API: string({
            desc: 'Address the Service status page asks to see whether the spider API is up. Empty: left out',
            example: 'http://spider-api:3002/health',
            default: 'http://spider-api:3002/health',
            devDefault: 'http://localhost:3002/health',
         }),
         STATUS_URL_SPIDER_WORKER: string({
            desc: 'Health address of the spider worker, which also reports cloud storage. Empty: both are left out',
            example: 'http://spider-worker:3003/health',
            default: 'http://spider-worker:3003/health',
            devDefault: 'http://localhost:3003/health',
         }),
         STATUS_URL_BRAIN_WORKER: string({
            desc: 'Health address of the brain worker. Empty: the module is left out',
            example: 'http://brain-worker:3004/health',
            default: 'http://brain-worker:3004/health',
            devDefault: 'http://localhost:3004/health',
         }),
         WORKER_ROLES: string({
            desc: 'What the brain worker process does, comma separated: consumers (apply results from the queues) and jobs (scheduled work). Run jobs in one replica only',
            example: 'consumers,jobs',
            default: 'consumers,jobs',
         }),
         WORKER_HEALTH_PORT: port({
            desc: 'Port the brain worker answers GET /health on',
            default: 3004,
         }),
         WORKER_SHUTDOWN_GRACE_MS: num({
            desc: 'How long the brain worker waits for work in progress when it is asked to stop',
            default: 25_000,
         }),
         AUTHENTIK_EMAIL__HOST: string({
            desc: 'SMTP server authentik sends mail through. The Service status page connects to it and reads its greeting. Empty: left out',
            example: 'smtp.resend.com',
            default: '',
         }),
         AUTHENTIK_EMAIL__PORT: port({
            desc: 'Port of that SMTP server',
            default: 465,
         }),
         AUTHENTIK_EMAIL__USE_SSL: bool({
            desc: 'Whether that SMTP server speaks TLS from the first byte',
            default: false,
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
