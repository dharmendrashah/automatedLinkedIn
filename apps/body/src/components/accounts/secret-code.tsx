import { Button } from '@/components/ui/button'
import { Check, Copy, Eye, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { type Account } from './types'

import { trpc } from '../../trpc'
import { SHOW_MS, expired, extendedDeadline, secondsLeft } from './auto-hide'
import { useRotatingCode } from './use-rotating-code'

type Shown = { secret: string; shownAt: number; deadline: number }

// The live code of the account's two-step key. The key is read once, kept only in this component, and dropped after 30 seconds, when
// the tab is hidden, on Hide, and when the drawer closes. Keep showing adds 30 seconds, up to two minutes in all.
export const SecretCode = ({ account }: { account: Account }) => {
   const reveal = trpc.linkedInAccount.reveal.useMutation()
   const [shown, setShown] = useState<Shown | null>(null)
   const [now, setNow] = useState(() => Date.now())
   const [note, setNote] = useState<string | null>(null)
   const [copied, setCopied] = useState(false)
   const { code } = useRotatingCode(shown?.secret)
   const { deadline } = shown ?? { deadline: 0 }

   const hide = useCallback((why: string | null) => {
      setShown(null)
      setNote(why)
      setCopied(false)
   }, [])

   useEffect(() => {
      if (!shown) {
         return
      }

      const tick = setInterval(() => {
         const time = Date.now()

         setNow(time)

         if (expired(deadline, time)) {
            hide('Hidden for safety.')
         }
      }, 500)
      const onVisibility = () => (document.hidden ? hide('Hidden for safety.') : undefined)

      document.addEventListener('visibilitychange', onVisibility)

      return () => {
         clearInterval(tick)
         document.removeEventListener('visibilitychange', onVisibility)
      }
   }, [shown, deadline, hide])

   const show = () => {
      setNote(null)
      reveal.mutate(
         { id: account.id },
         {
            onSuccess: data => {
               const time = Date.now()
               const { totpSecret } = data.secrets

               reveal.reset()

               if (totpSecret) {
                  setNow(time)
                  setShown({ secret: totpSecret, shownAt: time, deadline: time + SHOW_MS })
               } else {
                  setNote('No two-step key is saved for this account.')
               }
            },
            onError: () => {
               reveal.reset()
               setNote('Could not show the details.')
            },
         }
      )
   }

   const copy = () => {
      if (!code) {
         return
      }

      void navigator.clipboard.writeText(code).then(
         () => setCopied(true),
         () => toast.error('Could not copy the code.')
      )
   }

   if (!account.hasTotp) {
      return <p className="text-muted-foreground text-sm">No two-step key is saved for this account.</p>
   }

   if (!shown || !code) {
      return (
         <div className="grid gap-1">
            <Button
               variant="outline"
               size="sm"
               className="w-fit"
               disabled={reveal.isPending || shown !== null}
               onClick={show}
            >
               {reveal.isPending || shown ? <Loader2 className="animate-spin" /> : <Eye />}
               Show code
            </Button>
            <p className="text-muted-foreground text-xs" role="status">
               {note ?? 'Shows the six-digit code from your authenticator app. It hides itself after 30 seconds.'}
            </p>
         </div>
      )
   }

   return (
      <div className="grid gap-2">
         <p className="font-mono text-2xl tabular-nums" aria-live="polite">
            {code.slice(0, 3)} {code.slice(3)}
         </p>
         <p className="text-muted-foreground text-xs">Hides in {secondsLeft(shown.deadline, now)} s.</p>
         <div className="flex flex-wrap gap-2">
            <Button
               variant="outline"
               size="sm"
               onClick={() => setShown({ ...shown, deadline: extendedDeadline(shown.deadline, shown.shownAt) })}
            >
               Keep showing
            </Button>
            <Button variant="outline" size="sm" onClick={copy}>
               {copied ? <Check /> : <Copy />}
               {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => hide(null)}>
               Hide
            </Button>
         </div>
      </div>
   )
}
