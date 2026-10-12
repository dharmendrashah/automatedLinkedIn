import { readFile } from 'node:fs/promises'
import { request } from 'node:https'

import { CHECK_TIMEOUT_MS } from './types'

export type Credentials = {
   token: string
   namespace: string
   ca: string
}

export type KubernetesApi = {
   credentials: () => Promise<Credentials | null>
   get: (path: string, credentials: Credentials) => Promise<{ status: number; body: string }>
}

const SERVICE_ACCOUNT = '/var/run/secrets/kubernetes.io/serviceaccount'

// Read-only access from inside a pod, with the ServiceAccount Kubernetes mounts there. Outside Kubernetes there are no
// credentials, which is how the status page knows it is not running on a cluster.
export const kubernetesApi: KubernetesApi = {
   credentials: async () => {
      try {
         const [token, namespace, ca] = await Promise.all(
            ['token', 'namespace', 'ca.crt'].map(file => readFile(`${SERVICE_ACCOUNT}/${file}`, 'utf8'))
         )

         return {
            token: token.trim(),
            namespace: namespace.trim(),
            ca,
         }
      } catch {
         return null
      }
   },
   get: (path, credentials) =>
      new Promise((resolve, reject) => {
         const req = request(
            {
               host: process.env.KUBERNETES_SERVICE_HOST ?? 'kubernetes.default.svc',
               port: process.env.KUBERNETES_SERVICE_PORT ?? 443,
               path,
               ca: credentials.ca,
               headers: { authorization: `Bearer ${credentials.token}` },
               timeout: CHECK_TIMEOUT_MS,
            },
            response => {
               let body = ''

               response.on('data', chunk => (body += String(chunk)))
               response.on('end', () =>
                  resolve({
                     status: response.statusCode ?? 0,
                     body,
                  })
               )
            }
         )

         req.on('timeout', () => req.destroy(new Error('timeout')))
         req.on('error', reject)
         req.end()
      }),
}
