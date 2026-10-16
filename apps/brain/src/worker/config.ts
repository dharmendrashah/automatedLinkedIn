export type WorkerRole = 'consumers' | 'jobs'

const ROLES: readonly WorkerRole[] = ['consumers', 'jobs']

export type WorkerConfig = {
   roles: ReadonlySet<WorkerRole>
   healthPort: number
   shutdownGraceMs: number
}

// "consumers,jobs" -> the roles this process plays. An unknown or empty list fails at boot: a worker that silently does
// nothing is worse than one that does not start.
export const parseRoles = (value: string): ReadonlySet<WorkerRole> => {
   const names = value
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
   const roles = new Set<WorkerRole>()

   for (const name of names) {
      const role = ROLES.find(known => known === name)

      if (!role) {
         throw new Error(`WORKER_ROLES has an unknown role "${name}". Use: ${ROLES.join(', ')}`)
      }

      roles.add(role)
   }

   if (roles.size === 0) {
      throw new Error(`WORKER_ROLES is empty. Use: ${ROLES.join(', ')}`)
   }

   return roles
}

export const createWorkerConfig = (settings: {
   roles: string
   healthPort: number
   shutdownGraceMs: number
}): WorkerConfig => ({
   roles: parseRoles(settings.roles),
   healthPort: settings.healthPort,
   shutdownGraceMs: settings.shutdownGraceMs,
})
