import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { readableError } from '@/lib/trpc-error'
import { VOICE_TONES } from '@automatedLinkedIn/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'
import { ChipsInput } from './setting-inputs'

const EMPTY = {
   name: '',
   about: '',
   tone: 'friendly' as (typeof VOICE_TONES)[number],
   language: '',
   avoid: [] as string[],
   rules: '',
}

// Who the owner is and how they sound, kept to pick again in any Write words block.
const VoiceDialog = ({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) => {
   const utils = trpc.useUtils()
   const [voice, setVoice] = useState(EMPTY)
   const save = trpc.voice.save.useMutation({
      onSuccess: async saved => {
         await utils.voice.list.invalidate()
         onSaved(saved.id)
         onClose()
      },
      onError: error => toast.error(readableError(error)),
   })
   const set = (patch: Partial<typeof EMPTY>) => setVoice(current => ({ ...current, ...patch }))

   return (
      <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>New voice</DialogTitle>
               <DialogDescription>Who you are and how you sound. The AI writes in it.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
               <div className="grid gap-1">
                  <Label htmlFor="voice-name">Name</Label>
                  <Input id="voice-name" value={voice.name} onChange={event => set({ name: event.target.value })} />
               </div>
               <div className="grid gap-1">
                  <Label htmlFor="voice-about">About us</Label>
                  <Textarea
                     id="voice-about"
                     maxLength={600}
                     value={voice.about}
                     placeholder="We help B2B teams cut onboarding time."
                     onChange={event => set({ about: event.target.value })}
                  />
                  <p className="text-muted-foreground text-xs">{`${voice.about.length} / 600`}</p>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                     <Label htmlFor="voice-tone">Tone</Label>
                     <Select value={voice.tone} onValueChange={tone => set({ tone: tone as typeof voice.tone })}>
                        <SelectTrigger id="voice-tone" className="w-full">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {VOICE_TONES.map(tone => (
                              <SelectItem key={tone} value={tone}>
                                 {tone[0]?.toUpperCase()}
                                 {tone.slice(1)}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="grid gap-1">
                     <Label htmlFor="voice-language">Language (empty: the same as the post)</Label>
                     <Input
                        id="voice-language"
                        value={voice.language}
                        onChange={event => set({ language: event.target.value })}
                     />
                  </div>
               </div>
               <div className="grid gap-1">
                  <Label htmlFor="voice-avoid">Never say</Label>
                  <ChipsInput id="voice-avoid" value={voice.avoid} onChange={avoid => set({ avoid })} />
               </div>
               <div className="grid gap-1">
                  <Label htmlFor="voice-rules">Extra rules</Label>
                  <Textarea
                     id="voice-rules"
                     maxLength={500}
                     value={voice.rules}
                     onChange={event => set({ rules: event.target.value })}
                  />
               </div>
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={onClose}>
                  Cancel
               </Button>
               <Button disabled={voice.name.trim() === '' || save.isPending} onClick={() => save.mutate(voice)}>
                  Save
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}

// One of the owner's writing voices, with a way to make a new one.
export const VoicePick = ({
   id,
   value,
   onChange,
}: {
   id: string
   value: string
   onChange: (next: string) => void
}) => {
   const voices = trpc.voice.list.useQuery(undefined, { retry: false })
   const [making, setMaking] = useState(false)

   return (
      <div className="flex items-center gap-2">
         <Select value={value || undefined} onValueChange={onChange}>
            <SelectTrigger id={id} className="w-full">
               <SelectValue placeholder={voices.isPending ? 'Loading voices' : 'Pick a voice'} />
            </SelectTrigger>
            <SelectContent>
               {(voices.data ?? []).map(voice => (
                  <SelectItem key={voice.id} value={voice.id}>
                     {voice.name}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
         <Button type="button" variant="outline" onClick={() => setMaking(true)}>
            + New
         </Button>
         {making ? <VoiceDialog onClose={() => setMaking(false)} onSaved={onChange} /> : null}
      </div>
   )
}
