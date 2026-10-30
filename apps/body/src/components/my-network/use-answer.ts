import { readableError } from '@/lib/trpc-error'
import { TRPCClientError } from '@trpc/client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'
import { isBudgetRefusal } from '../accounts/budget-refusal'

export type Ask = {
   accountId: string
   requestId: string
   action: 'ACCEPT' | 'IGNORE'
   name: string
}

// As on the requests page before: an answer waits 5 s for Undo, and one still waiting when the page closes is not sent.
const HOLD_MS = 5000

const VERBS = {
   ACCEPT: ['Accepting', 'Accept'],
   IGNORE: ['Ignoring', 'Ignore'],
} as const

// Accept or Ignore a connection request through the requests router, with Undo and a Start anyway when the account is resting.
export const useAnswer = () => {
   const utils = trpc.useUtils()
   const timers = useRef(new Map<string, number>())
   const [refused, setRefused] = useState<{ ask: Ask; message: string } | null>(null)

   useEffect(() => {
      const pending = timers.current

      return () => pending.forEach(timer => window.clearTimeout(timer))
   }, [])

   const send = async (ask: Ask, startAnyway: boolean) => {
      try {
         await utils.client.network.answer.mutate({
            accountId: ask.accountId,
            answers: [
               {
                  id: ask.requestId,
                  action: ask.action,
               },
            ],
            startAnyway,
         })
         toast.success(`${VERBS[ask.action][1]} for ${ask.name} is on its way to LinkedIn.`)
         await utils.people.invalidate()
      } catch (error) {
         if (error instanceof TRPCClientError && isBudgetRefusal(error)) {
            setRefused({
               ask,
               message: error.message,
            })
         } else {
            toast.error(error instanceof Error ? readableError(error) : 'The answer could not be sent.')
         }
      }
   }

   const answer = (ask: Ask) => {
      const timer = window.setTimeout(() => {
         timers.current.delete(ask.requestId)
         void send(ask, false)
      }, HOLD_MS)

      timers.current.set(ask.requestId, timer)
      toast(`${VERBS[ask.action][0]} ${ask.name}…`, {
         duration: HOLD_MS,
         action: {
            label: 'Undo',
            onClick: () => {
               window.clearTimeout(timer)
               timers.current.delete(ask.requestId)
            },
         },
      })
   }

   return {
      answer,
      refusal: refused?.message ?? null,
      goAnyway: () => {
         if (refused) {
            void send(refused.ask, true)
         }

         setRefused(null)
      },
      stopAsking: () => setRefused(null),
   }
}
