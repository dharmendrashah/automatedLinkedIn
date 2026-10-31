import { useDebounced } from '@/lib/use-debounced'
import { useState } from 'react'

import { trpc } from '../../../trpc'
import { Choice, MultiPick } from './fields'

type Mode = 'all' | 'any'

// Skills from the people's profile reads, offered by the server as the owner types (the list can be long), all of them or any.
export const SkillsPick = ({
   clientId,
   value,
   mode,
   onChange,
}: {
   clientId: string
   value: string[]
   mode: Mode
   onChange: (value: string[], mode: Mode) => void
}) => {
   const [text, setText] = useState('')
   const search = useDebounced(text)
   const options = trpc.people.skillOptions.useQuery(
      {
         clientId,
         search,
      },
      {
         retry: false,
         placeholderData: previous => previous,
      }
   )

   return (
      <>
         <MultiPick
            label="Skills (from a profile read)"
            placeholder="Any skills"
            options={(options.data ?? []).map(({ value: skill, count }) => ({
               value: skill,
               label: skill,
               hint: String(count),
            }))}
            value={value}
            onChange={skills => onChange(skills, mode)}
            search={{
               text,
               onText: setText,
               loading: options.isFetching,
            }}
         />
         {value.length > 1 ? (
            <Choice
               label="Skills to match"
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
