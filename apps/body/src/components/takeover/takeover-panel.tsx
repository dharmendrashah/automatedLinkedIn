import { Button } from '@/components/ui/button'
import { keepPreviousData } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { trpc } from '../../trpc'
import { TypingBuffer, clickFraction, keyInput } from './takeover-input'

const FRAME_MS = 300
const TYPING_MS = 120
const MAX_SCROLL = 1500

type Props = {
   id: string
   accountEmail: string
   onClose: () => void
}

const secondsLeft = (expiresAt: string, now: number) => Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000))

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// The page a worker holds for the owner's run, shown as pictures that refresh while the dialog is open. Clicks, typing and the
// wheel go straight to that page; nothing typed is kept here. "I'm done" tells the run to look again whether the check passed.
export const TakeoverPanel = ({ id, accountEmail, onClose }: Props) => {
   // The picture on screen. Brain is asked for a newer one than this, and answers with a few bytes while there is none.
   const [picture, setPicture] = useState<{ seq: number; jpeg: string }>()
   const frame = trpc.takeover.frame.useQuery(
      {
         id,
         since: picture?.seq,
      },
      {
         retry: false,
         refetchInterval: FRAME_MS,
         gcTime: 0,
         placeholderData: keepPreviousData,
      }
   )
   const send = trpc.takeover.send.useMutation()
   const typing = useRef(new TypingBuffer())
   const [now, setNow] = useState(() => Date.now())

   const { mutate } = send
   const { data } = frame

   // A newer picture replaces the one on screen; set while rendering, since it only follows what the query just returned.
   if (data?.jpeg && data.seq !== picture?.seq) {
      setPicture({
         seq: data.seq,
         jpeg: data.jpeg,
      })
   }

   useEffect(() => {
      const timer = setInterval(() => {
         setNow(Date.now())

         const input = typing.current.take()

         if (input) {
            mutate({
               id,
               input,
            })
         }
      }, TYPING_MS)

      return () => clearInterval(timer)
   }, [id, mutate])

   const finish = (kind: 'done' | 'give_up') => {
      send.mutate(
         {
            id,
            input: { kind },
         },
         { onSettled: onClose }
      )
   }

   if (frame.error) {
      return (
         <div className="grid gap-4">
            <p className="text-sm">
               This sign-in is not waiting for you any more. It may have finished, or the time ran out.
            </p>
            <Button onClick={onClose}>Close</Button>
         </div>
      )
   }

   return (
      <div className="grid gap-3">
         <p className="text-muted-foreground text-sm">
            LinkedIn stopped the sign-in for <span className="text-foreground font-medium">{accountEmail}</span> at a security
            check. Finish it here, as you would on your own screen, then press I am done. What you type goes straight to the
            page and is not saved; the video of this run still shows what the screen showed.
         </p>

         {/* The keys go to the page, so this must hold focus. */}
         <div
            role="application"
            aria-label="The browser holding your sign-in"
            tabIndex={0}
            className="focus-visible:ring-ring relative overflow-hidden rounded-md border bg-black/5 outline-none focus-visible:ring-2"
            onKeyDown={event => {
               const input = keyInput(event)

               if (!input) {
                  return
               }

               event.preventDefault()

               if (input.kind === 'type') {
                  typing.current.add(input.text)

                  return
               }

               // Anything typed before the key must reach the page first, in order.
               const typed = typing.current.take()

               if (typed) {
                  send.mutate({ id, input: typed })
               }

               send.mutate({ id, input })
            }}
            onWheel={event => {
               send.mutate({
                  id,
                  input: {
                     kind: 'scroll',
                     dy: Math.max(-MAX_SCROLL, Math.min(MAX_SCROLL, Math.round(event.deltaY))),
                  },
               })
            }}
         >
            {picture ? (
               <img
                  alt="The page of the sign-in"
                  draggable={false}
                  className="block w-full cursor-pointer select-none"
                  src={`data:image/jpeg;base64,${picture.jpeg}`}
                  onClick={event => {
                     const at = clickFraction(event, event.currentTarget.getBoundingClientRect())

                     if (at) {
                        send.mutate({
                           id,
                           input: {
                              kind: 'click',
                              ...at,
                           },
                        })
                     }

                     event.currentTarget.parentElement?.focus()
                  }}
               />
            ) : (
               <div className="text-muted-foreground grid h-64 place-items-center text-sm">Loading the page...</div>
            )}
         </div>

         <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">
               {data ? `The run waits ${clock(secondsLeft(data.expires_at, now))} more.` : ''}
               {data?.age_ms === undefined ? '' : ` Page updated ${(data.age_ms / 1000).toFixed(1)} s ago.`}
               {send.error ? ` ${send.error.message}` : ''}
            </span>
            <div className="flex gap-2">
               <Button variant="outline" disabled={send.isPending} onClick={() => finish('give_up')}>
                  Give up
               </Button>
               <Button disabled={send.isPending} onClick={() => finish('done')}>
                  I am done
               </Button>
            </div>
         </div>
      </div>
   )
}
