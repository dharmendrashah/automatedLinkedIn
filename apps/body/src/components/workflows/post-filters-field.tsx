import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ListFilter, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

import { type PostFilters, postChips, postFiltersText, readPostFilters } from './post-filters'

type Props = {
   value: string
   onChange: (text: string) => void
}

const ANY = 'any'

// A number that is empty or not a whole number above 0 means no limit.
const countOf = (text: string) => {
   const number = Number(text)

   return Number.isInteger(number) && number > 0 ? number : undefined
}

// The filters of a Posts block, as a drawer like the other input blocks'; what it keeps is the filters as text.
export const PostFiltersField = ({ value, onChange }: Props) => {
   const [open, setOpen] = useState(false)
   const filters = useMemo(() => readPostFilters(value), [value])
   const [draft, setDraft] = useState<PostFilters>(filters)
   const id = useId()
   const chips = postChips(filters)
   const set = (change: Partial<PostFilters>) => setDraft(current => ({ ...current, ...change }))
   const save = (next: PostFilters) => onChange(postFiltersText(next))

   return (
      <div className="grid gap-2">
         <div>
            <Button
               variant="outline"
               size="sm"
               onClick={() => {
                  setDraft(filters)
                  setOpen(true)
               }}
            >
               <ListFilter />
               Filters
               {chips.length > 0 ? <Badge variant="secondary">{chips.length}</Badge> : null}
            </Button>
         </div>
         {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Filters on">
               {chips.map(chip => (
                  <span
                     key={chip.key}
                     className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs font-medium"
                  >
                     {chip.text}
                     <button
                        type="button"
                        className="hover:bg-primary/15 rounded-full p-0.5"
                        aria-label={`Remove ${chip.text}`}
                        onClick={() => save({ ...filters, [chip.key]: undefined })}
                     >
                        <X className="size-3" />
                     </button>
                  </span>
               ))}
               <Button variant="link" size="sm" className="h-7 px-2 text-xs" onClick={() => save({})}>
                  Clear all
               </Button>
            </div>
         ) : null}
         <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent className="w-full gap-0 sm:max-w-md">
               <SheetHeader className="border-b">
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>
                     Posts must match all of them. Comments, reactions, author and qualified people only match posts
                     that were read.
                  </SheetDescription>
               </SheetHeader>
               <div className="grid gap-4 overflow-y-auto p-4">
                  <div className="grid gap-2">
                     <Label htmlFor={`${id}-read`}>Read</Label>
                     <Select
                        value={draft.read ?? ANY}
                        onValueChange={next => set({ read: next === 'READ' || next === 'UNREAD' ? next : undefined })}
                     >
                        <SelectTrigger id={`${id}-read`} className="w-full">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value={ANY}>Read or not</SelectItem>
                           <SelectItem value="READ">Read only</SelectItem>
                           <SelectItem value="UNREAD">Not read yet</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="grid gap-2">
                     <Label htmlFor={`${id}-comments`}>At least this many comments</Label>
                     <Input
                        id={`${id}-comments`}
                        inputMode="numeric"
                        placeholder="Any number"
                        value={draft.minComments ?? ''}
                        onChange={event => set({ minComments: countOf(event.target.value) })}
                     />
                  </div>
                  <div className="grid gap-2">
                     <Label htmlFor={`${id}-reactions`}>At least this many reactions</Label>
                     <Input
                        id={`${id}-reactions`}
                        inputMode="numeric"
                        placeholder="Any number"
                        value={draft.minReactions ?? ''}
                        onChange={event => set({ minReactions: countOf(event.target.value) })}
                     />
                  </div>
                  <div className="grid gap-2">
                     <Label htmlFor={`${id}-author`}>Author name contains</Label>
                     <Input
                        id={`${id}-author`}
                        maxLength={100}
                        value={draft.author ?? ''}
                        onChange={event => set({ author: event.target.value || undefined })}
                     />
                  </div>
                  <div className="flex items-center gap-2">
                     <Checkbox
                        id={`${id}-qualified`}
                        checked={draft.hasQualified === true}
                        onCheckedChange={next => set({ hasQualified: next === true ? true : undefined })}
                     />
                     <Label htmlFor={`${id}-qualified`} className="font-normal">
                        Only posts with qualified people found from them
                     </Label>
                  </div>
               </div>
               <SheetFooter className="flex-row justify-end gap-2 border-t">
                  <Button variant="outline" onClick={() => setDraft({})}>
                     Clear filters
                  </Button>
                  <Button
                     onClick={() => {
                        save(draft)
                        setOpen(false)
                     }}
                  >
                     Use these filters
                  </Button>
               </SheetFooter>
            </SheetContent>
         </Sheet>
      </div>
   )
}
