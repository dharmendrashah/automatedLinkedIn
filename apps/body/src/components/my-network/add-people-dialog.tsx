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
import { useState } from 'react'

import { type Client } from './types'

import { trpc } from '../../trpc'

const NEW_LIST = 'new'

type Props = {
   client: Client
   open: boolean
   onOpenChange: (open: boolean) => void
}

const resultLine = ({ added, skipped, invalid }: { added: number; skipped: number; invalid: number }) =>
   `Added ${added}, skipped ${skipped} (already here or do not contact), ${invalid} not profile links.`

// Pasted profile links go into a list of the client, picked or named here. Nothing is read or charged.
export const AddPeopleDialog = ({ client, open, onOpenChange }: Props) => {
   const utils = trpc.useUtils()
   const [urls, setUrls] = useState('')
   const [listId, setListId] = useState(client.lists[0]?.id ?? NEW_LIST)
   const [listName, setListName] = useState('')
   const add = trpc.people.add.useMutation({ onSuccess: () => utils.people.invalidate() })
   const naming = listId === NEW_LIST
   const ready = urls.trim() !== '' && (!naming || listName.trim() !== '')

   const close = (next: boolean) => {
      if (!next) {
         add.reset()
         setUrls('')
         setListName('')
      }

      onOpenChange(next)
   }

   return (
      <Dialog open={open} onOpenChange={close}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Add people to {client.name}</DialogTitle>
               <DialogDescription>
                  Paste LinkedIn profile links, up to 200. They show as found by the list you pick. Nothing is read or
                  charged.
               </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
               <Textarea
                  value={urls}
                  onChange={event => setUrls(event.target.value)}
                  placeholder="https://www.linkedin.com/in/…"
                  aria-label="Profile links"
                  rows={6}
               />
               <div className="grid gap-1.5">
                  <Label htmlFor="add-people-list">List</Label>
                  <Select value={listId} onValueChange={setListId}>
                     <SelectTrigger id="add-people-list" size="sm">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {client.lists.map(({ id, name }) => (
                           <SelectItem key={id} value={id}>
                              {name}
                           </SelectItem>
                        ))}
                        <SelectItem value={NEW_LIST}>A new list…</SelectItem>
                     </SelectContent>
                  </Select>
                  {naming ? (
                     <Input
                        value={listName}
                        onChange={event => setListName(event.target.value)}
                        placeholder="Name of the new list"
                        aria-label="Name of the new list"
                        maxLength={80}
                     />
                  ) : null}
               </div>
               {add.data ? (
                  <p className="text-sm" role="status">
                     {resultLine(add.data)}
                  </p>
               ) : null}
               {add.error ? <p className="text-destructive text-sm">{readableError(add.error)}</p> : null}
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={() => close(false)}>
                  {add.data ? 'Close' : 'Cancel'}
               </Button>
               <Button
                  disabled={!ready || add.isPending}
                  onClick={() =>
                     add.mutate({
                        clientId: client.id,
                        urls,
                        ...(naming ? { listName: listName.trim() } : { listId }),
                     })
                  }
               >
                  Add people
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
