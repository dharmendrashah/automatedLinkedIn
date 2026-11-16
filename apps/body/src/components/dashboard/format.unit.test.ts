import { describe, expect, it } from 'vitest'

import type { Change, DashboardOverview } from '@automatedLinkedIn/contracts'

import {
   badgeOf,
   campaignStatusText,
   cardTextsOf,
   firstAttentionText,
   percentText,
   restingText,
   unavailableText,
} from './format'

const now = new Date('2026-11-15T12:00:00.000Z')

const cardsOf = (overrides: Partial<DashboardOverview['cards']> = {}): DashboardOverview['cards'] => ({
   pipeline: {
      totalUsd: null,
      replies: 0,
      replyChange: { kind: 'none' },
      campaignsWithReplies: 0,
      withReplyAndWorth: 0,
   },
   qualified: { current: 0, change: { kind: 'none' }, found: 0 },
   invites: { current: 0, change: { kind: 'none' }, accepted: 0, acceptRate: null },
   accounts: { active: 0, total: 0, needAttention: 0, roomToday: null, firstAttention: null },
   ...overrides,
})

describe('badgeOf', () => {
   it.each<[Change, { key: 'up' | 'down' | 'none'; text: string }]>([
      [
         { kind: 'percent', value: 12.5 },
         { key: 'up', text: '+12.5%' },
      ],
      [
         { kind: 'percent', value: -20 },
         { key: 'down', text: '-20.0%' },
      ],
      [
         { kind: 'percent', value: 166.7 },
         { key: 'up', text: '+166.7%' },
      ],
      [{ kind: 'new' }, { key: 'none', text: 'New' }],
      [{ kind: 'none' }, { key: 'none', text: '' }],
   ])('should write %j', (change, expected) => {
      expect(badgeOf(change)).toEqual(expected)
   })
})

describe('percentText', () => {
   it('should write a dash for null and the asked digits otherwise', () => {
      expect(percentText(null, 1)).toBe('—')
      expect(percentText(0.4567, 1)).toBe('45.7%')
      expect(percentText(0.4567, 0)).toBe('46%')
      expect(percentText(0, 1)).toBe('0.0%')
   })
})

describe('cardTextsOf', () => {
   it('should write dashes and zeros for an empty owner, and invent nothing', () => {
      expect(cardTextsOf(cardsOf(), now)).toEqual({
         pipeline: {
            big: 'No worth set',
            line1: '0 positive replies',
            line2: 'Replies x monthly worth x 12',
            badge: null,
         },
         qualified: { big: '0', line1: 'Found 0, qualified 0', line2: '— qualified', badge: null },
         invites: {
            big: '0',
            line1: 'Accepted per invite sent: —',
            line2: 'Accepted: 0',
            badge: null,
         },
         accounts: {
            big: '0 of 0',
            line1: 'Invite room today: —',
            line2: 'No account yet',
            badge: null,
         },
      })
   })

   it('should write a full owner', () => {
      const cards = cardsOf({
         pipeline: {
            totalUsd: 12000,
            replies: 5,
            replyChange: { kind: 'percent', value: 200 },
            campaignsWithReplies: 2,
            withReplyAndWorth: 1,
         },
         qualified: { current: 30, change: { kind: 'none' }, found: 69 },
         invites: { current: 120, change: { kind: 'new' }, accepted: 18, acceptRate: 0.15 },
         accounts: {
            active: 3,
            total: 4,
            needAttention: 1,
            roomToday: 22,
            firstAttention: { kind: 'resting', name: 'Ana', until: '2026-11-15T18:30:00.000Z' },
         },
      })

      expect(cardTextsOf(cards, now)).toEqual({
         pipeline: {
            big: '$12,000',
            line1: '5 positive replies',
            line2: 'Worth set in 1 of 2 campaigns',
            badge: null,
         },
         qualified: { big: '30', line1: 'Found 69, qualified 30', line2: '43.5% qualified', badge: null },
         invites: {
            big: '120',
            line1: 'Accepted per invite sent: 15%',
            line2: 'Accepted: 18',
            badge: null,
         },
         accounts: {
            big: '3 of 4',
            line1: 'Invite room today: 22',
            line2: 'Ana is resting until 18:30 UTC',
            badge: '1 needs attention',
         },
      })
   })

   it('should write $0 when a worth is set and nothing was counted', () => {
      const { pipeline } = cardTextsOf(cardsOf({ pipeline: { ...cardsOf().pipeline, totalUsd: 0 } }), now)

      expect(pipeline.big).toBe('$0')
   })

   it.each([
      [{ active: 2, total: 2, needAttention: 0 }, 'All clear', 'No account needs you'],
      [{ active: 2, total: 5, needAttention: 3 }, '3 need attention', 'No account needs you'],
      [{ active: 0, total: 2, needAttention: 0 }, null, 'No account is active'],
      [{ active: 0, total: 0, needAttention: 0 }, null, 'No account yet'],
   ])('should write the accounts badge and line for %j', (counts, badge, line2) => {
      const accounts = { ...cardsOf().accounts, ...counts }
      const text = cardTextsOf(cardsOf({ accounts }), now).accounts

      expect(text.badge).toBe(badge)
      expect(text.line2).toBe(line2)
   })
})

describe('unavailableText', () => {
   it('should list the words in the fixed order, once each', () => {
      expect(unavailableText(['waiting', 'drafts', 'status', 'waiting', 'runs'])).toBe(
         'Some figures could not be loaded: campaign status, drafts, recent runs, waiting counts.'
      )
   })

   it('should name every key', () => {
      expect(unavailableText(['status', 'wallet', 'replies', 'drafts', 'alerts', 'runs', 'room', 'waiting'])).toBe(
         'Some figures could not be loaded: campaign status, wallet check, reply counts, drafts, failed runs, recent runs, invite room, waiting counts.'
      )
   })

   it('should write nothing when all loaded', () => {
      expect(unavailableText([])).toBe('')
   })
})

describe('campaignStatusText', () => {
   it('should write one word per status', () => {
      expect(campaignStatusText('none')).toBe('—')
      expect(campaignStatusText('tooEarly')).toBe('Too early')
      expect(campaignStatusText('needsYou')).toBe('Needs you')
      expect(campaignStatusText('onHold')).toBe('On hold')
      expect(campaignStatusText('onTrack')).toBe('No blocker')
   })
})

describe('restingText', () => {
   it('should write a time for a timed stop, within a day and beyond', () => {
      expect(restingText('timed', '2026-11-15T18:30:00.000Z', now)).toBe('Resting until 18:30 UTC')
      expect(restingText('timed', '2026-11-20T09:05:00.000Z', now)).toBe('Resting until 20 Nov 09:05 UTC')
   })

   it('should write the next sign-in for an open-ended stop and Active for none', () => {
      expect(restingText('openEnded', null, now)).toBe('Resting until the next sign-in')
      expect(restingText('none', null, now)).toBe('Active')
   })

   it('should not invent a time for a timed stop without one', () => {
      expect(restingText('timed', null, now)).toBe('Resting')
   })
})

describe('firstAttentionText', () => {
   it('should write each kind', () => {
      expect(firstAttentionText({ kind: 'needsYou', name: 'Ana', until: null }, now)).toBe('Ana needs you')
      expect(firstAttentionText({ kind: 'check', name: 'Ana', until: null }, now)).toBe('Ana needs a look')
      expect(firstAttentionText({ kind: 'resting', name: 'Ana', until: '2026-11-20T09:05:00.000Z' }, now)).toBe(
         'Ana is resting until 20 Nov 09:05 UTC'
      )
   })

   it('should not invent a time for a resting account without one', () => {
      expect(firstAttentionText({ kind: 'resting', name: 'Ana', until: null }, now)).toBe('Ana is resting')
   })
})
