import { Environment } from './env'

export const {
   PORT,
   DATABASE_URL,
   AUTHENTIK_ISSUER,
   AUTHENTIK_CLIENT_ID,
   AUTHENTIK_INTERNAL_URL,
   CORS_ORIGINS,
   RABBITMQ_URL,
   LINKEDIN_CRED_ENC_KEY,
   IPINFO_TOKEN,
   GIT_SHA,
   BUILD_TIME,
   isProd,
   isDev,
} = Environment.config()
