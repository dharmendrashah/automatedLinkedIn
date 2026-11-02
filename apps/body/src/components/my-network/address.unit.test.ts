import { describe, expect, it } from 'vitest'

import { changeView, listsRedirect, pickedList, readView, sortParam } from './address'

describe('readView', () => {
   it('reads the filters, ignores an old client and falls back on Everyone', () => {
      expect(readView(new URLSearchParams('client=c1&tab=waiting&found=list:l1&fit=strong&q= ana &new=1'))).toEqual({
         tab: 'WAITING',
         found: 'list:l1',
         fit: 'STRONG',
         label: undefined,
         q: 'ana',
         onlyNew: true,
         open: null,
         sort: undefined,
      })
      expect(readView(new URLSearchParams('tab=nope&fit=great'))).toMatchObject({
         tab: 'EVERYONE',
         fit: undefined,
      })
   })

   it('reads a sort, and ignores a sort it does not know', () => {
      const view = readView(new URLSearchParams('sort=-lastTouchAt'))

      expect(view.sort).toEqual({
         by: 'lastTouchAt',
         desc: true,
      })
      expect(sortParam(view.sort)).toBe('-lastTouchAt')
      expect(readView(new URLSearchParams('sort=salary')).sort).toBeUndefined()
   })
})

describe('changeView', () => {
   it('sets keys and removes empty ones', () => {
      const params = changeView(new URLSearchParams('found=target&q=x&filters={}&sort=name'), {
         tab: 'EVERYONE',
         q: '',
      })

      expect(params.get('tab')).toBe('everyone')
      expect(params.toString()).toBe('found=target&filters=%7B%7D&sort=name&tab=everyone')
   })
})

describe('pickedList', () => {
   it('finds the list Found by points at, and nothing for other sources', () => {
      const lists = [{ id: 'l1' }]

      expect(pickedList('list:l1', lists)).toEqual({ id: 'l1' })
      expect(pickedList('list:gone', lists)).toBeUndefined()
      expect(pickedList('connection', lists)).toBeUndefined()
      expect(pickedList(undefined, lists)).toBeUndefined()
   })
})

describe('listsRedirect', () => {
   it('turns a list into Found by that list', () => {
      expect(listsRedirect('?list=l1')).toBe('/network?found=list%3Al1')
      expect(listsRedirect('')).toBe('/network')
   })
})
