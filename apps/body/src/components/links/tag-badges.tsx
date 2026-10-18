import { LabelBadge } from '../labels/label-badge'

type Props = {
   tags: string[]
   onTag: (tag: string) => void
}

export const TagBadges = ({ tags, onTag }: Props) => (
   <span className="flex flex-wrap gap-1">
      {tags.map(tag => (
         <LabelBadge key={tag} label={tag} clickLabel={`Show only ${tag}`} onClick={() => onTag(tag)} />
      ))}
   </span>
)
