import type { ProfileEntity } from '@automatedLinkedIn/contracts'

import { Mark } from './mark'
import { ProfileLink } from './profile-link'

type Props = {
   entity: ProfileEntity
   shape?: 'round' | 'square'
}

// A person, company, group, newsletter or school as a small row: picture, name, what it is, and how many follow it.
export const EntityRow = ({ entity, shape = 'round' }: Props) => {
   const meta = [entity.degree, entity.followers].filter(Boolean).join(' · ')

   return (
      <div className="flex items-start gap-3">
         <Mark name={entity.name} imageUrl={entity.imageUrl} shape={shape} className="size-10 text-sm" />
         <div className="grid min-w-0 gap-0.5">
            <ProfileLink href={entity.url} className="truncate text-sm font-medium">
               {entity.name}
            </ProfileLink>
            {entity.subtitle ? <p className="text-muted-foreground line-clamp-2 text-xs">{entity.subtitle}</p> : null}
            {meta ? <p className="text-muted-foreground text-xs">{meta}</p> : null}
         </div>
      </div>
   )
}
