import { bool, cleanEnv, num, port, str as string, url } from 'envalid'

export class Environment {
   public static config() {
      return cleanEnv(process.env, {
         PORT: port({
            desc: 'Port the spider API listens on',
            example: '3002',
            default: 3002,
         }),
         NODE_ENV: string({
            desc: 'The mode spider is running in',
            example: 'development',
            choices: ['development', 'test', 'production'] as const,
            default: 'development',
         }),
         RABBITMQ_URL: url({
            desc: 'AMQP URL of the RabbitMQ broker, including the vhost in the path',
            example: 'amqp://user:password@rabbitmq:5672/automatedlinkedin',
            // Matches the docker compose broker; production has no default and must set it.
            devDefault: 'amqp://automatedlinkedin:automatedlinkedin@localhost:5672/automatedlinkedin',
         }),
         SPIDER_ALLOWED_HOSTS: string({
            desc: 'Comma-separated hosts spider may visit; subdomains are included. Everything else is refused',
            example: 'example.com,localhost',
            // Local runs only: production has no default and must list its targets on purpose. LinkedIn is allowed
            // here on the operator's attestation of LinkedIn's written permission (.plan/linkedin-account-linking.md).
            // The two hosts after it are the bot detection pages the browser test visits.
            devDefault: 'localhost,127.0.0.1,linkedin.com,deviceandbrowserinfo.com,pixelscan.net',
         }),
         SPIDER_ROBOTS_EXEMPT_HOSTS: string({
            desc: 'Comma-separated hosts (a subset of SPIDER_ALLOWED_HOSTS) whose robots.txt is not checked',
            example: 'linkedin.com',
            default: '',
            devDefault: 'linkedin.com',
         }),
         SPIDER_GCS_BUCKET: string({
            desc: 'Google Cloud Storage bucket for stored sessions (sessions/) and raw results (results/). Worker only',
            example: 'my-spider-bucket',
            default: '',
         }),
         SPIDER_MIN_DELAY_MS: num({
            desc: 'Fixed minimum gap in milliseconds between two actions on the same host',
            default: 2000,
         }),
         SPIDER_MAX_RECORDS: num({
            desc: 'Most records one task may extract',
            default: 200,
         }),
         SPIDER_ACTION_TIMEOUT_MS: num({
            desc: 'How long one browser step may take before the task fails',
            default: 30_000,
         }),
         SPIDER_ROBOTS_USER_AGENT: string({
            desc: 'Agent token matched against robots.txt rules',
            default: 'automatedlinkedin-spider',
         }),
         SPIDER_ACCOUNT_LOCK_TTL_MS: num({
            desc: 'How long an account lease lasts without renewal. A running task renews it every fifth of this, so a crashed worker frees its account within this time',
            default: 300_000,
         }),
         SPIDER_ACCOUNT_BUSY_DELAY_MS: num({
            desc: 'How long a task waits before it is tried again because another task holds its account',
            default: 10_000,
         }),
         LINKEDIN_CRED_ENC_KEY: string({
            desc: "Base64 32-byte key that opens the sealed credentials brain sends for validation. Must equal brain's key. Worker only; it checks it at start",
            example: 'openssl rand -base64 32',
            default: '',
            // The same insecure throwaway key as brain's dev default, so a local stack works without setup.
            devDefault: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
         }),
         SPIDER_LINKEDIN_BASE_URL: url({
            desc: 'Where account validation signs in. Its host must be in SPIDER_ALLOWED_HOSTS. Only a test site differs',
            example: 'https://www.linkedin.com',
            default: 'https://www.linkedin.com',
         }),
         SPIDER_VALIDATION_MODE: string({
            desc: 'full: try the saved browser token, then sign in with the password (and two-step code). session: only the token',
            choices: ['full', 'session'] as const,
            default: 'full',
         }),
         SPIDER_RECORDING: string({
            desc: 'Record each account check for the Sessions page: off, failures (keep a recording only when the run went wrong) or always',
            choices: ['off', 'failures', 'always'] as const,
            default: 'off',
            devDefault: 'always',
         }),
         SPIDER_RECORD_VIDEO: bool({
            desc: 'Include a video of the browser in a recording. Needs the ffmpeg build of Playwright in the image',
            default: true,
         }),
         SPIDER_BROWSER_PROFILES: bool({
            desc: 'Run each account in its own browser profile (cookies, site storage, history, cache), kept sealed in the bucket. Off: every run starts a new browser from the saved session. Worker only',
            default: true,
         }),
         SPIDER_BLOCK_IN_BROWSER: bool({
            desc: 'Let the browser itself refuse addresses that are not allowed (a Firefox policy), so its HTTP cache works. Off, or when the policy cannot be put in place: every request is checked, which keeps the cache off. Worker only',
            default: true,
         }),
         SPIDER_SHUTDOWN_GRACE_MS: num({
            desc: 'How long a stopping worker waits for the run in progress, in milliseconds, before it hands the run back to the queue. Keep it below the pod terminationGracePeriodSeconds. Worker only',
            default: 540_000,
         }),
         SPIDER_EMBED_HOSTS: string({
            desc: 'Comma-separated hosts whose frames LinkedIn needs (sign-in and captcha); the browser lets them load next to SPIDER_ALLOWED_HOSTS. Worker only',
            default: 'google.com,gstatic.com,recaptcha.net,arkoselabs.com',
         }),
         SPIDER_HEADLESS: string({
            desc: 'How the browser runs: true is headless Firefox, virtual is a real browser on an Xvfb display (Linux with Xvfb installed, which the worker image has). Worker only',
            choices: ['true', 'virtual'] as const,
            default: 'true',
         }),
         SPIDER_WORKER_HEALTH_PORT: port({
            desc: 'Port of the worker health endpoint that the Service status page reads. Worker only',
            default: 3003,
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
