import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadFile } from '@/lib/download-file'
import { readableError } from '@/lib/trpc-error'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { type RouterOutputs, trpc } from '../../trpc'
import { detailOf, internalPathOf, nameOf } from './block-output-rows'
import { ChatDigestButton } from './chat-digest'

type Item = RouterOutputs['workflow']['output']['items'][number] & { from?: string }

const PAGE_SIZE = 25
const ALL = 'all'

const KIND_LABELS = {
   profile: 'Person',
   post: 'Post',
   company: 'Company',
   job: 'Job',
   ad: 'Ad',
   conversation: 'Conversation',
} as const

// "Chat: 12 messages, they wrote last", "none stored" or "not read" (none stored does not mean none exist).
const chatText = ({ item }: Item) => {
   if (item.kind !== 'profile' || !item.chat) {
      return ''
   }

   const { stored, messages, lastFrom } = item.chat

   return stored === null
      ? 'Not read'
      : stored
        ? `${messages} messages${lastFrom ? `, ${lastFrom === 'ME' ? 'you' : 'they'} wrote last` : ''}`
        : 'None stored'
}

const NAME_CLASS = 'font-medium underline-offset-4 hover:underline'

// A row opens its page in the app when it has one; otherwise its name links to LinkedIn in a new tab.
const NameLink = ({ row }: { row: Item }) => {
   const path = internalPathOf(row.item)

   return path ? (
      <Link className={NAME_CLASS} to={path}>
         {nameOf(row)}
      </Link>
   ) : (
      <a className={NAME_CLASS} href={row.item.url} target="_blank" rel="noreferrer noopener">
         {nameOf(row)}
      </a>
   )
}

type Props = {
   runId: string
   nodeId: string
   // How many rounds the block ran; a filter shows when there were several.
   rounds: number
   fileName?: string
   // What the block passed on (the default), or what reached it, with the block each item came from.
   kind?: 'output' | 'input'
   // The name of a block by its id, for the "From" column.
   labelOf?: (nodeId: string) => string
   // Shown when there is nothing to list.
   emptyText?: string
   // Get our chat with them: a Chat column with the stored chat of each person and a button to read its newest messages.
   digest?: boolean
}

// What one block passed on in a run, or what reached it, page by page, with the whole of it as a CSV download.
export const BlockOutput = ({
   runId,
   nodeId,
   rounds,
   fileName,
   kind = 'output',
   labelOf,
   emptyText,
   digest = false,
}: Props) => {
   const [page, setPage] = useState(1)
   const [round, setRound] = useState(ALL)
   const query = {
      runId,
      nodeId,
      round: round === ALL ? undefined : Number(round),
   }
   const paging = {
      ...query,
      page,
      pageSize: PAGE_SIZE,
   }
   const keepPrevious = { placeholderData: <T,>(previous: T | undefined) => previous }
   const passed = trpc.workflow.output.useQuery(paging, {
      enabled: kind === 'output',
      ...keepPrevious,
   })
   const reached = trpc.workflow.input.useQuery(paging, {
      enabled: kind === 'input',
      ...keepPrevious,
   })
   const output = kind === 'input' ? reached : passed
   const download = {
      onSuccess: (file: { fileName: string; csv: string }) =>
         downloadFile(file.fileName, file.csv, 'text/csv;charset=utf-8'),
   }
   const outputCsv = trpc.workflow.outputCsv.useMutation(download)
   const inputCsv = trpc.workflow.inputCsv.useMutation(download)
   const csv = kind === 'input' ? inputCsv : outputCsv
   const total = output.data?.total ?? 0
   const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
   const error = output.error ?? csv.error
   const items: Item[] = output.data?.items ?? []
   const hasResults = items.some(({ item }) => item.result)

   return (
      <div className="grid gap-3">
         <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
               {total} {kind === 'input' ? 'came in' : 'passed on'}
            </p>
            <div className="flex items-center gap-2">
               {rounds > 1 ? (
                  <Select
                     value={round}
                     onValueChange={next => {
                        setRound(next)
                        setPage(1)
                     }}
                  >
                     <SelectTrigger className="w-36" aria-label="Round">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value={ALL}>All rounds</SelectItem>
                        {Array.from({ length: rounds }, (_, index) => (
                           <SelectItem key={index} value={String(index)}>
                              Round {index + 1}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               ) : null}
               <Button
                  variant="outline"
                  disabled={total === 0 || csv.isPending}
                  onClick={() =>
                     csv.mutate({
                        ...query,
                        fileName,
                     })
                  }
               >
                  {csv.isPending ? <Loader2 className="animate-spin" /> : <Download />}
                  Download CSV
               </Button>
            </div>
         </div>
         {error ? <p className="text-destructive text-sm">{readableError(error)}</p> : null}
         <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <Table>
               <TableHeader className="bg-muted/50">
                  <TableRow>
                     <TableHead>Kind</TableHead>
                     <TableHead>Name</TableHead>
                     <TableHead>Details</TableHead>
                     {digest ? <TableHead>Chat</TableHead> : null}
                     {kind === 'input' ? <TableHead>From</TableHead> : null}
                     {hasResults ? <TableHead>Result</TableHead> : null}
                     {rounds > 1 ? <TableHead>Round</TableHead> : null}
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {items.map(row => (
                     <TableRow key={`${row.round}-${row.from ?? ''}-${row.item.kind}-${row.item.slug}`}>
                        <TableCell className="text-muted-foreground">{KIND_LABELS[row.item.kind]}</TableCell>
                        <TableCell>
                           <NameLink row={row} />
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-md truncate">{detailOf(row)}</TableCell>
                        {digest ? (
                           <TableCell className="text-muted-foreground">
                              {chatText(row)}
                              {row.item.kind === 'profile' && row.item.chat?.stored ? (
                                 <ChatDigestButton
                                    runId={runId}
                                    nodeId={nodeId}
                                    slug={row.item.slug}
                                    name={nameOf(row)}
                                 />
                              ) : null}
                           </TableCell>
                        ) : null}
                        {kind === 'input' ? (
                           <TableCell className="text-muted-foreground">
                              {row.from ? (labelOf?.(row.from) ?? row.from) : ''}
                           </TableCell>
                        ) : null}
                        {hasResults ? (
                           <TableCell className="text-muted-foreground">
                              {row.item.result
                                 ? [row.item.result.status, row.item.result.reason].filter(Boolean).join(': ')
                                 : ''}
                           </TableCell>
                        ) : null}
                        {rounds > 1 ? <TableCell>{row.round + 1}</TableCell> : null}
                     </TableRow>
                  ))}
                  {total === 0 && !output.isPending ? (
                     <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground py-6 text-center">
                           {emptyText ?? 'Nothing here for this run.'}
                        </TableCell>
                     </TableRow>
                  ) : null}
               </TableBody>
            </Table>
         </div>
         {pages > 1 ? (
            <div className="flex items-center justify-end gap-2 text-sm">
               <span className="text-muted-foreground">
                  Page {page} of {pages}
               </span>
               <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
               </Button>
               <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next
               </Button>
            </div>
         ) : null}
      </div>
   )
}
