import { describe, expect, it } from 'vitest'

import { sendingStatus } from './sending-status'

const NOW = 10 * 60_000
const base = {
   text: 'Hi',
   attachments: [],
   at: 0,
}

describe('sendingStatus', () => {
   it('should show the real percent of the files while they go up, as a bar that fills', () => {
      expect(sendingStatus({ ...base, progress: 40 }, NOW)).toEqual({
         line: 'Uploading files 40%',
         bar: { percent: 40 },
      })
   })

   it('should say it waits for LinkedIn, and since when, with a bar that only moves, once brain has the reply', () => {
      expect(sendingStatus({ ...base, progress: 100, replyId: 'r1', since: NOW - 2 * 60_000 }, NOW)).toEqual({
         line: 'Waiting for LinkedIn. Started 2m ago.',
         bar: {},
      })
      expect(sendingStatus({ ...base, replyId: 'r1', since: NOW }, NOW).line).toBe(
         'Waiting for LinkedIn. Started just now.'
      )
   })

   it('should count from when the reply was made when nothing says since when', () => {
      expect(sendingStatus({ ...base, at: NOW - 5 * 60_000, replyId: 'r1' }, NOW).line).toBe(
         'Waiting for LinkedIn. Started 5m ago.'
      )
   })

   it('should say a reply is queued, that it need not be sent again, and from when the account can start it, with no moving bar', () => {
      const status = sendingStatus(
         {
            ...base,
            replyId: 'r1',
            since: 0,
            wait: {
               reason: "Waiting for the account's next slot.",
               until: new Date(NOW + 3 * 60_000).toISOString(),
               zone: null,
            },
         },
         NOW
      )

      expect(status.bar).toBeUndefined()
      expect(status.line).toMatch(
         /^Queued\. You do not need to send it again\. Waiting for the account's next slot\. It can start /
      )
      expect(status.line).toMatch(/in about 3 min\.$/)
   })

   it('should say the message is being shown once LinkedIn took the reply', () => {
      expect(sendingStatus({ ...base, replyId: 'r1', since: 0, done: true }, NOW)).toEqual({
         line: 'Sent. Showing the message...',
         bar: {},
      })
   })

   it('should say nothing, and show no bar, before there is anything to say', () => {
      expect(sendingStatus(base, NOW)).toEqual({})
   })
})
