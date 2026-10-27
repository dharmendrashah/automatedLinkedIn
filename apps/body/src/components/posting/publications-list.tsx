import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarClock, Copy, ExternalLink, LineChart } from 'lucide-react'
import { useEffect, useState } from 'react'

import { type Account } from '../accounts/types'

import { type RouterOutputs } from '../../trpc'
import { accountName } from './accounts'
import { type Labels } from './landing'
import { canTakeBack, isPostLink, stateText, waitingText } from './publication'
import { describePlanned } from './schedule'

export type Publication = RouterOutputs['postPublication']['list'][number]

type Props = {
   posts: Publication[]
   accounts: Account[]
   labels: Labels
   onBack: (post: Publication) => void
   onDuplicate: (post: Publication) => void
   onResults: (post: Publication) => void
}

const when = (iso: string) =>
   new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
   })

const ATTACHMENT: Record<string, string> = {
   PHOTOS: 'Photos',
   VIDEO: 'Video',
   DOCUMENT: 'Document',
   LINK: 'Link',
}

// What the Back button of a post that has not gone for sure does.
const backText = (state: Publication['state']) =>
   state === 'SCHEDULED' || state === 'QUEUED' ? 'Cancel and edit' : 'Edit and post again'

const REFRESH_MS = 30_000

// The time now, renewed while a post waits, so "in about 3 min" counts down between the list's own refreshes.
const useNow = (active: boolean) => {
   const [now, setNow] = useState(() => Date.now())

   useEffect(() => {
      if (!active) {
         return undefined
      }

      const timer = setInterval(() => setNow(Date.now()), REFRESH_MS)

      return () => clearInterval(timer)
   }, [active])

   return now
}

// The owner's posts that were sent for posting or planned, newest first, with where each is and, once it went, its link and a way to
// see how it did. Any post with words can be copied into a new draft.
export const PublicationsList = ({ posts, accounts, labels, onBack, onDuplicate, onResults }: Props) => {
   const now = useNow(posts.some(({ waiting }) => waiting !== null))

   return (
      <ul className="grid gap-2">
         {posts.map(post => {
            const account = accounts.find(({ id }) => id === post.accountId)
            const client = labels.get(post.accountId)
            const link = isPostLink(post.link) ? post.link : null

            return (
               <li key={post.id}>
                  <Card className="py-0">
                     <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                        <div className="grid min-w-0 gap-1">
                           <span className="truncate text-sm font-medium" dir="auto">
                              {post.words === '' ? 'No words' : post.words}
                           </span>
                           <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                              <Badge
                                 variant={
                                    post.state === 'POSTED'
                                       ? 'default'
                                       : post.state === 'FAILED'
                                         ? 'destructive'
                                         : 'secondary'
                                 }
                              >
                                 {stateText(post.state)}
                              </Badge>
                              <span>{accountName(account)}</span>
                              {client ? <Badge variant="outline">{client}</Badge> : null}
                              {post.attachment ? <span>{ATTACHMENT[post.attachment] ?? post.attachment}</span> : null}
                              {post.fromWorkflow ? <span>Made by a workflow</span> : null}
                              {post.scheduledAt && post.plannedZone && post.state === 'SCHEDULED' ? (
                                 <span className="flex items-center gap-1">
                                    <CalendarClock className="size-3" aria-hidden />
                                    {describePlanned(post.scheduledAt, post.plannedZone)}
                                 </span>
                              ) : (
                                 <span>{post.postedAt ? when(post.postedAt) : when(post.createdAt)}</span>
                              )}
                              {link ? (
                                 <a
                                    className="flex items-center gap-1 underline underline-offset-4"
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                 >
                                    <ExternalLink className="size-3" aria-hidden />
                                    Open on LinkedIn
                                 </a>
                              ) : null}
                           </span>
                           {post.waiting ? (
                              <span className="text-muted-foreground text-xs">
                                 {waitingText(post.waiting, { now })}
                              </span>
                           ) : null}
                           {post.failure ? <span className="text-muted-foreground text-xs">{post.failure}</span> : null}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                           {link ? (
                              <Button
                                 type="button"
                                 variant="outline"
                                 size="sm"
                                 title="Saves the post on the LinkedIn posts page, where Read post shows its reactions and comments."
                                 onClick={() => onResults(post)}
                              >
                                 <LineChart />
                                 See results
                              </Button>
                           ) : null}
                           {!post.fromWorkflow && canTakeBack(post.state) ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => onBack(post)}>
                                 {backText(post.state)}
                              </Button>
                           ) : null}
                           {post.words === '' ? null : (
                              <Button
                                 type="button"
                                 variant="ghost"
                                 size="sm"
                                 title="A new draft with these words. Files are not copied."
                                 onClick={() => onDuplicate(post)}
                              >
                                 <Copy />
                                 Duplicate
                              </Button>
                           )}
                        </div>
                     </CardContent>
                  </Card>
               </li>
            )
         })}
      </ul>
   )
}
