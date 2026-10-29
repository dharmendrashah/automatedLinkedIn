// "Getting your LinkedIn ready" (.plan/first-day-reads.md, phase 2): how far a new account's first reads are, as the owner sees it.
// A step counts once it is done and never goes back; a later read, a sign-out or a failure does not lower it.

export type LoadingStepName = 'SIGN_IN' | 'PROFILE' | 'CONNECTIONS' | 'REQUESTS' | 'MESSAGES'

// GIVEN_UP: the own profile was read three times without being kept; the owner presses Read profile.
export type LoadingState = 'DONE' | 'READING' | 'WAITING' | 'NOT_FINISHED' | 'GIVEN_UP'

export type LoadingFacts = {
   signedIn: boolean
   profileStored: boolean
   // How many reads of the own profile were started.
   profileTries: number
   connectionsReadAt: Date | null
   invitationsReadAt: Date | null
   messagesBackfilledAt: Date | null
   // Conversations stored so far.
   conversations: number
   // Steps whose run is going now, and steps tried in the last day that did not finish.
   reading: ReadonlySet<LoadingStepName>
   notFinished: ReadonlySet<LoadingStepName>
}

export const PROFILE_TRIES = 3

const WEIGHTS: Record<LoadingStepName, number> = {
   SIGN_IN: 10,
   PROFILE: 10,
   CONNECTIONS: 20,
   REQUESTS: 20,
   MESSAGES: 40,
}

// The inbox size is not known until it is read, so the messages step grows toward its end as conversations come in: 150 make half.
const MESSAGES_HALF = 150

export const loadingOf = (facts: LoadingFacts) => {
   const done: Record<LoadingStepName, boolean> = {
      SIGN_IN: facts.signedIn,
      PROFILE: facts.profileStored,
      CONNECTIONS: facts.connectionsReadAt !== null,
      REQUESTS: facts.invitationsReadAt !== null,
      MESSAGES: facts.messagesBackfilledAt !== null,
   }
   const stateOf = (step: LoadingStepName): LoadingState => {
      if (done[step]) {
         return 'DONE'
      }

      if (facts.reading.has(step)) {
         return 'READING'
      }

      if (step === 'PROFILE' && facts.profileTries >= PROFILE_TRIES) {
         return 'GIVEN_UP'
      }

      return facts.notFinished.has(step) ? 'NOT_FINISHED' : 'WAITING'
   }
   const steps = (Object.keys(WEIGHTS) as LoadingStepName[]).map(step => ({
      step,
      weight: WEIGHTS[step],
      state: stateOf(step),
   }))
   const whole = steps.reduce((sum, { step, weight }) => sum + (done[step] ? weight : 0), 0)
   const messages = done.MESSAGES
      ? 0
      : Math.min(WEIGHTS.MESSAGES - 1, (WEIGHTS.MESSAGES * facts.conversations) / (facts.conversations + MESSAGES_HALF))

   return {
      percent: Math.floor(whole + messages),
      steps,
      conversations: facts.conversations,
      readyForWorkflows: done.PROFILE && done.CONNECTIONS,
      readyForUnibox: done.MESSAGES,
   }
}

export type AccountLoading = ReturnType<typeof loadingOf>
