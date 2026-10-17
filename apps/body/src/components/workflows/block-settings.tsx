import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CircleAlert, Minus, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import { BlockOutput } from './block-output'

import { BLOCK_ICONS, tileOf } from './block-look'
import { type FlowNode } from './graph-convert'
import { type ConfigValue, type Field } from './types'

type Choice = { id: string; name: string }

type Props = {
   node: FlowNode | null
   problems: { message: string; level: 'error' | 'note' }[]
   icps: Choice[]
   workflows: Choice[]
   onChange: (key: string, value: ConfigValue) => void
   onRemove: () => void
   onClose: () => void
   // The run shown on the canvas: the dialog then also shows what this block passed on in it.
   output?: { runId: string; rounds: number } | null
}

const textOf = (value: ConfigValue | undefined) => (Array.isArray(value) ? value.join(', ') : String(value ?? ''))

const Stepper = ({ id, value, min, max, onChange }: { id: string; value: number; min: number; max: number; onChange: (next: number) => void }) => {
   const clamp = (next: number) => Math.min(max, Math.max(min, Number.isFinite(next) ? next : min))

   return (
      <div className="flex w-44 items-center gap-1">
         <Button type="button" variant="outline" size="icon" aria-label="Less" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
            <Minus />
         </Button>
         <Input
            id={id}
            type="number"
            inputMode="numeric"
            className="text-center"
            min={min}
            max={max}
            value={value}
            onChange={event => onChange(clamp(Number(event.target.value)))}
         />
         <Button type="button" variant="outline" size="icon" aria-label="More" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
            <Plus />
         </Button>
      </div>
   )
}

// Words as chips: Enter or a comma adds one, Backspace on an empty box removes the last.
const TagInput = ({ id, value, onChange }: { id: string; value: string[]; onChange: (next: string[]) => void }) => {
   const [draft, setDraft] = useState('')
   const add = () => {
      const words = draft
         .split(',')
         .map(word => word.trim())
         .filter(word => word && !value.includes(word))

      if (words.length > 0) {
         onChange([...value, ...words])
      }

      setDraft('')
   }

   return (
      <div className="focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-2 py-1 focus-within:ring-2">
         {value.map(word => (
            <span key={word} className="bg-muted flex items-center gap-1 rounded-md px-2 py-0.5 text-xs">
               {word}
               <button type="button" aria-label={`Remove ${word}`} onClick={() => onChange(value.filter(item => item !== word))}>
                  <X className="size-3" />
               </button>
            </span>
         ))}
         <input
            id={id}
            className="min-w-24 flex-1 bg-transparent text-sm outline-none"
            placeholder={value.length === 0 ? 'Type and press Enter' : ''}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={add}
            onKeyDown={event => {
               if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault()
                  add()
               } else if (event.key === 'Backspace' && !draft && value.length > 0) {
                  onChange(value.slice(0, -1))
               }
            }}
         />
      </div>
   )
}

const Chips = ({
   id,
   options,
   isOn,
   onToggle,
}: {
   id: string
   options: { value: string; label: string }[]
   isOn: (value: string) => boolean
   onToggle: (value: string) => void
}) => (
   <div id={id} className="flex flex-wrap gap-2">
      {options.map(option => (
         <button
            key={option.value}
            type="button"
            aria-pressed={isOn(option.value)}
            onClick={() => onToggle(option.value)}
            className={cn(
               'rounded-full border px-3 py-1 text-sm transition-colors',
               isOn(option.value) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
            )}
         >
            {option.label}
         </button>
      ))}
   </div>
)

const SHORT_LIST = 4

// A block's settings over the canvas. Every change applies at once; the canvas's Save keeps them.
export const BlockSettings = ({ node, problems, icps, workflows, onChange, onRemove, onClose, output }: Props) => {
   if (!node) {
      return null
   }

   const { block, config } = node.data
   const Icon = BLOCK_ICONS[block.type]
   const values: Record<string, ConfigValue | undefined> = {
      ...block.defaults,
      ...config,
   }
   const typed = (key: string, next: string): ConfigValue => {
      const fallback = block.defaults[key]

      return typeof fallback === 'number' ? Number(next) : typeof fallback === 'boolean' ? next === 'true' : next
   }

   const field = (item: Field) => {
      const id = `setting-${node.id}-${item.key}`
      const value = values[item.key]

      if (item.kind === 'int') {
         return <Stepper id={id} value={Number(value ?? item.min)} min={item.min} max={item.max} onChange={next => onChange(item.key, next)} />
      }

      if (item.kind === 'words') {
         return <TagInput id={id} value={Array.isArray(value) ? value : []} onChange={next => onChange(item.key, next)} />
      }

      if (item.kind === 'multi') {
         const chosen = Array.isArray(value) ? value : []

         return (
            <Chips
               id={id}
               options={item.options}
               isOn={option => chosen.includes(option)}
               onToggle={option =>
                  onChange(
                     item.key,
                     chosen.includes(option) ? chosen.filter(each => each !== option) : [...chosen, option]
                  )
               }
            />
         )
      }

      if (item.kind === 'select' && item.options.length <= SHORT_LIST) {
         return <Chips id={id} options={item.options} isOn={option => textOf(value) === option} onToggle={option => onChange(item.key, typed(item.key, option))} />
      }

      if (item.kind === 'select' || item.kind === 'icp' || item.kind === 'workflow') {
         const options =
            item.kind === 'icp'
               ? icps.map(icp => ({ value: icp.id, label: icp.name }))
               : item.kind === 'workflow'
                 ? workflows.map(other => ({ value: other.id, label: other.name }))
                 : item.options
         const placeholder = {
            icp: 'Pick an ideal customer',
            workflow: 'Pick a workflow',
            select: 'Pick one',
         }[item.kind]

         return (
            <Select value={textOf(value)} onValueChange={next => onChange(item.key, typed(item.key, next))}>
               <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder={placeholder} />
               </SelectTrigger>
               <SelectContent>
                  {options.map(option => (
                     <SelectItem key={option.value} value={option.value}>
                        {option.label}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         )
      }

      return (
         <Input
            id={id}
            type={item.kind === 'time' ? 'time' : 'text'}
            value={textOf(value)}
            onChange={event => onChange(item.key, event.target.value)}
         />
      )
   }

   const settings =
      block.fields.length === 0 ? (
         <p className="text-muted-foreground text-sm">This block has nothing to set.</p>
      ) : (
         <div className="grid max-h-[60vh] gap-5 overflow-y-auto pr-1">
            {block.fields.map(item => (
               <div key={item.key} className="grid gap-2">
                  <Label htmlFor={`setting-${node.id}-${item.key}`}>{item.label}</Label>
                  {field(item)}
                  {'hint' in item && item.hint ? <p className="text-muted-foreground text-xs">{item.hint}</p> : null}
               </div>
            ))}
         </div>
      )

   return (
      <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
         <DialogContent className={output ? 'sm:max-w-3xl' : 'sm:max-w-xl'}>
            <DialogHeader>
               <div className="flex items-center gap-3">
                  <span className={cn('grid size-10 place-items-center rounded-lg', tileOf(block.group))}>
                     <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="grid gap-1 text-left">
                     <DialogTitle>{block.label}</DialogTitle>
                     <DialogDescription>{block.summary}</DialogDescription>
                  </div>
               </div>
            </DialogHeader>
            {problems.length > 0 ? (
               <ul className="grid gap-1 text-sm">
                  {problems.map(problem => (
                     <li
                        key={problem.message}
                        className={cn(
                           'flex items-start gap-2',
                           problem.level === 'error' ? 'text-destructive' : 'text-warning'
                        )}
                     >
                        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {problem.message}
                     </li>
                  ))}
               </ul>
            ) : null}
            {output ? (
               <Tabs defaultValue="output">
                  <TabsList>
                     <TabsTrigger value="output">Output of the run</TabsTrigger>
                     <TabsTrigger value="settings">Settings</TabsTrigger>
                  </TabsList>
                  <TabsContent value="output">
                     <BlockOutput
                        runId={output.runId}
                        nodeId={node.id}
                        rounds={output.rounds}
                        fileName={typeof config.fileName === 'string' ? config.fileName : undefined}
                     />
                  </TabsContent>
                  <TabsContent value="settings">{settings}</TabsContent>
               </Tabs>
            ) : (
               settings
            )}
            <DialogFooter className="sm:justify-between">
               <Button type="button" variant="ghost" className="text-destructive" onClick={onRemove}>
                  <Trash2 />
                  Remove block
               </Button>
               <Button type="button" onClick={onClose}>
                  Done
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
