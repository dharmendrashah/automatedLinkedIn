import { Environment } from './env'

export const {
   PORT,
   DATABASE_URL,
   AUTHENTIK_ISSUER,
   AUTHENTIK_CLIENT_ID,
   AUTHENTIK_INTERNAL_URL,
   CORS_ORIGINS,
   GIT_SHA,
   BUILD_TIME,
   isProd,
   isDev,
} = Environment.config()
