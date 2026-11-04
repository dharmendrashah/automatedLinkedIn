import { DraftCard } from '@/components/drafts/draft-card'
import { type RejectReason } from '@/components/drafts/reject-reasons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../trpc'

const STATES = [
   { value: 'DRAFTED', label: 'Waiting' },
   { value: 'APPROVED', label: 'Approved' },
   { value: 'REJECTED', label: 'Rejected' },
   { value: 'EXPIRED', label: 'Expired' },
] as const

type State = (typeof STATES)[number]['value']

const PAGE = 30
const MAX = 50

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(3)}`

const isTyping = (event: KeyboardEvent) =>
   event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)

// The inbox of words that wait for the owner (.plan/lead-pipeline-p4-ai-drafts.md). It only decides: approving never posts anything, a
// workflow with "When I approve" goes on with what was approved. Keys: J and K move, A approves, E edits.
export const Approve = () => {
   const utils = trpc.useUtils()
   const [state, setState] = useState<State>('DRAFTED')
   const [take, setTake] = useState(PAGE)
   const [selected, setSelected] = useState<Set<string>>(new Set())
   const [editing, setEditing] = useState<string | null>(null)
   const [at, setAt] = useState(0)
   const list = trpc.draft.list.useQuery({ state, take }, { retry: false })
   const counts = trpc.draft.counts.useQuery(undefined, { retry: false })
   const rules = trpc.draft.rules.useQuery({ kind: 'COMMENT' }, { retry: false })
   const refresh = () => Promise.all([utils.draft.list.invalidate(), utils.draft.counts.invalidate()])
   const approve = trpc.draft.approve.useMutation({
      onSuccess: async ({ approved, refused }) => {
         setEditing(null)
         setSelected(new Set())

         if (approved.length > 0) {
            toast.success(`${approved.length} approved. Nothing is posted until a workflow goes on with them.`)
         }

         refused.forEach(({ reason }) => toast.error(reason))
         await refresh()
      },
      onError: error => toast.error(readableError(error)),
   })
   const reject = trpc.draft.reject.useMutation({
      onSuccess: async () => {
         setSelected(new Set())
         await refresh()
      },
      onError: error => toast.error(readableError(error)),
   })
   const items = list.data?.items ?? []
   const waiting = state === 'DRAFTED'
   const focused = items[Math.min(at, Math.max(items.length - 1, 0))]
   const busy = approve.isPending || reject.isPending

   useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
         if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey || !waiting) {
            return
         }

         if (event.key === 'j') {
            setAt(current => Math.min(current + 1, items.length - 1))
         } else if (event.key === 'k') {
            setAt(current => Math.max(current - 1, 0))
         } else if (event.key === 'a' && focused && editing === null) {
            approve.mutate({ items: [{ id: focused.id }] })
         } else if (event.key === 'e' && focused) {
            event.preventDefault()
            setEditing(focused.id)
         }
      }

      window.addEventListener('keydown', onKey)

      return () => window.removeEventListener('keydown', onKey)
   })

   const ids = [...selected]

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="grid gap-1">
            <h2 className="text-lg font-semibold">{`To approve${counts.data ? ` (${counts.data.waiting})` : ''}`}</h2>
            <p className="text-muted-foreground text-sm">
               Words your workflows wrote wait here. Nothing is posted until you approve it, and a draft nobody decides
               expires.
            </p>
            {counts.data ? (
               <p className="text-muted-foreground text-xs">
                  {`Last 30 days: ${counts.data.approved} approved, ${counts.data.edited} edited, ${counts.data.rejected} rejected. AI cost a draft ${dollars(counts.data.averageCostMicros)}.`}
               </p>
            ) : null}
         </div>

         <Tabs
            value={state}
            onValueChange={next => {
               setState(next as State)
               setSelected(new Set())
               setEditing(null)
               setAt(0)
            }}
         >
            <TabsList>
               {STATES.map(({ value, label }) => (
                  <TabsTrigger key={value} value={value}>
                     {label}
                  </TabsTrigger>
               ))}
            </TabsList>
         </Tabs>

         {waiting && ids.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2 text-sm">
               <span>{`Selected ${ids.length}`}</span>
               <Button size="sm" disabled={busy} onClick={() => approve.mutate({ items: ids.map(id => ({ id })) })}>
                  Approve selected
               </Button>
               <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => reject.mutate({ ids, reason: 'OTHER' })}
               >
                  Reject selected
               </Button>
            </div>
         ) : null}

         {list.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
         {list.error ? <p className="text-destructive text-sm">{list.error.message}</p> : null}
         {list.data && items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
               {waiting
                  ? 'Nothing waits. Drafts appear here when a workflow with "Ask me first" runs.'
                  : 'Nothing here yet.'}
            </p>
         ) : null}

         <ul className="grid gap-3">
            {items.map(draft => (
               <DraftCard
                  key={draft.id}
                  draft={draft}
                  rules={rules.data ?? { avoid: [], recent: [] }}
                  active={waiting && focused?.id === draft.id}
                  selected={selected.has(draft.id)}
                  editing={editing === draft.id}
                  busy={busy}
                  onSelect={on =>
                     setSelected(current => {
                        const next = new Set(current)

                        if (on) {
                           next.add(draft.id)
                        } else {
                           next.delete(draft.id)
                        }

                        return next
                     })
                  }
                  onEdit={on => setEditing(on ? draft.id : null)}
                  onApprove={words => approve.mutate({ items: [{ id: draft.id, ...(words === undefined ? {} : { words }) }] })}
                  onReject={(reason: RejectReason) => reject.mutate({ ids: [draft.id], reason })}
               />
            ))}
         </ul>

         {list.data?.next && take < MAX ? (
            <Button variant="outline" className="w-fit" onClick={() => setTake(MAX)}>
               Show more
            </Button>
         ) : null}
      </div>
   )
}
