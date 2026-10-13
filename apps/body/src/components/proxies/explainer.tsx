import { Button } from '@/components/ui/button'
import { tone } from '@/lib/tone'
import { Info, Network, ShieldCheck, Star, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

const KEY = 'proxies.explainer.hidden'

const readHidden = () => {
   try {
      return window.localStorage.getItem(KEY) === 'yes'
   } catch {
      return false
   }
}

const POINTS = [
   {
      icon: Network,
      title: 'What it is',
      text: 'A proxy is the internet address LinkedIn sees when we sign in as you. It decides where in the world you appear to be.',
   },
   {
      icon: ShieldCheck,
      title: 'Why it matters',
      text: 'We never open LinkedIn directly. A clean, steady address keeps your account looking normal; a reported one can get it noticed.',
   },
   {
      icon: Star,
      title: 'What we do',
      text: 'Every account uses its own proxies. We test them every day and use the healthiest. This page tells you when one needs a look.',
   },
]

// A short, plain explanation of what a proxy is for. It can be hidden, and comes back with one click.
export const Explainer = () => {
   const [hidden, setHidden] = useState(readHidden)

   const set = (value: boolean) => {
      setHidden(value)

      try {
         window.localStorage.setItem(KEY, value ? 'yes' : 'no')
      } catch {
         // A browser that does not keep it just shows the explainer again next time.
      }
   }

   if (hidden) {
      return (
         <Button variant="link" size="sm" className="w-fit px-0" onClick={() => set(false)}>
            <Info />
            What is a proxy?
         </Button>
      )
   }

   return (
      <section className={cn('grid gap-3 rounded-xl border p-4', tone.info.panel)} aria-label="What is a proxy">
         <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">New to proxies? Here is the short version</h3>
            <Button
               variant="ghost"
               size="icon"
               className="-mt-1 -mr-1 size-7"
               aria-label="Hide this"
               onClick={() => set(true)}
            >
               <X />
            </Button>
         </div>
         <div className="grid gap-4 md:grid-cols-3">
            {POINTS.map(({ icon: Icon, title, text }) => (
               <div key={title} className="flex gap-3">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', tone.info.text)} aria-hidden />
                  <div className="grid gap-0.5">
                     <p className="text-sm font-medium">{title}</p>
                     <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
                  </div>
               </div>
            ))}
         </div>
      </section>
   )
}
