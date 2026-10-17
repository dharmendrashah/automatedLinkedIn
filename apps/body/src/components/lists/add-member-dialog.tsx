import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readableError } from '@/lib/trpc-error'
import { Loader2, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { type MemberState, isMemberState, memberStates } from './types'

import { trpc } from '../../trpc'
import { TextField } from '../links/record-fields'

const EMPTY = {
   url: '',
   name: '',
   headline: '',
   location: '',
}

const textFields = [
   {
      key: 'name',
      label: 'Name (optional)',
      maxLength: 200,
   },
   {
      key: 'headline',
      label: 'Headline (optional)',
      maxLength: 300,
   },
   {
      key: 'location',
      label: 'Location (optional)',
      maxLength: 200,
   },
] as const

type Props = {
   listId: string
   onAdded: () => void
}

export const AddMemberDialog = ({ listId, onAdded }: Props) => {
   const [open, setOpen] = useState(false)
   const [values, setValues] = useState(EMPTY)
   const [state, setState] = useState<MemberState>('QUALIFIED')

   const add = trpc.workflowList.addMember.useMutation({
      onSuccess: () => {
         setOpen(false)
         setValues(EMPTY)
         onAdded()
      },
   })

   const onOpenChange = (next: boolean) => {
      setOpen(next)
      add.reset()
   }

   const submit = (event: FormEvent) => {
      event.preventDefault()
      add.mutate({
         listId,
         ...values,
         state,
      })
   }

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogTrigger asChild>
            <Button>
               <Plus />
               Add person
            </Button>
         </DialogTrigger>
         <DialogContent className="sm:max-w-xl">
            <form onSubmit={submit} className="grid gap-6">
               <DialogHeader>
                  <DialogTitle>Add a person</DialogTitle>
                  <DialogDescription>
                     Paste their LinkedIn profile link. Add what you know; the rest can stay empty.
                  </DialogDescription>
               </DialogHeader>
               <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                     <TextField
                        id="member-url"
                        label="Profile link"
                        maxLength={500}
                        value={values.url}
                        onChange={url => setValues(current => ({ ...current, url }))}
                     />
                  </div>
                  {textFields.map(({ key, label, maxLength }) => (
                     <TextField
                        key={key}
                        id={`member-${key}`}
                        label={label}
                        maxLength={maxLength}
                        value={values[key]}
                        onChange={value => setValues(current => ({ ...current, [key]: value }))}
                     />
                  ))}
                  <div className="grid gap-2">
                     <Label htmlFor="member-state">Add as</Label>
                     <Select value={state} onValueChange={next => (isMemberState(next) ? setState(next) : undefined)}>
                        <SelectTrigger id="member-state">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {Object.entries(memberStates).map(([value, { label }]) => (
                              <SelectItem key={value} value={value}>
                                 {label}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               </div>
               {add.error ? (
                  <Alert variant="destructive">
                     <AlertDescription>{readableError(add.error)}</AlertDescription>
                  </Alert>
               ) : null}
               <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                     Cancel
                  </Button>
                  <Button type="submit" disabled={!values.url.trim() || add.isPending}>
                     {add.isPending ? <Loader2 className="animate-spin" /> : null}
                     Add
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   )
}
