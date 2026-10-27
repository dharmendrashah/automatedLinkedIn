import { readableError } from '@/lib/trpc-error'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { type Answer, type AnswerAsk, type AskOptions, type Held } from './types'

import { isBusy } from './answer-state'
import { NETWORK_LIMITS } from './rules'
import { NetworkRefusal, type NetworkSource } from './source'

const POLL_MS = 1500

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

// Everything the page does with one account's requests: the list (looked at again while something is in progress), a read, and
// the answers. An answer, single or in bulk, waits NETWORK_LIMITS.undoMs here, where it can still be undone, before it is asked
// of the source; leaving the page cancels what is still waiting, so nothing is sent behind the owner's back.
export const useNetwork = (source: NetworkSource, accountId: string | undefined) => {
   const query = useQuery({
      queryKey: ['network', source.key, accountId],
      queryFn: accountId ? () => source.load(accountId) : skipToken,
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

   // A refusal because of the browse budget opens the Start anyway dialog, which asks again with `startAnyway`; any other
   // refusal or failure is told as it is.
   const attempt = async (work: (options: AskOptions) => Promise<void>, startAnyway = false) => {
      try {
         await work({ startAnyway })
         await refetch()
      } catch (error) {
         if (!startAnyway && error instanceof NetworkRefusal && error.budget) {
            setRefused({
               message: error.message,
               go: () => void attempt(work, true),
            })

            return
         }

         toast.error(error instanceof Error ? readableError(error) : 'Something went wrong. Try again.')
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

   const answer = (asks: AnswerAsk[], firstName: string) => {
      const [first] = asks

      if (!accountId || !first) {
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
            void attempt(options => source.answer(accountId, asks, options))
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
      isPending: query.isPending && accountId !== undefined,
      error: query.error,
      reading: query.data?.reading === true,
      holding,
      read: () => (accountId ? attempt(options => source.refresh(accountId, options)) : Promise.resolve()),
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
