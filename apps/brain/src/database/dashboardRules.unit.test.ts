import { describe, expect, it } from 'vitest'

import { LinkedInAccountStatus, WorkflowRunStatus } from 'generated/prisma/enums'

import {
   ACCOUNT_STATUSES,
   type CampaignCounts,
   type CampaignListRow,
   type CampaignListState,
   type CampaignProjectionHidden,
   RUN_STATUSES,
} from '@automatedLinkedIn/contracts'

import {
   type CampaignAttentionInput,
   type RunInput,
   type SeriesWindows,
   type WorkflowInput,
   accountAttentionOf,
   accountRowsOf,
   attentionOf,
   campaignRowsOf,
   campaignStatusOf,
   cardsOf,
   ownerSeries,
   runRowsOf,
} from './dashboardRules'
import type { AccountHealth } from './fleetHealth.service'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-15T12:00:00.000Z')
// The latest complete day: today minus 2.
const END = '2026-11-13'
const dayAt = (back: number) => new Date(Date.parse(END) - back * DAY_MS).toISOString().slice(0, 10)
const createdBack = (back: number) => new Date(`${dayAt(back)}T08:00:00.000Z`)

const counts = (patch: Partial<CampaignCounts> = {}): CampaignCounts => ({
   found: 0,
   qualified: 0,
   invited: 0,
   accepted: 0,
   messaged: 0,
   replied: 0,
   ...patch,
})

// A row for each day from `from` days back to `to` days back (`to` 0 is the end).
const daysBack = (from: number, to: number, patch: Partial<CampaignCounts>, skip: number[] = []) =>
   new Map<string, CampaignCounts>(
      Array.from({ length: from - to + 1 }, (_, index) => from - index)
         .filter(back => !skip.includes(back))
         .map(back => [dayAt(back), counts(patch)])
   )

const PER_DAY = {
   found: 2,
   qualified: 1,
   invited: 1,
   accepted: 0,
}

// An old campaign with a row on every complete day of the 90 and more.
const old = (id: string, skip: number[] = []) => ({
   campaign: {
      id,
      createdAt: createdBack(100),
   },
   first: dayAt(89),
   rows: daysBack(89, 0, PER_DAY, skip),
})

const seriesOf = (...inputs: Array<ReturnType<typeof old>>) =>
   ownerSeries({
      campaigns: inputs.map(({ campaign }) => campaign),
      firstDays: new Map(inputs.map(({ campaign, first }) => [campaign.id, first])),
      rows: new Map(inputs.map(({ campaign, rows }) => [campaign.id, rows])),
      now: NOW,
   })

const totals = (found: number, qualified: number, invited: number, accepted: number) => ({
   found,
   qualified,
   invited,
   accepted,
})

describe('ownerSeries', () => {
   it('should give 90 complete days ending at the cutoff, and nothing for an owner with no campaign', () => {
      const { series, windows, perCampaign } = ownerSeries({
         campaigns: [],
         firstDays: new Map(),
         rows: new Map(),
         now: NOW,
      })

      expect(series).toHaveLength(90)
      expect(series[0].day).toBe(dayAt(89))
      expect(series[89].day).toBe(END)
      expect(series.every(day => day.counted === 0 && day.campaigns === 0 && day.found === null)).toBe(true)
      expect(windows).toEqual({
         total: {
            current: totals(0, 0, 0, 0),
            previous: totals(0, 0, 0, 0),
         },
         covered: {
            current: totals(0, 0, 0, 0),
            previous: totals(0, 0, 0, 0),
         },
         coveredIds: [],
      })
      expect(perCampaign.size).toBe(0)
   })

   it('should sum the counted days of the two windows and cover a campaign with 60 days of history', () => {
      const { series, windows, perCampaign } = seriesOf(old('a'))

      expect(series[89]).toEqual({
         day: END,
         counted: 1,
         campaigns: 1,
         found: 2,
         qualified: 1,
         invited: 1,
         accepted: 0,
      })
      expect(windows.total).toEqual({
         current: totals(60, 30, 30, 0),
         previous: totals(60, 30, 30, 0),
      })
      expect(windows.covered).toEqual(windows.total)
      expect(windows.coveredIds).toEqual(['a'])
      expect(perCampaign.get('a')).toEqual({
         qualified: 30,
         invited: 30,
      })
   })

   it('should show a day no campaign counted as a gap, and leave that campaign out of the covered values', () => {
      const { series, windows, perCampaign } = seriesOf(old('a', [5]))
      const gap = series.find(({ day }) => day === dayAt(5))

      expect(gap).toEqual({
         day: dayAt(5),
         counted: 0,
         campaigns: 1,
         found: null,
         qualified: null,
         invited: null,
         accepted: null,
      })
      expect(windows.total.current).toEqual(totals(58, 29, 29, 0))
      expect(windows.coveredIds).toEqual([])
      expect(windows.covered.current).toEqual(totals(0, 0, 0, 0))
      expect(perCampaign.get('a')).toEqual({
         qualified: 29,
         invited: 29,
      })
   })

   it('should count a day one campaign is missing as partial: counted below campaigns', () => {
      const { series } = seriesOf(old('a'), old('b', [3]))
      const partial = series.find(({ day }) => day === dayAt(3))

      expect(partial).toMatchObject({
         counted: 1,
         campaigns: 2,
         found: 2,
      })
      expect(series.find(({ day }) => day === dayAt(2))).toMatchObject({
         counted: 2,
         campaigns: 2,
         found: 4,
      })
   })

   it('should not expect a campaign before its first day, so older days are not partial', () => {
      const young = {
         campaign: {
            id: 'y',
            createdAt: createdBack(1),
         },
         first: dayAt(1),
         rows: daysBack(1, 0, PER_DAY),
      }
      const { series, windows } = seriesOf(old('a'), young)

      expect(series.find(({ day }) => day === dayAt(10))).toMatchObject({
         counted: 1,
         campaigns: 1,
      })
      expect(series.find(({ day }) => day === dayAt(1))).toMatchObject({
         counted: 2,
         campaigns: 2,
      })
      expect(windows.coveredIds).toEqual(['a'])
      expect(windows.total.current).toEqual(totals(64, 32, 32, 0))
      expect(windows.covered.current).toEqual(totals(60, 30, 30, 0))
   })

   it('should add nothing for a campaign with no rows, and give it null sums', () => {
      const none = {
         campaign: {
            id: 'n',
            createdAt: createdBack(20),
         },
         first: null,
         rows: new Map<string, CampaignCounts>(),
      }
      const { series, windows, perCampaign } = ownerSeries({
         campaigns: [none.campaign],
         firstDays: new Map([['n', null]]),
         rows: new Map(),
         now: NOW,
      })

      expect(series.every(({ campaigns, counted }) => campaigns === 0 && counted === 0)).toBe(true)
      expect(windows.coveredIds).toEqual([])
      expect(perCampaign.get('n')).toEqual({
         qualified: null,
         invited: null,
      })
      expect(perCampaign.has('absent')).toBe(false)
   })

   it('should cover a campaign whose history starts on the first day of the previous window, and not one day later', () => {
      const from = (back: number) => ({
         campaign: {
            id: `c${back}`,
            createdAt: createdBack(back + 5),
         },
         first: dayAt(back),
         rows: daysBack(back, 0, PER_DAY),
      })

      expect(seriesOf(from(59)).windows.coveredIds).toEqual(['c59'])
      expect(seriesOf(from(58)).windows.coveredIds).toEqual([])
   })

   it('should start counting at the creation day when the first row is older than the campaign', () => {
      const moved = {
         campaign: {
            id: 'm',
            createdAt: createdBack(10),
         },
         first: dayAt(80),
         rows: daysBack(80, 0, PER_DAY),
      }
      const { windows, series } = seriesOf(moved)

      expect(series.find(({ day }) => day === dayAt(11))).toMatchObject({
         counted: 0,
         campaigns: 0,
      })
      expect(windows.total.current.found).toBe(22)
      expect(windows.coveredIds).toEqual([])
   })
})

describe('campaignStatusOf', () => {
   const status = (state: CampaignListState, hiddenReason: CampaignProjectionHidden | null, projectionKnown = true) =>
      campaignStatusOf({
         state,
         hiddenReason,
         projectionKnown,
      })

   it('should have no status for a campaign that is not running', () => {
      for (const state of ['NO_WORKFLOWS', 'NOT_STARTED', 'PAUSED'] as const) {
         expect(status(state, 'tooEarly')).toBe('none')
         expect(status(state, null)).toBe('none')
      }
   })

   it('should name the blocker of a running campaign by the reason its projection is hidden', () => {
      expect(status('RUNNING', 'tooEarly')).toBe('tooEarly')
      expect(status('RUNNING', 'noAccounts')).toBe('needsYou')
      expect(status('RUNNING', 'zeroCap')).toBe('needsYou')
      expect(status('RUNNING', 'walletLow')).toBe('onHold')
      expect(status('RUNNING', null)).toBe('onTrack')
      expect(status('RUNNING', 'paused')).toBe('none')
   })

   it('should know nothing that depends on the projection when it is unknown, but keep too early', () => {
      expect(status('RUNNING', 'tooEarly', false)).toBe('tooEarly')

      for (const reason of ['noAccounts', 'zeroCap', 'walletLow', null] as const) {
         expect(status('RUNNING', reason, false)).toBe('none')
      }
   })
})

const account = (patch: Partial<AccountHealth> = {}): AccountHealth => ({
   accountId: 'a1',
   name: 'Ada',
   email: 'ada@example.com',
   status: 'ACTIVE',
   createdAt: createdBack(100),
   statusUpdatedAt: createdBack(50),
   health: 'HEALTHY',
   reasons: [],
   invites: {
      limit: 20,
      used: 5,
   },
   pending: {
      count: 3,
      share: 0.1,
   },
   invitedLast14: 0,
   acceptedLast14: 0,
   invitesStopped: false,
   engageStopped: false,
   stopOpenEnded: false,
   stopUntil: null,
   stopAt: null,
   ...patch,
})

const STOP_AT = new Date('2026-11-15T09:00:00.000Z')
const STOP_UNTIL = new Date('2026-11-15T15:00:00.000Z')
const timed = {
   invitesStopped: true,
   stopAt: STOP_AT,
   stopUntil: STOP_UNTIL,
}
const openEnded = {
   invitesStopped: true,
   stopOpenEnded: true,
   stopAt: STOP_AT,
}
const warning = {
   health: 'WARNING' as const,
   reasons: ['Fewer people accept than before.'],
}

describe('accountAttentionOf', () => {
   it('should leave an active, healthy account and the accounts the owner did not lose alone', () => {
      expect(accountAttentionOf({ account: account() })).toBeNull()
      expect(
         accountAttentionOf({
            account: account({
               status: 'PENDING',
               ...warning,
            }),
         })
      ).toBeNull()
      expect(
         accountAttentionOf({
            account: account({
               status: 'DISABLED',
               health: 'PAUSED',
            }),
         })
      ).toBeNull()
   })

   it('should call a signed-out, errored or blocked account high, dated by its status change', () => {
      for (const status of ['NEEDS_REAUTH', 'ERROR', 'BLOCKED'] as const) {
         expect(accountAttentionOf({ account: account({ status }) })).toEqual({
            rule: 'account-signed-out',
            severity: 'high',
            at: createdBack(50),
         })
      }
   })

   it('should call a timed stop medium and an open-ended stop of invites high', () => {
      expect(accountAttentionOf({ account: account(timed) })).toEqual({
         rule: 'account-resting',
         severity: 'medium',
         at: STOP_AT,
      })
      expect(accountAttentionOf({ account: account(openEnded) })).toEqual({
         rule: 'account-resting',
         severity: 'high',
         at: STOP_AT,
      })
   })

   it('should call an engagement-only stop medium, even when it has no end', () => {
      expect(
         accountAttentionOf({
            account: account({
               engageStopped: true,
               stopOpenEnded: true,
               stopAt: STOP_AT,
            }),
         })
      ).toMatchObject({
         rule: 'account-resting',
         severity: 'medium',
      })
   })

   it('should call a not healthy word without a stop medium, with no known start', () => {
      expect(accountAttentionOf({ account: account(warning) })).toEqual({
         rule: 'account-health',
         severity: 'medium',
         at: null,
      })
   })
})

describe('accountRowsOf', () => {
   it('should answer zeros and no sentence for an owner with no account', () => {
      expect(
         accountRowsOf({
            accounts: [],
            room: new Map(),
         })
      ).toEqual({
         rows: [],
         card: {
            active: 0,
            total: 0,
            needAttention: 0,
            roomToday: 0,
            firstAttention: null,
         },
      })
   })

   it('should shape a row, with the rest only for an active account and the accept rate of the 14 days', () => {
      const { rows } = accountRowsOf({
         accounts: [
            account({
               ...timed,
               invitedLast14: 40,
               acceptedLast14: 10,
            }),
            account({
               accountId: 'a2',
               name: 'Bo',
               email: 'bo@example.com',
               ...openEnded,
            }),
            account({
               accountId: 'a3',
               status: 'NEEDS_REAUTH',
               ...timed,
            }),
         ],
         room: null,
      })

      expect(rows[0]).toEqual({
         id: 'a1',
         name: 'Ada',
         email: 'ada@example.com',
         status: 'ACTIVE',
         rest: 'timed',
         until: STOP_UNTIL.toISOString(),
         invitesUsed: 5,
         invitesLimit: 20,
         acceptRate: 0.25,
         pending: 3,
      })
      expect(rows[1]).toMatchObject({
         rest: 'openEnded',
         until: null,
         acceptRate: null,
      })
      expect(rows[2]).toMatchObject({
         status: 'NEEDS_REAUTH',
         rest: 'none',
         until: null,
      })
   })

   it('should count the active accounts, and put only the three account rules into K', () => {
      const { card } = accountRowsOf({
         accounts: [
            account({ accountId: 'ok' }),
            account({
               accountId: 'pending',
               status: 'PENDING',
            }),
            account({
               accountId: 'disabled',
               status: 'DISABLED',
            }),
            account({
               accountId: 'reauth',
               status: 'NEEDS_REAUTH',
            }),
            account({
               accountId: 'rest',
               ...timed,
            }),
            account({
               accountId: 'warn',
               ...warning,
            }),
         ],
         room: null,
      })

      expect(card).toMatchObject({
         active: 3,
         total: 6,
         needAttention: 3,
         roomToday: null,
      })
   })

   it('should sum the room of active accounts whose invites are not stopped, and keep an engagement-only stop', () => {
      const { card } = accountRowsOf({
         accounts: [
            account({ accountId: 'a' }),
            account({
               accountId: 'engage',
               engageStopped: true,
               stopOpenEnded: true,
               stopAt: STOP_AT,
            }),
            account({
               accountId: 'stopped',
               ...timed,
            }),
            account({
               accountId: 'out',
               status: 'NEEDS_REAUTH',
            }),
            account({ accountId: 'no-room-entry' }),
         ],
         room: new Map([
            ['a', 5],
            ['engage', 4],
            ['stopped', 7],
            ['out', 9],
         ]),
      })

      expect(card.roomToday).toBe(9)
   })

   describe('first attention', () => {
      const first = (accounts: AccountHealth[]) =>
         accountRowsOf({
            accounts,
            room: null,
         }).card.firstAttention

      it('should prefer a high account over an earlier timed stop', () => {
         expect(
            first([
               account({
                  accountId: 'rest',
                  name: 'Ada',
                  ...timed,
               }),
               account({
                  accountId: 'out',
                  name: 'Bo',
                  status: 'ERROR',
               }),
            ])
         ).toEqual({
            kind: 'needsYou',
            name: 'Bo',
            until: null,
         })
      })

      it('should call an open-ended stop of invites needs you', () => {
         expect(first([account(openEnded)])).toEqual({
            kind: 'needsYou',
            name: 'Ada',
            until: null,
         })
      })

      it('should call the first timed stop resting, with its end, before a warning', () => {
         expect(
            first([
               account({
                  name: 'Warned',
                  ...warning,
               }),
               account({
                  name: 'Rests',
                  accountId: 'r',
                  ...timed,
               }),
            ])
         ).toEqual({
            kind: 'resting',
            name: 'Rests',
            until: STOP_UNTIL.toISOString(),
         })
      })

      it('should call any other account that needs attention a look, and give null when none does', () => {
         expect(
            first([
               account({ accountId: 'ok' }),
               account({
                  name: 'Warned',
                  accountId: 'w',
                  ...warning,
               }),
            ])
         ).toEqual({
            kind: 'check',
            name: 'Warned',
            until: null,
         })
         expect(
            first([
               account({
                  name: 'Engaged',
                  engageStopped: true,
                  stopOpenEnded: true,
                  stopAt: STOP_AT,
               }),
            ])
         ).toMatchObject({
            kind: 'check',
            name: 'Engaged',
         })
         expect(
            first([
               account(),
               account({
                  accountId: 'p',
                  status: 'PENDING',
               }),
            ])
         ).toBeNull()
      })
   })
})

const windowsOf = (patch: Partial<SeriesWindows> = {}): SeriesWindows => ({
   total: {
      current: totals(0, 0, 0, 0),
      previous: totals(0, 0, 0, 0),
   },
   covered: {
      current: totals(0, 0, 0, 0),
      previous: totals(0, 0, 0, 0),
   },
   coveredIds: [],
   ...patch,
})

const noAccounts = accountRowsOf({
   accounts: [],
   room: new Map(),
}).card

const cards = (input: Partial<Parameters<typeof cardsOf>[0]> = {}) =>
   cardsOf({
      windows: windowsOf(),
      pipeline: {
         totalUsd: null,
         campaigns: [],
      },
      replyCounts: null,
      accountCard: noAccounts,
      ...input,
   })

describe('cardsOf', () => {
   it('should answer zeros, no change and no worth for an owner with nothing', () => {
      expect(cards()).toEqual({
         pipeline: {
            totalUsd: null,
            replies: 0,
            replyChange: { kind: 'none' },
            campaignsWithReplies: 0,
            withReplyAndWorth: 0,
         },
         qualified: {
            current: 0,
            change: { kind: 'none' },
            found: 0,
         },
         invites: {
            current: 0,
            change: { kind: 'none' },
            accepted: 0,
            acceptRate: null,
         },
         accounts: noAccounts,
      })
   })

   it('should take the big numbers from all campaigns and the change from the covered ones', () => {
      const result = cards({
         windows: windowsOf({
            total: {
               current: totals(100, 40, 50, 10),
               previous: totals(0, 0, 0, 0),
            },
            covered: {
               current: totals(60, 30, 30, 6),
               previous: totals(60, 25, 20, 4),
            },
            coveredIds: ['a'],
         }),
      })

      expect(result.qualified).toEqual({
         current: 40,
         change: {
            kind: 'percent',
            value: 20,
         },
         found: 100,
      })
      expect(result.invites).toEqual({
         current: 50,
         change: {
            kind: 'percent',
            value: 50,
         },
         accepted: 10,
         acceptRate: 0.2,
      })
   })

   it('should say new when only campaigns without 60 days of history deliver', () => {
      const result = cards({
         windows: windowsOf({
            total: {
               current: totals(10, 4, 5, 0),
               previous: totals(0, 0, 0, 0),
            },
         }),
      })

      expect(result.qualified.change).toEqual({ kind: 'new' })
      expect(result.invites.acceptRate).toBe(0)
   })

   it('should count the replies of campaigns, and the ones with a worth set', () => {
      const result = cards({
         pipeline: {
            totalUsd: 1200,
            campaigns: [
               {
                  id: 'a',
                  replies: 4,
                  replyValueUsd: 100,
               },
               {
                  id: 'b',
                  replies: 1,
                  replyValueUsd: null,
               },
               {
                  id: 'c',
                  replies: 0,
                  replyValueUsd: 50,
               },
            ],
         },
      })

      expect(result.pipeline).toMatchObject({
         totalUsd: 1200,
         replies: 5,
         campaignsWithReplies: 2,
         withReplyAndWorth: 1,
      })
   })

   it('should leave the money null when no campaign has a worth', () => {
      const result = cards({
         pipeline: {
            totalUsd: null,
            campaigns: [
               {
                  id: 'a',
                  replies: 2,
                  replyValueUsd: null,
               },
            ],
         },
      })

      expect(result.pipeline).toMatchObject({
         totalUsd: null,
         replies: 2,
         withReplyAndWorth: 0,
      })
   })

   it('should compute the reply change over covered campaigns like the other badges, and none when the read failed', () => {
      const covered = windowsOf({ coveredIds: ['a'] })

      expect(
         cards({
            windows: covered,
            replyCounts: {
               covered: {
                  current: 3,
                  previous: 1,
               },
               totalCurrent: 5,
            },
         }).pipeline.replyChange
      ).toEqual({
         kind: 'percent',
         value: 200,
      })
      expect(
         cards({
            windows: windowsOf(),
            replyCounts: {
               covered: {
                  current: 0,
                  previous: 0,
               },
               totalCurrent: 2,
            },
         }).pipeline.replyChange
      ).toEqual({ kind: 'new' })
      expect(
         cards({
            windows: covered,
            replyCounts: null,
         }).pipeline.replyChange
      ).toEqual({ kind: 'none' })
   })
})

const listRow = (patch: Partial<CampaignListRow> & { id: string }): CampaignListRow => ({
   name: patch.id.toUpperCase(),
   workflows: 1,
   pausedAt: null,
   createdAt: createdBack(30).toISOString(),
   state: 'RUNNING',
   numbers: null,
   gate: {
      completeDays: 14,
      missingDays: 0,
      invites: 30,
      needed: {
         days: 0,
         invites: 0,
      },
   },
   projection: null,
   ...patch,
})

describe('campaignRowsOf', () => {
   it('should keep the order of the list and join the 30-day sums and the money by id', () => {
      const rows = campaignRowsOf({
         listRows: [
            listRow({
               id: 'b',
               projection: {
                  status: 'hidden',
                  reason: 'walletLow',
               },
            }),
            listRow({
               id: 'a',
               pausedAt: createdBack(2).toISOString(),
               state: 'PAUSED',
            }),
            listRow({
               id: 'c',
               projection: {
                  status: 'hidden',
                  reason: 'tooEarly',
               },
            }),
         ],
         perCampaign: new Map([
            [
               'b',
               {
                  qualified: 7,
                  invited: 9,
               },
            ],
            [
               'a',
               {
                  qualified: null,
                  invited: null,
               },
            ],
         ]),
         pipeline: [
            {
               id: 'b',
               replyValueUsd: 100,
               pipelineUsd: 2400,
            },
         ],
         projectionKnown: true,
      })

      expect(rows.map(({ id }) => id)).toEqual(['b', 'a', 'c'])
      expect(rows[0]).toEqual({
         id: 'b',
         name: 'B',
         state: 'RUNNING',
         paused: false,
         status: 'onHold',
         qualified: 7,
         invited: 9,
         pipelineUsd: 2400,
         replyValueUsd: 100,
      })
      expect(rows[1]).toMatchObject({
         paused: true,
         status: 'none',
         qualified: null,
         invited: null,
         pipelineUsd: null,
         replyValueUsd: null,
      })
      expect(rows[2]).toMatchObject({
         status: 'tooEarly',
         qualified: null,
         pipelineUsd: null,
      })
   })

   it('should say on track only for a shown projection, and nothing when the projection is unknown', () => {
      const shown = listRow({
         id: 'a',
         projection: {
            status: 'shown',
            next7: {
               low: 1,
               high: 2,
            },
            next30: {
               low: 3,
               high: 4,
            },
            basis: {
               latestPace: 1,
               previousPace: 1,
               capacity: {
                  perDay: 10,
                  perWeek: 70,
               },
               share: {
                  perDay: 10,
                  perWeek: 70,
               },
               shareDenominator: 1,
            },
         },
      })
      const rowsOf = (projectionKnown: boolean) =>
         campaignRowsOf({
            listRows: [shown],
            perCampaign: new Map(),
            pipeline: [],
            projectionKnown,
         })

      expect(rowsOf(true)[0].status).toBe('onTrack')
      expect(rowsOf(false)[0].status).toBe('none')
   })
})

const run = (patch: Partial<RunInput> = {}): RunInput => ({
   id: 'r1',
   workflowId: 'w1',
   status: 'SUCCEEDED',
   qualified: 3,
   maybe: 2,
   discarded: 5,
   costMicros: 1500,
   startedAt: new Date('2026-11-14T10:00:00.000Z'),
   ...patch,
})

const workflow = (patch: Partial<WorkflowInput> = {}): WorkflowInput => ({
   id: 'w1',
   name: 'Find people',
   stage: 'DISCOVER',
   enabled: true,
   campaignId: 'c1',
   campaignName: 'Campaign one',
   ...patch,
})

describe('runRowsOf', () => {
   const rowsOf = (runs: RunInput[], workflows: WorkflowInput[] = [workflow()]) =>
      runRowsOf({
         runs,
         workflows: new Map(workflows.map(each => [each.id, each])),
      })

   it('should shape a finished run with what it scored, in the order given', () => {
      const rows = rowsOf([
         run(),
         run({
            id: 'r2',
            status: 'PARTIAL',
            qualified: 1,
            maybe: 0,
            discarded: 0,
         }),
      ])

      expect(rows[0]).toEqual({
         id: 'r1',
         workflowId: 'w1',
         workflow: 'Find people',
         stage: 'DISCOVER',
         status: 'SUCCEEDED',
         scored: 10,
         qualified: 3,
         campaign: 'Campaign one',
         costMicros: 1500,
         startedAt: '2026-11-14T10:00:00.000Z',
      })
      expect(rows.map(({ id }) => id)).toEqual(['r1', 'r2'])
      expect(rows[1]).toMatchObject({
         scored: 1,
         qualified: 1,
      })
   })

   it('should show a dash for a run that scored nobody or has not finished', () => {
      const rows = rowsOf([
         run({
            qualified: 0,
            maybe: 0,
            discarded: 0,
         }),
         run({
            id: 'r2',
            status: 'RUNNING',
         }),
         run({
            id: 'r3',
            status: 'FAILED',
         }),
      ])

      expect(rows.map(({ scored, qualified }) => [scored, qualified])).toEqual([
         [null, null],
         [null, null],
         [null, null],
      ])
   })

   it('should skip a run whose workflow is missing, and name no campaign for a workflow without one', () => {
      const rows = rowsOf(
         [
            run({ workflowId: 'gone' }),
            run({
               id: 'r2',
               workflowId: 'w2',
            }),
         ],
         [
            workflow({
               id: 'w2',
               campaignId: null,
               campaignName: null,
            }),
         ]
      )

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
         id: 'r2',
         campaign: null,
      })
   })
})

const campaign = (patch: Partial<CampaignAttentionInput> & { id: string }): CampaignAttentionInput => ({
   name: `Campaign ${patch.id}`,
   paused: false,
   running: true,
   hasInviteWorkflow: true,
   waiting: 3,
   perDay: 10.7,
   replies: 0,
   replyValueUsd: null,
   ...patch,
})

const attention = (input: Partial<Parameters<typeof attentionOf>[0]> = {}) =>
   attentionOf({
      accounts: [],
      campaigns: [],
      alerts: [],
      draftsWaiting: 0,
      walletLow: false,
      isAdmin: false,
      now: NOW,
      ...input,
   })

const ids = (rows: ReturnType<typeof attention>) => rows.map(({ id }) => id)

describe('attentionOf', () => {
   it('should give no row for an owner with nothing to do', () => {
      expect(attention()).toEqual([])
      expect(
         attention({
            accounts: [account()],
            campaigns: [
               campaign({
                  id: 'fine',
                  waiting: 50,
               }),
            ],
         })
      ).toEqual([])
   })

   it('should write the three signed-out sentences, with the status change as the start', () => {
      const rows = attention({
         accounts: (['NEEDS_REAUTH', 'ERROR', 'BLOCKED'] as const).map((status, index) =>
            account({
               accountId: `a${index}`,
               name: `N${index}`,
               status,
            })
         ),
      })

      expect(rows.map(({ sentence }) => sentence)).toEqual([
         'N0 needs you to sign in again.',
         'N1 is in error and needs a look.',
         'LinkedIn blocked N2.',
      ])
      expect(rows[0]).toEqual({
         id: 'account-signed-out:a0',
         rule: 'account-signed-out',
         severity: 'high',
         sentence: 'N0 needs you to sign in again.',
         route: '/accounts/a0',
         at: createdBack(50).toISOString(),
      })
   })

   it('should write a resting sentence with the end time, or until the next sign-in', () => {
      const [openRow, timedRow] = attention({
         accounts: [
            account({
               accountId: 't',
               name: 'Tim',
               ...timed,
            }),
            account({
               accountId: 'o',
               name: 'Olga',
               ...openEnded,
            }),
         ],
      })

      expect(timedRow).toEqual({
         id: 'account-resting:t',
         rule: 'account-resting',
         severity: 'medium',
         sentence: 'Tim is resting until 15:00 UTC.',
         route: '/accounts/t',
         at: STOP_AT.toISOString(),
      })
      expect(openRow).toMatchObject({
         severity: 'high',
         sentence: 'Olga is resting until its next sign-in.',
      })
   })

   it('should say the date of an end more than a day away', () => {
      const [row] = attention({
         accounts: [
            account({
               ...timed,
               stopUntil: new Date('2026-11-20T08:30:00.000Z'),
            }),
         ],
      })

      expect(row.sentence).toBe('Ada is resting until 20 Nov 08:30 UTC.')
   })

   it('should write the health row with the first reason and no start', () => {
      const [row] = attention({
         accounts: [
            account({
               ...warning,
               reasons: ['First.', 'Second.'],
            }),
         ],
      })

      expect(row).toEqual({
         id: 'account-health:a1',
         rule: 'account-health',
         severity: 'medium',
         sentence: 'Ada: First.',
         route: '/accounts/a1',
         at: null,
      })
   })

   it('should show the wallet row to an admin only, and only when it is below its floor', () => {
      expect(
         attention({
            walletLow: true,
            isAdmin: true,
         })
      ).toEqual([
         {
            id: 'wallet-low:platform',
            rule: 'wallet-low',
            severity: 'high',
            sentence: 'The data wallet is below its floor, so paid work may stop.',
            route: '/usage',
            at: null,
         },
      ])
      expect(
         attention({
            walletLow: true,
            isAdmin: false,
         })
      ).toEqual([])
      expect(
         attention({
            walletLow: false,
            isAdmin: true,
         })
      ).toEqual([])
   })

   it('should write a failed-run row from each alert, with and without a finish time', () => {
      const rows = attention({
         alerts: [
            {
               runId: 'r1',
               workflowId: 'w1',
               workflowName: 'Find people',
               finishedAt: new Date('2026-11-15T10:30:00.000Z'),
            },
            {
               runId: 'r2',
               workflowId: 'w2',
               workflowName: 'Invite',
               finishedAt: null,
            },
         ],
      })

      expect(rows).toEqual([
         {
            id: 'run-failed:r1',
            rule: 'run-failed',
            severity: 'high',
            sentence: 'A run of Find people failed on 10:30 UTC.',
            route: '/workflows/w1',
            at: '2026-11-15T10:30:00.000Z',
         },
         {
            id: 'run-failed:r2',
            rule: 'run-failed',
            severity: 'high',
            sentence: 'A run of Invite failed.',
            route: '/workflows/w2',
            at: null,
         },
      ])
   })

   it('should write the drafts row only above zero, with the plural', () => {
      expect(attention({ draftsWaiting: 1 })).toEqual([
         {
            id: 'drafts-waiting:owner',
            rule: 'drafts-waiting',
            severity: 'medium',
            sentence: '1 draft waits for your approval.',
            route: '/approve',
            at: null,
         },
      ])
      expect(attention({ draftsWaiting: 3 })[0].sentence).toBe('3 drafts wait for your approval.')
      expect(attention({ draftsWaiting: 0 })).toEqual([])
   })

   describe('few waiting', () => {
      const few = (patch: Partial<CampaignAttentionInput>) =>
         attention({
            campaigns: [
               campaign({
                  id: 'c1',
                  ...patch,
               }),
            ],
         })

      it('should write a row when fewer people wait than the campaign can invite in a day', () => {
         expect(few({ waiting: 4 })).toEqual([
            {
               id: 'few-waiting:c1',
               rule: 'few-waiting',
               severity: 'medium',
               sentence: 'Campaign c1 has 4 people waiting to be invited, fewer than the 10 it can invite in a day.',
               route: '/campaigns/c1',
               at: null,
            },
         ])
         expect(few({ waiting: 1 })[0].sentence).toContain('has 1 person waiting')
         expect(few({ waiting: 0 })[0].sentence).toContain('has 0 people waiting')
      })

      it('should write none at or above the floor, with a floor of 0, or with no count', () => {
         expect(few({ waiting: 10 })).toEqual([])
         expect(
            few({
               waiting: 0,
               perDay: 0.9,
            })
         ).toEqual([])
         expect(few({ waiting: null })).toEqual([])
      })

      it('should write none without an enabled Invite workflow, for a paused or not running campaign', () => {
         expect(few({ hasInviteWorkflow: false })).toEqual([])
         expect(
            few({
               paused: true,
               running: false,
            })
         ).toEqual([])
         expect(few({ running: false })).toEqual([])
      })
   })

   describe('no worth', () => {
      const worth = (patch: Partial<CampaignAttentionInput>) =>
         attention({
            campaigns: [
               campaign({
                  id: 'c1',
                  waiting: null,
                  ...patch,
               }),
            ],
         })

      it('should write a row for a campaign with replies and no worth', () => {
         expect(worth({ replies: 2 })).toEqual([
            {
               id: 'no-worth:c1',
               rule: 'no-worth',
               severity: 'medium',
               sentence: 'Campaign c1 has positive replies but no worth per reply, so it adds no money.',
               route: '/campaigns/c1',
               at: null,
            },
         ])
      })

      it('should write none with a worth, with no replies, or for a paused campaign', () => {
         expect(
            worth({
               replies: 2,
               replyValueUsd: 100,
            })
         ).toEqual([])
         expect(worth({ replies: 0 })).toEqual([])
         expect(
            worth({
               replies: 2,
               paused: true,
               running: false,
            })
         ).toEqual([])
      })
   })

   it('should sort by severity, rule order, newest start first with none last, then id', () => {
      const rows = attention({
         isAdmin: true,
         walletLow: true,
         draftsWaiting: 2,
         now: NOW,
         accounts: [
            account({
               accountId: 'warn',
               ...warning,
            }),
            account({
               accountId: 'rest',
               ...timed,
            }),
            account({
               accountId: 'out-b',
               status: 'ERROR',
               statusUpdatedAt: new Date('2026-11-01T00:00:00.000Z'),
            }),
            account({
               accountId: 'out-a',
               status: 'ERROR',
               statusUpdatedAt: new Date('2026-11-10T00:00:00.000Z'),
            }),
            account({
               accountId: 'out-c',
               status: 'ERROR',
               statusUpdatedAt: new Date('2026-11-10T00:00:00.000Z'),
            }),
         ],
         alerts: [
            {
               runId: 'old',
               workflowId: 'w',
               workflowName: 'W',
               finishedAt: new Date('2026-11-14T00:00:00.000Z'),
            },
            {
               runId: 'none',
               workflowId: 'w',
               workflowName: 'W',
               finishedAt: null,
            },
            {
               runId: 'new',
               workflowId: 'w',
               workflowName: 'W',
               finishedAt: new Date('2026-11-15T00:00:00.000Z'),
            },
         ],
         campaigns: [
            campaign({
               id: 'z',
               waiting: 0,
            }),
            campaign({
               id: 'y',
               waiting: null,
               replies: 1,
            }),
         ],
      })

      expect(ids(rows)).toEqual([
         'account-signed-out:out-a',
         'account-signed-out:out-c',
         'account-signed-out:out-b',
         'wallet-low:platform',
         'run-failed:new',
         'run-failed:old',
         'run-failed:none',
         'account-resting:rest',
         'account-health:warn',
         'drafts-waiting:owner',
         'few-waiting:z',
         'no-worth:y',
      ])
   })

   it('should have as many account rows as the card has accounts needing attention', () => {
      const accounts = [
         account({ accountId: 'ok' }),
         account({
            accountId: 'pending',
            status: 'PENDING',
         }),
         account({
            accountId: 'disabled',
            status: 'DISABLED',
            health: 'PAUSED',
         }),
         account({
            accountId: 'blocked',
            status: 'BLOCKED',
            health: 'PAUSED',
         }),
         account({
            accountId: 'rest',
            ...timed,
         }),
         account({
            accountId: 'open',
            ...openEnded,
         }),
         account({
            accountId: 'warn',
            ...warning,
         }),
         account({
            accountId: 'engage',
            engageStopped: true,
            stopOpenEnded: true,
            stopAt: STOP_AT,
         }),
      ]
      const subjects = new Set(
         attention({ accounts })
            .filter(({ rule }) => rule.startsWith('account-'))
            .map(({ id }) => id.split(':')[1])
      )

      expect(
         accountRowsOf({
            accounts,
            room: null,
         }).card.needAttention
      ).toBe(subjects.size)
      expect(subjects.size).toBe(5)
   })
})

describe('contract statuses', () => {
   it('should equal the Prisma enums brain stores them in', () => {
      expect([...ACCOUNT_STATUSES].sort()).toEqual(Object.values(LinkedInAccountStatus).sort())
      expect([...RUN_STATUSES].sort()).toEqual(Object.values(WorkflowRunStatus).sort())
   })
})
