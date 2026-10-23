import { Button } from '@/components/ui/button'
import { Check, Mic, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { formatClock } from './time'

// Bars of the picture that moves while "recording", fixed so it does not flicker on every draw.
const BARS = [6, 14, 9, 18, 11, 20, 8, 16, 12, 19, 7, 15, 10, 17, 9, 13, 6, 18, 11, 14]

type Props = {
   onDone: (seconds: number) => void
   onCancel: () => void
}

// The look of recording a voice note: a timer and a moving wave. The page never asks for the microphone and keeps no sound; the note
// that comes out is a stand-in, and this is what the real recorder will be built on.
export const VoiceRecorder = ({ onDone, onCancel }: Props) => {
   const [seconds, setSeconds] = useState(0)

   useEffect(() => {
      const timer = setInterval(() => setSeconds(value => value + 1), 1000)

      return () => clearInterval(timer)
   }, [])

   return (
      <div
         role="group"
         aria-label="Recording a voice note"
         className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
      >
         <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-3 rounded-full bg-destructive" />
         </span>
         <span className="w-10 text-sm font-medium tabular-nums" role="timer">
            {formatClock(seconds)}
         </span>
         <div aria-hidden className="flex h-6 flex-1 items-center gap-0.5 overflow-hidden">
            {BARS.map((height, index) => (
               <span
                  key={index}
                  style={{ height, animationDelay: `${index * 70}ms` }}
                  className="w-1 shrink-0 animate-pulse rounded-full bg-destructive/50 motion-reduce:animate-none"
               />
            ))}
         </div>
         <span className="hidden text-xs text-muted-foreground sm:inline">
            <Mic className="mr-1 inline size-3" aria-hidden />
            Sample: no sound is recorded
         </span>
         <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Discard the voice note">
            <X />
         </Button>
         <Button size="icon-sm" onClick={() => onDone(Math.max(1, seconds))} aria-label="Finish the voice note">
            <Check />
         </Button>
      </div>
   )
}
