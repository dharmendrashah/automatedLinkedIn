import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { type FlowNode } from './graph-convert'
import { type ConfigValue, type Field } from './types'

type Props = {
   node: FlowNode | null
   icps: { id: string; name: string }[]
   workflows: { id: string; name: string }[]
   onChange: (key: string, value: ConfigValue) => void
   onRemove: () => void
}

const textOf = (value: ConfigValue | undefined) => (Array.isArray(value) ? value.join(', ') : String(value ?? ''))

const WordsInput = ({ id, value, onCommit }: { id: string; value: string; onCommit: (words: string[]) => void }) => {
   const [text, setText] = useState(value)

   return (
      <Input
         id={id}
         value={text}
         onChange={event => setText(event.target.value)}
         onBlur={() =>
            onCommit(
               text
                  .split(',')
                  .map(word => word.trim())
                  .filter(Boolean)
            )
         }
      />
   )
}

// Settings of the selected block, drawn from the block's own list of fields.
export const SettingsPanel = ({ node, icps, workflows, onChange, onRemove }: Props) => {
   if (!node) {
      return <p className="text-muted-foreground p-3 text-sm">Select a block to change its settings.</p>
   }

   const { block, config } = node.data
   const values: Record<string, ConfigValue | undefined> = {
      ...block.defaults,
      ...config,
   }
   const isNumber = (key: string) => typeof block.defaults[key] === 'number'
   const isBoolean = (key: string) => typeof block.defaults[key] === 'boolean'
   const typed = (key: string, next: string) =>
      isNumber(key) ? Number(next) : isBoolean(key) ? next === 'true' : next

   const field = (item: Field) => {
      const id = `setting-${node.id}-${item.key}`
      const value = values[item.key]

      if (item.kind === 'multi') {
         const chosen = new Set(Array.isArray(value) ? value : [])

         return (
            <div id={id} className="grid gap-2">
               {item.options.map(option => (
                  <div key={option.value} className="flex items-center gap-2">
                     <Checkbox
                        id={`${id}-${option.value}`}
                        checked={chosen.has(option.value)}
                        onCheckedChange={checked =>
                           onChange(
                              item.key,
                              item.options
                                 .map(({ value: each }) => each)
                                 .filter(each => (each === option.value ? checked === true : chosen.has(each)))
                           )
                        }
                     />
                     <Label htmlFor={`${id}-${option.value}`} className="font-normal">
                        {option.label}
                     </Label>
                  </div>
               ))}
            </div>
         )
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

      if (item.kind === 'int') {
         return (
            <Input
               id={id}
               type="number"
               min={item.min}
               max={item.max}
               value={textOf(value)}
               onChange={event => onChange(item.key, Number(event.target.value))}
            />
         )
      }

      if (item.kind === 'words') {
         return <WordsInput key={id} id={id} value={textOf(value)} onCommit={words => onChange(item.key, words)} />
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

   return (
      <div className="grid content-start gap-4 p-3">
         <div className="grid gap-1">
            <p className="font-medium">{block.label}</p>
            <p className="text-muted-foreground text-sm">{block.summary}</p>
         </div>
         {block.fields.map(item => (
            <div key={item.key} className="grid gap-2">
               <Label htmlFor={`setting-${node.id}-${item.key}`}>{item.label}</Label>
               {field(item)}
               {'hint' in item && item.hint ? <p className="text-muted-foreground text-xs">{item.hint}</p> : null}
            </div>
         ))}
         <Button variant="outline" className="justify-self-start" onClick={onRemove}>
            <Trash2 />
            Remove block
         </Button>
      </div>
   )
}
