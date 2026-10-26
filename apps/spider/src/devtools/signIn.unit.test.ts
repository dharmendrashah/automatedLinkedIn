import { describe, expect, it, vi } from 'vitest'

import { reachFeed } from './signIn'

const FEED = 'https://www.linkedin.com/feed/'

const setup = (landings: string[]) => {
   let url = ''
   const queue = [...landings]
   const lines: string[] = []
   const page = {
      goto: vi.fn(async () => {
         url = queue.shift() ?? FEED
      }),
      url: () => url,
   }

   return {
      page,
      lines,
      log: (line: string) => lines.push(line),
   }
}

describe('reachFeed', () => {
   it('is done when the feed opens', async () => {
      const { page, log } = setup([FEED])
      const signIn = vi.fn(async () => true)

      expect(
         await reachFeed({
            page,
            feedUrl: FEED,
            signIn,
            log,
         })
      ).toBe(true)
      expect(signIn).not.toHaveBeenCalled()
   })

   it('signs in when LinkedIn shows the login page, then opens the feed again', async () => {
      const { page, lines, log } = setup(['https://www.linkedin.com/uas/login', FEED])
      const signIn = vi.fn(async () => true)

      expect(
         await reachFeed({
            page,
            feedUrl: FEED,
            signIn,
            log,
         })
      ).toBe(true)
      expect(signIn).toHaveBeenCalledOnce()
      expect(page.goto).toHaveBeenCalledTimes(2)
      expect(lines.join('\n')).toMatch(/asked for a sign-in/)
   })

   it('says to sign in by hand when there is no way to do it here', async () => {
      const { page, lines, log } = setup(['https://www.linkedin.com/checkpoint/challenge/x'])

      expect(
         await reachFeed({
            page,
            feedUrl: FEED,
            log,
         })
      ).toBe(false)
      expect(lines.join('\n')).toMatch(/by hand/)
   })

   it('reports a sign-in that did not work, and one that still leaves the login page', async () => {
      const failed = setup(['https://www.linkedin.com/login'])

      expect(
         await reachFeed({
            page: failed.page,
            feedUrl: FEED,
            signIn: async () => false,
            log: failed.log,
         })
      ).toBe(false)
      expect(failed.lines.join('\n')).toMatch(/did not work/)

      const loop = setup(['https://www.linkedin.com/login', 'https://www.linkedin.com/login'])

      expect(
         await reachFeed({
            page: loop.page,
            feedUrl: FEED,
            signIn: async () => true,
            log: loop.log,
         })
      ).toBe(false)
      expect(loop.lines.join('\n')).toMatch(/Still signed out/)
   })
})
