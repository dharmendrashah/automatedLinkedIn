import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CircleAlert, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { BlockOutput } from './block-output'
import { ScheduleSettings } from './schedule-settings'
import { Chips, Stepper, TagInput } from './setting-inputs'

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
      block.type === 'trigger.schedule' ? (
         <ScheduleSettings values={values} onChange={onChange} />
      ) : block.fields.length === 0 ? (
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
