import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CircleAlert, Shuffle, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { trpc } from '../../trpc'

type Use = 'invite' | 'message' | 'reply'

type Props = {
   use: Use
   text: string
   // Nothing to show until there are words.
   id: string
}

const DEBOUNCE_MS = 400

const useDebounced = <T,>(value: T) => {
   const [later, setLater] = useState(value)

   useEffect(() => {
      const timer = setTimeout(() => setLater(value), DEBOUNCE_MS)

      return () => clearTimeout(timer)
   }, [value])

   return later
}

// Who the text is shown for: a made-up example, or one of the owner's own people so the real values show.
const PersonPick = ({ slug, onPick }: { slug: string | null; onPick: (slug: string | null, name: string) => void }) => {
   const [search, setSearch] = useState('')
   const [label, setLabel] = useState('a made-up example')
   const people = trpc.workflow.messagePeople.useQuery({ search: useDebounced(search) })

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" aria-label="Pick who to preview for">
               <UserRound />
               {slug ? label : 'a made-up example'}
            </Button>
         </PopoverTrigger>
         <PopoverContent align="start" className="grid w-72 gap-2">
            <Input
               value={search}
               placeholder="Search your people"
               aria-label="Search your people"
               onChange={event => setSearch(event.target.value)}
            />
            <ul className="grid max-h-56 overflow-y-auto">
               <li>
                  <button
                     type="button"
                     className="hover:bg-muted w-full rounded-md p-2 text-left text-sm"
                     onClick={() => onPick(null, 'a made-up example')}
                  >
                     A made-up example
                  </button>
               </li>
               {people.data?.map(person => (
                  <li key={person.slug}>
                     <button
                        type="button"
                        className="hover:bg-muted grid w-full gap-0.5 rounded-md p-2 text-left"
                        onClick={() => {
                           setLabel(person.name ?? person.slug)
                           onPick(person.slug, person.name ?? person.slug)
                        }}
                     >
                        <span className="text-sm">{person.name}</span>
                        <span className="text-muted-foreground line-clamp-1 text-xs">
                           {person.headline ?? ''}
                           {person.profileRead ? ' · full profile read' : ''}
                        </span>
                     </button>
                  </li>
               ))}
            </ul>
         </PopoverContent>
      </Popover>
   )
}

// What the text turns into: a few random versions for one person, every version the options can make, and what is missing or wrong, so
// the owner sees what goes out before anything does.
export const MessageCheck = ({ id, use, text }: Props) => {
   const words = useDebounced(text)
   const [slug, setSlug] = useState<string | null>(null)
   const [all, setAll] = useState(false)
   const library = trpc.workflow.messageLibrary.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY })
   const check = trpc.workflow.messagePreview.useQuery(
      {
         use,
         text: words,
         ...(slug && { slug }),
      },
      {
         enabled: words.trim() !== '',
         placeholderData: previous => previous,
         // Each look draws new random versions.
         staleTime: 0,
      }
   )
   const data = check.data
   const labelOf = (key: string) => library.data?.variables.find(variable => variable.key === key)?.label.toLowerCase() ?? key

   if (words.trim() === '') {
      return null
   }

   return (
      <section className="grid gap-2 rounded-lg border p-3" aria-labelledby={`${id}-check`}>
         <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 id={`${id}-check`} className="text-sm font-medium">
               What goes out
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-xs">
               <span className="text-muted-foreground">for</span>
               <PersonPick slug={slug} onPick={next => setSlug(next)} />
               <Button type="button" variant="outline" size="sm" onClick={() => void check.refetch()}>
                  <Shuffle />
                  Another draw
               </Button>
            </div>
         </div>
         {data?.problems.length ? (
            <ul className="grid gap-1 text-sm" aria-label="Problems in the text">
               {data.problems.map(problem => (
                  <li key={problem} className="text-destructive flex items-start gap-1.5">
                     <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                     {problem}
                  </li>
               ))}
            </ul>
         ) : null}
         {data?.missing.length ? (
            <p className="text-warning text-xs">
               This person has no {data.missing.map(labelOf).join(' or ')} and no fallback is written, so it comes out empty. Write a fallback like{' '}
               {'{first_name:there}'}, switch on &ldquo;Skip people I have no value for&rdquo;, or add a &ldquo;Read full profile&rdquo; block before this
               one.
            </p>
         ) : null}
         <ul className="grid gap-1.5" aria-label="Example versions">
            {data?.texts.map((version, index) => (
               <li key={`${index}-${version}`} className="bg-muted/50 rounded-md px-3 py-2 text-sm whitespace-pre-wrap">
                  {version || <span className="text-muted-foreground">(empty)</span>}
               </li>
            ))}
         </ul>
         {data ? (
            <div className="grid gap-1.5">
               <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={cn(data.longest > data.limit && 'text-destructive')}>
                     {data.total >= 1_000_000 ? 'More than a million' : data.total.toLocaleString('en-US')}{' '}
                     {data.total === 1 ? 'way' : 'ways'} to write it · longest version {data.longest} of {data.limit} characters
                  </span>
                  {data.variants.length > 1 ? (
                     <button type="button" className="underline-offset-4 hover:underline" onClick={() => setAll(shown => !shown)}>
                        {all ? 'Hide all versions' : `Check all versions${data.total > data.variants.length ? ` (first ${data.variants.length})` : ''}`}
                     </button>
                  ) : null}
               </div>
               {all ? (
                  <ol className="grid max-h-56 gap-1 overflow-y-auto text-xs" aria-label="Every version">
                     {data.variants.map(version => (
                        <li key={version} className="bg-muted/50 rounded-md px-2 py-1 whitespace-pre-wrap">
                           {version}
                        </li>
                     ))}
                  </ol>
               ) : null}
            </div>
         ) : null}
      </section>
   )
}
