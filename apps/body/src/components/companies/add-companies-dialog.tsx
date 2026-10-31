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

import { type RouterOutputs, trpc } from '../../trpc'
import { LabelMultiSelect } from '../labels/label-multi-select'
import { LABEL_MAX } from '../labels/labels'
import {
   COMPANY_CSV,
   IMPORT_BYTES,
   IMPORT_ROWS,
   type ImportRow,
   entriesOf,
   linksOf,
   readImportCsv,
   skippedCsv,
} from '../links/import-csv'
import { downloadCsv } from '../posting/posts-csv'
import { readCostLine, readResultLine } from './read-cost'

const BATCH = 200
const FILLS = 'Fills name, logo, industry, size, website and country.'

type Preview = RouterOutputs['linkedInCompany']['preview']
type Totals = RouterOutputs['linkedInCompany']['import']

const NO_TOTALS: Totals = {
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

type ReadChoice = {
   read: boolean
   rereadHere: boolean
   disabled: boolean
   onRead: (read: boolean) => void
   onRereadHere: (rereadHere: boolean) => void
   // The line under the boxes: what is filled, and the price once the review knows it.
   note: string
}

const ReadOptions = ({ read, rereadHere, disabled, onRead, onRereadHere, note }: ReadChoice) => (
   <div className="grid gap-2">
      <Label className="font-normal">
         <Checkbox checked={read} disabled={disabled} onCheckedChange={checked => onRead(checked === true)} />
         Read their company details now
      </Label>
      {read ? (
         <>
            <Label className="pl-6 font-normal">
               <Checkbox
                  checked={rereadHere}
                  disabled={disabled}
                  onCheckedChange={checked => onRereadHere(checked === true)}
               />
               Also re-read companies already here
            </Label>
            <p className="text-muted-foreground text-xs">{note}</p>
         </>
      ) : null}
   </div>
)

const resultLine = (totals: Totals, read: boolean) =>
   [
      `Added ${totals.created}, restored ${totals.restored}, ${totals.skipped} already here.`,
      totals.full > 0 ? `${totals.full} already had ${LABEL_MAX} labels, so some were not added.` : '',
      read ? readResultLine(totals) : '',
   ]
      .filter(Boolean)
      .join(' ')

// Imports companies from pasted links or a CSV (.plan/companies-import-csv.md): choose, review what each link is, then import the
// ticked ones in batches, reading their details unless unticked. `onShow` filters the table by a label of the import.
export const AddCompaniesDialog = ({ onShow }: { onShow: (label: string) => void }) => {
   const utils = trpc.useUtils()
   const [open, setOpen] = useState(false)
   const [source, setSource] = useState('paste')
   const [text, setText] = useState('')
   const [file, setFile] = useState<{ name: string; rows: ImportRow[] } | null>(null)
   const [fileError, setFileError] = useState('')
   const [labels, setLabels] = useState<string[]>(() => [importLabel()])
   const [review, setReview] = useState<Preview | null>(null)
   const [chosen, setChosen] = useState<Set<string>>(new Set())
   const [read, setRead] = useState(true)
   const [rereadHere, setRereadHere] = useState(false)
   const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
   const [totals, setTotals] = useState<Totals | null>(null)
   const [importError, setImportError] = useState('')
   const preview = trpc.linkedInCompany.preview.useMutation()
   const add = trpc.linkedInCompany.import.useMutation()
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
   const picked = review?.companies.filter(({ slug }) => chosen.has(slug)) ?? []
   const toRead = picked.filter(({ state }) => rereadHere || state !== 'ALREADY_HERE')
   const recent = toRead.filter(({ readRecently }) => readRecently).length
   const [shown] = labels

   const reset = () => {
      setText('')
      setFile(null)
      setFileError('')
      setLabels([importLabel()])
      setReview(null)
      setRead(true)
      setRereadHere(false)
      setProgress(null)
      setTotals(null)
      setImportError('')
      preview.reset()
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

      const result = readImportCsv(await picked.text(), COMPANY_CSV)

      if ('error' in result) {
         setFileError(result.error)
      } else if (result.rows.length === 0) {
         setFileError('The file has no company links.')
      } else {
         setFile({
            name: picked.name,
            rows: result.rows,
         })
      }
   }

   const toReview = () =>
      preview.mutate(
         { urls: rows.map(({ url }) => url) },
         {
            onSuccess: data => {
               setReview(data)
               setChosen(new Set(data.companies.map(({ slug }) => slug)))
            },
         }
      )

   const runImport = async () => {
      const companies = entriesOf(rows, picked)
      const mode = read ? (rereadHere ? 'ALL' : 'NEW') : 'NONE'
      let sum = NO_TOTALS

      setImportError('')
      setProgress({
         done: 0,
         total: companies.length,
      })

      try {
         for (let at = 0; at < companies.length; at += BATCH) {
            const done = await add.mutateAsync({
               companies: companies.slice(at, at + BATCH),
               labels,
               read: mode,
            })

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
               done: Math.min(at + BATCH, companies.length),
               total: companies.length,
            })
         }
      } catch (error) {
         setImportError(error instanceof Error ? readableError(error) : 'The import stopped')
      }

      setTotals(sum)
      await Promise.all([utils.linkedInCompany.invalidate(), utils.label.list.invalidate()])
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
               Add companies
            </Button>
         </DialogTrigger>
         <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
               <DialogTitle>Add LinkedIn companies</DialogTitle>
               <DialogDescription>
                  Paste company links or upload a CSV, up to {IMPORT_ROWS.toLocaleString('en')}. You see each company
                  before anything is added.
               </DialogDescription>
            </DialogHeader>
            {totals ? (
               <div className="grid gap-2 text-sm" role="status">
                  <p>{resultLine(totals, read)}</p>
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
                        {chosen.size} of {review.companies.length} selected
                     </span>
                     <span className="flex gap-1">
                        <Button
                           variant="ghost"
                           size="sm"
                           disabled={importing}
                           onClick={() => setChosen(new Set(review.companies.map(({ slug }) => slug)))}
                        >
                           Select all
                        </Button>
                        <Button variant="ghost" size="sm" disabled={importing} onClick={() => setChosen(new Set())}>
                           Select none
                        </Button>
                     </span>
                  </div>
                  <ul className="max-h-72 divide-y overflow-auto rounded-md border text-sm">
                     {review.companies.map(({ slug, url, state, readRecently }) => (
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
                        a company link.{' '}
                        <button
                           type="button"
                           className="text-foreground underline"
                           onClick={() =>
                              downloadCsv('skipped-companies.csv', skippedCsv(rows, review.invalid, COMPANY_CSV))
                           }
                        >
                           Download skipped rows
                        </button>
                     </p>
                  ) : null}
                  <ReadOptions
                     read={read}
                     rereadHere={rereadHere}
                     disabled={importing}
                     onRead={setRead}
                     onRereadHere={setRereadHere}
                     note={`${FILLS} ${readCostLine(toRead.length - recent, recent)}`}
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
                           placeholder="https://www.linkedin.com/company/elitale"
                           aria-label="Company links"
                           rows={6}
                        />
                     </TabsContent>
                     <TabsContent value="csv" className="grid gap-2">
                        <Input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={pickFile} />
                        <p className="text-muted-foreground text-xs">
                           Columns: company_url (or LinkedIn URL), labels (split by ;) and notes.{' '}
                           <button
                              type="button"
                              className="text-foreground underline"
                              onClick={() => downloadFile('companies-example.csv', COMPANY_CSV.example, 'text/csv')}
                           >
                              Download example CSV
                           </button>
                        </p>
                        {file ? (
                           <p className="text-sm">
                              {file.name}: {file.rows.length} companies
                           </p>
                        ) : null}
                        {fileError ? <p className="text-destructive text-sm">{fileError}</p> : null}
                     </TabsContent>
                  </Tabs>
                  {tooMany ? (
                     <p className="text-destructive text-sm">
                        Import at most {IMPORT_ROWS.toLocaleString('en')} companies at once.
                     </p>
                  ) : null}
                  <div className="grid gap-2">
                     <Label htmlFor="import-company-labels">Labels for everything you add (optional)</Label>
                     <LabelMultiSelect
                        id="import-company-labels"
                        kind="companies"
                        value={labels}
                        onChange={setLabels}
                        placeholder="Pick or create labels"
                     />
                     <p className="text-muted-foreground text-xs">
                        Companies you already have get these labels added to theirs. The import label lets you find this
                        import later.
                     </p>
                  </div>
                  <ReadOptions
                     read={read}
                     rereadHere={rereadHere}
                     disabled={false}
                     onRead={setRead}
                     onRereadHere={setRereadHere}
                     note={`${FILLS} The price shows on the next step; a company read in the last 30 days is not read again.`}
                  />
                  {preview.error ? <p className="text-destructive text-sm">{readableError(preview.error)}</p> : null}
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
                           Show these companies
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
                        Import {chosen.size} {chosen.size === 1 ? 'company' : 'companies'}
                     </Button>
                  </>
               ) : (
                  <>
                     <Button variant="outline" onClick={() => close(false)}>
                        Cancel
                     </Button>
                     <Button disabled={rows.length === 0 || tooMany || preview.isPending} onClick={toReview}>
                        Review
                     </Button>
                  </>
               )}
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
