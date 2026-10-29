import { describe, expect, it } from 'vitest'

import { type LoadingFacts, loadingOf } from './accountLoading'

const AT = new Date('2026-10-30T09:00:00Z')

const facts = (over: Partial<LoadingFacts> = {}): LoadingFacts => ({
   signedIn: false,
   profileStored: false,
   profileTries: 0,
   connectionsReadAt: null,
   invitationsReadAt: null,
   messagesBackfilledAt: null,
   conversations: 0,
   reading: new Set(),
   notFinished: new Set(),
   ...over,
})

const states = (over: Partial<LoadingFacts>) =>
   loadingOf(facts(over)).steps.map(({ step, state }) => `${step}:${state}`)

describe('loadingOf', () => {
   it('should start at 0 % with every step waiting, and weigh sign-in 10, profile 10, connections 20, requests 20, messages 40', () => {
      expect(loadingOf(facts())).toEqual({
         percent: 0,
         steps: [
            {
               step: 'SIGN_IN',
               weight: 10,
               state: 'WAITING',
            },
            {
               step: 'PROFILE',
               weight: 10,
               state: 'WAITING',
            },
            {
               step: 'CONNECTIONS',
               weight: 20,
               state: 'WAITING',
            },
            {
               step: 'REQUESTS',
               weight: 20,
               state: 'WAITING',
            },
            {
               step: 'MESSAGES',
               weight: 40,
               state: 'WAITING',
            },
         ],
         conversations: 0,
         readyForWorkflows: false,
         readyForUnibox: false,
      })
      expect(
         loadingOf(
            facts({
               signedIn: true,
               profileStored: true,
               connectionsReadAt: AT,
               invitationsReadAt: AT,
               messagesBackfilledAt: AT,
            })
         )
      ).toMatchObject({
         percent: 100,
         readyForWorkflows: true,
         readyForUnibox: true,
      })
   })

   it('should move inside the messages step by the conversations read, never reaching its end before the whole inbox is read', () => {
      const done = {
         signedIn: true,
         profileStored: true,
         connectionsReadAt: AT,
         invitationsReadAt: AT,
      }

      expect(
         loadingOf(
            facts({
               ...done,
               conversations: 150,
            })
         ).percent
      ).toBe(80)
      expect(
         loadingOf(
            facts({
               ...done,
               conversations: 600,
            })
         ).percent
      ).toBe(92)
      expect(
         loadingOf(
            facts({
               ...done,
               conversations: 1_000_000,
            })
         ).percent
      ).toBe(99)
      expect(
         loadingOf(
            facts({
               ...done,
               conversations: 0,
               messagesBackfilledAt: AT,
            })
         ).percent
      ).toBe(100)
   })

   it('should be ready for workflows once the profile and connections are read, before the messages', () => {
      expect(
         loadingOf(
            facts({
               signedIn: true,
               profileStored: true,
               connectionsReadAt: AT,
            })
         ).readyForWorkflows
      ).toBe(true)
      expect(
         loadingOf(
            facts({
               signedIn: true,
               connectionsReadAt: AT,
            })
         ).readyForWorkflows
      ).toBe(false)
   })

   it('should say what is being read now, and what did not finish', () => {
      expect(
         states({
            signedIn: true,
            reading: new Set(['CONNECTIONS']),
            notFinished: new Set(['REQUESTS']),
         })
      ).toEqual(['SIGN_IN:DONE', 'PROFILE:WAITING', 'CONNECTIONS:READING', 'REQUESTS:NOT_FINISHED', 'MESSAGES:WAITING'])
   })

   it('should leave the own profile to the owner after three reads that did not keep it', () => {
      expect(
         states({
            signedIn: true,
            profileTries: 2,
         })[1]
      ).toBe('PROFILE:WAITING')
      expect(
         states({
            signedIn: true,
            profileTries: 3,
         })[1]
      ).toBe('PROFILE:GIVEN_UP')
      expect(
         states({
            signedIn: true,
            profileTries: 3,
            profileStored: true,
         })[1]
      ).toBe('PROFILE:DONE')
   })
})
