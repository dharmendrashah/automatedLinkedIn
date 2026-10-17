export type ApiEnv = Record<string, string | undefined>

export const createApiUrl = (env: ApiEnv) => (env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '')

export const createTrpcUrl = (env: ApiEnv) => `${createApiUrl(env)}/trpc`
