import { type PageContext, type PageDeps } from '../../linkedin/pages'
import { type ViewOutcome, viewPage } from '../../linkedin/viewPage'

export type { ViewOutcome }

// A company page, or the school or showcase page LinkedIn sends a company address to.
const COMPANY_PATH = /^\/(?:company|school|showcase)\/[^/]+/

// A company page (.plan/visit-company-task.md): see `viewPage`.
export const viewCompany = (
   context: PageContext,
   baseUrl: string,
   companyUrl: string,
   { snapshots }: { snapshots: boolean },
   deps: PageDeps = {}
) =>
   viewPage(
      context,
      baseUrl,
      companyUrl,
      {
         landedOn: COMPANY_PATH,
         snapshots,
         keepAs: 'company',
      },
      deps
   )
