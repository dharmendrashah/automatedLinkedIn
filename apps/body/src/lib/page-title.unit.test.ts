import { describe, expect, it, vi } from 'vitest'

import { APP_NAME, formatTitle, getPageTitle, setPageTitle, titleFor } from './page-title'

describe('titleFor', () => {
   it.each([
      ['/login', 'Log in'],
      ['/signup', 'Sign up'],
      ['/callback', 'Signing in'],
      ['/dashboard', 'Dashboard'],
      ['/unibox', 'Unibox'],
      ['/posting', 'Write a post'],
      ['/accounts', 'LinkedIn accounts'],
      ['/profiles', 'LinkedIn profiles'],
      ['/companies', 'LinkedIn companies'],
      ['/posts', 'LinkedIn posts'],
      ['/lists', 'Lists'],
      ['/icps', 'Ideal customers'],
      ['/workflows', 'Workflows'],
      ['/workflows/new', 'New workflow'],
      ['/usage', 'Usage'],
      ['/proxies', 'Proxies'],
      ['/sessions', 'Sessions'],
      ['/healthstatus', 'Service status'],
      ['/jobs', 'Cron monitor'],
      ['/profile', 'Profile'],
   ])('should name %s', (path, title) => {
      expect(titleFor(path)).toBe(title)
   })

   it('should not put a conversation or a workflow id in the title, and name a workflow page apart from the list', () => {
      expect(titleFor('/unibox/2-abc')).toBe('Unibox')
      expect(titleFor('/network')).toBe('My network')
      expect(titleFor('/network/0198-account')).toBe('My network')
      expect(titleFor('/accounts/0198-id')).toBe('Account profile')
      expect(titleFor('/accounts/0198-id/connections')).toBe('Connections')
      expect(titleFor('/posting/0198-account')).toBe('Write a post')
      expect(titleFor('/posting/0198-account/0198-draft')).toBe('Write a post')
      expect(titleFor('/workflows/0198-id')).toBe('Workflow')
      expect(titleFor('/workflows/new')).toBe('New workflow')
   })

   it('should ignore a trailing slash', () => {
      expect(titleFor('/accounts/')).toBe('LinkedIn accounts')
   })

   it('should have no title for a path the app does not know, or for a longer path of a known page', () => {
      expect(titleFor('/nope')).toBeUndefined()
      expect(titleFor('/accounts/0198-id/extra')).toBeUndefined()
      expect(titleFor('/')).toBeUndefined()
   })
})

describe('formatTitle', () => {
   it('should put the page first and the app name after it', () => {
      expect(formatTitle('Unibox')).toBe(`Unibox · ${APP_NAME}`)
   })

   it('should be the app name alone when there is no page', () => {
      expect(formatTitle()).toBe(APP_NAME)
   })
})

describe('setPageTitle', () => {
   it('should set the tab title and remember it', () => {
      const doc = { title: '' }

      vi.stubGlobal('document', doc)
      setPageTitle('Proxies')

      expect(doc.title).toBe(`Proxies · ${APP_NAME}`)
      expect(getPageTitle()).toBe(`Proxies · ${APP_NAME}`)
      vi.unstubAllGlobals()
   })
})
