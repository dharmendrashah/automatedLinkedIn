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
   cannotAskKubernetes: 'Could not ask Kubernetes',
   noPodReady: 'No pod is ready',
   switchedOff: 'Switched off',
   notSetUp: 'Not set up in this deployment',
   noJob: 'The Cloud Run job does not exist',
   notReady: 'The Cloud Run job is not ready',
   lastRunFailed: 'The last run failed',
   cannotAskGoogle: 'Could not ask Google Cloud',
} as const

export type StatusModule = {
   key: string
   group: string
   name: string
   description: string
   // How long an answer is reused. Defaults to ten seconds.
   ttlMs?: number
   // The Kubernetes workload this module checks in its own, deeper way, so discovery does not add a second card for it.
   workload?: string
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
