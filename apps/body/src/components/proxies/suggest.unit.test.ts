import { describe, expect, it } from 'vitest'

import { readinessOf } from './readiness'
import { suggest } from './suggest'
import { makeProxy } from './testing'

const watch = (issue: string, extra: Record<string, unknown> = {}) =>
   makeProxy({
      health: {
         level: 'WATCH',
         issues: [issue],
         open: [issue],
      },
      ...extra,
   })

const risk = (issue: string, extra: Record<string, unknown> = {}) =>
   makeProxy({
      health: {
         level: 'RISK',
         issues: [issue],
         open: [issue],
      },
      ...extra,
   })

const kinds = (proxy: ReturnType<typeof makeProxy>, siblings: ReturnType<typeof makeProxy>[] = []) =>
   suggest(proxy, siblings).actions.map(action => action.kind)

describe('suggest', () => {
   it('should say a healthy proxy needs nothing, with no buttons', () => {
      expect(suggest(makeProxy(), [])).toEqual({
         text: 'Healthy and in use. Nothing to do.',
         actions: [],
      })
      expect(suggest(makeProxy({ isBest: false }), []).text).toContain('backup')
   })

   it('should wait for a proxy that is being checked', () => {
      const checking = makeProxy({
         health: {
            level: 'CHECKING',
            issues: [],
            open: [],
         },
      })

      expect(suggest(checking, []).actions).toEqual([])
   })

   it('should suggest swapping a problem proxy that is in use, and still allow keeping it', () => {
      expect(kinds(watch('SLOW'))).toEqual(['replace', 'accept'])
      expect(suggest(risk('BLACKLISTED'), []).text).toContain('We suggest swapping it')
      expect(suggest(risk('BLACKLISTED'), []).text).toContain('keep using it')
      expect(suggest(watch('SLOW'), []).text).toContain('You can keep using it')
   })

   it('should offer to use a healthier proxy of the same account first', () => {
      const other = makeProxy({
         id: 'p2',
         isBest: false,
         score: 97,
      })
      const { actions } = suggest(risk('BLACKLISTED'), [other])

      expect(actions.map(action => action.kind)).toEqual(['use-instead', 'replace', 'accept'])
      expect(actions[0]).toEqual({
         kind: 'use-instead',
         target: other,
      })
   })

   it('should pick the best scored healthy proxy to use instead, and never an unhealthy one', () => {
      const lower = makeProxy({ id: 'p2', isBest: false, score: 91 })
      const higher = makeProxy({ id: 'p3', isBest: false, score: 98 })
      const unhealthy = watch('SLOW', { id: 'p4', isBest: false, score: 99 })
      const [first] = suggest(risk('BLACKLISTED'), [lower, higher, unhealthy]).actions

      expect(first).toMatchObject({
         kind: 'use-instead',
         target: { id: 'p3' },
      })
   })

   it('should calm down about a problem proxy that is not in use because a better one covers the account', () => {
      const covering = makeProxy({ id: 'p2' })
      const backup = risk('BLACKLISTED', { isBest: false })

      expect(suggest(backup, [covering]).text).toContain('Not being used right now')
      expect(kinds(backup, [covering])).toEqual(['replace', 'accept'])
   })

   it('should offer to test, edit or replace a proxy that does not respond, and never to keep using it', () => {
      const down = risk('NOT_RESPONDING', {
         status: 'UNREACHABLE',
         isBest: false,
      })

      expect(kinds(down)).toEqual(['test', 'edit', 'replace'])
      expect(suggest(down, [makeProxy({ id: 'p2' })]).text).toContain('another proxy is being used instead')
   })

   it('should show an accepted risk with an undo and the problems accepted', () => {
      const accepted = makeProxy({
         health: {
            level: 'ACCEPTED',
            issues: ['BLACKLISTED', 'SLOW'],
            open: [],
         },
      })
      const { text, actions } = suggest(accepted, [])

      expect(actions).toEqual([{ kind: 'undo-accept' }])
      expect(text).toContain('its address is blacklisted, it is slow')
   })
})

describe('readinessOf', () => {
   it('should say an account with no proxy cannot run yet', () => {
      expect(readinessOf([])).toMatchObject({
         tone: 'warning',
         label: 'No proxy yet',
      })
   })

   it('should say an account is ready, through which proxy, and suggest a backup when it has only one', () => {
      expect(readinessOf([makeProxy()])).toMatchObject({
         tone: 'success',
         label: 'Ready',
         text: 'LinkedIn will be opened through 203.0.113.9:8080.',
         note: expect.stringContaining('backup'),
      })
      expect(readinessOf([makeProxy(), makeProxy({ id: 'p2', isBest: false })]).note).toBeUndefined()
   })

   it('should follow the proxy in use: could be safer, or at risk', () => {
      expect(readinessOf([watch('SLOW')])).toMatchObject({
         tone: 'warning',
         label: 'Works, could be safer',
      })
      expect(readinessOf([risk('BLACKLISTED')])).toMatchObject({
         tone: 'danger',
         label: 'At risk',
      })
   })

   it('should say no proxy works when none is in use, unless one is being checked', () => {
      const down = risk('NOT_RESPONDING', { status: 'UNREACHABLE', isBest: false })

      expect(readinessOf([down])).toMatchObject({
         tone: 'danger',
         label: 'No working proxy',
      })
      expect(
         readinessOf([
            makeProxy({
               isBest: false,
               health: {
                  level: 'CHECKING',
                  issues: [],
                  open: [],
               },
            }),
         ]).label
      ).toBe('Checking')
   })
})
