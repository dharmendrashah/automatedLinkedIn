export type ApiEnv = Record<string, string | undefined>

export const createTrpcUrl = (env: ApiEnv) =>
   `${(env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '')}/trpc`
