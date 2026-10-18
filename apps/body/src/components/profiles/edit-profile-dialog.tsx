import { useState } from 'react'

import { type Profile } from './types'

import { trpc } from '../../trpc'
import { EditDialog, EditFrame } from '../links/edit-frame'
import { hasChanges } from '../links/form-rules'
import { NotesField, StatusField, TagsField, TextField } from '../links/record-fields'
import { type FormValues, buildChanges, toFormValues } from './profile-form'

const textFields = [
   {
      key: 'fullName',
      label: 'Name',
      maxLength: 200,
   },
   {
      key: 'headline',
      label: 'Headline',
      maxLength: 300,
   },
   {
      key: 'company',
      label: 'Company',
      maxLength: 200,
   },
   {
      key: 'location',
      label: 'Location',
      maxLength: 200,
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

   const change = (key: keyof FormValues, value: string) => setValues(current => ({ ...current, [key]: value }))

   return (
      <EditFrame
         title={`Edit ${profile.fullName ?? profile.slug}`}
         description="The link cannot be changed. Add what you know about this person and where you are with them."
         changed={hasChanges(changes)}
         pending={update.isPending}
         error={update.error}
         onSubmit={() =>
            update.mutate({
               id: profile.id,
               ...changes,
            })
         }
         onClose={onClose}
      >
         <div className="grid gap-4 sm:grid-cols-2">
            {textFields.map(({ key, label, maxLength }) => (
               <TextField
                  key={key}
                  id={`profile-${key}`}
                  label={label}
                  maxLength={maxLength}
                  value={values[key]}
                  onChange={value => change(key, value)}
               />
            ))}
            <StatusField
               id="profile-status"
               value={values.status}
               onChange={status => setValues(current => ({ ...current, status }))}
            />
            <TagsField id="profile-tags" kind="profiles" value={values.tags} onChange={value => change('tags', value)} />
         </div>
         <NotesField id="profile-notes" value={values.notes} onChange={value => change('notes', value)} />
      </EditFrame>
   )
}

type Props = {
   profile: Profile | null
   onClose: () => void
}

// The form mounts only while open, so each edit starts from the saved values.
export const EditProfileDialog = ({ profile, onClose }: Props) => (
   <EditDialog open={Boolean(profile)} onClose={onClose}>
      {profile ? <EditForm key={profile.id} profile={profile} onClose={onClose} /> : null}
   </EditDialog>
)
