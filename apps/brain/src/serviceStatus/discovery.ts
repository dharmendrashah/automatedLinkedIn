import { z } from 'zod'

import { type CheckResult, type ModuleState, REASONS, type StatusModule, dead, live, unknown } from './types'

import { type Credentials, type KubernetesApi, kubernetesApi } from './kubernetes'

const TITLE = 'status.automatedlinkedin/title'
const GROUP = 'status.automatedlinkedin/group'
const DESCRIPTION = 'status.automatedlinkedin/description'
const HIDE = 'status.automatedlinkedin/hide'

const DEFAULT_GROUP = 'Other services'
const DEFAULT_DESCRIPTION = 'A service running in the cluster'

// Kubernetes is asked at most this often, however many modules and pages there are.
const LIST_TTL_MS = 10_000

export type Workload = {
   name: string
   title: string
   group: string
   description: string
   state: ModuleState
   reason?: string
}

export type Discovery = { kind: 'workloads'; workloads: Workload[] } | { kind: 'off' } | { kind: 'failed' }

const listSchema = z.object({
   items: z.array(
      z.object({
         metadata: z.object({
            name: z.string(),
            annotations: z.record(z.string(), z.string()).optional(),
         }),
         spec: z.object({ replicas: z.number().optional() }).optional(),
         status: z.object({ readyReplicas: z.number().optional() }).optional(),
      })
   ),
})

// "authentik-worker" becomes "Authentik worker" when nobody gave the workload a title.
const titleOf = (name: string) => {
   const words = name.replace(/[-_]+/g, ' ').trim()

   return words.charAt(0).toUpperCase() + words.slice(1)
}

const stateOf = (replicas: number, ready: number): Pick<Workload, 'state' | 'reason'> => {
   if (replicas === 0) {
      return {
         state: 'unknown',
         reason: REASONS.switchedOff,
      }
   }

   return ready >= 1
      ? { state: 'live' }
      : {
           state: 'dead',
           reason: REASONS.noPodReady,
        }
}

const readKind = async (api: KubernetesApi, kind: string, credentials: Credentials) => {
   const { status, body } = await api.get(`/apis/apps/v1/namespaces/${credentials.namespace}/${kind}`, credentials)

   if (status !== 200) {
      throw new Error('refused')
   }

   return listSchema.parse(JSON.parse(body)).items
}

// Every Deployment and StatefulSet of the namespace, read with one list call each. A workload shows up on the status
// page without any code; its title, group and description come from annotations on its own manifest. Read-only.
export const createDiscovery = (api: KubernetesApi = kubernetesApi) => {
   let cached: { at: number; value: Discovery } | undefined
   let pending: Promise<Discovery> | undefined

   const read = async (): Promise<Discovery> => {
      const credentials = await api.credentials()

      if (!credentials) {
         return { kind: 'off' }
      }

      try {
         const [deployments, statefulSets] = await Promise.all(
            ['deployments', 'statefulsets'].map(kind => readKind(api, kind, credentials))
         )

         return {
            kind: 'workloads',
            workloads: [...deployments, ...statefulSets]
               .filter(item => item.metadata.annotations?.[HIDE] !== 'true')
               .map(item => ({
                  name: item.metadata.name,
                  title: item.metadata.annotations?.[TITLE] ?? titleOf(item.metadata.name),
                  group: item.metadata.annotations?.[GROUP] ?? DEFAULT_GROUP,
                  description: item.metadata.annotations?.[DESCRIPTION] ?? DEFAULT_DESCRIPTION,
                  ...stateOf(item.spec?.replicas ?? 1, item.status?.readyReplicas ?? 0),
               }))
               .sort((a, b) => a.name.localeCompare(b.name)),
         }
      } catch {
         return { kind: 'failed' }
      }
   }

   return async () => {
      if (cached && Date.now() - cached.at < LIST_TTL_MS) {
         return cached.value
      }

      pending ??= read()
         .then(value => {
            cached = {
               at: Date.now(),
               value,
            }

            return value
         })
         .finally(() => {
            pending = undefined
         })

      return pending
   }
}

const result = ({ state, reason }: Workload): CheckResult => {
   if (state === 'live') {
      return live()
   }

   return state === 'dead' ? dead(reason ?? REASONS.noPodReady) : unknown(reason ?? REASONS.switchedOff)
}

// A card for every workload that no explicit check already covers. When Kubernetes cannot be asked a single Unknown card
// says so, so cards that are missing are never a silent surprise.
export const discoveredModules = (discovery: Discovery, covered: Set<string>): StatusModule[] => {
   if (discovery.kind === 'off') {
      return []
   }

   if (discovery.kind === 'failed') {
      return [
         {
            key: 'k8s',
            group: DEFAULT_GROUP,
            name: 'Service discovery',
            description: 'Finds the services running in the cluster',
            check: async () => unknown(REASONS.cannotAskKubernetes),
         },
      ]
   }

   return discovery.workloads
      .filter(workload => !covered.has(workload.name))
      .map(workload => ({
         key: `k8s:${workload.name}`,
         group: workload.group,
         name: workload.title,
         description: workload.description,
         check: async () => result(workload),
      }))
}
