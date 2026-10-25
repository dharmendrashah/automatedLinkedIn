import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { toast } from 'sonner'

import { type AccountBrowse, type BrowseMode, type WorkingHours } from './types'

import { hoursProblem } from './format'
import { HoursEditor } from './hours-editor'
import { ModeCards } from './mode-cards'
import { MODES, modeOf } from './modes'
import { countText, useBrowseChange } from './use-browse'

type Dialogs = 'mode' | 'hours' | 'client' | null

const sameMode = (accounts: AccountBrowse[]) => {
   const [first] = accounts

   return first && accounts.every(({ mode }) => mode === first.mode) ? first.mode : undefined
}

// The hours must fit the most demanding mode among the accounts.
const demanding = (accounts: AccountBrowse[]): BrowseMode =>
   MODES.filter(({ mode }) => accounts.some(account => account.mode === mode)).reduce(
      (most, item) => (item.minutes > most.minutes ? item : most),
      MODES[0] ?? { mode: 'SAFE' as const, label: 'Safe', minutes: 90, line: '' }
   ).mode

// Over the Activity list while rows are picked: one change for all of them, with an Undo.
export const BulkBrowseBar = ({
   accounts,
   sample,
   onClear,
}: {
   accounts: AccountBrowse[]
   sample: boolean
   onClear: () => void
}) => {
   const change = useBrowseChange(sample)
   const [open, setOpen] = useState<Dialogs>(null)
   const [client, setClient] = useState('')
   const who = countText(accounts)

   const setMode = (mode: BrowseMode) => {
      const blocked = accounts.find(account => hoursProblem(mode, account.hours))

      if (blocked) {
         toast.error(`${modeOf(mode).label} is not possible for ${blocked.email}: ${hoursProblem(mode, blocked.hours)}`)

         return
      }

      change(accounts, { mode }, `${modeOf(mode).label} set for ${who}`)
      setOpen(null)
   }

   const setHours = (hours: WorkingHours) => {
      change(accounts, { hours }, `Working hours changed for ${who}`)
      setOpen(null)
   }

   const setClientLabel = () => {
      change(accounts, { clientLabel: client.trim() || null }, `Client changed for ${who}`)
      setOpen(null)
   }

   return (
      <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
         <span className="px-1 font-medium">{accounts.length} selected</span>
         <Button size="sm" variant="outline" onClick={() => setOpen('mode')}>
            Set daily limit
         </Button>
         <Button size="sm" variant="outline" onClick={() => setOpen('hours')}>
            Set working hours
         </Button>
         <Button size="sm" variant="outline" onClick={() => setOpen('client')}>
            Set client
         </Button>
         <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
            Clear selection
         </Button>

         <Dialog open={open === 'mode'} onOpenChange={next => setOpen(next ? 'mode' : null)}>
            <DialogContent className="sm:max-w-2xl">
               <DialogHeader>
                  <DialogTitle>Set the daily limit</DialogTitle>
                  <DialogDescription>Changing {who}. You can undo it right after.</DialogDescription>
               </DialogHeader>
               <ModeCards mode={sameMode(accounts)} onChange={setMode} />
            </DialogContent>
         </Dialog>

         <Dialog open={open === 'hours'} onOpenChange={next => setOpen(next ? 'hours' : null)}>
            <DialogContent className="sm:max-w-xl">
               <DialogHeader>
                  <DialogTitle>Set the working hours</DialogTitle>
                  <DialogDescription>Changing {who}. You can undo it right after.</DialogDescription>
               </DialogHeader>
               <HoursEditor
                  mode={demanding(accounts)}
                  hours={
                     accounts[0]?.hours ?? { days: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1080, timeZone: 'UTC' }
                  }
                  proxyTimeZone={undefined}
                  saveLabel="Apply to all"
                  onSave={setHours}
               />
            </DialogContent>
         </Dialog>

         <Dialog open={open === 'client'} onOpenChange={next => setOpen(next ? 'client' : null)}>
            <DialogContent className="sm:max-w-md">
               <DialogHeader>
                  <DialogTitle>Set the client</DialogTitle>
                  <DialogDescription>Your own note for {who}. Leave it empty to remove the client.</DialogDescription>
               </DialogHeader>
               <Input
                  aria-label="Client"
                  placeholder="Client name"
                  value={client}
                  onChange={event => setClient(event.target.value)}
               />
               <Button className="w-fit" onClick={setClientLabel}>
                  Apply to all
               </Button>
            </DialogContent>
         </Dialog>
      </div>
   )
}
