import { describe, expect, it } from 'vitest'

import {
   type AccountSet,
   addSet,
   applySet,
   deleteSet,
   parseSets,
   renameSet,
   setMatching,
   updateSet,
} from './accountSets'

const ids = (() => {
   let next = 0

   return () => `s${(next += 1)}`
})()

describe('addSet', () => {
   it('should keep a named set of accounts, trimmed, without doubles', () => {
      const result = addSet([], '  Acme team ', ['a1', 'a2', 'a1'], ids)

      expect(result).toEqual({ ok: true, sets: [{ id: 's1', name: 'Acme team', accountIds: ['a1', 'a2'] }] })
   })

   it('should refuse an empty name, a name already used (in any case), no accounts, and too many sets', () => {
      const one: AccountSet[] = [{ id: 'x', name: 'Acme team', accountIds: ['a1'] }]

      expect(addSet(one, '   ', ['a1'], ids)).toEqual({ ok: false, reason: 'Give the set a name.' })
      expect(addSet(one, 'acme TEAM', ['a1'], ids)).toEqual({
         ok: false,
         reason: 'A set with this name already exists.',
      })
      expect(addSet(one, 'Other', [], ids)).toEqual({ ok: false, reason: 'Pick at least one account first.' })
      expect(
         addSet(
            Array.from({ length: 50 }, (_, index) => ({ id: `i${index}`, name: `S${index}`, accountIds: ['a1'] })),
            'More',
            ['a1'],
            ids
         )
      ).toEqual({
         ok: false,
         reason: 'You can keep up to 50 sets.',
      })
   })

   it('should cut a long name', () => {
      const result = addSet([], 'x'.repeat(80), ['a1'], ids)

      expect(result.ok && result.sets[0]?.name).toHaveLength(40)
   })
})

describe('renameSet, updateSet and deleteSet', () => {
   const sets: AccountSet[] = [
      { id: 'a', name: 'One', accountIds: ['a1'] },
      { id: 'b', name: 'Two', accountIds: ['a2'] },
   ]

   it('should rename a set, but not to the name of another', () => {
      expect(renameSet(sets, 'a', 'Uno')).toMatchObject({ ok: true })
      expect(renameSet(sets, 'a', 'two')).toEqual({ ok: false, reason: 'A set with this name already exists.' })
      expect(renameSet(sets, 'a', 'ONE')).toMatchObject({ ok: true })
   })

   it('should replace the accounts of a set, never with none', () => {
      expect(updateSet(sets, 'a', ['a3', 'a4'])).toMatchObject({ ok: true, sets: [{ accountIds: ['a3', 'a4'] }, {}] })
      expect(updateSet(sets, 'a', [])).toEqual({ ok: false, reason: 'Pick at least one account first.' })
   })

   it('should delete a set', () => {
      expect(deleteSet(sets, 'a')).toEqual([sets[1]])
   })
})

describe('applySet', () => {
   it('should select the accounts of the set that still exist, and count those that do not', () => {
      const known = new Set(['a1', 'a2'])

      expect(applySet({ id: 'x', name: 'n', accountIds: ['a1', 'a9', 'a2', 'a8'] }, known)).toEqual({
         selected: new Set(['a1', 'a2']),
         missing: 2,
      })
   })
})

describe('setMatching', () => {
   it('should find the set that is exactly the selection, in any order', () => {
      const sets: AccountSet[] = [
         { id: 'a', name: 'One', accountIds: ['a1', 'a2'] },
         { id: 'b', name: 'Two', accountIds: ['a3'] },
      ]

      expect(setMatching(sets, new Set(['a2', 'a1']))?.id).toBe('a')
      expect(setMatching(sets, new Set(['a1']))).toBeUndefined()
      expect(setMatching(sets, undefined)).toBeUndefined()
   })
})

describe('parseSets', () => {
   it('should read what was saved, and drop what is not a set', () => {
      expect(
         parseSets([
            { id: 'a', name: 'One', accountIds: ['a1', 'a1', 2] },
            { id: 'b', name: '', accountIds: ['a1'] },
            { id: 'c', name: 'Three' },
            'junk',
            null,
            { id: 'a', name: 'Dup id', accountIds: ['a1'] },
         ])
      ).toEqual([{ id: 'a', name: 'One', accountIds: ['a1'] }])
   })

   it('should give nothing for anything that is not a list', () => {
      expect(parseSets({ id: 'a' })).toEqual([])
      expect(parseSets(undefined)).toEqual([])
   })
})
