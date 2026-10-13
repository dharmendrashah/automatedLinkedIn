import { useState } from 'react'

import { type Company } from './types'

import { trpc } from '../../trpc'
import { EditDialog, EditFrame } from '../links/edit-frame'
import { hasChanges } from '../links/form-rules'
import { NotesField, StatusField, TagsField, TextField } from '../links/record-fields'
import { type FormValues, buildChanges, toFormValues } from './company-form'

const textFields = [
   {
      key: 'name',
      label: 'Name',
      maxLength: 200,
   },
   {
      key: 'industry',
      label: 'Industry',
      maxLength: 200,
   },
   {
      key: 'website',
      label: 'Website',
      maxLength: 300,
   },
   {
      key: 'size',
      label: 'Size',
      maxLength: 50,
   },
   {
      key: 'location',
      label: 'Location',
      maxLength: 200,
   },
] as const

type FormProps = {
   company: Company
   onClose: () => void
}

const EditForm = ({ company, onClose }: FormProps) => {
   const utils = trpc.useUtils()
   const [values, setValues] = useState<FormValues>(() => toFormValues(company))

   const update = trpc.linkedInCompany.update.useMutation({
      onSuccess: () => {
         onClose()
         void utils.linkedInCompany.list.invalidate()
      },
   })

   const changes = buildChanges(company, values)

   const change = (key: keyof FormValues, value: string) => setValues(current => ({ ...current, [key]: value }))

   return (
      <EditFrame
         title={`Edit ${company.name ?? company.slug}`}
         description="The link cannot be changed. Add what you know about this company and where you are with them."
         changed={hasChanges(changes)}
         pending={update.isPending}
         error={update.error}
         onSubmit={() =>
            update.mutate({
               id: company.id,
               ...changes,
            })
         }
         onClose={onClose}
      >
         <div className="grid gap-4 sm:grid-cols-2">
            {textFields.map(({ key, label, maxLength }) => (
               <TextField
                  key={key}
                  id={`company-${key}`}
                  label={label}
                  maxLength={maxLength}
                  value={values[key]}
                  onChange={value => change(key, value)}
               />
            ))}
            <StatusField
               id="company-status"
               value={values.status}
               onChange={status => setValues(current => ({ ...current, status }))}
            />
            <TagsField id="company-tags" value={values.tags} onChange={value => change('tags', value)} />
         </div>
         <NotesField id="company-notes" value={values.notes} onChange={value => change('notes', value)} />
      </EditFrame>
   )
}

type Props = {
   company: Company | null
   onClose: () => void
}

// The form mounts only while open, so each edit starts from the saved values.
export const EditCompanyDialog = ({ company, onClose }: Props) => (
   <EditDialog open={Boolean(company)} onClose={onClose}>
      {company ? <EditForm key={company.id} company={company} onClose={onClose} /> : null}
   </EditDialog>
)
