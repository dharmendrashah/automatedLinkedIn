import { useDebounced } from '@/lib/use-debounced'
import { useState } from 'react'

import { trpc } from '../../../trpc'
import { Choice, MultiPick } from '../../my-network/filters/fields'

type Mode = 'all' | 'any'

// Specialities from the owner's company reads, offered by the server as the owner types (the list can be long), all of them or
// any. `compact` is the toolbar button, without the match switch.
export const SpecialitiesPick = ({
   value,
   mode,
   compact = false,
   onChange,
}: {
   value: string[]
   mode: Mode
   compact?: boolean
   onChange: (value: string[], mode: Mode) => void
}) => {
   const [text, setText] = useState('')
   const search = useDebounced(text)
   const options = trpc.linkedInCompany.specialityOptions.useQuery(
      { search },
      {
         retry: false,
         placeholderData: previous => previous,
      }
   )

   return (
      <>
         <MultiPick
            label={compact ? 'Specialities' : 'Specialities (from a company read)'}
            placeholder={compact ? 'Specialities' : 'Any speciality'}
            compact={compact}
            options={(options.data ?? []).map(({ value: speciality, count }) => ({
               value: speciality,
               label: speciality,
               hint: String(count),
            }))}
            value={value}
            onChange={specialities => onChange(specialities, mode)}
            search={{
               text,
               onText: setText,
               loading: options.isFetching,
            }}
         />
         {!compact && value.length > 1 ? (
            <Choice
               label="Specialities to match"
               options={[
                  ['all', 'All of them'],
                  ['any', 'Any of them'],
               ]}
               value={mode}
               onChange={next => onChange(value, next ?? 'all')}
            />
         ) : null}
      </>
   )
}
