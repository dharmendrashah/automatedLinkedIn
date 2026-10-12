import { type ModuleState, type ModuleStatus } from './types'

export const stateLabel = (state: ModuleState) => ({ live: 'Live', dead: 'Dead', unknown: 'Unknown' })[state]

export const bannerText = (overall: ModuleState, modules: ModuleStatus[]) => {
   if (overall === 'live') {
      return 'Everything is live.'
   }

   const count = (state: ModuleState) => modules.filter(item => item.status === state).length

   if (overall === 'dead') {
      const dead = count('dead')

      return `${dead} of ${modules.length} modules ${dead === 1 ? 'is' : 'are'} dead.`
   }

   return `${count('unknown')} of ${modules.length} modules could not be checked.`
}

// Brain sends the groups in the order to show them; they are only gathered here.
export const groupModules = (modules: ModuleStatus[]) => {
   const groups = new Map<string, ModuleStatus[]>()

   for (const item of modules) {
      groups.set(item.group, [...(groups.get(item.group) ?? []), item])
   }

   return [...groups].map(([group, grouped]) => ({
      group,
      modules: grouped,
   }))
}

export const checkedText = (checkedAt: string, now = Date.now()) => {
   const seconds = Math.round((now - Date.parse(checkedAt)) / 1000)

   if (seconds < 5) {
      return 'Checked just now'
   }

   if (seconds < 60) {
      return `Checked ${seconds} seconds ago`
   }

   const minutes = Math.round(seconds / 60)

   return `Checked ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
}

export const UNREACHABLE_MESSAGE = 'The API is not answering, so the other modules cannot be checked.'

// When the API cannot be asked, only two things are known: this page loaded, so the website is up, and the API did not
// answer. Nothing else is guessed.
export const unreachableModules: ModuleStatus[] = [
   {
      key: 'website',
      group: 'The app',
      name: 'Website',
      description: 'The page you are looking at',
      status: 'live',
   },
   {
      key: 'api',
      group: 'The app',
      name: 'API',
      description: 'Everything the app asks for',
      status: 'dead',
      reason: 'Not answering',
   },
]
