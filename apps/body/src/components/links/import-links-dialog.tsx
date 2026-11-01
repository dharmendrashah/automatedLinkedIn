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
   DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { downloadFile } from '@/lib/download-file'
import { readableError } from '@/lib/trpc-error'
import { Plus } from 'lucide-react'
import { type ChangeEvent, useState } from 'react'

import { LabelMultiSelect } from '../labels/label-multi-select'
import { LABEL_MAX, type LabelKind } from '../labels/labels'
import { downloadCsv } from '../posting/posts-csv'
import {
   type CsvKind,
   IMPORT_BYTES,
   IMPORT_ROWS,
   type ImportRow,
   entriesOf,
   linksOf,
   readImportCsv,
   skippedCsv,
} from './import-csv'
import { type ReadNoun, type ReadTotals, readCostLine, readResultLine } from './read-cost'

const BATCH = 200

// What differs between importing companies and posts.
export type ImportKind = {
   noun: ReadNoun
   labelKind: LabelKind
   csv: CsvKind
   placeholder: string
   // The CSV columns, in words.
   csvColumns: string
   // What a read fills in.
   fills: string
   readNow: string
   readByDefault: boolean
}

export type ImportPreview = {
   items: Array<{
      url: string
      slug: string
      inputs: string[]
      state: 'NEW' | 'ALREADY_HERE' | 'ARCHIVED'
      readRecently: boolean
   }>
   invalid: string[]
}

export type ImportTotals = ReadTotals & {
   created: number
   restored: number
   skipped: number
   invalid: number
   full: number
}

export type ImportEntry = ReturnType<typeof entriesOf>[number]

type Props = {
   kind: ImportKind
   preview: (urls: string[]) => Promise<ImportPreview>
   importBatch: (entries: ImportEntry[], labels: string[], read: 'NONE' | 'NEW' | 'ALL') => Promise<ImportTotals>
   onDone: () => Promise<unknown>
   // Filters the table by a label of the import.
   onShow: (label: string) => void
}

const NO_TOTALS: ImportTotals = {
   created: 0,
   restored: 0,
   skipped: 0,
   invalid: 0,
   full: 0,
   reading: 0,
   readRecently: 0,
   paused: 0,
}

const STATE_WORDS = {
   ALREADY_HERE: 'Already here',
   ARCHIVED: 'Archived, will be restored',
} as const

// The owner's own date, not UTC: a late-evening import in India would otherwise be labelled yesterday.
const importLabel = () => {
   const now = new Date()
   const pad = (value: number) => String(value).padStart(2, '0')

   return `import-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const countOf = (noun: ReadNoun, count: number) => `${count} ${count === 1 ? noun.one : noun.many}`

type ReadChoice = {
   noun: ReadNoun
   label: string
   read: boolean
   rereadHere: boolean
   disabled: boolean
   onRead: (read: boolean) => void
   onRereadHere: (rereadHere: boolean) => void
   // The line under the boxes: what is filled, and the price once the review knows it.
   note: string
}

const ReadOptions = ({ noun, label, read, rereadHere, disabled, onRead, onRereadHere, note }: ReadChoice) => (
   <div className="grid gap-2">
      <Label className="font-normal">
         <Checkbox checked={read} disabled={disabled} onCheckedChange={checked => onRead(checked === true)} />
         {label}
      </Label>
      {read ? (
         <>
            <Label className="pl-6 font-normal">
               <Checkbox
                  checked={rereadHere}
                  disabled={disabled}
                  onCheckedChange={checked => onRereadHere(checked === true)}
               />
               Also re-read {noun.many} already here
            </Label>
            <p className="text-muted-foreground text-xs">{note}</p>
         </>
      ) : null}
   </div>
)

const resultLine = (noun: ReadNoun, totals: ImportTotals, read: boolean) =>
   [
      `Added ${totals.created}${totals.restored > 0 ? `, restored ${totals.restored}` : ''}, ${totals.skipped} already here.`,
      totals.full > 0 ? `${totals.full} already had ${LABEL_MAX} labels, so some were not added.` : '',
      read ? readResultLine(noun, totals) : '',
   ]
      .filter(Boolean)
      .join(' ')

// Imports companies or posts from pasted links or a CSV: choose, review what each link is, then import the ticked ones in
// batches, reading their details when ticked.
export const ImportLinksDialog = ({ kind, preview, importBatch, onDone, onShow }: Props) => {
   const { noun } = kind
   const [open, setOpen] = useState(false)
   const [source, setSource] = useState('paste')
   const [text, setText] = useState('')
   const [file, setFile] = useState<{ name: string; rows: ImportRow[] } | null>(null)
   const [fileError, setFileError] = useState('')
   const [labels, setLabels] = useState<string[]>(() => [importLabel()])
   const [review, setReview] = useState<ImportPreview | null>(null)
   const [reviewing, setReviewing] = useState(false)
   const [reviewError, setReviewError] = useState('')
   const [chosen, setChosen] = useState<Set<string>>(new Set())
   const [read, setRead] = useState(kind.readByDefault)
   const [rereadHere, setRereadHere] = useState(false)
   const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
   const [totals, setTotals] = useState<ImportTotals | null>(null)
   const [importError, setImportError] = useState('')
   const rows: ImportRow[] =
      source === 'paste'
         ? linksOf(text).map(url => ({
              url,
              labels: [],
              notes: '',
           }))
         : (file?.rows ?? [])
   const tooMany = rows.length > IMPORT_ROWS
   const importing = progress !== null && totals === null
   const picked = review?.items.filter(({ slug }) => chosen.has(slug)) ?? []
   const toRead = picked.filter(({ state }) => rereadHere || state !== 'ALREADY_HERE')
   const recent = toRead.filter(({ readRecently }) => readRecently).length
   const [shown] = labels

   const reset = () => {
      setText('')
      setFile(null)
      setFileError('')
      setLabels([importLabel()])
      setReview(null)
      setReviewError('')
      setRead(kind.readByDefault)
      setRereadHere(false)
      setProgress(null)
      setTotals(null)
      setImportError('')
   }

   const close = (next: boolean) => {
      if (importing) {
         return
      }

      if (!next) {
         reset()
      }

      setOpen(next)
   }

   const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
      const [chosenFile] = event.target.files ?? []

      event.target.value = ''
      setFile(null)
      setFileError('')

      if (!chosenFile) {
         return
      }

      if (chosenFile.size > IMPORT_BYTES) {
         setFileError('The file is larger than 2 MB.')
         return
      }

      const result = readImportCsv(await chosenFile.text(), kind.csv)

      if ('error' in result) {
         setFileError(result.error)
      } else if (result.rows.length === 0) {
         setFileError(`The file has no ${noun.one} links.`)
      } else {
         setFile({
            name: chosenFile.name,
            rows: result.rows,
         })
      }
   }

   const toReview = async () => {
      setReviewing(true)
      setReviewError('')

      try {
         const data = await preview(rows.map(({ url }) => url))

         setReview(data)
         setChosen(new Set(data.items.map(({ slug }) => slug)))
      } catch (error) {
         setReviewError(error instanceof Error ? readableError(error) : 'The review did not work')
      }

      setReviewing(false)
   }

   const runImport = async () => {
      const entries = entriesOf(rows, picked)
      const mode = read ? (rereadHere ? 'ALL' : 'NEW') : 'NONE'
      let sum = NO_TOTALS

      setImportError('')
      setProgress({
         done: 0,
         total: entries.length,
      })

      try {
         for (let at = 0; at < entries.length; at += BATCH) {
            const done = await importBatch(entries.slice(at, at + BATCH), labels, mode)

            sum = {
               created: sum.created + done.created,
               restored: sum.restored + done.restored,
               skipped: sum.skipped + done.skipped,
               invalid: sum.invalid + done.invalid,
               full: sum.full + done.full,
               reading: sum.reading + done.reading,
               readRecently: sum.readRecently + done.readRecently,
               paused: sum.paused + done.paused,
            }
            setProgress({
               done: Math.min(at + BATCH, entries.length),
               total: entries.length,
            })
         }
      } catch (error) {
         setImportError(error instanceof Error ? readableError(error) : 'The import stopped')
      }

      setTotals(sum)
      await onDone()
   }

   const toggle = (slug: string, checked: boolean) =>
      setChosen(current => {
         const next = new Set(current)

         if (checked) {
            next.add(slug)
         } else {
            next.delete(slug)
         }

         return next
      })

   return (
      <Dialog open={open} onOpenChange={close}>
         <DialogTrigger asChild>
            <Button>
               <Plus />
               Add {noun.many}
            </Button>
         </DialogTrigger>
         <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
               <DialogTitle>Add LinkedIn {noun.many}</DialogTitle>
               <DialogDescription>
                  Paste {noun.one} links or upload a CSV, up to {IMPORT_ROWS.toLocaleString('en')}. You see each{' '}
                  {noun.one} before anything is added.
               </DialogDescription>
            </DialogHeader>
            {totals ? (
               <div className="grid gap-2 text-sm" role="status">
                  <p>{resultLine(noun, totals, read)}</p>
                  {importError ? (
                     <p className="text-destructive">
                        The import stopped after {progress?.done ?? 0} of {progress?.total ?? 0}: {importError}.
                        Importing again is safe.
                     </p>
                  ) : null}
               </div>
            ) : review ? (
               <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                     <span>
                        {chosen.size} of {review.items.length} selected
                     </span>
                     <span className="flex gap-1">
                        <Button
                           variant="ghost"
                           size="sm"
                           disabled={importing}
                           onClick={() => setChosen(new Set(review.items.map(({ slug }) => slug)))}
                        >
                           Select all
                        </Button>
                        <Button variant="ghost" size="sm" disabled={importing} onClick={() => setChosen(new Set())}>
                           Select none
                        </Button>
                     </span>
                  </div>
                  <ul className="max-h-72 divide-y overflow-auto rounded-md border text-sm">
                     {review.items.map(({ slug, url, state, readRecently }) => (
                        <li key={slug} className="flex items-center gap-2 px-3 py-1.5">
                           <Checkbox
                              checked={chosen.has(slug)}
                              disabled={importing}
                              aria-label={`Import ${slug}`}
                              onCheckedChange={checked => toggle(slug, checked === true)}
                           />
                           <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 truncate hover:underline"
                           >
                              {slug}
                           </a>
                           {readRecently ? (
                              <Badge variant="secondary" className="font-normal">
                                 Read in the last 30 days
                              </Badge>
                           ) : null}
                           {state === 'NEW' ? null : (
                              <Badge variant="outline" className="font-normal">
                                 {STATE_WORDS[state]}
                              </Badge>
                           )}
                        </li>
                     ))}
                  </ul>
                  {review.invalid.length > 0 ? (
                     <p className="text-muted-foreground text-sm">
                        Skipped: {review.invalid.length} {review.invalid.length === 1 ? 'entry is' : 'entries are'} not
                        a {noun.one} link.{' '}
                        <button
                           type="button"
                           className="text-foreground underline"
                           onClick={() =>
                              downloadCsv(`skipped-${noun.many}.csv`, skippedCsv(rows, review.invalid, kind.csv))
                           }
                        >
                           Download skipped rows
                        </button>
                     </p>
                  ) : null}
                  <ReadOptions
                     noun={noun}
                     label={kind.readNow}
                     read={read}
                     rereadHere={rereadHere}
                     disabled={importing}
                     onRead={setRead}
                     onRereadHere={setRereadHere}
                     note={`${kind.fills} ${readCostLine(noun, toRead.length - recent, recent)}`}
                  />
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
               <div className="grid gap-4">
                  <Tabs value={source} onValueChange={setSource}>
                     <TabsList>
                        <TabsTrigger value="paste">Paste links</TabsTrigger>
                        <TabsTrigger value="csv">Upload CSV</TabsTrigger>
                     </TabsList>
                     <TabsContent value="paste">
                        <Textarea
                           value={text}
                           onChange={event => setText(event.target.value)}
                           placeholder={kind.placeholder}
                           aria-label={`${noun.one} links`}
                           rows={6}
                        />
                     </TabsContent>
                     <TabsContent value="csv" className="grid gap-2">
                        <Input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={pickFile} />
                        <p className="text-muted-foreground text-xs">
                           Columns: {kind.csvColumns}.{' '}
                           <button
                              type="button"
                              className="text-foreground underline"
                              onClick={() => downloadFile(`${noun.many}-example.csv`, kind.csv.example, 'text/csv')}
                           >
                              Download example CSV
                           </button>
                        </p>
                        {file ? (
                           <p className="text-sm">
                              {file.name}: {countOf(noun, file.rows.length)}
                           </p>
                        ) : null}
                        {fileError ? <p className="text-destructive text-sm">{fileError}</p> : null}
                     </TabsContent>
                  </Tabs>
                  {tooMany ? (
                     <p className="text-destructive text-sm">
                        Import at most {IMPORT_ROWS.toLocaleString('en')} {noun.many} at once.
                     </p>
                  ) : null}
                  <div className="grid gap-2">
                     <Label htmlFor={`import-${noun.one}-labels`}>Labels for everything you add (optional)</Label>
                     <LabelMultiSelect
                        id={`import-${noun.one}-labels`}
                        kind={kind.labelKind}
                        value={labels}
                        onChange={setLabels}
                        placeholder="Pick or create labels"
                     />
                     <p className="text-muted-foreground text-xs">
                        {noun.many.charAt(0).toUpperCase() + noun.many.slice(1)} you already have get these labels added
                        to theirs. The import label lets you find this import later.
                     </p>
                  </div>
                  <ReadOptions
                     noun={noun}
                     label={kind.readNow}
                     read={read}
                     rereadHere={rereadHere}
                     disabled={false}
                     onRead={setRead}
                     onRereadHere={setRereadHere}
                     note={`${kind.fills} The price shows on the next step; a ${noun.one} read in the last 30 days is not read again.`}
                  />
                  {reviewError ? <p className="text-destructive text-sm">{reviewError}</p> : null}
               </div>
            )}
            <DialogFooter>
               {totals ? (
                  <>
                     {shown ? (
                        <Button
                           variant="outline"
                           onClick={() => {
                              onShow(shown)
                              close(false)
                           }}
                        >
                           Show these {noun.many}
                        </Button>
                     ) : null}
                     <Button onClick={() => close(false)}>Close</Button>
                  </>
               ) : review ? (
                  <>
                     <Button variant="outline" disabled={importing} onClick={() => setReview(null)}>
                        Back
                     </Button>
                     <Button disabled={chosen.size === 0 || importing} onClick={() => void runImport()}>
                        Import {countOf(noun, chosen.size)}
                     </Button>
                  </>
               ) : (
                  <>
                     <Button variant="outline" onClick={() => close(false)}>
                        Cancel
                     </Button>
                     <Button disabled={rows.length === 0 || tooMany || reviewing} onClick={() => void toReview()}>
                        Review
                     </Button>
                  </>
               )}
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
