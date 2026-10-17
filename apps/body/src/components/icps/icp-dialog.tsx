import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

import { type Icp, type Seniority, seniorityOptions, toFormValues, toInput, wordFields } from './icp-form'

import { trpc } from '../../trpc'
import { EditDialog, EditFrame } from '../links/edit-frame'
import { TextField } from '../links/record-fields'

type FormProps = {
   // null creates a new ideal customer.
   icp: Icp | null
   onClose: () => void
}

const IcpForm = ({ icp, onClose }: FormProps) => {
   const utils = trpc.useUtils()
   const [values, setValues] = useState(() => toFormValues(icp))
   const done = {
      onSuccess: () => {
         onClose()
         void utils.icp.list.invalidate()
      },
   }
   const create = trpc.icp.create.useMutation(done)
   const update = trpc.icp.update.useMutation(done)
   const save = icp ? update : create

   const toggle = (level: Seniority, on: boolean) =>
      setValues(current => ({
         ...current,
         seniorities: on
            ? [...current.seniorities, level]
            : current.seniorities.filter(chosen => chosen !== level),
      }))

   const submit = () =>
      icp
         ? update.mutate({
              id: icp.id,
              ...toInput(values),
           })
         : create.mutate(toInput(values))

   return (
      <EditFrame
         title={icp ? `Edit ${icp.name}` : 'New ideal customer'}
         description="Who you want to find. Separate words with commas; a person matches on whole words."
         changed={Boolean(values.name.trim())}
         pending={save.isPending}
         error={save.error}
         onSubmit={submit}
         onClose={onClose}
      >
         <TextField
            id="icp-name"
            label="Name"
            maxLength={100}
            value={values.name}
            onChange={name => setValues(current => ({ ...current, name }))}
         />
         <div className="grid gap-4 sm:grid-cols-2">
            {wordFields.map(({ key, label }) => (
               <TextField
                  key={key}
                  id={`icp-${key}`}
                  label={label}
                  maxLength={2000}
                  value={values[key]}
                  onChange={value => setValues(current => ({ ...current, [key]: value }))}
               />
            ))}
         </div>
         <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Seniority</legend>
            <div className="flex flex-wrap gap-4">
               {seniorityOptions.map(({ level, label }) => (
                  <div key={level} className="flex items-center gap-2">
                     <Checkbox
                        id={`icp-seniority-${level}`}
                        checked={values.seniorities.includes(level)}
                        onCheckedChange={checked => toggle(level, checked === true)}
                     />
                     <Label htmlFor={`icp-seniority-${level}`}>{label}</Label>
                  </div>
               ))}
            </div>
         </fieldset>
      </EditFrame>
   )
}

type Props = {
   open: boolean
   icp: Icp | null
   onClose: () => void
}

// The form mounts only while open, so each edit starts from the saved values.
export const IcpDialog = ({ open, icp, onClose }: Props) => (
   <EditDialog open={open} onClose={onClose}>
      {open ? <IcpForm key={icp?.id ?? 'new'} icp={icp} onClose={onClose} /> : null}
   </EditDialog>
)
