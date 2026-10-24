import { type PageContext, type PageDeps } from '../../linkedin/pages'
import { type ViewOutcome, viewPage } from '../../linkedin/viewPage'

export type { ViewOutcome }

const PROFILE_PATH = /^\/in\/[^/]+/

// Someone else's profile (.plan/visit-profile-task.md): see `viewPage`.
export const viewProfile = (
   context: PageContext,
   baseUrl: string,
   profileUrl: string,
   { snapshots }: { snapshots: boolean },
   deps: PageDeps = {}
) =>
   viewPage(
      context,
      baseUrl,
      profileUrl,
      {
         landedOn: PROFILE_PATH,
         snapshots,
         keepAs: 'profile',
      },
      deps
   )
