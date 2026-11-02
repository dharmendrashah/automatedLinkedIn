import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { type GraphNode } from './types'

import { type HookPhase, HOOK_PHASES, HOOK_WORDS } from './graph-convert'
import { Chips } from './setting-inputs'

type Hooks = NonNullable<GraphNode['hooks']>

type Props = {
   nodeId: string
   label: string
   hooks: GraphNode['hooks']
   // How many blocks hang on each hook, from the lines on the canvas.
   attached: Record<HookPhase, number>
   onLabel: (label: string) => void
   onHooks: (hooks: Hooks) => void
}

const WHEN = [
   {
      value: 'items',
      label: 'Only when something is there',
    },
   {
      value: 'always',
      label: 'Every time',
    },
]

const FIRES = [
   {
      value: 'each',
      label: 'Every time the block runs',
    },
   {
      value: 'once',
      label: 'Once a run',
    },
]

const MOMENT: Record<HookPhase, string> = {
   before: 'when the block is about to start',
   on: 'when the block is working',
   after: 'when the block has finished (for sending and withdrawing, when the work is planned)',
}

// The name of a block and how its hooks behave. A hook is a line from the dots under the block to the blocks that should run then, as
// a small run of their own; they only watch, and never stop, delay or change the block.
export const BlockHooks = ({ nodeId, label, hooks, attached, onLabel, onHooks }: Props) => {
   const set = (phase: HookPhase, patch: NonNullable<Hooks[HookPhase]>) =>
      onHooks({
         ...hooks,
         [phase]: {
            ...hooks?.[phase],
            ...patch,
         },
      })

   return (
      <div className="grid gap-4 border-t pt-4">
         <div className="grid gap-2">
            <Label htmlFor={`name-${nodeId}`}>Name on the canvas</Label>
            <Input
               id={`name-${nodeId}`}
               value={label}
               maxLength={60}
               placeholder="Leave empty to use the block's own name"
               onChange={event => onLabel(event.target.value)}
            />
         </div>
         <div className="grid gap-3">
            <p className="text-sm font-medium">Hooks</p>
            {HOOK_PHASES.map(phase => {
               const options = hooks?.[phase]

               return attached[phase] === 0 ? (
                  <p key={phase} className="text-muted-foreground text-xs">
                     {HOOK_WORDS[phase]}: drag from the dot under the block to a block that should run {MOMENT[phase]}.
                  </p>
               ) : (
                  <div key={phase} className="grid gap-2 rounded-lg border p-3">
                     <p className="text-sm">
                        {HOOK_WORDS[phase]} hook, {attached[phase]} {attached[phase] === 1 ? 'block' : 'blocks'} attached
                     </p>
                     <Chips
                        id={`when-${nodeId}-${phase}`}
                        options={WHEN}
                        isOn={option => (options?.when ?? 'items') === option}
                        onToggle={option => set(phase, { when: option === 'always' ? 'always' : 'items' })}
                     />
                     <Chips
                        id={`fires-${nodeId}-${phase}`}
                        options={FIRES}
                        isOn={option => (options?.fires ?? 'each') === option}
                        onToggle={option => set(phase, { fires: option === 'once' ? 'once' : 'each' })}
                     />
                     <div className="flex items-center gap-2">
                        <Checkbox
                           id={`pause-${nodeId}-${phase}`}
                           checked={options?.off === true}
                           onCheckedChange={next => set(phase, { off: next === true })}
                        />
                        <Label htmlFor={`pause-${nodeId}-${phase}`}>Pause this hook</Label>
                     </div>
                  </div>
               )
            })}
         </div>
      </div>
   )
}
