import type { WorkflowItemData } from 'core'

// The ids the body needs to open a row in the app. Fields that a kind does not have are left out.
export type OutputLinks = { personId?: string | null; inApp?: boolean }

export type OwnedFound = { people: Map<string, string>; companies: Set<string> }

// A profile gets the id of its person row (null when it is not in My network); a company says whether it is in the owner's list.
export const linksOf = (item: Pick<WorkflowItemData, 'kind' | 'slug'>, found: OwnedFound): OutputLinks => {
   if (item.kind === 'profile') {
      return { personId: found.people.get(item.slug) ?? null }
   }

   if (item.kind === 'company') {
      return { inApp: found.companies.has(item.slug) }
   }

   return {}
}
