import { readableError } from '@/lib/trpc-error'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { type Answer, type AnswerAsk, type Held } from './types'

import { blockedMessage, isBusy, skippedText } from './answer-state'
import { NETWORK_LIMITS } from './rules'
import { answersByAccount } from './selection'
import { NetworkRefusal, type NetworkSource } from './source'

const POLL_MS = 1500

type Ask = AnswerAsk & { accountId: string }

type Batch = {
   ids: string[]
   timer: ReturnType<typeof setTimeout>
}

type Refused = {
   message: string
   go: () => void
}

const sentence = (action: Answer, count: number, name: string) =>
   `${action === 'ACCEPT' ? 'Accepting' : 'Ignoring'} ${count === 1 ? name : `${count} people`}`

// Everything the page does with the requests of the accounts it shows: the list (looked at again while something is in progress),
// a read of some or all of them, and the answers. An answer, single or in bulk, waits NETWORK_LIMITS.undoMs here, where it can still
// be undone, before it is asked of the source, one run for each account it touches; leaving the page cancels what is still waiting,
// so nothing is sent behind the owner's back.
export const useNetwork = (source: NetworkSource, accountIds: string[]) => {
   const query = useQuery({
      queryKey: ['network', source.key, accountIds.join(',')],
      queryFn: accountIds.length > 0 ? () => source.load(accountIds) : skipToken,
      refetchInterval: current => (isBusy(current.state.data) ? POLL_MS : false),
   })
   const { refetch } = query
   const holds = useRef(new Map<number, Batch>())
   const counter = useRef(0)
   const [holding, setHolding] = useState<Record<string, Held>>({})
   const [refused, setRefused] = useState<Refused | null>(null)

   useEffect(() => {
      const active = holds.current

      return () => {
         for (const { timer } of active.values()) {
            clearTimeout(timer)
         }

         active.clear()
      }
   }, [])

   const fail = (error: unknown) =>
      toast.error(error instanceof Error ? readableError(error) : 'Something went wrong. Try again.')

   // Asks for a read of these accounts. The ones the source left out are told in a sentence; the ones the browse budget refused open
   // the Start anyway dialog, which asks again for just those with `startAnyway`.
   const askRead = async (ids: string[], startAnyway = false): Promise<void> => {
      try {
         const { skipped } = await source.refresh(ids, { startAnyway })
         const blocked = skipped.filter(({ budget }) => budget)
         const others = skipped.filter(({ budget }) => !budget)

         await refetch()

         if (others.length > 0) {
            toast(skippedText(others))
         }

         if (blocked.length > 0 && !startAnyway) {
            setRefused({
               message: blockedMessage(blocked.map(({ reason }) => reason)),
               go: () =>
                  void askRead(
                     blocked.map(({ accountId }) => accountId),
                     true
                  ),
            })
         }
      } catch (error) {
         fail(error)
      }
   }

   // Asks for the answers of each account in turn, so one that is refused never stops the others. A refusal because of the browse
   // budget opens the Start anyway dialog for the accounts it touched; any other refusal or failure is told as it is.
   const askAnswers = async (groups: ReturnType<typeof answersByAccount>, startAnyway = false): Promise<void> => {
      const blocked: typeof groups = []
      const reasons: string[] = []

      for (const group of groups) {
         try {
            await source.answer(group.accountId, group.asks, { startAnyway })
         } catch (error) {
            if (!startAnyway && error instanceof NetworkRefusal && error.budget) {
               blocked.push(group)
               reasons.push(error.message)
            } else {
               fail(error)
            }
         }
      }

      await refetch()

      if (blocked.length > 0) {
         setRefused({
            message: blockedMessage(reasons),
            go: () => void askAnswers(blocked, true),
         })
      }
   }

   const release = (ids: string[]) =>
      setHolding(current => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))))

   // Takes back what is still waiting for its few seconds: the whole batch the request was in.
   const undo = (id: string) => {
      for (const [key, held] of holds.current) {
         if (held.ids.includes(id)) {
            clearTimeout(held.timer)
            holds.current.delete(key)
            release(held.ids)
         }
      }
   }

   const answer = (asks: Ask[], firstName: string) => {
      const [first] = asks

      if (!first) {
         return
      }

      const key = counter.current
      const ids = asks.map(({ id }) => id)
      const until = Date.now() + NETWORK_LIMITS.undoMs

      counter.current += 1
      setHolding(current => ({
         ...current,
         ...Object.fromEntries(
            asks.map(item => [
               item.id,
               {
                  action: item.action,
                  until,
               },
            ])
         ),
      }))
      holds.current.set(key, {
         ids,
         timer: setTimeout(() => {
            holds.current.delete(key)
            release(ids)
            void askAnswers(answersByAccount(asks))
         }, NETWORK_LIMITS.undoMs),
      })
      toast(sentence(first.action, asks.length, firstName), {
         duration: NETWORK_LIMITS.undoMs,
         description: 'It is sent in a few seconds. Undo to keep it as it is.',
         action: {
            label: 'Undo',
            onClick: () => undo(first.id),
         },
      })
   }

   return {
      snapshot: query.data,
      isPending: query.isPending && accountIds.length > 0,
      error: query.error,
      holding,
      read: askRead,
      answer,
      undo,
      // The dialog that asks whether to go past a budget refusal.
      refusal: refused?.message ?? null,
      goAnyway: () => {
         const current = refused

         setRefused(null)
         current?.go()
      },
      stopAsking: () => setRefused(null),
   }
}
