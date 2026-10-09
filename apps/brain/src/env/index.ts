import { Environment } from './env'

export const { PORT, DATABASE_URL, isProd, isDev } = Environment.config()
