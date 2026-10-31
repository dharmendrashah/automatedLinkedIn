import { Section } from '@/components/people/person-sections'
import { Briefcase, GraduationCap, HandPlatter, Library, MapPin, Wrench } from 'lucide-react'
import { type ComponentType, useState } from 'react'

import { type Snapshot } from './facts'

type Bar = { label: string; count: number }

const SHORT = 5

const LISTS: Array<{ key: keyof Snapshot; title: string; icon: ComponentType<{ className?: string }> }> = [
   {
      key: 'byFunction',
      title: 'Departments',
      icon: Briefcase,
   },
   {
      key: 'bySkill',
      title: 'Skills',
      icon: Wrench,
   },
   {
      key: 'byLocation',
      title: 'Where they are',
      icon: MapPin,
   },
   {
      key: 'bySchool',
      title: 'Schools',
      icon: GraduationCap,
   },
   {
      key: 'byFieldOfStudy',
      title: 'Fields of study',
      icon: Library,
   },
   {
      key: 'byServiceCategory',
      title: 'Services they offer',
      icon: HandPlatter,
   },
]

const isBars = (value: unknown): value is Bar[] => Array.isArray(value) && value.length > 0

// One employee breakdown as bars relative to the biggest: the top few, then all on demand.
const Bars = ({
   title,
   icon: Icon,
   bars,
}: {
   title: string
   icon: ComponentType<{ className?: string }>
   bars: Bar[]
}) => {
   const [open, setOpen] = useState(false)
   const most = Math.max(1, ...bars.map(({ count }) => count))
   const shown = open ? bars : bars.slice(0, SHORT)

   return (
      <div className="grid content-start gap-1.5 rounded-lg border p-3">
         <span className="flex items-center gap-1.5 text-xs font-medium">
            <Icon className="text-muted-foreground size-3.5" />
            {title}
         </span>
         {shown.map(bar => (
            <div key={bar.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
               <span className="truncate" title={bar.label}>
                  {bar.label}
               </span>
               <span className="bg-muted h-2 overflow-hidden rounded-full">
                  <span className="bg-primary block h-full" style={{ width: `${(bar.count / most) * 100}%` }} />
               </span>
               <span className="text-muted-foreground tabular-nums">{bar.count.toLocaleString()}</span>
            </div>
         ))}
         {bars.length > SHORT ? (
            <button
               type="button"
               className="text-muted-foreground justify-self-start text-xs underline"
               onClick={() => setOpen(!open)}
            >
               {open ? 'Show less' : `Show all ${bars.length}`}
            </button>
         ) : null}
      </div>
   )
}

// Who works at the company, by every breakdown the read returned; an empty breakdown is left out.
export const Breakdowns = ({ snapshot }: { snapshot: Snapshot }) => {
   const lists = LISTS.flatMap(list => {
      const bars = snapshot[list.key]

      return isBars(bars)
         ? [
              {
                 ...list,
                 bars,
              },
           ]
         : []
   })

   if (lists.length === 0) {
      return null
   }

   return (
      <Section title="Their people">
         <div className="grid gap-3 md:grid-cols-2">
            {lists.map(list => (
               <Bars key={list.key} title={list.title} icon={list.icon} bars={list.bars} />
            ))}
         </div>
      </Section>
   )
}
