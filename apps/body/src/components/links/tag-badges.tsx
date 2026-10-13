import { Badge } from '@/components/ui/badge'

type Props = {
   tags: string[]
   onTag: (tag: string) => void
}

export const TagBadges = ({ tags, onTag }: Props) => (
   <span className="flex flex-wrap gap-1">
      {tags.map(tag => (
         <button key={tag} type="button" aria-label={`Show only ${tag}`} onClick={() => onTag(tag)}>
            <Badge variant="secondary">{tag}</Badge>
         </button>
      ))}
   </span>
)
