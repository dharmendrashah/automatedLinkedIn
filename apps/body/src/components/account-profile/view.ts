// What the account's profile page shows, from the state the server gives and whether a profile is at hand. Pure, so it can be tested.
export type ProfileView = 'LOADING' | 'READING' | 'FAILED' | 'EMPTY' | 'PROFILE' | 'ERROR'

export type ProfileStateLike = {
   phase: 'NEVER' | 'READING' | 'READY' | 'FAILED'
   firstVisit: boolean
   blocker: string | null
   lastRun: { ok: boolean; message: string | null; finishedAt: string | null } | null
}

export const viewOf = (
   state: ProfileStateLike | undefined,
   hasProfile: boolean,
   profileLoading: boolean,
   stateFailed = false
): ProfileView => {
   if (hasProfile) {
      return 'PROFILE'
   }

   if (!state) {
      return stateFailed ? 'ERROR' : 'LOADING'
   }

   if (state.phase === 'READY' && profileLoading) {
      return 'LOADING'
   }

   if (state.phase === 'READING') {
      return 'READING'
   }

   return state.phase === 'FAILED' ? 'FAILED' : 'EMPTY'
}

// The sentence for a page with no profile to show.
export const noticeOf = (state: ProfileStateLike) => {
   if (state.phase === 'FAILED') {
      const why = state.lastRun?.message

      return `The last read did not give a profile${why ? `: ${why}` : '.'}`
   }

   if (state.blocker) {
      return state.blocker
   }

   return state.firstVisit
      ? 'Starting the first read of this profile.'
      : 'This profile has not been read yet. Use Read profile to read it.'
}
