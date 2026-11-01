import { describe, expect, it } from 'vitest'

import { isChangedElsewhere, leaveTarget } from './leave-guard'

const click = (over: Partial<Parameters<typeof leaveTarget>[0]> = {}) => ({
   href: 'https://app.test/lists',
   target: '',
   button: 0,
   metaKey: false,
   ctrlKey: false,
   shiftKey: false,
   altKey: false,
   ...over,
})

const HERE = {
   origin: 'https://app.test',
   pathname: '/workflows/w1',
}

describe('leaveTarget', () => {
   it('should name the page a plain click on an in-app link leaves for', () => {
      expect(leaveTarget(click({ href: 'https://app.test/lists?x=1#top' }), HERE)).toBe('/lists?x=1#top')
   })

   it('should let through what does not leave the page: other sites, new tabs, modified clicks, the same page', () => {
      expect(leaveTarget(click({ href: 'https://other.test/lists' }), HERE)).toBeNull()
      expect(leaveTarget(click({ target: '_blank' }), HERE)).toBeNull()
      expect(leaveTarget(click({ metaKey: true }), HERE)).toBeNull()
      expect(leaveTarget(click({ ctrlKey: true }), HERE)).toBeNull()
      expect(leaveTarget(click({ shiftKey: true }), HERE)).toBeNull()
      expect(leaveTarget(click({ button: 1 }), HERE)).toBeNull()
      expect(leaveTarget(click({ href: 'https://app.test/workflows/w1?run=r1' }), HERE)).toBeNull()
   })

   it('should ignore a link that is not an address', () => {
      expect(leaveTarget(click({ href: 'not a url' }), HERE)).toBeNull()
   })
})

describe('isChangedElsewhere', () => {
   it('should recognise the sentence a stale save answers with', () => {
      expect(isChangedElsewhere('This workflow was changed somewhere else since you opened it.')).toBe(true)
      expect(isChangedElsewhere('Fix the problems in the workflow first.')).toBe(false)
      expect(isChangedElsewhere(undefined)).toBe(false)
   })
})
