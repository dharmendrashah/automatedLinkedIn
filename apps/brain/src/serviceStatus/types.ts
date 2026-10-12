export type ModuleState = 'live' | 'dead' | 'unknown'

export type CheckResult = {
   state: ModuleState
   // One of the fixed sentences below. Never an address, a version or the text of an error.
   reason?: string
}

export const REASONS = {
   notAnswering: 'Not answering',
   timedOut: 'Timed out',
   error: 'Reports an error',
   notOnKubernetes: 'Not running on Kubernetes',
   cannotAskKubernetes: 'Could not ask Kubernetes',
   workerUnreachable: 'Cannot be checked while the spider worker is not answering',
} as const

export type StatusModule = {
   key: string
   group: string
   name: string
   description: string
   // How long an answer is reused. Defaults to ten seconds.
   ttlMs?: number
   check: () => Promise<CheckResult>
}

export const live = (): CheckResult => ({ state: 'live' })

export const dead = (reason: string): CheckResult => ({
   state: 'dead',
   reason,
})

export const unknown = (reason: string): CheckResult => ({
   state: 'unknown',
   reason,
})

// How long one check may take before the module counts as dead.
export const CHECK_TIMEOUT_MS = 3000
