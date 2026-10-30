import { describe, expect, it } from 'vitest'

import { UNREACHABLE_MESSAGE, bannerText, checkedText, groupModules, stateLabel, unreachableModules } from './describe'

const module = (key: string, group: string, status: 'live' | 'dead' | 'unknown') => ({
   key,
   group,
   name: key,
   description: '',
   status,
})

describe('bannerText', () => {
   it('should say everything is live when it is', () => {
      expect(bannerText('live', [module('a', 'g', 'live'), module('b', 'g', 'live')])).toBe('Everything is live.')
   })

   it.each([
      [[module('a', 'g', 'dead'), module('b', 'g', 'live')], '1 of 2 modules is dead.'],
      [[module('a', 'g', 'dead'), module('b', 'g', 'dead'), module('c', 'g', 'live')], '2 of 3 modules are dead.'],
      [[module('a', 'g', 'dead'), module('b', 'g', 'unknown')], '1 of 2 modules is dead.'],
   ])('should count the dead modules', (modules, text) => {
      expect(bannerText('dead', modules)).toBe(text)
   })

   it('should say some could not be checked when none is dead but some are unknown', () => {
      expect(bannerText('unknown', [module('a', 'g', 'live'), module('b', 'g', 'unknown')])).toBe(
         '1 of 2 modules could not be checked.'
      )
   })
})

describe('stateLabel', () => {
   it('should use the words the page promises', () => {
      expect(stateLabel('live')).toBe('Live')
      expect(stateLabel('dead')).toBe('Dead')
      expect(stateLabel('unknown')).toBe('Unknown')
   })
})

describe('groupModules', () => {
   it('should keep the groups and the modules in the order brain sent them', () => {
      expect(
         groupModules([
            module('a', 'The app', 'live'),
            module('b', 'Sign-in', 'live'),
            module('c', 'The app', 'dead'),
         ]).map(({ group, modules }) => [group, modules.map(item => item.key)])
      ).toEqual([
         ['The app', ['a', 'c']],
         ['Sign-in', ['b']],
      ])
   })

   it('should give nothing for nothing', () => {
      expect(groupModules([])).toEqual([])
   })
})

describe('checkedText', () => {
   const now = Date.parse('2026-10-12T12:00:30.000Z')

   it.each([
      ['2026-10-12T12:00:28.000Z', 'Checked just now'],
      ['2026-10-12T12:00:20.000Z', 'Checked 10 seconds ago'],
      ['2026-10-12T11:58:30.000Z', 'Checked 2 minutes ago'],
      ['2026-10-12T11:59:29.000Z', 'Checked 1 minute ago'],
   ])('should show %s as %s', (iso, text) => {
      expect(checkedText(iso, now)).toBe(text)
   })
})

describe('unreachableModules', () => {
   it('should show the website as live, since the page loaded, and the API as dead', () => {
      expect(unreachableModules.map(item => [item.key, item.status])).toEqual([
         ['website', 'live'],
         ['api', 'dead'],
      ])
      expect(UNREACHABLE_MESSAGE).toBe('The API is not answering, so the other modules cannot be checked.')
   })
})
