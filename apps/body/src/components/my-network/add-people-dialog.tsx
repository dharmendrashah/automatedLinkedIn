import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { downloadFile } from '@/lib/download-file'
import { readableError } from '@/lib/trpc-error'
import { type ChangeEvent, useState } from 'react'

import { type Client } from './types'

import { type RouterOutputs, trpc } from '../../trpc'
import { EXAMPLE_CSV, IMPORT_BYTES, IMPORT_ROWS, type ImportRow, linksOf, peopleOf, readImportCsv } from './import-csv'

const NEW_LIST = 'new'
const BATCH = 200

type Props = {
   client: Client
   open: boolean
   onOpenChange: (open: boolean) => void
}

type Preview = NonNullable<RouterOutputs['people']['preview']>
type Totals = Omit<NonNullable<RouterOutputs['people']['add']>, 'listId'>

const NO_TOTALS: Totals = {
   added: 0,
   skipped: 0,
   blocked: 0,
   invalid: 0,
   reading: 0,
   notRead: 0,
}

const STATE_WORDS = {
   ALREADY_HERE: 'Already here',
   DO_NOT_CONTACT: 'Do not contact',
} as const

const resultLine = (totals: Totals, list: string, invalid: number) =>
   [
      `Added ${totals.added} to ${list} as Discovery people.`,
      totals.reading > 0 ? `Reading ${totals.reading} profiles.` : '',
      totals.notRead > 0 ? `${totals.notRead} could not be read now.` : '',
      totals.skipped > 0 ? `${totals.skipped} were already here.` : '',
      totals.blocked > 0 ? `${totals.blocked} are on Do not contact.` : '',
      invalid > 0 ? `${invalid} were not profile links.` : '',
   ]
      .filter(Boolean)
      .join(' ')

// Imports profiles from pasted links or a CSV into a list of the client (.plan/network-import-people.md): choose, review what
// each link is, then import the ticked ones in batches. They join as Discovery people, known to no account until invited.
export const AddPeopleDialog = ({ client, open, onOpenChange }: Props) => {
   const utils = trpc.useUtils()
   const [source, setSource] = useState('paste')
   const [text, setText] = useState('')
   const [file, setFile] = useState<{ name: string; rows: ImportRow[] } | null>(null)
   const [fileError, setFileError] = useState('')
   const [listId, setListId] = useState(client.lists[0]?.id ?? NEW_LIST)
   const [listName, setListName] = useState('')
   const [review, setReview] = useState<Preview | null>(null)
   const [chosen, setChosen] = useState<Set<string>>(new Set())
   const [read, setRead] = useState(true)
   const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
   const [totals, setTotals] = useState<Totals | null>(null)
   const [importError, setImportError] = useState('')
   const preview = trpc.people.preview.useMutation()
   const add = trpc.people.add.useMutation()
   const naming = listId === NEW_LIST
   const rows: ImportRow[] =
      source === 'paste'
         ? linksOf(text).map(url => ({
              url,
              labels: [],
              notes: '',
           }))
         : (file?.rows ?? [])
   const tooMany = rows.length > IMPORT_ROWS
   const ready = rows.length > 0 && !tooMany && (!naming || listName.trim() !== '')
   const listLabel = naming ? listName.trim() : (client.lists.find(({ id }) => id === listId)?.name ?? 'the list')
   const choosable = review?.profiles.filter(({ state }) => state !== 'DO_NOT_CONTACT') ?? []
   const importing = progress !== null && totals === null

   const reset = () => {
      setText('')
      setFile(null)
      setFileError('')
      setListName('')
      setReview(null)
      setProgress(null)
      setTotals(null)
      setImportError('')
      preview.reset()
   }

   const close = (next: boolean) => {
      if (!next && !importing) {
         reset()
      }

      if (!importing) {
         onOpenChange(next)
      }
   }

   const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
      const [picked] = event.target.files ?? []

      event.target.value = ''
      setFile(null)
      setFileError('')

      if (!picked) {
         return
      }

      if (picked.size > IMPORT_BYTES) {
         setFileError('The file is larger than 2 MB.')
         return
      }

      const result = readImportCsv(await picked.text())

      if ('error' in result) {
         setFileError(result.error)
      } else if (result.rows.length === 0) {
         setFileError('The file has no profile links.')
      } else {
         setFile({
            name: picked.name,
            rows: result.rows,
         })
      }
   }

   const toReview = () =>
      preview.mutate(
         {
            clientId: client.id,
            urls: rows.map(({ url }) => url),
         },
         {
            onSuccess: data => {
               setReview(data)
               setChosen(new Set(data.profiles.filter(({ state }) => state === 'NEW').map(({ slug }) => slug)))
            },
         }
      )

   const runImport = async () => {
      const people = peopleOf(
         rows,
         choosable.filter(({ slug }) => chosen.has(slug))
      )
      let target: { listId: string } | { listName: string } = naming ? { listName: listName.trim() } : { listId }
      let sum = NO_TOTALS

      setImportError('')
      setProgress({
         done: 0,
         total: people.length,
      })

      try {
         for (let at = 0; at < people.length; at += BATCH) {
            const done = await add.mutateAsync({
               clientId: client.id,
               people: people.slice(at, at + BATCH),
               read,
               ...target,
            })

            target = { listId: done.listId }
            sum = {
               added: sum.added + done.added,
               skipped: sum.skipped + done.skipped,
               blocked: sum.blocked + done.blocked,
               invalid: sum.invalid + done.invalid,
               reading: sum.reading + done.reading,
               notRead: sum.notRead + done.notRead,
            }
            setProgress({
               done: Math.min(at + BATCH, people.length),
               total: people.length,
            })
         }
      } catch (error) {
         setImportError(error instanceof Error ? readableError(error) : 'The import stopped.')
      }

      setTotals(sum)
      await utils.people.invalidate()
   }

   return (
      <Dialog open={open} onOpenChange={close}>
         <DialogContent className="sm:max-w-xl">
            <DialogHeader>
               <DialogTitle>Add people to {client.name}</DialogTitle>
               <DialogDescription>
                  Paste LinkedIn profile links or upload a CSV, up to {IMPORT_ROWS.toLocaleString('en')}. They join as
                  Discovery people: no account of yours knows them until you invite them.
               </DialogDescription>
            </DialogHeader>
            {totals ? (
               <div className="grid gap-2 text-sm" role="status">
                  <p>{resultLine(totals, listLabel, review?.invalid ?? 0)}</p>
                  {importError ? (
                     <p className="text-destructive">
                        The import stopped after {progress?.done ?? 0} of {progress?.total ?? 0}: {importError}
                     </p>
                  ) : null}
               </div>
            ) : review ? (
               <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                     <span>
                        {chosen.size} of {review.profiles.length} selected
                     </span>
                     <span className="flex gap-1">
                        <Button
                           variant="ghost"
                           size="sm"
                           disabled={importing}
                           onClick={() => setChosen(new Set(choosable.map(({ slug }) => slug)))}
                        >
                           Select all
                        </Button>
                        <Button variant="ghost" size="sm" disabled={importing} onClick={() => setChosen(new Set())}>
                           Select none
                        </Button>
                     </span>
                  </div>
                  <ul className="max-h-72 divide-y overflow-auto rounded-md border text-sm">
                     {review.profiles.map(({ slug, url, state }) => (
                        <li key={slug} className="flex items-center gap-2 px-3 py-1.5">
                           {state === 'DO_NOT_CONTACT' ? (
                              <span className="size-4 shrink-0" />
                           ) : (
                              <Checkbox
                                 checked={chosen.has(slug)}
                                 disabled={importing}
                                 aria-label={`Import ${slug}`}
                                 onCheckedChange={checked =>
                                    setChosen(current => {
                                       const next = new Set(current)

                                       if (checked === true) {
                                          next.add(slug)
                                       } else {
                                          next.delete(slug)
                                       }

                                       return next
                                    })
                                 }
                              />
                           )}
                           <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 truncate hover:underline"
                           >
                              {slug}
                           </a>
                           {state === 'NEW' ? null : (
                              <Badge variant="outline" className="font-normal">
                                 {STATE_WORDS[state]}
                              </Badge>
                           )}
                        </li>
                     ))}
                  </ul>
                  {review.invalid > 0 ? (
                     <p className="text-muted-foreground text-sm">
                        Skipped: {review.invalid} {review.invalid === 1 ? 'entry is' : 'entries are'} not a profile
                        link.
                     </p>
                  ) : null}
                  <Label className="font-normal">
                     <Checkbox
                        checked={read}
                        disabled={importing}
                        onCheckedChange={checked => setRead(checked === true)}
                     />
                     Read their profile details now
                  </Label>
                  <p className="text-muted-foreground -mt-2 text-xs">
                     Fills name, photo, company, country and Premium. A profile already read today is not read again.
                  </p>
                  {progress ? (
                     <div className="grid gap-1" role="status">
                        <div className="bg-muted h-2 overflow-hidden rounded-full">
                           <div
                              className="bg-primary h-full transition-all"
                              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                           />
                        </div>
                        <span className="text-muted-foreground text-xs">
                           Imported {progress.done} of {progress.total}
                        </span>
                     </div>
                  ) : null}
               </div>
            ) : (
               <div className="grid gap-3">
                  <Tabs value={source} onValueChange={setSource}>
                     <TabsList>
                        <TabsTrigger value="paste">Paste links</TabsTrigger>
                        <TabsTrigger value="csv">Upload CSV</TabsTrigger>
                     </TabsList>
                     <TabsContent value="paste">
                        <Textarea
                           value={text}
                           onChange={event => setText(event.target.value)}
                           placeholder="https://www.linkedin.com/in/…"
                           aria-label="Profile links"
                           rows={6}
                        />
                     </TabsContent>
                     <TabsContent value="csv" className="grid gap-2">
                        <Input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={pickFile} />
                        <p className="text-muted-foreground text-xs">
                           Columns: profile_url (required), labels (split by ;) and notes.{' '}
                           <button
                              type="button"
                              className="text-foreground underline"
                              onClick={() => downloadFile('people-example.csv', EXAMPLE_CSV, 'text/csv')}
                           >
                              Download example CSV
                           </button>
                        </p>
                        {file ? (
                           <p className="text-sm">
                              {file.name}: {file.rows.length} profiles
                           </p>
                        ) : null}
                        {fileError ? <p className="text-destructive text-sm">{fileError}</p> : null}
                     </TabsContent>
                  </Tabs>
                  {tooMany ? (
                     <p className="text-destructive text-sm">
                        Import at most {IMPORT_ROWS.toLocaleString('en')} profiles at once.
                     </p>
                  ) : null}
                  <div className="grid gap-1.5">
                     <Label htmlFor="add-people-list">List</Label>
                     <Select value={listId} onValueChange={setListId}>
                        <SelectTrigger id="add-people-list" size="sm">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {client.lists.map(({ id, name }) => (
                              <SelectItem key={id} value={id}>
                                 {name}
                              </SelectItem>
                           ))}
                           <SelectItem value={NEW_LIST}>A new list…</SelectItem>
                        </SelectContent>
                     </Select>
                     {naming ? (
                        <Input
                           value={listName}
                           onChange={event => setListName(event.target.value)}
                           placeholder="Name of the new list"
                           aria-label="Name of the new list"
                           maxLength={80}
                        />
                     ) : null}
                  </div>
                  {preview.error ? <p className="text-destructive text-sm">{readableError(preview.error)}</p> : null}
               </div>
            )}
            <DialogFooter>
               {totals ? (
                  <Button onClick={() => close(false)}>Close</Button>
               ) : review ? (
                  <>
                     <Button variant="outline" disabled={importing} onClick={() => setReview(null)}>
                        Back
                     </Button>
                     <Button disabled={chosen.size === 0 || importing} onClick={() => void runImport()}>
                        Import {chosen.size} {chosen.size === 1 ? 'person' : 'people'}
                     </Button>
                  </>
               ) : (
                  <>
                     <Button variant="outline" onClick={() => close(false)}>
                        Cancel
                     </Button>
                     <Button disabled={!ready || preview.isPending} onClick={toReview}>
                        Review
                     </Button>
                  </>
               )}
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
