import { describe, expect, it } from 'vitest'

import {
   changeView,
   clientFor,
   clientView,
   listsRedirect,
   pickedList,
   readView,
   showClientPicker,
   sortParam,
} from './address'

describe('readView', () => {
   it('reads the filters and falls back on Everyone', () => {
      expect(readView(new URLSearchParams('client=c1&tab=waiting&found=list:l1&fit=strong&q= ana &new=1'))).toEqual({
         client: 'c1',
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
   it('sets keys and removes empty ones, and a new client drops the filters', () => {
      const params = changeView(new URLSearchParams('found=target&q=x&filters={}&sort=name'), {
         tab: 'EVERYONE',
         q: '',
      })

      expect(params.get('tab')).toBe('everyone')
      expect(changeView(params, clientView('c2')).toString()).toBe('tab=everyone&client=c2')
   })
})

describe('clientFor', () => {
   it('picks the asked client, else the account owner, else the first', () => {
      const clients = [
         {
            id: 'c1',
            accounts: [],
         },
         {
            id: 'c2',
            accounts: [{ id: 'a2' }],
         },
      ]

      expect(clientFor(clients, 'c1', 'a2')?.id).toBe('c1')
      expect(clientFor(clients, null, 'a2')?.id).toBe('c2')
      expect(clientFor(clients, 'gone', undefined)?.id).toBe('c1')
   })
})

describe('showClientPicker', () => {
   it('shows with several clients or several accounts to split', () => {
      expect(showClientPicker([{ accounts: ['a1'] }])).toBe(false)
      expect(showClientPicker([{ accounts: ['a1', 'a2'] }])).toBe(true)
      expect(showClientPicker([{ accounts: [] }, { accounts: [] }])).toBe(true)
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
