import { describe, expect, it } from 'vitest'

import { changeView, clientFor, clientView, listsRedirect, pickedList, readView, showClientPicker } from './address'

describe('readView', () => {
   it('reads the filters and falls back on Needs me', () => {
      expect(readView(new URLSearchParams('client=c1&tab=waiting&found=list:l1&fit=strong&q= ana &new=1'))).toEqual({
         client: 'c1',
         tab: 'WAITING',
         found: 'list:l1',
         fit: 'STRONG',
         label: undefined,
         q: 'ana',
         onlyNew: true,
         open: null,
      })
      expect(readView(new URLSearchParams('tab=nope&fit=great'))).toMatchObject({
         tab: 'NEEDS_ME',
         fit: undefined,
      })
   })
})

describe('changeView', () => {
   it('sets keys and removes empty ones, and a new client drops the filters', () => {
      const params = changeView(new URLSearchParams('found=target&q=x'), {
         tab: 'EVERYONE',
         q: '',
      })

      expect(params.toString()).toBe('found=target&tab=everyone')
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
