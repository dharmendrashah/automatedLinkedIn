import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { type LabelMatch } from '../links/use-list-state'
import { LabelMultiSelect } from './label-multi-select'
import { type LabelKind } from './labels'

type Props = {
   id: string
   kind: LabelKind
   tags: string[]
   match: LabelMatch
   onTags: (next: string[]) => void
   onMatch: (next: LabelMatch) => void
}

// Narrows a table to some labels: any of them, or, with two or more, all of them.
export const LabelFilter = ({ id, kind, tags, match, onTags, onMatch }: Props) => (
   <div className="flex flex-wrap items-center gap-2">
      <div className="w-64">
         <LabelMultiSelect id={id} kind={kind} value={tags} onChange={onTags} placeholder="Filter by labels" />
      </div>
      {tags.length > 1 ? (
         <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={match}
            onValueChange={value => onMatch(value === 'all' ? 'all' : 'any')}
            aria-label="Match the labels"
         >
            <ToggleGroupItem value="any">Any of them</ToggleGroupItem>
            <ToggleGroupItem value="all">All of them</ToggleGroupItem>
         </ToggleGroup>
      ) : null}
   </div>
)
