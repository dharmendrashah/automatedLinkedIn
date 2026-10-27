import { useEffect } from 'react'

export const APP_NAME = 'automatedLinkedIn'

// The one place a route gets its name: the tab title and the heading of the page both read it.
const ROUTES: Array<[RegExp, string]> = [
   [/^\/login$/, 'Log in'],
   [/^\/signup$/, 'Sign up'],
   [/^\/callback$/, 'Signing in'],
   [/^\/dashboard$/, 'Dashboard'],
   // A conversation is only "Unibox": a person's name does not belong in a history list or a bookmark.
   [/^\/unibox(\/[^/]+)?$/, 'Unibox'],
   // The account is in the address; its name is not in the title.
   [/^\/network(\/[^/]+)?$/, 'My network'],
   [/^\/posting(\/[^/]+(\/[^/]+)?)?$/, 'Write a post'],
   [/^\/accounts$/, 'LinkedIn accounts'],
   // The account's own profile; no name in the title, as for a conversation.
   [/^\/accounts\/[^/]+$/, 'Account profile'],
   [/^\/profiles$/, 'LinkedIn profiles'],
   [/^\/companies$/, 'LinkedIn companies'],
   [/^\/posts$/, 'LinkedIn posts'],
   [/^\/lists$/, 'Lists'],
   [/^\/icps$/, 'Ideal customers'],
   [/^\/workflows$/, 'Workflows'],
   [/^\/workflows\/new$/, 'New workflow'],
   [/^\/workflows\/[^/]+$/, 'Workflow'],
   [/^\/usage$/, 'Usage'],
   [/^\/proxies$/, 'Proxies'],
   [/^\/sessions$/, 'Sessions'],
   [/^\/healthstatus$/, 'Service status'],
   [/^\/jobs$/, 'Cron monitor'],
   [/^\/profile$/, 'Profile'],
]

export const titleFor = (pathname: string) => {
   const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

   return ROUTES.find(([pattern]) => pattern.test(path))?.[1]
}

export const NOT_FOUND_TITLE = 'Page not found'

// "Unibox · automatedLinkedIn"; the bare name when there is no page.
export const formatTitle = (page?: string) => (page ? `${page} · ${APP_NAME}` : APP_NAME)

let current: string | undefined

// What the app last put in the tab, so something that borrows the title for a while can put the right one back.
export const getPageTitle = () => current

export const setPageTitle = (page?: string) => {
   current = formatTitle(page)
   document.title = current
}

// A page that knows more than its route does (a workflow's own name) names itself.
export const useDocumentTitle = (page?: string) => {
   useEffect(() => {
      if (page) {
         setPageTitle(page)
      }
   }, [page])
}
