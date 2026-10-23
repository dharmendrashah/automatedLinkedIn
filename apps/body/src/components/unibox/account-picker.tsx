import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Bookmark, Check, MoreHorizontal, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

import { type UniboxAccount } from './types'

import { AccountAvatar } from './account-avatar'
import { stateLabel } from './account-state'
import { type AccountSet, addSet, applySet, deleteSet, renameSet, setMatching, updateSet } from './accountSets'
import { fold } from './search'

type Props = {
   accounts: UniboxAccount[]
   // undefined means every account.
   selection: ReadonlySet<string> | undefined
   unread: ReadonlyMap<string, number>
   onChange: (next: ReadonlySet<string> | undefined) => void
   sets: AccountSet[]
   onSets: (sets: AccountSet[]) => void
}

const SHOWN = 200

// Which accounts the Unibox shows: all of them, or those picked. A selection that is used often can be saved as a set and applied in
// one click. Sets live on this device and are only lists of accounts.
export const AccountPicker = ({ accounts, selection, unread, onChange, sets, onSets }: Props) => {
   const [query, setQuery] = useState('')
   const [name, setName] = useState('')
   const [error, setError] = useState<string>()
   const [renaming, setRenaming] = useState<{ id: string; name: string }>()
   const known = useMemo(() => new Set(accounts.map(account => account.id)), [accounts])
   const active = setMatching(sets, selection)
   const tokens = fold(query).split(/\s+/).filter(Boolean)
   const found = accounts.filter(account => {
      const text = fold(`${account.name} ${account.handle}`)

      return tokens.every(token => text.includes(token))
   })

   const choose = (next: Set<string>) => onChange(next.size === 0 || next.size === accounts.length ? undefined : next)

   const toggle = (id: string) => {
      if (!selection) {
         onChange(new Set([id]))

         return
      }

      const next = new Set(selection)

      if (!next.delete(id)) {
         next.add(id)
      }

      choose(next)
   }

   const apply = (set: AccountSet) => {
      const { selected, missing } = applySet(set, known)

      if (selected.size === 0) {
         toast.error(`None of the accounts of "${set.name}" exist any more.`)

         return
      }

      choose(selected)

      if (missing > 0) {
         toast.info(
            `${missing} ${missing === 1 ? 'account' : 'accounts'} of "${set.name}" no longer exist and ${missing === 1 ? 'was' : 'were'} left out.`
         )
      }
   }

   const save = () => {
      const result = addSet(sets, name, [...(selection ?? [])], () => crypto.randomUUID())

      if (result.ok) {
         onSets(result.sets)
         setName('')
         setError(undefined)
         toast.success(`Saved "${name.trim()}".`)
      } else {
         setError(result.reason)
      }
   }

   const rename = () => {
      if (!renaming) {
         return
      }

      const result = renameSet(sets, renaming.id, renaming.name)

      if (result.ok) {
         onSets(result.sets)
         setRenaming(undefined)
         setError(undefined)
      } else {
         setError(result.reason)
      }
   }

   return (
      <div className="flex max-h-[min(34rem,calc(var(--radix-popover-content-available-height)-1rem))] flex-col gap-3 text-sm">
         <section aria-label="Account sets" className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
               <Bookmark className="size-3" aria-hidden /> Sets
            </h3>
            {sets.length === 0 ? (
               <p className="text-xs text-muted-foreground">
                  Pick accounts below, name them, and use them again in one click.
               </p>
            ) : null}
            <ul className="space-y-0.5">
               {sets.map(set => (
                  <li key={set.id} className="flex items-center gap-1">
                     {renaming?.id === set.id ? (
                        <form
                           className="flex flex-1 gap-1"
                           onSubmit={event => {
                              event.preventDefault()
                              rename()
                           }}
                        >
                           <Input
                              value={renaming.name}
                              onChange={event => setRenaming({ id: set.id, name: event.target.value })}
                              aria-label="New name"
                              autoFocus
                              className="h-7"
                           />
                           <Button type="submit" size="xs">
                              Save
                           </Button>
                        </form>
                     ) : (
                        <>
                           <button
                              type="button"
                              onClick={() => apply(set)}
                              aria-pressed={active?.id === set.id}
                              className={cn(
                                 'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent',
                                 active?.id === set.id && 'bg-accent font-medium'
                              )}
                           >
                              <span className="truncate">{set.name}</span>
                              <span className="ml-auto text-xs text-muted-foreground">{set.accountIds.length}</span>
                              {active?.id === set.id ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                           </button>
                           <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                 <Button variant="ghost" size="icon-xs" aria-label={`Options for ${set.name}`}>
                                    <MoreHorizontal />
                                 </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                 <DropdownMenuItem onSelect={() => setRenaming({ id: set.id, name: set.name })}>
                                    Rename
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                    disabled={!selection}
                                    onSelect={() => {
                                       const result = updateSet(sets, set.id, [...(selection ?? [])])

                                       if (result.ok) {
                                          onSets(result.sets)
                                          toast.success(`"${set.name}" now holds the accounts picked.`)
                                       } else {
                                          toast.error(result.reason)
                                       }
                                    }}
                                 >
                                    Replace with the accounts picked
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => onSets(deleteSet(sets, set.id))}
                                 >
                                    Delete set
                                 </DropdownMenuItem>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </>
                     )}
                  </li>
               ))}
            </ul>
            <form
               className="flex gap-1"
               onSubmit={event => {
                  event.preventDefault()
                  save()
               }}
            >
               <Input
                  value={name}
                  onChange={event => {
                     setName(event.target.value)
                     setError(undefined)
                  }}
                  placeholder={selection ? `Name these ${selection.size} accounts` : 'Pick accounts to save them'}
                  aria-label="Name of the set"
                  disabled={!selection}
                  className="h-8"
               />
               <Button type="submit" size="sm" variant="outline" disabled={!selection}>
                  Save
               </Button>
            </form>
            {error ? (
               <p role="alert" className="text-xs text-destructive">
                  {error}
               </p>
            ) : null}
         </section>
         <section aria-label="Accounts" className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="relative">
               <Search
                  className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
               />
               <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Find an account"
                  aria-label="Find an account"
                  className="h-8 pl-7"
               />
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
               <Checkbox checked={!selection} onCheckedChange={() => onChange(undefined)} />
               <span className="font-medium">All accounts</span>
               <span className="ml-auto text-xs text-muted-foreground">{accounts.length}</span>
            </label>
            <ul className="min-h-0 flex-1 overflow-y-auto">
               {found.slice(0, SHOWN).map(account => {
                  const count = unread.get(account.id) ?? 0

                  return (
                     <li key={account.id}>
                        <label className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                           <Checkbox
                              checked={selection?.has(account.id) ?? false}
                              onCheckedChange={() => toggle(account.id)}
                           />
                           <AccountAvatar account={account} size="sm" />
                           <span className="min-w-0 flex-1">
                              <span className="block truncate">{account.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                 {account.handle}
                                 {account.state === 'ACTIVE' ? '' : ` · ${stateLabel(account.state)}`}
                              </span>
                           </span>
                           {count > 0 ? (
                              <span className="rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary tabular-nums">
                                 {count}
                              </span>
                           ) : null}
                        </label>
                     </li>
                  )
               })}
               {found.length === 0 ? (
                  <li className="px-2 py-3 text-center text-xs text-muted-foreground">No account matches.</li>
               ) : null}
               {found.length > SHOWN ? (
                  <li className="px-2 py-2 text-center text-xs text-muted-foreground">
                     Showing {SHOWN} of {found.length}. Type more to narrow it.
                  </li>
               ) : null}
            </ul>
         </section>
      </div>
   )
}
