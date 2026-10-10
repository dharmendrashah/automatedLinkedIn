import { createAuthConfig } from './config'

export const authConfig = createAuthConfig(import.meta.env, window.location.origin)
