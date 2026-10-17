import { formatUsd } from '@/components/workflows/types'
import { isReading, pollWhile } from '@/components/details/read-status'
import { Section } from '@/components/people/person-sections'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { Loader2, MessageSquare, ThumbsUp, UserPlus } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { type RouterOutputs, trpc } from '../../trpc'

type Engagement = RouterOutputs['postPage']['engagement']
type Kind = 'comments' | 'reactions'
type Comment = NonNullable<Engagement['comments']>['items'][number]
type Reaction = NonNullable<Engagement['reactions']>['items'][number]

const SHOWN_STEP = 50

const REACTIONS: Record<string, string> = {
   LIKE: 'Like',
   PRAISE: 'Celebrate',
   EMPATHY: 'Love',
   INTEREST: 'Insightful',
   APPRECIATION: 'Support',
   ENTERTAINMENT: 'Funny',
}

const reactionName = (type: string | null) => (type ? (REACTIONS[type] ?? type.toLowerCase()) : 'Reaction')

const dateOf = (at: string) => {
   const date = new Date(at)

   return Number.isNaN(date.getTime()) ? at : date.toLocaleDateString()
}

// What the drawer passes down: the post, its counts from the post read, the open list and how to open a person.
type Shared = {
   slug: string
   engagement: Engagement
   listId: string
   onPerson: (slug: string) => void
}

// One read button per size: "up to 100" always, "all" only when there may be more. The price is the count times the
// price per row when the post read gave the count, else the most it can cost.
const ReadChoices = ({ slug, kind, count, engagement }: { slug: string; kind: Kind; count: number | null; engagement: Engagement }) => {
   const utils = trpc.useUtils()
   const read = trpc.postPage.readEngagement.useMutation({
      onSuccess: data => utils.postPage.engagement.setData({ slug }, data),
   })
   const { some, all } = engagement.limits
   const stored = engagement[kind]
   const latest = engagement.reads[kind]
   const reading = isReading(latest)
   const choices = [false, ...(count === null || count > some ? [true] : [])].map(everything => {
      const limit = everything ? all : some
      const rows = Math.min(count ?? limit, limit)
      const fits = count !== null && count <= limit

      return {
         everything,
         label: fits ? `Read all ${kind}` : everything ? `Read all, up to ${all.toLocaleString()}` : `Read the first ${some}`,
         price: `${count === null ? 'up to' : 'about'} ${formatUsd(rows * engagement.priceMicros)}`,
      }
   })

   return (
      <div className="flex flex-wrap items-center gap-2">
         {reading ? (
            <p className="text-muted-foreground flex basis-full items-center gap-2 text-sm">
               <Loader2 className="size-4 animate-spin" aria-hidden />
               Reading the {kind}… This can take a few minutes. You can close this and come back.
            </p>
         ) : (
            choices.map(({ everything, label, price }) => (
               <Button
                  key={String(everything)}
                  variant={stored ? 'outline' : 'default'}
                  size="sm"
                  disabled={read.isPending}
                  onClick={() => read.mutate({ slug, kind, all: everything })}
               >
                  {read.isPending && read.variables?.all === everything ? <Loader2 className="animate-spin" /> : null}
                  {label} · {price}
               </Button>
            ))
         )}
         {stored ? (
            <p className="text-muted-foreground basis-full text-xs">
               Read on {new Date(stored.fetchedAt).toLocaleDateString()}: {stored.items.length.toLocaleString()} {kind}
               {stored.items.length >= stored.limit ? `, the first ${stored.limit.toLocaleString()}` : ''}.
            </p>
         ) : null}
         {latest?.status === 'FAILED' && latest.message ? (
            <p className="text-destructive basis-full text-sm">{latest.message}</p>
         ) : null}
         {read.error ? <p className="text-destructive basis-full text-sm">{readableError(read.error)}</p> : null}
      </div>
   )
}

const initials = (name: string) =>
   name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('')

type PersonLine = {
   slug: string | null
   url: string | null
   name: string | null
   headline: string | null
   photo: string | null
   listName: string | null
   doNotContact: boolean
}

const useAddToList = (slug: string) => {
   const utils = trpc.useUtils()

   return trpc.postPage.addToList.useMutation({
      onSuccess: () => {
         void utils.postPage.engagement.invalidate({ slug })
         void utils.postPage.detail.invalidate({ slug })
         void utils.workflowList.lists.invalidate()
      },
   })
}

// Who engaged: opens their drawer when they are in a list, LinkedIn otherwise, and can be added to the chosen list.
const Person = ({ who, badges, children, shared }: { who: PersonLine; badges: ReactNode; children?: ReactNode; shared: Shared }) => {
   const add = useAddToList(shared.slug)
   const name = who.name ?? who.slug ?? 'Someone'
   const nameNode = who.slug && who.listName ? (
      <button type="button" className="text-left text-sm font-medium hover:underline" onClick={() => shared.onPerson(who.slug ?? '')}>
         {name}
      </button>
   ) : who.url ? (
      <a className="text-sm font-medium hover:underline" href={who.url} target="_blank" rel="noreferrer noopener">
         {name}
      </a>
   ) : (
      <span className="text-sm font-medium">{name}</span>
   )
   const addable = Boolean(who.slug) && !who.listName && !who.doNotContact

   return (
      <li className="flex gap-3 rounded-md p-2">
         <Avatar className="size-9">
            {who.photo ? <AvatarImage src={who.photo} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
         </Avatar>
         <div className="grid min-w-0 flex-1 gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
               {nameNode}
               {badges}
               {who.listName ? <Badge variant="secondary">In {who.listName}</Badge> : null}
               {who.doNotContact ? <Badge variant="destructive">Do not contact</Badge> : null}
            </div>
            {who.headline ? <p className="text-muted-foreground truncate text-xs">{who.headline}</p> : null}
            {children}
            {add.error ? <p className="text-destructive text-xs">{readableError(add.error)}</p> : null}
         </div>
         {addable ? (
            <Button
               variant="ghost"
               size="sm"
               disabled={!shared.listId || add.isPending}
               title={shared.listId ? 'Add to the chosen list' : 'Choose a list first'}
               onClick={() => add.mutate({ slug: shared.slug, listId: shared.listId, slugs: [who.slug ?? ''] })}
            >
               <UserPlus />
               Add
            </Button>
         ) : null}
      </li>
   )
}

const ShowMore = ({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) =>
   shown < total ? (
      <Button variant="ghost" size="sm" className="justify-self-start" onClick={onMore}>
         Show more ({(total - shown).toLocaleString()} left)
      </Button>
   ) : null

const Comments = ({ items, shared }: { items: Comment[]; shared: Shared }) => {
   const [shown, setShown] = useState(SHOWN_STEP)

   return (
      <>
         <ul className="grid gap-1">
            {items.slice(0, shown).map((item, index) => (
               <Person
                  key={`${item.url ?? ''}-${index}`}
                  who={item}
                  shared={shared}
                  badges={
                     <>
                        {item.isAuthor ? <Badge variant="outline">Author</Badge> : null}
                        {item.isCompany ? <Badge variant="outline">Company</Badge> : null}
                     </>
                  }
               >
                  {item.text ? <p className="text-sm whitespace-pre-line">{item.text}</p> : null}
                  <p className="text-muted-foreground text-xs">
                     {[item.at ? dateOf(item.at) : null, item.reactions > 0 ? `${item.reactions.toLocaleString()} reactions` : null].filter(Boolean).join(' · ')}
                  </p>
               </Person>
            ))}
         </ul>
         <ShowMore shown={shown} total={items.length} onMore={() => setShown(shown + SHOWN_STEP)} />
      </>
   )
}

const ANY = 'any'

const Reactions = ({ items, shared }: { items: Reaction[]; shared: Shared }) => {
   const [shown, setShown] = useState(SHOWN_STEP)
   const [type, setType] = useState(ANY)
   const types = [...new Set(items.map(item => item.type ?? ''))].filter(Boolean)
   const visible = type === ANY ? items : items.filter(item => item.type === type)

   return (
      <>
         {types.length > 1 ? (
            <Select value={type} onValueChange={setType}>
               <SelectTrigger size="sm" className="w-44" aria-label="Reaction type">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value={ANY}>All reactions</SelectItem>
                  {types.map(value => (
                     <SelectItem key={value} value={value}>
                        {reactionName(value)} ({items.filter(item => item.type === value).length})
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         ) : null}
         <ul className="grid gap-1">
            {visible.slice(0, shown).map(item => (
               <Person key={item.slug} who={item} shared={shared} badges={<Badge variant="outline">{reactionName(item.type)}</Badge>} />
            ))}
         </ul>
         <ShowMore shown={shown} total={visible.length} onMore={() => setShown(shown + SHOWN_STEP)} />
      </>
   )
}

// "Add all" puts everyone in the tab who is not in a list yet into the chosen list.
const AddAll = ({ kind, shared }: { kind: Kind; shared: Shared }) => {
   const add = useAddToList(shared.slug)
   const items: PersonLine[] = shared.engagement[kind]?.items ?? []
   const slugs = [...new Set(items.flatMap(item => (item.slug && !item.listName && !item.doNotContact ? [item.slug] : [])))]

   if (slugs.length === 0) {
      return null
   }

   return (
      <div className="flex flex-wrap items-center gap-2">
         <Button
            size="sm"
            variant="outline"
            disabled={!shared.listId || add.isPending}
            onClick={() => add.mutate({ slug: shared.slug, listId: shared.listId, slugs })}
         >
            {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Add all {slugs.length.toLocaleString()} to the list
         </Button>
         {add.data ? (
            <span className="text-muted-foreground text-xs">
               Added {add.data.added.toLocaleString()}
               {add.data.skipped > 0 ? `, skipped ${add.data.skipped.toLocaleString()} already in your workspace` : ''}.
            </span>
         ) : null}
         {add.error ? <p className="text-destructive basis-full text-sm">{readableError(add.error)}</p> : null}
      </div>
   )
}

const TABS = [
   {
      kind: 'comments',
      title: 'Comments',
      Icon: MessageSquare,
   },
   {
      kind: 'reactions',
      title: 'Reactions',
      Icon: ThumbsUp,
   },
] as const

// Everyone who commented on or reacted to the post, read on demand, with a way to add them to a list.
export const PostEngagement = ({
   slug,
   archived,
   counts,
   onPerson,
}: {
   slug: string
   archived: boolean
   counts: Record<Kind, number | null>
   onPerson: (slug: string) => void
}) => {
   const engagement = trpc.postPage.engagement.useQuery(
      { slug },
      {
         retry: false,
         refetchInterval: query => pollWhile(query.state.data?.reads.comments, query.state.data?.reads.reactions),
      }
   )
   const lists = trpc.workflowList.lists.useQuery()
   const [chosen, setChosen] = useState('')
   const listId = chosen || (lists.data?.[0]?.id ?? '')
   const data = engagement.data

   if (!data) {
      return null
   }

   const shared: Shared = {
      slug,
      engagement: data,
      listId,
      onPerson,
   }

   return (
      <Section title="Comments and reactions">
         {lists.data && lists.data.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
               <span className="text-muted-foreground">Add people to</span>
               <Select value={listId} onValueChange={setChosen}>
                  <SelectTrigger size="sm" className="w-48" aria-label="List to add people to">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     {lists.data.map(list => (
                        <SelectItem key={list.id} value={list.id}>
                           {list.name}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>
         ) : (
            <p className="text-muted-foreground text-xs">Create a list on the Lists page to add people from here.</p>
         )}
         <Tabs defaultValue="comments" className="gap-3">
            <TabsList>
               {TABS.map(({ kind, title, Icon }) => (
                  <TabsTrigger key={kind} value={kind}>
                     <Icon aria-hidden />
                     {title}
                     {counts[kind] !== null ? ` (${(counts[kind] ?? 0).toLocaleString()})` : ''}
                  </TabsTrigger>
               ))}
            </TabsList>
            {TABS.map(({ kind }) => (
               <TabsContent key={kind} value={kind} className="grid gap-3">
                  {archived ? (
                     <p className="text-muted-foreground text-sm">Restore the post to read its {kind}.</p>
                  ) : (
                     <ReadChoices slug={slug} kind={kind} count={counts[kind]} engagement={data} />
                  )}
                  <AddAll kind={kind} shared={shared} />
                  {kind === 'comments' && data.comments ? <Comments items={data.comments.items} shared={shared} /> : null}
                  {kind === 'reactions' && data.reactions ? <Reactions items={data.reactions.items} shared={shared} /> : null}
               </TabsContent>
            ))}
         </Tabs>
      </Section>
   )
}
