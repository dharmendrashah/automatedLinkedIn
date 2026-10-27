import { describe, expect, it } from 'vitest'

import {
   type Context,
   type ItemFacts,
   type ItemName,
   type RunLike,
   agoText,
   briefText,
   checksDone,
   dayProgress,
   itemState,
   overallTone,
   progressSentence,
   progressText,
} from './today'

const NOW = new Date('2026-10-27T12:00:00Z')
const at = (time: string, day = '27') => new Date(`2026-10-${day}T${time}:00Z`)

const run = (id: string, time: string, patch: Partial<RunLike & { queued: boolean }> = {}) => ({
   id,
   status: 'SUCCEEDED' as const,
   verdict: 'DONE',
   trigger: 'automatic',
   startedAt: at(time),
   finishedAt: at(time),
   queued: false,
   ...patch,
})

const ctx = (patch: Partial<Context> = {}): Context => ({
   now: NOW,
   zone: 'UTC',
   status: 'ACTIVE',
   lastVerifiedAt: at('02:00', '27'),
   firstRead: false,
   resultOf: ({ status, verdict }) =>
      status === 'FAILED'
         ? { label: 'Failed', tone: 'failure' }
         : verdict === 'UNSURE'
           ? { label: 'Could not tell', tone: 'neutral' }
           : { label: 'Done', tone: 'success' },
   ...patch,
})

const facts = (item: ItemName, patch: Partial<ItemFacts> = {}): ItemFacts => ({
   item,
   next: at('18:00', '28'),
   last: null,
   lastOk: null,
   ...patch,
})

describe('itemState: runs', () => {
   it('should say done with the time for a daily item that worked today', () => {
      const state = itemState(facts('visit', { last: run('s1', '09:12') }), ctx())

      expect(state).toMatchObject({ kind: 'DONE', tone: 'ok', text: 'Visit 09:12', last: '09:12', result: 'Done' })
   })

   it('should say in process, queued, or no answer for a run that has not finished', () => {
      const running = (minutes: number, queued = false) =>
         facts('visit', {
            last: run('s1', '11:00', {
               status: 'IN_PROGRESS',
               verdict: null,
               finishedAt: null,
               queued,
               startedAt: new Date(NOW.getTime() - minutes * 60_000),
            }),
         })

      expect(itemState(running(5), ctx())).toMatchObject({ kind: 'RUNNING', text: 'Visit in process', tone: 'busy' })
      expect(itemState(running(5, true), ctx())).toMatchObject({ kind: 'WAITING', text: 'Visit queued' })
      expect(itemState(running(31), ctx())).toMatchObject({ kind: 'NO_ANSWER', tone: 'warn' })
   })

   it('should keep a failure until a later run works, with its time or how long ago, and the last good run', () => {
      const today = itemState(
         facts('login', {
            last: run('s2', '09:12', { status: 'FAILED', verdict: 'ERROR' }),
            lastOk: run('s1', '08:00', { startedAt: at('08:00', '25') }),
         }),
         ctx()
      )
      const old = itemState(
         facts('login', { last: run('s2', '09:12', { status: 'FAILED', startedAt: at('09:12', '24') }) }),
         ctx()
      )

      expect(today).toMatchObject({ kind: 'FAILED', tone: 'bad', text: 'Login failed 09:12', lastOkId: 's1' })
      expect(today.detail).toContain('Last good run: 25/10 08:00')
      expect(old).toMatchObject({ kind: 'FAILED', text: 'Login failed 3 days ago' })
   })

   it('should say unsure for a run that could not decide', () => {
      expect(itemState(facts('login', { last: run('s1', '09:12', { verdict: 'UNSURE' }) }), ctx())).toMatchObject({
         kind: 'UNSURE',
         tone: 'warn',
         text: 'Login unsure 09:12',
      })
   })
})

describe('itemState: the schedule', () => {
   it('should say pending for a time later today, and later for another day, neither as a warning', () => {
      const today = itemState(facts('network', { next: at('19:30') }), ctx())
      const tomorrow = itemState(facts('network', { next: at('09:05', '28') }), ctx())
      const further = itemState(facts('network', { next: at('09:05', '30') }), ctx())

      expect(today).toMatchObject({ kind: 'PENDING', tone: 'muted', text: 'Network 19:30', next: 'today 19:30' })
      expect(tomorrow).toMatchObject({ kind: 'LATER', tone: 'muted', text: 'Network tomorrow', next: 'tomorrow 09:05' })
      expect(further).toMatchObject({ kind: 'LATER', text: 'Network 30/10', next: '30/10 09:05' })
   })

   it('should say waiting to start, in amber, once the time has passed and nothing started', () => {
      expect(itemState(facts('visit', { next: at('11:00') }), ctx())).toMatchObject({
         kind: 'WAITING',
         tone: 'warn',
         text: 'Visit waiting to start',
      })
   })

   it('should say planned soon when no time was drawn yet', () => {
      expect(itemState(facts('network', { next: null }), ctx())).toMatchObject({
         kind: 'LATER',
         text: 'Network planned soon',
         next: 'planned soon',
      })
   })

   it("should judge today by the account's own day, not by UTC", () => {
      const late = new Date('2026-10-27T20:00:00Z')
      const lastRun = run('s1', '17:00')

      expect(itemState(facts('visit', { last: lastRun }), ctx({ now: late, zone: 'UTC' })).kind).toBe('DONE')
      expect(itemState(facts('visit', { last: lastRun }), ctx({ now: late, zone: 'Asia/Kolkata' })).kind).not.toBe(
         'DONE'
      )
   })
})

describe('itemState: the account', () => {
   it('should say paused for every item of a paused account that has not run today', () => {
      expect(itemState(facts('visit'), ctx({ status: 'DISABLED' }))).toMatchObject({
         kind: 'PAUSED',
         text: 'Visit paused',
         next: 'paused',
      })
   })

   it('should say what a new or signed-out account waits for', () => {
      const first = itemState(facts('login', { next: null }), ctx({ status: 'PENDING', lastVerifiedAt: null }))
      const other = itemState(facts('visit', { next: null }), ctx({ status: 'PENDING', lastVerifiedAt: null }))
      const stale = itemState(facts('network'), ctx({ lastVerifiedAt: at('02:00', '25') }))

      expect(first).toMatchObject({ kind: 'SIGN_IN', next: 'after the sign-in' })
      expect(first.detail).toContain('Press Test login first')
      expect(other).toMatchObject({ kind: 'SIGN_IN', text: 'Visit waiting for sign-in' })
      expect(stale.kind).toBe('SIGN_IN')
   })

   it('should still schedule the login check of an account in error', () => {
      const state = itemState(
         facts('login', { next: at('19:00') }),
         ctx({ status: 'ERROR', lastVerifiedAt: at('02:00', '25') })
      )

      expect(state.kind).toBe('PENDING')
   })

   it('should count a sign-in in the last 12 hours as the check', () => {
      expect(itemState(facts('login'), ctx({ lastVerifiedAt: at('09:30') }))).toMatchObject({
         kind: 'COUNTED',
         tone: 'ok',
         text: 'Login counted 09:30',
      })
   })
})

describe('itemState: messages', () => {
   it('should say on schedule with how long ago, and late only after a whole missed interval', () => {
      const read = (hours: number) =>
         facts('messages', {
            next: at('14:00'),
            last: run('s1', '10:00', { startedAt: new Date(NOW.getTime() - hours * 3_600_000) }),
         })

      expect(itemState(read(1.8), ctx())).toMatchObject({ kind: 'ON_SCHEDULE', text: 'Messages read 1 h 48 min ago' })
      expect(itemState(read(5), ctx())).toMatchObject({
         kind: 'LATE',
         tone: 'warn',
         text: 'Messages late: read 5 h ago',
      })
   })

   it('should never call the messages done today, and mention the first read in batches', () => {
      const state = itemState(
         facts('messages', { next: at('14:00'), last: run('s1', '11:00') }),
         ctx({ firstRead: true })
      )

      expect(state.kind).toBe('ON_SCHEDULE')
      expect(state.detail).toContain('first read')
   })
})

describe('progress', () => {
   const states = (patch: Partial<Context> = {}) => [
      itemState(facts('login', { last: run('l', '09:00') }), ctx(patch)),
      itemState(facts('visit', { next: at('18:00') }), ctx(patch)),
      itemState(facts('network', { next: at('19:30') }), ctx(patch)),
      itemState(facts('messages', { next: at('14:00'), last: run('m', '11:00') }), ctx(patch)),
   ]

   it('should count the checks that are done, messages on schedule included, and lead with a failure in the brief', () => {
      expect(checksDone(states())).toBe(2)
      expect(progressText(states())).toBe('2 of 4 checks done')
      expect(briefText(states())).toBe('2 of 4 checks done')
      expect(briefText([itemState(facts('login', { last: run('s', '09:12', { status: 'FAILED' }) }), ctx())])).toBe(
         'Login failed 09:12'
      )
   })

   it('should total the checks of the signed-in accounts and name the next planned item', () => {
      const progress = dayProgress(
         [
            { status: 'ACTIVE', states: states() },
            { status: 'ACTIVE', states: states() },
            { status: 'DISABLED', states: states({ status: 'DISABLED' }) },
         ],
         NOW
      )

      expect(progress).toMatchObject({ done: 4, total: 8, next: { item: 'messages' } })
      expect(progressSentence(progress, 'UTC')).toBe('4 of 8 checks done today. Next: messages 14:00.')
      expect(progressSentence(dayProgress([], NOW), 'UTC')).toBeNull()
   })
})

describe('overallTone', () => {
   const done = (item: ItemName) => itemState(facts(item, { last: run(item, '09:00') }), ctx())

   it('should be red for a failure, amber for a check that needs a look, green when all four are done, grey otherwise', () => {
      const all = [
         done('login'),
         done('visit'),
         done('network'),
         itemState(facts('messages', { last: run('m', '11:00') }), ctx()),
      ]
      const failed = itemState(facts('visit', { last: run('f', '09:12', { status: 'FAILED' }) }), ctx())
      const waiting = itemState(facts('visit', { next: at('11:00') }), ctx())

      expect(overallTone(all)).toBe('ok')
      expect(overallTone([...all.slice(0, 3), failed])).toBe('bad')
      expect(overallTone([...all.slice(0, 3), waiting])).toBe('warn')
      expect(overallTone([done('login'), itemState(facts('visit', { next: at('18:00') }), ctx())])).toBe('muted')
   })
})

describe('agoText', () => {
   it('should read as a person would say it', () => {
      expect(agoText(new Date(NOW.getTime() - 20_000), NOW)).toBe('just now')
      expect(agoText(new Date(NOW.getTime() - 20 * 60_000), NOW)).toBe('20 min ago')
      expect(agoText(new Date(NOW.getTime() - 110 * 60_000), NOW)).toBe('1 h 50 min ago')
      expect(agoText(new Date(NOW.getTime() - 3 * 86_400_000), NOW)).toBe('3 days ago')
   })
})
