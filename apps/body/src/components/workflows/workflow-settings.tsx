import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { readableError } from '@/lib/trpc-error'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'

import { type Workflow } from './types'

import { trpc } from '../../trpc'

// Name and the two thresholds: qualified at or above the first number, maybe between the two.
export const WorkflowSettings = ({ workflow }: { workflow: Workflow }) => {
   const utils = trpc.useUtils()
   const navigate = useNavigate()
   const [values, setValues] = useState({
      name: workflow.name,
      qualifyScore: workflow.qualifyScore,
      maybeScore: workflow.maybeScore,
      maybeEnabled: workflow.maybeEnabled,
   })
   const update = trpc.workflow.update.useMutation({
      onSuccess: () => {
         void utils.workflow.get.invalidate({ id: workflow.id })
         void utils.workflow.list.invalidate()
      },
   })
   const remove = trpc.workflow.delete.useMutation({
      onSuccess: () => {
         void utils.workflow.list.invalidate()
         void navigate('/workflows')
      },
   })

   const submit = (event: FormEvent) => {
      event.preventDefault()
      update.mutate({
         id: workflow.id,
         ...values,
         name: values.name.trim(),
      })
   }

   return (
      <form onSubmit={submit} className="grid max-w-xl gap-4">
         <div className="grid gap-2">
            <Label htmlFor="workflow-name">Name</Label>
            <Input
               id="workflow-name"
               maxLength={100}
               value={values.name}
               onChange={event => setValues(current => ({ ...current, name: event.target.value }))}
            />
         </div>
         <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
               <Label htmlFor="qualify-score">Qualified at or above</Label>
               <Input
                  id="qualify-score"
                  type="number"
                  min={1}
                  max={100}
                  value={values.qualifyScore}
                  onChange={event => setValues(current => ({ ...current, qualifyScore: Number(event.target.value) }))}
               />
            </div>
            <div className="grid gap-2">
               <Label htmlFor="maybe-score">Maybe at or above</Label>
               <Input
                  id="maybe-score"
                  type="number"
                  min={1}
                  max={100}
                  value={values.maybeScore}
                  onChange={event => setValues(current => ({ ...current, maybeScore: Number(event.target.value) }))}
               />
            </div>
         </div>
         <div className="flex items-center gap-2">
            <Checkbox
               id="maybe-enabled"
               checked={values.maybeEnabled}
               onCheckedChange={checked => setValues(current => ({ ...current, maybeEnabled: checked === true }))}
            />
            <Label htmlFor="maybe-enabled">Keep maybe people (for 30 days, without reading their full profile)</Label>
         </div>
         <p className="text-muted-foreground text-sm">
            Each Score block now sets its own scores. These apply only to Score blocks added before that. A higher
            qualified score gives fewer, better people and costs less.
         </p>
         {update.error ? <p className="text-destructive text-sm">{readableError(update.error)}</p> : null}
         <div className="flex flex-wrap justify-between gap-2">
            <Button type="submit" disabled={update.isPending}>
               {update.isPending ? <Loader2 className="animate-spin" /> : null}
               Save settings
            </Button>
            <AlertDialog>
               <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline">
                     Delete workflow
                  </Button>
               </AlertDialogTrigger>
               <AlertDialogContent>
                  <AlertDialogHeader>
                     <AlertDialogTitle>Delete {workflow.name}?</AlertDialogTitle>
                     <AlertDialogDescription>
                        Its runs are deleted too. Its list and the people in it stay.
                     </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                     <AlertDialogCancel>Cancel</AlertDialogCancel>
                     <AlertDialogAction onClick={() => remove.mutate({ id: workflow.id })}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
               </AlertDialogContent>
            </AlertDialog>
         </div>
      </form>
   )
}
