import { Button } from '@/components/ui/button'
import { useSearchParams } from 'react-router'

import { SAMPLE_KINDS, type SampleKind } from './sample'

// Says the numbers are invented, and switches between the four shapes of sample data.
export const BrowseSampleBanner = ({ kind }: { kind: SampleKind }) => {
   const [, setParams] = useSearchParams()

   return (
      <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
         <span className="text-muted-foreground">Sample browsing data, not real. Show:</span>
         {SAMPLE_KINDS.map(item => (
            <Button
               key={item}
               size="sm"
               variant={item === kind ? 'default' : 'outline'}
               onClick={() =>
                  setParams(
                     current => {
                        const next = new URLSearchParams(current)

                        next.set('browse', item)

                        return next
                     },
                     { replace: true }
                  )
               }
            >
               {item}
            </Button>
         ))}
      </div>
   )
}
