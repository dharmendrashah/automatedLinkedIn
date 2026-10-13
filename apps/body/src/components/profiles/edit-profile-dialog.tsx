import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { type Profile, type ProfileStatus } from './types'

import { trpc } from '../../trpc'
import { type FormValues, buildChanges, toFormValues } from './profile-form'
import { profileStatuses } from './profile-statuses'

const textFields = [
   {
      key: 'fullName',
      label: 'Name',
   },
   {
      key: 'headline',
      label: 'Headline',
   },
   {
      key: 'company',
      label: 'Company',
   },
   {
      key: 'location',
      label: 'Location',
   },
] as const

type FormProps = {
   profile: Profile
   onClose: () => void
}

const EditForm = ({ profile, onClose }: FormProps) => {
   const utils = trpc.useUtils()
   const [values, setValues] = useState<FormValues>(() => toFormValues(profile))

   const update = trpc.linkedInProfile.update.useMutation({
      onSuccess: () => {
         onClose()
         void utils.linkedInProfile.list.invalidate()
      },
   })

   const changes = buildChanges(profile, values)
   const changed = Object.keys(changes).length > 0

   const change = (key: keyof FormValues, value: string) => setValues(current => ({ ...current, [key]: value }))

   const submit = (event: FormEvent) => {
      event.preventDefault()
      update.mutate({
         id: profile.id,
         ...changes,
      })
   }

   return (
      <form onSubmit={submit} className="grid gap-6">
         <DialogHeader>
            <DialogTitle>Edit {profile.fullName ?? profile.slug}</DialogTitle>
            <DialogDescription>
               The link cannot be changed. Add what you know about this person and where you are with them.
            </DialogDescription>
         </DialogHeader>

         <div className="grid gap-4 sm:grid-cols-2">
            {textFields.map(({ key, label }) => (
               <div key={key} className="grid gap-2">
                  <Label htmlFor={`profile-${key}`}>{label}</Label>
                  <Input
                     id={`profile-${key}`}
                     value={values[key]}
                     onChange={event => change(key, event.target.value)}
                     maxLength={key === 'headline' ? 300 : 200}
                  />
               </div>
            ))}

            <div className="grid gap-2">
               <Label htmlFor="profile-status">Status</Label>
               <Select value={values.status} onValueChange={value => change('status', value as ProfileStatus)}>
                  <SelectTrigger id="profile-status">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     {Object.entries(profileStatuses).map(([value, { label }]) => (
                        <SelectItem key={value} value={value}>
                           {label}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>

            <div className="grid gap-2">
               <Label htmlFor="profile-tags">Tags</Label>
               <Input
                  id="profile-tags"
                  placeholder="vip, conference"
                  value={values.tags}
                  onChange={event => change('tags', event.target.value)}
                  aria-describedby="profile-tags-hint"
               />
               <p id="profile-tags-hint" className="text-muted-foreground text-xs">
                  Separate with commas. Up to 10, 30 characters each.
               </p>
            </div>
         </div>

         <div className="grid gap-2">
            <Label htmlFor="profile-notes">Notes</Label>
            <Textarea
               id="profile-notes"
               rows={4}
               maxLength={5000}
               value={values.notes}
               onChange={event => change('notes', event.target.value)}
            />
         </div>

         {update.error ? (
            <Alert variant="destructive">
               <AlertTitle>We could not save your changes</AlertTitle>
               <AlertDescription>{readableError(update.error)}</AlertDescription>
            </Alert>
         ) : null}

         <DialogFooter className="items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">{changed ? '' : 'No changes yet.'}</p>
            <div className="flex gap-2">
               <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
               </Button>
               <Button type="submit" disabled={!changed || update.isPending}>
                  {update.isPending ? <Loader2 className="animate-spin" /> : null}
                  Save changes
               </Button>
            </div>
         </DialogFooter>
      </form>
   )
}

type Props = {
   profile: Profile | null
   onClose: () => void
}

// The form mounts only while open, so each edit starts from the saved values.
export const EditProfileDialog = ({ profile, onClose }: Props) => (
   <Dialog open={Boolean(profile)} onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
         {profile ? <EditForm key={profile.id} profile={profile} onClose={onClose} /> : null}
      </DialogContent>
   </Dialog>
)
