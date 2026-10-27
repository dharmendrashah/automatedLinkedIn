import { type AnswerAsk, type NetworkRequest, type NetworkSnapshot, type RequestState } from './types'

import { NETWORK_LIMITS, answersLeftToday } from './rules'
import { samplePerson } from './sample-people'
import { NetworkRefusal, type NetworkSource } from './source'

// The views of the preview, picked with `?sample=` in the address. Every state of a request can be looked at with them.
export const SCENARIOS = ['busy', 'mixed', 'many', 'empty', 'signedout', 'budget', 'flaky'] as const
export type Scenario = (typeof SCENARIOS)[number]

// How the preview names each view in its picker.
export const SCENARIO_LABELS: Record<Scenario, string> = {
   busy: 'Eight people waiting',
   mixed: 'Every state of a request',
   many: 'A long list (40)',
   empty: 'Nobody waiting',
   signedout: 'Account signed out',
   budget: 'Outside working hours',
   flaky: 'Answers that go wrong',
}

export const scenarioOf = (value: string | null): Scenario => SCENARIOS.find(scenario => scenario === value) ?? 'busy'

const READ_MS = 1500
const ANSWER_MS = 1200
const SIGNED_OUT_TEXT = 'LinkedIn asked this account to sign in again. Fix it on the accounts page.'
const BUDGET_TEXT = 'It is outside this account’s working hours.'

type Store = {
   requests: NetworkRequest[]
   readAt: string | null
   reading: boolean
   answeredToday: number
   // The preview refuses once, as the browse budget does, until the owner goes on with Start anyway.
   blocked: boolean
}

// The states a `mixed` list starts with after the waiting ones, so every row can be looked at.
const MIXED_TAIL: RequestState[] = ['QUEUED', 'ACCEPTED', 'IGNORED', 'GONE', 'UNSURE', 'FAILED']

const requestsFor = (scenario: Scenario, now: Date): NetworkRequest[] => {
   const count = scenario === 'many' ? 40 : scenario === 'empty' || scenario === 'signedout' ? 0 : 8
   const waiting = Array.from({ length: count }, (_, index): NetworkRequest => {
      const person = samplePerson(index)

      return {
         id: String(7520752930702983168n + BigInt(index)),
         slug: `sample-person-${index + 1}`,
         ...person,
         state: 'WAITING',
      }
   })

   if (scenario !== 'mixed') {
      return waiting
   }

   const ago = new Date(now.getTime() - 20 * 60_000).toISOString()
   const tail = MIXED_TAIL.map((state, index): NetworkRequest => {
      const person = samplePerson(count + index)

      return {
         id: String(7520752930702983168n + BigInt(count + index)),
         slug: `sample-person-${count + index + 1}`,
         ...person,
         state,
         ...(state === 'QUEUED'
            ? { action: 'ACCEPT' as const, startedAt: new Date(now.getTime() - 6000).toISOString() }
            : {}),
         ...(state === 'ACCEPTED' || state === 'IGNORED' ? { answeredAt: ago } : {}),
         ...(state === 'FAILED' ? { failure: 'LinkedIn did not take the click. Try it again.' } : {}),
      }
   })

   return [...waiting, ...tail]
}

// A source of made-up people that behaves as the real one will: a read takes a moment, an answer is queued and then settles,
// the limits refuse, the budget can refuse once. Nothing leaves the page.
export const createSampleSource = (scenario: Scenario, clock: () => Date = () => new Date()): NetworkSource => {
   const stores = new Map<string, Store>()

   const storeOf = (accountId: string) => {
      const known = stores.get(accountId)

      if (known) {
         return known
      }

      const now = clock()
      const created: Store = {
         requests: requestsFor(scenario, now),
         readAt: new Date(now.getTime() - 12 * 60_000).toISOString(),
         reading: false,
         answeredToday: scenario === 'mixed' ? 2 : 0,
         blocked: scenario === 'budget',
      }

      stores.set(accountId, created)

      return created
   }

   const settle = (store: Store, ask: AnswerAsk, position: number) => {
      const request = store.requests.find(({ id }) => id === ask.id)

      if (!request) {
         return
      }

      // In the flaky view the third, fourth and fifth answers of a run go wrong in the three ways a real one can.
      const problem =
         scenario === 'flaky' ? ([undefined, 'GONE', 'UNSURE', 'FAILED'] as const)[position % 4] : undefined
      const taken = problem === undefined

      request.state = problem ?? (ask.action === 'ACCEPT' ? 'ACCEPTED' : 'IGNORED')
      request.answeredAt = clock().toISOString()

      if (problem === 'FAILED') {
         request.failure = 'LinkedIn did not take the click. Try it again.'
      }

      if (taken) {
         store.answeredToday += 1
      }
   }

   const refuseIfBlocked = (store: Store, startAnyway: boolean) => {
      if (scenario === 'signedout') {
         throw new NetworkRefusal(SIGNED_OUT_TEXT)
      }

      if (store.blocked && !startAnyway) {
         throw new NetworkRefusal(BUDGET_TEXT, true)
      }

      store.blocked = false
   }

   return {
      key: `sample-${scenario}`,
      load: async accountId => {
         const store = storeOf(accountId)
         const snapshot: NetworkSnapshot = {
            requests: store.requests.map(request => ({ ...request })),
            total: store.requests.filter(({ state }) => state === 'WAITING' || state === 'QUEUED').length,
            readAt: store.readAt,
            reading: store.reading,
            answeredToday: store.answeredToday,
            ...(scenario === 'signedout' ? { problem: 'SIGNED_OUT' as const } : {}),
         }

         return snapshot
      },
      waiting: async accountIds =>
         Object.fromEntries(
            accountIds.map(id => [
               id,
               storeOf(id).requests.filter(({ state }) => state === 'WAITING' || state === 'QUEUED').length,
            ])
         ),
      refresh: async (accountId, options) => {
         const store = storeOf(accountId)

         refuseIfBlocked(store, options.startAnyway)
         store.reading = true
         setTimeout(() => {
            store.reading = false
            store.readAt = clock().toISOString()
         }, READ_MS)
      },
      answer: async (accountId, asks, options) => {
         const store = storeOf(accountId)

         if (asks.length > NETWORK_LIMITS.perRun) {
            throw new NetworkRefusal(`At most ${NETWORK_LIMITS.perRun} at a time.`)
         }

         if (asks.length > answersLeftToday(store.answeredToday)) {
            throw new NetworkRefusal(`This account has ${answersLeftToday(store.answeredToday)} answers left today.`)
         }

         refuseIfBlocked(store, options.startAnyway)

         const waiting = asks.filter(ask =>
            store.requests.some(({ id, state }) => id === ask.id && state === 'WAITING')
         )

         for (const ask of waiting) {
            const request = store.requests.find(({ id }) => id === ask.id)

            if (request) {
               request.state = 'QUEUED'
               request.action = ask.action
               request.startedAt = clock().toISOString()
            }
         }

         waiting.forEach((ask, position) => {
            setTimeout(() => settle(store, ask, position), (position + 1) * ANSWER_MS)
         })
      },
   }
}
