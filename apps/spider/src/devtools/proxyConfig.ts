import { type ProxyConfig } from '@automatedLinkedIn/contracts'

import { openProxyCredentials } from '../tasks/credentials'
import { type SavedProxy } from './localDb'

export const toProxyConfig = (proxy: SavedProxy, keyBase64: string): ProxyConfig => {
   const credentials = openProxyCredentials(proxy.secret, keyBase64)

   return {
      server: `${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}`,
      ...(credentials.username ? { username: credentials.username } : {}),
      ...(credentials.password ? { password: credentials.password } : {}),
   }
}
