import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Download, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { FITS, type View, type ViewChange } from './address'
import { FIT_WORDS, foundByWord } from './words'

const ANY = 'any'
const SEARCH_WAIT_MS = 300
const SOURCES = ['request', 'connection', 'target']

// The search waits for a pause in typing before it changes the address.
export const SearchBox = ({ value, onSearch }: { value: string; onSearch: (q: string) => void }) => {
   const [text, setText] = useState(value)

   useEffect(() => {
      if (text.trim() === value) {
         return undefined
      }

      const timer = window.setTimeout(() => onSearch(text.trim()), SEARCH_WAIT_MS)

      return () => window.clearTimeout(timer)
   }, [text, value, onSearch])

   return (
      <div className="relative w-full max-w-sm">
         <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
         <Input
            type="search"
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder="Search name, company, profile link…"
            aria-label="Search people"
            className="pl-8"
         />
      </div>
   )
}

type Props = {
   view: View
   lists: Array<{ id: string; name: string }>
   labels: string[]
   exporting: boolean
   onChange: (change: ViewChange) => void
   onExport: () => void
}

const Filter = ({
   label,
   value,
   options,
   onChange,
}: {
   label: string
   value: string | undefined
   options: Array<[string, string]>
   onChange: (value: string | null) => void
}) => (
   <Select value={value ?? ANY} onValueChange={next => onChange(next === ANY ? null : next)}>
      <SelectTrigger size="sm" className="w-44" aria-label={label}>
         <SelectValue />
      </SelectTrigger>
      <SelectContent>
         <SelectItem value={ANY}>{`${label}: any`}</SelectItem>
         {options.map(([option, word]) => (
            <SelectItem key={option} value={option}>
               {`${label}: ${word}`}
            </SelectItem>
         ))}
      </SelectContent>
   </Select>
)

// Found by, Fit and Label, and the export of what they show.
export const Filters = ({ view, lists, labels, exporting, onChange, onExport }: Props) => {
   const known = [...SOURCES, ...lists.map(({ id }) => `list:${id}`)]
   // An address can name a source this client does not list (an old /lists link); it still shows as picked.
   const sources = view.found && !known.includes(view.found) ? [...known, view.found] : known
   const shownLabels = view.label && !labels.includes(view.label) ? [view.label, ...labels] : labels

   return (
      <div className="flex flex-wrap items-center gap-2">
         <Filter
            label="Found by"
            value={view.found}
            options={sources.map(source => [source, foundByWord(source, lists)])}
            onChange={found => onChange({ found, open: null })}
         />
         <Filter
            label="Fit"
            value={view.fit}
            options={FITS.map(fit => [fit, FIT_WORDS[fit]])}
            onChange={fit => onChange({ fit, open: null })}
         />
         <Filter
            label="Label"
            value={view.label}
            options={shownLabels.map(label => [label, label])}
            onChange={label => onChange({ label, open: null })}
         />
         {view.onlyNew ? (
            <Button variant="secondary" size="sm" onClick={() => onChange({ new: null })}>
               Only new · show all
            </Button>
         ) : null}
         <Button variant="outline" size="sm" className="ml-auto" disabled={exporting} onClick={onExport}>
            <Download />
            Export
         </Button>
      </div>
   )
}
