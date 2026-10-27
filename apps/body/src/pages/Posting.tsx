import { EmptyState, ToAccounts } from '@/components/network/notices'
import { PageStatus } from '@/components/page-status'
import { accountName } from '@/components/posting/accounts'
import { Attention } from '@/components/posting/attention'
import { DeleteDraftDialog } from '@/components/posting/delete-draft-dialog'
import { blocksOf } from '@/components/posting/draft'
import { type Draft, DraftsList } from '@/components/posting/drafts-list'
import {
   TABS,
   type Tab,
   defaultTab,
   filterRows,
   isTab,
   knownScope,
   parseScope,
   scopeValue,
   tabOfState,
} from '@/components/posting/landing'
import { LandingToolbar, type View } from '@/components/posting/landing-toolbar'
import { NewPost } from '@/components/posting/new-post'
import { downloadCsv, postsCsv } from '@/components/posting/posts-csv'
import { hasActive } from '@/components/posting/publication'
import { type Publication, PublicationsList } from '@/components/posting/publications-list'
import { joinedText, mediaBlock } from '@/components/posting/rules'
import { summaryOf } from '@/components/posting/summary'
import { useClientLabels } from '@/components/posting/use-client-labels'
import { entriesOf } from '@/components/posting/week'
import { WeekView } from '@/components/posting/week-view'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { trpc } from '../trpc'

const POLL_MS = 5000
const POSTS_SHOWN = 100

const EMPTY: Record<Tab, string> = {
   drafts: 'No drafts yet. A post you start is saved here as you write it.',
   planned: 'Nothing is planned. Write a post and choose Plan a time to see it here.',
   posted: 'Nothing has gone out yet.',
   failed: 'Nothing here. A post that did not go shows here, with what to do about it.',
}

// The landing of Write a post: start a post, what needs fixing, then every post and draft of every account, by tab and by account
// or client, as a list or a week (.plan/posting-landing-agencies.md). The address keeps the tab, the account and the view.
export const Posting = () => {
   const utils = trpc.useUtils()
   const navigate = useNavigate()
   const [params, setParams] = useSearchParams()
   const [search, setSearch] = useState('')
   const [now] = useState(() => Date.now())
   const labels = useClientLabels()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const drafts = trpc.postDraft.list.useQuery(undefined, { retry: false })
   const posts = trpc.postPublication.list.useQuery(undefined, {
      retry: false,
      refetchInterval: query => (hasActive(query.state.data) ? POLL_MS : false),
   })
   const [toDelete, setToDelete] = useState<Draft | null>(null)
   const back = trpc.postPublication.backToDraft.useMutation({
      onError: error => toast.error(readableError(error)),
   })
   const duplicatePost = trpc.postPublication.duplicate.useMutation({
      onError: error => toast.error(readableError(error)),
   })
   const saveDraft = trpc.postDraft.save.useMutation({
      onError: error => toast.error(readableError(error)),
   })
   const saveLink = trpc.linkedInPost.create.useMutation({
      onError: error => toast.error(readableError(error)),
   })
   const remove = trpc.postDraft.remove.useMutation({
      onSuccess: () => {
         void utils.postDraft.list.invalidate()
         toast('Draft deleted')
      },
      onError: error => toast.error(readableError(error)),
   })

   const setParam = (key: string, value: string | undefined) =>
      setParams(
         current => {
            const next = new URLSearchParams(current)

            if (value === undefined) {
               next.delete(key)
            } else {
               next.set(key, value)
            }

            return next
         },
         { replace: true }
      )

   const takeBack = async (post: Publication) => {
      const draft = await back.mutateAsync({ id: post.id }).catch(() => undefined)

      if (draft) {
         void utils.postDraft.list.invalidate()
         void utils.postPublication.list.invalidate()
         void navigate(`/posting/${post.accountId}/${draft.id}`)
      }
   }

   const opened = (draft: { id: string; accountId: string }, withFiles: boolean) => {
      void utils.postDraft.list.invalidate()
      toast(withFiles ? 'Copied as a new draft. Its files were not copied.' : 'Copied as a new draft')
      void navigate(`/posting/${draft.accountId}/${draft.id}`)
   }

   const copyPost = async (post: Publication) => {
      const draft = await duplicatePost.mutateAsync({ id: post.id }).catch(() => undefined)

      if (draft) {
         opened(draft, post.attachment !== null)
      }
   }

   const copyDraft = async (draft: Draft) => {
      const text = joinedText(draft.blocks)

      if (text === '') {
         toast.error('This draft has no words to copy.')

         return
      }

      const saved = await saveDraft
         .mutateAsync({
            accountId: draft.accountId,
            blocks: blocksOf(text, undefined),
            audience: draft.audience,
            comments: draft.comments,
            plannedAt: null,
            plannedZone: null,
         })
         .catch(() => undefined)

      if (saved) {
         opened(saved, mediaBlock(draft.blocks) !== undefined)
      }
   }

   // The link goes to the LinkedIn posts page, where Read post shows the live numbers; nothing is read or invented here.
   const seeResults = async (post: Publication) => {
      if (post.link && (await saveLink.mutateAsync({ urls: post.link }).catch(() => undefined))) {
         void utils.linkedInPost.list.invalidate()
         toast(
            'Saved on the LinkedIn posts page. Open the post there and press Read post to see its reactions and comments.'
         )
         void navigate('/posts')
      }
   }

   if (accounts.isPending) {
      return <PageStatus>Loading your accounts…</PageStatus>
   }

   if (accounts.error) {
      return <p className="text-destructive px-4 text-sm lg:px-6">{readableError(accounts.error)}</p>
   }

   if (accounts.data.length === 0) {
      return (
         <div className="w-full px-4 lg:px-6">
            <div className="bg-card rounded-xl border">
               <EmptyState
                  icon={UserPlus}
                  title="No account is available"
                  text="Add a LinkedIn account to write posts. Drafts and planned posts belong to an account."
                  action={<ToAccounts label="Open accounts" />}
               />
            </div>
         </div>
      )
   }

   const scope = knownScope(parseScope(params.get('for')), accounts.data, labels)
   const view: View = params.get('view') === 'week' ? 'week' : 'list'
   const filter = { scope, search, labels }
   const postRows = filterRows(posts.data ?? [], post => ({ accountId: post.accountId, text: post.words }), filter)
   const draftRows = filterRows(
      drafts.data?.items ?? [],
      draft => ({ accountId: draft.accountId, text: summaryOf(draft.blocks).words }),
      filter
   )
   const counts: Record<Tab, number> = {
      drafts: draftRows.length,
      planned: postRows.filter(({ state }) => tabOfState(state) === 'planned').length,
      posted: postRows.filter(({ state }) => tabOfState(state) === 'posted').length,
      failed: postRows.filter(({ state }) => tabOfState(state) === 'failed').length,
   }
   const tabParam = params.get('tab')
   const tab = isTab(tabParam) ? tabParam : defaultTab(counts)
   const shownAccounts =
      scope.kind === 'all'
         ? accounts.data
         : accounts.data.filter(({ id }) =>
              scope.kind === 'account' ? id === scope.id : labels.get(id) === scope.label
           )
   const filtered = search.trim() !== '' || scope.kind !== 'all'
   const exportPosts = () =>
      downloadCsv(
         `posts-${new Date(now).toISOString().slice(0, 10)}.csv`,
         postsCsv(
            postRows.map(post => ({
               post,
               client: labels.get(post.accountId) ?? '',
               account: accountName(accounts.data.find(({ id }) => id === post.accountId)),
            }))
         )
      )
   const tabPosts = postRows.filter(({ state }) => tabOfState(state) === tab)
   const empty = filtered ? 'Nothing matches. Clear the search or choose all accounts.' : EMPTY[tab]

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <Attention accounts={accounts.data} posts={posts.data} labels={labels} now={now} />
         <section className="grid gap-3" aria-labelledby="posts">
            <h2 id="posts" className="text-lg font-semibold">
               Your posts and drafts
            </h2>
            <LandingToolbar
               accounts={accounts.data}
               labels={labels}
               scope={scope}
               onScope={next => setParam('for', next.kind === 'all' ? undefined : scopeValue(next))}
               search={search}
               onSearch={setSearch}
               view={view}
               onView={next => setParam('view', next === 'week' ? 'week' : undefined)}
               onExport={exportPosts}
               canExport={postRows.length > 0}
               action={
                  <NewPost
                     accounts={accounts.data}
                     labels={labels}
                     preselected={scope.kind === 'account' ? scope.id : ''}
                  />
               }
            />

            {view === 'week' ? (
               <WeekView
                  accounts={shownAccounts}
                  entries={entriesOf(
                     postRows,
                     draftRows.map(draft => ({
                        id: draft.id,
                        accountId: draft.accountId,
                        plannedAt: draft.plannedAt,
                        words: summaryOf(draft.blocks).words,
                     }))
                  )}
                  labels={labels}
               />
            ) : (
               <>
                  <Tabs value={tab} onValueChange={value => setParam('tab', value)}>
                     <TabsList>
                        {TABS.map(({ id, label }) => (
                           <TabsTrigger key={id} value={id}>
                              {label} ({counts[id]})
                           </TabsTrigger>
                        ))}
                     </TabsList>
                  </Tabs>

                  {tab === 'drafts' ? (
                     <>
                        {drafts.isPending ? <PageStatus>Loading your drafts…</PageStatus> : null}
                        {drafts.error ? (
                           <p className="text-destructive text-sm">{readableError(drafts.error)}</p>
                        ) : null}
                        {drafts.data && draftRows.length === 0 ? (
                           <p className="text-muted-foreground text-sm">{empty}</p>
                        ) : null}
                        {draftRows.length > 0 ? (
                           <DraftsList
                              drafts={draftRows}
                              accounts={accounts.data}
                              labels={labels}
                              onRemove={setToDelete}
                              onDuplicate={draft => void copyDraft(draft)}
                           />
                        ) : null}
                        {drafts.data && drafts.data.unreadable > 0 ? (
                           <p className="text-muted-foreground text-xs">
                              {drafts.data.unreadable} {drafts.data.unreadable === 1 ? 'draft' : 'drafts'} could not be
                              read and {drafts.data.unreadable === 1 ? 'is' : 'are'} not shown.
                           </p>
                        ) : null}
                     </>
                  ) : (
                     <>
                        {posts.isPending ? <PageStatus>Loading your posts…</PageStatus> : null}
                        {posts.error ? <p className="text-destructive text-sm">{readableError(posts.error)}</p> : null}
                        {posts.data && tabPosts.length === 0 ? (
                           <p className="text-muted-foreground text-sm">{empty}</p>
                        ) : null}
                        {tabPosts.length > 0 ? (
                           <PublicationsList
                              posts={tabPosts}
                              accounts={accounts.data}
                              labels={labels}
                              onBack={post => void takeBack(post)}
                              onDuplicate={post => void copyPost(post)}
                              onResults={post => void seeResults(post)}
                           />
                        ) : null}
                     </>
                  )}
               </>
            )}
            {posts.data && posts.data.length >= POSTS_SHOWN ? (
               <p className="text-muted-foreground text-xs">
                  Showing your latest {POSTS_SHOWN} posts. Older ones are not listed.
               </p>
            ) : null}
         </section>
         <DeleteDraftDialog
            draft={toDelete}
            onCancel={() => setToDelete(null)}
            onConfirm={draft => {
               setToDelete(null)
               remove.mutate({ id: draft.id })
            }}
         />
      </div>
   )
}
