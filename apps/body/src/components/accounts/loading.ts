import { type Account, type AccountStatus } from './types'

// "Getting your LinkedIn ready" (.plan/first-day-reads.md, phase 2), as brain works it out for each account.
export type Loading = NonNullable<Account['loading']>
type Step = Loading['steps'][number]['step']

export type Tone = 'RED' | 'GREY' | 'YELLOW' | 'BLUE' | 'GREEN'

// Soft tones of light red, light grey, yellow, blue and green as it grows; the words always say the same as the colour.
export const toneOf = (percent: number): Tone =>
   percent >= 100 ? 'GREEN' : percent >= 60 ? 'BLUE' : percent >= 40 ? 'YELLOW' : percent >= 20 ? 'GREY' : 'RED'

const NAMES: Record<Step, string> = {
   SIGN_IN: 'sign-in',
   PROFILE: 'profile',
   CONNECTIONS: 'connections',
   REQUESTS: 'connection requests',
   MESSAGES: 'messages',
}

const BLOCKED: Partial<Record<AccountStatus, string>> = {
   DISABLED: 'Waits while the account is paused.',
   NEEDS_REAUTH: 'Waits until the account is signed in again.',
   ERROR: 'Waits until the account is signed in again.',
   BLOCKED: 'Waits: LinkedIn restricted this account.',
}

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// One sentence under the bar: an account problem first, then what is read now, what did not finish, how far the messages are, and what
// comes next. Never a clock time: when a read starts depends on the account's browsing time at that moment.
export const readyLine = (loading: Loading, status: AccountStatus) => {
   const blocked = BLOCKED[status]

   if (blocked) {
      return blocked
   }

   const { steps } = loading
   const find = (state: Loading['steps'][number]['state']) => steps.find(item => item.state === state)
   const reading = find('READING')
   const givenUp = find('GIVEN_UP')
   const notFinished = find('NOT_FINISHED')

   if (steps[0]?.state !== 'DONE') {
      return 'Starts after the first good sign-in.'
   }

   if (reading) {
      return `Reading your ${NAMES[reading.step]} now.`
   }

   if (givenUp) {
      return 'Your profile could not be read. Press Read profile on the account page.'
   }

   if (notFinished) {
      return `Your ${NAMES[notFinished.step]} did not finish. It is tried again tomorrow.`
   }

   const next = steps.find(item => item.state === 'WAITING')

   if (next?.step === 'MESSAGES' && loading.conversations > 0) {
      return `Messages: ${loading.conversations.toLocaleString('en-US')} conversations read so far. A large inbox takes a few days.`
   }

   return next
      ? `${upper(`your ${NAMES[next.step]}`)} ${next.step === 'MESSAGES' ? 'are' : 'is'} next. It starts by itself.`
      : 'Ready.'
}

const needsYou = (account: { status: AccountStatus; loading: Loading | null }) =>
   BLOCKED[account.status] !== undefined || account.loading?.steps.some(({ state }) => state === 'GIVEN_UP') === true

// The line over the list: how many accounts are ready, getting ready, and need the owner.
export const readyCounts = (accounts: Array<{ status: AccountStatus; loading: Loading | null }>) => ({
   ready: accounts.filter(account => !needsYou(account) && account.loading?.percent === 100).length,
   loading: accounts.filter(account => !needsYou(account) && account.loading !== null && account.loading.percent < 100)
      .length,
   needsYou: accounts.filter(needsYou).length,
})
