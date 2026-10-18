import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronRight, CircleAlert, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { BlockOutput } from './block-output'
import { INPUT_KINDS, isInputType } from './input-kinds'
import { InputMatches } from './input-matches'
import { ScheduleSettings } from './schedule-settings'
import { Chips, ChipsInput, SearchPick, Stepper } from './setting-inputs'

import { LabelMultiSelect } from '../labels/label-multi-select'

import { BLOCK_ICONS, tileOf } from './block-look'
import { type FlowNode } from './graph-convert'
import { type Block, type ConfigValue, type Field } from './types'

type Choice = { id: string; name: string }

type Props = {
   node: FlowNode | null
   workflowId: string
   problems: { message: string; level: 'error' | 'note' }[]
   icps: Choice[]
   workflows: Choice[]
   // The blocks connected before this one.
   parents: Choice[]
   onChange: (patch: Record<string, ConfigValue>) => void
   onRemove: () => void
   onClose: () => void
   // The run shown on the canvas: the dialog then also shows what this block passed on in it.
   output?: { runId: string; rounds: number } | null
}

const textOf = (value: ConfigValue | undefined) => (Array.isArray(value) ? value.join(', ') : String(value ?? ''))

const SHORT_LIST = 4

// The safety cap of "All" when a block sets none; the same number lives in the contracts package, which body does not
// load at runtime.
const ALL_CAP = 1_000

const KINDS: Record<string, string> = {
   post: 'posts',
   profile: 'people',
   company: 'companies',
}

// "Takes posts, gives people", from what the block reads and passes on.
const flowOf = (block: Block) => {
   if (block.type === 'process.merge') {
      return 'Takes anything, gives one stream'
   }

   if (block.type === 'logic.runWorkflow') {
      return 'Takes anything, gives what it got or the people the other workflow saved'
   }

   const takes = block.input && KINDS[block.input] ? `Takes ${KINDS[block.input]}` : 'Starts on its own'
   const gives = block.output && KINDS[block.output] ? `gives ${KINDS[block.output]}` : ''

   return [takes, gives].filter(Boolean).join(', ')
}

// A block's settings over the canvas. Every change applies at once; the canvas's Save keeps them.
export const BlockSettings = ({ node, workflowId, problems, icps, workflows, parents, onChange: onPatch, onRemove, onClose, output }: Props) => {
   if (!node) {
      return null
   }

   const onChange = (key: string, value: ConfigValue) => onPatch({ [key]: value })

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
         const words = Array.isArray(value) ? value : []

         return item.suggest === 'labels' ? (
            <LabelMultiSelect
               id={id}
               kind={isInputType(block.type) ? INPUT_KINDS[block.type] : 'people'}
               value={words}
               onChange={next => onChange(item.key, next)}
               placeholder="Pick or create labels"
            />
         ) : (
            <ChipsInput id={id} kind={item.suggest} value={words} onChange={next => onChange(item.key, next)} />
         )
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

      if (item.kind === 'search') {
         return (
            <SearchPick id={id} options={item.options} max={item.max} value={Array.isArray(value) ? value : []} onChange={next => onChange(item.key, next)} />
         )
      }

      if (item.kind === 'toggle') {
         return (
            <Checkbox id={id} checked={value === true} onCheckedChange={next => onChange(item.key, next === true)} />
         )
      }

      if (item.kind === 'limit') {
         const all = values[item.allKey] === true

         return (
            <div className="grid gap-2">
               <Chips
                  id={id}
                  options={[
                     { value: 'all', label: `All (up to ${(item.allCap ?? ALL_CAP).toLocaleString('en-US')})` },
                     { value: 'some', label: 'Up to a number' },
                  ]}
                  isOn={option => (option === 'all') === all}
                  onToggle={option => onChange(item.allKey, option === 'all')}
               />
               {all ? null : (
                  <Stepper id={`${id}-count`} value={Number(value ?? item.min)} min={item.min} max={item.max} onChange={next => onChange(item.key, next)} />
               )}
            </div>
         )
      }

      if (item.kind === 'select' && item.options.length <= SHORT_LIST) {
         return <Chips id={id} options={item.options} isOn={option => textOf(value) === option} onToggle={option => onChange(item.key, typed(item.key, option))} />
      }

      if (item.kind === 'select' || item.kind === 'icp' || item.kind === 'workflow' || item.kind === 'parent') {
         const options =
            item.kind === 'icp'
               ? icps.map(icp => ({ value: icp.id, label: icp.name }))
               : item.kind === 'workflow'
                 ? workflows.map(other => ({ value: other.id, label: other.name }))
                 : item.kind === 'parent'
                   ? parents.map(parent => ({ value: parent.id, label: parent.name }))
                   : item.options
         const placeholder = {
            icp: 'Pick an ideal customer',
            workflow: 'Pick a workflow',
            parent: parents.length > 0 ? 'Pick a connected block' : 'Connect blocks into this one first',
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
            placeholder={item.kind === 'text' ? item.placeholder : undefined}
            value={textOf(value)}
            onChange={event => onChange(item.key, event.target.value)}
         />
      )
   }

   const row = (item: Field) =>
      item.kind === 'toggle' ? (
         <div key={item.key} className="grid gap-1">
            <div className="flex items-center gap-2">
               {field(item)}
               <Label htmlFor={`setting-${node.id}-${item.key}`}>{item.label}</Label>
            </div>
            {item.hint ? <p className="text-muted-foreground text-xs">{item.hint}</p> : null}
         </div>
      ) : (
         <div key={item.key} className="grid gap-2">
            <Label htmlFor={`setting-${node.id}-${item.key}`}>{item.label}</Label>
            {field(item)}
            {item.hint ? <p className="text-muted-foreground text-xs">{item.hint}</p> : null}
         </div>
      )
   const shown = (item: Field) => {
      const needed = item.showWhen
      const list = needed ? values[needed.key] : undefined

      return !needed || (Array.isArray(list) && list.length >= needed.atLeast)
   }
   const main = block.fields.filter(item => !item.advanced && shown(item))
   const more = block.fields.filter(item => item.advanced && shown(item))
   const isOn = (preset: Block['presets'][number]) =>
      Object.entries(preset.config).every(([key, wanted]) => JSON.stringify(values[key]) === JSON.stringify(wanted))
   const presets =
      block.presets.length > 0 ? (
         <div className="grid gap-2">
            <Label>Quick start</Label>
            <div className="flex flex-wrap gap-2">
               {block.presets.map(preset => (
                  <button
                     key={preset.label}
                     type="button"
                     title={preset.hint}
                     aria-pressed={isOn(preset)}
                     onClick={() => onPatch(preset.config)}
                     className={cn(
                        'grid rounded-lg border px-3 py-1.5 text-left transition-colors',
                        isOn(preset) ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                     )}
                  >
                     <span className="text-sm font-medium">{preset.label}</span>
                     <span className="text-muted-foreground text-xs">{preset.hint}</span>
                  </button>
               ))}
            </div>
         </div>
      ) : null

   const settings =
      block.type === 'trigger.schedule' ? (
         <ScheduleSettings values={values} onChange={onChange} />
      ) : block.fields.length === 0 ? (
         <p className="text-muted-foreground text-sm">This block has nothing to set.</p>
      ) : (
         <div className="grid max-h-[60vh] gap-5 overflow-y-auto pr-1">
            {isInputType(block.type) ? <InputMatches workflowId={workflowId} type={block.type} values={values} /> : null}
            {presets}
            {main.map(row)}
            {more.length > 0 ? (
               <details className="group grid gap-5">
                  <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1 text-sm">
                     <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                     More options ({more.length})
                  </summary>
                  <div className="mt-4 grid gap-5">{more.map(row)}</div>
               </details>
            ) : null}
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
                     <p className="text-muted-foreground text-xs">
                        {[flowOf(block), block.costHint].filter(Boolean).join(' · ')}
                     </p>
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
